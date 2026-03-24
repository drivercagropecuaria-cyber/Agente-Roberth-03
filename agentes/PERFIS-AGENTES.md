# PERFIS DOS AGENTES — ORBIT

## Visão Geral

O ORBIT opera com 8 agentes especializados coordenados pelo Orquestrador.
Cada agente tem missão clara, inputs definidos, outputs estruturados e quality gates.

---

## 1. AGENTE ORQUESTRADOR
Missão: Interpretar intenção, distribuir trabalho, controlar fluxo e consolidar resultados.
- Input: Comando do usuário (texto livre)
- Output: orchestration_result — plano de execução + resultado final
- Ferramentas: Handoffs para todos os agentes, quality gates, session manager
- Limites: Não executa pesquisa diretamente; não gera conteúdo final

## 2. AGENTE DE PESQUISA WEB
Missão: Decompor tema em subconsultas, buscar fontes reais, coletar evidências.
- Input: Tema ou pergunta de pesquisa
- Output: research_result — evidence matrix com fontes, trechos e metadados
- Ferramentas: Web search nativa (OpenAI), extração de conteúdo
- Quality Gate: Mínimo 5 fontes distintas; cobertura de 3+ ângulos do tema

## 3. AGENTE DE PESQUISA SOCIAL
Missão: Capturar percepção pública, discussões e opinião de comunidades.
- Input: Tema ou questão social
- Output: social_research_result — resumo de discussões públicas
- Ferramentas: Reddit API, fóruns públicos
- Quality Gate: Ao menos 3 comunidades/discussões distintas

## 4. AGENTE DE PESQUISA ACADÊMICA
Missão: Buscar papers, livros, DOIs e fontes robustas.
- Input: Tema ou pergunta de pesquisa
- Output: scholarly_research_result — referências acadêmicas estruturadas
- Ferramentas: OpenAlex, Semantic Scholar, busca por DOI
- Quality Gate: Mínimo 3 referências com DOI ou fonte verificável

## 5. AGENTE DE ANÁLISE
Missão: Transformar evidências em entendimento profundo e estruturado.
- Input: research_result + social_research_result + scholarly_research_result
- Output: analysis_result — convergências, divergências, gaps, SWOT, implicações
- Limites: Não inventa dados; sinaliza incerteza explicitamente
- Quality Gate: Cobre todos os 5 elementos: convergências, divergências, gaps, implicações e SWOT

## 6. AGENTE CRIADOR DE DOSSIÊS
Missão: Transformar análise em documento estruturado e profissional.
- Input: analysis_result
- Output: dossier_result — resumo executivo, corpo analítico e conclusão
- Quality Gate: Mínimo 800 palavras; todas as seções obrigatórias

## 7. AGENTE CRIADOR DE APRESENTAÇÕES
Missão: Transformar dossiês em apresentações HTML premium.
- Input: dossier_result
- Output: presentation_result — arquivo HTML autocontido e responsivo
- Quality Gate: Todas as seções; SWOT visual; responsivo; legível

## 8. AGENTE REVISOR DE QUALIDADE
Missão: Validar todos os outputs antes da entrega final.
- Input: Qualquer output de agente
- Output: quality_review_result — aprovado/reprovado + justificativa
- Limites: Sinaliza e solicita revisão; não corrige diretamente
- Quality Gate: Score mínimo 7/10 para aprovação

---

## Fluxo de Handoffs

Usuário
  → Orquestrador
      → Pesquisa Web + Social + Acadêmica (em paralelo)
      → Análise
      → Dossiê
      → Apresentação
      → Qualidade
          → APROVADO → Usuário
          → REPROVADO → retry no agente responsável
