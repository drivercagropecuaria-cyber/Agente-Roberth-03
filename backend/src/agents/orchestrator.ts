/**
 * ORCHESTRATOR — Fase G: usa Durable Workflow Engine
 * Delega execução para o motor de workflow com checkpoints,
 * retomada automática e human-in-the-loop.
 */
import { supabase, updateJobStatus, logTrace } from '../db/client'
import { runWorkflow, loadCheckpoint } from '../workflow/engine'
import { ORBIT_WORKFLOW } from '../workflow/steps'
import { tel, setJobContext } from '../utils/telemetry'
import { startTrace } from '../utils/otel'
import { auditLog } from '../services/governance'

export async function orchestrate(job: any) {
  const { id: jobId, command_id, chat_id } = job
  setJobContext(jobId)
  const t0 = Date.now()
  const traceId = startTrace(jobId)

  tel.info('orchestrator', 'started', { jobId, traceId })
  await auditLog({ job_id: jobId, action: 'orchestrate_started', resource_type: 'job', result: 'ok' })

  // Estado inicial passado para o primeiro step
  const initialState = {
    command_id,
    chat_id,
    _start_ms: t0
  }

  // Executar workflow durável (retoma de checkpoint se existir)
  const result = await runWorkflow({
    definition: ORBIT_WORKFLOW,
    jobId,
    chatId: chat_id,
    initialState
  })

  const durationMs = Date.now() - t0

  if (result.success) {
    const fullQA = result.state.fullQA as any
    await updateJobStatus(jobId, 'completed', {
      result: {
        type: (result.state.intake as any)?.expected_output || 'analysis',
        synthesis: result.state.synthesis,
        qa: result.state.qa9,
        full_qa: fullQA,
        artifacts: {
          html: result.state.htmlReg,
          json: result.state.jsonReg
        },
        ledger_summary: result.state.ledger ? {
          total: (result.state.ledger as any).total,
          unique: (result.state.ledger as any).unique,
          conflicts: (result.state.ledger as any).conflicts,
          avg_freshness: (result.state.ledger as any).avg_freshness
        } : null,
        steps_completed: result.stepsCompleted,
        duration_ms: durationMs
      },
      quality_score: fullQA?.score_geral || null
    })

    await logTrace({ jobId, agentName: 'orchestrator', step: 'workflow_completed', outputSummary: `steps=${result.stepsCompleted} qa=${(result.state.fullQA as any)?.score_geral}`, durationMs })
    await auditLog({ job_id: jobId, action: 'orchestrate_completed', resource_type: 'job', result: 'ok', details: { steps: result.stepsCompleted, durationMs } })
    tel.info('orchestrator', 'done', { jobId, steps: result.stepsCompleted, ms: durationMs })

  } else if (result.error?.includes('Aguardando aprovação humana')) {
    // Job pausado — não é falha
    await updateJobStatus(jobId, 'pending', {
      result: { awaiting_human: true, reason: result.error, steps_so_far: result.stepsCompleted }
    })
    tel.info('orchestrator', 'awaiting_human', { jobId, reason: result.error })

  } else {
    // Falha real
    throw new Error(result.error || 'Workflow falhou sem motivo especificado')
  }
}

// ─── Retomada após aprovação humana ──────────────────────────────────────────

export async function resumeAfterApproval(jobId: string, approved: boolean): Promise<void> {
  const { data: job } = await supabase.from('jobs').select('command_id, chat_id').eq('id', jobId).single()
  if (!job) return

  if (!approved) {
    await updateJobStatus(jobId, 'failed', { result: { error: 'Cancelado pelo usuário', human_cancelled: true } })
    tel.info('orchestrator', 'cancelled_by_human', { jobId })
    return
  }

  // Recolocar na fila para retomada
  await updateJobStatus(jobId, 'pending')
  await supabase.rpc('push_intent_job', { p_job_id: jobId })
  tel.info('orchestrator', 'resumed_by_human', { jobId })
}
