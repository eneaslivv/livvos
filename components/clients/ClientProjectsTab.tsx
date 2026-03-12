import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../ui/Icons';
import { ProjectTask } from './ClientTasksTab';

interface AssignedProject {
  id: string;
  title: string;
  status?: string;
  progress?: number;
  deadline?: string;
  description?: string;
  created_at?: string;
}

interface AvailableProject {
  id: string;
  title: string;
  client_id?: string | null;
  status?: string;
  progress?: number;
}

interface ClientProjectsTabProps {
  clientId: string;
  assignedProjects: AssignedProject[];
  projectTasks: ProjectTask[];
  availableProjects: AvailableProject[];
  assigningProject: boolean;
  showProjectDropdown: boolean;
  projectDropdownRef: React.RefObject<HTMLDivElement | null>;
  onAssignProject: (projectId: string) => void;
  onUnassignProject: (projectId: string) => void;
  onToggleProjectDropdown: () => void;
  onNavigateToProject?: (projectId: string) => void;
}

type StatusFilter = 'all' | 'Active' | 'Pending' | 'Completed';
type SortBy = 'name' | 'progress' | 'deadline' | 'tasks';

const fmtShortDate = (d: string | null | undefined) => {
  if (!d) return null;
  const date = new Date(d + (d.includes('T') ? '' : 'T00:00:00'));
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
};

const isOverdue = (d: string | null | undefined) => {
  if (!d) return false;
  const date = new Date(d + (d.includes('T') ? '' : 'T00:00:00'));
  return date < new Date(new Date().toDateString());
};

const statusFilters: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'Active', label: 'Active' },
  { id: 'Pending', label: 'Pending' },
  { id: 'Completed', label: 'Completed' },
];

const sortOptions: { id: SortBy; label: string }[] = [
  { id: 'name', label: 'Name' },
  { id: 'progress', label: 'Progress' },
  { id: 'deadline', label: 'Deadline' },
  { id: 'tasks', label: 'Tasks' },
];

