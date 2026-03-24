import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { supabase, upsertTelegramUser, createCommand, createJob, logTrace } from '../db/client'
import { checkTelegramRateLimit, extractOrCreateCorrelationId } from '../middleware/security'

interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    from: {
      id: number
      first_name: string
      last_name?: string
      username?: string
      language_code?: string
    }
    chat: { id: number; type: string }
    text?: string
    date: number
  }
}

async function sendTelegramMessage(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
  }).catch(() => {})
}

export async function webhookRoutes(app: FastifyInstance) {

  app.post(
    '/telegram',
    async (req: FastifyRequest<{ Body: TelegramUpdate }>, reply: FastifyReply) => {
      // ── Correlation ID (rastreabilidade transversal) ──
      const correlationId = extractOrCreateCorrelationId(req.headers as Record<string, unknown>)
      reply.header('x-correlation-id', correlationId)

      const update = req.body
      const message = update.message

      // Ignora atualizações sem mensagem de texto
      if (!message?.text) return reply.send({ ok: true })

      const from = message.from
      const chatId = message.chat.id
      const text = message.text.trim()

      // ── Rate Limit por chat_id (20 req/min) ──
      const rateCheck = checkTelegramRateLimit(chatId)
      if (!rateCheck.allowed) {
        await sendTelegramMessage(chatId, rateCheck.message || '⏳ Aguarde antes de enviar outra solicitação.')
        app.log.warn({ chatId, correlationId }, 'Rate limit atingido')
        return reply.send({ ok: true })
      }

      app.log.info({ telegramId: from.id, text, correlationId }, 'Mensagem recebida')

      try {
        // 1. Upsert do perfil do usuário
        const user = await upsertTelegramUser({
          id: from.id,
          first_name: from.first_name,
          last_name: from.last_name,
          username: from.username,
          language_code: from.language_code,
          chat_id: chatId
        })

        // 2. Criar command (inclui correlationId no payload)
        const command = await createCommand({
          userId: user.id,
          payload: {
            text,
            source: 'telegram',
            chat_id: chatId,
            telegram_id: from.id,
            message_id: message.message_id,
            received_at: new Date(message.date * 1000).toISOString(),
            correlation_id: correlationId
          }
        })

        // 3. Criar job
        const job = await createJob({ commandId: command.id, chatId })

        // 4. Enfileirar via RPC
        await supabase.rpc('push_intent_job', { p_job_id: job.id })

        // 5. Registrar trace inicial com correlationId
        await logTrace({
          jobId: job.id,
          agentName: 'webhook',
          step: 'job_created',
          inputSummary: text.substring(0, 200),
          outputSummary: `job_id=${job.id} cid=${correlationId}`,
          status: 'ok'
        })

        // 6. Resposta imediata ao usuário
        await sendTelegramMessage(
          chatId,
          `🔄 *Processando sua solicitação...*\n\nJob: \`${job.id.substring(0, 8)}...\`\nAguarde, estou pesquisando e analisando.`
        )

        app.log.info({ jobId: job.id, correlationId }, 'Job criado e enfileirado')

      } catch (err) {
        app.log.error({ err, correlationId }, 'Erro ao processar mensagem Telegram')
        await sendTelegramMessage(chatId, '❌ Ocorreu um erro. Tente novamente em instantes.').catch(() => {})
      }

      return reply.send({ ok: true })
    }
  )

  // Configura webhook no Telegram
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

  // Info do webhook
  app.get('/info', async (_req, reply) => {
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) return reply.status(400).send({ error: 'TELEGRAM_BOT_TOKEN ausente' })
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`)
    return reply.send(await res.json())
  })
}
