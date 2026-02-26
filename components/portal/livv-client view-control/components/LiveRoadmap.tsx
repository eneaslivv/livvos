
import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Circle, Loader2, User, Users, AlertCircle } from 'lucide-react';
import { Milestone } from '../types';

const ownerConfig = {
  team: { label: 'Nuestro equipo', icon: Users, bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-100' },
  client: { label: 'Tu acción', icon: User, bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  review: { label: 'En revisión', icon: AlertCircle, bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-100' },
};

const LiveRoadmap: React.FC<{ milestones: Milestone[] }> = ({ milestones }) => {
  const completed = milestones.filter(m => m.status === 'completed').length;

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, x: 16 }, visible: { opacity: 1, x: 0 } }}
      className="bg-white rounded-2xl border border-zinc-200/60 p-6 md:p-8 h-full flex flex-col"
    >
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Etapas del Proyecto</h3>
        <span className="text-[10px] font-medium text-zinc-300">{completed}/{milestones.length}</span>
      </div>

      <div className="space-y-0.5 flex-1">
        {milestones.map((m, idx) => {
          const done = m.status === 'completed';
          const active = m.status === 'current';
          const cfg = m.owner ? ownerConfig[m.owner] : null;

          return (
            <div key={m.id} className="flex gap-3.5 group">
              {/* Line + Icon */}
              <div className="flex flex-col items-center">
                <div className={`
                  w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all
                  ${done ? 'bg-emerald-500 text-white' : ''}
                  ${active ? 'bg-indigo-500 text-white ring-4 ring-indigo-100' : ''}
                  ${!done && !active ? 'bg-zinc-100 text-zinc-300' : ''}
                `}>
                  {done && <CheckCircle2 size={14} />}
                  {active && <Loader2 size={14} className="animate-spin" />}
                  {!done && !active && <Circle size={6} className="fill-current" />}
                </div>
                {idx !== milestones.length - 1 && (
                  <div className={`w-[1.5px] flex-1 min-h-[16px] mt-1 ${done ? 'bg-emerald-200' : 'bg-zinc-100'}`} />
                )}
              </div>

              {/* Content */}
              <div className={`pb-4 flex-1 ${done ? 'opacity-45' : ''}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className={`text-[13px] font-semibold ${active ? 'text-indigo-600' : 'text-zinc-700'}`}>
                    {m.title}
                  </h4>
                  {active && <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-500 text-[9px] font-semibold rounded">En curso</span>}
                  {m.eta && !done && <span className="text-[9px] text-zinc-300 font-medium">· {m.eta}</span>}
                </div>
                <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">{m.description}</p>

                {/* Owner badge */}
                {cfg && !done && (
                  <div className={`inline-flex items-center gap-1.5 mt-2 px-2 py-1 rounded-md text-[10px] font-medium ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
                    <cfg.icon size={11} />
                    {cfg.label}
                  </div>
                )}

                {/* Client action callout */}
                {m.clientAction && !done && (
                  <div className="mt-2 p-2.5 bg-amber-50/80 border border-amber-200/50 rounded-lg">
                    <p className="text-[10px] text-amber-700 font-medium">{m.clientAction}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
};

export default LiveRoadmap;
