/**
 * PlatformAudit — cross-tenant activity feed for the platform admin.
 *
 * No dedicated `audit_log` table exists yet (Phase 2 of the LivvOS spec).
 * Until then we render the most recent rows of the existing `activity_logs`
 * table — which already captures most user actions across every tenant —
 * with filters by tenant and entity type. Platform admins can read all
 * tenants because the RPC (or service-role) returns full rows.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { Icons } from '../components/ui/Icons'
import { supabase } from '../lib/supabase'
import { usePlatformAdmin } from '../hooks/usePlatformAdmin'
import { formatLastActivity } from '../components/platform/_shared'

interface ActivityRow {
  id: string
  tenant_id: string | null
  user_id: string | null
  user_name: string | null
  user_avatar: string | null
  action: string | null
  target: string | null
  entity_type: string | null
  project_title: string | null
  type: string | null
  details: string | null
  created_at: string
}

interface TenantLite {
  id: string
  name: string
  slug: string
}

const PAGE_SIZE = 50

export const PlatformAudit: React.FC = () => {
  const { isPlatformAdmin, isLoading, dashboard, fetchDashboard } = usePlatformAdmin()
  const [rows, setRows] = useState<ActivityRow[]>([])
  const [loading, setLoading] = useState(false)
  const [tenantFilter, setTenantFilter] = useState<string>('all')
  const [entityFilter, setEntityFilter] = useState<string>('all')

  useEffect(() => {
    if (isPlatformAdmin && !dashboard) fetchDashboard()
  }, [isPlatformAdmin, dashboard, fetchDashboard])

  // Build the lookup of tenants for the filter dropdown + row labels.
  const tenants = useMemo<TenantLite[]>(() => {
    if (!dashboard) return []
    return dashboard.tenants.map(t => ({ id: t.id, name: t.name, slug: t.slug }))
  }, [dashboard])

  const tenantNameById = useMemo(() => {
    const m = new Map<string, string>()
    tenants.forEach(t => m.set(t.id, t.name))
    return m
  }, [tenants])

  const load = async () => {
    if (!isPlatformAdmin) return
    setLoading(true)
    try {
      let query = supabase
        .from('activity_logs')
        .select('id, tenant_id, user_id, user_name, user_avatar, action, target, entity_type, project_title, type, details, created_at')
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)
      if (tenantFilter !== 'all') query = query.eq('tenant_id', tenantFilter)
      if (entityFilter !== 'all') query = query.eq('entity_type', entityFilter)
      const { data, error } = await query
      if (!error && data) setRows(data as ActivityRow[])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isPlatformAdmin) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlatformAdmin, tenantFilter, entityFilter])

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
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400">Master · Audit</div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">Audit log</h1>
          <p className="text-sm text-zinc-500 mt-1 max-w-2xl">
            Recent actions across every tenant. Powered by <code className="font-mono">activity_logs</code> until a
            dedicated <code className="font-mono">audit_log</code> table lands in Phase 2.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
        >
          <Icons.RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={tenantFilter}
          onChange={e => setTenantFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-400"
        >
          <option value="all">All tenants</option>
          {tenants.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <select
          value={entityFilter}
          onChange={e => setEntityFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-400"
        >
          <option value="all">All entities</option>
          <option value="task">Tasks</option>
          <option value="project">Projects</option>
          <option value="client">Clients</option>
          <option value="lead">Leads</option>
          <option value="document">Documents</option>
          <option value="tenant">Tenants</option>
        </select>
        <span className="text-[11px] text-zinc-400">
          Showing latest {rows.length} of last {PAGE_SIZE}
        </span>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/40">
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">When</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Tenant</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Actor</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Action</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Target</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-400">
                  <div className="inline-block w-5 h-5 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-400">No activity matches the selected filters.</td>
              </tr>
            ) : rows.map(r => (
              <tr key={r.id} className="border-b border-zinc-50 dark:border-zinc-800/50">
                <td className="px-5 py-3 text-xs text-zinc-500" title={new Date(r.created_at).toLocaleString()}>
                  {formatLastActivity(r.created_at) || '—'}
                </td>
                <td className="px-4 py-3 text-xs text-zinc-700 dark:text-zinc-300">
                  {r.tenant_id ? (tenantNameById.get(r.tenant_id) || r.tenant_id.slice(0, 6)) : '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {r.user_avatar ? (
                      <img src={r.user_avatar} alt="" className="w-5 h-5 rounded-full shrink-0" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-[9px] font-bold text-zinc-500 flex items-center justify-center shrink-0">
                        {(r.user_name || '?')[0]?.toUpperCase()}
                      </div>
                    )}
                    <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate">{r.user_name || 'System'}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    {r.entity_type && (
                      <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                        {r.entity_type}
                      </span>
                    )}
                    <span className="text-xs text-zinc-700 dark:text-zinc-300">{r.action || r.type || '—'}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-xs text-zinc-600 dark:text-zinc-400 truncate max-w-[260px]" title={r.target || r.details || ''}>
                    {r.target || r.project_title || r.details || '—'}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
