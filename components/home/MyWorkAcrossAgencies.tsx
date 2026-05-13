/**
 * MyWorkAcrossAgencies — home-page widget that lists open tasks assigned
 * to the current user across every workspace they belong to. Tasks are
 * grouped by tenant and badged with the workspace logo so the user knows
 * where each item lives.
 *
 * Click a task → if it's in the active tenant we just open the task
 * detail panel inline; if it's in a different tenant we call
 * `switchTenant` first, then deep-link via the URL (`?task=<id>`) so
 * Calendar's existing query-param reader auto-opens the panel after the
 * tenant context finishes hydrating.
 *
 * The widget is self-hiding when:
 *  - The user has no cross-tenant tasks AND no other workspaces.
 *  - The user belongs to a single tenant (in which case the regular
 *    today/upcoming list on Home already covers everything).
 */
import React, { useMemo, useState } from 'react';
import { Icons } from '../ui/Icons';
import { useCrossTenantTasks, type CrossTenantTask } from '../../hooks/useCrossTenantTasks';
import { useTenant } from '../../context/TenantContext';
import type { PageView } from '../../types';
import { CrossTenantTaskQuickEdit } from './CrossTenantTaskQuickEdit';

interface MyWorkAcrossAgenciesProps {
  /** App-level navigate. Calendar opens the task drawer when given taskId. */
  onNavigate: (page: PageView, params?: { taskId?: string }) => void;
}

const PRIORITY_STYLES: Record<string, string> = {
  urgent: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  high:   'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  medium: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  low:    'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300',
};

