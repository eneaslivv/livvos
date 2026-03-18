import React, { useState, useEffect, useMemo } from 'react'
import { Icons } from '../components/ui/Icons'
import { usePlatformAdmin, type PlatformTenant, type CreateTenantParams } from '../hooks/usePlatformAdmin'
import { ALL_FEATURES, FEATURE_LABELS, getFeaturesForPlan, getResourceLimitsForPlan, type PlanFeatures, type PlanResourceLimits } from '../config/planDefaults'

type Tab = 'dashboard' | 'tenants' | 'create'

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
  suspended: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300',
  trial: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  setup: 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300',
}

const PLAN_COLORS: Record<string, string> = {
  starter: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  professional: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300',
  enterprise: 'bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-300',
}

export const PlatformAdmin: React.FC = () => {
  const {
    isPlatformAdmin, isLoading, dashboard, dashboardLoading,
    fetchDashboard, createTenant, suspendTenant, reactivateTenant, updateTenant,
    switchToTenant, seedDemoData,
  } = usePlatformAdmin()

  const [tab, setTab] = useState<Tab>('dashboard')
  const [selectedTenant, setSelectedTenant] = useState<PlatformTenant | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    if (isPlatformAdmin) fetchDashboard()
  }, [isPlatformAdmin, fetchDashboard])

  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(null), 5000)
      return () => clearTimeout(t)
    }
  }, [message])

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Platform Admin</h1>
          <p className="text-sm text-zinc-500 mt-1">Manage all tenants and platform settings</p>
        </div>
        <button
          onClick={() => fetchDashboard()}
          disabled={dashboardLoading}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
        >
          <Icons.RefreshCw size={14} className={dashboardLoading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800/60 p-1 rounded-xl w-fit">
        {([['dashboard', 'Dashboard'], ['tenants', 'Tenants'], ['create', 'Create Tenant']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => { setTab(id); setSelectedTenant(null) }}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === id
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Message */}
      {message && (
        <div className={`px-4 py-2.5 rounded-lg text-sm font-medium ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-300'
        }`}>
          {message.text}
        </div>
      )}

      {/* Content */}
      {tab === 'dashboard' && dashboard && <DashboardTab dashboard={dashboard} />}
      {tab === 'tenants' && dashboard && (
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
      {tab === 'create' && (
        <CreateTenantTab
          onCreate={async (params) => {
            try {
              const id = await createTenant(params)
              setMessage({ text: `Tenant created (${id}). Invitation sent to ${params.ownerEmail}.`, type: 'success' })
              setTab('tenants')
            } catch (err: any) {
              setMessage({ text: err.message || 'Failed to create tenant', type: 'error' })
            }
          }}
        />
      )}

      {dashboardLoading && !dashboard && (
        <div className="flex items-center justify-center h-48">
          <div className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}

/* ─── Dashboard Tab ─── */
const DashboardTab: React.FC<{ dashboard: NonNullable<ReturnType<typeof usePlatformAdmin>['dashboard']> }> = ({ dashboard }) => {
  const stats = [
    { label: 'Total Tenants', value: dashboard.total_tenants, color: 'text-zinc-900 dark:text-zinc-100' },
    { label: 'Active', value: dashboard.active_tenants, color: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Suspended', value: dashboard.suspended_tenants, color: 'text-red-600 dark:text-red-400' },
    { label: 'Trial', value: dashboard.trial_tenants, color: 'text-amber-600 dark:text-amber-400' },
    { label: 'Total Users', value: dashboard.total_users, color: 'text-blue-600 dark:text-blue-400' },
    { label: 'Total Projects', value: dashboard.total_projects, color: 'text-indigo-600 dark:text-indigo-400' },
    { label: 'New (30d)', value: dashboard.tenants_created_last_30d, color: 'text-purple-600 dark:text-purple-400' },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {stats.map(s => (
        <div key={s.label} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{s.label}</p>
          <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
        </div>
      ))}
    </div>
  )
}

/* ─── Tenants Tab ─── */
const TenantsTab: React.FC<{
  tenants: PlatformTenant[]
  search: string
  setSearch: (s: string) => void
  statusFilter: string
  setStatusFilter: (s: string) => void
  selectedTenant: PlatformTenant | null
  setSelectedTenant: (t: PlatformTenant | null) => void
  onSuspend: (id: string, reason: string) => Promise<void>
  onReactivate: (id: string) => Promise<void>
  onUpdate: (id: string, updates: Record<string, any>) => Promise<void>
  onSwitchToTenant: (id: string) => Promise<void>
  onSeedDemoData: (slug: string) => Promise<void>
}> = ({ tenants, search, setSearch, statusFilter, setStatusFilter, selectedTenant, setSelectedTenant, onSuspend, onReactivate, onUpdate, onSwitchToTenant, onSeedDemoData }) => {

  const filtered = useMemo(() => {
    return tenants.filter(t => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q) || (t.owner_email || '').toLowerCase().includes(q)
      }
      return true
    })
  }, [tenants, search, statusFilter])

  return (
    <div className="flex gap-6">
      {/* List */}
      <div className={`flex-1 ${selectedTenant ? 'max-w-[calc(100%-380px)]' : ''}`}>
        {/* Filters */}
        <div className="flex gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Icons.Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search tenants..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-400"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="trial">Trial</option>
            <option value="setup">Setup</option>
          </select>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800">
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Tenant</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Plan</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Owner / Contact</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Users</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Projects</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Tasks</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Activity</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-zinc-400">No tenants found.</td>
                </tr>
              ) : filtered.map(t => {
                const lastAct = t.last_activity ? (() => {
                  const diff = Date.now() - new Date(t.last_activity!).getTime()
                  const mins = Math.floor(diff / 60000)
                  if (mins < 60) return `${mins}m ago`
                  const hrs = Math.floor(mins / 60)
                  if (hrs < 24) return `${hrs}h ago`
                  const days = Math.floor(hrs / 24)
                  if (days < 30) return `${days}d ago`
                  return new Date(t.last_activity!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                })() : null

                return (
                <tr
                  key={t.id}
                  onClick={() => setSelectedTenant(selectedTenant?.id === t.id ? null : t)}
                  className={`border-b border-zinc-50 dark:border-zinc-800/50 cursor-pointer transition-colors ${
                    selectedTenant?.id === t.id
                      ? 'bg-zinc-50 dark:bg-zinc-800/50'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/30'
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {t.logo_url ? (
                        <img src={t.logo_url} alt="" className="w-6 h-6 rounded object-contain" />
                      ) : (
                        <div className="w-6 h-6 rounded bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-[10px] font-bold text-zinc-500">
                          {t.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">{t.name}</p>
                        <p className="text-[11px] text-zinc-400">{t.slug}</p>
                        {t.notes && (
                          <p className="text-[10px] text-zinc-400/70 truncate max-w-[180px]" title={t.notes}>
                            {t.notes.length > 40 ? t.notes.slice(0, 40) + '...' : t.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium w-fit ${STATUS_COLORS[t.status] || STATUS_COLORS.active}`}>
                        {t.status}
                      </span>
                      {t.status === 'trial' && t.trial_ends_at && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400">
                          ends {new Date(t.trial_ends_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${PLAN_COLORS[t.plan] || PLAN_COLORS.starter}`}>
                      {t.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-xs text-zinc-600 dark:text-zinc-400">{t.owner_email || '-'}</p>
                      {(t.contact_name || t.contact_email) && (
                        <p className="text-[10px] text-zinc-400 truncate">
                          {t.contact_name}{t.contact_name && t.contact_email ? ' · ' : ''}{t.contact_email && t.contact_email !== t.owner_email ? t.contact_email : ''}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-zinc-700 dark:text-zinc-300 font-medium">{t.user_count}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-zinc-700 dark:text-zinc-300 font-medium">{t.project_count}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-zinc-700 dark:text-zinc-300 font-medium">{t.task_count ?? '-'}</span>
                  </td>
                  <td className="px-4 py-3">
                    {lastAct ? (
                      <span className="text-xs text-zinc-500">{lastAct}</span>
                    ) : (
                      <span className="text-xs text-zinc-400">-</span>
                    )}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Panel */}
      {selectedTenant && (
        <TenantDetailPanel
          tenant={selectedTenant}
          onClose={() => setSelectedTenant(null)}
          onSuspend={onSuspend}
          onReactivate={onReactivate}
          onUpdate={onUpdate}
          onSwitchToTenant={onSwitchToTenant}
          onSeedDemoData={onSeedDemoData}
        />
      )}
    </div>
  )
}

/* ─── Tenant Detail Panel ─── */
const TenantDetailPanel: React.FC<{
  tenant: PlatformTenant
  onClose: () => void
  onSuspend: (id: string, reason: string) => Promise<void>
  onReactivate: (id: string) => Promise<void>
  onUpdate: (id: string, updates: Record<string, any>) => Promise<void>
  onSwitchToTenant: (id: string) => Promise<void>
  onSeedDemoData: (slug: string) => Promise<void>
}> = ({ tenant, onClose, onSuspend, onReactivate, onUpdate, onSwitchToTenant, onSeedDemoData }) => {
  const [plan, setPlan] = useState(tenant.plan)
  const [notes, setNotes] = useState(tenant.notes || '')
  const [contactEmail, setContactEmail] = useState(tenant.contact_email || '')
  const [contactName, setContactName] = useState(tenant.contact_name || '')
  const [features, setFeatures] = useState<PlanFeatures>(() => {
    const defaults = getFeaturesForPlan(tenant.plan)
    return tenant.features ? { ...defaults, ...tenant.features } as PlanFeatures : defaults
  })
  const [resourceLimits, setResourceLimits] = useState<PlanResourceLimits>(() => {
    const defaults = getResourceLimitsForPlan(tenant.plan)
    return tenant.resource_limits ? { ...defaults, ...tenant.resource_limits } as PlanResourceLimits : defaults
  })
  const [suspendReason, setSuspendReason] = useState('')
  const [showSuspendConfirm, setShowSuspendConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    setPlan(tenant.plan)
    setNotes(tenant.notes || '')
    setContactEmail(tenant.contact_email || '')
    setContactName(tenant.contact_name || '')
    const fDefaults = getFeaturesForPlan(tenant.plan)
    setFeatures(tenant.features ? { ...fDefaults, ...tenant.features } as PlanFeatures : fDefaults)
    const rDefaults = getResourceLimitsForPlan(tenant.plan)
    setResourceLimits(tenant.resource_limits ? { ...rDefaults, ...tenant.resource_limits } as PlanResourceLimits : rDefaults)
    setSuspendReason('')
    setShowSuspendConfirm(false)
  }, [tenant.id])

  const handlePlanChange = (newPlan: string) => {
    setPlan(newPlan)
    setFeatures(getFeaturesForPlan(newPlan))
    setResourceLimits(getResourceLimitsForPlan(newPlan))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onUpdate(tenant.id, { plan, notes, contact_email: contactEmail, contact_name: contactName, features, resource_limits: resourceLimits })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-[360px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 space-y-4 sticky top-4 max-h-[calc(100vh-120px)] overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{tenant.name}</h3>
          <p className="text-xs text-zinc-400 mt-0.5">{tenant.slug}</p>
        </div>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
          <Icons.X size={18} />
        </button>
      </div>

      {/* Status + Stats */}
      <div className="flex items-center gap-2">
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_COLORS[tenant.status] || STATUS_COLORS.active}`}>
          {tenant.status}
        </span>
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${PLAN_COLORS[tenant.plan] || PLAN_COLORS.starter}`}>
          {tenant.plan}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3">
          <p className="text-[11px] text-zinc-500 uppercase">Users</p>
          <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{tenant.user_count}</p>
        </div>
        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3">
          <p className="text-[11px] text-zinc-500 uppercase">Projects</p>
          <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{tenant.project_count}</p>
        </div>
      </div>

      {tenant.owner_email && (
        <div>
          <p className="text-[11px] text-zinc-500 uppercase mb-1">Owner</p>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">{tenant.owner_email}</p>
        </div>
      )}

      <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4 space-y-3">
        <div>
          <label className="text-[11px] font-medium text-zinc-500 uppercase">Plan</label>
          <select
            value={plan}
            onChange={e => handlePlanChange(e.target.value)}
            className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-400"
          >
            <option value="starter">Starter</option>
            <option value="professional">Professional</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>

        {/* Feature Toggles */}
        <div>
          <label className="text-[11px] font-medium text-zinc-500 uppercase mb-2 block">Features</label>
          <div className="grid grid-cols-2 gap-1.5">
            {ALL_FEATURES.map(key => (
              <label key={key} className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 py-1 px-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={features[key] ?? false}
                  onChange={e => setFeatures(prev => ({ ...prev, [key]: e.target.checked }))}
                  className="rounded border-zinc-300 dark:border-zinc-600 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                />
                {FEATURE_LABELS[key]}
              </label>
            ))}
          </div>
        </div>

        {/* Resource Limits */}
        <div>
          <label className="text-[11px] font-medium text-zinc-500 uppercase mb-2 block">Resource Limits</label>
          <div className="grid grid-cols-2 gap-2">
            {([
              ['max_users', 'Max Users'],
              ['max_projects', 'Max Projects'],
              ['max_storage_mb', 'Storage (MB)'],
              ['max_api_calls_per_month', 'API Calls/mo'],
            ] as const).map(([key, label]) => (
              <div key={key}>
                <label className="text-[10px] text-zinc-400">{label}</label>
                <input
                  type="number"
                  value={resourceLimits[key]}
                  onChange={e => setResourceLimits(prev => ({ ...prev, [key]: parseInt(e.target.value) || 0 }))}
                  className="w-full mt-0.5 px-2 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[11px] font-medium text-zinc-500 uppercase">Contact Name</label>
          <input
            type="text"
            value={contactName}
            onChange={e => setContactName(e.target.value)}
            className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-400"
          />
        </div>

        <div>
          <label className="text-[11px] font-medium text-zinc-500 uppercase">Contact Email</label>
          <input
            type="email"
            value={contactEmail}
            onChange={e => setContactEmail(e.target.value)}
            className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-400"
          />
        </div>

        <div>
          <label className="text-[11px] font-medium text-zinc-500 uppercase">Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-400 resize-none"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2 text-sm font-medium text-white bg-zinc-800 dark:bg-zinc-200 dark:text-zinc-900 rounded-lg hover:bg-zinc-700 dark:hover:bg-zinc-300 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Quick Actions */}
      <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4 space-y-2">
        <button
          onClick={async () => {
            setSwitching(true)
            try { await onSwitchToTenant(tenant.id) } finally { setSwitching(false) }
          }}
          disabled={switching}
          className="w-full py-2 text-sm font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-500/20 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          <Icons.LogIn size={14} />
          {switching ? 'Switching...' : 'Switch to Tenant'}
        </button>

        {tenant.user_count === 0 && tenant.project_count === 0 && (
          <button
            onClick={async () => {
              setSeeding(true)
              try { await onSeedDemoData(tenant.slug) } finally { setSeeding(false) }
            }}
            disabled={seeding}
            className="w-full py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-500/20 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            <Icons.Sparkles size={14} />
            {seeding ? 'Seeding...' : 'Seed Demo Data'}
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4 space-y-2">
        {tenant.status === 'suspended' ? (
          <button
            onClick={() => onReactivate(tenant.id)}
            className="w-full py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors"
          >
            Reactivate Tenant
          </button>
        ) : (
          <>
            {showSuspendConfirm ? (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Reason for suspension..."
                  value={suspendReason}
                  onChange={e => setSuspendReason(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-red-200 dark:border-red-800 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-red-400"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => onSuspend(tenant.id, suspendReason)}
                    className="flex-1 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Confirm Suspend
                  </button>
                  <button
                    onClick={() => setShowSuspendConfirm(false)}
                    className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowSuspendConfirm(true)}
                className="w-full py-2 text-sm font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/10 rounded-lg hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors"
              >
                Suspend Tenant
              </button>
            )}
          </>
        )}

        {tenant.suspended_at && (
          <p className="text-[11px] text-zinc-400">
            Suspended {new Date(tenant.suspended_at).toLocaleDateString()} {tenant.suspended_reason && `— ${tenant.suspended_reason}`}
          </p>
        )}
      </div>
    </div>
  )
}

/* ─── Create Tenant Tab ─── */
const CreateTenantTab: React.FC<{
  onCreate: (params: CreateTenantParams) => Promise<void>
}> = ({ onCreate }) => {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [plan, setPlan] = useState('starter')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [features, setFeatures] = useState<PlanFeatures>(getFeaturesForPlan('starter'))
  const [resourceLimits, setResourceLimits] = useState<PlanResourceLimits>(getResourceLimitsForPlan('starter'))
  const [creating, setCreating] = useState(false)
  const [slugEdited, setSlugEdited] = useState(false)

  // Auto-generate slug from name
  useEffect(() => {
    if (!slugEdited && name) {
      setSlug(name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
    }
  }, [name, slugEdited])

  const handlePlanChange = (newPlan: string) => {
    setPlan(newPlan)
    setFeatures(getFeaturesForPlan(newPlan))
    setResourceLimits(getResourceLimitsForPlan(newPlan))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !slug.trim() || !ownerEmail.trim()) return
    setCreating(true)
    try {
      await onCreate({ name: name.trim(), slug: slug.trim(), ownerEmail: ownerEmail.trim(), plan, contactName: contactName.trim(), contactEmail: contactEmail.trim(), features, resourceLimits })
      setName(''); setSlug(''); setOwnerEmail(''); setPlan('starter'); setContactName(''); setContactEmail(''); setSlugEdited(false)
      setFeatures(getFeaturesForPlan('starter')); setResourceLimits(getResourceLimitsForPlan('starter'))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="max-w-xl">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Create New Tenant</h3>
        <p className="text-sm text-zinc-500 mb-6">A new tenant will be created and an invitation will be sent to the owner.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-medium text-zinc-500 uppercase">Tenant Name *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                placeholder="My Agency"
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-zinc-500 uppercase">Slug *</label>
              <input
                type="text"
                value={slug}
                onChange={e => { setSlug(e.target.value); setSlugEdited(true) }}
                required
                placeholder="my-agency"
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium text-zinc-500 uppercase">Owner Email *</label>
            <input
              type="email"
              value={ownerEmail}
              onChange={e => setOwnerEmail(e.target.value)}
              required
              placeholder="owner@agency.com"
              className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            />
          </div>

          <div>
            <label className="text-[11px] font-medium text-zinc-500 uppercase">Plan</label>
            <select
              value={plan}
              onChange={e => handlePlanChange(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            >
              <option value="starter">Starter</option>
              <option value="professional">Professional</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>

          {/* Feature Toggles */}
          <div>
            <label className="text-[11px] font-medium text-zinc-500 uppercase mb-2 block">Features</label>
            <div className="grid grid-cols-2 gap-1.5 bg-zinc-50 dark:bg-zinc-800/30 rounded-lg p-3">
              {ALL_FEATURES.map(key => (
                <label key={key} className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 py-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={features[key] ?? false}
                    onChange={e => setFeatures(prev => ({ ...prev, [key]: e.target.checked }))}
                    className="rounded border-zinc-300 dark:border-zinc-600 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                  />
                  {FEATURE_LABELS[key]}
                </label>
              ))}
            </div>
          </div>

          {/* Resource Limits */}
          <div>
            <label className="text-[11px] font-medium text-zinc-500 uppercase mb-2 block">Resource Limits</label>
            <div className="grid grid-cols-2 gap-3">
              {([
                ['max_users', 'Max Users'],
                ['max_projects', 'Max Projects'],
                ['max_storage_mb', 'Storage (MB)'],
                ['max_api_calls_per_month', 'API Calls/mo'],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <label className="text-[10px] text-zinc-400">{label}</label>
                  <input
                    type="number"
                    value={resourceLimits[key]}
                    onChange={e => setResourceLimits(prev => ({ ...prev, [key]: parseInt(e.target.value) || 0 }))}
                    className="w-full mt-0.5 px-2 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-medium text-zinc-500 uppercase">Contact Name</label>
              <input
                type="text"
                value={contactName}
                onChange={e => setContactName(e.target.value)}
                placeholder="John Doe"
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-zinc-500 uppercase">Contact Email</label>
              <input
                type="email"
                value={contactEmail}
                onChange={e => setContactEmail(e.target.value)}
                placeholder="contact@agency.com"
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={creating || !name.trim() || !slug.trim() || !ownerEmail.trim()}
            className="w-full py-2.5 text-sm font-medium text-white bg-zinc-800 dark:bg-zinc-200 dark:text-zinc-900 rounded-lg hover:bg-zinc-700 dark:hover:bg-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {creating ? 'Creating...' : 'Create Tenant & Send Invitation'}
          </button>
        </form>
      </div>
    </div>
  )
}
