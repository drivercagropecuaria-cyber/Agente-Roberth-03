/**
 * ARTIFACT GENERATOR — Camada 9 da Arquitetura ORBIT 2026
 * Transforma a síntese em múltiplos formatos de saída:
 *   - HTML Premium (autocontido, com estilo, SWOT, fontes)
 *   - Card JSON estruturado (para dashboard)
 *   - Resumo Telegram (≤ 900 chars)
 *   - Briefing executivo (markdown)
 */
import type { AdapterResult } from '../services/retrieval-fabric'

export interface ArtifactCard {
  type: 'card'
  job_id: string
  title: string
  executive_summary: string
  key_findings: string[]
  conclusion: string
  recommendations: string[]
  swot: { forcas: string[]; fraquezas: string[]; oportunidades: string[]; ameacas: string[] }
  qa_score: number
  sources_count: number
  generated_at: string
}

// ─── CARD JSON ────────────────────────────────────────────────────────────────

export function buildDashboardCard(params: {
  jobId: string
  synthesis: any
  qaScore: number
  sourcesCount: number
}): ArtifactCard {
  const { jobId, synthesis, qaScore, sourcesCount } = params
  return {
    type: 'card',
    job_id: jobId,
    title: (synthesis.key_findings?.[0] || 'Análise ORBIT').substring(0, 100),
    executive_summary: (synthesis.executive_summary || '').substring(0, 500),
    key_findings: (synthesis.key_findings || []).slice(0, 5),
    conclusion: (synthesis.conclusion || '').substring(0, 300),
    recommendations: (synthesis.recommendations || []).slice(0, 4),
    swot: synthesis.swot || { forcas: [], fraquezas: [], oportunidades: [], ameacas: [] },
    qa_score: qaScore,
    sources_count: sourcesCount,
    generated_at: new Date().toISOString()
  }
}

// ─── RESUMO TELEGRAM ─────────────────────────────────────────────────────────

export function buildTelegramSummary(synthesis: any, qaScore: number, sourcesCount: number): string {
  const summary = (synthesis.executive_summary || '').substring(0, 600)
  const findings = (synthesis.key_findings || []).slice(0, 3).map((f: string, i: number) => `${i + 1}. ${f}`).join('\n')
  const conclusion = (synthesis.conclusion || '').substring(0, 150)

  const parts = [summary]
  if (findings) parts.push(`\n*Principais achados:*\n${findings}`)
  if (conclusion) parts.push(`\n*Conclusão:* ${conclusion}`)

  const meta = `\n\n📊 Score: ${qaScore}/10 | Fontes: ${sourcesCount} | ${new Date().toLocaleDateString('pt-BR')}`
  const full = parts.join('\n') + meta

  return full.substring(0, 900)
}

// ─── HTML PREMIUM ─────────────────────────────────────────────────────────────

