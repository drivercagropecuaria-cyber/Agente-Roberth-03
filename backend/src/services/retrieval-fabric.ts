/**
 * RETRIEVAL FABRIC — Adaptadores especializados
 * Camada 5 da Arquitetura ORBIT 2026
 *
 * Social Adapter  → Reddit via web_search contextualizado
 * Academic Adapter → OpenAlex (API pública, sem auth) + Semantic Scholar fallback
 * Internal Adapter → Knowledge Base do Supabase (busca híbrida futura)
 */
import OpenAI from 'openai'
import { tel } from '../utils/telemetry'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export interface AdapterResult {
  url: string
  title: string
  snippet: string
  type: 'web' | 'social' | 'academic' | 'internal'
  relevance: number
  authors?: string[]
  doi?: string
  year?: number
  source_name?: string
}

// ─── SOCIAL ADAPTER — Reddit ──────────────────────────────────────────────────

export async function runSocialAdapter(query: string, maxResults = 3): Promise<AdapterResult[]> {
  tel.info('social_adapter', 'started', { query_len: query.length })
  const results: AdapterResult[] = []

  const redditQuery = `site:reddit.com ${query} discussão opiniões experiências`

  try {
    const res = await (openai as any).responses.create({
      model: 'gpt-4o-mini',
      tools: [{ type: 'web_search_preview' }],
      input: redditQuery
    })
    const text: string = res.output_text || ''
    if (text.length > 50) {
      results.push({
        url: `https://reddit.com/search?q=${encodeURIComponent(query)}`,
        title: `Discussões Reddit: ${query.substring(0, 60)}`,
        snippet: text.substring(0, 700),
        type: 'social',
        relevance: 0.65,
        source_name: 'Reddit'
      })
    }
  } catch (e) {
    tel.error('social_adapter', 'reddit_failed', e)
  }

  // Segunda busca: perspectivas de usuários reais
  try {
    const res2 = await (openai as any).responses.create({
      model: 'gpt-4o-mini',
      tools: [{ type: 'web_search_preview' }],
      input: `${query} fórum opiniões usuários comunidade 2024 2025`
    })
    const text2: string = res2.output_text || ''
    if (text2.length > 50) {
      results.push({
        url: `https://www.google.com/search?q=${encodeURIComponent(query + ' forum')}`,
        title: `Perspectivas de comunidades: ${query.substring(0, 50)}`,
        snippet: text2.substring(0, 700),
        type: 'social',
        relevance: 0.60,
        source_name: 'Fóruns'
      })
    }
  } catch (e) {
    tel.error('social_adapter', 'forum_failed', e)
  }

  tel.info('social_adapter', 'completed', { results: results.length })
  return results.slice(0, maxResults)
}

// ─── ACADEMIC ADAPTER — OpenAlex ─────────────────────────────────────────────

interface OpenAlexWork {
  id: string
  title: string
  abstract_inverted_index?: Record<string, number[]>
  doi?: string
  publication_year?: number
  cited_by_count?: number
  authorships?: Array<{ author: { display_name: string } }>
  primary_location?: { source?: { display_name?: string } }
}

function reconstructAbstract(invertedIndex: Record<string, number[]>): string {
  if (!invertedIndex) return ''
  const words: string[] = []
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      words[pos] = word
    }
  }
  return words.filter(Boolean).join(' ')
}

export async function runAcademicAdapter(query: string, maxResults = 3): Promise<AdapterResult[]> {
  tel.info('academic_adapter', 'started', { query_len: query.length })
  const results: AdapterResult[] = []

  try {
    // OpenAlex — API pública sem auth (polite pool com email)
    const encoded = encodeURIComponent(query)
    const url = `https://api.openalex.org/works?search=${encoded}&per-page=${maxResults}&sort=cited_by_count:desc&filter=language:pt|language:en&mailto=orbit@agente.local`

    const res = await fetch(url, { headers: { 'User-Agent': 'ORBIT-Research-Agent/1.0' } })
    if (!res.ok) throw new Error(`OpenAlex HTTP ${res.status}`)

    const data: { results?: OpenAlexWork[] } = await res.json()
    const works = data.results || []

    for (const work of works.slice(0, maxResults)) {
      const abstract = work.abstract_inverted_index
        ? reconstructAbstract(work.abstract_inverted_index).substring(0, 600)
        : 'Abstract não disponível'

      const authors = (work.authorships || [])
        .slice(0, 3)
        .map(a => a.author?.display_name || '')
        .filter(Boolean)

      const citedBy = work.cited_by_count || 0
      const relevance = Math.min(0.5 + Math.log10(citedBy + 1) * 0.1, 0.95)

      results.push({
        url: work.doi ? `https://doi.org/${work.doi}` : work.id,
        title: work.title || 'Título não disponível',
        snippet: abstract,
        type: 'academic',
        relevance,
        authors,
        doi: work.doi,
        year: work.publication_year,
        source_name: work.primary_location?.source?.display_name || 'OpenAlex'
      })
    }
    tel.info('academic_adapter', 'openalex_ok', { works: works.length })
  } catch (e) {
    tel.error('academic_adapter', 'openalex_failed', e)

    // Fallback: busca acadêmica via web_search
    try {
      const res = await (openai as any).responses.create({
        model: 'gpt-4o-mini',
        tools: [{ type: 'web_search_preview' }],
        input: `${query} site:scholar.google.com OR site:semanticscholar.org pesquisa científica artigo`
      })
      const text: string = res.output_text || ''
      if (text.length > 50) {
        results.push({
          url: `https://scholar.google.com/scholar?q=${encodeURIComponent(query)}`,
          title: `Literatura acadêmica: ${query.substring(0, 60)}`,
          snippet: text.substring(0, 600),
          type: 'academic',
          relevance: 0.70,
          source_name: 'Google Scholar (fallback)'
        })
      }
    } catch (e2) {
      tel.error('academic_adapter', 'scholar_fallback_failed', e2)
    }
  }

  tel.info('academic_adapter', 'completed', { results: results.length })
  return results
}

// ─── RETRIEVAL FABRIC — Orquestra todos os adaptadores ───────────────────────

export interface RetrievalFabricResult {
  web: AdapterResult[]
  social: AdapterResult[]
  academic: AdapterResult[]
  all: AdapterResult[]
  total: number
}

export async function runRetrievalFabric(params: {
  query: string
  plan: any
  webSources: AdapterResult[] // fontes já coletadas pelo research agent
}): Promise<RetrievalFabricResult> {
  const { query, plan, webSources } = params
  const depth = plan?.depth || 'medium'

  tel.info('retrieval_fabric', 'started', { depth, web_sources: webSources.length })

  const [social, academic] = await Promise.all([
    depth !== 'shallow' ? runSocialAdapter(query, depth === 'deep' ? 3 : 2) : Promise.resolve([]),
    depth === 'deep' || depth === 'medium' ? runAcademicAdapter(query, depth === 'deep' ? 4 : 2) : Promise.resolve([])
  ])

  const all = [...webSources, ...social, ...academic]
    .sort((a, b) => b.relevance - a.relevance)

  tel.info('retrieval_fabric', 'completed', {
    web: webSources.length, social: social.length, academic: academic.length, total: all.length
  })

  return { web: webSources, social, academic, all, total: all.length }
}
