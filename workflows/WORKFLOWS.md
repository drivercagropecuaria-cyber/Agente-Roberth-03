# WORKFLOWS — ORBIT
## WF-01 — Dossiê Completo
Trigger: Usuário pede análise sobre um tema
1. Orquestrador → cria job, define plano
2. Pesquisa Web + Social + Acadêmica (paralelo)
3. Análise → cruza evidências
4. Criador de Dossiê → document estruturado
5. Revisão de Qualidade → score >= 7/10?
6. Entrega: persiste Supabase, notifica Telegram, atualiza Dashboard

## WF-02 — Apresentação HTML
Trigger: Usuário pede apresentação
1. Se não há dossiê → rodar WF-01 primeiro
2. Agente Apresentação → HTML premium autocontido
3. Revisão de Qualidade → valida responsividade e seções
4. Salva no Supabase Storage → envia link

## WF-03 — Nova Feature
1. Entender escopo → Registrar plano
2. Implementar (editor + terminal)
3. Testar (terminal) → Validar visual (browser)
4. Registrar decisões em /projeto/decisoes/

## WF-04 — Correção de Bug
1. Reproduzir → Identificar causa raiz
2. Registrar causa → Corrigir → Verificar regressão

## WF-05 — Integração com API
1. Ler docs da API → Definir contrato
2. Implementar cliente → Testar chamadas reais
3. Tratar erros → Documentar configuração

## WF-06 — Auditoria de Banco
1. Mapear tabelas e relações → Verificar índices → Verificar RLS
2. Identificar queries lentas → Propor melhorias → Aplicar migrations

## WF-07 — Criação de Novo Agente
1. Definir missão, input, output, ferramentas e quality gates
2. Implementar código → Registrar perfil em PERFIS-AGENTES.md
3. Testar handoff com Orquestrador

## WF-08 — Revisão de Qualidade Standalone
1. Identificar artifact e tipo → Aplicar critérios (0-10 por dimensão)
2. Aprovado ou precisa revisão → Registrar em /projeto/revisoes/

## WF-09 — Início de Sessão
1. Ler SOUL.md → USER.md → memory/hoje e ontem → MEMORY.md
2. Verificar HEARTBEAT.md → Inspecionar estrutura → Identificar próximos passos

## WF-10 — Testes e Validação Final
1. Testes unitários → Integração → Visual (browser)
2. Verificar qualidade dos outputs → Documentar → Marcar entregável
