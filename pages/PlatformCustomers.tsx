/**
 * PlatformCustomers — el panel maestro de control de clientes.
 *
 * Dos pestañas:
 *  - SaaS customers (tenants) — agencias que pagan o usan LivvOS. Reusa
 *    el TenantsTab extraído de pages/PlatformAdmin.tsx.
 *  - External clients (CRM) — los clientes propios del master tenant
 *    (LIVV). Tabla `clients` filtrada por master tenant_id.
 *
 * El header tiene un botón "+ New customer" que abre CreateTenantModal,
 * porque "agregar un cliente externo" se hace desde el CRM normal en
 * cada tenant; lo que solo el master agrega es un nuevo tenant.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { Icons } from '../components/ui/Icons'
import {
  usePlatformAdmin, type PlatformTenant,
} from '../hooks/usePlatformAdmin'
import { useTenant } from '../context/TenantContext'
import { supabase } from '../lib/supabase'
import { TenantsTab } from '../components/platform/TenantsTab'
import { CreateTenantModal } from '../components/platform/CreateTenantModal'
import { formatLastActivity } from '../components/platform/_shared'

type Tab = 'saas' | 'external'

interface ExternalClient {
  id: string
  tenant_id: string
  name: string
  email: string | null
  company: string | null
  phone: string | null
  status: 'active' | 'inactive' | 'prospect'
  industry: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

const STATUS_CHIP: Record<string, string> = {
  active:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  inactive: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  prospect: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
}

export const PlatformCustomers: React.FC = () => {
  const {
    isPlatformAdmin, isLoading, dashboard, dashboardLoading,
    fetchDashboard, createTenant, suspendTenant, reactivateTenant,
    updateTenant, switchToTenant, seedDemoData,
  } = usePlatformAdmin()
  const { memberships } = useTenant()

  const [tab, setTab] = useState<Tab>('saas')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedTenant, setSelectedTenant] = useState<PlatformTenant | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  // External clients state
  const [externalClients, setExternalClients] = useState<ExternalClient[]>([])
  const [externalLoading, setExternalLoading] = useState(false)

  // The master tenant id — the "native" tenant of the current platform admin.
  // For LIVV that's the LIVV master workspace; the user's external CRM
  // clients live there.
  const masterTenantId = useMemo(() => {
    const native = memberships.find(m => m.source === 'native' && m.is_super_agency)
    return native?.tenant_id || memberships.find(m => m.source === 'native')?.tenant_id || null
  }, [memberships])

  useEffect(() => {
    if (isPlatformAdmin) fetchDashboard()
  }, [isPlatformAdmin, fetchDashboard])

  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(null), 5000)
    return () => clearTimeout(t)
  }, [message])

  // Load external clients when the tab switches OR the master tenant resolves.
  useEffect(() => {
    if (tab !== 'external' || !masterTenantId) return
    let cancelled = false
    setExternalLoading(true)
    supabase
      .from('clients')
      .select('id, tenant_id, name, email, company, phone, status, industry, notes, created_at, updated_at')
      .eq('tenant_id', masterTenantId)
      .order('updated_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (!error && data) setExternalClients(data as ExternalClient[])
        setExternalLoading(false)
      })
    return () => { cancelled = true }
  }, [tab, masterTenantId])

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

  const tenants = dashboard?.tenants || []
  const totalSaaS = tenants.length
  const trialEndingSoon = tenants.filter(t => {
    if (t.status !== 'trial' || !t.trial_ends_at) return false
    const ends = new Date(t.trial_ends_at).getTime()
    const days = (ends - Date.now()) / 86_400_000
    return days <= 7 && days >= 0
  }).length

  // Filter external clients on the same search box for consistency.
  const filteredExternal = externalClients.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return c.name.toLowerCase().includes(q)
        || (c.email || '').toLowerCase().includes(q)
        || (c.company || '').toLowerCase().includes(q)
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400">Master · Customer control</div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">Customers</h1>
          <p className="text-sm text-zinc-500 mt-1">
            LivvOS tenants and master-tenant external clients — one place.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-2 text-sm font-medium text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 rounded-lg hover:opacity-90 transition-opacity inline-flex items-center gap-2"
        >
          <Icons.Plus size={14} /> New customer
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="SaaS customers" value={totalSaaS} sub={`${dashboard?.active_tenants ?? 0} active`} />
        <KpiCard label="External clients" value={externalClients.length} sub={`In ${memberships.find(m => m.tenant_id === masterTenantId)?.tenant_name || 'master'}`} />
        <KpiCard label="Trials ending soon" value={trialEndingSoon} sub="Next 7 days" tone={trialEndingSoon > 0 ? 'amber' : undefined} />
        <KpiCard label="New (30d)" value={dashboard?.tenants_created_last_30d ?? 0} sub="Tenants created" />
      </div>

      {/* Message */}
      {message && (
        <div className={`px-4 py-2.5 rounded-lg text-sm font-medium ${
          message.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300'
            : 'bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-300'
        }`}>
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800/60 p-1 rounded-xl w-fit">
        <button
          onClick={() => { setTab('saas'); setSelectedTenant(null) }}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2 ${
            tab === 'saas'
              ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          <Icons.Briefcase size={13} /> SaaS customers
          <span className="ml-1 text-[10px] text-zinc-400">{totalSaaS}</span>
        </button>
        <button
          onClick={() => setTab('external')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2 ${
            tab === 'external'
              ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          <Icons.Users size={13} /> External clients
          <span className="ml-1 text-[10px] text-zinc-400">{externalClients.length}</span>
        </button>
      </div>

      {/* Content */}
      {tab === 'saas' && dashboard && (
        <TenantsTab
          tenants={dashboard.tenants}
          search={search}
          setSearch={setSearch}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          selectedTenant={selectedTenant}
          setSelectedTenant={setSelectedTenant}
          onSuspend={async (id, reason) => {
            try { await suspendTenant(id, reason); setMessage({ text: 'Tenant suspended', type: 'success' }); setSelectedTenant(null) }
            catch { setMessage({ text: 'Failed to suspend tenant', type: 'error' }) }
          }}
          onReactivate={async (id) => {
            try { await reactivateTenant(id); setMessage({ text: 'Tenant reactivated', type: 'success' }); setSelectedTenant(null) }
            catch { setMessage({ text: 'Failed to reactivate tenant', type: 'error' }) }
          }}
          onUpdate={async (id, updates) => {
            try { await updateTenant(id, updates); setMessage({ text: 'Tenant updated', type: 'success' }) }
            catch { setMessage({ text: 'Failed to update tenant', type: 'error' }) }
          }}
          onSwitchToTenant={async (id) => {
            try { await switchToTenant(id) }
            catch (err: any) { setMessage({ text: err.message || 'Failed to switch tenant', type: 'error' }) }
          }}
          onSeedDemoData={async (slug) => {
            try {
              const result = await seedDemoData(slug)
              setMessage({ text: result || 'Demo data seeded!', type: 'success' })
            } catch (err: any) {
              setMessage({ text: err.message || 'Failed to seed demo data', type: 'error' })
            }
          }}
        />
      )}

      {tab === 'external' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Icons.Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Search clients..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
            </div>
            <span className="text-[11px] text-zinc-400">
              {filteredExternal.length} {filteredExternal.length === 1 ? 'client' : 'clients'} in your master CRM
            </span>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800">
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Client</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Industry</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Last touch</th>
                </tr>
              </thead>
              <tbody>
                {externalLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-zinc-400">
                      <div className="inline-block w-5 h-5 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
                    </td>
                  </tr>
                ) : filteredExternal.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-zinc-400">
                      {externalClients.length === 0
                        ? 'No external clients yet in your master CRM.'
                        : 'No clients match your search.'}
                    </td>
                  </tr>
                ) : filteredExternal.map(c => (
                  <tr key={c.id} className="border-b border-zinc-50 dark:border-zinc-800/50">
                    <td className="px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">{c.name}</p>
                        {c.company && <p className="text-[11px] text-zinc-400 truncate max-w-[220px]">{c.company}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium w-fit inline-block ${STATUS_CHIP[c.status] || STATUS_CHIP.active}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">{c.email || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-zinc-500">{c.industry || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-zinc-500">{formatLastActivity(c.updated_at) || '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-zinc-400">
            External clients live in the master tenant's CRM. Add or edit them from the regular Clients page when you're in OS mode.
          </p>
        </div>
      )}

      {dashboardLoading && !dashboard && (
        <div className="flex items-center justify-center h-48">
          <div className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
        </div>
      )}

      {/* Create-tenant modal — opened from header button */}
      <CreateTenantModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={async (params) => {
          try {
            const id = await createTenant(params)
            setMessage({ text: `Tenant created (${id}). Invitation sent to ${params.ownerEmail}.`, type: 'success' })
            setTab('saas')
          } catch (err: any) {
            setMessage({ text: err.message || 'Failed to create tenant', type: 'error' })
          }
        }}
      />
    </div>
  )
}

// ── KPI card (small, inline) ──────────────────────────────────────────────

const KpiCard: React.FC<{ label: string; value: number; sub?: string; tone?: 'amber' | 'emerald' }> = ({ label, value, sub, tone }) => {
  const valueClass = tone === 'amber'
    ? 'text-amber-600 dark:text-amber-400'
    : tone === 'emerald'
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-zinc-900 dark:text-zinc-100'
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
      <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${valueClass}`}>{value}</p>
      {sub && <p className="text-[11px] text-zinc-400 mt-0.5">{sub}</p>}
    </div>
  )
}
