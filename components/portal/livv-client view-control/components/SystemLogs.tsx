
import React from 'react';
import { motion } from 'framer-motion';
import { Activity, CheckCircle2, CreditCard, Package, MessageSquare, Clock } from 'lucide-react';
import { LogEntry } from '../types';

const typeConfig: Record<string, { icon: React.ElementType; bg: string; text: string }> = {
  milestone: { icon: CheckCircle2, bg: 'bg-emerald-50', text: 'text-emerald-500' },
  payment: { icon: CreditCard, bg: 'bg-blue-50', text: 'text-blue-500' },
  delivery: { icon: Package, bg: 'bg-indigo-50', text: 'text-indigo-500' },
  review: { icon: MessageSquare, bg: 'bg-amber-50', text: 'text-amber-500' },
  update: { icon: Activity, bg: 'bg-zinc-50', text: 'text-zinc-400' },
};

const SystemLogs: React.FC<{ logs: LogEntry[] }> = ({ logs }) => {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
      className="bg-white rounded-2xl border border-zinc-200/60 p-6 md:p-8"
    >
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
          <Clock size={13} className="text-zinc-300" />
          Actividad Reciente
        </h3>
      </div>

      <div className="space-y-2.5">
        {logs.map(log => {
          const cfg = typeConfig[log.type || 'update'] || typeConfig.update;
          const Icon = cfg.icon;
          return (
            <div key={log.id} className="flex items-start gap-3 group">
              <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${cfg.bg}`}>
                <Icon size={13} className={cfg.text} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-zinc-600 leading-relaxed">{log.message}</p>
              </div>
              <span className="text-[10px] text-zinc-300 font-medium shrink-0 mt-0.5">{log.timestamp}</span>
            </div>
          );
        })}
      </div>

      {logs.length === 0 && (
        <p className="text-xs text-zinc-300 text-center py-8">Sin actividad reciente</p>
      )}
    </motion.div>
  );
};

export default SystemLogs;
