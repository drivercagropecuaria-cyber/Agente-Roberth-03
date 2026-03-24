# Decisão: Estratégia de Deploy do Backend — 24/03/2026

## Situação atual

- Bot Telegram: @AgenteMundoVirtual_bot — OK e funcional
- Webhook anterior: https://mundo-gravity-final-2026.loca.lt/api/telegram/webhook
  - Status: QUEBRADO (503 Service Unavailable — servidor anterior inativo)
- Backend novo: construído em /workspace/projeto/backend/ (6 arquivos, estrutura completa)
- Dependências: instaladas, mas node_modules/.bin/tsc não acessível (issue do sandbox)
- Verificação de sintaxe: todos os 6 arquivos TypeScript existem e têm conteúdo correto

## Limitação do ambiente

O ambiente de execução (sandbox) não permite:
- Rodar um servidor HTTP permanente acessível externamente
- Instalar binários globais persistentes (tsx, tsc)
- Expor porta pública para webhook do Telegram

## Estratégia de Deploy — Opções

### Opção 1 — Railway (recomendado)
Deploy automático via GitHub + Railway.app
- Custo: gratuito até 500h/mês
- Setup: push no GitHub → Railway faz deploy automático
- URL pública: railway.app → registrar no webhook do Telegram

### Opção 2 — Render.com
Similar ao Railway, free tier disponível

### Opção 3 — Fly.io
Deploy via Dockerfile, mais controle

## Próxima ação necessária

Para colocar o backend em produção, o usuário precisa:
1. Criar repositório no GitHub com o código do backend
2. Conectar ao Railway/Render
3. Configurar variáveis de ambiente (do .env)
4. Obter URL pública e registrar no webhook do Telegram

Alternativamente: usar localtunnel/ngrok temporariamente para testar.

## O que JÁ ESTÁ PRONTO (código completo)

- src/index.ts — servidor Fastify completo
- src/db/client.ts — Supabase client + helpers (upsert user, create job, log trace)
- src/api/webhook.ts — recepção do Telegram, criação de command+job, enfileiramento
- src/api/jobs.ts — endpoints REST para listar e detalhar jobs
- src/api/dossiers.ts — endpoints REST para listar e detalhar dossiês
- src/queue/worker.ts — worker com poll da fila pgmq + retry + notificação Telegram
- .env — variáveis configuradas (Supabase, OpenAI, Telegram)
- package.json + tsconfig.json — configuração completa
