
import React from 'react';
import { motion } from 'framer-motion';
import { Activity, CheckCircle2, CreditCard, Package, MessageSquare, Clock } from 'lucide-react';
import { LogEntry } from '../types';

const typeConfig: Record<string, { icon: React.ElementType; bg: string; text: string }> = {
  milestone: { icon: CheckCircle2, bg: 'bg-[#2C0405]/5 dark:bg-[#822b2e]/20', text: 'text-[#2C0405] dark:text-[#e8a0a2]' },
  payment: { icon: CreditCard, bg: 'bg-blue-50 dark:bg-blue-950/40', text: 'text-blue-500 dark:text-blue-400' },
  delivery: { icon: Package, bg: 'bg-indigo-50 dark:bg-indigo-950/40', text: 'text-indigo-500 dark:text-indigo-400' },
  review: { icon: MessageSquare, bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-500 dark:text-amber-400' },
  update: { icon: Activity, bg: 'bg-zinc-50 dark:bg-zinc-800', text: 'text-zinc-400 dark:text-zinc-500' },
};

const SystemLogs: React.FC<{ logs: LogEntry[] }> = ({ logs }) => {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
      className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 p-6 md:p-8"
    >
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider flex items-center gap-2">
          <Clock size={13} className="text-zinc-300 dark:text-zinc-600" />
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
                <p className="text-[12px] text-zinc-600 dark:text-zinc-300 leading-relaxed">{log.message}</p>
              </div>
              <span className="text-[10px] text-zinc-300 dark:text-zinc-600 font-medium shrink-0 mt-0.5">{log.timestamp}</span>
            </div>
          );
        })}
      </div>

      {logs.length === 0 && (
        <p className="text-xs text-zinc-300 dark:text-zinc-600 text-center py-8">Sin actividad reciente</p>
      )}
    </motion.div>
  );
};

export default SystemLogs;
