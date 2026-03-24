/**
 * SECURITY MIDDLEWARE — Camada 1 da Arquitetura ORBIT 2026
 * Rate Limit por IP/chatId + Correlation ID injetado em cada request.
 * Sem dependências externas — usa apenas Map em memória.
 */

// ─── Rate Limiter simples (token bucket em memória) ──────────────────────────
const REQUESTS_PER_MINUTE = 20
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

export function checkRateLimit(key: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now()
  const bucket = rateBuckets.get(key)

  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + 60_000 })
    return { allowed: true }
  }

  if (bucket.count >= REQUESTS_PER_MINUTE) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now }
  }

  bucket.count++
  return { allowed: true }
}

// ─── Correlation ID ───────────────────────────────────────────────────────────
let _seq = 0
export function generateCorrelationId(prefix = 'orbit'): string {
  _seq = (_seq + 1) % 100_000
  return `${prefix}-${Date.now()}-${String(_seq).padStart(5, '0')}`
}

// ─── Header extractor para uso em Fastify ────────────────────────────────────
export function extractOrCreateCorrelationId(headers: Record<string, unknown>): string {
  const existing = headers['x-correlation-id'] || headers['x-request-id']
  if (existing && typeof existing === 'string') return existing
  return generateCorrelationId()
}

// ─── Telegram-specific: rate limit por chat_id ───────────────────────────────
export function checkTelegramRateLimit(chatId: number): { allowed: boolean; message?: string } {
  const key = `tg:${chatId}`
  const result = checkRateLimit(key)
  if (!result.allowed) {
    const secs = Math.ceil((result.retryAfterMs || 30_000) / 1000)
    return { allowed: false, message: `⏳ Muitas solicitações. Tente novamente em ${secs} segundos.` }
  }
  return { allowed: true }
}

// ─── Limpeza periódica de buckets expirados (evitar vazamento de memória) ────
setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of rateBuckets.entries()) {
    if (now > bucket.resetAt) rateBuckets.delete(key)
  }
}, 5 * 60_000) // A cada 5 minutos