const formatDue = (iso: string | null): string => {
  if (!iso) return 'No due date';
  const d = new Date(iso + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  const diffDays = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays <= 7) return `In ${diffDays}d`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

interface TenantGroup {
  tenant_id: string;
  tenant_name: string;
  tenant_logo_url: string | null;
  tasks: CrossTenantTask[];
}

export const MyWorkAcrossAgencies: React.FC<MyWorkAcrossAgenciesProps> = ({ onNavigate }) => {
  const { currentTenant, memberships, switchTenant, isViewingAsTenant } = useTenant();
  const { tasks, loading, error, refresh } = useCrossTenantTasks();

  // Hide entirely when the user is sitting INSIDE a partner / child agency
  // tenant — either because they used "View as tenant" from the Master
  // surface, or because they switched into a tenant that has a parent.
  // The whole point of this widget is "your aggregate workload across
  // workspaces", which makes sense ONLY from the user's home tenant.
  // From inside a child agency, surfacing your unrelated tasks from
  // Livv/payper/etc. confuses the partner-agency owner (looks like a
  // data leak even though it's just YOUR data shown to YOU) and
  // pollutes their focused view. So we just hide.
  const isInChildOrPartnerView =
    isViewingAsTenant || (currentTenant?.parent_tenant_id != null);
  // Cross-tenant task currently being edited inline. NULL = no modal open.
  // Lets the user mark a task done / change priority / move due date
  // WITHOUT switching tenants — the slow path (switchTenant) is reserved
  // for when they explicitly click "Open in <workspace>".
  const [quickEditTask, setQuickEditTask] = useState<CrossTenantTask | null>(null);

  // Group tasks by tenant, with the active tenant always first so the
  // user sees their current context's items at the top of the widget.
  const groups = useMemo<TenantGroup[]>(() => {
    const byTenant = new Map<string, TenantGroup>();
    for (const t of tasks) {
      const g = byTenant.get(t.tenant_id) || {
        tenant_id: t.tenant_id,
        tenant_name: t.tenant_name,
        tenant_logo_url: t.tenant_logo_url,
        tasks: [],
      };
      g.tasks.push(t);
      byTenant.set(t.tenant_id, g);
    }
    const arr = Array.from(byTenant.values());
    arr.sort((a, b) => {
      if (a.tenant_id === currentTenant?.id) return -1;
      if (b.tenant_id === currentTenant?.id) return 1;
      return a.tenant_name.localeCompare(b.tenant_name);
    });
    return arr;
  }, [tasks, currentTenant?.id]);

  // Hide when the user is in a single workspace. The whole point of this
  // widget is to surface tasks from OTHER agencies — if there's only one
  // tenant in `memberships`, the regular Today's Focus / Today's Agenda
  // sections below already cover the same data, so the widget would just
  // duplicate them and add noise (the partner agencies in particular
  // were complaining about the redundancy).
  const otherWorkspaces = memberships.filter(m => m.tenant_id !== currentTenant?.id);
  if (otherWorkspaces.length === 0) {
    return null;
  }

  const handleTaskClick = (t: CrossTenantTask) => {
    if (t.tenant_id === currentTenant?.id) {
      // Same tenant — just open the full panel inline via Calendar's
      // existing taskId deep-link. No need for the slim quick-edit since
      // the user already has CalendarContext + full TaskDetailPanel.
      onNavigate('calendar', { taskId: t.task_id });
      return;
    }
    // Cross-tenant — open the slim quick-edit modal IN PLACE. The user
    // can flip status / priority / due date without leaving the LIVV
    // dashboard. If they want the full experience, they click "Open in
    // <workspace>" inside the modal which falls through to switchTenant.
    setQuickEditTask(t);
  };

  // Slow path — called from the quick-edit modal's "Open in workspace"
  // button. Switches tenants then deep-links to the task on calendar.
  const handleOpenInWorkspace = async (t: CrossTenantTask) => {
    const ok = await switchTenant(t.tenant_id);
    if (ok) {
      const url = new URL(window.location.href);
      url.pathname = '/';
      window.location.href = `${url.origin}${url.pathname}?task=${t.task_id}#calendar`;
    }
  };

  const totalCount = tasks.length;
  const overdueCount = tasks.filter(t => t.is_overdue).length;

  // Bail out before any rendering when we're in a partner-agency view —
  // see the comment on isInChildOrPartnerView above for the rationale.
  if (isInChildOrPartnerView) return null;

  return (
    <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <header className="px-5 pt-4 pb-3 flex items-center justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800/60">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400">
            Your work
          </div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5 inline-flex items-center gap-2">
            Across your workspaces
            {totalCount > 0 && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                {totalCount}
              </span>
            )}
            {overdueCount > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-700 dark:text-rose-300">
                {overdueCount} overdue
              </span>
            )}
          </h2>
        </div>
        <div className="text-[10px] text-zinc-400 hidden sm:block">
          {memberships.length} workspace{memberships.length === 1 ? '' : 's'}
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-zinc-400">
          <div className="w-5 h-5 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
        </div>
      ) : error ? (
        <p className="px-5 py-4 text-sm text-rose-600 dark:text-rose-400">{error}</p>
      ) : tasks.length === 0 ? (
        <div className="px-5 py-6 text-center">
          <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
            <Icons.Check size={18} className="text-emerald-500" />
          </div>
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">All clear across all your workspaces</p>
          <p className="text-[11px] text-zinc-400 mt-1">Nothing assigned to you in any agency.</p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
          {groups.map(g => {
            const isActive = g.tenant_id === currentTenant?.id;
            return (
              <div key={g.tenant_id}>
                <div className="px-5 pt-3 pb-1.5 flex items-center gap-2 sticky top-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur z-[1]">
                  <div className="w-5 h-5 rounded bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0">
                    {g.tenant_logo_url ? (
                      <img src={g.tenant_logo_url} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-[8px] font-bold text-zinc-500">
                        {(g.tenant_name || '?').slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 truncate">
                    {g.tenant_name}
                  </div>
                  {isActive ? (
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                      Active
                    </span>
                  ) : (
                    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                      Click to switch
                    </span>
                  )}
                  <span className="ml-auto text-[10px] text-zinc-400">
                    {g.tasks.length}
                  </span>
                </div>
                <ul>
                  {g.tasks.slice(0, 6).map(t => {
                    const priorityClass = PRIORITY_STYLES[t.priority] || PRIORITY_STYLES.medium;
                    const isCrossTenant = t.tenant_id !== currentTenant?.id;
                    return (
                      <li key={t.task_id}>
                        <button
                          onClick={() => handleTaskClick(t)}
                          className="w-full text-left px-5 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors flex items-start gap-3"
                        >
                          {/* Priority pill */}
                          <span className={`mt-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${priorityClass} shrink-0`}>
                            {t.priority}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {/* Per-task tenant logo — small but unmissable.
                                  Only renders for cross-tenant tasks so the
                                  active tenant's tasks stay visually clean.
                                  Tooltip carries the agency name for clarity. */}
                              {isCrossTenant && (
                                <span
                                  className="w-3.5 h-3.5 rounded bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0 ring-1 ring-zinc-200 dark:ring-zinc-700"
                                  title={t.tenant_name}
                                >
                                  {t.tenant_logo_url ? (
                                    <img src={t.tenant_logo_url} alt={t.tenant_name} className="w-full h-full object-contain" />
                                  ) : (
                                    <span className="text-[7px] font-bold text-zinc-500">
                                      {(t.tenant_name || '?').slice(0, 1).toUpperCase()}
                                    </span>
                                  )}
                                </span>
                              )}
                              <div className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                                {t.title}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-zinc-500">
                              {t.project_title && (
                                <span className="inline-flex items-center gap-1 truncate max-w-[160px]">
                                  <Icons.Briefcase size={10} className="shrink-0" />
                                  {t.project_title}
                                </span>
                              )}
                              <span className={`inline-flex items-center gap-1 ${t.is_overdue ? 'text-rose-600 dark:text-rose-400 font-semibold' : ''}`}>
                                <Icons.Clock size={10} className="shrink-0" />
                                {formatDue(t.due_date)}
                              </span>
                            </div>
                          </div>
                          <Icons.ChevronRight size={14} className="text-zinc-300 dark:text-zinc-600 shrink-0 mt-1" />
                        </button>
                      </li>
                    );
                  })}
                  {g.tasks.length > 6 && (
                    <li className="px-5 py-1.5 text-[11px] text-zinc-400 text-center">
                      +{g.tasks.length - 6} more in this workspace
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {/* Cross-tenant quick-edit modal — opens in place when the user
          clicks a task from another workspace. Lets them flip status /
          priority / due date without losing the LIVV dashboard context. */}
      {quickEditTask && (
        <CrossTenantTaskQuickEdit
          task={quickEditTask}
          onClose={() => setQuickEditTask(null)}
          onSaved={() => {
            // Refresh the list so the new status/priority is reflected
            // immediately. Closing happens manually so the user sees the
            // "Saved" confirmation before dismissing.
            void refresh();
          }}
          onOpenInWorkspace={(t) => {
            setQuickEditTask(null);
            void handleOpenInWorkspace(t);
          }}
        />
      )}
    </section>
  );
};
