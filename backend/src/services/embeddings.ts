/**
 * EMBEDDINGS SERVICE — Camada 7 da Arquitetura ORBIT 2026
 * Gera embeddings via OpenAI text-embedding-3-small.
 * Usado para: knowledge base, semantic search, memória semântica.
 */
import OpenAI from 'openai'
import { supabase } from '../db/client'
import { tel } from '../utils/telemetry'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const EMBED_MODEL = 'text-embedding-3-small'
const EMBED_DIM = 1536

// ─── Gerar embedding único ────────────────────────────────────────────────────

export async function generateEmbedding(text: string): Promise<number[]> {
  const input = text.substring(0, 8000).replace(/\n+/g, ' ').trim()
  const res = await openai.embeddings.create({ model: EMBED_MODEL, input, dimensions: EMBED_DIM })
  return res.data[0].embedding
}

// ─── Gerar embeddings em lote (máx 100 por chamada) ──────────────────────────

export async function generateEmbeddingBatch(texts: string[]): Promise<number[][]> {
  const inputs = texts.map(t => t.substring(0, 8000).replace(/\n+/g, ' ').trim())
  const res = await openai.embeddings.create({ model: EMBED_MODEL, input: inputs, dimensions: EMBED_DIM })
  return res.data.map(d => d.embedding)
}

// ─── Persistir embedding na tabela knowledge_base ────────────────────────────

export async function persistKnowledgeItem(params: {
  jobId?: string
  title: string
  content: string
  sourceUrl?: string
  sourceType?: string
  category?: string
  tags?: string[]
}): Promise<string | null> {
  try {
    const embedding = await generateEmbedding(`${params.title}\n${params.content}`)

    const { data, error } = await supabase
      .from('knowledge_base')
      .insert({
        title: params.title,
        content: params.content.substring(0, 10000),
        source_url: params.sourceUrl || null,
        source_type: params.sourceType || 'web',
        category: params.category || 'general',
        tags: params.tags || [],
        embedding,
        job_id: params.jobId || null
      })
      .select('id')
      .single()

    if (error) {
      // Fallback: tentar sem embedding se coluna não existir ainda
      const { data: d2 } = await supabase.from('knowledge_base').insert({
        title: params.title,
        content: params.content.substring(0, 10000),
        source_url: params.sourceUrl || null,
        source_type: params.sourceType || 'web',
        category: params.category || 'general',
        tags: params.tags || [],
        job_id: params.jobId || null
      }).select('id').single()
      return d2?.id || null
    }

    tel.info('embeddings', 'persisted', { title_len: params.title.length })
    return data?.id || null
  } catch (e) {
    tel.error('embeddings', 'persist_failed', e)
    return null
  }
}

// ─── Indexar resultado de pesquisa na knowledge base ─────────────────────────

export async function indexResearchSources(params: {
  jobId: string
  sources: Array<{ title: string; snippet: string; url: string; type: string }>
}): Promise<void> {
  const significant = params.sources.filter(s => s.snippet.length > 100)
  if (significant.length === 0) return

  // Gerar embeddings em lote
  try {
    const texts = significant.map(s => `${s.title}\n${s.snippet}`)
    const embeddings = await generateEmbeddingBatch(texts)

    const rows = significant.map((s, i) => ({
      title: s.title.substring(0, 200),
      content: s.snippet.substring(0, 5000),
      source_url: s.url,
      source_type: s.type,
      category: 'research',
      tags: [],
      embedding: embeddings[i],
      job_id: params.jobId
    }))

    await supabase.from('knowledge_base').insert(rows).catch(() => {
      // Fallback sem embeddings
      return supabase.from('knowledge_base').insert(rows.map(r => ({ ...r, embedding: undefined })))
    })

    tel.info('embeddings', 'indexed_sources', { count: rows.length, jobId: params.jobId })
  } catch (e) {
    tel.error('embeddings', 'index_failed', e)
  }
}
