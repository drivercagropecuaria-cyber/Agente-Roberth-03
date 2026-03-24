import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { supabase, upsertTelegramUser, createCommand, createJob, logTrace } from '../db/client'
import { checkTelegramRateLimit, extractOrCreateCorrelationId } from '../middleware/security'
import { checkTelegramAccess, auditLog } from '../services/governance'

interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    from: { id: number; first_name: string; last_name?: string; username?: string; language_code?: string }
    chat: { id: number; type: string }
    text?: string
    date: number
  }
}

async function tg(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
  }).catch(() => {})
}

export async function webhookRoutes(app: FastifyInstance) {
  app.post('/telegram', async (req: FastifyRequest<{ Body: TelegramUpdate }>, reply: FastifyReply) => {
    // Correlation ID
    const correlationId = extractOrCreateCorrelationId(req.headers as Record<string, unknown>)
    reply.header('x-correlation-id', correlationId)

    const message = req.body?.message
    if (!message?.text) return reply.send({ ok: true })

    const from = message.from
    const chatId = message.chat.id
    const text = message.text.trim()

    // Rate Limit
    const rateCheck = checkTelegramRateLimit(chatId)
    if (!rateCheck.allowed) {
      await tg(chatId, rateCheck.message || '⏳ Aguarde antes de enviar outra solicitação.')
      return reply.send({ ok: true })
    }

    // RBAC — Governança
    const govCheck = await checkTelegramAccess(from.id, 'create_job')
    if (!govCheck.allowed) {
      await tg(chatId, `🚫 ${govCheck.denialReason}`)
      return reply.send({ ok: true })
    }

    app.log.info({ telegramId: from.id, role: govCheck.role, correlationId }, 'Mensagem recebida')

    try {
      const user = await upsertTelegramUser({
        id: from.id, first_name: from.first_name, last_name: from.last_name,
        username: from.username, language_code: from.language_code, chat_id: chatId
      })

      const command = await createCommand({
        userId: user.id,
        payload: {
          text, source: 'telegram', chat_id: chatId, telegram_id: from.id,
          message_id: message.message_id,
          received_at: new Date(message.date * 1000).toISOString(),
          correlation_id: correlationId, user_role: govCheck.role
        }
      })

      const job = await createJob({ commandId: command.id, chatId })
      await supabase.rpc('push_intent_job', { p_job_id: job.id })

      await logTrace({
        jobId: job.id, agentName: 'webhook', step: 'job_created',
        inputSummary: text.substring(0, 200), outputSummary: `job=${job.id} role=${govCheck.role} cid=${correlationId}`, status: 'ok'
      })

      await auditLog({ job_id: job.id, telegram_id: from.id, actor_role: govCheck.role, action: 'job_created', resource_type: 'job', resource_id: job.id, result: 'ok', details: { text_len: text.length } })

      await tg(chatId, `🔄 *Processando sua solicitação...*\n\nJob: \`${job.id.substring(0, 8)}...\`\nPerfil: ${govCheck.role}\nAguarde a análise completa.`)

    } catch (err) {
      app.log.error({ err, correlationId }, 'Erro ao processar mensagem')
      await tg(chatId, '❌ Ocorreu um erro. Tente novamente.').catch(() => {})
    }

    return reply.send({ ok: true })
  })

  app.get('/setup', async (_req, reply) => {
    const token = process.env.TELEGRAM_BOT_TOKEN
    const webhookUrl = process.env.WEBHOOK_URL
    if (!token || !webhookUrl) return reply.status(400).send({ error: 'TELEGRAM_BOT_TOKEN e WEBHOOK_URL são obrigatórios' })
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: `${webhookUrl}/webhook/telegram` })
    })
    return reply.send(await res.json())
  })

  app.get('/info', async (_req, reply) => {
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) return reply.status(400).send({ error: 'TELEGRAM_BOT_TOKEN ausente' })
    return reply.send(await (await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`)).json())
  })
}
