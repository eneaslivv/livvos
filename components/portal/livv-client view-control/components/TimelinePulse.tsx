
import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Clock, CalendarDays, AlertCircle, CreditCard } from 'lucide-react';
import { DashboardData } from '../types';

const TimelinePulse: React.FC<{ data: DashboardData }> = ({ data }) => {
  const eta = new Date(data.etaDate);
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((eta.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  const nextPay = data.budget.nextPayment;

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
      className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 p-6 md:p-8 h-full flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Project Progress</h3>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold ${data.onTrack ? 'bg-[#2C0405]/5 dark:bg-[#822b2e]/20 text-[#2C0405] dark:text-[#e8a0a2]' : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'}`}>
          <div className={`w-1.5 h-1.5 rounded-full ${data.onTrack ? 'bg-[#2C0405] dark:bg-[#e8a0a2]' : 'bg-amber-400'}`} />
          {data.onTrack ? 'On Track' : 'Delayed'}
        </div>
      </div>

      {/* Progress number + days */}
      <div className="flex items-end justify-between mb-4">
        <div>
          <p className="text-5xl font-black text-zinc-900 dark:text-zinc-50 tracking-tight leading-none">{data.progress}<span className="text-2xl text-zinc-300 dark:text-zinc-600">%</span></p>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1.5">completed</p>
        </div>
        {data.progress >= 100 ? (
          <div className="flex items-center gap-2 text-[#2C0405] dark:text-[#e8a0a2] bg-[#2C0405]/5 dark:bg-[#822b2e]/20 px-3 py-1.5 rounded-lg">
            <CheckCircle2 size={16} />
            <span className="text-xs font-semibold">Completed</span>
          </div>
        ) : (
          <div className="text-right">
            <p className="text-3xl font-black text-zinc-800 dark:text-zinc-200 leading-none">{daysLeft}</p>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">days left</p>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div className="relative h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden mb-6">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(data.progress, 100)}%` }}
          transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
          className={`absolute top-0 left-0 h-full rounded-full ${data.progress >= 100 ? 'bg-[#2C0405]' : 'bg-indigo-500'}`}
        />
      </div>

      {/* Dates Row */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl">
          <div className="flex items-center gap-1.5 mb-1.5">
            <CalendarDays size={12} className="text-zinc-300 dark:text-zinc-600" />
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium uppercase tracking-wide">Start</p>
          </div>
          <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{data.startDate}</p>
        </div>
        <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Clock size={12} className="text-zinc-300 dark:text-zinc-600" />
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium uppercase tracking-wide">Estimated Delivery</p>
          </div>
          <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">{data.etaDate}</p>
        </div>
      </div>

      {/* Next Payment Alert */}
      {nextPay && (
        <div className="mt-auto p-3.5 bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/50 dark:border-amber-800/40 rounded-xl flex items-center gap-3">
          <div className="p-2 bg-amber-100 dark:bg-amber-900/40 rounded-lg shrink-0">
            <CreditCard size={15} className="text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-200">Next payment: ${nextPay.amount.toLocaleString()}</p>
            <p className="text-[10px] text-amber-600/70 dark:text-amber-400/70 mt-0.5">{nextPay.concept} · Due {nextPay.dueDate}</p>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default TimelinePulse;
