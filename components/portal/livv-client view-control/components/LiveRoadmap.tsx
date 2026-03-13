
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Circle, CreditCard, ChevronDown, Flag, Clock } from 'lucide-react';
import { Milestone, PortalTask } from '../types';

const priorityColor: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-amber-500',
  medium: 'bg-blue-500',
  low: 'bg-emerald-500',
};

interface LiveRoadmapProps {
  milestones: Milestone[];
  tasks?: PortalTask[];
  onTaskClick?: (task: PortalTask) => void;
}

const LiveRoadmap: React.FC<LiveRoadmapProps> = ({ milestones, tasks = [], onTaskClick }) => {
  const completed = milestones.filter(m => m.status === 'completed').length;
  const total = milestones.length;
  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const [expanded, setExpanded] = useState<string | null>(null);

  // Group tasks by groupName matching milestone title
  const getTasksForMilestone = (milestone: Milestone): PortalTask[] => {
    return tasks.filter(t => t.groupName === milestone.title);
  };

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, x: 16 }, visible: { opacity: 1, x: 0 } }}
      className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 p-6 md:p-8 h-full flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Project Stages</h3>
        <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
          {completed}/{total}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full mb-6 overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-[#2C0405]"
          initial={{ width: 0 }}
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>

      {/* Steps */}
      <div className="flex-1 overflow-y-auto pr-1 -mr-1 space-y-0">
        {milestones.map((m, idx) => {
          const done = m.status === 'completed';
          const active = m.status === 'current';
          const isLast = idx === milestones.length - 1;
          const milestoneTasks = getTasksForMilestone(m);
          const hasTasks = milestoneTasks.length > 0;
          const isExpanded = expanded === m.id;

          return (
            <div key={m.id} className="flex gap-3 group">
              {/* Timeline column */}
              <div className="flex flex-col items-center shrink-0">
                <div className={`
                  w-6 h-6 rounded-full flex items-center justify-center transition-all
                  ${done ? 'bg-[#2C0405] text-white' : ''}
                  ${active ? 'bg-indigo-500 text-white ring-[3px] ring-indigo-100 dark:ring-indigo-900/60' : ''}
                  ${!done && !active ? 'bg-zinc-100 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700' : ''}
                `}>
                  {done && <Check size={12} strokeWidth={3} />}
                  {active && (
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  )}
                  {!done && !active && <Circle size={5} className="text-zinc-300 dark:text-zinc-600 fill-current" />}
                </div>
                {!isLast && (
                  <div className={`w-[1.5px] flex-1 min-h-[12px] ${done ? 'bg-[#2C0405]/20' : 'bg-zinc-100 dark:bg-zinc-800'}`} />
                )}
              </div>

              {/* Content */}
              <div className={`pb-4 flex-1 min-w-0 ${!done && !active ? 'opacity-50' : ''}`}>
                <div
                  className={`flex items-center gap-2 flex-wrap ${hasTasks ? 'cursor-pointer' : ''}`}
                  onClick={() => hasTasks && setExpanded(isExpanded ? null : m.id)}
                >
                  <h4 className={`text-[13px] font-semibold leading-tight ${
                    done ? 'text-zinc-400 dark:text-zinc-500 line-through decoration-zinc-300 dark:decoration-zinc-700' : ''
                  } ${active ? 'text-indigo-600 dark:text-indigo-400' : ''} ${!done && !active ? 'text-zinc-500 dark:text-zinc-400' : ''}`}>
                    {m.title}
                  </h4>
                  {active && (
                    <span className="px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-500 dark:text-indigo-400 text-[9px] font-bold rounded uppercase tracking-wide">
                      In Progress
                    </span>
                  )}
                  {hasTasks && (
                    <motion.div
                      animate={{ rotate: isExpanded ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="ml-auto"
                    >
                      <ChevronDown size={12} className="text-zinc-400 dark:text-zinc-500" />
                    </motion.div>
                  )}
                </div>

                {m.description && (
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 leading-relaxed">{m.description}</p>
                )}

                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {done && m.completedAt && (
                    <span className="text-[10px] text-[#2C0405] dark:text-[#e8a0a2] font-medium">
                      Completed {m.completedAt}
                    </span>
                  )}
                  {!done && m.eta && (
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium">
                      Date: {m.eta}
                    </span>
                  )}
                  {m.linkedPayment && (
                    <span className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${
                      m.linkedPayment.status === 'paid'
                        ? 'bg-[#2C0405]/5 dark:bg-[#822b2e]/20 text-[#2C0405] dark:text-[#e8a0a2]'
                        : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
                    }`}>
                      <CreditCard size={9} />
                      ${m.linkedPayment.amount.toLocaleString()}
                      {m.linkedPayment.status === 'paid' && ' ✓'}
                    </span>
                  )}
                </div>

                {/* Expanded tasks */}
                <AnimatePresence initial={false}>
                  {isExpanded && hasTasks && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 space-y-0.5 rounded-lg border border-zinc-100 dark:border-zinc-800 overflow-hidden bg-zinc-50/50 dark:bg-zinc-800/30">
                        {milestoneTasks.map(task => {
                          const isOverdue = task.dueDate && !task.completed && new Date(task.dueDate) < new Date(new Date().toISOString().slice(0, 10));
                          return (
                            <div
                              key={task.id}
                              className={`flex items-center gap-2.5 px-3 py-2 ${onTaskClick ? 'cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors' : ''}`}
                              onClick={() => onTaskClick?.(task)}
                            >
                              <div className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center shrink-0 ${
                                task.completed
                                  ? 'bg-[#2C0405] border-[#2C0405] text-white'
                                  : 'border-zinc-300 dark:border-zinc-600'
                              }`}>
                                {task.completed && <Check size={8} strokeWidth={3} />}
                              </div>
                              <span className={`text-[11px] flex-1 min-w-0 truncate ${
                                task.completed ? 'line-through text-zinc-400 dark:text-zinc-500' : 'text-zinc-700 dark:text-zinc-200'
                              }`}>
                                {task.title}
                              </span>
                              {task.priority && priorityColor[task.priority] && (
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityColor[task.priority]}`} />
                              )}
                              {task.dueDate && !task.completed && (
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono shrink-0 ${
                                  isOverdue
                                    ? 'text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/40 font-semibold'
                                    : 'text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800'
                                }`}>
                                  {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                              )}
                              {task.completed && task.completedAt && (
                                <span className="text-[9px] text-[#2C0405] dark:text-[#e8a0a2] font-medium shrink-0">
                                  {new Date(task.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary footer */}
      {total > 0 && (
        <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 text-center">
            {progressPct === 100 ? (
              <span className="text-[#2C0405] dark:text-[#e8a0a2] font-semibold">Project completed</span>
            ) : (
              <>{progressPct}% completed</>
            )}
          </p>
        </div>
      )}
    </motion.div>
  );
};

export default LiveRoadmap;
