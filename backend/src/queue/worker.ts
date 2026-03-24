/**
 * ORBIT Queue Worker
 * Faz poll da fila Supabase (pgmq) e processa jobs via Agente Orquestrador
 */
import 'dotenv/config'
import { supabase, updateJobStatus, logTrace } from '../db/client'

const POLL_INTERVAL_MS = 5000
const MAX_RETRIES = 3

async function sendTelegramMessage(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token || !chatId) return
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
    })
  } catch {}
}

async function processJob(job: { id: string; command_id: string; chat_id: number; retry_count: number }) {
  const startTime = Date.now()
  console.log(`[worker] Processando job ${job.id}`)

  try {
    // Atualizar status para running
    await updateJobStatus(job.id, 'running')

    // Buscar payload do command
    const { data: command } = await supabase
      .from('commands')
      .select('payload')
      .eq('id', job.command_id)
      .single()

    if (!command) throw new Error('Command não encontrado')

    const text = (command.payload as Record<string, string>).text || ''

    await logTrace({
      jobId: job.id,
      agentName: 'worker',
      step: 'job_started',
      inputSummary: text.substring(0, 200),
      status: 'ok'
    })

    // ─────────────────────────────────────────────────────────────────────
    // TODO Fase B: Aqui será acionado o Agente Orquestrador real via OpenAI
    // Por ora, simula processamento bem-sucedido
    // ─────────────────────────────────────────────────────────────────────
    await new Promise(resolve => setTimeout(resolve, 1000))

    const mockResult = {
      message: 'Pipeline em construção — Fase B em andamento',
      intent: 'pesquisa',
      input: text,
      status: 'placeholder'
    }

    const duration = Date.now() - startTime

    await updateJobStatus(job.id, 'completed', { result: mockResult })

    await logTrace({
      jobId: job.id,
      agentName: 'worker',
      step: 'job_completed',
      outputSummary: JSON.stringify(mockResult).substring(0, 200),
      durationMs: duration,
      status: 'ok'
    })

    // Notificar usuário no Telegram
    await sendTelegramMessage(
      job.chat_id,
      `✅ *Job concluído!*\n\nSua solicitação foi processada.\n_Em breve o pipeline completo estará disponível._`
    )

    console.log(`[worker] Job ${job.id} concluído em ${duration}ms`)

  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    const retries = (job.retry_count || 0) + 1
    const isFinal = retries >= MAX_RETRIES

    console.error(`[worker] Erro no job ${job.id} (tentativa ${retries}):`, errMsg)

    await logTrace({
      jobId: job.id,
      agentName: 'worker',
      step: 'job_error',
      outputSummary: errMsg.substring(0, 200),
      durationMs: Date.now() - startTime,
      status: 'error'
    })

    if (isFinal) {
      await updateJobStatus(job.id, 'failed', {
        result: { error: errMsg, retries },
        retry_count: retries
      })
      await sendTelegramMessage(
        job.chat_id,
        `❌ *Erro ao processar sua solicitação.*\n\nTentativas: ${retries}/${MAX_RETRIES}\nErro: ${errMsg.substring(0, 100)}`
      )
    } else {
      // Volta para pending para retry
      await updateJobStatus(job.id, 'pending', { retry_count: retries })
      await supabase.rpc('push_intent_job', { p_job_id: job.id })
    }
  }
}

async function pollQueue() {
  try {
    const { data: job } = await supabase.rpc('pop_intent_job_from_queue')
    if (job) {
      await processJob(job as { id: string; command_id: string; chat_id: number; retry_count: number })
    }
  } catch (err) {
    console.error('[worker] Erro ao fazer poll da fila:', err)
  }
}

// Inicia o worker
console.log(`🔄 ORBIT Worker iniciado — polling a cada ${POLL_INTERVAL_MS}ms`)
setInterval(pollQueue, POLL_INTERVAL_MS)

// Primeira execução imediata
pollQueue()
