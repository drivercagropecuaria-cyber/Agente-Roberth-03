/**
 * KNOWLEDGE BASE — Camada 7 da Arquitetura ORBIT 2026
 * Hybrid Search: FTS (pg_trgm / to_tsquery) + Semântico (pgvector cosine similarity)
 * Combina resultados com RRF (Reciprocal Rank Fusion).
 *
 * Fallback gracioso: se pgvector não estiver ativo, usa apenas FTS.
 */
import { supabase } from '../db/client'
import { generateEmbedding } from './embeddings'
import { tel } from '../utils/telemetry'

export interface KBResult {
  id: string
  title: string
  content: string
  source_url: string | null
  source_type: string
  category: string
  tags: string[]
  score: number        // RRF combinado
  fts_rank?: number
  semantic_rank?: number
  created_at: string
}

// ─── FTS Search (Postgres full-text, sem dependência de pgvector) ─────────────

async function searchFTS(query: string, limit = 10): Promise<KBResult[]> {
  try {
    const { data } = await supabase
      .from('knowledge_base')
      .select('id, title, content, source_url, source_type, category, tags, created_at')
      .textSearch('content', query, { type: 'websearch', config: 'portuguese' })
      .limit(limit)

    return (data || []).map((r: any, i) => ({
      ...r,
      score: 1 / (i + 1),  // rank por posição
      fts_rank: i + 1
    }))
  } catch {
    // Fallback ILIKE se textSearch não disponível
    const { data } = await supabase
      .from('knowledge_base')
      .select('id, title, content, source_url, source_type, category, tags, created_at')
      .ilike('content', `%${query.substring(0, 100)}%`)
      .limit(limit)

    return (data || []).map((r: any, i) => ({ ...r, score: 1 / (i + 1), fts_rank: i + 1 }))
  }
}

// ─── Semantic Search (pgvector cosine) ───────────────────────────────────────

async function searchSemantic(query: string, limit = 10): Promise<KBResult[]> {
  try {
    const embedding = await generateEmbedding(query)

    // Tentar via RPC search_knowledge_base (deve existir no schema)
    const { data: rpcData } = await supabase.rpc('search_knowledge_base', {
      query_embedding: embedding,
      match_count: limit,
      match_threshold: 0.5
    })

    if (rpcData && rpcData.length > 0) {
      return rpcData.map((r: any, i: number) => ({
        ...r,
        score: r.similarity || 1 / (i + 1),
        semantic_rank: i + 1
      }))
    }

    // Fallback: ordenar por similaridade coseno inline (lento, só para desenvolvimento)
    const { data: rows } = await supabase
      .from('knowledge_base')
      .select('id, title, content, source_url, source_type, category, tags, created_at, embedding')
      .not('embedding', 'is', null)
      .limit(200)

    if (!rows?.length) return []

    const scored = rows
      .map((r: any) => {
        if (!r.embedding) return null
        const sim = cosineSimilarity(embedding, r.embedding)
        return { ...r, score: sim, semantic_rank: 0 }
      })
      .filter((r): r is KBResult => r !== null && r.score > 0.4)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)

    scored.forEach((r, i) => { r.semantic_rank = i + 1 })
    return scored
  } catch (e) {
    tel.error('knowledge_base', 'semantic_search_failed', e)
    return []
  }
}

// ─── RRF — Reciprocal Rank Fusion ────────────────────────────────────────────
// Combina listas de ranking de FTS e semântico sem precisar normalizar scores

function rrfFuse(lists: KBResult[][], k = 60): KBResult[] {
  const scores = new Map<string, { item: KBResult; score: number }>()

  for (const list of lists) {
    list.forEach((item, rank) => {
      const current = scores.get(item.id)
      const rrfScore = 1 / (k + rank + 1)
      if (current) {
        current.score += rrfScore
      } else {
        scores.set(item.id, { item, score: rrfScore })
      }
    })
  }

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .map(({ item, score }) => ({ ...item, score }))
}

// ─── Hybrid Search — ponto de entrada principal ───────────────────────────────

export async function hybridSearch(params: {
  query: string
  limit?: number
  category?: string
  sourceType?: string
}): Promise<KBResult[]> {
  const { query, limit = 10, category, sourceType } = params
  const start = Date.now()

  tel.info('knowledge_base', 'hybrid_search_start', { query_len: query.length })

  // Executar FTS e semântico em paralelo
  const [ftsResults, semanticResults] = await Promise.all([
    searchFTS(query, limit * 2),
    searchSemantic(query, limit * 2)
  ])

  // Fusão RRF
  let merged = rrfFuse([ftsResults, semanticResults])

  // Filtros opcionais
  if (category) merged = merged.filter(r => r.category === category)
  if (sourceType) merged = merged.filter(r => r.source_type === sourceType)

  const result = merged.slice(0, limit)

  tel.info('knowledge_base', 'hybrid_search_done', {
    fts: ftsResults.length, semantic: semanticResults.length,
    merged: result.length, ms: Date.now() - start
  })

  return result
}

// ─── Contexto de KB para enriquecer análise ──────────────────────────────────

export async function getKBContext(query: string, maxItems = 5): Promise<string> {
  const results = await hybridSearch({ query, limit: maxItems })
  if (results.length === 0) return ''

  return results
    .map(r => `[${r.source_type.toUpperCase()}] ${r.title}\n${r.content.substring(0, 500)}`)
    .join('\n\n---\n\n')
}

// ─── Helper: cosine similarity (fallback local) ───────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}
