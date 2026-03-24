/**
 * DURABLE WORKFLOW ENGINE — Fase G da Arquitetura ORBIT 2026
 *
 * Decisão arquitetural: usamos checkpoint nativo no Supabase (tabela
 * execution_checkpoints) em vez de Temporal/LangGraph. Isso nos dá:
 *   - Retomada de qualquer step após falha ou restart
 *   - Zero infraestrutura adicional (Supabase já existe)
 *   - Compatibilidade com pgmq (fila já em uso)
 *   - Human-in-the-loop como primitivo nativo
 *
 * Semântica:
 *   WorkflowDefinition → sequência de WorkflowSteps declarativos
 *   Cada step: { name, run, compensate? }
 *   Engine: executa step-by-step, persiste checkpoint após cada um
 *   Em caso de falha: recarrega checkpoint e retoma do step seguinte ao último OK
 *   Interrupt: step pode pausar para aprovação humana (retomado via webhook)
 */
import { supabase } from '../db/client'
import { tel } from '../utils/telemetry'
import { startSpan, endSpan } from '../utils/otel'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'awaiting_human' | 'skipped'

export interface StepContext {
  jobId: string
  workflowId: string
  stepName: string
  stepIndex: number
  totalSteps: number
  state: Record<string, unknown>  // estado acumulado do workflow
  chatId?: number
  telegramId?: number
}

export interface StepResult {
  output: Record<string, unknown>
  status: 'completed' | 'awaiting_human' | 'failed'
  interrupt_reason?: string
  approval_token?: string
}

export interface WorkflowStep {
  name: string
  run: (ctx: StepContext) => Promise<StepResult>
  compensate?: (ctx: StepContext) => Promise<void>  // rollback se step posterior falhar
  timeout_ms?: number
  required?: boolean  // se false, falha não aborta workflow
}

export interface WorkflowDefinition {
  name: string
  version: string
  steps: WorkflowStep[]
}

export interface WorkflowRun {
  workflowId: string
  jobId: string
  definition: WorkflowDefinition
  currentStep: number
  state: Record<string, unknown>
  status: 'running' | 'completed' | 'failed' | 'awaiting_human'
  startedAt: number
}

// ─── Checkpoint: persistir estado após cada step ──────────────────────────────

async function saveCheckpoint(params: {
  jobId: string
  workflowId: string
  stepName: string
  stepIndex: number
  state: Record<string, unknown>
  stepStatus: StepStatus
}): Promise<void> {
  try {
    // Marcar checkpoint anterior como não-atual
    await supabase
      .from('execution_checkpoints')
      .update({ is_current: false })
      .eq('job_id', params.jobId)
      .eq('agent_name', 'workflow_engine')

    // Salvar novo checkpoint
    await supabase.from('execution_checkpoints').insert({
      job_id: params.jobId,
      agent_name: 'workflow_engine',
      checkpoint_name: `${params.stepName}:${params.stepStatus}`,
      state: {
        workflow_id: params.workflowId,
        step_name: params.stepName,
        step_index: params.stepIndex,
        step_status: params.stepStatus,
        workflow_state: params.state,
        saved_at: new Date().toISOString()
      },
      is_current: true
    })
  } catch (e) {
    tel.error('workflow_engine', 'checkpoint_save_failed', e)
    // Não bloqueia — continua execução
  }
}

// ─── Carregar checkpoint para retomada ────────────────────────────────────────

export async function loadCheckpoint(jobId: string): Promise<{
  stepIndex: number
  stepName: string
  state: Record<string, unknown>
  stepStatus: StepStatus
} | null> {
  try {
    const { data } = await supabase
      .from('execution_checkpoints')
      .select('state, checkpoint_name')
      .eq('job_id', jobId)
      .eq('agent_name', 'workflow_engine')
      .eq('is_current', true)
      .single()

    if (!data?.state) return null

    const s = data.state as any
    return {
      stepIndex: s.step_index || 0,
      stepName: s.step_name || '',
      state: s.workflow_state || {},
      stepStatus: s.step_status || 'pending'
    }
  } catch {
    return null
  }
}

// ─── Motor principal de execução ─────────────────────────────────────────────

