/**
 * CalendarKpiDetail — modal/slide-over que se abre cuando el user clickea
 * una de las KPI cards. Lista todas las tareas filtradas por ese kpi.
 *
 * Click en una task row → emite onOpenTask(taskId) que el host usa para
 * abrir el TaskDetailPanel existente.
 *
 * Diseño: panel right-anchored, ~440px, full-round chrome, mismo tone
 * que el KPI source (sky / gold / stone / rose). Header con count + label,
 * lista scrolleable, cada row con title + meta (due_date, priority, assignee).
 */
import React, { useMemo, useEffect } from 'react';
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

function filterTasks(tasks: MinimalTask[], kpi: KpiKey): MinimalTask[] {
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
  const filtered = useMemo(() => kpi ? filterTasks(tasks, kpi) : [], [tasks, kpi]);
  const meta = kpi ? KPI_META[kpi] : null;

  // Esc para cerrar
  useEffect(() => {
    if (!kpi) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [kpi, onClose]);

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
            className="fixed top-0 right-0 z-50 h-screen w-full sm:w-[440px] bg-white dark:bg-zinc-950 border-l border-zinc-200/80 dark:border-zinc-800 shadow-2xl flex flex-col"
            style={{ ['--kpi-tone' as any]: meta.tone, ['--kpi-tone-soft' as any]: meta.toneSoft }}
          >
            {/* Header */}
            <header
              className="px-5 pt-4 pb-4 border-b border-zinc-100 dark:border-zinc-800/60 shrink-0"
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
                  <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400 mt-1 leading-snug">
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

            {/* Lista */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-2.5">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-6">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
                    style={{ background: `color-mix(in oklab, ${meta.tone} 10%, transparent)`, color: meta.tone }}
                  >
                    {meta.icon}
                  </div>
                  <p className="text-[13px] font-medium text-zinc-700 dark:text-zinc-200">
                    No hay tareas en este estado
                  </p>
                  <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400 mt-1 max-w-[280px]">
                    {kpi === 'overdue' && 'Nada vencido. Buen trabajo.'}
                    {kpi === 'cancelled' && 'Sin cancelaciones en esta ventana.'}
                    {kpi === 'assigned_new' && 'No hubo asignaciones nuevas en los últimos 7 días.'}
                    {kpi === 'active' && 'Sin tareas activas — todo está completo o pausado.'}
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-1">
                  {filtered.map(task => {
                    const projectTitle = task.project_title || (task.project_id ? projectTitles?.[task.project_id] : null);
                    const assigneeName = task.assignee_id ? userNames?.[task.assignee_id] : null;
                    const priorityColor = PRIORITY_DOT[task.priority || 'medium'] || PRIORITY_DOT.medium;
                    const due = formatDate(task.due_date);
                    return (
                      <motion.li
                        key={task.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15 }}
                      >
                        <button
                          onClick={() => onOpenTask?.(task.id)}
                          className="group w-full text-left px-3 py-2.5 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors flex items-start gap-2.5"
                        >
                          {/* Priority dot */}
                          <span
                            className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ background: priorityColor }}
                            aria-hidden
                          />

                          {/* Body */}
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 leading-snug truncate">
                              {task.title || 'Sin título'}
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

                          {/* Chevron — visible on hover */}
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

            {/* Footer — sutil */}
            <footer className="px-5 py-2.5 border-t border-zinc-100 dark:border-zinc-800/60 shrink-0 flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                {filtered.length} {filtered.length === 1 ? 'task' : 'tasks'}
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
