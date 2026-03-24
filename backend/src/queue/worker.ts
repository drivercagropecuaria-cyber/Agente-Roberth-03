/**
 * WORKER — Fase F: Retry com Backoff Exponencial + Alert Manager + OTel
 * Poling na fila via Supabase RPC pop_intent_job_from_queue.
 * Backoff: 1s, 2s, 4s, 8s, 16s, 32s... até MAX_BACKOFF_MS.
 */
import 'dotenv/config'
import { supabase, updateJobStatus, logTrace } from '../db/client'
import { orchestrate } from '../agents/orchestrator'
import { alertJobFailed, recordJobSuccess, recordJobError, checkMetricsAndAlert } from '../services/alert-manager'
import { startTrace, emitHealthMetrics } from '../utils/otel'
import { auditLog } from '../services/governance'
import { tel } from '../utils/telemetry'

const POLL_MS = parseInt(process.env.WORKER_POLL_MS || '5000')
const MAX_RETRIES = parseInt(process.env.MAX_JOB_RETRIES || '3')
const BASE_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 32_000
let metricsCounter = 0

function backoffMs(retry: number): number {
  return Math.min(BASE_BACKOFF_MS * Math.pow(2, retry), MAX_BACKOFF_MS)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function processJob(job: any): Promise<void> {
  const { id: jobId } = job
  const retries = job.retry_count || 0
  const start = Date.now()

  // Iniciar trace OTel
  const traceId = startTrace(jobId)
  tel.info('worker', 'job_started', { jobId, retries, traceId })

  await auditLog({ job_id: jobId, action: 'job_started', resource_type: 'job', result: 'ok', details: { retries } })

  try {
    await updateJobStatus(jobId, 'running')
    await orchestrate(job)

    const durationMs = Date.now() - start
    recordJobSuccess()
    tel.info('worker', 'job_completed', { jobId, durationMs })
    await auditLog({ job_id: jobId, action: 'job_completed', resource_type: 'job', result: 'ok', details: { durationMs } })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const nextRetry = retries + 1
    const durationMs = Date.now() - start

    tel.error('worker', 'job_error', err, { jobId, retries, nextRetry })
    recordJobError()

    if (nextRetry >= MAX_RETRIES) {
      // Falha definitiva
      await updateJobStatus(jobId, 'failed', {
        result: { error: msg, retries: nextRetry, final: true },
        retry_count: nextRetry
      })
      await logTrace({ jobId, agentName: 'worker', step: 'failed_final', outputSummary: msg.substring(0, 200), durationMs, status: 'error' })
      await alertJobFailed(jobId, msg, nextRetry)
      await auditLog({ job_id: jobId, action: 'job_failed_final', resource_type: 'job', result: 'error', details: { error: msg, retries: nextRetry } })
    } else {
      // Retry com backoff exponencial
      const delay = backoffMs(nextRetry)
      tel.info('worker', 'job_retry_scheduled', { jobId, nextRetry, delay_ms: delay })

      await updateJobStatus(jobId, 'pending', { retry_count: nextRetry, result: { last_error: msg, retry: nextRetry } })
      await logTrace({ jobId, agentName: 'worker', step: 'retry_scheduled', outputSummary: `retry ${nextRetry} em ${delay}ms`, durationMs, status: 'error' })

      // Aguardar backoff e recolocar na fila
      await sleep(delay)
      await supabase.rpc('push_intent_job', { p_job_id: jobId }).catch(() => {})
    }
  }
}

async function poll(): Promise<void> {
  try {
    const { data: job, error } = await supabase.rpc('pop_intent_job_from_queue')
    if (error) {
      tel.error('worker', 'poll_error', error)
      return
    }
    if (job) {
      await processJob(job as any)
    }

    // Verificar métricas a cada 10 polls
    metricsCounter++
    if (metricsCounter % 10 === 0) {
      await checkMetricsAndAlert()
    }
  } catch (e) {
    tel.error('worker', 'poll_exception', e)
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────

console.log(JSON.stringify({
  level: 'INFO', ts: Date.now(), msg: 'ORBIT Worker iniciado',
  poll_ms: POLL_MS, max_retries: MAX_RETRIES, base_backoff_ms: BASE_BACKOFF_MS
}))

// Emitir métricas de saúde inicial
emitHealthMetrics()

// Polling loop
setInterval(poll, POLL_MS)
poll()
