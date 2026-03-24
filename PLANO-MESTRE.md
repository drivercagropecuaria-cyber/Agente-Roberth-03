# PLANO MESTRE DE IMPLEMENTAÇÃO — ORBIT
# Atualizado em: 24/03/2026 — pós análise arquitetural v3

## Estado Atual do Sistema

| Componente | Status | Detalhe |
|-----------|--------|---------|
| Backend Render | 🟢 ONLINE | https://agente-roberth-03.onrender.com |
| Webhook Telegram | 🟢 ATIVO | /webhook/telegram |
| Dashboard React v2 | 🟢 ONLINE (Fase E) | https://9ynuhgazlzyw.space.minimax.io |
| GitHub | 🟢 Sincronizado | cfd7cd3 |
| Supabase | 🟢 Limpo e conectado | umwqxkggzrpwknptwwju (26 tabelas) |
| Pipeline agentivo | 🟡 Implantado | Fase B completa — 11 camadas básicas |
| Apresentações HTML | ⏳ Pendente | Fase D |
| Pesquisa Social/Acadêmica | ⏳ Pendente | Fase D |
| Evidence Ledger completo | ⏳ Pendente | Fase C |
| QA com 3 gates | ⏳ Pendente | Fase C |
| Observabilidade OTel | ⏳ Pendente | Fase F |
| Governança RBAC | ⏳ Pendente | Fase F |

---

## FASE A — Fundação ✅ CONCLUÍDA
- Backend Node.js + Fastify online
- Webhook Telegram ativo
- Supabase conectado
- Worker de fila funcional

## FASE B — Pipeline Core ✅ CONCLUÍDA
- Intake Router (Camada 2)
- Planner declarativo (Camada 3)
- Research Agent com web search (Camada 5)
- Evidence Normalizer básico (Camada 6)
- Analysis + Synthesizer (Camadas 7-8)
- Quality Reviewer 5 dimensões (Camada 10)
- Orchestrator coordenando tudo
- Memória em 4 níveis (Camada 7)
- Telemetria estruturada básica

## FASE C — Evidência Robusta ✅ CONCLUÍDA

### Objetivo
Fechar as 3 lacunas críticas de qualidade identificadas na análise v3.

### Tarefas
- [x] Auth + Rate Limit + Correlation ID no webhook (Camada 1)
- [x] Evidence Ledger com hash, dedup, freshness scorer (Camada 6)
- [x] Contradiction Detector melhorado
- [x] 3 Quality Gates (evidência, síntese, artefato)
- [x] QA expandido para 9 dimensões (+ recência, latência, custo)
- [x] Repair loop por dimensão (ampliar pesquisa, refinar síntese)

### Entregável
Sistema com evidência rastreável e qualidade em 3 pontos do pipeline.

---

## FASE D — Pesquisa Enriquecida + Apresentações ✅ CONCLUÍDA

### Objetivo
Artefatos mais ricos e pesquisa mais abrangente.

### Tarefas
- [x] Social Adapter (Reddit + fóruns via web_search)
- [x] Academic Adapter (OpenAlex + Google Scholar fallback)
- [x] Artifact Generator: HTML Premium autocontido (dark mode, SWOT, QA scorecard, fontes)
- [x] Artifact Generator: Card de dashboard JSON estruturado
- [x] Artifact Registry com hash SHA-256 + versioning + Storage
- [x] HTML salvo no Storage + link enviado no Telegram

---

## FASE E — Dashboard Completo ✅ CONCLUÍDA

### Objetivo
Interface web completa para acompanhar tudo.

### Tarefas
- [x] Jobs: lista em tempo real (Supabase Realtime + filtros + stats)
- [x] Dossiês: listagem completa + leitura + iframe HTML + fontes (Web/Social/Acadêmico)
- [x] Evidence Graph: ledger completo, distribuição de confiança por classe
- [x] Apresentações: iframe inline + link público Storage + download
- [x] Studio: QA radar por dimensão, tendência de score, detalhe por avaliação
- [x] Quality Reports: scores por dimensão integrados no Studio
- [x] Cost Monitor: tokens por agente, custo estimado, latência, tendência

### Deploy
- URL: https://9ynuhgazlzyw.space.minimax.io
- Páginas: Jobs | Dossiês | Evidências | Studio | Qualidade
- Stack: React 18 + TypeScript + Tailwind + Recharts + Supabase Realtime

---

## FASE F — Robustez e Observabilidade ✅ CONCLUÍDA

### Objetivo
Sistema confiável para uso real em produção.

### Tarefas
- [x] pgvector + embeddings automáticos (text-embedding-3-small via OpenAI)
- [x] Hybrid search: FTS + semântico (cosine similarity) com RRF Fusion
- [x] Knowledge Base: indexação automática pós-job + persistência na KB
- [x] OpenTelemetry estruturado: trace_id × span_id × job_id × agent correlacionados
- [x] Governança: RBAC por role (admin/analyst/viewer/blocked) + cache TTL 5min
- [x] Audit Log estruturado por job_id, telegram_id, action, result
- [x] Source Policy: controle de acesso a fontes por role
- [x] Alertas de falha via Telegram: job falho, taxa de erro, QA baixo, custo alto
- [x] Retry com backoff exponencial: 1s → 2s → 4s → ... → 32s (max 3 tentativas)
- [x] Monitor periódico de métricas: checkMetricsAndAlert a cada 10 polls
- [x] Webhook integrado com RBAC (governance check pré-job)

### Commit
- `d01590e` — 967 linhas novas em 8 arquivos

---

## FASE G — Execução Durável (Temporal/LangGraph) ← PRÓXIMA

### Objetivo
Backbone de workflow durável para jobs longos e críticos.

### Tarefas
- [ ] Avaliar: Temporal vs LangGraph para o perfil do ORBIT
- [ ] Implementar retomada por checkpoint em falhas
- [ ] Human-in-the-loop nativo (interrupt → Telegram → resume)
- [ ] Dead letter queue com replay

---

## Próximo Comando

Me diga: **"inicie a Fase C"** para implementar as lacunas críticas de evidência e qualidade.
