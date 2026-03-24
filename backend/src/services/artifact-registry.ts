/**
 * ARTIFACT REGISTRY — Camada 9 da Arquitetura ORBIT 2026
 * Persiste e versiona artefatos gerados (HTML, JSON, texto).
 * Usa Supabase Storage (bucket: orbit-artifacts).
 * Cada artefato tem: hash, versão, job_id, tipo, URL pública.
 */
import crypto from 'crypto'
import { supabase } from '../db/client'
import { tel } from '../utils/telemetry'

const BUCKET = 'orbit-artifacts'

export interface ArtifactRecord {
  id?: string
  job_id: string
  artifact_type: 'html' | 'json' | 'text'
  content_hash: string
  storage_path: string | null
  content_inline: string | null  // fallback se storage falhar
  version: number
  size_bytes: number
  qa_score: number
  sources_count: number
  created_at?: string
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16)
}

// ─── Garantir que o bucket existe ────────────────────────────────────────────

async function ensureBucket(): Promise<boolean> {
  try {
    const { data: buckets } = await supabase.storage.listBuckets()
    const exists = (buckets || []).some((b: any) => b.name === BUCKET)
    if (!exists) {
      await supabase.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 5 * 1024 * 1024 })
      tel.info('artifact_registry', 'bucket_created', { bucket: BUCKET })
    }
    return true
  } catch (e) {
    tel.error('artifact_registry', 'bucket_check_failed', e)
    return false
  }
}

// ─── Upload para Supabase Storage ─────────────────────────────────────────────

async function uploadToStorage(path: string, content: string, mimeType: string): Promise<string | null> {
  try {
    const buf = Buffer.from(content, 'utf8')
    const { error } = await supabase.storage.from(BUCKET).upload(path, buf, {
      contentType: mimeType,
      upsert: true,
      cacheControl: '3600'
    })
    if (error) {
      tel.error('artifact_registry', 'upload_failed', error)
      return null
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return data?.publicUrl || null
  } catch (e) {
    tel.error('artifact_registry', 'upload_exception', e)
    return null
  }
}

// ─── Registrar artefato no banco ──────────────────────────────────────────────

async function saveArtifactRecord(record: ArtifactRecord): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('artifacts')
      .insert({
        job_id: record.job_id,
        artifact_type: record.artifact_type,
        content_hash: record.content_hash,
        storage_path: record.storage_path,
        content_inline: record.content_inline?.substring(0, 50000), // segurança
        version: record.version,
        size_bytes: record.size_bytes,
        qa_score: record.qa_score,
        sources_count: record.sources_count
      })
      .select('id')
      .single()

    if (error) {
      tel.error('artifact_registry', 'db_insert_failed', error)
      return null
    }
    return data?.id || null
  } catch (e) {
    tel.error('artifact_registry', 'db_exception', e)
    return null
  }
}

// ─── Obter versão atual para o job ───────────────────────────────────────────

async function getNextVersion(jobId: string, type: string): Promise<number> {
  try {
    const { data } = await supabase
      .from('artifacts')
      .select('version')
      .eq('job_id', jobId)
      .eq('artifact_type', type)
      .order('version', { ascending: false })
      .limit(1)
      .single()
    return ((data?.version as number) || 0) + 1
  } catch {
    return 1
  }
}

// ─── API principal ────────────────────────────────────────────────────────────

export interface RegistryResult {
  artifact_id: string | null
  public_url: string | null
  storage_path: string | null
  content_hash: string
  version: number
  size_bytes: number
  stored_in_storage: boolean
}

export async function registerArtifact(params: {
  jobId: string
  type: 'html' | 'json' | 'text'
  content: string
  qaScore: number
  sourcesCount: number
}): Promise<RegistryResult> {
  const { jobId, type, content, qaScore, sourcesCount } = params
  const start = Date.now()

  const hash = sha256(content)
  const version = await getNextVersion(jobId, type)
  const sizeBytes = Buffer.byteLength(content, 'utf8')
  const ext = type === 'json' ? 'json' : type === 'html' ? 'html' : 'txt'
  const storagePath = `jobs/${jobId}/v${version}_${hash}.${ext}`

  const mimeTypes = { html: 'text/html', json: 'application/json', text: 'text/plain' }

  // Tentar upload no Storage
  const bucketOk = await ensureBucket()
  let publicUrl: string | null = null
  let storedInStorage = false

  if (bucketOk) {
    publicUrl = await uploadToStorage(storagePath, content, mimeTypes[type])
    storedInStorage = !!publicUrl
  }

  // Salvar registro no banco (com inline fallback se Storage falhar)
  const record: ArtifactRecord = {
    job_id: jobId,
    artifact_type: type,
    content_hash: hash,
    storage_path: storedInStorage ? storagePath : null,
    content_inline: storedInStorage ? null : content.substring(0, 50000),
    version,
    size_bytes: sizeBytes,
    qa_score: qaScore,
    sources_count: sourcesCount
  }

  const artifactId = await saveArtifactRecord(record)

  tel.info('artifact_registry', 'registered', {
    type, version, hash, size: sizeBytes, stored: storedInStorage, ms: Date.now() - start
  })

  return { artifact_id: artifactId, public_url: publicUrl, storage_path: storedInStorage ? storagePath : null, content_hash: hash, version, size_bytes: sizeBytes, stored_in_storage: storedInStorage }
}

// ─── Buscar artefato por job ───────────────────────────────────────────────────

export async function getArtifactsByJob(jobId: string): Promise<any[]> {
  const { data } = await supabase
    .from('artifacts')
    .select('id,artifact_type,version,size_bytes,qa_score,created_at,storage_path,content_inline')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
  return data || []
}