export const ClientProjectsTab: React.FC<ClientProjectsTabProps> = ({
  clientId,
  assignedProjects,
  projectTasks,
  availableProjects,
  assigningProject,
  showProjectDropdown,
  projectDropdownRef,
  onAssignProject,
  onUnassignProject,
  onToggleProjectDropdown,
  onNavigateToProject,
}) => {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  // Compute task counts per project
  const taskCountsByProject = useMemo(() => {
    const counts: Record<string, { total: number; completed: number }> = {};
    for (const t of projectTasks) {
      if (!t.project_id || t.parent_task_id) continue;
      if (!counts[t.project_id]) counts[t.project_id] = { total: 0, completed: 0 };
      counts[t.project_id].total++;
      if (t.completed || t.status === 'done') counts[t.project_id].completed++;
    }
    return counts;
  }, [projectTasks]);

  // Summary stats
  const stats = useMemo(() => {
    const total = assignedProjects.length;
    const active = assignedProjects.filter(p => p.status === 'Active').length;
    const avgProgress = total > 0
      ? Math.round(assignedProjects.reduce((s, p) => s + (p.progress || 0), 0) / total)
      : 0;
    return { total, active, avgProgress };
  }, [assignedProjects]);

  // Filter & sort
  const filteredProjects = useMemo(() => {
    let list = [...assignedProjects];

    if (statusFilter !== 'all') {
      list = list.filter(p => (p.status || 'Active') === statusFilter);
    }

    list.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.title.localeCompare(b.title);
        case 'progress':
          return (b.progress || 0) - (a.progress || 0);
        case 'deadline': {
          if (!a.deadline && !b.deadline) return 0;
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        }
        case 'tasks': {
          const aCount = taskCountsByProject[a.id]?.total || 0;
          const bCount = taskCountsByProject[b.id]?.total || 0;
          return bCount - aCount;
        }
        default:
          return 0;
      }
    });

    return list;
  }, [assignedProjects, statusFilter, sortBy, taskCountsByProject]);

  const unlinked = availableProjects.filter(p => !p.client_id || p.client_id !== clientId)
    .filter(p => !assignedProjects.some(ap => ap.id === p.id));

  return (
    <motion.div key="projects" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl text-center">
          <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{stats.total}</p>
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Projects</p>
        </div>
        <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl text-center">
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{stats.active}</p>
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Active</p>
        </div>
        <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-xl text-center">
          <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{stats.avgProgress}%</p>
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Avg Progress</p>
        </div>
      </div>

      {/* Filter & sort bar */}
      {assignedProjects.length > 0 && (
        <div className="flex items-center justify-between mb-4 gap-3">
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800/60 rounded-lg p-0.5">
            {statusFilters.map(f => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                  statusFilter === f.id
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <button
              onClick={() => setShowSortDropdown(!showSortDropdown)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 bg-zinc-100 dark:bg-zinc-800/60 rounded-lg transition-colors"
            >
              <Icons.Filter size={12} />
              {sortOptions.find(s => s.id === sortBy)?.label}
            </button>
            {showSortDropdown && (
              <div className="absolute right-0 z-20 mt-1 w-32 bg-white dark:bg-zinc-800 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-700 py-1">
                {sortOptions.map(s => (
                  <button
                    key={s.id}
                    onClick={() => { setSortBy(s.id); setShowSortDropdown(false); }}
                    className={`w-full text-left px-3 py-1.5 text-[11px] font-medium transition-colors ${
                      sortBy === s.id
                        ? 'text-zinc-900 dark:text-zinc-100 bg-zinc-50 dark:bg-zinc-700/50'
                        : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700/30'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Project cards */}
      {filteredProjects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <AnimatePresence>
            {filteredProjects.map((proj, idx) => {
              const tc = taskCountsByProject[proj.id] || { total: 0, completed: 0 };
              const deadlineOverdue = isOverdue(proj.deadline);
              const statusStyle = proj.status === 'Active'
                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                : proj.status === 'Pending'
                ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400'
                : proj.status === 'Completed'
                ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400'
                : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400';

              return (
                <motion.div
                  key={proj.id}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2, delay: idx * 0.03 }}
                  className="group relative p-4 bg-white dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/40 rounded-xl shadow-sm hover:shadow-md transition-all"
                >
                  {/* Header: title + status */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div
                      className="flex items-center gap-2.5 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => onNavigateToProject?.(proj.id)}
                    >
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center shrink-0">
                        <Icons.Briefcase size={14} className="text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">{proj.title}</p>
                    </div>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${statusStyle}`}>
                      {proj.status || 'Active'}
                    </span>
                  </div>

                  {/* Description */}
                  {proj.description && (
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 mb-3">{proj.description}</p>
                  )}

                  {/* Progress bar */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex-1 h-1.5 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          (proj.progress || 0) === 100 ? 'bg-emerald-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${proj.progress || 0}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-semibold text-zinc-400 tabular-nums w-8 text-right">{proj.progress || 0}%</span>
                  </div>

                  {/* Meta row: deadline + tasks */}
                  <div className="flex items-center gap-3 text-[10px]">
                    {proj.deadline && (
                      <div className={`flex items-center gap-1 ${deadlineOverdue ? 'text-rose-500' : 'text-zinc-400'}`}>
                        <Icons.Calendar size={11} />
                        <span className="font-medium">{fmtShortDate(proj.deadline)}</span>
                        {deadlineOverdue && <span className="font-semibold">(overdue)</span>}
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-zinc-400">
                      <Icons.CheckCircle size={11} />
                      <span className="font-medium">{tc.completed}/{tc.total} tasks</span>
                    </div>
                  </div>

                  {/* Unlink button */}
                  <button
                    onClick={() => onUnassignProject(proj.id)}
                    className="absolute top-3 right-3 p-1.5 text-zinc-300 dark:text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-rose-500 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all"
                    title="Unlink project"
                  >
                    <Icons.X size={13} />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      ) : assignedProjects.length > 0 ? (
        /* Filter produced no results */
        <div className="text-center py-8 mb-4">
          <Icons.Search size={24} className="mx-auto text-zinc-300 dark:text-zinc-600 mb-2" />
          <p className="text-sm text-zinc-400">No projects match this filter</p>
        </div>
      ) : (
        /* No projects at all */
        <div className="text-center py-10 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-3">
            <Icons.Briefcase size={20} className="text-zinc-400" />
          </div>
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">No projects linked</p>
          <p className="text-[11px] text-zinc-400">Link a project to get started</p>
        </div>
      )}

      {/* Assign project dropdown */}
      {availableProjects.length === 0 ? (
        <p className="text-[11px] text-zinc-400 italic">No projects found. Create a project first.</p>
      ) : unlinked.length === 0 && assignedProjects.length > 0 ? (
        <p className="text-[11px] text-zinc-400 italic">All projects are linked.</p>
      ) : (
        <div className="relative" ref={projectDropdownRef}>
          <button
            onClick={onToggleProjectDropdown}
            disabled={assigningProject}
            className="w-full flex items-center gap-2 p-2.5 border border-dashed border-zinc-300 dark:border-zinc-600 rounded-xl text-zinc-400 dark:text-zinc-500 hover:border-emerald-400 hover:text-emerald-500 dark:hover:border-emerald-500 dark:hover:text-emerald-400 transition-all text-[12px] font-medium disabled:opacity-40"
          >
            {assigningProject ? (
              <span className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0" />
            ) : (
              <Icons.Plus size={14} className="shrink-0" />
            )}
            <span>Link a project...</span>
          </button>

          {showProjectDropdown && (
            <div className="absolute z-20 mt-1.5 w-full bg-white dark:bg-zinc-800 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-700 max-h-52 overflow-y-auto py-1">
              {unlinked.filter(p => !p.client_id).length > 0 && (
                <>
                  <p className="px-3 pt-1.5 pb-1 text-[9px] font-semibold text-zinc-400 uppercase tracking-wider">Available</p>
                  {unlinked.filter(p => !p.client_id).map(p => (
                    <button
                      key={p.id}
                      onClick={() => onAssignProject(p.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-left transition-colors"
                    >
                      <Icons.Briefcase size={13} className="text-zinc-400 dark:text-zinc-500 shrink-0" />
                      <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-200 truncate flex-1">{p.title}</span>
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
                        p.status === 'Active' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                        : p.status === 'Pending' ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400'
                        : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400'
                      }`}>{p.status || 'Active'}</span>
                    </button>
                  ))}
                </>
              )}
              {unlinked.filter(p => p.client_id).length > 0 && (
                <>
                  {unlinked.filter(p => !p.client_id).length > 0 && (
                    <div className="border-t border-zinc-100 dark:border-zinc-700 my-1" />
                  )}
                  <p className="px-3 pt-1.5 pb-1 text-[9px] font-semibold text-zinc-400 uppercase tracking-wider">From other clients</p>
                  {unlinked.filter(p => p.client_id).map(p => (
                    <button
                      key={p.id}
                      onClick={() => onAssignProject(p.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-amber-50 dark:hover:bg-amber-500/10 text-left transition-colors"
                    >
                      <Icons.Briefcase size={13} className="text-zinc-300 dark:text-zinc-600 shrink-0" />
                      <span className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 truncate flex-1">{p.title}</span>
                      <span className="text-[9px] font-medium text-amber-500 shrink-0">other client</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
};
