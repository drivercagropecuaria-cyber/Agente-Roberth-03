# ARQUITETURA ORBIT 2026 — Versão Final Completa
# Atualizado em: 24/03/2026 — incorpora análise arquitetural avançada completa
# Princípio: "Input → Policy → Plan → Execute → Prove → Reason → Compose → Evaluate → Persist → Observe"

## Diagnóstico Acumulado das Versões Anteriores

| Versão | Problema | Status |
|--------|---------|--------|
| v1 | Pipeline linear sem classificação de intenção | Corrigido |
| v1 | Orquestrador misturava controle e execução | Corrigido |
| v1 | Score único 7/10 sem diagnóstico por dimensão | Corrigido |
| v1 | Memória plana | Corrigido |
| v2 | Sem Auth / Rate Limit / Correlation ID na entrada | A corrigir |
| v2 | Evidence Ledger sem hash, dedup, freshness | A corrigir |
| v2 | Sem Artifact Registry + Versioning | A corrigir |
| v2 | Qualidade em 1 ponto só — precisa de 3 gates | A corrigir |
| v2 | Observabilidade terminal, não transversal | A corrigir |
| v2 | Governança implícita, não estrutural | A corrigir |
| v2 | Sem backbone de execução durável explícito | A corrigir |

---

## ARQUITETURA ORBIT 2026 — 13 Camadas Vivas

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              CAMADA TRANSVERSAL — OBSERVABILIDADE
  OpenTelemetry | job_id × run_id × agent_id × tool_id × evidence_id
  Traces nativos OpenAI SDK | Cost Monitor | Failure Dashboard
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              CAMADA TRANSVERSAL — GOVERNANÇA
  RBAC | Secrets | Audit Log | Source Allowlist | Approvals | Policy
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌──────────────────────────────────────────────────────────────────────┐
│ CAMADA 1 — ENTRADA                                                   │
│ Telegram Bot | Dashboard Web | API Pública | Webhooks               │
│ + Auth + Rate Limit + Correlation ID + Suporte Multimodal           │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────────┐
│ CAMADA 2 — INTAKE E POLÍTICA                                         │
│ Command Parser → Intent Classifier → Risk Gate → Budget Controller  │
│ Source Policy → Model Selector → Depth Router                       │
│                                                                      │
│ Decide: tipo de tarefa | profundidade | orçamento tokens/custo      │
│         modelos permitidos | fontes permitidas                       │
│         necessidade de aprovação humana | exigência de citação       │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────────┐
│ CAMADA 3 — PLANO DE CONTROLE (Control Plane)                        │
│ Planner / Orchestrator (OpenAI Agents SDK)                          │
│                                                                      │
│ Produz DeclarativePlan:                                              │
│ job_id | run_id | intent | required_sources | max_cost              │
│ max_latency | quality_targets | artifact_types                       │
│ approval_points | repair_rules                                        │
│                                                                      │
│ Modelo Recomendado: o-series como Planner, GPT-4o como Executor     │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────────┐
│ CAMADA 4 — EXECUÇÃO DURÁVEL (Execution Plane)                       │
│ Workflow Runtime | Queue Workers | Retry Engine                     │
│ Dead-letter Queue | Replay | Checkpoint | Resume                    │
│ Human Interrupt → Approval → Continue                               │
│                                                                      │
│ Stack: Supabase pgmq (atual) → Temporal (produção crítica)          │
│        LangGraph (alternativa com grafo + human-in-the-loop nativo) │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────────┐
│ CAMADA 5 — RETRIEVAL FABRIC                                         │
│ Adaptadores com contrato comum: query|filters|freshness|quality     │
│                                                                      │
│ • Web Adapter (OpenAI web_search_preview)                           │
│ • Social Adapter (Reddit, fóruns)                                   │
│ • Academic Adapter (OpenAlex, Semantic Scholar)                     │
│ • Internal Files Adapter (OpenAI File Search)                       │
│ • Knowledge Base Adapter (busca híbrida: FTS + pgvector)           │
│ • MCP Adapter (protocolo padronizado de ferramentas)                │
│ • External Agent Adapter (A2A quando necessário)                    │
│                                                                      │
│ Largura adaptativa: 0 ramos (quick) → 3 (médio) → 12 (dossiê)     │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────────┐
│ CAMADA 6 — EVIDÊNCIA                                                │
│ Evidence Normalizer | Deduplicator | Freshness Scorer               │
│ Contradiction Detector | Evidence Ledger                            │
│                                                                      │
│ Formato canônico:                                                   │
│ { hash, claim, source, captured_at, confidence, snippet,           │
│   url, topic, contradictions, license, freshness_score,            │
│   evidence_class: fact|inference|opinion }                           │
│                                                                      │
│ REGRA: nenhuma frase forte entra no dossiê sem evidência estruturada│
│                                                                      │
│ Quality Gate 1 — EVIDÊNCIA:                                         │
│ cobertura ≥ 60% | recência ≥ 7 | diversidade ≥ 3 fontes           │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────────┐
│ CAMADA 7 — CONHECIMENTO E MEMÓRIA                                   │
│ Postgres | pgvector | FTS | Hybrid Search                           │
│ Artifact Registry | Artifact Versioning                             │
│                                                                      │
│ Memória em 4 níveis:                                                │
│ • Execução: execution_checkpoints (estado do job)                   │
│ • Episódica: conversation_memory (casos anteriores)                 │
│ • Semântica: semantic_entities (fatos consolidados)                 │
│ • Procedural: directives (como resolver tarefas similares)          │
│                                                                      │
│ Tabelas-chave: jobs | job_steps | evidence_items | evidence_claims  │
│ artifacts | artifact_versions | qa_runs | model_runs | tool_calls   │
│ memories_semantic | memories_episodic | approvals | audit_log       │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────────┐
│ CAMADA 8 — SÍNTESE (Synthesis Engine)                               │
│ Cross-Evidence Reasoner | Thesis Builder | Uncertainty Estimator    │
│                                                                      │
│ Detecta: convergências | lacunas | divergências entre fontes        │
│ Estima: confiança por afirmação                                      │
│ Produz: verdade operacional do job (tese central + eixos)           │
│                                                                      │
│ Quality Gate 2 — SÍNTESE:                                           │
│ factualidade ≥ 7 | coerência ≥ 7 | rastreabilidade ≥ 7            │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────────┐
│ CAMADA 9 — ARTEFATOS (Artifact Generator)                           │
│ Consome a mesma síntese para gerar múltiplos formatos:              │
│                                                                      │
│ • Dossiê HTML premium (autocontido)                                 │
│ • Resumo Telegram (≤ 900 chars)                                     │
│ • Briefing executivo (texto estruturado)                            │
│ • Dashboard card (JSON estruturado)                                 │
│ • SWOT visual                                                       │
│ • Memória persistente (knowledge_base)                              │
│                                                                      │
│ → Artifact Registry: hash | versão | score | fontes | custo        │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────────┐
│ CAMADA 10 — QUALIDADE MULTIDIMENSIONAL                              │
│                                                                      │
│ Quality Gate 3 — ARTEFATO:                                          │
│ Scorecard por eixo (0-10):                                          │
│ factualidade | cobertura | recência | qualidade_fontes              │
│ coerência | rastreabilidade | utilidade | custo | latência          │
│                                                                      │
│ Repair Loop por dimensão:                                           │
│ factualidade falhou → volta para Evidência                          │
│ cobertura falhou → reabre Pesquisa                                  │
│ clareza falhou → reescreve Artefato                                 │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────────┐
│ CAMADA 11 — PERSISTÊNCIA                                            │
│ Supabase PostgreSQL | Storage | pgmq | Realtime                    │
│ pgvector | Hybrid Search | Embeddings Automáticos                   │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────────┐
│ CAMADA 12 — ENTREGA                                                 │
│ Persistência do artefato final + versão + score + custo + fontes   │
│ Notificação (Telegram) | Dashboard update (Realtime)                │
│ Opção de reabrir job | Replay | Human feedback                      │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────────┐
│ CAMADA 13 — DASHBOARD / STUDIO / COCKPIT DE EVIDÊNCIA               │
│ Jobs | Traces | Evidence Graph | SWOT | Quality Reports             │
│ Cost Monitor | Agent Performance | Realtime Updates                 │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Stack Final Recomendada

