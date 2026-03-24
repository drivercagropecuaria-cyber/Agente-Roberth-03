import OpenAI from 'openai'
import { supabase, logTrace } from '../db/client'
import { tel } from '../utils/telemetry'
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function runQualityReviewer({ jobId, artifact, plan }: any) {
  const start = Date.now()
  tel.info('quality', 'started', {})
  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: `Avalie (0-10 cada dimensão). JSON:
{ "scores":{"factualidade":0,"cobertura":0,"coerencia":0,"utilidade":0,"qualidade_fontes":0},
  "score_geral":0.0, "status":"aprovado|reprovado", "problemas":[], "recomendacoes":[] }
ARTEFATO: ${JSON.stringify(artifact).substring(0,3000)}` }],
    response_format: { type: 'json_object' }, max_tokens: 600
  })
  const qa = JSON.parse(res.choices[0].message.content || '{"score_geral":5,"status":"aprovado","scores":{},"problemas":[],"recomendacoes":[]}')
  await supabase.from('quality_evaluations').insert({
    entity_type: 'job', entity_id: jobId, evaluator: 'quality_reviewer',
    scores: qa.scores, overall_score: qa.score_geral,
    issues: qa.problemas, recommendations: qa.recomendacoes
  })
  await logTrace({ jobId, agentName: 'quality_reviewer', step: 'evaluated', outputSummary: 'score=' + qa.score_geral, durationMs: Date.now() - start })
  tel.info('quality', 'completed', { score: qa.score_geral })
  return qa
}
