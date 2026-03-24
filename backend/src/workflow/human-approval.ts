/**
 * HUMAN-IN-THE-LOOP — Fase G da Arquitetura ORBIT 2026
 *
 * Primitivo nativo de aprovação humana:
 *   1. Workflow pause → cria ApprovalRequest no Supabase
 *   2. Telegram envia mensagem com botões inline OK/CANCELAR
 *   3. Usuário responde "OK <token>" ou "CANCELAR <token>"
 *   4. Webhook detecta e chama resumeWorkflow()
 *   5. Motor recarrega checkpoint e continua do step pausado
 *
 * Tokens são UUID de 8 chars para facilitar digitação no Telegram.
 */
import crypto from 'crypto'
import { supabase } from '../db/client'
import { tel } from '../utils/telemetry'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ApprovalRequest {
  token: string
  jobId: string
  chatId: number
  stepName: string
  reason: string
  context: Record<string, unknown>
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  createdAt: string
  expiresAt: string
}

// ─── Cache em memória (fallback se Supabase lento) ───────────────────────────

const approvalCache = new Map<string, ApprovalRequest>()
const APPROVAL_TTL_MS = 30 * 60 * 1000 // 30 minutos

// ─── Gerar token legível ──────────────────────────────────────────────────────

function generateToken(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase() // ex: A3F2B1C4
}

// ─── Criar pedido de aprovação ────────────────────────────────────────────────

export async function createApprovalRequest(params: {
  jobId: string
  chatId: number
  stepName: string
  reason: string
  context?: Record<string, unknown>
}): Promise<{ token: string; request: ApprovalRequest }> {
  const token = generateToken()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + APPROVAL_TTL_MS)

  const request: ApprovalRequest = {
    token,
    jobId: params.jobId,
    chatId: params.chatId,
    stepName: params.stepName,
    reason: params.reason,
    context: params.context || {},
    status: 'pending',
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString()
  }

  // Persistir no Supabase
  try {
    await supabase.from('approvals').insert({
      job_id: params.jobId,
      token,
      step_name: params.stepName,
      reason: params.reason,
      context: params.context || {},
      status: 'pending',
      chat_id: params.chatId,
      expires_at: expiresAt.toISOString()
    })
  } catch {
    // Fallback: só usa cache em memória
  }

  approvalCache.set(token, request)

  // Enviar mensagem de aprovação no Telegram
  await sendApprovalMessage(request)

  tel.info('human_approval', 'created', { token, jobId: params.jobId, step: params.stepName })
  return { token, request }
}

// ─── Enviar mensagem de aprovação ─────────────────────────────────────────────

async function sendApprovalMessage(req: ApprovalRequest): Promise<void> {
  const tok = process.env.TELEGRAM_BOT_TOKEN
  if (!tok) return

  const text = `⏸️ *Aprovação necessária*\n\n` +
    `📋 *Motivo:* ${req.reason}\n` +
    `🆔 *Job:* \`${req.jobId.substring(0, 12)}...\`\n` +
    `⏱ *Expira em:* 30 minutos\n\n` +
    `Para *aprovar*, responda:\n\`OK ${req.token}\`\n\n` +
    `Para *cancelar*, responda:\n\`CANCELAR ${req.token}\``

  await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: req.chatId, text, parse_mode: 'Markdown' })
  }).catch(() => {})
}

// ─── Processar resposta do usuário ────────────────────────────────────────────

export async function processApprovalResponse(text: string, chatId: number): Promise<{
  handled: boolean
  approved?: boolean
  jobId?: string
  token?: string
}> {
  const upperText = text.trim().toUpperCase()

  // Padrão: "OK TOKEN" ou "CANCELAR TOKEN"
  const okMatch = upperText.match(/^OK\s+([A-F0-9]{8})$/)
  const cancelMatch = upperText.match(/^CANCELAR\s+([A-F0-9]{8})$/)

  if (!okMatch && !cancelMatch) return { handled: false }

  const token = (okMatch || cancelMatch)![1]
  const approved = !!okMatch

  // Buscar pedido
  let request = approvalCache.get(token)
  if (!request) {
    try {
      const { data } = await supabase.from('approvals').select('*').eq('token', token).eq('status', 'pending').single()
      if (data) {
        request = {
          token: data.token, jobId: data.job_id, chatId: data.chat_id,
          stepName: data.step_name, reason: data.reason, context: data.context || {},
          status: data.status, createdAt: data.created_at, expiresAt: data.expires_at
        }
        approvalCache.set(token, request)
      }
    } catch {}
  }

  if (!request) {
    return { handled: true, approved: false, token }
  }

  // Verificar expiração
  if (new Date() > new Date(request.expiresAt)) {
    await supabase.from('approvals').update({ status: 'expired' }).eq('token', token).catch(() => {})
    approvalCache.delete(token)
    return { handled: true, approved: false, token, jobId: request.jobId }
  }

  // Verificar que é o mesmo chat
  if (request.chatId !== chatId) {
    return { handled: false }
  }

  // Atualizar status
  const newStatus = approved ? 'approved' : 'rejected'
  await supabase.from('approvals').update({ status: newStatus, resolved_at: new Date().toISOString() }).eq('token', token).catch(() => {})
  approvalCache.delete(token)

  tel.info('human_approval', 'resolved', { token, approved, jobId: request.jobId })
  return { handled: true, approved, jobId: request.jobId, token }
}

// ─── Verificar se job tem aprovação pendente ──────────────────────────────────

export async function hasPendingApproval(jobId: string): Promise<boolean> {
  try {
    const { data } = await supabase.from('approvals').select('token').eq('job_id', jobId).eq('status', 'pending').limit(1)
    return (data || []).length > 0
  } catch {
    return [...approvalCache.values()].some(r => r.jobId === jobId && r.status === 'pending')
  }
}

// ─── Limpar pedidos expirados ─────────────────────────────────────────────────

export function cleanExpiredApprovals(): void {
  const now = new Date()
  for (const [token, req] of approvalCache.entries()) {
    if (now > new Date(req.expiresAt)) {
      approvalCache.delete(token)
    }
  }
}

setInterval(cleanExpiredApprovals, 5 * 60 * 1000)
