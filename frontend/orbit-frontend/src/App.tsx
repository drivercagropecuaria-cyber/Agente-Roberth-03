import { useState, useEffect } from 'react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Job {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  created_at: string
  updated_at: string
  quality_score: number | null
  retry_count: number
  commands?: { payload: { text: string } }
}

interface Stats {
  total: number
  pending: number
  running: number
  completed: number
  failed: number
}

// ─── Ícones simples ───────────────────────────────────────────────────────────

const statusIcon = (s: string) => ({
  pending: '⏳', running: '🔄', completed: '✅', failed: '❌'
}[s] || '❓')

const statusColor = (s: string) => ({
  pending: 'text-yellow-400',
  running: 'text-blue-400',
  completed: 'text-green-400',
  failed: 'text-red-400'
}[s] || 'text-gray-400')

// ─── Config ───────────────────────────────────────────────────────────────────

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

// ─── Componente StatCard ──────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 flex flex-col gap-1">
      <span className={`text-3xl font-bold ${color}`}>{value}</span>
      <span className="text-slate-400 text-sm">{label}</span>
    </div>
  )
}

// ─── Componente JobRow ────────────────────────────────────────────────────────

function JobRow({ job }: { job: Job }) {
  const text = job.commands?.payload?.text || '—'
  const date = new Date(job.created_at).toLocaleString('pt-BR')

  return (
    <tr className="border-b border-slate-700/50 hover:bg-slate-800/40 transition-colors">
      <td className="py-3 px-4 font-mono text-xs text-slate-400">{job.id.substring(0, 8)}…</td>
      <td className="py-3 px-4 max-w-xs truncate text-slate-200">{text}</td>
      <td className="py-3 px-4">
        <span className={`flex items-center gap-1.5 text-sm font-medium ${statusColor(job.status)}`}>
          {statusIcon(job.status)} {job.status}
        </span>
      </td>
      <td className="py-3 px-4 text-slate-400 text-sm">{date}</td>
      <td className="py-3 px-4 text-center">
        {job.quality_score != null
          ? <span className={`font-bold ${job.quality_score >= 7 ? 'text-green-400' : 'text-red-400'}`}>
              {job.quality_score.toFixed(1)}
            </span>
          : <span className="text-slate-600">—</span>
        }
      </td>
      <td className="py-3 px-4 text-center text-slate-400 text-sm">{job.retry_count}</td>
    </tr>
  )
}

// ─── Dashboard Principal ──────────────────────────────────────────────────────

export default function App() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, running: 0, completed: 0, failed: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  async function fetchData() {
    try {
      const [jobsRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/api/jobs`),
        fetch(`${API_URL}/api/jobs/stats/dashboard`)
      ])
      if (!jobsRes.ok) throw new Error(`API ${jobsRes.status}`)
      const [jobsData, statsData] = await Promise.all([jobsRes.json(), statsRes.json()])
      setJobs(jobsData)
      setStats(statsData)
      setLastUpdate(new Date())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao conectar à API')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 8000) // atualiza a cada 8s
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">

      {/* ── Header ── */}
      <header className="border-b border-slate-800 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🛸</span>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">ORBIT</h1>
            <p className="text-xs text-slate-500">Plataforma de Inteligência Aplicada</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-500">
            Atualizado: {lastUpdate.toLocaleTimeString('pt-BR')}
          </span>
          <button
            onClick={fetchData}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-1.5 rounded-lg transition-colors"
          >
            ↻ Atualizar
          </button>
        </div>
      </header>

      <main className="px-8 py-6 max-w-7xl mx-auto space-y-8">

        {/* ── Erro de conexão ── */}
        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-xl px-5 py-4 text-sm">
            ⚠️ {error} — Backend pode estar offline. Verifique se o servidor está rodando.
          </div>
        )}

        {/* ── Stats ── */}
        <section>
          <h2 className="text-slate-400 text-sm font-semibold uppercase tracking-widest mb-4">
            Visão Geral
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatCard label="Total de Jobs" value={stats.total} color="text-indigo-400" />
            <StatCard label="Pendentes" value={stats.pending} color="text-yellow-400" />
            <StatCard label="Executando" value={stats.running} color="text-blue-400" />
            <StatCard label="Concluídos" value={stats.completed} color="text-green-400" />
            <StatCard label="Falhos" value={stats.failed} color="text-red-400" />
          </div>
        </section>

        {/* ── Tabela de Jobs ── */}
        <section>
          <h2 className="text-slate-400 text-sm font-semibold uppercase tracking-widest mb-4">
            Jobs Recentes
          </h2>

          {loading ? (
            <div className="text-center text-slate-500 py-16">Carregando...</div>
          ) : jobs.length === 0 ? (
            <div className="text-center text-slate-500 py-16 bg-slate-800/30 rounded-xl border border-slate-700">
              <p className="text-4xl mb-3">📭</p>
              <p className="text-lg font-medium">Nenhum job ainda</p>
              <p className="text-sm mt-1">Envie uma mensagem para o bot @AgenteMundoVirtual_bot no Telegram</p>
            </div>
          ) : (
            <div className="bg-slate-800/40 border border-slate-700 rounded-xl overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-700 bg-slate-800/60">
                    <th className="py-3 px-4 text-xs font-semibold text-slate-400 uppercase">ID</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-400 uppercase">Solicitação</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-400 uppercase">Status</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-400 uppercase">Criado</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-400 uppercase text-center">Qualidade</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-400 uppercase text-center">Tentativas</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map(job => <JobRow key={job.id} job={job} />)}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Info do Sistema ── */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-5">
            <h3 className="text-slate-300 font-semibold mb-3">🤖 Bot Telegram</h3>
            <p className="text-slate-400 text-sm">@AgenteMundoVirtual_bot</p>
            <p className="text-slate-500 text-xs mt-1">Envie qualquer tema para pesquisa e análise</p>
          </div>
          <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-5">
            <h3 className="text-slate-300 font-semibold mb-3">🗄️ Banco de Dados</h3>
            <p className="text-slate-400 text-sm">Supabase — umwqxkggzrpwknptwwju</p>
            <p className="text-slate-500 text-xs mt-1">26 tabelas • pgmq • Realtime</p>
          </div>
        </section>

      </main>
    </div>
  )
}
