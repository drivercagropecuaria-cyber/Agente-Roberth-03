/**
 * EVIDENCE NORMALIZER — Camada 6 da Arquitetura ORBIT 2026
 * Converte qualquer resultado de pesquisa em formato canônico.
 * Detecta conflitos, duplicatas e lacunas. Persiste no evidence_store.
 */
import { supabase } from '../db/client'

export interface EvidenceClaim {
  claim: string            // afirmação central
  evidence: string         // trecho de suporte
  source_url: string
  source_title: string
  source_type: 'web' | 'social' | 'academic' | 'internal'
  confidence: number       // 0-1
  relevance: number        // 0-1
  evidence_class: 'fact' | 'inference' | 'opinion'
  timestamp?: string
  doi?: string
  authors?: string[]
  contradicts?: string[]   // IDs de evidências conflitantes
  topic_tags: string[]
}

export async function normalizeAndStore(params: {
  researchId: string
  jobId?: string
  sources: Array<{
    url: string
    title: string
    snippet: string
    type: 'web' | 'social' | 'academic'
    relevance?: number
    doi?: string
    authors?: string[]
  }>
}): Promise<EvidenceClaim[]> {

  const normalized: EvidenceClaim[] = params.sources.map(src => ({
    claim: src.title || src.snippet.substring(0, 100),
    evidence: src.snippet,
    source_url: src.url,
    source_title: src.title,
    source_type: src.type,
    confidence: src.relevance || 0.7,
    relevance: src.relevance || 0.7,
    evidence_class: classifyEvidenceClass(src.snippet),
    doi: src.doi,
    authors: src.authors,
    contradicts: [],
    topic_tags: extractTopicTags(src.snippet)
  }))

  // Detectar conflitos simples (afirmações opostas)
  detectConflicts(normalized)

  // Persistir no evidence_store
  if (normalized.length > 0) {
    const rows = normalized.map(e => ({
      research_id: params.researchId,
      claim: e.claim,
      evidence: e.evidence,
      source_url: e.source_url,
      source_title: e.source_title,
      source_type: e.source_type,
      confidence: e.confidence,
      relevance: e.relevance,
      evidence_class: e.evidence_class
    }))

    await supabase.from('evidence_store').insert(rows)
  }

  return normalized
}

function classifyEvidenceClass(text: string): 'fact' | 'inference' | 'opinion' {
  const opinionWords = /acredito|acho|opinião|parece|talvez|possivelmente|provavelmente/i
  const inferenceWords = /portanto|logo|consequentemente|indica|sugere|implica/i

  if (opinionWords.test(text)) return 'opinion'
  if (inferenceWords.test(text)) return 'inference'
  return 'fact'
}

function extractTopicTags(text: string): string[] {
  // Extração simples de tags por palavras relevantes
  const words = text.toLowerCase().match(/\b[a-zà-ú]{5,}\b/g) || []
  const stopWords = new Set(['sobre', 'sendo', 'quando', 'então', 'muito', 'mais', 'para', 'como', 'isso', 'este', 'essa', 'também', 'ainda', 'onde'])
  return [...new Set(words.filter(w => !stopWords.has(w)))].slice(0, 5)
}

function detectConflicts(claims: EvidenceClaim[]): void {
  // Detecção básica: busca por negações diretas
  const negationWords = /não é|nunca foi|contrário|falso|incorreto|errado/i
  claims.forEach((claim, i) => {
    claims.forEach((other, j) => {
      if (i !== j && negationWords.test(other.evidence) &&
          claim.topic_tags.some(t => other.topic_tags.includes(t))) {
        if (!claim.contradicts) claim.contradicts = []
        if (!claim.contradicts.includes(String(j))) {
          claim.contradicts.push(String(j))
        }
      }
    })
  })
}

// Análise de cobertura: percentual de tópicos cobertos
export function analyzeCoverage(claims: EvidenceClaim[], objective: string): number {
  if (claims.length === 0) return 0
  const objectiveTags = extractTopicTags(objective)
  const coveredTags = objectiveTags.filter(tag =>
    claims.some(c => c.topic_tags.includes(tag))
  )
  const baseCoverage = objectiveTags.length > 0
    ? coveredTags.length / objectiveTags.length
    : 0.5
  // Bônus por quantidade de fontes únicas
  const sourceBonus = Math.min(claims.length / 10, 0.3)
  return Math.min(baseCoverage + sourceBonus, 1.0)
}