export async function runWorkflow(params: {
  definition: WorkflowDefinition
  jobId: string
  chatId?: number
  telegramId?: number
  initialState?: Record<string, unknown>
  resumeFrom?: number  // forçar retomada a partir de um step específico
}): Promise<{ success: boolean; state: Record<string, unknown>; stepsCompleted: number; error?: string }> {
  const { definition, jobId, chatId, telegramId, initialState = {}, resumeFrom } = params
  const workflowId = `${jobId}-${definition.name}`
  const startTime = Date.now()

  tel.info('workflow_engine', 'started', { workflow: definition.name, version: definition.version, jobId, steps: definition.steps.length })

  // Tentar retomar de checkpoint existente
  let startStep = resumeFrom ?? 0
  let state: Record<string, unknown> = { ...initialState }

  if (resumeFrom === undefined) {
    const checkpoint = await loadCheckpoint(jobId)
    if (checkpoint && checkpoint.stepStatus === 'completed') {
      startStep = checkpoint.stepIndex + 1
      state = { ...state, ...checkpoint.state }
      tel.info('workflow_engine', 'resuming_from_checkpoint', { step: startStep, checkpointStep: checkpoint.stepName })
    }
  }

  let stepsCompleted = 0
  const completedSteps: string[] = []

  // ── Execução step-by-step ─────────────────────────────────────────────────
  for (let i = startStep; i < definition.steps.length; i++) {
    const step = definition.steps[i]
    const ctx: StepContext = {
      jobId, workflowId, stepName: step.name, stepIndex: i,
      totalSteps: definition.steps.length, state, chatId, telegramId
    }

    const spanId = startSpan({ agentName: 'workflow_engine', step: step.name, attributes: { step_index: i } })
    tel.info('workflow_engine', 'step_started', { step: step.name, index: i })

    // Checkpoint de início do step
    await saveCheckpoint({ jobId, workflowId, stepName: step.name, stepIndex: i, state, stepStatus: 'running' })

    try {
      // Executar step com timeout opcional
      let result: StepResult
      if (step.timeout_ms) {
        const timeoutPromise = new Promise<StepResult>((_, reject) =>
          setTimeout(() => reject(new Error(`Step '${step.name}' timeout após ${step.timeout_ms}ms`)), step.timeout_ms)
        )
        result = await Promise.race([step.run(ctx), timeoutPromise])
      } else {
        result = await step.run(ctx)
      }

      // Merge do output no estado global
      state = { ...state, ...result.output }

      if (result.status === 'awaiting_human') {
        // Pausar workflow para aprovação humana
        await saveCheckpoint({ jobId, workflowId, stepName: step.name, stepIndex: i, state, stepStatus: 'awaiting_human' })
        endSpan(spanId, { status: 'ok', attributes: { awaiting_human: true, approval_token: result.approval_token } })
        tel.info('workflow_engine', 'awaiting_human', { step: step.name, reason: result.interrupt_reason })
        return { success: false, state, stepsCompleted, error: `Aguardando aprovação humana: ${result.interrupt_reason}` }
      }

      // Step concluído com sucesso
      await saveCheckpoint({ jobId, workflowId, stepName: step.name, stepIndex: i, state, stepStatus: 'completed' })
      completedSteps.push(step.name)
      stepsCompleted++

      endSpan(spanId, { status: 'ok', attributes: { output_keys: Object.keys(result.output).join(',') } })
      tel.info('workflow_engine', 'step_completed', { step: step.name, ms: Date.now() - startTime })

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      endSpan(spanId, { status: 'error', error: err instanceof Error ? err : new Error(msg) })
      tel.error('workflow_engine', 'step_failed', err, { step: step.name, index: i })

      // Checkpoint de falha
      await saveCheckpoint({ jobId, workflowId, stepName: step.name, stepIndex: i, state: { ...state, _last_error: msg }, stepStatus: 'failed' })

      if (step.required !== false) {
        // Compensar steps anteriores (rollback na ordem inversa)
        for (const prevStepName of [...completedSteps].reverse()) {
          const prevStep = definition.steps.find(s => s.name === prevStepName)
          if (prevStep?.compensate) {
            try { await prevStep.compensate({ ...ctx, stepName: prevStepName, state }) } catch {}
          }
        }
        return { success: false, state, stepsCompleted, error: `Step '${step.name}' falhou: ${msg}` }
      }

      // Step opcional — continua
      state = { ...state, [`_skip_${step.name}`]: msg }
      tel.info('workflow_engine', 'step_skipped', { step: step.name, optional: true })
    }
  }

  const totalMs = Date.now() - startTime
  tel.info('workflow_engine', 'completed', { workflow: definition.name, steps: stepsCompleted, ms: totalMs })
  return { success: true, state, stepsCompleted }
}
