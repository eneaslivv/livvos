/**
 * TenantsTab — table of every tenant in the platform with a side panel for
 * managing plan / features / resource limits / suspend-reactivate.
 *
 * Extracted from pages/PlatformAdmin.tsx so PlatformCustomers can also
 * render it on its "SaaS customers" tab. The behavior is identical to
 * the original; only the location changed.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { Icons } from '../ui/Icons'
import { type PlatformTenant } from '../../hooks/usePlatformAdmin'
import {
  ALL_FEATURES, FEATURE_LABELS, getFeaturesForPlan, getResourceLimitsForPlan,
  type PlanFeatures, type PlanResourceLimits,
} from '../../config/planDefaults'
import { STATUS_COLORS, PLAN_COLORS, formatLastActivity } from './_shared'

interface TenantsTabProps {
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
}

export const TenantsTab: React.FC<TenantsTabProps> = ({
  tenants, search, setSearch, statusFilter, setStatusFilter,
  selectedTenant, setSelectedTenant,
  onSuspend, onReactivate, onUpdate, onSwitchToTenant, onSeedDemoData,
}) => {
  const filtered = useMemo(() => {
    return tenants.filter(t => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return t.name.toLowerCase().includes(q)
            || t.slug.toLowerCase().includes(q)
            || (t.owner_email || '').toLowerCase().includes(q)
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
                const lastAct = formatLastActivity(t.last_activity)
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
                              {t.notes.length > 40 ? t.notes.slice(0, 40) + '…' : t.notes}
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
                            {t.contact_name}
                            {t.contact_name && t.contact_email ? ' · ' : ''}
                            {t.contact_email && t.contact_email !== t.owner_email ? t.contact_email : ''}
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

// ─── Tenant Detail Panel ──────────────────────────────────────────────────

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
  // Save feedback: shows a green checkmark + "Saved" toast for a few
  // seconds after a successful update so the user gets explicit
  // acknowledgement that their changes hit the DB.
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Snapshot of the values as last seen on the server. Used to compute
  // the dirty state — every input compares against this snapshot so the
  // "Unsaved changes" indicator + Save button can react in real time
  // and even highlight individual fields that changed. Refreshed on
  // tenant switch and after a successful save.
  const [serverSnapshot, setServerSnapshot] = useState({
    plan: tenant.plan,
    notes: tenant.notes || '',
    contact_email: tenant.contact_email || '',
    contact_name: tenant.contact_name || '',
    features: { ...getFeaturesForPlan(tenant.plan), ...(tenant.features || {}) } as PlanFeatures,
    resource_limits: { ...getResourceLimitsForPlan(tenant.plan), ...(tenant.resource_limits || {}) } as PlanResourceLimits,
  })

  // Members of this tenant — small live-loaded list rendered above the
  // feature toggles. Lets the platform admin see who's inside without
  // having to switch-into the tenant first. Refetched whenever the
  // selected tenant changes.
  const [members, setMembers] = useState<Array<{ user_id: string; email: string; full_name: string; role: string; source: string; joined_at: string; last_seen_at: string | null }>>([])
  const [membersLoading, setMembersLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const loadMembers = async () => {
      setMembersLoading(true)
      try {
        const { data, error } = await (await import('../../lib/supabase')).supabase
          .rpc('platform_tenant_members', { p_tenant_id: tenant.id })
        if (cancelled) return
        if (!error && data) setMembers(data as any)
      } finally {
        if (!cancelled) setMembersLoading(false)
      }
    }
    loadMembers()
    return () => { cancelled = true }
  }, [tenant.id])

  useEffect(() => {
    setPlan(tenant.plan)
    setNotes(tenant.notes || '')
    setContactEmail(tenant.contact_email || '')
    setContactName(tenant.contact_name || '')
    const fDefaults = getFeaturesForPlan(tenant.plan)
    const mergedFeatures = tenant.features ? { ...fDefaults, ...tenant.features } as PlanFeatures : fDefaults
    setFeatures(mergedFeatures)
    const rDefaults = getResourceLimitsForPlan(tenant.plan)
    const mergedLimits = tenant.resource_limits ? { ...rDefaults, ...tenant.resource_limits } as PlanResourceLimits : rDefaults
    setResourceLimits(mergedLimits)
    setSuspendReason('')
    setShowSuspendConfirm(false)
    // Reset the server snapshot so dirty checks work for the new tenant.
    setServerSnapshot({
      plan: tenant.plan,
      notes: tenant.notes || '',
      contact_email: tenant.contact_email || '',
      contact_name: tenant.contact_name || '',
      features: mergedFeatures,
      resource_limits: mergedLimits,
    })
    setSavedAt(null)
    setSaveError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant.id])

  // Auto-clear the "Saved" pulse after 4s so the panel returns to a
  // calm state instead of holding the green badge forever.
  useEffect(() => {
    if (!savedAt) return
    const t = setTimeout(() => setSavedAt(null), 4000)
    return () => clearTimeout(t)
  }, [savedAt])

  // Dirty state computed from the live form values vs. the snapshot
  // we last loaded from / saved to the server. Per-field flags drive
  // the highlight ring, the aggregate flag drives the toolbar.
  const dirty = useMemo(() => {
    const f: Record<string, boolean> = {
      plan:           plan !== serverSnapshot.plan,
      notes:          notes !== serverSnapshot.notes,
      contact_email:  contactEmail !== serverSnapshot.contact_email,
      contact_name:   contactName !== serverSnapshot.contact_name,
      features:       JSON.stringify(features) !== JSON.stringify(serverSnapshot.features),
      resource_limits: JSON.stringify(resourceLimits) !== JSON.stringify(serverSnapshot.resource_limits),
    }
    f.any = Object.values(f).some(Boolean)
    return f
  }, [plan, notes, contactEmail, contactName, features, resourceLimits, serverSnapshot])

  // Helper: merge a Tailwind class string with a "changed" ring when
  // the given field is dirty. Keeps the change visible on the input
  // itself, not just on the toolbar.
  const dirtyRing = (isDirty: boolean) =>
    isDirty
      ? 'ring-2 ring-amber-300/70 dark:ring-amber-500/40 border-amber-300 dark:border-amber-500/40'
      : ''

  const handlePlanChange = (newPlan: string) => {
    setPlan(newPlan)
    setFeatures(getFeaturesForPlan(newPlan))
    setResourceLimits(getResourceLimitsForPlan(newPlan))
  }

  const handleSave = async () => {
    if (!dirty.any) return
    setSaving(true)
    setSaveError(null)
    try {
      await onUpdate(tenant.id, { plan, notes, contact_email: contactEmail, contact_name: contactName, features, resource_limits: resourceLimits })
      // Sync the snapshot to the just-saved values so the dirty
      // checks immediately go back to "clean" without waiting for
      // the parent to re-fetch and pass a new tenant prop.
      setServerSnapshot({
        plan, notes,
        contact_email: contactEmail,
        contact_name: contactName,
        features,
        resource_limits: resourceLimits,
      })
      setSavedAt(Date.now())
    } catch (err: any) {
      setSaveError(err?.message || 'Could not save changes')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-[360px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 space-y-4 sticky top-4 max-h-[calc(100vh-120px)] overflow-y-auto">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{tenant.name}</h3>
          <p className="text-xs text-zinc-400 mt-0.5">{tenant.slug}</p>
        </div>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
          <Icons.X size={18} />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_COLORS[tenant.status] || STATUS_COLORS.active}`}>
          {tenant.status}
        </span>
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${PLAN_COLORS[tenant.plan] || PLAN_COLORS.starter}`}>
          {tenant.plan}
        </span>
      </div>

      {/* ─── Quick actions (top) ─────────────────────────────────
           "Switch to Tenant" used to live at the bottom of this panel,
           hidden under feature toggles. It's the most-used action for
           verifying access (Eneas wanted to "enter as Luis to confirm
           his views"), so it lives at the top now. */}
      <div className="space-y-2">
        <button
          onClick={async () => { setSwitching(true); try { await onSwitchToTenant(tenant.id) } finally { setSwitching(false) } }}
          disabled={switching}
          className="w-full py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 rounded-lg hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-sm"
        >
          <Icons.LogIn size={15} />
          {switching ? 'Switching…' : `View as ${tenant.name}`}
        </button>
        <p className="text-[10px] text-zinc-400 leading-snug px-1">
          Drops you into this tenant's workspace as a platform admin.
          Use the "Return to home" button in the header to come back.
        </p>
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

      {/* ─── Members preview ─────────────────────────────────────
           Live list of who's in this tenant + their role. Lets the
           platform admin verify "Luis is admin, María is viewer"
           without leaving the panel. The "Switch to Tenant" button
           above is how you actually act on this — change a role, edit
           features per user, etc. */}
      <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
            Members
            {members.length > 0 && <span className="ml-1 text-zinc-400 normal-case">· {members.length}</span>}
          </p>
        </div>
        {membersLoading ? (
          <div className="flex items-center justify-center py-6">
            <div className="w-4 h-4 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
          </div>
        ) : members.length === 0 ? (
          <p className="text-xs text-zinc-400 text-center py-4">
            No members in this tenant yet.
          </p>
        ) : (
          <ul className="space-y-1">
            {members.slice(0, 6).map(m => {
              const initial = (m.full_name || m.email)[0]?.toUpperCase() || '?';
              const isOwner = m.role === 'owner';
              return (
                <li key={m.user_id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                    isOwner
                      ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white'
                      : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'
                  }`}>
                    {initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">
                      {m.full_name || m.email.split('@')[0]}
                    </div>
                    <div className="text-[10px] text-zinc-400 truncate">{m.email}</div>
                  </div>
                  <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${
                    isOwner
                      ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                  }`}>
                    {m.role}
                  </span>
                </li>
              );
            })}
            {members.length > 6 && (
              <li className="text-[10px] text-zinc-400 text-center pt-1">
                +{members.length - 6} more · use "View as" above to manage
              </li>
            )}
          </ul>
        )}
      </div>

      <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4 space-y-3">
        <div>
          <label className="text-[11px] font-medium text-zinc-500 uppercase flex items-center gap-2">
            Plan
            {dirty.plan && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Unsaved" />}
          </label>
          <select
            value={plan}
            onChange={e => handlePlanChange(e.target.value)}
            className={`w-full mt-1 px-3 py-2 text-sm rounded-lg border bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-400 transition-all border-zinc-200 dark:border-zinc-700 ${dirtyRing(dirty.plan)}`}
          >
            <option value="starter">Starter</option>
            <option value="professional">Professional</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>

        <div>
          <label className="text-[11px] font-medium text-zinc-500 uppercase mb-2 flex items-center gap-2">
            Features
            {dirty.features && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Unsaved" />}
          </label>
          <div className={`grid grid-cols-2 gap-1.5 rounded-lg p-1 transition-all ${dirty.features ? 'ring-2 ring-amber-300/60 dark:ring-amber-500/30' : ''}`}>
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

        <div>
          <label className="text-[11px] font-medium text-zinc-500 uppercase mb-2 flex items-center gap-2">
            Resource Limits
            {dirty.resource_limits && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Unsaved" />}
          </label>
          <div className={`grid grid-cols-2 gap-2 rounded-lg p-1 transition-all ${dirty.resource_limits ? 'ring-2 ring-amber-300/60 dark:ring-amber-500/30' : ''}`}>
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
          <label className="text-[11px] font-medium text-zinc-500 uppercase flex items-center gap-2">
            Contact Name
            {dirty.contact_name && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Unsaved" />}
          </label>
          <input
            type="text"
            value={contactName}
            onChange={e => setContactName(e.target.value)}
            className={`w-full mt-1 px-3 py-2 text-sm rounded-lg border bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-400 transition-all border-zinc-200 dark:border-zinc-700 ${dirtyRing(dirty.contact_name)}`}
          />
        </div>

        <div>
          <label className="text-[11px] font-medium text-zinc-500 uppercase flex items-center gap-2">
            Contact Email
            {dirty.contact_email && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Unsaved" />}
          </label>
          <input
            type="email"
            value={contactEmail}
            onChange={e => setContactEmail(e.target.value)}
            className={`w-full mt-1 px-3 py-2 text-sm rounded-lg border bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-400 transition-all border-zinc-200 dark:border-zinc-700 ${dirtyRing(dirty.contact_email)}`}
          />
        </div>

        <div>
          <label className="text-[11px] font-medium text-zinc-500 uppercase flex items-center gap-2">
            Notes
            {dirty.notes && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Unsaved" />}
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            className={`w-full mt-1 px-3 py-2 text-sm rounded-lg border bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-400 resize-none transition-all border-zinc-200 dark:border-zinc-700 ${dirtyRing(dirty.notes)}`}
          />
        </div>

        {/* Save bar — combines disabled-when-clean + saving spinner +
            green confirmation pulse + error surface. The user wanted
            unmistakable feedback that something hit the DB; this gives
            them a 4-state UI: idle (clean) / dirty / saving / saved. */}
        <div className="space-y-2">
          {dirty.any && !savedAt && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                Unsaved changes
              </span>
              <span className="ml-auto text-[10px] text-amber-600/70 dark:text-amber-400/70">
                {Object.entries(dirty).filter(([k, v]) => k !== 'any' && v).length} field(s)
              </span>
            </div>
          )}
          {savedAt && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 animate-in fade-in slide-in-from-top-1">
              <Icons.Check size={13} className="text-emerald-600 dark:text-emerald-400" />
              <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                Saved · changes applied
              </span>
            </div>
          )}
          {saveError && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30">
              <Icons.AlertCircle size={13} className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <span className="text-[11px] font-medium text-rose-700 dark:text-rose-300">{saveError}</span>
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !dirty.any}
            className={`w-full py-2.5 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
              saving
                ? 'bg-zinc-700 dark:bg-zinc-300 text-white dark:text-zinc-900 cursor-wait'
                : !dirty.any && !savedAt
                  ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed'
                  : !dirty.any && savedAt
                    ? 'bg-emerald-600 text-white'
                    : 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 shadow-sm'
            }`}
          >
            {saving ? (
              <>
                <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Saving…
              </>
            ) : !dirty.any && savedAt ? (
              <>
                <Icons.Check size={14} strokeWidth={3} />
                Saved
              </>
            ) : !dirty.any ? (
              'No changes to save'
            ) : (
              <>
                <Icons.Save size={14} />
                Save changes
              </>
            )}
          </button>
        </div>
      </div>

      {tenant.user_count === 0 && tenant.project_count === 0 && (
        <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4">
          <button
            onClick={async () => { setSeeding(true); try { await onSeedDemoData(tenant.slug) } finally { setSeeding(false) } }}
            disabled={seeding}
            className="w-full py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-500/20 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            <Icons.Sparkles size={14} />
            {seeding ? 'Seeding…' : 'Seed Demo Data'}
          </button>
        </div>
      )}

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
