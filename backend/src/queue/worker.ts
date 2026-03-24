import 'dotenv/config'
import { supabase, updateJobStatus, logTrace } from '../db/client'
import { orchestrate } from '../agents/orchestrator'

const POLL_MS = 5000
const MAX_RETRIES = 3

async function processJob(job: any) {
  const start = Date.now()
  console.log('[worker] Processando job', job.id)
  try {
    await updateJobStatus(job.id, 'running')
    await orchestrate(job)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const retries = (job.retry_count || 0) + 1
    console.error('[worker] Erro job', job.id, msg)
    if (retries >= MAX_RETRIES) {
      await updateJobStatus(job.id, 'failed', { result: { error: msg, retries }, retry_count: retries })
    } else {
      await updateJobStatus(job.id, 'pending', { retry_count: retries })
      await supabase.rpc('push_intent_job', { p_job_id: job.id })
    }
    await logTrace({ jobId: job.id, agentName: 'worker', step: 'error', outputSummary: msg.substring(0, 200), durationMs: Date.now() - start, status: 'error' })
  }
}

async function poll() {
  try {
    const { data: job } = await supabase.rpc('pop_intent_job_from_queue')
    if (job) await processJob(job as any)
  } catch (e) { console.error('[worker] poll error:', e) }
}

console.log('🔄 ORBIT Worker iniciado — polling a cada', POLL_MS, 'ms')
setInterval(poll, POLL_MS)
poll()
