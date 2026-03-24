/**
 * WORKFLOW STEPS — Pipeline ORBIT como steps declarativos
 * Cada camada da arquitetura vira um WorkflowStep tipado.
 * Isso permite: retomada, rollback, timeout por step, e human-in-the-loop.
 */
import type { WorkflowDefinition, WorkflowStep, StepContext, StepResult } from './engine'
import { routeIntake, persistIntakeDecision } from '../services/intake-router'
import { generatePlan } from '../agents/planner'
import { runResearchAgent } from '../agents/research'
import { buildEvidenceLedger, runEvidenceGate } from '../services/evidence-ledger'
import { runAnalysisAgent } from '../agents/analysis'
import { runSynthesizer } from '../agents/synthesizer'
import { runQualityReviewer } from '../agents/quality-reviewer'
import { runGate2Synthesis, runGate3Artifact, consolidateQA } from '../services/quality-gates'
import { buildHtmlPresentation, buildDashboardCard, buildTelegramSummary } from '../services/artifact-generator'
import { registerArtifact } from '../services/artifact-registry'
import { saveEpisodicMemory } from '../services/memory'
import { indexResearchSources, persistKnowledgeItem } from '../services/embeddings'
import { createApprovalRequest } from './human-approval'
import { supabase } from '../db/client'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

async function tg(chatId: number | undefined, text: string) {
  const tok = process.env.TELEGRAM_BOT_TOKEN
  if (!tok || !chatId) return
  await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
  }).catch(() => {})
}

// ─── STEP 1: Carregar command ─────────────────────────────────────────────────

const stepLoadCommand: WorkflowStep = {
  name: 'load_command',
  required: true,
  async run(ctx): Promise<StepResult> {
    const { data: cmd } = await supabase.from('commands').select('payload,user_id').eq('id', ctx.state.command_id as string).single()
    if (!cmd) throw new Error('Command não encontrado: ' + ctx.state.command_id)
    return { status: 'completed', output: { command: cmd, text: cmd.payload?.text || '', telegram_id: cmd.payload?.telegram_id, user_id: cmd.user_id } }
  }
}

// ─── STEP 2: Intake Router + Policy Gate ─────────────────────────────────────

const stepIntake: WorkflowStep = {
  name: 'intake_policy',
  required: true,
  async run(ctx): Promise<StepResult> {
    const text = ctx.state.text as string
    const intake = routeIntake(text)
    await persistIntakeDecision(ctx.jobId, intake)

    if (intake.requires_human) {
      const { token } = await createApprovalRequest({
        jobId: ctx.jobId, chatId: ctx.chatId!, stepName: 'intake_policy',
        reason: 'Solicitação classificada como sensível pelo Risk Gate',
        context: { intent: intake.intent, text: text.substring(0, 200) }
      })
      return { status: 'awaiting_human', output: { intake }, interrupt_reason: 'Risk Gate: aprovação necessária', approval_token: token }
    }

    return { status: 'completed', output: { intake } }
  }
}

// ─── STEP 3: Resposta rápida (short-circuit) ──────────────────────────────────

const stepQuickAnswer: WorkflowStep = {
  name: 'quick_answer',
  required: false, // skip se não for quick_answer
  async run(ctx): Promise<StepResult> {
    const intake = ctx.state.intake as any
    if (intake?.intent !== 'quick_answer') {
      return { status: 'completed', output: { quick_answer_skipped: true } }
    }
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini', messages: [{ role: 'user', content: ctx.state.text as string }], max_tokens: 800
    })
    const answer = res.choices[0].message.content || 'Não consegui processar.'
    await tg(ctx.chatId, answer)
    return { status: 'completed', output: { quick_answer: answer, workflow_done: true } }
  }
}

// ─── STEP 4: Planner ──────────────────────────────────────────────────────────

const stepPlanner: WorkflowStep = {
  name: 'planner',
  required: true,
  timeout_ms: 30_000,
  async run(ctx): Promise<StepResult> {
    const intake = ctx.state.intake as any
    if (ctx.state.quick_answer) return { status: 'completed', output: {} }
    const plan = await generatePlan({
      jobId: ctx.jobId, userText: ctx.state.text as string,
      intent: intake?.intent, depth: intake?.depth,
      maxBranches: intake?.max_branches, maxTokens: intake?.max_tokens
    })
    return { status: 'completed', output: { plan } }
  }
}

// ─── STEP 5: Retrieval Fabric ─────────────────────────────────────────────────

