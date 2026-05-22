/**
 * PlatformSlackAgent — dashboard de observability para el modo agentic
 * Slack. Solo platform admins ven esta página (route /platform_slack_agent
 * en Master mode).
 *
 * Métricas:
 *   • Total messages classified vs pending
 *   • Tasks auto-creadas y notificaciones con CTA pendientes
 *   • Distribución de confidence
 *   • Last events del slack_event_log
 *   • Skills sembradas en `skills` table (las 5 del Slack agentic stack)
 */
import React, { useEffect, useState } from 'react'
import { Icons } from '../components/ui/Icons'
import { supabase } from '../lib/supabase'
import { usePlatformAdmin } from '../hooks/usePlatformAdmin'

interface SlackStats {
  total: number
  classified: number
  pending: number
  with_client: number
  with_project: number
  task_auto_created: number
  notif_pending: number
  high_conf: number
  mid_conf: number
  low_conf: number
}

interface ChannelBreakdown {
  channel_name: string | null
  count: number
  classified: number
  tasks: number
}

interface EventLogRow {
  id: string
  tenant_id: string | null
  event_type: string
  channel_id: string | null
  processing_status: string
  error_message: string | null
  created_at: string
  processed_at: string | null
}

interface SkillRow {
  id: string
  name: string
  description: string | null
  category: string
  priority: string
  expected_duration: string | null
  is_active: boolean | null
}

const fmtRelative = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const STATUS_TONE: Record<string, string> = {
  done:        'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  processing:  'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  received:    'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  error:       'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  duplicate:   'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  skipped:     'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500',
}

