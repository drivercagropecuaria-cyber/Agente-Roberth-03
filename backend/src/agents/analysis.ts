import OpenAI from 'openai'
import { tel } from '../utils/telemetry'
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function runAnalysisAgent({ jobId, research, plan }: any) {
  const start = Date.now()
  tel.info('analysis', 'started', { sources: research.sources?.length || 0 })
  const context = (research.sources || []).map((s: any) => s.snippet).join('\n\n').substring(0, 8000)
  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: `Analise as evidências e produza JSON:
{ "convergencias":[], "divergencias":[], "gaps":[], "implicacoes":[],
  "swot":{"forcas":[],"fraquezas":[],"oportunidades":[],"ameacas":[]},
  "fatos_verificados":[], "inferencias":[], "opiniao":[], "score_confianca":0 }
EVIDÊNCIAS:\n${context}` }],
    response_format: { type: 'json_object' }, max_tokens: 2000
  })
  const analysis = JSON.parse(res.choices[0].message.content || '{}')
  tel.info('analysis', 'completed', { ms: Date.now() - start, tokens: res.usage?.total_tokens })
  return analysis
}
