import { FastifyInstance } from 'fastify'
import { supabase } from '../db/client'

export async function dossiersRoutes(app: FastifyInstance) {
  // Listar todos os dossiês
  app.get('/', async (_req, reply) => {
    const { data, error } = await supabase
      .from('dossiers')
      .select(`
        id, title, status, executive_summary, confidence,
        coverage_score, revision_count, created_at, updated_at,
        research_reports(topic, mode)
      `)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) return reply.status(500).send({ error: error.message })
    return reply.send(data)
  })

  // Dossiê completo por ID
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { data, error } = await supabase
      .from('dossiers')
      .select(`
        *,
        dossier_sources(*),
        research_reports(*)
      `)
      .eq('id', req.params.id)
      .single()
    if (error) return reply.status(404).send({ error: 'Dossiê não encontrado' })
    return reply.send(data)
  })
}