const stepResearch: WorkflowStep = {
  name: 'retrieval_fabric',
  required: true,
  timeout_ms: 120_000,
  async run(ctx): Promise<StepResult> {
    if (ctx.state.workflow_done) return { status: 'completed', output: {} }
    await tg(ctx.chatId, '🔍 *Pesquisando fontes* (web + social + acadêmico)...')
    const research = await runResearchAgent({ jobId: ctx.jobId, query: ctx.state.text as string, plan: ctx.state.plan })
    return { status: 'completed', output: { research } }
  },
  async compensate(ctx) {
    // Limpar dados de pesquisa parciais se passo posterior falhar
    await supabase.from('research_reports').delete().eq('created_from_job_id', ctx.jobId).eq('status', 'partial')
  }
}

// ─── STEP 6: Evidence Ledger + Gate 1 ────────────────────────────────────────

const stepEvidenceLedger: WorkflowStep = {
  name: 'evidence_ledger',
  required: true,
  async run(ctx): Promise<StepResult> {
    if (ctx.state.workflow_done) return { status: 'completed', output: {} }
    const research = ctx.state.research as any
    const ledger = await buildEvidenceLedger({ jobId: ctx.jobId, sources: research?.sources || [] })
    const gate1 = runEvidenceGate(ledger)

    // Ampliar pesquisa automaticamente se Gate 1 falhar por poucas fontes
    if (!gate1.passed && gate1.repair_action === 'ampliar_pesquisa') {
      await tg(ctx.chatId, '🔄 Ampliando pesquisa...')
      const r2 = await runResearchAgent({ jobId: ctx.jobId, query: (ctx.state.text as string) + ' dados recentes', plan: { ...ctx.state.plan, max_branches: 6, depth: 'deep' } })
      const allSources = [...(research?.sources || []), ...(r2.sources || [])]
      const ledger2 = await buildEvidenceLedger({ jobId: ctx.jobId, sources: allSources })
      const gate1b = runEvidenceGate(ledger2)
      return { status: 'completed', output: { ledger: ledger2, gate1: gate1b, research: { ...research, sources: allSources } } }
    }

    return { status: 'completed', output: { ledger, gate1 } }
  }
}

// ─── STEP 7: Análise ──────────────────────────────────────────────────────────

const stepAnalysis: WorkflowStep = {
  name: 'analysis',
  required: true,
  timeout_ms: 90_000,
  async run(ctx): Promise<StepResult> {
    if (ctx.state.workflow_done) return { status: 'completed', output: {} }
    await tg(ctx.chatId, '🧠 *Analisando evidências...*')
    const analysis = await runAnalysisAgent({ jobId: ctx.jobId, research: ctx.state.research, plan: ctx.state.plan })
    return { status: 'completed', output: { analysis } }
  }
}

// ─── STEP 8: Síntese + Gate 2 ────────────────────────────────────────────────

const stepSynthesis: WorkflowStep = {
  name: 'synthesis',
  required: true,
  timeout_ms: 90_000,
  async run(ctx): Promise<StepResult> {
    if (ctx.state.workflow_done) return { status: 'completed', output: {} }
    const synthesis = await runSynthesizer({ jobId: ctx.jobId, analysis: ctx.state.analysis, plan: ctx.state.plan })
    const gate2 = await runGate2Synthesis(synthesis, ctx.state.ledger as any)

    const finalSynth = !gate2.passed
      ? await runSynthesizer({ jobId: ctx.jobId, analysis: { ...ctx.state.analysis, _repair: (gate2.issues || []).join('; ') }, plan: ctx.state.plan })
      : synthesis

    return { status: 'completed', output: { synthesis: finalSynth, gate2 } }
  }
}

// ─── STEP 9: QA 9 Dimensões + Gate 3 ─────────────────────────────────────────

const stepQA: WorkflowStep = {
  name: 'quality_review',
  required: true,
  async run(ctx): Promise<StepResult> {
    if (ctx.state.workflow_done) return { status: 'completed', output: {} }
    const elapsedMs = Date.now() - (ctx.state._start_ms as number || Date.now())
    const qa9 = await runQualityReviewer({ jobId: ctx.jobId, artifact: ctx.state.synthesis, plan: ctx.state.plan, durationMs: elapsedMs })
    const gate3 = await runGate3Artifact({ artifact: ctx.state.synthesis, durationMs: elapsedMs, plan: ctx.state.plan })
    const fullQA = consolidateQA(ctx.state.gate1 as any, ctx.state.gate2 as any, gate3)
    return { status: 'completed', output: { qa9, gate3, fullQA } }
  }
}

