/**
 * ExpensesPipeline — kanban view for the Gastos tab. Mirrors the
 * IncomesPipeline structure but adapted to the expense data model
 * (only 2 statuses: pending / paid).
 *
 * Layout: 4-stat KPI bar + 3 columns (Pending / Recurring due / Paid)
 *   • "Pending" + "Paid" are the real status columns.
 *   • "Recurring due" surfaces recurring expenses whose next renewal
 *     window opens this month — pulled from the same `recurring`
 *     flag the expense form already sets. This makes the kanban
 *     useful for a finance owner who wants to see "what's about to
 *     auto-bill?" not just past activity.
 *
 * Strictly additive — sits next to the existing LivvExpenseTab as a
 * view-mode toggle inside the Gastos tab.
 */
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Icons } from '../ui/Icons';
import { SPRING_TAP } from '../../lib/ui/motion';
import type { ExpenseEntry } from '../../context/FinanceContext';

interface ExpensesPipelineProps {
  expenses: ExpenseEntry[];
  totalPaidExpense: number;
  totalPendingExpense: number;
  onOpenExpense: (e: ExpenseEntry) => void;
  onAddExpense?: (status?: ExpenseEntry['status']) => void;
  fmtCurrency?: (n: number) => string;
}

type StageId = 'pending' | 'recurring' | 'paid';

const STAGES: Array<{ id: StageId; label: string; tone: string; markerCls: string }> = [
  { id: 'pending',   label: 'Pending',       tone: 'amber',   markerCls: 'bg-amber-500   shadow-[0_0_6px_rgba(245,158,11,0.5)]' },
  { id: 'recurring', label: 'Recurring due', tone: 'violet',  markerCls: 'bg-violet-500  shadow-[0_0_6px_rgba(139,92,246,0.5)]' },
  { id: 'paid',      label: 'Paid',          tone: 'emerald', markerCls: 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]' },
];

const TONE_COL: Record<StageId, string> = {
  pending:   'border-amber-200/30   dark:border-amber-500/15   bg-amber-50/30   dark:bg-amber-500/[0.03]',
  recurring: 'border-violet-200/30  dark:border-violet-500/15  bg-violet-50/30  dark:bg-violet-500/[0.03]',
  paid:      'border-emerald-200/30 dark:border-emerald-500/15 bg-emerald-50/30 dark:bg-emerald-500/[0.03]',
};

const TONE_ACCENT_BAR: Record<StageId, string> = {
  pending:   'bg-amber-500',
  recurring: 'bg-violet-500',
  paid:      'bg-emerald-500',
};

const CATEGORY_TONE: Record<string, string> = {
  Software:     'text-violet-600 dark:text-violet-300 bg-violet-50 dark:bg-violet-500/15',
  Talent:       'text-blue-600   dark:text-blue-300   bg-blue-50   dark:bg-blue-500/15',
  Marketing:    'text-rose-600   dark:text-rose-300   bg-rose-50   dark:bg-rose-500/15',
  Operations:   'text-amber-600  dark:text-amber-300  bg-amber-50  dark:bg-amber-500/15',
  Legal:        'text-zinc-600   dark:text-zinc-300   bg-zinc-100  dark:bg-zinc-800',
};

