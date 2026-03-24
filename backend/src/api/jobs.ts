/**
 * JOBS API — REST endpoints para jobs, DLQ e workflow status — Fase G
 */
import { FastifyInstance } from 'fastify'
import { supabase } from '../db/client'
import { listDLQ, replayJob, discardFromDLQ, getDLQStats } from '../workflow/dead-letter'
import { loadCheckpoint } from '../workflow/engine'

export async function jobsRoutes(app: FastifyInstance) {
  // Listar jobs
  app.get('/jobs', async (req, reply) => {
    const { limit = '20', status } = req.query as Record<string, string>
    let q = supabase.from('jobs').select('*').order('created_at', { ascending: false }).limit(parseInt(limit))
    if (status) q = q.eq('status', status)
    const { data, error } = await q
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send(data)
  })

  // Detalhe de um job
  app.get('/jobs/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const [{ data: job }, { data: artifacts }, { data: evals }] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', id).single(),
      supabase.from('artifacts').select('*').eq('job_id', id).order('created_at', { ascending: false }),
      supabase.from('quality_evaluations').select('*').eq('entity_id', id)
    ])
    if (!job) return reply.status(404).send({ error: 'Job não encontrado' })
    const checkpoint = await loadCheckpoint(id)
    return reply.send({ ...job, artifacts: artifacts || [], quality_evaluations: evals || [], checkpoint })
  })

  // Checkpoint de um job
  app.get('/jobs/:id/checkpoint', async (req, reply) => {
    const { id } = req.params as { id: string }
    const cp = await loadCheckpoint(id)
    return reply.send({ job_id: id, checkpoint: cp })
  })

  // DLQ — listar
  app.get('/dlq', async (_req, reply) => {
    const [entries, stats] = await Promise.all([listDLQ(50), getDLQStats()])
    return reply.send({ stats, entries })
  })

  // DLQ — replay de um job
  app.post('/dlq/:id/replay', async (req, reply) => {
    const { id } = req.params as { id: string }
    const result = await replayJob(id)
    return reply.send(result)
  })

  // DLQ — descartar job da fila
  app.delete('/dlq/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const ok = await discardFromDLQ(id)
    return reply.send({ success: ok })
  })

  // Health check detalhado
  app.get('/health/detailed', async (_req, reply) => {
    const { data: recentJobs } = await supabase
      .from('jobs').select('status').order('created_at', { ascending: false }).limit(20)
    const counts: Record<string, number> = { pending: 0, running: 0, completed: 0, failed: 0 }
    ;(recentJobs || []).forEach((j: any) => { counts[j.status] = (counts[j.status] || 0) + 1 })
    const dlqStats = await getDLQStats()
    return reply.send({
      status: 'ok',
      version: process.env.AGENT_VERSION || '2026.G',
      uptime_s: Math.round(process.uptime()),
      memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      recent_jobs: counts,
      dlq: dlqStats,
      timestamp: new Date().toISOString()
    })
  })
}
