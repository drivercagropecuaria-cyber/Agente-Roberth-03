/**
 * OPENTELEMETRY — Camada 12 (Observabilidade Transversal) da Arquitetura ORBIT 2026
 * Implementação leve e sem dependências externas.
 * Emite spans correlacionados como JSON estruturado (compatível com OTLP JSON).
 *
 * Correlações por: job_id × agent_name × step × trace_id × span_id
 * Métricas: duration_ms, tokens_used, evidence_count, qa_score, cost_usd
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface OTelSpan {
  trace_id: string
  span_id: string
  parent_span_id?: string
  job_id: string
  agent_name: string
  step: string
  start_time: number
  end_time?: number
  duration_ms?: number
  status: 'ok' | 'error' | 'unset'
  attributes: Record<string, unknown>
  events: Array<{ name: string; ts: number; attributes?: Record<string, unknown> }>
}

// ─── Estado do trace ativo ────────────────────────────────────────────────────

let activeTraceId = ''
let activeJobId = ''
const activeSpans = new Map<string, OTelSpan>()
let spanCounter = 0

function generateId(len = 16): string {
  return Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

// ─── Inicializar trace para um job ───────────────────────────────────────────

export function startTrace(jobId: string): string {
  activeTraceId = generateId(32)
  activeJobId = jobId
  spanCounter = 0
  activeSpans.clear()
  return activeTraceId
}

// ─── Criar span ───────────────────────────────────────────────────────────────

export function startSpan(params: {
  agentName: string
  step: string
  parentSpanId?: string
  attributes?: Record<string, unknown>
}): string {
  const spanId = generateId(16)
  const span: OTelSpan = {
    trace_id: activeTraceId || generateId(32),
    span_id: spanId,
    parent_span_id: params.parentSpanId,
    job_id: activeJobId,
    agent_name: params.agentName,
    step: params.step,
    start_time: Date.now(),
    status: 'unset',
    attributes: params.attributes || {},
    events: []
  }
  activeSpans.set(spanId, span)
  return spanId
}

// ─── Fechar span ──────────────────────────────────────────────────────────────

export function endSpan(spanId: string, params: {
  status?: 'ok' | 'error'
  attributes?: Record<string, unknown>
  error?: Error
}): OTelSpan | null {
  const span = activeSpans.get(spanId)
  if (!span) return null

  span.end_time = Date.now()
  span.duration_ms = span.end_time - span.start_time
  span.status = params.status || 'ok'
  if (params.attributes) Object.assign(span.attributes, params.attributes)
  if (params.error) {
    span.status = 'error'
    span.attributes['error.message'] = params.error.message
    span.attributes['error.stack'] = params.error.stack?.substring(0, 500)
  }

  // Emitir como JSON estruturado (OTLP-compatible)
  const level = span.status === 'error' ? 'ERROR' : 'TRACE'
  process[span.status === 'error' ? 'stderr' : 'stdout'].write(
    JSON.stringify({
      level, ts: Date.now(), trace_id: span.trace_id, span_id: span.span_id,
      parent_span_id: span.parent_span_id, job_id: span.job_id,
      agent: span.agent_name, step: span.step, duration_ms: span.duration_ms,
      status: span.status, ...span.attributes
    }) + '\n'
  )

  activeSpans.delete(spanId)
  return span
}

// ─── Adicionar evento a um span ───────────────────────────────────────────────

export function addSpanEvent(spanId: string, name: string, attributes?: Record<string, unknown>): void {
  const span = activeSpans.get(spanId)
  if (!span) return
  span.events.push({ name, ts: Date.now(), attributes })
}

// ─── Wrapper utilitário: executa função com span automático ──────────────────

export async function withSpan<T>(
  agentName: string,
  step: string,
  fn: (spanId: string) => Promise<T>,
  attributes?: Record<string, unknown>
): Promise<T> {
  const spanId = startSpan({ agentName, step, attributes })
  try {
    const result = await fn(spanId)
    endSpan(spanId, { status: 'ok' })
    return result
  } catch (err) {
    endSpan(spanId, { status: 'error', error: err instanceof Error ? err : new Error(String(err)) })
    throw err
  }
}

// ─── Métricas de sistema ──────────────────────────────────────────────────────

export interface SystemMetrics {
  uptime_s: number
  memory_mb: number
  active_spans: number
  trace_id: string
  job_id: string
}

export function getSystemMetrics(): SystemMetrics {
  const mem = process.memoryUsage()
  return {
    uptime_s: Math.round(process.uptime()),
    memory_mb: Math.round(mem.rss / 1024 / 1024),
    active_spans: activeSpans.size,
    trace_id: activeTraceId,
    job_id: activeJobId
  }
}

// ─── Relatório periódico de saúde ─────────────────────────────────────────────

export function emitHealthMetrics(): void {
  const metrics = getSystemMetrics()
  process.stdout.write(JSON.stringify({
    level: 'METRIC', ts: Date.now(), type: 'system_health', ...metrics
  }) + '\n')
}

// Health report a cada 60s
if (process.env.NODE_ENV !== 'test') {
  setInterval(emitHealthMetrics, 60_000)
}
