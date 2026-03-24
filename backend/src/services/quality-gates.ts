/**
 * QUALITY GATES — Camada 10 da Arquitetura ORBIT 2026
 * 3 gates em pontos críticos do pipeline:
 *   Gate 1 — Evidência (pré-análise): cobertura, recência, diversidade
 *   Gate 2 — Síntese (pós-análise): factualidade, coerência, rastreabilidade
 *   Gate 3 — Artefato (pós-síntese): clareza, completude, utilidade, custo
 *
 * Cada gate tem threshold de aprovação e repair_action se reprovado.
 */
import OpenAI from 'openai'
import { tel } from '../utils/telemetry'
import type { LedgerReport } from './evidence-ledger'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface GateResult {
  gate: 'evidence' | 'synthesis' | 'artifact'
  passed: boolean
  score: number          // 0–10
  scores_by_dimension: Record<string, number>
  issues: string[]
  repair_action: string | null
  repair_target: string | null // qual agente deve corrigir
}

export interface FullQAReport {
  gate1_evidence: GateResult
  gate2_synthesis: GateResult
  gate3_artifact: GateResult
  score_geral: number       // média ponderada dos 3 gates
  status: 'aprovado' | 'reprovado_parcial' | 'reprovado'
  all_issues: string[]
  repair_needed: boolean
  repair_sequence: Array<{ gate: string; action: string; target: string }>
}

// ─── GATE 1 — EVIDÊNCIA ───────────────────────────────────────────────────────
// Execução: pré-análise, após Retrieval Fabric e Evidence Ledger

export function runGate1Evidence(ledger: LedgerReport, plan: any): GateResult {
  const dims: Record<string, number> = {}
  const issues: string[] = []

  // Cobertura: fontes únicas (máx 10)
  dims.cobertura = Math.min(ledger.unique * 2, 10)
  if (ledger.unique < 2) issues.push(`Fontes insuficientes: ${ledger.unique}`)

  // Recência: freshness médio
  dims.recencia = Math.round(ledger.avg_freshness * 10)
  if (ledger.avg_freshness < 0.4) issues.push(`Fontes desatualizadas: freshness=${ledger.avg_freshness}`)

  // Confiança média
  dims.confianca = Math.round(ledger.avg_confidence * 10)
  if (ledger.avg_confidence < 0.5) issues.push(`Confiança baixa: ${ledger.avg_confidence}`)

  // Conflitos (penaliza severamente)
  const conflictRate = ledger.unique > 0 ? ledger.conflicts / ledger.unique : 0
  dims.harmonia = conflictRate > 0.5 ? 3 : conflictRate > 0.2 ? 6 : 10
  if (conflictRate > 0.5) issues.push(`Taxa de conflito alta: ${Math.round(conflictRate * 100)}%`)

  // Diversidade de tipos de fonte
  dims.diversidade = ledger.unique >= 3 ? 10 : ledger.unique >= 2 ? 6 : 3

  const score = Math.round(
    (dims.cobertura + dims.recencia + dims.confianca + dims.harmonia + dims.diversidade) / 5
  )
  const passed = score >= 6

  return {
    gate: 'evidence',
    passed,
    score,
    scores_by_dimension: dims,
    issues,
    repair_action: passed ? null : (ledger.unique < 2 ? 'ampliar_pesquisa' : 'filtrar_desatualizados'),
    repair_target: passed ? null : 'research_agent'
  }
}

// ─── GATE 2 — SÍNTESE ─────────────────────────────────────────────────────────
// Execução: pós-síntese, antes da geração de artefato

export async function runGate2Synthesis(synthesis: any, ledger: LedgerReport): Promise<GateResult> {
  const start = Date.now()
  const synText = JSON.stringify(synthesis).substring(0, 3000)
  const numSources = ledger.unique

  const prompt = `Avalie esta síntese em 4 dimensões (0-10). Retorne JSON:
{
  "factualidade": 0-10,
  "coerencia": 0-10,
  "rastreabilidade": 0-10,
  "clareza": 0-10,
  "issues": ["problema1", "problema2"]
}

Critérios:
- factualidade: afirmações são verificáveis e não extrapolam as fontes?
- coerencia: texto é internamente consistente, sem contradições?
- rastreabilidade: ${numSources} fontes disponíveis — conclusões se ancoram nelas?
- clareza: linguagem precisa, sem ambiguidade?

SÍNTESE: ${synText}`

  let dims: Record<string, number> = { factualidade: 7, coerencia: 7, rastreabilidade: 7, clareza: 7 }
  let llm_issues: string[] = []

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 400
    })
    const parsed = JSON.parse(res.choices[0].message.content || '{}')
    dims = { factualidade: parsed.factualidade || 7, coerencia: parsed.coerencia || 7, rastreabilidade: parsed.rastreabilidade || 7, clareza: parsed.clareza || 7 }
    llm_issues = parsed.issues || []
  } catch (e) {
    tel.error('gate2', 'llm_failed', e)
  }

  const score = Math.round((dims.factualidade + dims.coerencia + dims.rastreabilidade + dims.clareza) / 4)
  const passed = score >= 6

  const issues = [...llm_issues]
  if (dims.factualidade < 6) issues.push('Factualidade insuficiente — possível extrapolação')
  if (dims.rastreabilidade < 6) issues.push('Rastreabilidade baixa — afirmações sem âncora nas fontes')

  return {
    gate: 'synthesis',
    passed,
    score,
    scores_by_dimension: dims,
    issues,
    repair_action: passed ? null : 'reescrever_sintese',
    repair_target: passed ? null : 'synthesizer'
  }
}

