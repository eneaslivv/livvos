/**
 * InboxDigestCard — Resumen ejecutivo del inbox usando edge fn `inbox-digest`.
 *
 * UX:
 *   • Auto-corre cuando el componente monta (si tenantId disponible)
 *   • Cachea el último digest en sessionStorage para evitar regenerar al
 *     navegar fuera y volver
 *   • Botón "Regenerate" manual con loading spinner
 *   • Click en una priority row → onOpenMessage(msgId)
 *   • Click en un theme chip → onFilterByTheme(sample_ids[]) para hacer
 *     drill-down (los messages del tema se highlight en la lista)
 *
 * Diseño: card gold-tinted, header con headline + Regenerate, body con
 * stats strip + themes chips + priorities list. Colapsable por completo
 * para los días que solo querés ver la lista.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { Icons } from '../ui/Icons'

interface Theme {
  label: string
  count: number
  sample_message_ids: string[]
  priority: 'high' | 'medium' | 'low'
}

interface Priority {
  message_id: string
  summary: string
  suggested_action: string
}

interface Digest {
  headline: string
  stats: {
    total: number
    unread: number
    urgent: number
    new_requests: number
    follow_ups: number
    info_only: number
  }
  themes: Theme[]
  priorities: Priority[]
  cost_usd: number
  generated_at: string
  message_count: number
  since_hours?: number
}

interface Props {
  tenantId: string | null
  onOpenMessage?: (messageId: string) => void
  onFilterByMessageIds?: (ids: string[]) => void
}

const CACHE_KEY_PREFIX = 'livvos:inbox_digest:'
const CACHE_TTL_MS = 30 * 60 * 1000  // 30 min — fresco pero no quema OpenAI

const THEME_TONE: Record<string, string> = {
  high:   'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30',
  medium: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
  low:    'bg-zinc-50 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700',
}

const formatTimeAgo = (iso: string): string => {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'recién'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

export const InboxDigestCard: React.FC<Props> = ({ tenantId, onOpenMessage, onFilterByMessageIds }) => {
  const [digest, setDigest] = useState<Digest | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  const cacheKey = tenantId ? `${CACHE_KEY_PREFIX}${tenantId}` : null

  const loadFromCache = useCallback(() => {
    if (!cacheKey) return null
    try {
      const raw = sessionStorage.getItem(cacheKey)
      if (!raw) return null
      const parsed = JSON.parse(raw) as { digest: Digest; cached_at: string }
      const age = Date.now() - new Date(parsed.cached_at).getTime()
      if (age > CACHE_TTL_MS) {
        sessionStorage.removeItem(cacheKey)
        return null
      }
      return parsed.digest
    } catch { return null }
  }, [cacheKey])

  const saveToCache = useCallback((d: Digest) => {
    if (!cacheKey) return
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({ digest: d, cached_at: new Date().toISOString() }))
    } catch { /* quota / blocked */ }
  }, [cacheKey])

  const fetchDigest = useCallback(async (skipCache = false) => {
    if (!tenantId) return
    if (!skipCache) {
      const cached = loadFromCache()
      if (cached) { setDigest(cached); return }
    }
    setLoading(true)
    setError(null)
    try {
      // Use raw fetch instead of supabase.functions.invoke — the helper
      // sometimes wraps the body in a way that breaks our edge fn signature,
      // and its error reporting is opaque ("Failed to send a request to
      // the Edge Function" without the actual cause).
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Not authenticated')
      const supabaseUrl = (supabase as any).supabaseUrl || (supabase as any).rest?.url?.replace('/rest/v1', '') || ''
      const url = `${supabaseUrl}/functions/v1/inbox-digest`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': (supabase as any).supabaseKey || '',
        },
        // 30-day window: the digest must reflect the real backlog, not just
        // the last 3 days. With messages days/weeks old, a 72h window showed
        // "0 messages" while hundreds sat pending.
        body: JSON.stringify({ tenant_id: tenantId, since_hours: 720, limit: 25 }),
      })
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`)
      }
      const data = await res.json()
      if (!data) throw new Error('Empty response')
      setDigest(data as Digest)
      saveToCache(data as Digest)
    } catch (err: any) {
      console.error('[InboxDigestCard]', err)
      setError(err?.message || 'Could not generate digest')
    } finally {
      setLoading(false)
    }
  }, [tenantId, loadFromCache, saveToCache])

  useEffect(() => {
    void fetchDigest(false)
  }, [fetchDigest])

  if (!tenantId) return null

  // First-load skeleton
  if (loading && !digest) {
    return (
      <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 mb-4 animate-pulse">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-3.5 w-32 rounded-full bg-zinc-200 dark:bg-zinc-800" />
        </div>
        <div className="h-5 w-3/4 rounded-md bg-zinc-200 dark:bg-zinc-800 mb-2" />
        <div className="h-3 w-1/2 rounded-md bg-zinc-200 dark:bg-zinc-800 mb-3" />
        <div className="flex gap-2">
          <div className="h-5 w-20 rounded-full bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-5 w-24 rounded-full bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-5 w-16 rounded-full bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </div>
    )
  }

  if (error && !digest) {
    return (
      <div className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50/50 dark:bg-rose-500/10 p-3 mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[12px] text-rose-700 dark:text-rose-300">
          <Icons.AlertCircle size={13} />
          <span>Couldn&apos;t generate digest: {error}</span>
        </div>
        <button
          onClick={() => fetchDigest(true)}
          className="text-[11px] font-medium text-rose-700 dark:text-rose-300 hover:underline"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!digest) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 mb-4 overflow-hidden"
    >
      {/* Header — fondo limpio, solo el icon mantiene el accent sutil */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40 transition-colors"
      >
        <div className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
          <Icons.Sparkles size={13} className="text-zinc-500 dark:text-zinc-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-zinc-400 dark:text-zinc-500 mb-0.5">
            Inbox digest · last {Math.max(1, Math.round((digest.since_hours || 72) / 24))}d
          </div>
          <div className="text-[13.5px] font-medium text-zinc-900 dark:text-zinc-100 leading-snug">
            {digest.headline}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); fetchDigest(true) }}
          disabled={loading}
          className="shrink-0 px-2 py-1 rounded-md text-[10.5px] font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-200 disabled:opacity-40 inline-flex items-center gap-1 transition-colors"
          title="Regenerate digest now (~$0.0001 in tokens)"
        >
          <Icons.RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Regen…' : 'Regen'}
        </button>
        <span className="text-[9.5px] font-mono text-zinc-400 dark:text-zinc-600 shrink-0">
          {formatTimeAgo(digest.generated_at)}
        </span>
        <Icons.ChevronDown
          size={12}
          className={`text-zinc-400 transition-transform shrink-0 ${collapsed ? '' : 'rotate-180'}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3">
              {/* Stats strip */}
              {digest.stats && (
                <div className="flex flex-wrap gap-1.5 text-[10.5px]">
                  <StatPill label="Total" value={digest.stats.total} />
                  <StatPill label="Pending" value={digest.stats.unread} tone="zinc" />
                  {digest.stats.urgent > 0 && <StatPill label="Urgent" value={digest.stats.urgent} tone="rose" />}
                  {digest.stats.new_requests > 0 && <StatPill label="Requests" value={digest.stats.new_requests} tone="amber" />}
                  {digest.stats.follow_ups > 0 && <StatPill label="Follow-ups" value={digest.stats.follow_ups} tone="sky" />}
                </div>
              )}

              {/* Themes */}
              {digest.themes && digest.themes.length > 0 && (
                <div>
                  <div className="text-[9.5px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">
                    Topics
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {digest.themes.map((t, i) => (
                      <button
                        key={i}
                        onClick={() => t.sample_message_ids?.length > 0 && onFilterByMessageIds?.(t.sample_message_ids)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${THEME_TONE[t.priority] || THEME_TONE.medium} hover:scale-[1.03] active:scale-100`}
                        title={`${t.count} mensajes · click para filtrar`}
                      >
                        <span>{t.label}</span>
                        <span className="text-[9px] font-mono opacity-70">{t.count}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Priorities */}
              {digest.priorities && digest.priorities.length > 0 && (
                <div>
                  <div className="text-[9.5px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5 flex items-center gap-1">
                    <Icons.AlertCircle size={9} />
                    Hoy
                  </div>
                  <ul className="space-y-1">
                    {digest.priorities.map((p, i) => (
                      <li key={i}>
                        <button
                          onClick={() => onOpenMessage?.(p.message_id)}
                          className="group w-full text-left px-2.5 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors flex items-start gap-2.5"
                        >
                          <span className="mt-1 w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] text-zinc-800 dark:text-zinc-200 leading-snug">
                              {p.summary}
                            </div>
                            <div className="text-[10.5px] text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-1">
                              <Icons.ArrowLeft size={8} className="rotate-180" />
                              {p.suggested_action}
                            </div>
                          </div>
                          <Icons.ChevronRight size={11} className="text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors mt-1.5 shrink-0" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Footer — cost + sample size */}
              {digest.cost_usd > 0 && (
                <div className="text-[9.5px] font-mono text-zinc-400 dark:text-zinc-600 text-right">
                  generated from {digest.message_count} msgs · ${digest.cost_usd.toFixed(5)}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

const StatPill: React.FC<{ label: string; value: number; tone?: 'zinc' | 'rose' | 'amber' | 'sky' }> = ({ label, value, tone = 'zinc' }) => {
  const tones: Record<string, string> = {
    zinc:  'bg-white/70 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700',
    rose:  'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30',
    amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30',
    sky:   'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-500/30',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${tones[tone]}`}>
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="opacity-70">{label}</span>
    </span>
  )
}
