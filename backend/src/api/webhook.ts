import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import {
  supabase,
  upsertTelegramUser,
  createCommand,
  createJob,
  logTrace
} from '../db/client'

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
  })
}

export async function webhookRoutes(app: FastifyInstance) {
  // Endpoint que o Telegram chama a cada mensagem
  app.post(
    '/telegram',
    async (req: FastifyRequest<{ Body: TelegramUpdate }>, reply: FastifyReply) => {
      const update = req.body
      const message = update.message

      // Ignora atualizações sem mensagem de texto
      if (!message?.text) return reply.send({ ok: true })

      const from = message.from
      const chatId = message.chat.id
      const text = message.text.trim()

      app.log.info({ telegramId: from.id, text }, 'Mensagem recebida')

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

        // 2. Criar command
        const command = await createCommand({
          userId: user.id,
          payload: {
            text,
            source: 'telegram',
            chat_id: chatId,
            telegram_id: from.id,
            message_id: message.message_id,
            received_at: new Date(message.date * 1000).toISOString()
          }
        })

        // 3. Criar job
        const job = await createJob({
          commandId: command.id,
          chatId
        })

        // 4. Enfileirar via RPC
        await supabase.rpc('push_intent_job', { p_job_id: job.id })

        // 5. Registrar trace inicial
        await logTrace({
          jobId: job.id,
          agentName: 'webhook',
          step: 'job_created',
          inputSummary: text.substring(0, 200),
          outputSummary: `job_id=${job.id}`,
          status: 'ok'
        })

        // 6. Resposta imediata ao usuário
        await sendTelegramMessage(
          chatId,
          `🔄 *Processando sua solicitação...*\n\nJob ID: \`${job.id.substring(0, 8)}...\`\nAguarde, estou pesquisando e analisando.`
        )

        app.log.info({ jobId: job.id }, 'Job criado e enfileirado')
      } catch (err) {
        app.log.error(err, 'Erro ao processar mensagem Telegram')
        await sendTelegramMessage(
          chatId,
          '❌ Ocorreu um erro ao processar sua solicitação. Tente novamente.'
        ).catch(() => {})
      }

      return reply.send({ ok: true })
    }
  )

  // Rota para configurar o webhook no Telegram
  app.get('/setup', async (_req, reply) => {
    const token = process.env.TELEGRAM_BOT_TOKEN
    const webhookUrl = process.env.WEBHOOK_URL

    if (!token || !webhookUrl) {
      return reply.status(400).send({
        error: 'TELEGRAM_BOT_TOKEN e WEBHOOK_URL são obrigatórios'
      })
    }

    const res = await fetch(
      `https://api.telegram.org/bot${token}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: `${webhookUrl}/webhook/telegram` })
      }
    )
    const data = await res.json() as Record<string, unknown>
    return reply.send(data)
  })

  // Verifica info do webhook configurado
  app.get('/info', async (_req, reply) => {
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) return reply.status(400).send({ error: 'TELEGRAM_BOT_TOKEN ausente' })

    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`)
    const data = await res.json() as Record<string, unknown>
    return reply.send(data)
  })
}
