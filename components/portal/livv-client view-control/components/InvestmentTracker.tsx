
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
      className="bg-white rounded-2xl border border-zinc-200/60 p-6 md:p-8 h-full flex flex-col"
    >
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Resumen Financiero</h3>
        <button onClick={() => setShow(!show)} className="p-1.5 hover:bg-zinc-50 rounded-lg transition-colors">
          {show ? <EyeOff size={14} className="text-zinc-300" /> : <Eye size={14} className="text-zinc-400" />}
        </button>
      </div>

      {/* Total */}
      <div className="mb-5">
        <p className="text-[10px] text-zinc-400 font-medium mb-1">Valor total</p>
        <p className="text-3xl font-black text-zinc-900 tracking-tight">{fmt(budget.total)}</p>
      </div>

      {/* Bar */}
      <div className="mb-5">
        <div className="flex justify-between text-[10px] mb-1.5">
          <span className="text-zinc-400">Progreso de pago</span>
          <span className="font-semibold text-zinc-500">{show ? `${pct}%` : '••'}</span>
        </div>
        <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 1.5, ease: 'circOut' }}
            className="h-full bg-emerald-500 rounded-full"
          />
        </div>
      </div>

      {/* Next Payment */}
      {budget.nextPayment && (
        <div className="p-3 bg-amber-50/80 border border-amber-200/40 rounded-xl mb-4">
          <div className="flex items-center gap-1.5 mb-1">
            <CalendarClock size={11} className="text-amber-600" />
            <p className="text-[9px] font-semibold text-amber-600 uppercase tracking-wider">Pr{'\u00f3'}ximo pago</p>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[9px] text-amber-500 mb-0.5">{budget.nextPayment.concept || 'Cuota pendiente'}</p>
              <p className="text-base font-bold text-amber-800">{fmt(budget.nextPayment.amount)}</p>
            </div>
            <p className="text-[10px] font-semibold text-amber-600">{fmtDate(budget.nextPayment.dueDate)}</p>
          </div>
        </div>
      )}

      {/* Cards */}
      <div className="grid grid-cols-2 gap-2.5 mt-auto">
        <div className="p-3.5 bg-emerald-50/70 rounded-xl">
          <p className="text-[10px] text-emerald-600/60 font-medium mb-1">Pagado</p>
          <p className="text-[15px] font-bold text-emerald-700">{fmt(budget.paid)}</p>
        </div>
        <div className="p-3.5 bg-zinc-50 rounded-xl">
          <p className="text-[10px] text-zinc-400 font-medium mb-1">Pendiente</p>
          <p className="text-[15px] font-bold text-zinc-600">{fmt(remaining)}</p>
        </div>
      </div>
    </motion.div>
  );
};

export default InvestmentTracker;
