import React from 'react';
import { motion } from 'framer-motion';
import { Icons } from '../ui/Icons';
import { ClientHistory } from '../../hooks/useClients';

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—';
  const date = new Date(d + (d.includes('T') ? '' : 'T00:00:00'));
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
};

const historyIcons: Record<string, React.ElementType> = {
  call: Icons.Phone || Icons.Activity,
  meeting: Icons.Users,
  email: Icons.Mail || Icons.Message,
  note: Icons.Docs || Icons.Activity,
  status_change: Icons.Activity,
  task_created: Icons.CheckCircle,
  payment: Icons.DollarSign || Icons.Activity,
};

interface ClientHistoryTabProps {
  history: ClientHistory[];
}

export const ClientHistoryTab: React.FC<ClientHistoryTabProps> = ({ history }) => {
  return (
    <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
      {history.length > 0 ? (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[17px] top-4 bottom-4 w-px bg-zinc-100 dark:bg-zinc-800" />
          <div className="space-y-0.5">
            {history.map((entry) => {
              const HIcon = historyIcons[entry.action_type] || Icons.Activity;
              return (
                <div key={entry.id} className="flex items-start gap-3 p-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors relative">
                  <div className="w-7 h-7 rounded-full bg-white dark:bg-zinc-900 border-2 border-zinc-100 dark:border-zinc-800 flex items-center justify-center shrink-0 z-10">
                    <HIcon size={11} className="text-zinc-400" />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{entry.user_name}</span>
                      {' '}{entry.action_description}
                    </p>
                    <p className="text-[10px] text-zinc-400 mt-0.5">
                      {fmtDate(entry.action_date)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-3">
            <Icons.Clock size={18} className="text-zinc-400" />
          </div>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">No history</p>
          <p className="text-[10px] text-zinc-400 mt-0.5">Actions will appear here</p>
        </div>
      )}
    </motion.div>
  );
};
