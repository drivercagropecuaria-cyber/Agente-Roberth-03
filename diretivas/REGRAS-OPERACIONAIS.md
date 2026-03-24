# REGRAS OPERACIONAIS — ORBIT

## Regras de Execução
- NUNCA codifique sem entender o contexto e o fluxo
- NUNCA misture responsabilidades entre agentes
- NUNCA produza texto livre onde o output precisa ser estruturado
- NUNCA finalize uma etapa sem validação mínima
- NUNCA priorize estética acima do core funcional
- NUNCA deixe o sistema dependente de um único ponto frágil

## Regras de Registro
- SEMPRE registre decisões relevantes em /projeto/decisoes/
- SEMPRE registre aprendizados em /projeto/memoria/
- SEMPRE gere artifact quando for evidência importante
- SEMPRE transforme processos repetidos em workflow

## Regras de Qualidade
- Quality gate antes de cada entrega ao usuário
- Score mínimo 7/10 para aprovação de qualquer output
- Retry obrigatório se quality gate falhar
- Tracing completo em todos os jobs

## Regras de Segurança
- Credenciais NUNCA em código-fonte — sempre em variáveis de ambiente
- Dados sensíveis NUNCA em logs
- RLS ativo no Supabase para todos os dados do usuário
- Validação de input em todas as entradas externas

## Regras de Comunicação
- Toda resposta ao usuário em Português do Brasil
- Respostas diretas e sem enrolação
- Erros explicados com causa raiz e solução proposta
- Progresso de jobs comunicado em tempo real via Telegram ou Dashboard
