
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, CalendarClock } from 'lucide-react';

const fmtDate = (d: string) => {
  if (!d) return '—';
  const date = new Date(d + (d.includes('T') ? '' : 'T00:00:00'));
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
};

const InvestmentTracker: React.FC<{ budget: { total: number, paid: number, nextPayment?: { amount: number; dueDate: string; concept?: string } } }> = ({ budget }) => {
  const [show, setShow] = useState(true);
  const remaining = budget.total - budget.paid;
  const pct = budget.total > 0 ? Math.round((budget.paid / budget.total) * 100) : 0;

  const fmt = (v: number) => show ? `$${v.toLocaleString()}` : '••••••';

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
      className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 p-6 md:p-8 h-full flex flex-col"
    >
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Resumen Financiero</h3>
        <button onClick={() => setShow(!show)} className="p-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg transition-colors">
          {show ? <EyeOff size={14} className="text-zinc-300 dark:text-zinc-600" /> : <Eye size={14} className="text-zinc-400 dark:text-zinc-500" />}
        </button>
      </div>

      {/* Total */}
      <div className="mb-5">
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium mb-1">Valor total</p>
        <p className="text-3xl font-black text-zinc-900 dark:text-zinc-50 tracking-tight">{fmt(budget.total)}</p>
      </div>

      {/* Bar */}
      <div className="mb-5">
        <div className="flex justify-between text-[10px] mb-1.5">
          <span className="text-zinc-400 dark:text-zinc-500">Progreso de pago</span>
          <span className="font-semibold text-zinc-500 dark:text-zinc-400">{show ? `${pct}%` : '••'}</span>
        </div>
        <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 1.5, ease: 'circOut' }}
            className="h-full bg-[#2C0405] rounded-full"
          />
        </div>
      </div>

      {/* Next Payment */}
      {budget.nextPayment && (
        <div className="p-3 bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/40 dark:border-amber-800/40 rounded-xl mb-4">
          <div className="flex items-center gap-1.5 mb-1">
            <CalendarClock size={11} className="text-amber-600 dark:text-amber-400" />
            <p className="text-[9px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Pr{'\u00f3'}ximo pago</p>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[9px] text-amber-500 dark:text-amber-400 mb-0.5">{budget.nextPayment.concept || 'Cuota pendiente'}</p>
              <p className="text-base font-bold text-amber-800 dark:text-amber-200">{fmt(budget.nextPayment.amount)}</p>
            </div>
            <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">{fmtDate(budget.nextPayment.dueDate)}</p>
          </div>
        </div>
      )}

      {/* Cards */}
      <div className="grid grid-cols-2 gap-2.5 mt-auto">
        <div className="p-3.5 bg-[#2C0405]/5 dark:bg-[#822b2e]/15 rounded-xl">
          <p className="text-[10px] text-[#2C0405]/60 dark:text-[#e8a0a2]/60 font-medium mb-1">Pagado</p>
          <p className="text-[15px] font-bold text-[#2C0405] dark:text-[#e8a0a2]">{fmt(budget.paid)}</p>
        </div>
        <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800 rounded-xl">
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium mb-1">Pendiente</p>
          <p className="text-[15px] font-bold text-zinc-600 dark:text-zinc-300">{fmt(remaining)}</p>
        </div>
      </div>
    </motion.div>
  );
};

export default InvestmentTracker;
