import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios')
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
})

// ─── Helpers de Jobs ───────────────────────────────────────────────────────

export async function createCommand(params: {
  userId: string
  payload: Record<string, unknown>
}) {
  const { data, error } = await supabase
    .from('commands')
    .insert({ user_id: params.userId, payload: params.payload })
    .select()
    .single()
  if (error) throw new Error(`Erro ao criar command: ${error.message}`)
  return data
}

export async function createJob(params: {
  commandId: string
  chatId: number
}) {
  const { data, error } = await supabase
    .from('jobs')
    .insert({
      command_id: params.commandId,
      chat_id: params.chatId,
      status: 'pending',
      retry_count: 0,
      agent_version: process.env.AGENT_VERSION || '1.0.0'
    })
    .select()
    .single()
  if (error) throw new Error(`Erro ao criar job: ${error.message}`)
  return data
}

export async function updateJobStatus(
  jobId: string,
  status: 'pending' | 'running' | 'completed' | 'failed',
  extra?: Record<string, unknown>
) {
  const { error } = await supabase
    .from('jobs')
    .update({ status, updated_at: new Date().toISOString(), ...extra })
    .eq('id', jobId)
  if (error) throw new Error(`Erro ao atualizar job: ${error.message}`)
}

export async function logTrace(params: {
  jobId: string
  agentName: string
  step: string
  inputSummary?: string
  outputSummary?: string
  durationMs?: number
  tokensUsed?: number
  status?: 'ok' | 'error'
}) {
  await supabase.rpc('log_trace', {
    p_job_id: params.jobId,
    p_agent: params.agentName,
    p_version: process.env.AGENT_VERSION || '1.0.0',
    p_step: params.step,
    p_input: params.inputSummary || null,
    p_output: params.outputSummary || null,
    p_duration: params.durationMs || 0,
    p_tokens: params.tokensUsed || 0,
    p_status: params.status || 'ok'
  })
}

// ─── Upsert de Usuário Telegram ────────────────────────────────────────────

export async function upsertTelegramUser(user: {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
  chat_id: number
}) {
  const { data, error } = await supabase
    .from('user_profiles')
    .upsert(
      {
        telegram_id: user.id,
        first_name: user.first_name,
        last_name: user.last_name || null,
        username: user.username || null,
        language_code: user.language_code || 'pt',
        default_chat_id: user.chat_id
      },
      { onConflict: 'telegram_id' }
    )
    .select()
    .single()
  if (error) throw new Error(`Erro ao upsert user: ${error.message}`)
  return data
}

// ─── Notificações ──────────────────────────────────────────────────────────

export async function createNotification(params: {
  telegramId: number
  chatId: number
  type: string
  message: string
  scheduledFor?: string
}) {
  await supabase.from('notifications').insert({
    user_telegram_id: params.telegramId,
    chat_id: params.chatId,
    type: params.type,
    message: params.message,
    is_sent: false,
    scheduled_for: params.scheduledFor || new Date().toISOString()
  })
}
