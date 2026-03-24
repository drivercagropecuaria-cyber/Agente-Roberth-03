# ARQUITETURA DO SISTEMA — ORBIT

## Visão Geral em Camadas

```
┌─────────────────────────────────────────────────────────┐
│                    CAMADA DE ENTRADA                    │
│          Telegram Bot  |  Dashboard Web                 │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                  CAMADA DE RECEPÇÃO                     │
│    Webhook Handler  |  API Gateway  |  Command Parser   │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                 CAMADA DE ORQUESTRAÇÃO                  │
│           Agente Orquestrador (OpenAI SDK)              │
│     Handoffs | Quality Gates | Session Management       │
└──┬──────────┬──────────┬──────────┬────────────────────-┘
   │          │          │          │
┌──▼──┐  ┌───▼───┐  ┌───▼──┐  ┌───▼──────────┐
│PESQ │  │PESQ   │  │PESQ  │  │  ANÁLISE     │
│WEB  │  │SOCIAL │  │ACAD  │  │              │
└──┬──┘  └───┬───┘  └───┬──┘  └───┬──────────┘
   └─────────┴──────────┴─────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│              CAMADA DE DOCUMENTAÇÃO                     │
│        Agente Criador de Dossiês                        │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│              CAMADA DE APRESENTAÇÃO                     │
│        Agente Criador de Apresentações HTML             │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│              CAMADA DE QUALIDADE                        │
│        Agente Revisor de Qualidade                      │
│        Quality Gates | Thresholds | Retry               │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│               CAMADA DE PERSISTÊNCIA                    │
│  Supabase PostgreSQL | Storage | pgmq Queues | Realtime │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│             CAMADA DE OBSERVABILIDADE                   │
│         Tracing | Logs | Métricas | Alertas             │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│             DASHBOARD / STUDIO                          │
│  Jobs | Dossiês | Apresentações | Fontes | SWOT | QA   │
└─────────────────────────────────────────────────────────┘
```

---

## Stack Técnica

### Backend
| Componente | Tecnologia | Justificativa |
|-----------|-----------|---------------|
| Runtime | Node.js (TypeScript) | Ecossistema rico, OpenAI SDK oficial |
| Framework | Fastify | Performance, schema nativo, plugins |
| Agentes | OpenAI Agents SDK (JS) | Handoffs, tracing, guardrails nativos |
| Filas | Supabase pgmq | Durabilidade, sem infra extra |
| Jobs worker | Worker separado | Desacoplamento, resiliência |

### Frontend
| Componente | Tecnologia | Justificativa |
|-----------|-----------|---------------|
| Framework | React + Vite + TypeScript | Padrão moderno, performance |
| Estilo | Tailwind CSS | Utilidades, consistência visual |
| UI Components | shadcn/ui | Componentes acessíveis e customizáveis |
| Estado | React Query + Zustand | Cache, estado global simples |
| Realtime | Supabase Realtime | Updates ao vivo no dashboard |
| Roteamento | React Router v6 | SPA com múltiplas rotas |

### Banco de Dados
| Componente | Tecnologia | Justificativa |
|-----------|-----------|---------------|
| Principal | Supabase (PostgreSQL) | Dados estruturados, RLS, Auth |
| Storage | Supabase Storage | Artifacts, apresentações HTML |
| Filas | pgmq (via Supabase) | Jobs duráveis, retry nativo |
| Realtime | Supabase Realtime | Updates em tempo real |

### Integrações
| Integração | Uso |
|-----------|-----|
| OpenAI API | Agentes, GPT-4o, web search nativo |
| Telegram Bot API | Canal de entrada principal |
| OpenAI File Search | Busca em documentos indexados |

---

## Estrutura de Diretórios do Aplicativo

```
orbit/
├── backend/                    # Backend Node.js + TypeScript
│   ├── src/
│   │   ├── agents/             # Agentes OpenAI SDK
│   │   │   ├── orchestrator.ts
│   │   │   ├── research.ts
│   │   │   ├── social-research.ts
│   │   │   ├── scholarly-research.ts
│   │   │   ├── analysis.ts
│   │   │   ├── dossier.ts
│   │   │   ├── presentation.ts
│   │   │   └── quality-review.ts
│   │   ├── api/                # Rotas Fastify
│   │   │   ├── webhook.ts      # Telegram webhook
│   │   │   ├── jobs.ts         # CRUD de jobs
│   │   │   ├── dossiers.ts     # CRUD de dossiês
│   │   │   └── presentations.ts
│   │   ├── contracts/          # Schemas/contratos de dados
│   │   │   └── index.ts
│   │   ├── db/                 # Supabase client + queries
│   │   │   ├── client.ts
│   │   │   └── queries.ts
│   │   ├── queue/              # pgmq worker
│   │   │   └── worker.ts
│   │   ├── services/           # Lógica de negócio
│   │   └── utils/
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/                   # React + Vite + Tailwind
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Jobs.tsx
│   │   │   ├── Dossiers.tsx
│   │   │   ├── Presentations.tsx
│   │   │   └── Studio.tsx
│   │   ├── components/
│   │   ├── hooks/
│   │   └── lib/
│   └── package.json
│
└── banco/                      # SQL migrations Supabase
    ├── 001_schema_inicial.sql
    ├── 002_filas.sql
    └── 003_rls.sql
```
