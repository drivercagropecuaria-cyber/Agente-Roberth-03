/**
 * GOVERNANCE — Camada transversal da Arquitetura ORBIT 2026
 * RBAC básico por Telegram ID + Audit Log estruturado + Source Policies.
 *
 * Roles disponíveis:
 *   admin    — acesso total, pode configurar, ver todos os jobs
 *   analyst  — pode criar jobs e ver os próprios
 *   viewer   — somente leitura
 *   blocked  — acesso negado
 */
import { supabase } from '../db/client'
import { tel } from '../utils/telemetry'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'analyst' | 'viewer' | 'blocked'

export interface Permission {
  canCreateJobs: boolean
  canViewAllJobs: boolean
  canViewOwnJobs: boolean
  canDeleteJobs: boolean
  canAccessDeepResearch: boolean
  canAccessAcademic: boolean
  maxJobsPerDay: number
  maxDepth: 'shallow' | 'medium' | 'deep'
}

export interface AuditEvent {
  job_id?: string
  telegram_id?: number
  actor_role?: UserRole
  action: string
  resource_type: string
  resource_id?: string
  details?: Record<string, unknown>
  ip?: string
  result: 'allowed' | 'denied' | 'error' | 'ok'
}

// ─── Permissões por role ──────────────────────────────────────────────────────

const ROLE_PERMISSIONS: Record<UserRole, Permission> = {
  admin: {
    canCreateJobs: true, canViewAllJobs: true, canViewOwnJobs: true, canDeleteJobs: true,
    canAccessDeepResearch: true, canAccessAcademic: true, maxJobsPerDay: 1000, maxDepth: 'deep'
  },
  analyst: {
    canCreateJobs: true, canViewAllJobs: false, canViewOwnJobs: true, canDeleteJobs: false,
    canAccessDeepResearch: true, canAccessAcademic: true, maxJobsPerDay: 50, maxDepth: 'deep'
  },
  viewer: {
    canCreateJobs: false, canViewAllJobs: false, canViewOwnJobs: true, canDeleteJobs: false,
    canAccessDeepResearch: false, canAccessAcademic: false, maxJobsPerDay: 0, maxDepth: 'shallow'
  },
  blocked: {
    canCreateJobs: false, canViewAllJobs: false, canViewOwnJobs: false, canDeleteJobs: false,
    canAccessDeepResearch: false, canAccessAcademic: false, maxJobsPerDay: 0, maxDepth: 'shallow'
  }
}

// ─── Cache simples (TTL 5 min) ────────────────────────────────────────────────

interface CacheEntry { role: UserRole; expiresAt: number }
const roleCache = new Map<number, CacheEntry>()
const CACHE_TTL = 5 * 60 * 1000

// ─── Resolver role de um Telegram ID ─────────────────────────────────────────

export async function resolveUserRole(telegramId: number): Promise<UserRole> {
  // 1. Checar cache
  const cached = roleCache.get(telegramId)
  if (cached && Date.now() < cached.expiresAt) return cached.role

  // 2. Buscar no banco
  try {
    const { data } = await supabase
      .from('user_profiles')
      .select('role, is_blocked')
      .eq('telegram_id', telegramId)
      .single()

    let role: UserRole = 'analyst' // default
    if (data) {
      if (data.is_blocked) role = 'blocked'
      else role = (data.role as UserRole) || 'analyst'
    }

    // Admin hardcoded via env var (comma-separated telegram IDs)
    const adminIds = (process.env.ORBIT_ADMIN_IDS || '').split(',').map(s => parseInt(s.trim())).filter(Boolean)
    if (adminIds.includes(telegramId)) role = 'admin'

    roleCache.set(telegramId, { role, expiresAt: Date.now() + CACHE_TTL })
    return role
  } catch {
    return 'analyst' // fallback permissivo
  }
}

// ─── Verificar permissão ──────────────────────────────────────────────────────

export async function checkPermission(telegramId: number, action: keyof Permission): Promise<{ allowed: boolean; role: UserRole; reason?: string }> {
  const role = await resolveUserRole(telegramId)
  const perms = ROLE_PERMISSIONS[role]
  const allowed = !!perms[action]
  return { allowed, role, reason: allowed ? undefined : `Role '${role}' não tem permissão '${action}'` }
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export async function auditLog(event: AuditEvent): Promise<void> {
  // Log estruturado sempre (mesmo se banco falhar)
  tel.info('governance', 'audit', {
    action: event.action,
    resource: event.resource_type,
    result: event.result,
    job_id: event.job_id,
    actor: event.telegram_id
  })

  // Persistir no banco (não crítico — não bloqueia se falhar)
  try {
    await supabase.from('audit_log').insert({
      job_id: event.job_id || null,
      telegram_id: event.telegram_id || null,
      actor_role: event.actor_role || null,
      action: event.action,
      resource_type: event.resource_type,
      resource_id: event.resource_id || null,
      details: event.details || {},
      result: event.result,
      created_at: new Date().toISOString()
    }).catch(() => {
      // Fallback: tabela pode não existir ainda
      supabase.from('activity_log').insert({
        entity_type: 'audit',
        entity_id: event.job_id || 'system',
        action: event.action,
        details: { ...event.details, result: event.result, resource: event.resource_type }
      }).catch(() => {})
    })
  } catch {
    // Nunca deve bloquear o fluxo principal
  }
}

// ─── Middleware de governança para requests Telegram ─────────────────────────

export interface GovernanceCheck {
  allowed: boolean
  role: UserRole
  permissions: Permission
  denialReason?: string
}

export async function checkTelegramAccess(telegramId: number, action: string): Promise<GovernanceCheck> {
  const role = await resolveUserRole(telegramId)
  const perms = ROLE_PERMISSIONS[role]

  if (role === 'blocked') {
    await auditLog({ telegram_id: telegramId, actor_role: role, action, resource_type: 'bot', result: 'denied' })
    return { allowed: false, role, permissions: perms, denialReason: 'Seu acesso está bloqueado. Contate o administrador.' }
  }

  if (!perms.canCreateJobs && action === 'create_job') {
    return { allowed: false, role, permissions: perms, denialReason: `Perfil '${role}' não pode criar novos jobs.` }
  }

  await auditLog({ telegram_id: telegramId, actor_role: role, action, resource_type: 'bot', result: 'allowed' })
  return { allowed: true, role, permissions: perms }
}

// ─── Source Policy — controla quais fontes um usuário pode usar ───────────────

export function getSourcePolicy(role: UserRole): { web: boolean; social: boolean; academic: boolean; internal: boolean } {
  if (role === 'blocked') return { web: false, social: false, academic: false, internal: false }
  if (role === 'viewer')  return { web: true, social: false, academic: false, internal: false }
  return { web: true, social: true, academic: true, internal: true }
}

// ─── Limpar cache (ex: após update de role) ───────────────────────────────────

export function invalidateRoleCache(telegramId?: number): void {
  if (telegramId) {
    roleCache.delete(telegramId)
  } else {
    roleCache.clear()
  }
}
