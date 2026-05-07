/**
 * CreateTenantModal — modal version of the original CreateTenantTab from
 * pages/PlatformAdmin.tsx. Surfaced from a "+ New customer" button in
 * pages/PlatformCustomers.tsx so creating a tenant doesn't take up a
 * whole tab anymore.
 */
import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icons } from '../ui/Icons'
import { type CreateTenantParams } from '../../hooks/usePlatformAdmin'
import {
  ALL_FEATURES, FEATURE_LABELS, getFeaturesForPlan, getResourceLimitsForPlan,
  type PlanFeatures, type PlanResourceLimits,
} from '../../config/planDefaults'

interface CreateTenantModalProps {
  open: boolean
  onClose: () => void
  onCreate: (params: CreateTenantParams) => Promise<void>
}

export const CreateTenantModal: React.FC<CreateTenantModalProps> = ({ open, onClose, onCreate }) => {
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

  // Auto-generate slug from name unless the user typed the slug field manually.
  useEffect(() => {
    if (!slugEdited && name) {
      setSlug(name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
    }
  }, [name, slugEdited])

  // Esc closes modal.
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const handlePlanChange = (newPlan: string) => {
    setPlan(newPlan)
    setFeatures(getFeaturesForPlan(newPlan))
    setResourceLimits(getResourceLimitsForPlan(newPlan))
  }

  const reset = () => {
    setName(''); setSlug(''); setOwnerEmail(''); setPlan('starter')
    setContactName(''); setContactEmail(''); setSlugEdited(false)
    setFeatures(getFeaturesForPlan('starter'))
    setResourceLimits(getResourceLimitsForPlan('starter'))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !slug.trim() || !ownerEmail.trim()) return
    setCreating(true)
    try {
      await onCreate({
        name: name.trim(),
        slug: slug.trim(),
        ownerEmail: ownerEmail.trim(),
        plan,
        contactName: contactName.trim(),
        contactEmail: contactEmail.trim(),
        features,
        resourceLimits,
      })
      reset()
      onClose()
    } finally {
      setCreating(false)
    }
  }

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-150"
        onClick={onClose}
      />
      <div className="absolute inset-0 flex items-start justify-center p-4 md:p-8 overflow-y-auto">
        <div className="relative w-full max-w-xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden animate-in zoom-in-95 fade-in duration-150">
          <header className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-start justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400">Customer</div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">Create new tenant</h3>
              <p className="text-[12px] text-zinc-500 mt-0.5">An invitation will be sent to the owner email.</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Close">
              <Icons.X size={16} />
            </button>
          </header>

          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
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

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating || !name.trim() || !slug.trim() || !ownerEmail.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-zinc-800 dark:bg-zinc-200 dark:text-zinc-900 rounded-lg hover:bg-zinc-700 dark:hover:bg-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {creating ? 'Creating…' : 'Create & invite owner'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body,
  )
}