export function buildHtmlPresentation(params: {
  jobId: string
  query: string
  synthesis: any
  sources: AdapterResult[]
  qaReport: any
  ledgerReport: any
}): string {
  const { jobId, query, synthesis, sources, qaReport, ledgerReport } = params
  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const score = qaReport?.score_geral ?? qaReport?.gate3_artifact?.score ?? '—'
  const scoreColor = typeof score === 'number' ? (score >= 8 ? '#22c55e' : score >= 6 ? '#f59e0b' : '#ef4444') : '#6b7280'
  const scoreStatus = typeof score === 'number' ? (score >= 8 ? 'Excelente' : score >= 6 ? 'Bom' : 'Precisa revisão') : '—'

  const findings = (synthesis.key_findings || []).map((f: string) =>
    `<li>${escapeHtml(f)}</li>`
  ).join('')

  const recommendations = (synthesis.recommendations || []).map((r: string) =>
    `<li>${escapeHtml(r)}</li>`
  ).join('')

  const swot = synthesis.swot || {}
  const swotHtml = `
    <div class="swot-grid">
      ${swotSection('💪 Forças', swot.forcas || [], '#22c55e')}
      ${swotSection('⚠️ Fraquezas', swot.fraquezas || [], '#ef4444')}
      ${swotSection('🚀 Oportunidades', swot.oportunidades || [], '#3b82f6')}
      ${swotSection('⚡ Ameaças', swot.ameacas || [], '#f59e0b')}
    </div>`

  const sourcesHtml = sources.slice(0, 12).map(s => `
    <div class="source-item">
      <span class="source-badge source-${s.type}">${s.type.toUpperCase()}</span>
      <a href="${escapeHtml(s.url)}" target="_blank">${escapeHtml(s.title.substring(0, 80))}</a>
      ${s.authors?.length ? `<span class="source-authors"> — ${s.authors.slice(0, 2).join(', ')}</span>` : ''}
      ${s.year ? `<span class="source-year"> (${s.year})</span>` : ''}
    </div>`
  ).join('')

  const qaHtml = qaReport?.scores ? Object.entries(qaReport.scores).map(([k, v]: [string, any]) => `
    <div class="qa-row">
      <span class="qa-dim">${k}</span>
      <div class="qa-bar-wrap"><div class="qa-bar" style="width:${(v / 10) * 100}%;background:${v >= 7 ? '#22c55e' : v >= 5 ? '#f59e0b' : '#ef4444'}"></div></div>
      <span class="qa-val">${v}/10</span>
    </div>`
  ).join('') : ''

  const ledgerSummaryHtml = ledgerReport ? `
    <div class="ledger-stats">
      <div class="ls-item"><span>📦 Total</span><strong>${ledgerReport.total}</strong></div>
      <div class="ls-item"><span>✅ Únicas</span><strong>${ledgerReport.unique}</strong></div>
      <div class="ls-item"><span>⚡ Conflitos</span><strong>${ledgerReport.conflicts}</strong></div>
      <div class="ls-item"><span>📅 Freshness</span><strong>${Math.round((ledgerReport.avg_freshness || 0) * 100)}%</strong></div>
    </div>` : ''

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ORBIT — ${escapeHtml(query.substring(0, 60))}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0f172a; --surface: #1e293b; --border: #334155; --text: #e2e8f0;
    --muted: #94a3b8; --accent: #6366f1; --accent2: #8b5cf6;
  }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
  .container { max-width: 900px; margin: 0 auto; padding: 2rem 1rem 4rem; }

  /* HEADER */
  .orbit-header { background: linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e293b 100%); border-radius: 16px; padding: 2.5rem; margin-bottom: 2rem; border: 1px solid #4338ca; }
  .orbit-logo { font-size: 0.8rem; letter-spacing: 0.3em; color: #a5b4fc; text-transform: uppercase; margin-bottom: 0.5rem; }
  .orbit-header h1 { font-size: 1.6rem; font-weight: 700; color: #fff; margin-bottom: 0.5rem; line-height: 1.3; }
  .orbit-meta { display: flex; gap: 1rem; flex-wrap: wrap; font-size: 0.8rem; color: #94a3b8; margin-top: 1rem; }
  .orbit-meta span { background: rgba(255,255,255,0.08); padding: 0.2rem 0.7rem; border-radius: 99px; }
  .score-badge { display: inline-flex; align-items: center; gap: 0.4rem; background: ${scoreColor}22; border: 1px solid ${scoreColor}66; border-radius: 99px; padding: 0.3rem 1rem; font-weight: 700; color: ${scoreColor}; font-size: 1rem; margin-top: 1rem; }

  /* SECTIONS */
  .section { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; }
  .section-title { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: var(--accent); margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem; }
  .section-title::before { content: ''; display: block; width: 3px; height: 16px; background: var(--accent); border-radius: 2px; }

  /* EXECUTIVE SUMMARY */
  .exec-summary { font-size: 1rem; color: var(--text); line-height: 1.8; white-space: pre-wrap; }

  /* FINDINGS */
  .findings-list { list-style: none; }
  .findings-list li { padding: 0.6rem 0; border-bottom: 1px solid var(--border); font-size: 0.95rem; display: flex; gap: 0.7rem; }
  .findings-list li::before { content: '◆'; color: var(--accent); flex-shrink: 0; }
  .findings-list li:last-child { border-bottom: none; }

  /* SWOT */
  .swot-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .swot-box { border-radius: 8px; padding: 1rem; }
  .swot-box h4 { font-size: 0.8rem; font-weight: 700; margin-bottom: 0.6rem; }
  .swot-box ul { list-style: none; font-size: 0.85rem; }
  .swot-box ul li { padding: 0.25rem 0; opacity: 0.9; }
  .swot-box ul li::before { content: '• '; }

  /* RECOMMENDATIONS */
  .rec-list { list-style: none; counter-reset: rec; }
  .rec-list li { counter-increment: rec; padding: 0.7rem 0; border-bottom: 1px solid var(--border); font-size: 0.95rem; display: flex; gap: 1rem; align-items: flex-start; }
  .rec-list li::before { content: counter(rec); background: var(--accent); color: #fff; border-radius: 50%; width: 1.4rem; height: 1.4rem; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700; flex-shrink: 0; margin-top: 0.1rem; }
  .rec-list li:last-child { border-bottom: none; }

  /* EVIDENCE LEDGER */
  .ledger-stats { display: flex; gap: 1rem; flex-wrap: wrap; }
  .ls-item { background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.3); border-radius: 8px; padding: 0.8rem 1.2rem; text-align: center; flex: 1; min-width: 100px; }
  .ls-item span { display: block; font-size: 0.75rem; color: var(--muted); }
  .ls-item strong { font-size: 1.4rem; color: var(--accent); }

  /* QA */
  .qa-row { display: flex; align-items: center; gap: 0.8rem; margin-bottom: 0.5rem; }
  .qa-dim { font-size: 0.8rem; color: var(--muted); width: 140px; flex-shrink: 0; text-transform: capitalize; }
  .qa-bar-wrap { flex: 1; height: 6px; background: var(--border); border-radius: 99px; overflow: hidden; }
  .qa-bar { height: 100%; border-radius: 99px; transition: width 0.3s; }
  .qa-val { font-size: 0.8rem; font-weight: 600; width: 40px; text-align: right; }

  /* SOURCES */
  .source-item { display: flex; align-items: flex-start; gap: 0.6rem; padding: 0.5rem 0; border-bottom: 1px solid var(--border); font-size: 0.85rem; flex-wrap: wrap; }
  .source-item:last-child { border-bottom: none; }
  .source-item a { color: #a5b4fc; text-decoration: none; }
  .source-item a:hover { text-decoration: underline; }
  .source-badge { border-radius: 4px; padding: 0.1rem 0.4rem; font-size: 0.65rem; font-weight: 700; flex-shrink: 0; margin-top: 0.1rem; }
  .source-web { background: #0369a1; color: #fff; }
  .source-social { background: #7c3aed; color: #fff; }
  .source-academic { background: #065f46; color: #fff; }
  .source-internal { background: #92400e; color: #fff; }
  .source-authors { color: var(--muted); }
  .source-year { color: var(--accent); font-size: 0.8rem; }

  /* CONCLUSION */
  .conclusion-text { font-size: 1rem; line-height: 1.8; font-style: italic; color: #c7d2fe; border-left: 3px solid var(--accent); padding-left: 1rem; }

  /* FOOTER */
  .orbit-footer { text-align: center; margin-top: 3rem; font-size: 0.75rem; color: var(--muted); }
  .orbit-footer strong { color: var(--accent); }

  @media (max-width: 600px) { .swot-grid { grid-template-columns: 1fr; } .orbit-header { padding: 1.5rem; } }
</style>
</head>
<body>
<div class="container">

  <!-- HEADER -->
  <div class="orbit-header">
    <div class="orbit-logo">⊕ ORBIT — Orquestrador de Inteligência</div>
    <h1>${escapeHtml(query.substring(0, 120))}</h1>
    <div class="orbit-meta">
      <span>📅 ${now}</span>
      <span>🔬 ${sources.length} fontes</span>
      <span>🆔 ${jobId.substring(0, 8)}...</span>
    </div>
    <div class="score-badge">
      <span style="font-size:1.2rem">◉</span>
      Score de Qualidade: ${score}/10 — ${scoreStatus}
    </div>
  </div>

  <!-- EXECUTIVE SUMMARY -->
  <div class="section">
    <div class="section-title">📋 Resumo Executivo</div>
    <div class="exec-summary">${escapeHtml(synthesis.executive_summary || 'Não disponível.')}</div>
  </div>

  <!-- KEY FINDINGS -->
  ${findings ? `<div class="section">
    <div class="section-title">🔍 Principais Achados</div>
    <ul class="findings-list">${findings}</ul>
  </div>` : ''}

  <!-- SWOT -->
  ${hasSwot(synthesis.swot) ? `<div class="section">
    <div class="section-title">⚖️ Análise SWOT</div>
    ${swotHtml}
  </div>` : ''}

  <!-- RECOMMENDATIONS -->
  ${recommendations ? `<div class="section">
    <div class="section-title">🎯 Recomendações</div>
    <ol class="rec-list">${recommendations}</ol>
  </div>` : ''}

  <!-- CONCLUSION -->
  ${synthesis.conclusion ? `<div class="section">
    <div class="section-title">✅ Conclusão</div>
    <p class="conclusion-text">${escapeHtml(synthesis.conclusion)}</p>
  </div>` : ''}

  <!-- EVIDENCE LEDGER -->
  ${ledgerSummaryHtml ? `<div class="section">
    <div class="section-title">🗂️ Ledger de Evidências</div>
    ${ledgerSummaryHtml}
  </div>` : ''}

  <!-- QA SCORECARD -->
  ${qaHtml ? `<div class="section">
    <div class="section-title">📊 Scorecard de Qualidade (9 Dimensões)</div>
    ${qaHtml}
  </div>` : ''}

  <!-- SOURCES -->
  ${sourcesHtml ? `<div class="section">
    <div class="section-title">📚 Fontes Consultadas</div>
    <div>${sourcesHtml}</div>
  </div>` : ''}

  <!-- FOOTER -->
  <div class="orbit-footer">
    Gerado por <strong>ORBIT</strong> — Orquestrador de Inteligência e Base de Insights em Tempo Real<br>
    Arquitetura multi-agente com 13 camadas | ${now}
  </div>

</div>
</body>
</html>`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function hasSwot(swot: any): boolean {
  if (!swot) return false
  return ['forcas', 'fraquezas', 'oportunidades', 'ameacas'].some(k => (swot[k] || []).length > 0)
}

function swotSection(label: string, items: string[], color: string): string {
  const bg = color + '18'
  const border = color + '44'
  return `<div class="swot-box" style="background:${bg};border:1px solid ${border}">
    <h4 style="color:${color}">${label}</h4>
    <ul>${items.slice(0, 4).map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
  </div>`
}