| Componente | Tecnologia | Justificativa |
|-----------|-----------|---------------|
| Interface de agentes | OpenAI Agents SDK | Tools, handoffs, traces nativos |
| Ferramentas e integrações | MCP | Protocolo padrão, segurança, progresso |
| Interoperabilidade entre agentes | A2A | Apenas quando necessário |
| Fila e mensagens | Supabase pgmq (atual) | Durável, sem infra extra |
| Execução durável (futuro) | Temporal | Máxima confiabilidade em produção |
| Alternativa de execução | LangGraph | Grafo + human-in-the-loop nativo |
| Banco / storage / realtime | Supabase | Único sistema para tudo |
| Busca e memória | Postgres FTS + pgvector + hybrid search | Embeddings automáticos |
| Telemetria | OpenTelemetry + SDK traces | Correlação job/agent/tool/evidence |
| Avaliação | Scorecards por eixo + evals estruturados | 3 gates, 9 dimensões |
| Governança | Policies + audit + approvals + RBAC | Transversal, não terminal |

---

## Mapeamento Código → Camada

| Arquivo | Camada | Status |
|---------|--------|--------|
| api/webhook.ts | 1 — Entrada | ✅ Implementado |
| services/intake-router.ts | 2 — Política | ✅ Implementado |
| agents/planner.ts | 3 — Controle | ✅ Implementado |
| queue/worker.ts | 4 — Execução | ✅ Básico (sem Temporal) |
| agents/research.ts | 5 — Retrieval | ✅ Web adapter básico |
| services/evidence-normalizer.ts | 6 — Evidência | ✅ Implementado |
| services/memory.ts | 7 — Memória | ✅ 4 níveis implementados |
| agents/analysis.ts | 8 — Síntese | ✅ Implementado |
| agents/synthesizer.ts | 8+ — Síntese | ✅ Implementado |
| agents/quality-reviewer.ts | 10 — Qualidade | ✅ 5 dimensões (expandir para 9) |
| utils/telemetry.ts | 13 (transversal) | ✅ Básico (sem OTel completo) |
| agents/orchestrator.ts | 3+4 | ✅ Coordena todas as camadas |

## Lacunas a Implementar nas Próximas Fases

| Lacuna | Fase | Prioridade |
|--------|------|-----------|
| Auth + Rate Limit + Correlation ID na entrada | C | Alta |
| Evidence Ledger com hash + dedup + freshness | C | Alta |
| Artifact Registry + Versioning | D | Média |
| 3 Quality Gates (evidência, síntese, artefato) | C | Alta |
| Observabilidade transversal (OTel completo) | F | Média |
| Governança: RBAC + audit_log + approvals | F | Média |
| Backbone durável (Temporal ou LangGraph) | G | Alta |
| Social Adapter (Reddit) | D | Média |
| Academic Adapter (OpenAlex) | D | Média |
| pgvector + hybrid search | E | Média |
| Apresentações HTML premium | D | Alta |

---

## Princípio Final

> **O sistema não precisa de mais agentes. Precisa de mais civilização.**
> Mais contrato. Mais memória. Mais prova. Mais durabilidade. Mais avaliação. Mais governo interno.
>
> **Input → Policy → Plan → Execute → Prove → Reason → Compose → Evaluate → Persist → Observe**
