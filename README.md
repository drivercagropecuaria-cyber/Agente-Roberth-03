# ORBIT — Agente Roberth 🛸

Plataforma de Inteligência Aplicada — agentiva, modular e visualmente premium.

## O que é

Sistema que recebe comandos via **Telegram** ou **Dashboard Web**, aciona múltiplos agentes especializados de IA e entrega dossiês analíticos profundos + apresentações HTML modernas.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js + TypeScript + Fastify |
| Agentes | OpenAI Agents SDK + GPT-4o |
| Banco | Supabase (26 tabelas + pgmq) |
| Frontend | React + Vite + TypeScript + Tailwind |
| Entrada | Telegram Bot @AgenteMundoVirtual_bot |

## Estrutura do Repositório

```
├── backend/          Node.js + TypeScript + Fastify
│   ├── src/
│   │   ├── agents/   8 agentes especializados
│   │   ├── api/      webhook Telegram + REST
│   │   ├── db/       Supabase client + helpers
│   │   └── queue/    worker pgmq
│   └── .env          variáveis de ambiente (não commitar!)
│
├── frontend/         React + Vite + Tailwind
│   └── orbit-frontend/src/
│       └── App.tsx   Dashboard principal
│
├── metodologia/      Como o sistema opera
├── agentes/          Perfis dos 8 agentes + contratos de dados
├── workflows/        Receitas de execução reutilizáveis
├── diretivas/        Regras e critérios de qualidade
└── decisoes/         Registro de decisões arquiteturais
```

## Status

| Fase | Status |
|------|--------|
| A — Fundação (Backend + Webhook) | ✅ Código pronto |
| B — Pipeline Core (Agentes) | 🔄 Em construção |
| C — Pesquisa Enriquecida | ⏳ Aguardando B |
| D — Apresentações HTML | ⏳ Aguardando B |
| E — Dashboard React | ✅ Código base pronto |
| F — Robustez | ⏳ Após B |

## Variáveis de Ambiente Necessárias

```env
SUPABASE_URL=https://umwqxkggzrpwknptwwju.supabase.co
SUPABASE_SERVICE_KEY=...
OPENAI_API_KEY=...
TELEGRAM_BOT_TOKEN=...
WEBHOOK_URL=https://seu-dominio.com
PORT=3000
```

## Bot Telegram

[@AgenteMundoVirtual_bot](https://t.me/AgenteMundoVirtual_bot)

---
*Construído pelo ORBIT Agent 🛸*
