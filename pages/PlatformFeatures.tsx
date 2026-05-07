/**
 * PlatformFeatures — read-only catalog of feature flags + which plans
 * include them. Phase 1 view: pure reference. Phase 2 (per the LivvOS
 * spec) will move this into a relational `features` + `tenant_features`
 * model with per-tenant overrides — for now the matrix is rendered from
 * the static `config/planDefaults.ts` constants the rest of the app
 * already uses.
 */
import React from 'react'
import { Icons } from '../components/ui/Icons'
import {
  ALL_FEATURES, FEATURE_LABELS, PLAN_FEATURE_DEFAULTS,
  type FeatureKey, type PlanName,
} from '../config/planDefaults'
import { usePlatformAdmin } from '../hooks/usePlatformAdmin'

const PLANS: PlanName[] = ['starter', 'professional', 'enterprise']

const PLAN_HEADER_TONE: Record<PlanName, string> = {
  starter:      'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  professional: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300',
  enterprise:   'bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-300',
}

// Lightweight blurb so the grid feels less abstract. Not auth-sensitive.
const FEATURE_DESCRIPTIONS: Record<FeatureKey, string> = {
  projects_module:       'Project boards, milestones and team assignment.',
  team_management:       'Invite teammates, manage roles and shared clients.',
  sales_module:          'CRM-style sales dashboard, leads pipeline and analytics.',
  finance_module:        'Income, expenses, budgets and finance assistant.',
  documents_module:      'Document storage with linkable previews.',
  notifications:         'Multi-channel notification system.',
  ai_assistant:          'Gemini/OpenAI-backed assistant across the workspace.',
  analytics:             'Web traffic + product analytics integrations.',
  calendar_integration:  'Google Calendar two-way sync.',
  client_portal:         'Public portal where clients view shared projects.',
  document_versioning:   'Versioned document history.',
  advanced_permissions:  'Granular role-based permissions and audit trails.',
}

export const PlatformFeatures: React.FC = () => {
  const { isPlatformAdmin, isLoading } = usePlatformAdmin()

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
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400">Master · Features</div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">Feature catalog</h1>
        <p className="text-sm text-zinc-500 mt-1 max-w-2xl">
          Read-only view of every feature flag in LivvOS and which plans include it by default.
          Per-tenant overrides happen on the Customers page → Tenant detail panel → Features.
        </p>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/40">
              <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Feature</th>
              {PLANS.map(p => (
                <th key={p} className="text-center px-4 py-3 text-xs font-medium uppercase tracking-wider">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${PLAN_HEADER_TONE[p]}`}>
                    {p}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALL_FEATURES.map(key => (
              <tr key={key} className="border-b border-zinc-50 dark:border-zinc-800/50">
                <td className="px-5 py-3">
                  <div className="font-medium text-zinc-900 dark:text-zinc-100">{FEATURE_LABELS[key]}</div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">{FEATURE_DESCRIPTIONS[key]}</div>
                </td>
                {PLANS.map(plan => {
                  const enabled = PLAN_FEATURE_DEFAULTS[plan][key]
                  return (
                    <td key={`${key}-${plan}`} className="px-4 py-3 text-center">
                      {enabled ? (
                        <Icons.Check size={16} className="inline-block text-emerald-500" />
                      ) : (
                        <span className="text-zinc-300 dark:text-zinc-600">—</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-zinc-400">
        Source: <code className="font-mono">config/planDefaults.ts</code>. Editing here is a Phase 2
        item — for now, change a tenant's plan to swap the whole feature set, or hand-pick features
        on the tenant detail panel.
      </p>
    </div>
  )
}
