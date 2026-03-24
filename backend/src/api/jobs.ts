import { FastifyInstance } from 'fastify'
import { supabase } from '../db/client'

export async function jobsRoutes(app: FastifyInstance) {
  // Listar todos os jobs
  app.get('/', async (_req, reply) => {
    const { data, error } = await supabase.rpc('get_recent_jobs', { p_limit: 50 })
    if (error) {
      // Fallback se o RPC não existir
      const { data: rows, error: err2 } = await supabase
        .from('jobs')
        .select('*, commands(payload)')
        .order('created_at', { ascending: false })
        .limit(50)
      if (err2) return reply.status(500).send({ error: err2.message })
      return reply.send(rows)
    }
    return reply.send(data)
  })

  // Buscar job por ID com detalhes
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { id } = req.params

    const { data: job, error } = await supabase
      .from('jobs')
      .select('*, commands(payload)')
      .eq('id', id)
      .single()

    if (error) return reply.status(404).send({ error: 'Job não encontrado' })

    // Buscar traces deste job
    const { data: traces } = await supabase
      .from('execution_traces')
      .select('*')
      .eq('job_id', id)
      .order('created_at', { ascending: true })

    // Buscar eventos
    const { data: events } = await supabase
      .from('job_events')
      .select('*')
      .eq('job_id', id)
      .order('created_at', { ascending: true })

    return reply.send({ ...job, traces, events })
  })

  // Estatísticas do dashboard
  app.get('/stats/dashboard', async (_req, reply) => {
    const { data, error } = await supabase.rpc('get_dashboard_stats')
    if (error) {
      // Fallback manual
      const { data: jobs } = await supabase.from('jobs').select('status')
      const stats = {
        total: jobs?.length || 0,
        pending: jobs?.filter(j => j.status === 'pending').length || 0,
        running: jobs?.filter(j => j.status === 'running').length || 0,
        completed: jobs?.filter(j => j.status === 'completed').length || 0,
        failed: jobs?.filter(j => j.status === 'failed').length || 0
      }
      return reply.send(stats)
    }
    return reply.send(data)
  })
}
