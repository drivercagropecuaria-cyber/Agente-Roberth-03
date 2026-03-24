# ARQUITETURA ORBIT 2026 — Revisada e Expandida
# Atualizado em: 24/03/2026 — incorpora análise crítica de arquitetura avançada

## Diagnóstico da Arquitetura Anterior

A arquitetura v1 era um encadeamento linear de agentes (1→2→3→4→5→6).
Funcionava como protótipo inteligente, mas tinha limitações críticas para produção:

| Problema | Impacto |
|---------|---------|
| Sem classificação de intenção/profundidade | Todo pedido recebe o mesmo ritual completo |
| Orquestrador misturava controle e execução | Fragilidade, difícil retomar após falha |
| Pesquisa como bloco único paralelo | Sem contrato de evidência comum, sem normalização |
| Score único 7/10 | Sem diagnóstico de qual dimensão falhou |
| Memória plana | Sem episódica, semântica, procedural |
| Sem interrupção humana nativa | Aprovação não é primitivo, é gambiarra |
| Logs soltos | Sem rastreabilidade correlacionada por job/agent/evidence |

---

## Arquitetura ORBIT 2026 — 11 Camadas Vivas

```
┌──────────────────────────────────────────────────────────────────┐
│  CAMADA 1 — ENTRADA                                              │
│  Telegram Bot | Dashboard Web | API Pública                      │
└──────────────────────────┬───────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────────┐
│  CAMADA 2 — INTAKE ROUTER + POLICY & BUDGET GATE                │
│  • Classificador de intenção (risco, urgência, profundidade)     │
│  • Orçamento de tokens/custo por tipo de pedido                  │
│  • Roteamento: resposta rápida | pesquisa | dossiê | apresentação│
│  • Bloqueio de ações que requerem aprovação humana               │
└──────────────────────────┬───────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────────┐
│  CAMADA 3 — PLANNER / ORQUESTRADOR (Control Plane)              │
│  Produz plano DECLARATIVO:                                       │
│  • objetivo, subtarefas, fontes permitidas                       │
│  • limite de custo, prazo, regras de citação                     │
│  • critérios de qualidade, condições de parada                   │
│  • largura adaptativa: 3 ramos (simples) → 24 ramos (dossiê)    │
└──────────────────────────┬───────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────────┐
│  CAMADA 4 — WORKFLOW RUNTIME DURÁVEL (Execution Plane)          │
│  • Executa o plano com filas, checkpoints, retries               │
│  • Estado persistido no Supabase (execution_checkpoints)         │
│  • Suporte a pause/resume/retry por checkpoint                   │
│  • Interrupções humanas nativas (interrupt → Telegram → resume)  │
└──────────────────────────┬───────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────────┐
│  CAMADA 5 — RETRIEVAL FABRIC (Fan-out Adaptativo)               │
│  Adaptadores com contrato comum: query, filters, freshness,      │
│  source_quality, license, evidence_type                          │
│  • Web Search (OpenAI nativo)                                    │
│  • Social (Reddit, fóruns)                                       │
│  • Acadêmico (OpenAlex, Semantic Scholar)                        │
│  • Arquivos internos (File Search)                               │
│  • Knowledge Base interna (busca híbrida: keyword + semântica)  │
│  • MCP servers remotos (protocolo comum)                         │
└──────────────────────────┬───────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────────┐
│  CAMADA 6 — NORMALIZADOR DE EVIDÊNCIAS                          │
│  Cada resultado → formato canônico:                              │
│  { claim, source, timestamp, confidence, quote, url,             │
│    contradictions, topic_tags, evidence_class }                  │
│  → Grafo de Evidências (conflitos, duplicatas, lacunas)          │
└──────────────────────────┬───────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────────┐
│  CAMADA 7 — SYNTHESIZER                                         │
│  • Tese central, eixos, divergências                             │
│  • Conclusões com incertezas quantificadas                       │
│  • SWOT estruturado                                              │
│  Separado do Artifact Generator: "pensar ≠ formatar"            │
└──────────────────────────┬───────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────────┐
│  CAMADA 8 — ARTIFACT GENERATOR                                  │
│  Do mesmo núcleo de evidência, gera múltiplos formatos:         │
│  • Dossiê HTML premium                                           │
│  • Resumo Telegram (4096 chars max)                              │
│  • Briefing executivo (PDF/texto)                                │
│  • Dashboard card (JSON estruturado)                             │
│  • Memória persistente (knowledge_base)                          │
└──────────────────────────┬───────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────────┐
│  CAMADA 9 — QA MULTIDIMENSIONAL + REPAIR LOOP                  │
│  Scorecard por eixo (0-10 cada):                                │
│  factualidade | cobertura | recência | qualidade_fontes          │
│  coerência | rastreabilidade | utilidade | custo | latência      │
│                                                                  │
│  Repair Loop:                                                    │
│  factualidade falhou → volta para evidência                      │
│  cobertura falhou → reabre pesquisa                              │
│  clareza falhou → reescreve o artefato                           │
└──────────────────────────┬───────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────────┐
│  CAMADA 10 — MEMÓRIA EM 4 NÍVEIS                                │
│  • Execução: estado do job atual (execution_checkpoints)         │
│  • Episódica: casos anteriores parecidos (conversation_memory)   │
│  • Semântica: fatos/entidades consolidados (semantic_entities)   │
│  • Procedural: como resolver tarefas similares (directives)      │
└──────────────────────────┬───────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────────┐
│  CAMADA 11 — OBSERVABILIDADE + GOVERNANÇA                       │
│  • OpenTelemetry: traces, metrics, logs correlacionados          │
│  • Correlação: job_id, run_id, agent_id, tool_id, evidence_id   │
│  • Política de execução (fontes, dados, aprovação, orçamento)    │
│  • Classificação de sensibilidade                                │
│  • Retenção de artefatos                                         │
└──────────────────────────┬───────────────────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │   PERSISTÊNCIA          │
              │   Supabase (tudo)       │
              │   26 tabelas + vetores  │
              │   Storage + pgmq        │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │   SAÍDA                 │
              │   Telegram + Dashboard  │
              │   Cockpit de Evidência  │
              └─────────────────────────┘
```

