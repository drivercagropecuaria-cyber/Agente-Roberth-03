/**
 * API DE PESQUISA — Endpoint para criar jobs via Dashboard Web
 * Aceita pesquisas configuradas no painel sem precisar do Telegram.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { supabase, createCommand, createJob, logTrace } from '../db/client'
import { auditLog } from '../services/governance'

interface ResearchBody {
  query: string
  depth?: 'shallow' | 'medium' | 'deep'
  intent?: string
  output_format?: string
  sources?: string[]
  max_branches?: number
  require_approval?: boolean
  notify_telegram?: boolean
  chat_id?: number
  source?: string
}

// Usuário especial "web_dashboard" — ID estático para jobs vindos da web
const WEB_DASHBOARD_USER_ID = '00000000-0000-0000-0000-000000000001'

async function ensureWebUser() {
  // Garantir que o usuário web existe
  const { data } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('id', WEB_DASHBOARD_USER_ID)
    .maybeSingle()

  if (!data) {
    await supabase.from('user_profiles').upsert({
      id: WEB_DASHBOARD_USER_ID,
      telegram_id: 0,
      first_name: 'Dashboard',
      username: 'web_dashboard',
      language_code: 'pt',
      default_chat_id: 0,
      role: 'admin'
    }, { onConflict: 'id' }).catch(() => {})
  }
  return WEB_DASHBOARD_USER_ID
}

export async function researchRoutes(app: FastifyInstance) {

  // POST /api/research — criar job de pesquisa via dashboard
  app.post('/api/research', async (req: FastifyRequest<{ Body: ResearchBody }>, reply: FastifyReply) => {
    const {
      query, depth = 'medium', intent, output_format,
      sources = ['web', 'social', 'academic'], max_branches = 3,
      require_approval = false, notify_telegram = false, chat_id,
      source = 'web_dashboard'
    } = req.body || {}

    if (!query?.trim()) {
      return reply.status(400).send({ error: 'O campo "query" é obrigatório' })
    }

    try {
      const userId = await ensureWebUser()

      // Criar command com metadados completos da configuração
      const command = await createCommand({
        userId,
        payload: {
          text: query.trim(),
          source,
          chat_id: chat_id || 0,
          telegram_id: chat_id || 0,
          received_at: new Date().toISOString(),
          // Configurações da pesquisa personalizada
          config: {
            depth,
            intent,
            output_format,
            sources,
            max_branches,
            require_approval,
            notify_telegram
          }
        }
      })

      // Criar job
      const job = await createJob({ commandId: command.id, chatId: chat_id || 0 })

      // Enfileirar
      await supabase.rpc('push_intent_job', { p_job_id: job.id })

      await logTrace({
        jobId: job.id, agentName: 'api_research', step: 'job_created',
        inputSummary: query.substring(0, 200),
        outputSummary: `job=${job.id} depth=${depth} sources=${sources.join(',')}`,
        status: 'ok'
      })

      await auditLog({
        job_id: job.id,
        action: 'web_research_created',
        resource_type: 'job',
        resource_id: job.id,
        result: 'ok',
        details: { query_len: query.length, depth, sources, notify_telegram }
      })

      // Notificar no Telegram se solicitado
      if (notify_telegram && chat_id && process.env.TELEGRAM_BOT_TOKEN) {
        const token = process.env.TELEGRAM_BOT_TOKEN
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id,
            text: `🔍 *Nova pesquisa iniciada pelo Dashboard*\n\nConsulta: _${query.substring(0, 200)}_\nProfundidade: ${depth}\nJob: \`${job.id.substring(0, 8)}...\`\n\nAguarde a análise completa.`,
            parse_mode: 'Markdown'
          })
        }).catch(() => {})
      }

      return reply.status(201).send({
        success: true,
        job_id: job.id,
        message: `Pesquisa "${query.substring(0, 60)}..." iniciada! O agente está processando.`,
        estimated_time_s: depth === 'shallow' ? 15 : depth === 'medium' ? 45 : 90,
        dashboard_url: `/dossiers/${job.id}`
      })

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      app.log.error({ err }, 'Erro ao criar job via API')
      return reply.status(500).send({ error: msg })
    }
  })

  // GET /api/research/presets — templates de pesquisa pré-configurados
  app.get('/api/research/presets', async (_req, reply) => {
    return reply.send([
      { id: 'quick', label: 'Resposta rápida', depth: 'shallow', intent: 'quick_answer', max_branches: 1, sources: ['web'] },
      { id: 'market', label: 'Análise de mercado', depth: 'medium', intent: 'research', max_branches: 4, sources: ['web', 'social', 'academic'] },
      { id: 'dossier', label: 'Dossiê completo', depth: 'deep', intent: 'dossier', max_branches: 8, sources: ['web', 'social', 'academic', 'internal'] },
      { id: 'academic', label: 'Revisão acadêmica', depth: 'deep', intent: 'research', max_branches: 6, sources: ['academic'], output_format: 'html' },
    ])
  })
}
