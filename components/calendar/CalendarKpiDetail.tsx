/**
 * CalendarKpiDetail — modal/slide-over que se abre cuando el user clickea
 * una de las KPI cards. Lista todas las tareas filtradas por ese kpi.
 *
 * v2 (2026-05-22): el sidebar de 173 tareas era un caos. Cambios:
 *   • Subtasks ocultas por defecto (toggle "Subtareas" en el toolbar).
 *   • Filtro de proyecto (chips horizontales) — "Todos" + cada proyecto + "Sin proyecto".
 *   • Agrupado por proyecto cuando hay >1 proyecto — header colapsable
 *     con count + chevron.
 *   • Footer dinámico con counts: parents · subtasks ocultas · proyectos.
 *
 * Click en una task row → emite onOpenTask(taskId) que el host usa para
 * abrir el TaskDetailPanel existente.
 */
import React, { useMemo, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../ui/Icons';
import type { KpiKey } from './CalendarKpiStrip';

interface MinimalTask {
  id: string;
  title?: string | null;
  status?: string | null;
  completed?: boolean | null;
  priority?: string | null;
  due_date?: string | null;
  created_at?: string | null;
  assigned_at?: string | null;
  cancelled_at?: string | null;
  assignee_id?: string | null;
  project_id?: string | null;
  project_title?: string | null;
  parent_task_id?: string | null;
}

interface CalendarKpiDetailProps {
  kpi: KpiKey | null;
  tasks: MinimalTask[];
  /** Map de project_id → title para mostrar el contexto. */
  projectTitles?: Record<string, string>;
  /** Map de user_id → name para mostrar quién es el assignee. */
  userNames?: Record<string, string>;
  onClose: () => void;
  onOpenTask?: (taskId: string) => void;
}

const KPI_META: Record<KpiKey, { label: string; tone: string; toneSoft: string; icon: React.ReactNode; description: string }> = {
  assigned_new: {
    label: 'Asignadas nuevas',
    tone: '#6DBEDC',
    toneSoft: 'rgba(109,190,220,0.08)',
    icon: <Icons.User size={14} />,
    description: 'Tareas asignadas en los últimos 7 días, todavía abiertas.',
  },
  active: {
    label: 'Activas',
    tone: '#C4A35A',
    toneSoft: 'rgba(196,163,90,0.08)',
    icon: <Icons.Activity size={14} />,
    description: 'Tareas en curso — no completadas, no canceladas.',
  },
  cancelled: {
    label: 'Canceladas',
    tone: '#A8A29A',
    toneSoft: 'rgba(168,162,154,0.08)',
    icon: <Icons.X size={14} />,
    description: 'Tareas con status cancelled o cancelled_at registrado.',
  },
  overdue: {
    label: 'Demoradas',
    tone: '#E11D48',
    toneSoft: 'rgba(225,29,72,0.08)',
    icon: <Icons.AlertCircle size={14} />,
    description: 'Tareas con due_date pasado, todavía sin completar ni cancelar.',
  },
};

const PRIORITY_DOT: Record<string, string> = {
  urgent: '#E11D48',
  high:   '#C4A35A',
  medium: '#71717a',
  low:    '#a1a1aa',
};

const UNASSIGNED_PROJECT_ID = '__none__';

function filterByKpi(tasks: MinimalTask[], kpi: KpiKey): MinimalTask[] {
  const now = Date.now();
  const since7d = now - 7 * 86400000;
  return tasks.filter(t => {
    const isDone = t.completed === true || t.status === 'done' || t.status === 'completed';
    const isCancelled = t.status === 'cancelled' || !!t.cancelled_at;
    if (kpi === 'cancelled') return isCancelled;
    if (kpi === 'active') return !isDone && !isCancelled;
    if (kpi === 'overdue') {
      if (isDone || isCancelled || !t.due_date) return false;
      const dueTs = new Date(t.due_date).getTime();
      return !isNaN(dueTs) && dueTs < now;
    }
    if (kpi === 'assigned_new') {
      if (isDone || isCancelled) return false;
      const assignedTs = t.assigned_at ? new Date(t.assigned_at).getTime()
                         : t.created_at ? new Date(t.created_at).getTime() : 0;
      return assignedTs >= since7d;
    }
    return false;
  });
}

function formatDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diffDays = Math.floor((d.getTime() - now.getTime()) / 86400000);
  if (diffDays === 0) return 'Hoy';
  if (diffDays === -1) return 'Ayer';
  if (diffDays === 1) return 'Mañana';
  if (diffDays < 0 && diffDays > -7) return `Hace ${Math.abs(diffDays)}d`;
  if (diffDays > 0 && diffDays < 7) return `En ${diffDays}d`;
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

export const CalendarKpiDetail: React.FC<CalendarKpiDetailProps> = ({
  kpi,
  tasks,
  projectTitles,
  userNames,
  onClose,
  onOpenTask,
}) => {
  const [showSubtasks, setShowSubtasks] = useState(false);
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Reset filters cuando cambia el KPI
  useEffect(() => {
    setShowSubtasks(false);
    setProjectFilter('all');
    setCollapsedGroups(new Set());
  }, [kpi]);

  // Filtrado: KPI → subtasks toggle → project filter
  const { filtered, subtasksCount, projectOptions, groups } = useMemo(() => {
    if (!kpi) return { filtered: [], subtasksCount: 0, projectOptions: [], groups: [] };
    const byKpi = filterByKpi(tasks, kpi);
    const parents = byKpi.filter(t => !t.parent_task_id);
    const subs    = byKpi.filter(t => !!t.parent_task_id);
    let visible = showSubtasks ? byKpi : parents;

    // Project options del set actual de KPI (no del total)
    const projMap = new Map<string, string>();
    let unassigned = 0;
    for (const t of byKpi) {
      const pid = t.project_id || UNASSIGNED_PROJECT_ID;
      const title = pid === UNASSIGNED_PROJECT_ID
        ? 'Sin proyecto'
        : (t.project_title || (t.project_id ? projectTitles?.[t.project_id] : null) || 'Proyecto');
      if (pid === UNASSIGNED_PROJECT_ID) unassigned++;
      else if (!projMap.has(pid)) projMap.set(pid, title);
    }
    const options = Array.from(projMap.entries()).map(([id, title]) => ({ id, title, count: byKpi.filter(t => t.project_id === id && (!t.parent_task_id || showSubtasks)).length }));
    options.sort((a, b) => b.count - a.count);
    if (unassigned > 0) {
      options.push({ id: UNASSIGNED_PROJECT_ID, title: 'Sin proyecto', count: byKpi.filter(t => !t.project_id && (!t.parent_task_id || showSubtasks)).length });
    }

    if (projectFilter !== 'all') {
      visible = visible.filter(t => {
        if (projectFilter === UNASSIGNED_PROJECT_ID) return !t.project_id;
        return t.project_id === projectFilter;
      });
    }

    // Group by project — sólo cuando hay >1 proyecto en el visible set
    const groupKeys = new Set(visible.map(t => t.project_id || UNASSIGNED_PROJECT_ID));
    const grouped: Array<{ id: string; title: string; tasks: MinimalTask[] }> = [];
    if (groupKeys.size > 1) {
      for (const [id, title] of projMap.entries()) {
        const ts = visible.filter(t => t.project_id === id);
        if (ts.length > 0) grouped.push({ id, title, tasks: ts });
      }
      const noPid = visible.filter(t => !t.project_id);
      if (noPid.length > 0) grouped.push({ id: UNASSIGNED_PROJECT_ID, title: 'Sin proyecto', tasks: noPid });
      grouped.sort((a, b) => b.tasks.length - a.tasks.length);
    } else {
      grouped.push({ id: '__flat__', title: '', tasks: visible });
    }

    return {
      filtered: visible,
      subtasksCount: subs.length,
      projectOptions: options,
      groups: grouped,
    };
  }, [kpi, tasks, showSubtasks, projectFilter, projectTitles]);

  const meta = kpi ? KPI_META[kpi] : null;

  // Esc para cerrar
  useEffect(() => {
    if (!kpi) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [kpi, onClose]);

  const toggleGroup = (id: string) => {
    setCollapsedGroups(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <AnimatePresence>
      {kpi && meta && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[1px]"
          />

          {/* Slide-over panel */}
          <motion.aside
            initial={{ x: 460, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 460, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed top-0 right-0 z-50 h-screen w-full sm:w-[460px] bg-white dark:bg-zinc-950 border-l border-zinc-200/80 dark:border-zinc-800 shadow-2xl flex flex-col"
            style={{ ['--kpi-tone' as any]: meta.tone, ['--kpi-tone-soft' as any]: meta.toneSoft }}
          >
            {/* Header */}
            <header
              className="px-5 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800/60 shrink-0"
              style={{
                backgroundImage: `linear-gradient(135deg, var(--kpi-tone-soft) 0%, transparent 60%)`,
              }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: `color-mix(in oklab, ${meta.tone} 14%, transparent)`, color: meta.tone }}
                >
                  {meta.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-[18px] font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">
                      {filtered.length}
                    </h3>
                    <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                      {meta.label}
                    </span>
                  </div>
                  <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">
                    {meta.description}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Cerrar"
                  className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors shrink-0"
                  title="Cerrar (Esc)"
                >
                  <Icons.X size={14} />
                </button>
              </div>
            </header>

            {/* Toolbar: subtasks toggle + project chips */}
            <div className="px-5 py-2.5 border-b border-zinc-100 dark:border-zinc-800/60 shrink-0 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => setShowSubtasks(s => !s)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-medium border transition-colors ${
                    showSubtasks
                      ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-transparent'
                      : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                  }`}
                >
                  {showSubtasks ? <Icons.Check size={10} /> : <Icons.Plus size={10} />}
                  Subtareas
                  {subtasksCount > 0 && (
                    <span className={`text-[9.5px] font-mono ${showSubtasks ? 'opacity-70' : 'opacity-50'}`}>
                      {subtasksCount}
                    </span>
                  )}
                </button>
                {projectOptions.length > 1 && (
                  <span className="text-[9.5px] font-mono uppercase tracking-wider text-zinc-400">
                    {projectOptions.length} proyectos
                  </span>
                )}
              </div>

              {projectOptions.length > 0 && (
                <div className="flex items-center gap-1 overflow-x-auto -mx-1 px-1 pb-0.5 scrollbar-none">
                  <button
                    onClick={() => setProjectFilter('all')}
                    className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
                      projectFilter === 'all'
                        ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-transparent'
                        : 'bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50'
                    }`}
                  >
                    Todos
                  </button>
                  {projectOptions.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setProjectFilter(opt.id)}
                      className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors inline-flex items-center gap-1 ${
                        projectFilter === opt.id
                          ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-transparent'
                          : 'bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50'
                      }`}
                      title={opt.title}
                    >
                      <span className="truncate max-w-[120px]">{opt.title}</span>
                      <span className="text-[9px] font-mono opacity-70">{opt.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Lista — agrupada por proyecto cuando aplica */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-2">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-6">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
                    style={{ background: `color-mix(in oklab, ${meta.tone} 10%, transparent)`, color: meta.tone }}
                  >
                    {meta.icon}
                  </div>
                  <p className="text-[13px] font-medium text-zinc-700 dark:text-zinc-200">
                    {projectFilter !== 'all' ? 'Sin tareas en este proyecto' : 'No hay tareas en este estado'}
                  </p>
                  <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400 mt-1 max-w-[280px]">
                    {projectFilter !== 'all' ? 'Probá quitar el filtro de proyecto.' : (
                      <>
                        {kpi === 'overdue' && 'Nada vencido. Buen trabajo.'}
                        {kpi === 'cancelled' && 'Sin cancelaciones en esta ventana.'}
                        {kpi === 'assigned_new' && 'No hubo asignaciones nuevas en los últimos 7 días.'}
                        {kpi === 'active' && 'Sin tareas activas — todo está completo o pausado.'}
                      </>
                    )}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {groups.map(group => {
                    const isFlat = group.id === '__flat__';
                    const isCollapsed = collapsedGroups.has(group.id);
                    return (
                      <div key={group.id} className="flex flex-col">
                        {!isFlat && (
                          <button
                            onClick={() => toggleGroup(group.id)}
                            className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors text-left"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Icons.ChevronRight
                                size={11}
                                className={`text-zinc-400 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                              />
                              <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 truncate">
                                {group.title}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono text-zinc-400 shrink-0">
                              {group.tasks.length}
                            </span>
                          </button>
                        )}

                        {(isFlat || !isCollapsed) && (
                          <ul className="flex flex-col gap-0.5 mt-0.5">
                            {group.tasks.map(task => {
                              const projectTitle = !isFlat ? null : (task.project_title || (task.project_id ? projectTitles?.[task.project_id] : null));
                              const assigneeName = task.assignee_id ? userNames?.[task.assignee_id] : null;
                              const priorityColor = PRIORITY_DOT[task.priority || 'medium'] || PRIORITY_DOT.medium;
                              const due = formatDate(task.due_date);
                              const isSub = !!task.parent_task_id;
                              return (
                                <motion.li
                                  key={task.id}
                                  initial={{ opacity: 0, y: 4 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ duration: 0.15 }}
                                >
                                  <button
                                    onClick={() => onOpenTask?.(task.id)}
                                    className={`group w-full text-left px-3 py-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors flex items-start gap-2.5 ${isSub ? 'pl-7' : ''}`}
                                  >
                                    <span
                                      className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                                      style={{ background: priorityColor }}
                                      aria-hidden
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 leading-snug truncate flex items-center gap-1.5">
                                        {isSub && <span className="text-[9px] font-mono uppercase tracking-wider text-zinc-400 shrink-0">sub</span>}
                                        <span className="truncate">{task.title || 'Sin título'}</span>
                                      </div>
                                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                                        {projectTitle && (
                                          <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate max-w-[140px]">
                                            {projectTitle}
                                          </span>
                                        )}
                                        {due && (
                                          <>
                                            {projectTitle && <span className="text-zinc-300 dark:text-zinc-700 text-[10px]">·</span>}
                                            <span
                                              className={`text-[11px] tabular-nums ${
                                                kpi === 'overdue'
                                                  ? 'font-semibold text-rose-600 dark:text-rose-400'
                                                  : 'text-zinc-500 dark:text-zinc-400'
                                              }`}
                                            >
                                              {kpi === 'overdue' && <Icons.AlertCircle size={9} className="inline mr-0.5 mb-px" />}
                                              {due}
                                            </span>
                                          </>
                                        )}
                                        {assigneeName && (
                                          <>
                                            <span className="text-zinc-300 dark:text-zinc-700 text-[10px]">·</span>
                                            <span className="text-[11px] text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-1">
                                              <Icons.User size={9} />
                                              {assigneeName}
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                    <span
                                      className="opacity-0 group-hover:opacity-100 transition-opacity self-center text-zinc-400"
                                      aria-hidden
                                    >
                                      <Icons.ChevronRight size={14} />
                                    </span>
                                  </button>
                                </motion.li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <footer className="px-5 py-2.5 border-t border-zinc-100 dark:border-zinc-800/60 shrink-0 flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                {filtered.length} {filtered.length === 1 ? 'task' : 'tasks'}
                {!showSubtasks && subtasksCount > 0 && (
                  <span className="ml-1.5 normal-case tracking-normal text-zinc-300 dark:text-zinc-600">
                    · +{subtasksCount} subtareas ocultas
                  </span>
                )}
              </span>
              <span className="text-[10px] text-zinc-400">
                Esc para cerrar
              </span>
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
