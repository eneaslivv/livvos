
import React from 'react';
import { motion } from 'framer-motion';
import { Check, Circle } from 'lucide-react';
import { Milestone } from '../types';

const LiveRoadmap: React.FC<{ milestones: Milestone[] }> = ({ milestones }) => {
  const completed = milestones.filter(m => m.status === 'completed').length;
  const total = milestones.length;
  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, x: 16 }, visible: { opacity: 1, x: 0 } }}
      className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 p-6 md:p-8 h-full flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Etapas del Proyecto</h3>
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
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className={`text-[13px] font-semibold leading-tight ${
                    done ? 'text-zinc-400 dark:text-zinc-500 line-through decoration-zinc-300 dark:decoration-zinc-700' : ''
                  } ${active ? 'text-indigo-600 dark:text-indigo-400' : ''} ${!done && !active ? 'text-zinc-500 dark:text-zinc-400' : ''}`}>
                    {m.title}
                  </h4>
                  {active && (
                    <span className="px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-500 dark:text-indigo-400 text-[9px] font-bold rounded uppercase tracking-wide">
                      En curso
                    </span>
                  )}
                </div>

                {m.description && (
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 leading-relaxed">{m.description}</p>
                )}

                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {done && m.completedAt && (
                    <span className="text-[10px] text-[#2C0405] dark:text-[#e8a0a2] font-medium">
                      Completada {m.completedAt}
                    </span>
                  )}
                  {!done && m.eta && (
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium">
                      Fecha: {m.eta}
                    </span>
                  )}
                </div>
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
              <span className="text-[#2C0405] dark:text-[#e8a0a2] font-semibold">Proyecto completado</span>
            ) : (
              <>{progressPct}% completado</>
            )}
          </p>
        </div>
      )}
    </motion.div>
  );
};

export default LiveRoadmap;
