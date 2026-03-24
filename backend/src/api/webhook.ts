/**
 * WEBHOOK — Fase G: Human-in-the-loop + Replay via mensagem Telegram
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { supabase, upsertTelegramUser, createCommand, createJob, logTrace } from '../db/client'
import { checkTelegramRateLimit, extractOrCreateCorrelationId } from '../middleware/security'
import { checkTelegramAccess, auditLog } from '../services/governance'
import { processApprovalResponse } from '../workflow/human-approval'
import { replayJob } from '../workflow/dead-letter'
import { resumeAfterApproval } from '../agents/orchestrator'

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

    // ── Detectar resposta de aprovação humana (OK/CANCELAR TOKEN) ────────────
    const approvalResponse = await processApprovalResponse(text, chatId)
    if (approvalResponse.handled && approvalResponse.jobId) {
      if (approvalResponse.approved) {
        await tg(chatId, '✅ *Aprovação registrada!* Retomando análise...')
        await resumeAfterApproval(approvalResponse.jobId, true)
      } else {
        await tg(chatId, '❌ *Solicitação cancelada.* Job encerrado.')
        await resumeAfterApproval(approvalResponse.jobId, false)
      }
      return reply.send({ ok: true })
    }

    // ── Detectar comando REPLAY ───────────────────────────────────────────────
    const replayMatch = text.match(/^\/replay\s+([a-f0-9-]{8,36})/i)
    if (replayMatch) {
      const jobId = replayMatch[1]
      const result = await replayJob(jobId)
      await tg(chatId, result.success ? `🔄 ${result.message}` : `❌ ${result.message}`)
      return reply.send({ ok: true })
    }

    // ── Detectar comando STATUS ───────────────────────────────────────────────
    if (text.startsWith('/status')) {
      const { data: jobs } = await supabase.from('jobs').select('id, status, quality_score, created_at').order('created_at', { ascending: false }).limit(5)
      const list = (jobs || []).map(j => `• \`${j.id.substring(0, 8)}\` — ${j.status}${j.quality_score ? ` (${j.quality_score.toFixed(1)}/10)` : ''}`).join('\n')
      await tg(chatId, `📊 *Últimos 5 jobs:*\n\n${list || 'Nenhum job ainda.'}`)
      return reply.send({ ok: true })
    }

    // ── Criar novo job normal ─────────────────────────────────────────────────
    const govCheck = await checkTelegramAccess(from.id, 'create_job')
    if (!govCheck.allowed) {
      await tg(chatId, `🚫 ${govCheck.denialReason}`)
      return reply.send({ ok: true })
    }

    try {
      const user = await upsertTelegramUser({
        id: from.id, first_name: from.first_name, last_name: from.last_name,
        username: from.username, language_code: from.language_code, chat_id: chatId
      })
      const command = await createCommand({
        userId: user.id,
        payload: { text, source: 'telegram', chat_id: chatId, telegram_id: from.id, message_id: message.message_id, received_at: new Date(message.date * 1000).toISOString(), correlation_id: correlationId, user_role: govCheck.role }
      })
      const job = await createJob({ commandId: command.id, chatId })
      await supabase.rpc('push_intent_job', { p_job_id: job.id })
      await logTrace({ jobId: job.id, agentName: 'webhook', step: 'job_created', inputSummary: text.substring(0, 200), outputSummary: `job=${job.id} role=${govCheck.role}`, status: 'ok' })
      await auditLog({ job_id: job.id, telegram_id: from.id, actor_role: govCheck.role, action: 'job_created', resource_type: 'job', resource_id: job.id, result: 'ok' })
      await tg(chatId, `🔄 *Processando...*\n\nJob: \`${job.id.substring(0, 8)}...\`\n\n_Dica: envie_ \`/status\` _para acompanhar ou_ \`/replay <job_id>\` _para reexecutar um job._`)
    } catch (err) {
      app.log.error({ err, correlationId }, 'Erro ao processar mensagem')
      await tg(chatId, '❌ Ocorreu um erro. Tente novamente.').catch(() => {})
    }

    return reply.send({ ok: true })
  })

  app.get('/setup', async (_req, reply) => {
    const token = process.env.TELEGRAM_BOT_TOKEN
    const webhookUrl = process.env.WEBHOOK_URL
    if (!token || !webhookUrl) return reply.status(400).send({ error: 'Variáveis ausentes' })
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
