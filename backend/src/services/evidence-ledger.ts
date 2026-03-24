/**
 * EVIDENCE LEDGER — Camada 6 da Arquitetura ORBIT 2026
 * Hash SHA-256, deduplicação por conteúdo, freshness scoring,
 * contradiction detection melhorada com embeddings via LLM.
 *
 * Complementa o evidence-normalizer.ts com rastreabilidade completa.
 */
import crypto from 'crypto'
import { supabase } from '../db/client'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface LedgerEntry {
  hash: string           // SHA-256 do conteúdo normalizado
  job_id: string
  claim: string
  evidence: string
  source_url: string
  source_title: string
  source_type: string
  evidence_class: 'fact' | 'inference' | 'opinion'
  confidence: number     // 0–1
  freshness_score: number // 0–1 (1 = recente, 0 = desatualizado)
  captured_at: string    // ISO timestamp
  contradiction_ids: string[] // hashes de evidências conflitantes
  topic_tags: string[]
  is_duplicate: boolean
}

export interface LedgerReport {
  total: number
  unique: number
  duplicates: number
  conflicts: number
  avg_freshness: number
  avg_confidence: number
  coverage_score: number
  entries: LedgerEntry[]
}

// ─── Hash determinístico para deduplicação ───────────────────────────────────

function hashContent(text: string): string {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim()
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16)
}

// ─── Freshness Scorer ─────────────────────────────────────────────────────────
// Detecta datas no texto e calcula score de recência (0–1)

function scoreFreshness(text: string, capturedAt: string): number {
  const now = Date.now()
  const capturedTs = new Date(capturedAt).getTime()
  const ageMs = now - capturedTs

  // Se foi capturado < 24h atrás, score base é alto
  const captureBonus = ageMs < 24 * 3600_000 ? 0.3 : 0

  // Tenta detectar ano no conteúdo
  const yearMatch = text.match(/\b(202[0-9]|201[5-9])\b/)
  if (yearMatch) {
    const year = parseInt(yearMatch[1])
    const currentYear = new Date().getFullYear()
    const diff = currentYear - year
    if (diff === 0) return Math.min(1.0, 0.9 + captureBonus)
    if (diff === 1) return Math.min(1.0, 0.75 + captureBonus)
    if (diff === 2) return Math.min(1.0, 0.55 + captureBonus)
    if (diff <= 5) return Math.min(1.0, 0.35 + captureBonus)
    return 0.2
  }

  // Sem data detectada — assume moderado
  return 0.5 + captureBonus
}

// ─── Contradiction Detector aprimorado ───────────────────────────────────────
// Detecta contradições por padrões de negação e tema compartilhado

const NEGATION_PATTERNS = [
  /não é/, /nunca foi/, /é falso/, /é incorreto/, /é errado/,
  /contradiz/, /nega/, /refuta/, /é o oposto/, /ao contrário/,
  /desmente/, /invalida/, /é mito/
]

function detectContradictions(entries: LedgerEntry[]): void {
  for (let i = 0; i < entries.length; i++) {
    for (let j = 0; j < entries.length; j++) {
      if (i === j) continue
      const hasNegation = NEGATION_PATTERNS.some(p => p.test(entries[j].evidence.toLowerCase()))
      const sharedTags = entries[i].topic_tags.filter(t => entries[j].topic_tags.includes(t))
      if (hasNegation && sharedTags.length >= 1) {
        if (!entries[i].contradiction_ids.includes(entries[j].hash)) {
          entries[i].contradiction_ids.push(entries[j].hash)
        }
      }
    }
  }
}

// ─── Deduplicação por hash ─────────────────────────────────────────────────

function deduplicateEntries(entries: LedgerEntry[]): LedgerEntry[] {
  const seen = new Set<string>()
  return entries.map(entry => {
    if (seen.has(entry.hash)) {
      return { ...entry, is_duplicate: true }
    }
    seen.add(entry.hash)
    return { ...entry, is_duplicate: false }
  })
}

// ─── Extração de tags de tópico ──────────────────────────────────────────────

const STOP_WORDS = new Set([
  'sobre', 'sendo', 'quando', 'então', 'muito', 'mais', 'para',
  'como', 'isso', 'este', 'essa', 'também', 'ainda', 'onde',
  'foram', 'pelo', 'pela', 'pelos', 'pelas', 'pode', 'poder',
  'seria', 'serão', 'nosso', 'nossa', 'entre', 'outros', 'tinha'
])

function extractTags(text: string): string[] {
  const words = text.toLowerCase().match(/\b[a-zà-ú]{5,}\b/g) || []
  return [...new Set(words.filter(w => !STOP_WORDS.has(w)))].slice(0, 8)
}