// ─── STEP 10: Geração de Artefatos ───────────────────────────────────────────

const stepArtifacts: WorkflowStep = {
  name: 'artifact_generation',
  required: false, // falha não aborta — entrega síntese de texto
  timeout_ms: 60_000,
  async run(ctx): Promise<StepResult> {
    if (ctx.state.workflow_done) return { status: 'completed', output: {} }
    await tg(ctx.chatId, '📄 *Gerando apresentação...*')

    const research = ctx.state.research as any
    const htmlContent = buildHtmlPresentation({
      jobId: ctx.jobId, query: ctx.state.text as string,
      synthesis: ctx.state.synthesis, sources: research?.sources || [],
      qaReport: ctx.state.qa9, ledgerReport: ctx.state.ledger
    })
    const cardJson = buildDashboardCard({
      jobId: ctx.jobId, synthesis: ctx.state.synthesis,
      qaScore: (ctx.state.fullQA as any)?.score_geral || 0, sourcesCount: (research?.sources || []).length
    })

    const [htmlReg, jsonReg] = await Promise.all([
      registerArtifact({ jobId: ctx.jobId, type: 'html', content: htmlContent, qaScore: (ctx.state.fullQA as any)?.score_geral || 0, sourcesCount: (research?.sources || []).length }),
      registerArtifact({ jobId: ctx.jobId, type: 'json', content: JSON.stringify(cardJson, null, 2), qaScore: (ctx.state.fullQA as any)?.score_geral || 0, sourcesCount: (research?.sources || []).length })
    ])

    return { status: 'completed', output: { htmlReg, jsonReg } }
  }
}

// ─── STEP 11: Entrega + Memória + KB ────────────────────────────────────────

const stepDelivery: WorkflowStep = {
  name: 'delivery',
  required: true,
  async run(ctx): Promise<StepResult> {
    const research = ctx.state.research as any
    const fullQA = ctx.state.fullQA as any
    const htmlReg = ctx.state.htmlReg as any

    if (ctx.state.quick_answer) {
      return { status: 'completed', output: { delivered: true } }
    }

    const telegramSummary = buildTelegramSummary(ctx.state.synthesis, fullQA?.score_geral || 0, (research?.sources || []).length)
    const emoji = fullQA?.status === 'aprovado' ? '✅' : fullQA?.status === 'reprovado_parcial' ? '⚠️' : '❌'
    await tg(ctx.chatId, `${emoji} *Análise concluída!*\n\n${telegramSummary}`)

    if (htmlReg?.public_url) {
      await tg(ctx.chatId, `📊 *Apresentação completa:*\n${htmlReg.public_url}`)
    }
    if (fullQA?.repair_needed) {
      const repairs = (fullQA.repair_sequence || []).map((r: any) => `• ${r.gate}: ${r.action}`).join('\n')
      await tg(ctx.chatId, `⚠️ *Melhorias identificadas:*\n${repairs}`)
    }

    // Memória episódica
    const command = ctx.state.command as any
    if (command?.user_id && ctx.telegramId) {
      await saveEpisodicMemory({ userProfileId: command.user_id, telegramId: ctx.telegramId, role: 'assistant', content: telegramSummary.substring(0, 500), intent: (ctx.state.intake as any)?.intent, jobId: ctx.jobId })
    }

    // Indexar na Knowledge Base (async)
    indexResearchSources({ jobId: ctx.jobId, sources: research?.sources || [] }).catch(() => {})
    const synth = ctx.state.synthesis as any
    if (synth?.executive_summary) {
      persistKnowledgeItem({ jobId: ctx.jobId, title: (ctx.state.text as string).substring(0, 100), content: synth.executive_summary, sourceType: 'internal', category: 'synthesis' }).catch(() => {})
    }

    return { status: 'completed', output: { delivered: true, telegram_summary: telegramSummary } }
  }
}

// ─── DEFINIÇÃO COMPLETA DO WORKFLOW ORBIT ────────────────────────────────────

export const ORBIT_WORKFLOW: WorkflowDefinition = {
  name: 'orbit_main',
  version: '2026.G',
  steps: [
    stepLoadCommand,
    stepIntake,
    stepQuickAnswer,
    stepPlanner,
    stepResearch,
    stepEvidenceLedger,
    stepAnalysis,
    stepSynthesis,
    stepQA,
    stepArtifacts,
    stepDelivery,
  ]
}
