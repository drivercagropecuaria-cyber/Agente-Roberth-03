/**
 * PLANNER — Camada 3 da Arquitetura ORBIT 2026
 * Produz um plano DECLARATIVO separado da execução.
 * Control plane ≠ Execution plane.
 */
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export interface DeclarativePlan {
  job_id: string
  objective: string
  subtasks: Array<{
    id: string
    type: 'research_web' | 'research_social' | 'research_academic' | 'analysis' | 'synthesis' | 'artifact' | 'quality'
    description: string
    depends_on: string[]
    agent: string
    priority: number
  }>
  allowed_sources: string[]
  max_cost_usd: number
  deadline_seconds: number
  citation_rules: string
  quality_criteria: Record<string, number>  // dimensão → threshold mínimo
  stop_conditions: string[]
  requires_human_checkpoint: boolean
  rationale: string
}

export async function generatePlan(params: {
  jobId: string
  userText: string
  intent: string
  depth: string
  maxBranches: number
  maxTokens: number
}): Promise<DeclarativePlan> {

  const plannerPrompt = `Você é o Planner do sistema ORBIT.
Sua única função é produzir um plano declarativo JSON — não execute nada, apenas planeje.

Pedido do usuário: "${params.userText}"
Intenção classificada: ${params.intent}
Profundidade: ${params.depth}
Máximo de ramos de pesquisa: ${params.maxBranches}
Orçamento de tokens: ${params.maxTokens}

Produza um plano JSON com esta estrutura exata:
{
  "objective": "string — objetivo claro em 1 frase",
  "subtasks": [
    {
      "id": "t1",
      "type": "research_web|research_social|research_academic|analysis|synthesis|artifact|quality",
      "description": "string",
      "depends_on": [],
      "agent": "string — nome do agente responsável",
      "priority": 1
    }
  ],
  "allowed_sources": ["web", "social", "academic", "knowledge_base"],
  "max_cost_usd": 0.5,
  "deadline_seconds": 120,
  "citation_rules": "string — regras de citação",
  "quality_criteria": {
    "factualidade": 7,
    "cobertura": 6,
    "coerencia": 7,
    "utilidade": 7
  },
  "stop_conditions": ["cobertura > 80%", "sem novas fontes"],
  "requires_human_checkpoint": false,
  "rationale": "string — por que este plano"
}

Adapte as subtarefas ao tipo de pedido. Resposta apenas com JSON válido.`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: plannerPrompt }],
    response_format: { type: 'json_object' },
    max_tokens: 1000,
    temperature: 0.3
  })

  const raw = JSON.parse(response.choices[0].message.content || '{}')
  return {
    job_id: params.jobId,
    ...raw
  } as DeclarativePlan
}
