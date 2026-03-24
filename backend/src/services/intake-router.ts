/**
 * INTAKE ROUTER — Camada 2 da Arquitetura ORBIT 2026
 * Classifica intenção, risco, profundidade e orçamento ANTES do Orquestrador.
 * Evita que todo pedido receba o mesmo ritual completo.
 */
import { supabase } from '../db/client'

export type IntentType = 'quick_answer' | 'research' | 'dossier' | 'presentation' | 'task' | 'unknown'
export type DepthLevel = 'shallow' | 'medium' | 'deep'
export type RiskLevel = 'low' | 'medium' | 'high' | 'requires_approval'

export interface IntakeDecision {
  intent: IntentType
  depth: DepthLevel
  risk: RiskLevel
  max_branches: number      // largura adaptativa da pesquisa
  max_sources: number       // fontes máximas por branch
  max_tokens: number        // orçamento de tokens
  requires_human: boolean   // necessita aprovação humana
  requires_web: boolean
  requires_social: boolean
  requires_academic: boolean
  expected_output: 'text' | 'dossier' | 'presentation' | 'summary'
  rationale: string         // por que esta decisão
}

const INTENT_PATTERNS: Record<string, IntentType> = {
  'pesquisa|analise|análise|investigue|investiga': 'research',
  'dossiê|dossie|relatório|relatorio|documento|report': 'dossier',
  'apresentação|apresentacao|slides|html|visual': 'presentation',
  'o que é|o que e|explique|explica|defina|define|como funciona': 'quick_answer',
  'tarefa|lembre|lembrar|agenda|calendário|calendario|notific': 'task',
}

function classifyIntent(text: string): IntentType {
  const lower = text.toLowerCase()
  for (const [pattern, intent] of Object.entries(INTENT_PATTERNS)) {
    if (new RegExp(pattern).test(lower)) return intent
  }
  // Heurística de comprimento: mensagem curta = pergunta rápida
  if (text.length < 80) return 'quick_answer'
  if (text.length > 200) return 'dossier'
  return 'research'
}

function classifyDepth(text: string, intent: IntentType): DepthLevel {
  const hasDepthKeywords = /profund|detalhad|complet|abrangent|exaustiv|completo/i.test(text)
  const hasQuickKeywords = /rápido|rapido|resumo|breve|curto|simples/i.test(text)

  if (hasQuickKeywords || intent === 'quick_answer') return 'shallow'
  if (hasDepthKeywords || intent === 'dossier' || intent === 'presentation') return 'deep'
  return 'medium'
}

function classifyRisk(text: string): RiskLevel {
  const highRisk = /delete|apagar|excluir|enviar email|postar|publicar|pagar|transferir|banco/i.test(text)
  const medRisk = /contato|pessoa|privado|confidencial|senhas/i.test(text)
  if (highRisk) return 'requires_approval'
  if (medRisk) return 'high'
  return 'low'
}

export function routeIntake(text: string): IntakeDecision {
  const intent = classifyIntent(text)
  const depth = classifyDepth(text, intent)
  const risk = classifyRisk(text)

  // Largura adaptativa: simples→3 ramos, médio→6, profundo→12
  const branchMap: Record<DepthLevel, number> = { shallow: 0, medium: 6, deep: 12 }
  const sourcesMap: Record<DepthLevel, number> = { shallow: 3, medium: 8, deep: 20 }
  const tokensMap: Record<DepthLevel, number> = { shallow: 2000, medium: 8000, deep: 24000 }

  return {
    intent,
    depth,
    risk,
    max_branches: intent === 'quick_answer' ? 0 : branchMap[depth],
    max_sources: sourcesMap[depth],
    max_tokens: tokensMap[depth],
    requires_human: risk === 'requires_approval',
    requires_web: intent !== 'quick_answer' && intent !== 'task',
    requires_social: depth === 'deep',
    requires_academic: depth === 'deep' && (intent === 'dossier' || intent === 'research'),
    expected_output: intent === 'quick_answer' ? 'text'
                   : intent === 'presentation' ? 'presentation'
                   : intent === 'dossier' ? 'dossier'
                   : 'summary',
    rationale: `intent=${intent} depth=${depth} risk=${risk} branches=${branchMap[depth]}`
  }
}

// Persistir decisão de intake no job
export async function persistIntakeDecision(jobId: string, decision: IntakeDecision) {
  await supabase
    .from('jobs')
    .update({ orchestration_log: { intake: decision } })
    .eq('id', jobId)
}
