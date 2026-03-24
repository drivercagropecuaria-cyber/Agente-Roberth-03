import OpenAI from 'openai'
import { supabase } from '../db/client'
import { tel } from '../utils/telemetry'
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function runSynthesizer({ jobId, analysis, plan }: any) {
  const start = Date.now()
  tel.info('synthesizer', 'started', {})
  const analysisText = JSON.stringify(analysis).substring(0, 6000)
  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: `Produza síntese profissional em português. JSON:
{ "executive_summary":"200-400 palavras", "key_findings":[], "conclusion":"100-200 palavras", "recommendations":[] }
ANÁLISE: ${analysisText}` }],
    response_format: { type: 'json_object' }, max_tokens: 2500
  })
  const synthesis = JSON.parse(res.choices[0].message.content || '{}')
  if (synthesis.executive_summary) {
    await supabase.from('dossiers').insert({
      executive_summary: synthesis.executive_summary, key_findings: synthesis.key_findings,
      conclusion: synthesis.conclusion, status: 'completed', confidence: 'medium', coverage_score: 70
    })
  }
  tel.info('synthesizer', 'completed', { ms: Date.now() - start })
  return synthesis
}
