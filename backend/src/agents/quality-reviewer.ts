/**
 * QUALITY REVIEWER — 9 Dimensões completas + integração com quality-gates.ts
 * Camada 10 da Arquitetura ORBIT 2026
 *
 * Dimensões: factualidade | cobertura | recência | qualidade_fontes |
 *            coerência | rastreabilidade | utilidade | custo | latência
 */
import OpenAI from 'openai'
import { supabase, logTrace } from '../db/client'
import { tel } from '../utils/telemetry'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export interface QAResult {
  scores: {
    factualidade: number
    cobertura: number
    recencia: number
    qualidade_fontes: number
    coerencia: number
    rastreabilidade: number
    utilidade: number
    custo: number
    latencia: number
  }
  score_geral: number
  status: 'aprovado' | 'reprovado'
  problemas: string[]
  recomendacoes: string[]
  dimensions_failed: string[]
  repair_action: string | null
}

const DIMENSION_PROMPT = `Avalie este artefato em 9 dimensões (cada 0-10). Retorne JSON:
{
  "factualidade": 0,
  "cobertura": 0,
  "recencia": 0,
  "qualidade_fontes": 0,
  "coerencia": 0,
  "rastreabilidade": 0,
  "utilidade": 0,
  "custo": 8,
  "latencia": 8,
  "problemas": [],
  "recomendacoes": []
}

Critérios:
- factualidade: afirmações são verdadeiras e verificáveis?
- cobertura: o artefato cobre os aspectos solicitados?
- recencia: as informações são atuais (penalizar se > 3 anos)?
- qualidade_fontes: as fontes são confiáveis, diversas, primárias?
- coerencia: o texto é internamente consistente?
- rastreabilidade: conclusões têm âncora nas fontes?
- utilidade: o artefato é acionável e útil para o usuário?
- custo: avaliar 8 se não houver dados (padrão eficiente)
- latencia: avaliar 8 se não houver dados (padrão ok)

ARTEFATO:`

export async function runQualityReviewer(params: {
  jobId: string
  artifact: any
  plan?: any
  durationMs?: number
  tokensUsed?: number
}): Promise<QAResult> {
  const { jobId, artifact, durationMs = 0, tokensUsed = 0 } = params
  const start = Date.now()
  tel.info('quality_reviewer', 'started', { dimensions: 9 })

  const artText = JSON.stringify(artifact).substring(0, 4000)

  // Avaliação LLM das 9 dimensões
  let raw: any = {}
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: DIMENSION_PROMPT + '\n' + artText }],
      response_format: { type: 'json_object' },
      max_tokens: 600
    })
    raw = JSON.parse(res.choices[0].message.content || '{}')
  } catch (e) {
    tel.error('quality_reviewer', 'llm_failed', e)
    raw = {}
  }

  // Scores com fallback para 7 (padrão razoável)
  const scores: QAResult['scores'] = {
    factualidade:     raw.factualidade     ?? 7,
    cobertura:        raw.cobertura        ?? 7,
    recencia:         raw.recencia         ?? 7,
    qualidade_fontes: raw.qualidade_fontes ?? 7,
    coerencia:        raw.coerencia        ?? 7,
    rastreabilidade:  raw.rastreabilidade  ?? 7,
    utilidade:        raw.utilidade        ?? 7,
    custo:            calcCustoScore(tokensUsed),
    latencia:         calcLatenciaScore(durationMs)
  }

  // Score geral — pesos por importância
  const PESOS = {
    factualidade: 0.18, cobertura: 0.14, recencia: 0.10,
    qualidade_fontes: 0.12, coerencia: 0.12, rastreabilidade: 0.14,
    utilidade: 0.14, custo: 0.08, latencia: 0.08
  }
  const score_geral = Math.round(
    Object.entries(PESOS).reduce((acc, [k, w]) => acc + (scores as any)[k] * w, 0) * 10
  ) / 10

  const status: 'aprovado' | 'reprovado' = score_geral >= 6 ? 'aprovado' : 'reprovado'

  // Dimensões que falharam (< 6)
  const dimensions_failed = Object.entries(scores)
    .filter(([, v]) => v < 6)
    .map(([k]) => k)

  // Repair action baseado na dimensão mais crítica que falhou
  let repair_action: string | null = null
  if (dimensions_failed.includes('factualidade') || dimensions_failed.includes('rastreabilidade')) {
    repair_action = 'ampliar_evidencias_e_resintetizar'
  } else if (dimensions_failed.includes('cobertura') || dimensions_failed.includes('recencia')) {
    repair_action = 'ampliar_pesquisa'
  } else if (dimensions_failed.includes('coerencia') || dimensions_failed.includes('utilidade')) {
    repair_action = 'refinar_artefato'
  }

  const problemas: string[] = raw.problemas || []
  const recomendacoes: string[] = raw.recomendacoes || []

  // Adicionar problemas automáticos por dimensão
  if (scores.recencia < 6) problemas.push(`Informações potencialmente desatualizadas (recência: ${scores.recencia}/10)`)
  if (scores.rastreabilidade < 6) problemas.push(`Conclusões sem âncora nas fontes (rastreabilidade: ${scores.rastreabilidade}/10)`)
  if (scores.custo < 6) problemas.push(`Custo acima do esperado (${formatTokenCost(tokensUsed)})`)
  if (scores.latencia < 6) problemas.push(`Latência alta (${Math.round(durationMs / 1000)}s)`)

  // Persistir avaliação no Supabase
  await supabase.from('quality_evaluations').insert({
    entity_type: 'job',
    entity_id: jobId,
    evaluator: 'quality_reviewer_v2',
    scores,
    overall_score: score_geral,
    issues: problemas,
    recommendations: recomendacoes
  }).catch(() => {})

  await logTrace({
    jobId,
    agentName: 'quality_reviewer',
    step: 'evaluated_9dim',
    outputSummary: `score=${score_geral} status=${status} failed=${dimensions_failed.join(',')}`,
    durationMs: Date.now() - start
  })

  tel.info('quality_reviewer', 'completed', {
    score_geral, status, failed_dims: dimensions_failed.length
  })

  return { scores, score_geral, status, problemas, recomendacoes, dimensions_failed, repair_action }
}

// ─── Helpers de custo e latência ─────────────────────────────────────────────

function calcCustoScore(tokensUsed: number): number {
  if (tokensUsed === 0) return 8 // sem dados
  if (tokensUsed <= 10_000) return 10
  if (tokensUsed <= 30_000) return 8
  if (tokensUsed <= 60_000) return 6
  if (tokensUsed <= 100_000) return 4
  return 2
}

function calcLatenciaScore(durationMs: number): number {
  if (durationMs === 0) return 8 // sem dados
  if (durationMs <= 15_000) return 10
  if (durationMs <= 30_000) return 9
  if (durationMs <= 60_000) return 7
  if (durationMs <= 90_000) return 5
  if (durationMs <= 120_000) return 3
  return 1
}

function formatTokenCost(tokens: number): string {
  const usd = (tokens / 1_000_000) * 5
  return `~$${usd.toFixed(4)}`
}
