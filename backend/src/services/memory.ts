import { supabase } from '../db/client'

export async function saveCheckpoint(jobId, agentName, checkpointName, state) {
  await supabase.from('execution_checkpoints').update({ is_current: false })
    .eq('job_id', jobId).eq('agent_name', agentName)
  await supabase.from('execution_checkpoints').insert({
    job_id: jobId, agent_name: agentName, checkpoint_name: checkpointName, state, is_current: true
  })
}
export async function loadCheckpoint(jobId, agentName) {
  const { data } = await supabase.from('execution_checkpoints').select('state,checkpoint_name')
    .eq('job_id', jobId).eq('agent_name', agentName).eq('is_current', true).single()
  return data
}
export async function getEpisodicContext(telegramId, limit = 5) {
  const { data } = await supabase.rpc('get_conversation_context', { p_telegram_id: telegramId, p_limit: limit })
  return data || []
}
export async function saveEpisodicMemory(p) {
  await supabase.from('conversation_memory').insert({
    user_profile_id: p.userProfileId, telegram_id: p.telegramId,
    role: p.role, content: p.content, intent: p.intent, job_id: p.jobId
  })
}
export async function getActiveDirectives(category) {
  let q = supabase.from('directives').select('slug,title,content,category,learnings').eq('is_active', true)
  if (category) q = q.eq('category', category)
  const { data } = await q
  return data || []
}
export async function matchIntentPattern(message) {
  const { data } = await supabase.rpc('match_intent_pattern', { p_message: message })
  return data
}