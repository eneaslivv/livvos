// Shared visual helpers for the platform admin views (TenantsTab,
// CreateTenantModal, PlatformCustomers, PlatformAdmin dashboard).
// Kept separate so the page files don't redeclare these constants.

export const STATUS_COLORS: Record<string, string> = {
  active:    'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
  suspended: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300',
  trial:     'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  setup:     'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300',
}

export const PLAN_COLORS: Record<string, string> = {
  starter:      'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  professional: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300',
  enterprise:   'bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-300',
}

/** Friendly relative time for "last_activity" cells. Returns null when input is null. */
export function formatLastActivity(iso: string | null | undefined): string | null {
  if (!iso) return null
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
