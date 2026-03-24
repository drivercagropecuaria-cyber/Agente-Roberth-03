/**
 * ORCHESTRATOR — ORBIT 2026 — Fase D: Retrieval Fabric + Artifact Registry + HTML Premium
 */
import OpenAI from 'openai'
import { supabase, updateJobStatus, logTrace } from '../db/client'
import { routeIntake, persistIntakeDecision } from '../services/intake-router'
import { generatePlan } from './planner'
import { runResearchAgent } from './research'
import { runAnalysisAgent } from './analysis'
import { runSynthesizer } from './synthesizer'
import { runQualityReviewer } from './quality-reviewer'
import { buildEvidenceLedger, runEvidenceGate } from '../services/evidence-ledger'
import { runGate2Synthesis, runGate3Artifact, consolidateQA } from '../services/quality-gates'
import { buildHtmlPresentation, buildDashboardCard, buildTelegramSummary } from '../services/artifact-generator'
import { registerArtifact } from '../services/artifact-registry'
import { saveEpisodicMemory } from '../services/memory'
import { tel, setJobContext } from '../utils/telemetry'
import { indexResearchSources, persistKnowledgeItem } from '../services/embeddings'
import { startTrace } from '../utils/otel'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

async function tg(chatId: number, text: string) {
  const tok = process.env.TELEGRAM_BOT_TOKEN
  if (!tok || !chatId) return
  await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
  }).catch(() => {})
}

