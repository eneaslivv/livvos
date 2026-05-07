/**
 * PlatformAdmin — master mode home/dashboard.
 *
 * Was a 3-tab page (Dashboard / Tenants / Create) but the Tenants and
 * Create surfaces moved into pages/PlatformCustomers.tsx (with tabs for
 * SaaS customers and external CRM clients) so this page is now a clean
 * KPI overview only. Sidebar nav links to the other master pages.
 */
import React, { useEffect } from 'react'
import { Icons } from '../components/ui/Icons'
import { usePlatformAdmin } from '../hooks/usePlatformAdmin'

export const PlatformAdmin: React.FC = () => {
  const { isPlatformAdmin, isLoading, dashboard, dashboardLoading, fetchDashboard } = usePlatformAdmin()

  useEffect(() => {
    if (isPlatformAdmin) fetchDashboard()
  }, [isPlatformAdmin, fetchDashboard])

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
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400">Master · Dashboard</div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">Platform overview</h1>
          <p className="text-sm text-zinc-500 mt-1">All tenants and platform-wide metrics at a glance.</p>
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

      {dashboardLoading && !dashboard ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
        </div>
      ) : dashboard ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Tenants',    value: dashboard.total_tenants,             color: 'text-zinc-900 dark:text-zinc-100' },
            { label: 'Active',           value: dashboard.active_tenants,            color: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Suspended',        value: dashboard.suspended_tenants,         color: 'text-red-600 dark:text-red-400' },
            { label: 'Trial',            value: dashboard.trial_tenants,             color: 'text-amber-600 dark:text-amber-400' },
            { label: 'Total Users',      value: dashboard.total_users,               color: 'text-blue-600 dark:text-blue-400' },
            { label: 'Total Projects',   value: dashboard.total_projects,            color: 'text-indigo-600 dark:text-indigo-400' },
            { label: 'New (30d)',        value: dashboard.tenants_created_last_30d,  color: 'text-purple-600 dark:text-purple-400' },
          ].map(s => (
            <div key={s.label} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
