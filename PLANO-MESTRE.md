# PLANO MESTRE DE IMPLEMENTAÇÃO — ORBIT
# Atualizado em: 24/03/2026

## Estado Atual do Sistema

### Supabase
| Projeto | Ref | Status | Schema |
|---------|-----|--------|--------|
| Principal (usar este) | umwqxkggzrpwknptwwju | ✅ LIMPO | 26 tabelas completas |
| Secundário | aenvpdcwceybzuemczmw | ✅ LIMPO | 9 tabelas simples |

### O Schema do Projeto Principal já tem:
- `jobs`, `commands`, `job_events` — pipeline core
- `research_reports`, `research_sources`, `research_branches`, `research_conflicts` — pesquisa
- `evidence_store` — armazenamento de evidências classificadas
- `dossiers`, `dossier_sources` — dossiês
- `presentations`, `studio_outputs` — apresentações e studio
- `execution_traces`, `execution_checkpoints`, `handoff_log` — rastreabilidade total
- `quality_gates`, `quality_evaluations` — qualidade
- `conversation_memory`, `knowledge_base`, `semantic_entities` — memória e inteligência
- `user_profiles`, `user_preferences` — usuários
- `directives`, `intent_patterns`, `pipeline_configs` — configuração inteligente
- `notifications`, `calendar_events`, `tasks` — utilitários
- RPCs prontos: pop_intent_job, push_intent_job, log_trace, log_quality_eval, etc.

### Conclusão Estratégica
O banco do Projeto Principal é EXATAMENTE o ORBIT.
Não precisamos criar schema — precisamos conectar e construir o código.

---

## FASE A — Fundação do Backend ← PRÓXIMA

### Objetivo
Backend Node.js+TypeScript funcionando, conectado ao Supabase correto,
recebendo webhook do Telegram, criando jobs e respondendo ao usuário.

### Tarefas
- [ ] Inicializar projeto Node.js + TypeScript + Fastify
- [ ] Instalar dependências: @supabase/supabase-js, openai, fastify, zod
- [ ] Configurar Supabase client (projeto umwqxkggzrpwknptwwju)
- [ ] Criar endpoint POST /webhook/telegram
- [ ] Parsear mensagem Telegram → criar command + job no Supabase
- [ ] Criar endpoint GET /health
- [ ] Testar: mensagem no Telegram → job aparece no banco

### Entregável
Sistema recebe mensagem do Telegram e cria job no Supabase.

---

## FASE B — Agente Orquestrador

### Objetivo
Orquestrador que pega jobs da fila, interpreta intenção e distribui.

### Tarefas
- [ ] Implementar worker que faz poll na fila (pop_intent_job_from_queue)
- [ ] Implementar Agente Orquestrador com OpenAI Agents SDK
- [ ] Lógica de match_intent_pattern
- [ ] Handoff para agentes de pesquisa
- [ ] Atualizar status do job em tempo real

---

## FASE C — Pipeline de Pesquisa e Análise

### Objetivo
Pesquisa completa → análise → dossiê funcionando end-to-end.

### Tarefas
- [ ] Agente de Pesquisa Web (web_search nativo OpenAI)
- [ ] Agente de Análise (cruza evidências)
- [ ] Agente Criador de Dossiês
- [ ] Agente Revisor de Qualidade
- [ ] Pipeline completo: Telegram → Dossiê → resposta no Telegram

---

## FASE D — Pesquisa Enriquecida

- [ ] Agente de Pesquisa Social (Reddit)
- [ ] Agente de Pesquisa Acadêmica (OpenAlex)

---

## FASE E — Apresentações HTML

- [ ] Agente Criador de Apresentações
- [ ] Template HTML premium autocontido
- [ ] Salvar no Supabase Storage
- [ ] Enviar link no Telegram

---

## FASE F — Dashboard Web

- [ ] Inicializar React + Vite + Tailwind
- [ ] Dashboard: visão geral de jobs
- [ ] Jobs: lista com status em tempo real (Supabase Realtime)
- [ ] Dossiês: listagem e leitura
- [ ] Apresentações: visualização inline
- [ ] Studio: SWOT, fontes, traces

---

## FASE G — Robustez e Produção

- [ ] Dead letter queue para jobs falhos
- [ ] Retry automático com backoff exponencial
- [ ] Alertas de falha via Telegram
- [ ] Testes de integração
- [ ] Deploy (backend + frontend)

---

## Próximo Comando

Me diga: **"inicie a Fase A"** e começo agora.
