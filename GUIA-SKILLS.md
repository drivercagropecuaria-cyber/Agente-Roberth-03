# Como Criar e Publicar uma Skill — Guia Completo

## O que é uma Skill

Uma skill é um pacote modular que estende as capacidades do agente.
É um diretório com um arquivo `SKILL.md` obrigatório e recursos opcionais.

---

## Estrutura de uma Skill

```
minha-skill-1.0.0/
├── SKILL.md              ← OBRIGATÓRIO — missão, instruções, quando usar
├── _meta.json            ← metadados do pacote
└── references/           ← documentação carregada sob demanda
    ├── schema.md
    ├── exemplos.md
    └── contratos.md
└── assets/               ← arquivos usados no output (templates, imagens)
└── scripts/              ← scripts executáveis (Python, Bash)
```

---

## SKILL.md — Estrutura

```markdown
---
name: nome-da-skill
description: >
  Descrição clara de O QUE faz e QUANDO usar.
  Inclua triggers explícitos (palavras que ativam esta skill).
---

# Nome da Skill

## Contexto
[Contexto necessário para o agente operar]

## Como Usar
[Instruções de uso]

## Referências
- Ver references/schema.md para o schema completo
- Ver references/exemplos.md para exemplos de código
```

---

## 3 Formas de Criar uma Skill

### Forma 1 — Via Chat (mais simples)
Me diga o que a skill deve fazer e eu crio tudo automaticamente.
Exemplo: "Crie uma skill para pesquisa no PubMed e geração de relatórios acadêmicos."

### Forma 2 — Via Arquivos
Você cria os arquivos manualmente em `/workspace/skills/nome-da-skill-versão/`
e eu valido, ajusto e empacoto.

### Forma 3 — Via ClawHub (para publicar publicamente)
Após criar localmente, publique no ClawHub para que outros possam instalar.

---

## Publicar no ClawHub

### Passo 1 — Obter o token
Acesse: https://clawhub.ai/settings/tokens
Gere um token de acesso pessoal.

### Passo 2 — Login via CLI (eu faço por você)
```bash
npx clawhub@latest login --token SEU_TOKEN_AQUI
```

### Passo 3 — Publicar
```bash
npx clawhub@latest publish /workspace/skills/nome-da-skill-1.0.0
```

### Passo 4 — Verificar
Acesse: https://clawhub.ai/skills/nome-da-skill

---

## Skills Criadas neste Workspace

| Skill | Versão | Local | Pacote |
|-------|--------|-------|--------|
| orbit-platform | 1.0.0 | /workspace/skills/orbit-platform-1.0.0/ | /workspace/skills/dist/orbit-platform-1.0.0.skill |

---

## Skills Já Instaladas

| Skill | Versão | Propósito |
|-------|--------|-----------|
| automation-workflows | 0.1.0 | Automação de workflows para solopreneurs |
| cron-mastery | 1.0.3 | Sistema de agendamento e lembretes |
| find-skills | 0.1.0 | Descobrir e instalar novas skills |
| maxclaw-helper | 1.1.0 | Guia de uso e diagnóstico do MaxClaw |
| self-improving-agent | 1.0.11 | Captura de aprendizados e correções |

---

## Para Publicar a orbit-platform no ClawHub

Me forneça seu token do ClawHub e eu publico imediatamente:
`npx clawhub@latest login --token SEU_TOKEN`
`npx clawhub@latest publish /workspace/skills/orbit-platform-1.0.0`
