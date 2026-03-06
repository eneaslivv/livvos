import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronDown, ListChecks } from 'lucide-react';
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

const ProjectTasks: React.FC<{ tasks: PortalTask[] }> = ({ tasks }) => {
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
      className="bg-white rounded-2xl border border-zinc-200/60 p-6 md:p-8"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
          <ListChecks size={13} className="text-zinc-300" />
          Tareas del Proyecto
        </h3>
        <span className="text-[11px] font-semibold text-zinc-500">
          {totalCompleted}/{tasks.length}
        </span>
      </div>

      {/* Overall progress bar */}
      <div className="w-full h-1.5 bg-zinc-100 rounded-full mb-6 overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-[#2C0405]"
          initial={{ width: 0 }}
          animate={{ width: `${tasks.length ? Math.round((totalCompleted / tasks.length) * 100) : 0}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>

      {/* Stage groups */}
      <div className="space-y-3">
        {groups.map(group => {
          const isCollapsed = !!collapsed[group.name];
          const phasePct = group.total ? Math.round((group.completed / group.total) * 100) : 0;
          const allDone = phasePct === 100 && group.total > 0;

          return (
            <div key={group.name} className="rounded-xl border border-zinc-100 overflow-hidden">
              {/* Group header */}
              <button
                onClick={() => toggleGroup(group.name)}
                className="w-full px-4 py-3 flex items-center justify-between bg-zinc-50/50 hover:bg-zinc-50 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-2 h-2 rounded-full ${
                    allDone ? 'bg-emerald-500' : phasePct > 0 ? 'bg-amber-400' : 'bg-zinc-300'
                  }`} />
                  <span className="text-[13px] font-semibold text-zinc-700">
                    {group.name}
                  </span>
                  <span className="text-[10px] text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-full tabular-nums">
                    {group.completed}/{group.total}
                  </span>
                </div>
                <motion.div
                  animate={{ rotate: isCollapsed ? 0 : 180 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown size={14} className="text-zinc-400" />
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
                    <div className="divide-y divide-zinc-50">
                      {group.tasks.map(task => (
                        <div key={task.id} className="flex items-center gap-3 px-4 py-2.5">
                          {/* Status circle (read-only) */}
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            task.completed
                              ? 'bg-[#2C0405] border-[#2C0405] text-white'
                              : 'border-zinc-300'
                          }`}>
                            {task.completed && <Check size={10} strokeWidth={3} />}
                          </div>

                          {/* Task title */}
                          <span className={`text-[12px] flex-1 min-w-0 truncate ${
                            task.completed ? 'line-through text-zinc-400' : 'text-zinc-700'
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
                                ? 'text-red-500 bg-red-50 font-semibold'
                                : 'text-zinc-400 bg-zinc-100'
                            }`}>
                              {new Date(task.dueDate).toLocaleDateString('es-AR', { month: 'short', day: 'numeric' })}
                            </span>
                          )}

                          {/* Completed date */}
                          {task.completed && task.completedAt && (
                            <span className="text-[10px] text-[#2C0405] font-medium shrink-0">
                              {new Date(task.completedAt).toLocaleDateString('es-AR', { month: 'short', day: 'numeric' })}
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
      </div>

      {/* Empty state */}
      {tasks.length === 0 && (
        <p className="text-xs text-zinc-300 text-center py-8">No hay tareas en este proyecto</p>
      )}
    </motion.div>
  );
};

export default ProjectTasks;
