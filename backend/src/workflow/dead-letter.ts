/**
 * DEAD LETTER QUEUE — Fase G da Arquitetura ORBIT 2026
 * Jobs que falharam definitivamente (após MAX_RETRIES) são movidos para DLQ.
 * Suporta: inspeção, replay manual, descarte e notificação.
 *
 * Implementado sobre Supabase (tabela jobs com status='failed' + metadata DLQ).
 * Replay = recolocar job na fila principal para nova tentativa do zero.
 */
import { supabase } from '../db/client'
import { tel } from '../utils/telemetry'
import { alertJobFailed } from '../services/alert-manager'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface DLQEntry {
  job_id: string
  chat_id: number
  command_id: string
  original_error: string
  retry_count: number
  failed_at: string
  created_at: string
  dlq_reason: string
  can_replay: boolean
}

// ─── Mover job para DLQ ───────────────────────────────────────────────────────

export async function moveToDLQ(params: {
  jobId: string
  error: string
  retries: number
  reason?: string
}): Promise<void> {
  const { jobId, error, retries, reason = 'max_retries_exceeded' } = params

  try {
    await supabase.from('jobs').update({
      status: 'failed',
      updated_at: new Date().toISOString(),
      result: {
        dlq: true,
        dlq_reason: reason,
        original_error: error.substring(0, 500),
        retry_count: retries,
        failed_at: new Date().toISOString(),
        can_replay: true
      },
      retry_count: retries
    }).eq('id', jobId)

    tel.info('dead_letter_queue', 'moved_to_dlq', { jobId, retries, reason })

    // Alertar admin
    await alertJobFailed(jobId, `[DLQ] ${error}`, retries)

  } catch (e) {
    tel.error('dead_letter_queue', 'move_failed', e, { jobId })
  }
}

// ─── Listar entradas da DLQ ───────────────────────────────────────────────────

export async function listDLQ(limit = 50): Promise<DLQEntry[]> {
  try {
    const { data } = await supabase
      .from('jobs')
      .select('id, chat_id, command_id, result, retry_count, created_at, updated_at')
      .eq('status', 'failed')
      .filter('result->>dlq', 'eq', 'true')
      .order('updated_at', { ascending: false })
      .limit(limit)

    return (data || []).map(j => ({
      job_id: j.id,
      chat_id: j.chat_id,
      command_id: j.command_id,
      original_error: (j.result as any)?.original_error || 'Erro desconhecido',
      retry_count: j.retry_count || 0,
      failed_at: (j.result as any)?.failed_at || j.updated_at,
      created_at: j.created_at,
      dlq_reason: (j.result as any)?.dlq_reason || 'unknown',
      can_replay: (j.result as any)?.can_replay !== false
    }))
  } catch (e) {
    tel.error('dead_letter_queue', 'list_failed', e)
    return []
  }
}

// ─── Replay: recolocar na fila principal ──────────────────────────────────────

export async function replayJob(jobId: string): Promise<{ success: boolean; message: string }> {
  try {
    // Verificar se está na DLQ e pode ser replayed
    const { data: job } = await supabase.from('jobs').select('status, result, retry_count').eq('id', jobId).single()

    if (!job) return { success: false, message: 'Job não encontrado' }
    if (job.status !== 'failed') return { success: false, message: `Job não está na DLQ (status: ${job.status})` }
    if ((job.result as any)?.can_replay === false) return { success: false, message: 'Este job foi marcado como não-replayável' }

    // Resetar para estado inicial
    await supabase.from('jobs').update({
      status: 'pending',
      retry_count: 0,
      updated_at: new Date().toISOString(),
      result: {
        replayed: true,
        replayed_at: new Date().toISOString(),
        original_dlq_reason: (job.result as any)?.dlq_reason,
        previous_retries: job.retry_count
      }
    }).eq('id', jobId)

    // Remover checkpoints antigos para forçar execução do zero
    await supabase.from('execution_checkpoints').delete().eq('job_id', jobId)

    // Reinserir na fila
    const { error } = await supabase.rpc('push_intent_job', { p_job_id: jobId })
    if (error) throw new Error(error.message)

    tel.info('dead_letter_queue', 'replayed', { jobId })
    return { success: true, message: `Job ${jobId.substring(0, 8)}... reinserido na fila com sucesso` }

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    tel.error('dead_letter_queue', 'replay_failed', e, { jobId })
    return { success: false, message: `Replay falhou: ${msg}` }
  }
}

// ─── Descartar job da DLQ ─────────────────────────────────────────────────────

export async function discardFromDLQ(jobId: string): Promise<boolean> {
  try {
    await supabase.from('jobs').update({
      result: { dlq: true, can_replay: false, discarded_at: new Date().toISOString() }
    }).eq('id', jobId)
    tel.info('dead_letter_queue', 'discarded', { jobId })
    return true
  } catch {
    return false
  }
}

// ─── Estatísticas da DLQ ──────────────────────────────────────────────────────

export async function getDLQStats(): Promise<{
  total: number
  replayable: number
  oldest_failure: string | null
  most_common_error: string | null
}> {
  const entries = await listDLQ(200)
  const replayable = entries.filter(e => e.can_replay).length
  const oldest = entries.sort((a, b) => a.failed_at.localeCompare(b.failed_at))[0]

  // Erro mais comum (agrupa por prefixo do erro)
  const errorCounts = new Map<string, number>()
  entries.forEach(e => {
    const key = e.original_error.substring(0, 50)
    errorCounts.set(key, (errorCounts.get(key) || 0) + 1)
  })
  const mostCommon = [...errorCounts.entries()].sort((a, b) => b[1] - a[1])[0]

  return {
    total: entries.length,
    replayable,
    oldest_failure: oldest?.failed_at || null,
    most_common_error: mostCommon?.[0] || null
  }
}
