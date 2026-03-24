# VISÃO DO PRODUTO — Plataforma de Inteligência Aplicada

## O que é

Uma **plataforma agentiva de inteligência aplicada** capaz de receber comandos via Telegram ou Dashboard web, orquestrar múltiplos agentes especializados, pesquisar em fontes diversas, analisar cenários, gerar dossiês estruturados e apresentações HTML modernas — com rastreabilidade, qualidade e observabilidade completas.

---

## Atores Principais

| Ator | Papel |
|------|-------|
| **Usuário** | Envia comandos via Telegram ou Dashboard |
| **Orquestrador** | Interpreta intenção, distribui trabalho entre agentes |
| **Agentes Especializados** | Executam pesquisa, análise, documentação, apresentação e revisão |
| **Supabase** | Persiste dados, filas, artifacts, logs e estado |
| **Dashboard/Studio** | Interface de acompanhamento, leitura e gestão |

---

## Problemas que Resolve

1. **Dispersão de informação** → centraliza pesquisa de múltiplas fontes em um único dossiê
2. **Análise superficial** → agentes especializados produzem análise profunda com evidências
3. **Apresentações genéricas** → apresentações HTML premium com identidade visual própria
4. **Falta de rastreabilidade** → todo job é auditável, com histórico e estado persistido
5. **Trabalho manual repetitivo** → pipeline automatizado do comando ao dossiê final

---

## Fluxos Centrais

```
FLUXO PRINCIPAL
Telegram / Dashboard
  → Recepção da intenção
  → Criação de Job (command)
  → Orquestração
  → Pesquisa (Web + Social + Acadêmica)
  → Análise (cruzamento de evidências)
  → Dossiê (documento estruturado)
  → Apresentação HTML (visual premium)
  → Quality Review (validação)
  → Persistência (Supabase)
  → Dashboard/Studio (visualização)
  → Resposta final ao usuário
```

---

## Outputs Principais

| Output | Descrição |
|--------|-----------|
| **Dossiê** | Documento analítico estruturado com resumo executivo, corpo analítico e conclusão |
| **Apresentação HTML** | Visual premium com hero, highlights, seções, SWOT, timeline, fontes |
| **Evidence Matrix** | Mapa de evidências com fontes, conflitos e cobertura |
| **SWOT** | Análise de forças, fraquezas, oportunidades e ameaças |
| **Job Log** | Rastreabilidade completa de execução |
| **Quality Report** | Relatório de validação e thresholds |

---

## Identidade da Plataforma

- **Nome do projeto**: `ORBIT` (Orquestrador de Inteligência e Base de Insights em Tempo real)
- **Filosofia**: Precisão > Volume. Qualidade > Velocidade. Rastreabilidade > Improviso.
- **Direção visual**: Premium, moderno, elegante — inspirado em NotebookLM e Lovable com identidade própria.