// ─── GATE 3 — ARTEFATO ────────────────────────────────────────────────────────
// Execução: pós-geração de artefato, antes da entrega final

export async function runGate3Artifact(params: {
  artifact: any
  durationMs: number
  tokensUsed?: number
  plan?: any
}): Promise<GateResult> {
  const artText = JSON.stringify(params.artifact).substring(0, 3000)
  const latencySec = params.durationMs / 1000
  const estimatedCostUSD = ((params.tokensUsed || 0) / 1_000_000) * 5 // GPT-4o ~$5/M tokens

  const prompt = `Avalie este artefato final em 5 dimensões (0-10). Retorne JSON:
{
  "utilidade": 0-10,
  "completude": 0-10,
  "legibilidade": 0-10,
  "estrutura": 0-10,
  "acionabilidade": 0-10,
  "issues": ["problema1"]
}
ARTEFATO: ${artText}`

  let dims: Record<string, number> = { utilidade: 7, completude: 7, legibilidade: 7, estrutura: 7, acionabilidade: 7 }
  let llm_issues: string[] = []

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 350
    })
    const parsed = JSON.parse(res.choices[0].message.content || '{}')
    dims = { utilidade: parsed.utilidade || 7, completude: parsed.completude || 7, legibilidade: parsed.legibilidade || 7, estrutura: parsed.estrutura || 7, acionabilidade: parsed.acionabilidade || 7 }
    llm_issues = parsed.issues || []
  } catch (e) {
    tel.error('gate3', 'llm_failed', e)
  }

  // Penalidade de latência (> 90s = -1 ponto)
  dims.latencia = latencySec <= 30 ? 10 : latencySec <= 60 ? 8 : latencySec <= 90 ? 6 : 4

  // Penalidade de custo (> $0.50 = -2 pontos)
  dims.custo = estimatedCostUSD <= 0.05 ? 10 : estimatedCostUSD <= 0.20 ? 8 : estimatedCostUSD <= 0.50 ? 6 : 4

  const score = Math.round(
    (dims.utilidade + dims.completude + dims.legibilidade + dims.estrutura + dims.acionabilidade + dims.latencia + dims.custo) / 7
  )
  const passed = score >= 6

  return {
    gate: 'artifact',
    passed,
    score,
    scores_by_dimension: dims,
    issues: llm_issues,
    repair_action: passed ? null : 'refinar_artefato',
    repair_target: passed ? null : 'synthesizer'
  }
}

// ─── Consolidador dos 3 Gates ─────────────────────────────────────────────────

export function consolidateQA(g1: GateResult, g2: GateResult, g3: GateResult): FullQAReport {
  // Peso: Evidência 25%, Síntese 35%, Artefato 40%
  const score_geral = Math.round(g1.score * 0.25 + g2.score * 0.35 + g3.score * 0.40)

  const all_issues = [...g1.issues, ...g2.issues, ...g3.issues]

  const repair_sequence = [g1, g2, g3]
    .filter(g => !g.passed && g.repair_action)
    .map(g => ({ gate: g.gate, action: g.repair_action!, target: g.repair_target! }))

  const allPassed = g1.passed && g2.passed && g3.passed
  const nonePassed = !g1.passed && !g2.passed && !g3.passed
  const status: FullQAReport['status'] = allPassed
    ? 'aprovado' : nonePassed
    ? 'reprovado' : 'reprovado_parcial'

  return {
    gate1_evidence: g1,
    gate2_synthesis: g2,
    gate3_artifact: g3,
    score_geral,
    status,
    all_issues,
    repair_needed: repair_sequence.length > 0,
    repair_sequence
  }
}
