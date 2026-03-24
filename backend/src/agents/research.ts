/**
 * RESEARCH AGENT — Camada 5 (agora integrado com Retrieval Fabric)
 * Web + Social (Reddit) + Academic (OpenAlex)
 */
import OpenAI from 'openai'
import { supabase } from '../db/client'
import { normalizeAndStore, analyzeCoverage } from '../services/evidence-normalizer'
import { runRetrievalFabric } from '../services/retrieval-fabric'
import { tel } from '../utils/telemetry'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

interface ResearchParams { jobId: string; query: string; plan: any }

export async function runResearchAgent({ jobId, query, plan }: ResearchParams) {
  const start = Date.now()
  tel.info('research', 'started', { query_len: query.length, depth: plan?.depth })

  // Decomposição em subconsultas
  const decomp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'Decomponha em 3-5 subconsultas de pesquisa web. JSON: {"subconsultas":["..."]}. Query: ' + query }],
    response_format: { type: 'json_object' }, max_tokens: 400
  })
  const { subconsultas = [query] } = JSON.parse(decomp.choices[0].message.content || '{"subconsultas":[]}')

  // Pesquisa web principal via Responses API
  const webSources: any[] = []
  for (const sub of (subconsultas as string[]).slice(0, plan?.max_branches || 3)) {
    try {
      const res = await (openai as any).responses.create({
        model: 'gpt-4o-mini', tools: [{ type: 'web_search_preview' }], input: sub
      })
      const text: string = res.output_text || ''
      if (text.length > 50) {
        webSources.push({ url: 'web:' + sub.substring(0, 30), title: sub, snippet: text.substring(0, 700), type: 'web', relevance: 0.8 })
      }
    } catch (e) { tel.error('research', 'web_error', e, { sub }) }
  }

  // Retrieval Fabric — Social + Academic
  const fabric = await runRetrievalFabric({ query, plan, webSources })
  const allSources = fabric.all

  // Persistir report
  const { data: report } = await supabase.from('research_reports').insert({
    created_from_job_id: jobId, topic: query, status: 'completed', mode: plan?.depth || 'medium',
    confidence: 'medium', main_answer: allSources.map(s => s.snippet).join('\n\n').substring(0, 6000)
  }).select().single()

  const reportId = report?.id
  const evidence = reportId
    ? await normalizeAndStore({ researchId: reportId, jobId, sources: allSources })
    : []

  const coverage = analyzeCoverage(evidence, query)
  tel.info('research', 'completed', {
    web: webSources.length, social: fabric.social.length, academic: fabric.academic.length,
    total: allSources.length, coverage: Math.round(coverage * 100), ms: Date.now() - start
  })

  return { reportId, sources: allSources, evidence, coverage, subconsultas, fabric }
}
