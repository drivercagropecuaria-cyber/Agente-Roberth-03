# CRITÉRIOS DE QUALIDADE — ORBIT

## Código
- Tipagem forte (TypeScript strict)
- Sem any desnecessário
- Funções com responsabilidade única
- Nomes descritivos (sem abreviações obscuras)
- Tratamento explícito de erros
- Logs estruturados (nunca console.log em produção)

## Arquitetura
- Separação clara de camadas (entrada / orquestração / domínio / persistência)
- Sem acoplamento desnecessário entre módulos
- Contratos de dados definidos entre agentes
- Idempotência nos jobs críticos

## Banco de Dados
- Migrations versionadas e reversíveis
- Índices nos campos de busca frequente
- RLS ativo para dados sensíveis
- Sem N+1 queries

## Agentes
- Missão única e clara por agente
- Inputs e outputs tipados com schema
- Quality gate definido e aplicado
- Tracing completo

## Workflows
- Cada passo com responsável claro
- Gates de validação entre etapas
- Retry documentado
- Idempotente sempre que possível

## Documentação
- Todo arquivo com header explicativo
- Decisões registradas com data e justificativa
- Workflows com passo a passo completo
- Contratos de dados versionados

## Integrações
- Timeout configurado em todas as chamadas externas
- Retry com backoff exponencial
- Fallback quando possível
- Logs de entrada e saída

## Interface (UI)
- Responsividade em mobile, tablet e desktop
- Feedback visual de progresso em operações longas
- Estado de erro tratado e exibido
- Acessibilidade básica (contraste, labels)

## Apresentações HTML
- HTML autocontido (sem CDN externo)
- Todas as seções obrigatórias presentes
- SWOT visual claramente identificável
- Legível em tela de qualquer tamanho

## Confiabilidade Operacional
- Nenhum job pode perder estado sem registro
- Filas com dead letter queue
- Health check endpoint disponível
- Alertas para falhas críticas
