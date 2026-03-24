/**
 * ORCHESTRATOR — ORBIT 2026 — 13 Camadas com 3 Quality Gates
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
import { saveEpisodicMemory } from '../services/memory'
import { tel, setJobContext } from '../utils/telemetry'

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
  let totalTokens = 0

  const { data: cmd } = await supabase.from('commands').select('payload,user_id').eq('id', command_id).single()
  if (!cmd) throw new Error('Command nao encontrado: ' + command_id)

  const text: string = cmd.payload?.text || ''
  const telegramId: number = cmd.payload?.telegram_id
  tel.info('orchestrator', 'started', { len: text.length })

  // Gate de segurança — Intake Router
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

  // Pesquisa
  await tg(chat_id, 'Pesquisando fontes...')
  const research = await runResearchAgent({ jobId, query: text, plan })

  // Evidence Ledger
  const ledger = await buildEvidenceLedger({ jobId, sources: research.sources || [] })

  // GATE 1 — Evidencia
  const gate1 = runEvidenceGate(ledger)
  tel.info('orchestrator', 'gate1', { passed: gate1.passed, score: gate1.score })
  if (!gate1.passed && gate1.repair_action === 'ampliar_pesquisa') {
    await tg(chat_id, 'Ampliando pesquisa...')
    const r2 = await runResearchAgent({ jobId, query: text + ' dados recentes', plan: { ...plan, max_branches: 6 } })
    research.sources = [...(research.sources || []), ...(r2.sources || [])]
  }

  // Analise
  await tg(chat_id, 'Analisando evidencias...')
  const analysis = await runAnalysisAgent({ jobId, research, plan })
  const synthesis = await runSynthesizer({ jobId, analysis, plan })

  // GATE 2 — Sintese
  const gate2 = await runGate2Synthesis(synthesis, ledger)
  tel.info('orchestrator', 'gate2', { passed: gate2.passed, score: gate2.score })
  const finalSynth = (!gate2.passed)
    ? await runSynthesizer({ jobId, analysis: { ...analysis, _repair: gate2.issues.join('; ') }, plan })
    : synthesis

  // QA 9 dimensoes
  const elapsedMs = Date.now() - t0
  const qa9 = await runQualityReviewer({ jobId, artifact: finalSynth, plan, durationMs: elapsedMs, tokensUsed: totalTokens })

  // GATE 3 — Artefato
  const gate3 = await runGate3Artifact({ artifact: finalSynth, durationMs: elapsedMs, tokensUsed: totalTokens, plan })
  const fullQA = consolidateQA(gate1, gate2, gate3)

  await updateJobStatus(jobId, 'completed', {
    result: { type: intake.expected_output, synthesis: finalSynth, qa: qa9, full_qa: fullQA, ledger_summary: { total: ledger.total, unique: ledger.unique, conflicts: ledger.conflicts, avg_freshness: ledger.avg_freshness } },
    quality_score: fullQA.score_geral
  })

  const summary = (finalSynth.executive_summary || '').substring(0, 850)
  const emoji = fullQA.status === 'aprovado' ? 'Analise concluida!' : 'Analise concluida com ressalvas.'
  await tg(chat_id, `${emoji}\n\n${summary}\n\nScore: ${fullQA.score_geral}/10 | Fontes: ${ledger.unique} | Tempo: ${Math.round(elapsedMs/1000)}s`)

  if (fullQA.repair_needed) {
    await tg(chat_id, 'Melhorias identificadas:\n' + fullQA.repair_sequence.map(r => `- ${r.gate}: ${r.action}`).join('\n'))
  }

  if (cmd.user_id && telegramId) {
    await saveEpisodicMemory({ userProfileId: cmd.user_id, telegramId, role: 'assistant', content: summary, intent: intake.intent, jobId })
  }

  await logTrace({ jobId, agentName: 'orchestrator', step: 'completed', outputSummary: `qa=${fullQA.score_geral} src=${ledger.unique} status=${fullQA.status}`, durationMs: Date.now() - t0 })
  tel.info('orchestrator', 'done', { ms: Date.now() - t0, qa: fullQA.score_geral, status: fullQA.status })
}