export async function orchestrate(job: any) {
  const { id: jobId, command_id, chat_id } = job
  setJobContext(jobId)
  const t0 = Date.now()
  const traceId = startTrace(jobId)
  let totalTokens = 0

  const { data: cmd } = await supabase.from('commands').select('payload,user_id').eq('id', command_id).single()
  if (!cmd) throw new Error('Command nao encontrado: ' + command_id)
  const text: string = cmd.payload?.text || ''
  const telegramId: number = cmd.payload?.telegram_id
  tel.info('orchestrator', 'started', { len: text.length })

  // Intake
  const intake = routeIntake(text)
  await persistIntakeDecision(jobId, intake)

  if (intake.requires_human) {
    await tg(chat_id, 'Solicitacao requer aprovacao. Responda OK para continuar.')
    await updateJobStatus(jobId, 'pending', { orchestration_log: { intake, awaiting_approval: true } })
    return
  }

  // Planner
  const plan = await generatePlan({ jobId, userText: text, intent: intake.intent, depth: intake.depth, maxBranches: intake.max_branches, maxTokens: intake.max_tokens })

  // Resposta rapida
  if (intake.intent === 'quick_answer') {
    const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: text }], max_tokens: 800 })
    const ans = r.choices[0].message.content || 'Nao consegui processar.'
    totalTokens += r.usage?.total_tokens || 0
    await updateJobStatus(jobId, 'completed', { result: { type: 'quick_answer', content: ans } })
    await tg(chat_id, ans)
    await logTrace({ jobId, agentName: 'orchestrator', step: 'quick_answer', durationMs: Date.now() - t0, tokensUsed: totalTokens })
    return
  }

  // Pesquisa (Web + Social + Academic via Retrieval Fabric)
  await tg(chat_id, '🔍 *Pesquisando fontes* (web + social + acadêmico)...')
  const research = await runResearchAgent({ jobId, query: text, plan })
  const allSources = research.sources || []

  // Evidence Ledger
  const ledger = await buildEvidenceLedger({ jobId, sources: allSources })

  // Gate 1 — Evidencia
  const gate1 = runEvidenceGate(ledger)
  tel.info('orchestrator', 'gate1', { passed: gate1.passed, score: gate1.score })
  if (!gate1.passed && gate1.repair_action === 'ampliar_pesquisa') {
    await tg(chat_id, '🔄 Ampliando pesquisa...')
    const r2 = await runResearchAgent({ jobId, query: text + ' dados recentes 2024 2025', plan: { ...plan, max_branches: 6, depth: 'deep' } })
    research.sources = [...allSources, ...(r2.sources || [])]
  }

  // Analise + Sintese
  await tg(chat_id, '🧠 *Analisando evidências...*')
  const analysis = await runAnalysisAgent({ jobId, research, plan })
  const synthesis = await runSynthesizer({ jobId, analysis, plan })

  // Gate 2 — Sintese
  const gate2 = await runGate2Synthesis(synthesis, ledger)
  tel.info('orchestrator', 'gate2', { passed: gate2.passed, score: gate2.score })
  const finalSynth = !gate2.passed
    ? await runSynthesizer({ jobId, analysis: { ...analysis, _repair: gate2.issues.join('; ') }, plan })
    : synthesis

  // QA 9 dimensoes
  const elapsedMs = Date.now() - t0
  const qa9 = await runQualityReviewer({ jobId, artifact: finalSynth, plan, durationMs: elapsedMs, tokensUsed: totalTokens })

  // Gate 3 — Artefato
  const gate3 = await runGate3Artifact({ artifact: finalSynth, durationMs: elapsedMs, tokensUsed: totalTokens, plan })
  const fullQA = consolidateQA(gate1, gate2, gate3)

  // ── Artifact Generator ────────────────────────────────────────────────────
  await tg(chat_id, '📄 *Gerando artefatos...*')

  // 1. HTML Premium
  const htmlContent = buildHtmlPresentation({
    jobId, query: text, synthesis: finalSynth,
    sources: research.sources || [],
    qaReport: qa9, ledgerReport: ledger
  })

  // 2. Card JSON
  const cardJson = buildDashboardCard({
    jobId, synthesis: finalSynth,
    qaScore: fullQA.score_geral, sourcesCount: (research.sources || []).length
  })

  // 3. Resumo Telegram
  const telegramSummary = buildTelegramSummary(finalSynth, fullQA.score_geral, (research.sources || []).length)

  // ── Artifact Registry ─────────────────────────────────────────────────────
  const [htmlReg, jsonReg] = await Promise.all([
    registerArtifact({ jobId, type: 'html', content: htmlContent, qaScore: fullQA.score_geral, sourcesCount: (research.sources || []).length }),
    registerArtifact({ jobId, type: 'json', content: JSON.stringify(cardJson, null, 2), qaScore: fullQA.score_geral, sourcesCount: (research.sources || []).length })
  ])

  tel.info('orchestrator', 'artifacts_registered', {
    html_stored: htmlReg.stored_in_storage, html_url: htmlReg.public_url,
    json_stored: jsonReg.stored_in_storage
  })

  // Persistir resultado completo
  await updateJobStatus(jobId, 'completed', {
    result: {
      type: intake.expected_output, synthesis: finalSynth, qa: qa9, full_qa: fullQA,
      artifacts: {
        html: { id: htmlReg.artifact_id, url: htmlReg.public_url, hash: htmlReg.content_hash, version: htmlReg.version },
        json: { id: jsonReg.artifact_id, hash: jsonReg.content_hash }
      },
      ledger_summary: { total: ledger.total, unique: ledger.unique, conflicts: ledger.conflicts, avg_freshness: ledger.avg_freshness },
      retrieval_summary: { web: (research.fabric as any)?.web?.length || 0, social: (research.fabric as any)?.social?.length || 0, academic: (research.fabric as any)?.academic?.length || 0 }
    },
    quality_score: fullQA.score_geral
  })

  // Entrega no Telegram
  const emoji = fullQA.status === 'aprovado' ? '✅' : fullQA.status === 'reprovado_parcial' ? '⚠️' : '❌'
  await tg(chat_id, `${emoji} *Análise concluída!*\n\n${telegramSummary}`)

  // Link para apresentação HTML (se publicado no Storage)
  if (htmlReg.public_url) {
    await tg(chat_id, `📊 *Apresentação completa:*\n${htmlReg.public_url}`)
  }

  if (fullQA.repair_needed) {
    await tg(chat_id, '⚠️ *Pontos de melhoria:*\n' + fullQA.repair_sequence.map(r => `• ${r.gate}: ${r.action}`).join('\n'))
  }

  if (cmd.user_id && telegramId) {
    await saveEpisodicMemory({ userProfileId: cmd.user_id, telegramId, role: 'assistant', content: telegramSummary.substring(0, 500), intent: intake.intent, jobId })
  }

  // Indexar fontes na Knowledge Base (async, não bloqueia)
  indexResearchSources({ jobId, sources: research.sources || [] }).catch(() => {})

  // Persistir síntese na KB
  if (finalSynth.executive_summary) {
    persistKnowledgeItem({ jobId, title: text.substring(0, 100), content: finalSynth.executive_summary, sourceType: 'internal', category: 'synthesis' }).catch(() => {})
  }

  await logTrace({ jobId, agentName: 'orchestrator', step: 'completed', outputSummary: `qa=${fullQA.score_geral} src=${(research.sources || []).length} html=${!!htmlReg.public_url}`, durationMs: Date.now() - t0 })
  tel.info('orchestrator', 'done', { ms: Date.now() - t0, qa: fullQA.score_geral, status: fullQA.status, html_url: htmlReg.public_url })
}