const defaultFmt = (n: number) => `$${(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const fmtCompact = (n: number) => {
  const v = Math.abs(n || 0);
  if (v >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (v >= 1_000)     return `$${(n / 1_000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}K`;
  return `$${Math.round(n)}`;
};
const monthKeyOf = (iso: string | null | undefined) => iso ? iso.slice(0, 7) : null;

// ── Stats bar ─────────────────────────────────────────────────────
const StatsBar: React.FC<{
  expenses: ExpenseEntry[];
  paid: number;
  pending: number;
  fmt: (n: number) => string;
}> = ({ expenses, paid, pending, fmt }) => {

  // Last 8 months bins for 4 spark series.
  const series = useMemo(() => {
    const today = new Date();
    const months: string[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push(d.toISOString().slice(0, 7));
    }
    const totalByMonth     = new Map<string, number>(months.map(m => [m, 0]));
    const paidByMonth      = new Map<string, number>(months.map(m => [m, 0]));
    const pendingByMonth   = new Map<string, number>(months.map(m => [m, 0]));
    const recurringByMonth = new Map<string, number>(months.map(m => [m, 0]));
    for (const e of expenses) {
      const m = monthKeyOf(e.date);
      if (!m || !totalByMonth.has(m)) continue;
      totalByMonth.set(m, (totalByMonth.get(m) || 0) + (e.amount || 0));
      if (e.status === 'paid')    paidByMonth.set(m, (paidByMonth.get(m) || 0) + (e.amount || 0));
      if (e.status === 'pending') pendingByMonth.set(m, (pendingByMonth.get(m) || 0) + (e.amount || 0));
      if (e.recurring)            recurringByMonth.set(m, (recurringByMonth.get(m) || 0) + (e.amount || 0));
    }
    return {
      months,
      total:     months.map(m => totalByMonth.get(m)     || 0),
      paid:      months.map(m => paidByMonth.get(m)      || 0),
      pending:   months.map(m => pendingByMonth.get(m)   || 0),
      recurring: months.map(m => recurringByMonth.get(m) || 0),
    };
  }, [expenses]);

  const monthlyBurn = series.total[series.total.length - 1] || 0;
  const recurringTotal = expenses.filter(e => e.recurring).reduce((s, e) => s + (e.amount || 0), 0);

  const deltaFor = (arr: number[]) => {
    const last = arr[arr.length - 1] || 0;
    const prior = arr[arr.length - 2] || 0;
    if (prior === 0 && last === 0) return { dir: 'flat' as const, label: '±0' };
    if (prior === 0) return { dir: 'up' as const, label: '+new' };
    const pct = Math.round(((last - prior) / prior) * 100);
    if (pct >= 5)  return { dir: 'up' as const,   label: `+${pct}%` };
    if (pct <= -5) return { dir: 'down' as const, label: `${pct}%` };
    return { dir: 'flat' as const, label: '±0' };
  };

  const tiles = [
    { label: 'Monthly burn',       icon: 'TrendingDown', value: fmt(monthlyBurn), spark: series.total,     delta: deltaFor(series.total),     tone: 'zinc'    },
    { label: 'Paid · period',      icon: 'CheckCircle',  value: fmt(paid),        spark: series.paid,      delta: deltaFor(series.paid),      tone: 'emerald' },
    { label: 'Pending value',      icon: 'Clock',        value: fmt(pending),     spark: series.pending,   delta: deltaFor(series.pending),   tone: 'amber'   },
    { label: 'Recurring · total',  icon: 'RefreshCw',    value: fmt(recurringTotal), spark: series.recurring, delta: deltaFor(series.recurring), tone: 'violet'  },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
      {tiles.map((t, i) => {
        const max = Math.max(1, ...t.spark);
        const IconCmp = (Icons as any)[t.icon] || Icons.Sparkles;
        const deltaCls =
          t.delta.dir === 'up'   ? 'text-rose-600 dark:text-rose-400' /* expense growth = bad */ :
          t.delta.dir === 'down' ? 'text-emerald-600 dark:text-emerald-400' :
                                   'text-zinc-400';
        const barTone =
          t.tone === 'emerald' ? 'bg-emerald-400' :
          t.tone === 'amber'   ? 'bg-amber-400'   :
          t.tone === 'violet'  ? 'bg-violet-400'  :
                                 'bg-zinc-400';
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, type: 'spring', stiffness: 320, damping: 26 }}
            className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3.5 py-3"
          >
            <div className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-400 mb-1.5">
              <IconCmp size={10} />
              {t.label}
            </div>
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <span className="text-[22px] font-light text-zinc-900 dark:text-zinc-100 tracking-[-0.04em] tabular-nums">
                {t.value}
              </span>
              <span className={`text-[10.5px] font-mono tabular-nums ${deltaCls}`}>
                {t.delta.dir === 'up' ? '↑' : t.delta.dir === 'down' ? '↓' : '→'} {t.delta.label}
              </span>
            </div>
            <div className="flex items-end justify-between gap-0.5 h-6">
              {t.spark.map((v, j) => {
                const ratio = max ? v / max : 0;
                const isPeak = j === t.spark.length - 1;
                return (
                  <span
                    key={j}
                    className={`flex-1 rounded-sm ${isPeak ? barTone : `${barTone} opacity-40`}`}
                    style={{ height: `${Math.max(8, ratio * 100)}%` }}
                  />
                );
              })}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};

// ── Expense card ──────────────────────────────────────────────────
const ExpenseCard: React.FC<{
  expense: ExpenseEntry;
  stage: StageId;
  onOpen: (e: ExpenseEntry) => void;
  fmt: (n: number) => string;
}> = ({ expense, stage, onOpen, fmt }) => {
  const cat = expense.category || 'Other';
  const catCls = CATEGORY_TONE[cat] || 'text-zinc-600 bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-300';
  const dateLabel = (() => {
    if (!expense.date) return null;
    const d = new Date(expense.date + 'T12:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    if (diff > 1 && diff <= 7)  return `In ${diff}d`;
    if (diff < 0 && diff >= -7) return `${Math.abs(diff)}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  })();

  return (
    <motion.button
      type="button"
      onClick={() => onOpen(expense)}
      whileTap={{ scale: 0.985, transition: SPRING_TAP }}
      whileHover={{ y: -1, transition: SPRING_TAP }}
      className="relative w-full text-left px-3 py-2.5 rounded-[10px] border border-zinc-200/70 dark:border-zinc-700/60 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
    >
      <span className={`absolute left-0 top-3 bottom-3 w-[2px] rounded-r ${TONE_ACCENT_BAR[stage]} opacity-80`} />
      {/* Vendor + concept */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate tracking-[-0.005em]">
            {expense.vendor || expense.concept || '(no vendor)'}
          </div>
          <div className="text-[11.5px] text-zinc-500 dark:text-zinc-400 truncate">
            {expense.concept}{expense.project_name ? ` · ${expense.project_name}` : ''}
          </div>
        </div>
        {expense.recurring && (
          <span title="Recurring" className="shrink-0 text-violet-500">
            <Icons.RefreshCw size={11} />
          </span>
        )}
      </div>
      {/* Amount */}
      <div className="flex items-baseline gap-2 px-2.5 py-1.5 rounded-md bg-zinc-50/80 dark:bg-zinc-800/40 my-2">
        <span className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100 tabular-nums tracking-[-0.005em]">
          {fmt(expense.amount || 0)}
        </span>
        <span className="text-[10.5px] font-mono text-zinc-400">{expense.currency || 'USD'}</span>
      </div>
      {/* Footer */}
      <div className="flex items-center gap-2 text-[10.5px]">
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded font-mono text-[9.5px] uppercase tracking-wider ${catCls}`}>
          {cat}
        </span>
        {dateLabel && (
          <span className="ml-auto inline-flex items-center gap-1 font-mono text-zinc-500 dark:text-zinc-400">
            <Icons.Clock size={9} />
            {dateLabel}
          </span>
        )}
      </div>
    </motion.button>
  );
};

// ── Main board ────────────────────────────────────────────────────
export const ExpensesPipeline: React.FC<ExpensesPipelineProps> = ({
  expenses,
  totalPaidExpense,
  totalPendingExpense,
  onOpenExpense,
  onAddExpense,
  fmtCurrency,
}) => {
  const fmt = fmtCurrency || defaultFmt;

  // Group: pending (status='pending' AND not flagged as recurring-due),
  // recurring (status='pending' AND recurring=true OR pending recurring
  // with date in next 14 days), paid.
  const grouped = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const map: Record<StageId, ExpenseEntry[]> = { pending: [], recurring: [], paid: [] };
    for (const e of expenses) {
      if (e.status === 'paid') {
        map.paid.push(e);
        continue;
      }
      // Status pending: route recurring ones to the dedicated column
      // so the owner sees what's about to auto-bill at a glance.
      if (e.recurring) {
        map.recurring.push(e);
      } else {
        map.pending.push(e);
      }
    }
    // Sort: pending + recurring by upcoming date; paid by date desc.
    map.pending.sort((a, b) => (a.date || '￿').localeCompare(b.date || '￿'));
    map.recurring.sort((a, b) => (a.date || '￿').localeCompare(b.date || '￿'));
    map.paid.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return map;
  }, [expenses]);

  return (
    <div>
      <StatsBar
        expenses={expenses}
        paid={totalPaidExpense}
        pending={totalPendingExpense}
        fmt={fmt}
      />

      <div className="flex gap-3 pb-4 overflow-x-auto -mx-2 px-2">
        {STAGES.map(stage => {
          const items = grouped[stage.id];
          const colTotal = items.reduce((s, e) => s + (e.amount || 0), 0);
          return (
            <section
              key={stage.id}
              className={`flex-shrink-0 w-[320px] flex flex-col rounded-xl border ${TONE_COL[stage.id]} min-h-[200px] max-h-[calc(100vh-380px)] overflow-hidden`}
            >
              <header className="flex items-center gap-2 px-3.5 py-3 border-b border-dashed border-zinc-200/60 dark:border-zinc-700/40">
                <span className={`w-1.5 h-1.5 rounded-sm ${stage.markerCls}`} />
                <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-300 font-medium">
                  {stage.label}
                </span>
                <span className="ml-auto inline-flex items-center gap-1.5">
                  <span className="font-mono text-[10px] text-zinc-600 dark:text-zinc-300 bg-white dark:bg-zinc-900 px-1.5 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-700">
                    {items.length}
                  </span>
                  {onAddExpense && (
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.94, transition: SPRING_TAP }}
                      onClick={(e) => { e.stopPropagation(); onAddExpense(stage.id === 'paid' ? 'paid' : 'pending'); }}
                      title={`Add to ${stage.label}`}
                      className="w-5 h-5 rounded-md flex items-center justify-center text-zinc-400 hover:bg-white dark:hover:bg-zinc-900 hover:text-zinc-700 dark:hover:text-zinc-200"
                    >
                      <Icons.Plus size={11} />
                    </motion.button>
                  )}
                </span>
              </header>
              <div className="flex items-center justify-between px-3.5 pt-2 pb-2.5 border-b border-dashed border-zinc-200/40 dark:border-zinc-700/30">
                <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-400">Value</span>
                <strong className="text-[12.5px] font-medium text-zinc-800 dark:text-zinc-100 tabular-nums">
                  {fmtCompact(colTotal)}
                </strong>
              </div>
              <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
                {items.length === 0 ? (
                  <div className="text-center py-6 text-[10.5px] text-zinc-400 italic font-mono">empty</div>
                ) : (
                  items.map(e => (
                    <ExpenseCard
                      key={e.id}
                      expense={e}
                      stage={stage.id}
                      onOpen={onOpenExpense}
                      fmt={fmt}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};
