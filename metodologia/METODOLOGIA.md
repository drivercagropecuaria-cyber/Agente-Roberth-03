# METODOLOGIA DE TRABALHO — ORBIT

## Princípios Fundamentais

| # | Princípio | O que significa na prática |
|---|-----------|---------------------------|
| 1 | **Entender antes de executar** | Nenhum código é escrito sem contexto claro |
| 2 | **Artifacts verificáveis** | Toda execução produz evidência inspecionável |
| 3 | **Rastreabilidade total** | Decisões registradas, mudanças documentadas |
| 4 | **Qualidade não é opcional** | Quality gates antes de cada entrega |
| 5 | **Padrões sobre improviso** | Processos repetidos viram workflows reutilizáveis |

---

## Ciclo de Trabalho

```
1. RECEBER TAREFA
   → Ler contexto completo
   → Identificar tipo (feature / bug / pesquisa / docs / integração)
   → Selecionar workflow correspondente

2. PLANEJAR
   → Definir escopo claro
   → Identificar dependências
   → Estimar risco
   → Registrar plano em /projeto/planos/

3. EXECUTAR
   → Editor → alterações estruturais de código
   → Terminal → builds, testes, scripts, logs
   → Browser → validação visual e UX
   → Agentes → paralelismo e tarefas longas

4. VERIFICAR
   → Rodar quality gate do tipo de entrega
   → Validar no browser quando há interface
   → Validar no terminal quando há código/integração
   → Corrigir falhas antes de prosseguir

5. REGISTRAR
   → Decisão relevante → /projeto/decisoes/
   → Aprendizado → /projeto/memoria/
   → Insight duradouro → MEMORY.md
   → Evidência importante → /projeto/artifacts/

6. AVANÇAR
   → Marcar tarefa concluída
   → Identificar próximo gargalo
   → Repetir ciclo
```

---

## Tipologia de Tarefas e Workflows

| Tipo de Tarefa | Workflow a Usar | Agentes Envolvidos |
|---------------|----------------|--------------------|
| Nova feature | workflow-feature.md | Orquestrador, Qualidade |
| Correção de bug | workflow-bug.md | Orquestrador, Qualidade |
| Pesquisa de tema | workflow-pesquisa.md | Pesquisa Web, Social, Acadêmica |
| Integração com API | workflow-integracao.md | Orquestrador |
| Geração de dossiê | workflow-dossie.md | Pesquisa, Análise, Dossiê, Qualidade |
| Geração de apresentação | workflow-apresentacao.md | Dossiê, Apresentação, Qualidade |
| Auditoria de banco | workflow-auditoria-banco.md | Orquestrador |
| Criação de agente | workflow-novo-agente.md | Orquestrador |
| Revisão de qualidade | workflow-qualidade.md | Qualidade |
| Testes e validação | workflow-testes.md | Qualidade |

---

## Uso das Superfícies

| Superfície | Quando Usar | Exemplos |
|-----------|-------------|---------|
| Editor (write/edit/read) | Alterações de código, revisão estrutural | Criar arquivo, refatorar módulo |
| Terminal (exec) | Builds, testes, scripts, inspeções | npm install, npm test, logs |
| Browser | Validação visual, testes de UX | Verificar dashboard, testar fluxo |
| Agentes (sessions_spawn) | Paralelismo, tarefas longas | Subagente de codificação |
| Arquivos/Artifacts | Evidências, dossiês, apresentações | HTML gerado, relatório de QA |
| Memória | Padrões, decisões, aprendizados | Registrar escolha de arquitetura |

---

## Regra de Ouro

Nunca encerre uma tarefa sem validação.
Nunca valide sem critério.
Nunca execute sem plano.