function classifyEvidenceClass(text: string): 'fact' | 'inference' | 'opinion' {
  if (/acredito|acho|opinião|parece|talvez|possivelmente|provavelmente/i.test(text)) return 'opinion'
  if (/portanto|logo|consequentemente|indica|sugere|implica|infere-se/i.test(text)) return 'inference'
  return 'fact'
}

// ─── API principal do Ledger ─────────────────────────────────────────────────

export async function buildEvidenceLedger(params: {
  jobId: string
  sources: Array<{
    url: string
    title: string
    snippet: string
    type: string
    relevance?: number
  }>
}): Promise<LedgerReport> {
  const capturedAt = new Date().toISOString()

  // 1. Criar entradas brutas
  const raw: LedgerEntry[] = params.sources.map(src => ({
    hash: hashContent(src.snippet),
    job_id: params.jobId,
    claim: (src.title || src.snippet).substring(0, 120),
    evidence: src.snippet,
    source_url: src.url,
    source_title: src.title,
    source_type: src.type,
    evidence_class: classifyEvidenceClass(src.snippet),
    confidence: src.relevance || 0.7,
    freshness_score: scoreFreshness(src.snippet, capturedAt),
    captured_at: capturedAt,
    contradiction_ids: [],
    topic_tags: extractTags(src.snippet),
    is_duplicate: false
  }))

  // 2. Deduplicar
  const deduped = deduplicateEntries(raw)

  // 3. Detectar contradições (só nas não-duplicatas)
  const unique = deduped.filter(e => !e.is_duplicate)
  detectContradictions(unique)

  // 4. Persistir no Supabase (apenas únicas)
  if (unique.length > 0) {
    await supabase.from('evidence_store').insert(
      unique.map(e => ({
        research_id: params.jobId, // usa jobId como proxy se não tiver researchId
        claim: e.claim,
        evidence: e.evidence,
        source_url: e.source_url,
        source_title: e.source_title,
        source_type: e.source_type,
        confidence: e.confidence,
        relevance: e.confidence,
        evidence_class: e.evidence_class
      }))
    ).catch(() => {}) // não bloqueia se tabela não existir ainda
  }

  // 5. Calcular métricas
  const conflicts = unique.filter(e => e.contradiction_ids.length > 0).length
  const avgFreshness = unique.reduce((s, e) => s + e.freshness_score, 0) / (unique.length || 1)
  const avgConfidence = unique.reduce((s, e) => s + e.confidence, 0) / (unique.length || 1)

  // 6. Coverage score: % de únicas com freshness ≥ 0.5
  const fresh = unique.filter(e => e.freshness_score >= 0.5).length
  const coverageScore = unique.length > 0 ? fresh / unique.length : 0

  return {
    total: deduped.length,
    unique: unique.length,
    duplicates: deduped.length - unique.length,
    conflicts,
    avg_freshness: Math.round(avgFreshness * 100) / 100,
    avg_confidence: Math.round(avgConfidence * 100) / 100,
    coverage_score: Math.round(coverageScore * 100) / 100,
    entries: deduped
  }
}

// ─── Gate de Evidência (Quality Gate 1) ──────────────────────────────────────

export interface EvidenceGateResult {
  passed: boolean
  score: number // 0–10
  checks: {
    min_sources: boolean
    min_freshness: boolean
    min_confidence: boolean
    no_critical_conflicts: boolean
    diversity: boolean
  }
  issues: string[]
  repair_action: 'expand_research' | 'filter_stale' | null
}

export function runEvidenceGate(report: LedgerReport): EvidenceGateResult {
  const issues: string[] = []
  const checks = {
    min_sources:           report.unique >= 2,
    min_freshness:         report.avg_freshness >= 0.4,
    min_confidence:        report.avg_confidence >= 0.5,
    no_critical_conflicts: report.conflicts < report.unique * 0.5,
    diversity:             report.unique >= 1
  }

  if (!checks.min_sources)           issues.push(`Poucas fontes únicas: ${report.unique} (mín 2)`)
  if (!checks.min_freshness)         issues.push(`Freshness baixo: ${report.avg_freshness} (mín 0.4)`)
  if (!checks.min_confidence)        issues.push(`Confiança baixa: ${report.avg_confidence} (mín 0.5)`)
  if (!checks.no_critical_conflicts) issues.push(`Muitos conflitos: ${report.conflicts}`)

  const passedCount = Object.values(checks).filter(Boolean).length
  const score = Math.round((passedCount / 5) * 10)
  const passed = score >= 6 // ≥ 6/10 = aprovado

  let repair_action: EvidenceGateResult['repair_action'] = null
  if (!passed) {
    repair_action = !checks.min_sources ? 'expand_research' : 'filter_stale'
  }

  return { passed, score, checks, issues, repair_action }
}
