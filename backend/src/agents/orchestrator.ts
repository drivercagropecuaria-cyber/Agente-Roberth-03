import OpenAI from 'openai'
import { supabase, updateJobStatus, logTrace } from '../db/client'
import { routeIntake, persistIntakeDecision } from '../services/intake-router'
import { generatePlan } from './planner'
import { runResearchAgent } from './research'
import { runAnalysisAgent } from './analysis'
import { runSynthesizer } from './synthesizer'
import { runQualityReviewer } from './quality-reviewer'
import { saveEpisodicMemory } from '../services/memory'
import { tel, setJobContext } from '../utils/telemetry'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

async function sendTelegram(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token || !chatId) return
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
  }).catch(() => {})
}

export async function orchestrate(job: any) {
  const { id: jobId, command_id, chat_id } = job
  setJobContext(jobId)
  const start = Date.now()
  const { data: command } = await supabase.from('commands').select('payload,user_id').eq('id', command_id).single()
  if (!command) throw new Error('Command não encontrado')
  const text: string = command.payload?.text || ''
  const telegramId: number = command.payload?.telegram_id
  tel.info('orchestrator', 'started', { text_len: text.length })
  // Camada 2: Intake
  const intake = routeIntake(text)
  await persistIntakeDecision(jobId, intake)
  if (intake.requires_human) {
    await sendTelegram(chat_id, '⚠️ *Esta ação requer aprovação.* Responda OK para confirmar.')
    await updateJobStatus(jobId, 'pending', { orchestration_log: { intake, awaiting_approval: true } })
    return
  }
  // Camada 3: Planner
  const plan = await generatePlan({ jobId, userText: text, intent: intake.intent, depth: intake.depth, maxBranches: intake.max_branches, maxTokens: intake.max_tokens })
  // Resposta rápida
  if (intake.intent === 'quick_answer') {
    const res = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: text }], max_tokens: 800 })
    const answer = res.choices[0].message.content || 'Não consegui processar.'
    await updateJobStatus(jobId, 'completed', { result: { type: 'quick_answer', content: answer } })
    await sendTelegram(chat_id, answer)
    return
  }
  // Camada 5: Pesquisa
  await sendTelegram(chat_id, '🔍 *Pesquisando fontes...*')
  const research = await runResearchAgent({ jobId, query: text, plan })
  // Camada 7: Análise + Síntese
  await sendTelegram(chat_id, '🧠 *Analisando evidências...*')
  const analysis = await runAnalysisAgent({ jobId, research, plan })
  const synthesis = await runSynthesizer({ jobId, analysis, plan })
  // Camada 9: QA
  const qa = await runQualityReviewer({ jobId, artifact: synthesis, plan })
  await updateJobStatus(jobId, 'completed', { result: { type: intake.expected_output, synthesis, qa }, quality_score: qa.score_geral })
  const summary = (synthesis.executive_summary || '').substring(0, 900)
  await sendTelegram(chat_id, `✅ *Análise concluída!*\n\n${summary}\n\n_Score de qualidade: ${(qa.score_geral || 0).toFixed(1)}/10_`)
  if (command.user_id && telegramId) {
    await saveEpisodicMemory({ userProfileId: command.user_id, telegramId, role: 'assistant', content: summary, intent: intake.intent, jobId })
  }
  await logTrace({ jobId, agentName: 'orchestrator', step: 'completed', durationMs: Date.now() - start })
  tel.info('orchestrator', 'done', { ms: Date.now() - start, qa: qa.score_geral })
}
