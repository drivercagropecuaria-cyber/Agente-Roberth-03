# CONTRATOS DE DADOS — ORBIT

Todos os agentes comunicam-se através de contratos estruturados.
Nenhum output é texto livre. Tudo é estruturado, validável e rastreável.

---

## orchestration_result
Produzido por: Agente Orquestrador

{
  "job_id": "string (UUID)",
  "intent": "string — intenção interpretada",
  "plan": ["passo 1", "passo 2", ...],
  "agents_triggered": ["research", "analysis", ...],
  "status": "pending | running | completed | failed",
  "final_output_ref": "string — ID do artifact final",
  "metadata": {
    "started_at": "ISO timestamp",
    "completed_at": "ISO timestamp",
    "total_tokens": "number"
  }
}

---

## research_result
Produzido por: Agente de Pesquisa Web

{
  "query": "string — consulta original",
  "subconsultas": ["string"],
  "fontes": [
    {
      "url": "string",
      "titulo": "string",
      "trecho": "string — conteúdo extraído",
      "relevancia": "alta | média | baixa",
      "data": "string — data da publicação",
      "conflito": "boolean"
    }
  ],
  "cobertura": "0-100 (percentual estimado)",
  "conflitos_detectados": ["descrição do conflito"],
  "total_fontes": "number"
}

---

## social_research_result
Produzido por: Agente de Pesquisa Social

{
  "query": "string",
  "plataformas_consultadas": ["Reddit", ...],
  "discussoes": [
    {
      "plataforma": "string",
      "url": "string",
      "resumo": "string",
      "sentimento": "positivo | negativo | neutro | misto",
      "engajamento": "alto | médio | baixo"
    }
  ],
  "sentimento_geral": "string",
  "temas_recorrentes": ["string"]
}

---

## scholarly_research_result
Produzido por: Agente de Pesquisa Acadêmica

{
  "query": "string",
  "referencias": [
    {
      "titulo": "string",
      "autores": ["string"],
      "ano": "number",
      "doi": "string",
      "fonte": "string",
      "abstract": "string",
      "relevancia": "alta | média | baixa"
    }
  ],
  "total_referencias": "number"
}

---

## analysis_result
Produzido por: Agente de Análise

{
  "tema": "string",
  "convergencias": ["string — pontos onde fontes concordam"],
  "divergencias": ["string — pontos de conflito entre fontes"],
  "gaps": ["string — lacunas de informação identificadas"],
  "implicacoes": ["string — implicações práticas"],
  "swot": {
    "forcas": ["string"],
    "fraquezas": ["string"],
    "oportunidades": ["string"],
    "ameacas": ["string"]
  },
  "fatos_verificados": ["string"],
  "inferencias": ["string"],
  "opiniao": ["string"],
  "score_confianca": "0-10"
}

---

## dossier_result
Produzido por: Agente Criador de Dossiês

{
  "titulo": "string",
  "data_geracao": "ISO timestamp",
  "resumo_executivo": "string — 200-400 palavras",
  "secoes": [
    {
      "titulo": "string",
      "conteudo": "string — markdown"
    }
  ],
  "conclusao": "string — 100-200 palavras",
  "recomendacoes": ["string"],
  "fontes_utilizadas": ["URL ou referência"],
  "total_palavras": "number"
}

---

## presentation_result
Produzido por: Agente Criador de Apresentações

{
  "titulo": "string",
  "html_content": "string — HTML completo e autocontido",
  "arquivo_path": "string — caminho no Supabase Storage",
  "secoes_incluidas": ["hero", "highlights", "swot", "timeline", "fontes", "conclusao"],
  "responsivo": "boolean",
  "data_geracao": "ISO timestamp"
}

---

## quality_review_result
Produzido por: Agente Revisor de Qualidade

{
  "artifact_id": "string",
  "artifact_tipo": "research | analysis | dossier | presentation",
  "status": "aprovado | reprovado",
  "scores": {
    "completude": "0-10",
    "profundidade": "0-10",
    "coerencia": "0-10",
    "formatacao": "0-10",
    "fontes": "0-10"
  },
  "score_geral": "0-10",
  "problemas_encontrados": ["string"],
  "recomendacoes": ["string"],
  "requer_retry": "boolean",
  "agente_para_retry": "string"
}
