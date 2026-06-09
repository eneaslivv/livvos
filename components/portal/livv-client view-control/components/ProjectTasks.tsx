import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronDown, ListChecks, LayoutList, Columns3, Plus } from 'lucide-react';
import { PortalTask } from '../types';

interface StageGroup {
  name: string;
  tasks: PortalTask[];
  completed: number;
  total: number;
}

const priorityColor: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-amber-500',
  medium: 'bg-blue-500',
  low: 'bg-emerald-500',
};

// Board view: same column set + colors as the internal kanban so the
// client sees a familiar shape. Read-only — clients can't drag-drop.
type BoardStatus = 'todo' | 'in-progress' | 'done' | 'cancelled';

const BOARD_COLUMNS: { key: BoardStatus; label: string; chip: string; dot: string }[] = [
  { key: 'todo',        label: 'PENDIENTE',  chip: 'bg-zinc-700 text-white',           dot: 'bg-zinc-400' },
  { key: 'in-progress', label: 'TRABAJANDO', chip: 'bg-amber-400 text-amber-950',      dot: 'bg-amber-500' },
  { key: 'done',        label: 'COMPLETADO', chip: 'bg-emerald-400 text-emerald-950',  dot: 'bg-emerald-500' },
  { key: 'cancelled',   label: 'CANCELADO',  chip: 'bg-rose-400 text-rose-950',        dot: 'bg-rose-500' },
];

function inferBoardStatus(t: PortalTask): BoardStatus {
  if (t.completed) return 'done';
  const s = (t.status || '').toLowerCase();
  if (s === 'in-progress' || s === 'in_progress' || s === 'doing' || s === 'working') return 'in-progress';
  if (s === 'done' || s === 'completed') return 'done';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  return 'todo';
}

