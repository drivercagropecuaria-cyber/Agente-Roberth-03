/**
 * ALERT MANAGER — Sistema de alertas de falha via Telegram
 * Envia notificações para admins quando:
 *   - Job falha (após max retries)
 *   - Taxa de erro alta (>30% em 10 min)
 *   - Score QA abaixo do threshold
 *   - Worker parado por > 5 min
 *   - Custo de tokens acima do budget
 */
import { tel } from '../utils/telemetry'

const ADMIN_CHAT_IDS = (process.env.ORBIT_ALERT_CHAT_IDS || process.env.ORBIT_ADMIN_IDS || '')
  .split(',')
  .map(s => parseInt(s.trim()))
  .filter(n => !isNaN(n) && n > 0)

// ─── Tracking de métricas em memória ──────────────────────────────────────────

interface MetricWindow {
  jobs: number
  errors: number
  windowStart: number
  totalTokens: number
  totalCostUSD: number
}

const WINDOW_MS = 10 * 60 * 1000 // 10 minutos
let metricWindow: MetricWindow = {
  jobs: 0, errors: 0, windowStart: Date.now(), totalTokens: 0, totalCostUSD: 0
}

function resetWindowIfExpired() {
  if (Date.now() - metricWindow.windowStart > WINDOW_MS) {
    metricWindow = { jobs: 0, errors: 0, windowStart: Date.now(), totalTokens: 0, totalCostUSD: 0 }
  }
}

export function recordJobSuccess(tokensUsed = 0) {
  resetWindowIfExpired()
  metricWindow.jobs++
  metricWindow.totalTokens += tokensUsed
  metricWindow.totalCostUSD += (tokensUsed / 1_000_000) * 5
}

export function recordJobError() {
  resetWindowIfExpired()
  metricWindow.jobs++
  metricWindow.errors++
}

export function getMetrics() {
  resetWindowIfExpired()
  const errorRate = metricWindow.jobs > 0 ? metricWindow.errors / metricWindow.jobs : 0
  return { ...metricWindow, errorRate, windowMinutes: Math.round((Date.now() - metricWindow.windowStart) / 60_000) }
}

// ─── Enviar alerta via Telegram ───────────────────────────────────────────────

async function sendAlert(message: string, level: 'info' | 'warning' | 'critical' = 'warning') {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token || ADMIN_CHAT_IDS.length === 0) {
    tel.info('alert_manager', 'no_recipients', { message: message.substring(0, 100) })
    return
  }

  const emoji = level === 'critical' ? '🚨' : level === 'warning' ? '⚠️' : 'ℹ️'
  const text = `${emoji} *ORBIT Alert* [${level.toUpperCase()}]\n\n${message}\n\n_${new Date().toLocaleString('pt-BR')}_`

  for (const chatId of ADMIN_CHAT_IDS) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
    }).catch(() => {})
  }

  tel.info('alert_manager', 'alert_sent', { level, recipients: ADMIN_CHAT_IDS.length })
}

// ─── Alertas específicos ──────────────────────────────────────────────────────

export async function alertJobFailed(jobId: string, error: string, retries: number) {
  recordJobError()
  await sendAlert(
    `*Job falhou definitivamente*\n\nJob: \`${jobId.substring(0, 12)}...\`\nErro: ${error.substring(0, 200)}\nRetentativas: ${retries}`,
    'critical'
  )
}

export async function alertHighErrorRate(errorRate: number, jobs: number) {
  await sendAlert(
    `*Taxa de erro elevada*\n\nErros: ${Math.round(errorRate * 100)}%\nJobs na janela: ${jobs}\nUltimos 10 min`,
    'warning'
  )
}

export async function alertLowQualityScore(jobId: string, score: number, threshold = 5) {
  if (score >= threshold) return
  await sendAlert(
    `*Score QA abaixo do threshold*\n\nJob: \`${jobId.substring(0, 12)}...\`\nScore: ${score.toFixed(1)}/10 (threshold: ${threshold})`,
    'warning'
  )
}

export async function alertHighCost(costUSD: number, budgetUSD = 1.0) {
  if (costUSD <= budgetUSD) return
  await sendAlert(
    `*Budget de custo excedido*\n\nCusto na janela: $${costUSD.toFixed(4)}\nBudget: $${budgetUSD.toFixed(2)}`,
    'warning'
  )
}

export async function alertWorkerRestarted(reason: string) {
  await sendAlert(`*Worker reiniciado*\nMotivo: ${reason}`, 'info')
}

// ─── Monitor periódico de métricas (chamado pelo worker a cada N jobs) ─────────

let lastErrorRateAlert = 0
const ALERT_COOLDOWN = 5 * 60 * 1000 // 5 min entre alertas do mesmo tipo

export async function checkMetricsAndAlert() {
  const metrics = getMetrics()

  // Taxa de erro alta
  if (metrics.errorRate > 0.3 && metrics.jobs >= 3) {
    if (Date.now() - lastErrorRateAlert > ALERT_COOLDOWN) {
      lastErrorRateAlert = Date.now()
      await alertHighErrorRate(metrics.errorRate, metrics.jobs)
    }
  }

  // Custo alto na janela
  if (metrics.totalCostUSD > 0.5) {
    await alertHighCost(metrics.totalCostUSD)
  }

  tel.info('alert_manager', 'metrics_check', {
    jobs: metrics.jobs, errors: metrics.errors,
    error_rate: Math.round(metrics.errorRate * 100) + '%',
    cost_usd: metrics.totalCostUSD.toFixed(4)
  })
}