export const PlatformSlackAgent: React.FC = () => {
  const { isPlatformAdmin, isLoading } = usePlatformAdmin()
  const [stats, setStats] = useState<SlackStats | null>(null)
  const [channels, setChannels] = useState<ChannelBreakdown[]>([])
  const [events, setEvents] = useState<EventLogRow[]>([])
  const [skills, setSkills] = useState<SkillRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isPlatformAdmin) return
    void loadAll()
  }, [isPlatformAdmin])

  async function loadAll() {
    setLoading(true)
    try {
      const [statsRes, channelsRes, eventsRes, skillsRes] = await Promise.all([
        supabase.rpc('platform_slack_stats').single().then(r => r).catch(() => ({ data: null, error: 'no_rpc' })),
        supabase
          .from('communication_messages')
          .select('channel_name')
          .eq('platform', 'slack'),
        supabase
          .from('slack_event_log')
          .select('id, tenant_id, event_type, channel_id, processing_status, error_message, created_at, processed_at')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('skills')
          .select('id, name, description, category, priority, expected_duration, is_active')
          .eq('category', 'domain')
          .order('priority', { ascending: false }),
      ])

      // If the RPC doesn't exist yet, compute stats client-side from a single query.
      if ((statsRes as any)?.error === 'no_rpc' || !(statsRes as any)?.data) {
        const { data } = await supabase
          .from('communication_messages')
          .select('id, ai_processed, ai_classification, matched_client_id, matched_project_id, task_id')
          .eq('platform', 'slack')
        if (data) {
          const s: SlackStats = {
            total: data.length,
            classified: data.filter((m: any) => m.ai_processed).length,
            pending: data.filter((m: any) => !m.ai_processed).length,
            with_client: data.filter((m: any) => m.matched_client_id).length,
            with_project: data.filter((m: any) => m.matched_project_id).length,
            task_auto_created: data.filter((m: any) => m.task_id).length,
            notif_pending: 0,  // filled below
            high_conf: data.filter((m: any) => parseFloat(m.ai_classification?.confidence) >= 0.85).length,
            mid_conf: data.filter((m: any) => {
              const c = parseFloat(m.ai_classification?.confidence)
              return c >= 0.50 && c < 0.85
            }).length,
            low_conf: data.filter((m: any) => {
              const c = parseFloat(m.ai_classification?.confidence)
              return c < 0.50
            }).length,
          }
          const { data: notifData } = await supabase
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('type', 'mention')
            .eq('category', 'communications')
            .eq('read', false)
          s.notif_pending = (notifData as any)?.length ?? 0
          // count: exact head returns no rows — re-query for count
          const { count } = await supabase
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('type', 'mention')
            .eq('category', 'communications')
            .eq('read', false)
          s.notif_pending = count ?? 0
          setStats(s)
        }
      } else if ((statsRes as any).data) {
        setStats((statsRes as any).data as SlackStats)
      }

      // Channels breakdown — bucket client-side
      if (channelsRes.data) {
        const map = new Map<string, ChannelBreakdown>()
        for (const m of channelsRes.data as any[]) {
          const k = m.channel_name || '(no channel)'
          if (!map.has(k)) map.set(k, { channel_name: k, count: 0, classified: 0, tasks: 0 })
          map.get(k)!.count++
        }
        setChannels(Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 12))
      }

      if (eventsRes.data) setEvents(eventsRes.data as any[])
      if (skillsRes.data) setSkills(skillsRes.data as any[])
    } finally {
      setLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
      </div>
    )
  }
  if (!isPlatformAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="p-4 bg-red-100 dark:bg-red-900/20 rounded-full mb-4">
          <Icons.Shield size={24} className="text-red-600 dark:text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Access Denied</h2>
        <p className="text-zinc-500 mt-2">Platform admin access required.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400">Master · Slack agent</div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">Slack agentic mode</h1>
        <p className="text-sm text-zinc-500 mt-1 max-w-2xl">
          Observability del bot conversacional + clasificador AI sobre mensajes Slack monitoreados.
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard label="Total" value={stats?.total ?? 0} hint="mensajes Slack capturados" tone="neutral" />
        <KpiCard label="Procesados" value={stats?.classified ?? 0} hint={`${stats?.pending ?? 0} pendientes`} tone="success" />
        <KpiCard label="Matched client" value={stats?.with_client ?? 0} hint={`${stats?.total ? Math.round((stats.with_client / stats.total) * 100) : 0}% del total`} tone="neutral" />
        <KpiCard label="Auto-tasks" value={stats?.task_auto_created ?? 0} hint="creadas por classifier" tone="success" />
        <KpiCard label="CTA pendientes" value={stats?.notif_pending ?? 0} hint="esperando review" tone={stats && stats.notif_pending > 0 ? 'warning' : 'neutral'} />
      </div>

      {/* Confidence distribution */}
      {stats && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Confidence distribution</div>
          <ConfidenceBar high={stats.high_conf} mid={stats.mid_conf} low={stats.low_conf} total={stats.classified} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Channels */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Channels</h3>
            <span className="text-[11px] text-zinc-400">top 12 by volume</span>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {channels.length === 0 && <div className="px-5 py-6 text-sm text-zinc-500">No data</div>}
            {channels.map(c => (
              <div key={c.channel_name || 'noc'} className="px-5 py-2.5 flex items-center justify-between text-sm">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">#{c.channel_name}</span>
                <span className="text-zinc-500">{c.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Skills */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Skills</h3>
            <span className="text-[11px] text-zinc-400">{skills.length} active</span>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {skills.map(sk => (
              <div key={sk.id} className="px-5 py-3 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">{sk.name}</span>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-400">{sk.priority}</span>
                </div>
                <div className="text-[12px] text-zinc-500 line-clamp-2">{sk.description}</div>
              </div>
            ))}
            {skills.length === 0 && <div className="px-5 py-6 text-sm text-zinc-500">No skills seeded. Run the PR6 migration.</div>}
          </div>
        </div>
      </div>

      {/* Recent events */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Recent events</h3>
          <span className="text-[11px] text-zinc-400">slack_event_log · last 50</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/40">
                <th className="text-left px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Type</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Status</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Channel</th>
                <th className="text-right px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">When</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-6 text-center text-sm text-zinc-500">{loading ? 'Loading…' : 'No events yet. They appear when slack-events ingests new messages.'}</td></tr>
              )}
              {events.map(ev => (
                <tr key={ev.id} className="border-b border-zinc-50 dark:border-zinc-800/50 hover:bg-zinc-50/40 dark:hover:bg-zinc-800/20 transition-colors">
                  <td className="px-5 py-2.5 font-mono text-[12px] text-zinc-700 dark:text-zinc-300">{ev.event_type}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full ${STATUS_TONE[ev.processing_status] || 'bg-zinc-100'}`}>
                      {ev.processing_status}
                    </span>
                    {ev.error_message && <div className="text-[11px] text-red-500 mt-0.5">{ev.error_message.slice(0, 80)}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500 text-[12px] font-mono">{ev.channel_id || '—'}</td>
                  <td className="px-5 py-2.5 text-right text-zinc-500 text-[12px]">{fmtRelative(ev.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const KpiCard: React.FC<{ label: string; value: number | string; hint?: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' }> = ({ label, value, hint, tone = 'neutral' }) => {
  const toneClasses = {
    neutral: 'border-zinc-200 dark:border-zinc-800',
    success: 'border-emerald-200 dark:border-emerald-900/60',
    warning: 'border-amber-200 dark:border-amber-900/60',
    danger:  'border-red-200 dark:border-red-900/60',
  }
  return (
    <div className={`bg-white dark:bg-zinc-900 border ${toneClasses[tone]} rounded-xl p-4`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 mb-1.5">{label}</div>
      <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-zinc-400 mt-1">{hint}</div>}
    </div>
  )
}

const ConfidenceBar: React.FC<{ high: number; mid: number; low: number; total: number }> = ({ high, mid, low, total }) => {
  if (total === 0) return <div className="text-sm text-zinc-500">Nothing classified yet.</div>
  const pHigh = (high / total) * 100
  const pMid = (mid / total) * 100
  const pLow = (low / total) * 100
  return (
    <div>
      <div className="h-3 flex rounded-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
        <div className="bg-emerald-500" style={{ width: `${pHigh}%` }} title={`High ≥0.85: ${high}`} />
        <div className="bg-amber-400" style={{ width: `${pMid}%` }} title={`Mid 0.50-0.85: ${mid}`} />
        <div className="bg-zinc-400" style={{ width: `${pLow}%` }} title={`Low <0.50: ${low}`} />
      </div>
      <div className="mt-2 flex gap-4 text-[11px] text-zinc-500">
        <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1.5" />High {high}</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1.5" />Mid {mid}</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-zinc-400 mr-1.5" />Low {low}</span>
      </div>
    </div>
  )
}