const ProjectTasks: React.FC<{ tasks: PortalTask[]; onTaskClick?: (task: PortalTask) => void; onNewOrder?: () => void }> = ({ tasks, onTaskClick, onNewOrder }) => {
  // Persist the chosen view per-portal-tab so reopening the project keeps
  // the client's preferred layout. Defaults to 'list' to match what
  // they're already used to.
  const [view, setView] = useState<'list' | 'board'>(() => {
    try {
      const v = window.localStorage.getItem('portal:tasks-view');
      return v === 'board' ? 'board' : 'list';
    } catch { return 'list'; }
  });
  const setViewPersist = (v: 'list' | 'board') => {
    setView(v);
    try { window.localStorage.setItem('portal:tasks-view', v); } catch { /* noop */ }
  };

  const boardGroups = useMemo(() => {
    const map: Record<BoardStatus, PortalTask[]> = { 'todo': [], 'in-progress': [], 'done': [], 'cancelled': [] };
    for (const t of tasks) map[inferBoardStatus(t)].push(t);
    return map;
  }, [tasks]);
  const groups = useMemo<StageGroup[]>(() => {
    const map = new Map<string, PortalTask[]>();
    for (const t of tasks) {
      const key = t.groupName;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries()).map(([name, items]) => ({
      name,
      tasks: items,
      completed: items.filter(i => i.completed).length,
      total: items.length,
    }));
  }, [tasks]);

  const totalCompleted = tasks.filter(t => t.completed).length;

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleGroup = (name: string) =>
    setCollapsed(prev => ({ ...prev, [name]: !prev[name] }));

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
      className="bg-white dark:bg-zinc-900 rounded-2xl border border-[#E6E2D8] dark:border-zinc-800 shadow-[0_1px_2px_rgba(44,4,5,0.04)] p-6 md:p-8"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2 gap-3">
        <h3 className="text-[10px] font-mono font-medium text-[#A8A29A] dark:text-zinc-500 uppercase tracking-[0.16em] flex items-center gap-2">
          <ListChecks size={13} className="text-zinc-300 dark:text-zinc-600" />
          Project Tasks
        </h3>
        <div className="flex items-center gap-3">
          {onNewOrder && (
            <button
              onClick={onNewOrder}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold text-white bg-[#2C0405] hover:bg-[#1a0203] shadow-sm shadow-[#2C0405]/20 transition-colors"
              title="Pedir una nueva tarea al equipo"
            >
              <Plus size={12} strokeWidth={2.5} /> Pedir tarea
            </button>
          )}
          <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
            {totalCompleted}/{tasks.length}
          </span>
          {/* List ⇄ Board toggle */}
          <div className="flex items-center bg-zinc-100 dark:bg-zinc-800/60 rounded-md p-0.5 gap-0.5">
            <button
              onClick={() => setViewPersist('list')}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                view === 'list'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
              }`}
              title="List view"
            >
              <LayoutList size={10} /> List
            </button>
            <button
              onClick={() => setViewPersist('board')}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                view === 'board'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
              }`}
              title="Board view"
            >
              <Columns3 size={10} /> Board
            </button>
          </div>
        </div>
      </div>

      {/* Overall progress bar */}
      <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full mb-6 overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-[#C4A35A]"
          initial={{ width: 0 }}
          animate={{ width: `${tasks.length ? Math.round((totalCompleted / tasks.length) * 100) : 0}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>

      {/* ─── Board view ─── */}
      {view === 'board' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {BOARD_COLUMNS.map(col => {
            const colTasks = boardGroups[col.key];
            return (
              <div
                key={col.key}
                className="rounded-xl bg-[#FAF6EE] dark:bg-zinc-800/30 border border-[#EFEAE0] dark:border-zinc-800 p-2.5 min-h-[140px]"
              >
                {/* Column header */}
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full inline-flex items-center gap-1.5 ${col.chip}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${col.dot}`} />
                    {col.label}
                  </span>
                  <span className="text-[10px] font-semibold text-zinc-400 tabular-nums">{colTasks.length}</span>
                </div>

                {/* Cards */}
                <div className="space-y-1.5">
                  {colTasks.length === 0 ? (
                    <div className="text-[10px] text-zinc-300 dark:text-zinc-600 italic px-1 py-3 text-center">
                      —
                    </div>
                  ) : colTasks.map(task => (
                    <button
                      key={task.id}
                      onClick={() => onTaskClick?.(task)}
                      className={`w-full text-left bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200/70 dark:border-zinc-800 px-2.5 py-2 transition-all ${
                        onTaskClick ? 'hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-sm' : 'cursor-default'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${task.priority && priorityColor[task.priority] ? priorityColor[task.priority] : 'bg-zinc-300 dark:bg-zinc-600'}`} />
                        <div className="flex-1 min-w-0">
                          <div className={`text-[12px] leading-snug ${
                            task.completed
                              ? 'line-through text-zinc-400 dark:text-zinc-500'
                              : 'text-zinc-800 dark:text-zinc-100 font-medium'
                          }`}>
                            {task.title}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            {task.groupName && task.groupName !== 'Tasks' && (
                              <span className="text-[9px] text-zinc-400 truncate">{task.groupName}</span>
                            )}
                            {task.dueDate && !task.completed && (
                              <span className={`text-[9px] tabular-nums ${
                                new Date(task.dueDate) < new Date(new Date().toISOString().slice(0, 10))
                                  ? 'text-rose-500 font-semibold'
                                  : 'text-zinc-400'
                              }`}>
                                {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                            {task.completed && task.completedAt && (
                              <span className="text-[9px] text-emerald-500 tabular-nums">
                                {new Date(task.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── List view (existing) ─── */}
      {view === 'list' && <div className="space-y-3">
        {groups.map(group => {
          const isCollapsed = !!collapsed[group.name];
          const phasePct = group.total ? Math.round((group.completed / group.total) * 100) : 0;
          const allDone = phasePct === 100 && group.total > 0;

          return (
            <div key={group.name} className="rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
              {/* Group header */}
              <button
                onClick={() => toggleGroup(group.name)}
                className="w-full px-4 py-3 flex items-center justify-between bg-[#FAF6EE] dark:bg-zinc-800/50 hover:bg-[#F5F2EB] dark:hover:bg-zinc-800 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-2 h-2 rounded-full ${
                    allDone ? 'bg-emerald-500' : phasePct > 0 ? 'bg-amber-400' : 'bg-zinc-300 dark:bg-zinc-600'
                  }`} />
                  <span className="text-[13px] font-semibold text-zinc-700 dark:text-zinc-200">
                    {group.name}
                  </span>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full tabular-nums">
                    {group.completed}/{group.total}
                  </span>
                </div>
                <motion.div
                  animate={{ rotate: isCollapsed ? 0 : 180 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown size={14} className="text-zinc-400 dark:text-zinc-500" />
                </motion.div>
              </button>

              {/* Task list */}
              <AnimatePresence initial={false}>
                {!isCollapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
                      {group.tasks.map(task => (
                        <div
                          key={task.id}
                          className={`flex items-center gap-3 px-4 py-2.5${onTaskClick ? ' cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors' : ''}`}
                          onClick={() => onTaskClick?.(task)}
                        >
                          {/* Status circle (read-only) */}
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            task.completed
                              ? 'bg-[#2C0405] border-[#2C0405] text-white'
                              : 'border-zinc-300 dark:border-zinc-600'
                          }`}>
                            {task.completed && <Check size={10} strokeWidth={3} />}
                          </div>

                          {/* Task title */}
                          <span className={`text-[12px] flex-1 min-w-0 truncate ${
                            task.completed ? 'line-through text-zinc-400 dark:text-zinc-500' : 'text-zinc-700 dark:text-zinc-200'
                          }`}>
                            {task.title}
                          </span>

                          {/* Priority dot */}
                          {task.priority && priorityColor[task.priority] && (
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityColor[task.priority]}`} />
                          )}

                          {/* Due date */}
                          {task.dueDate && !task.completed && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono shrink-0 ${
                              new Date(task.dueDate) < new Date(new Date().toISOString().slice(0, 10))
                                ? 'text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/40 font-semibold'
                                : 'text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800'
                            }`}>
                              {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          )}

                          {/* Completed date */}
                          {task.completed && task.completedAt && (
                            <span className="text-[10px] text-[#2C0405] dark:text-[#e8a0a2] font-medium shrink-0">
                              {new Date(task.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>}

      {/* Empty state */}
      {tasks.length === 0 && (
        <p className="text-xs text-zinc-300 dark:text-zinc-600 text-center py-8">No tasks in this project</p>
      )}
    </motion.div>
  );
};

export default ProjectTasks;