---

## O que Muda no Código — Impacto por Camada

### Camada 2 — Intake Router (NOVO)
Arquivo: `src/services/intake-router.ts`
- Classificar intenção via LLM leve (gpt-4o-mini)
- Decidir: quick_answer | research | dossier | presentation
- Definir: max_tokens, max_sources, max_branches, deadline

### Camada 3 — Planner separado do Orquestrador (REFATORAR)
Arquivo: `src/agents/planner.ts` (separado de orchestrator.ts)
- Output: DeclarativePlan (JSON estruturado com regras)
- Orquestrador passa a ser executor do plano, não criador

### Camada 5 — Retrieval Fabric com contrato comum (EXPANDIR)
Arquivo: `src/retrieval/` (pasta nova)
- `adapters/web.ts`, `adapters/social.ts`, `adapters/scholarly.ts`
- `adapters/knowledge-base.ts` (busca híbrida interna)
- Contrato: `EvidenceSource { query, url, snippet, quality, license, freshness }`

### Camada 6 — Evidence Normalizer (NOVO)
Arquivo: `src/services/evidence-normalizer.ts`
- Converter qualquer fonte para `EvidenceClaim`
- Detectar conflitos, duplicatas e lacunas
- Persistir em `evidence_store`

### Camada 7+8 — Synthesizer separado do Artifact Generator (REFATORAR)
- `src/agents/synthesizer.ts` → produz SynthesisCore
- `src/agents/artifact-generator.ts` → transforma em múltiplos formatos

### Camada 9 — QA Multidimensional (EXPANDIR)
Arquivo: `src/agents/quality-reviewer.ts` (expandir)
- 9 dimensões em vez de score único
- Repair loop por dimensão com agente responsável

### Camada 10 — Memória em 4 Níveis (USAR SCHEMA)
- Já existe no Supabase: execution_checkpoints, conversation_memory, semantic_entities, directives
- Implementar serviço de memória: `src/services/memory.ts`

### Camada 11 — Observabilidade (NOVO)
Arquivo: `src/utils/telemetry.ts`
- Wrapper sobre console.log atual
- Adicionar correlação por job_id/agent/step
- Preparado para exportar OTel no futuro

---

## O que SE MANTÉM (stack atual é sólido)

| Componente | Decisão |
|-----------|---------|
| Supabase | ✅ Mantém — banco, storage, pgmq, vetores, realtime |
| Fastify | ✅ Mantém — webhook, REST API |
| OpenAI Agents SDK | ✅ Mantém — agentes, handoffs, tools |
| Telegram | ✅ Mantém — entrada principal |
| React + Tailwind | ✅ Mantém — dashboard |

---

## Impacto no Plano de Implementação

A Fase B incorpora Camadas 2, 3, 4, 5 da nova arquitetura.
As Fases C e D constroem Camadas 6, 7, 8 e 9.
A Fase F constrói Camadas 10 e 11.

---

## Princípio Adotado

> "Menos agentes falando entre si, mais civilização de agentes operando sobre regras, memória e prova."
