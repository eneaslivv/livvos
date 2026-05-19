/**
 * IncomesPipeline — kanban view for the Ingresos tab, modeled after the
 * LIVV OS Sales Pipeline design (inicio-web-dash-livv/livv-os-pipeline.jsx).
 *
 * 4 columns (Pending / Partial / Overdue / Paid), each card = one
 * income/invoice with client + project + amount + due date + installment
 * progress. Top stats bar with 4 KPI tiles + sparklines tracking the last
 * 8 months. Click any card → opens the existing edit flow (no logic
 * duplication — we wire to the same handlers as the list view).
 *
 * This is ADDITIVE — sits next to the existing LivvIncomeTab as a
 * view-mode toggle inside the Ingresos tab.
 */
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Icons } from '../ui/Icons';
import { SPRING_TAP } from '../../lib/ui/motion';
import type { IncomeEntry } from '../../context/FinanceContext';

interface IncomesPipelineProps {
  incomes: IncomeEntry[];
  /** Period totals — passed in so we don't re-derive them differently
      from the list view, keeping the page-wide stats consistent. */
  totalPaidIncome: number;
  totalPendingIncome: number;
  totalOverdueIncome: number;
  onOpenIncome: (income: IncomeEntry) => void;
  onAddIncome?: (status?: IncomeEntry['status']) => void;
  /** Optional formatter — if the parent uses fmtCurrency, pass it
      through so currency display is consistent across the page. */
  fmtCurrency?: (n: number) => string;
}

type StageId = 'pending' | 'partial' | 'overdue' | 'paid';

const STAGES: Array<{ id: StageId; label: string; tone: string; markerCls: string }> = [
  { id: 'pending',  label: 'Pending',  tone: 'amber',   markerCls: 'bg-amber-500   shadow-[0_0_6px_rgba(245,158,11,0.5)]' },
  { id: 'partial',  label: 'Partial',  tone: 'sky',     markerCls: 'bg-sky-500     shadow-[0_0_6px_rgba(14,165,233,0.5)]' },
  { id: 'overdue',  label: 'Overdue',  tone: 'rose',    markerCls: 'bg-rose-500    shadow-[0_0_6px_rgba(244,63,94,0.6)]'  },
  { id: 'paid',     label: 'Paid',     tone: 'emerald', markerCls: 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]' },
];

const TONE_COL: Record<StageId, string> = {
  pending:  'border-amber-200/30   dark:border-amber-500/15   bg-amber-50/30   dark:bg-amber-500/[0.03]',
  partial:  'border-sky-200/30     dark:border-sky-500/15     bg-sky-50/30     dark:bg-sky-500/[0.03]',
  overdue:  'border-rose-200/40    dark:border-rose-500/20    bg-rose-50/40    dark:bg-rose-500/[0.04]',
  paid:     'border-emerald-200/30 dark:border-emerald-500/15 bg-emerald-50/30 dark:bg-emerald-500/[0.03]',
};

const TONE_ACCENT_BAR: Record<StageId, string> = {
  pending:  'bg-amber-500',
  partial:  'bg-sky-500',
  overdue:  'bg-rose-500',
  paid:     'bg-emerald-500',
};

const defaultFmt = (n: number) => `$${(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

// Short-form K / M for stat tiles (mirrors the design's compact numerals).
const fmtCompact = (n: number): string => {
  const v = Math.abs(n || 0);
  if (v >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (v >= 1_000)     return `$${(n / 1_000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}K`;
  return `$${Math.round(n)}`;
};

const monthKeyOf = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  return iso.slice(0, 7);
};

// ── 4-stat KPI bar — Pipeline value / Collected (month) / Pending /
//    Overdue. Each tile shows a tiny sparkline of the last 8 months. ─
const StatsBar: React.FC<{
  incomes: IncomeEntry[];
  paid: number;
  pending: number;
  overdue: number;
  fmt: (n: number) => string;
}> = ({ incomes, paid, pending, overdue, fmt }) => {

  // ── Sparkline data — last 8 months of {invoiced, collected} ──────
  // We bin invoices by month (created_at) for the "value" sparkline and
  // installments by paid_date for the "collected" sparkline. Other
  // sparklines use derived series. Kept inline so the component stays
  // self-contained and we don't drag a charting lib in for 8 bars.
  const series = useMemo(() => {
    const today = new Date();
    const months: string[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push(d.toISOString().slice(0, 7));
    }
    const valueByMonth = new Map<string, number>(months.map(m => [m, 0]));
    const collectedByMonth = new Map<string, number>(months.map(m => [m, 0]));
    const pendingByMonth = new Map<string, number>(months.map(m => [m, 0]));
    const overdueByMonth = new Map<string, number>(months.map(m => [m, 0]));
    for (const inc of incomes) {
      const m = monthKeyOf(inc.created_at);
      if (m && valueByMonth.has(m)) valueByMonth.set(m, (valueByMonth.get(m) || 0) + (inc.total_amount || 0));
      const installments = inc.installments || [];
      for (const ins of installments) {
        if (ins.status === 'paid' && ins.paid_date) {
          const km = monthKeyOf(ins.paid_date);
          if (km && collectedByMonth.has(km)) collectedByMonth.set(km, (collectedByMonth.get(km) || 0) + (ins.amount || 0));
        }
        if (ins.status === 'pending') {
          const km = monthKeyOf(ins.due_date);
          if (km && pendingByMonth.has(km)) pendingByMonth.set(km, (pendingByMonth.get(km) || 0) + (ins.amount || 0));
        }
        if (ins.status === 'overdue') {
          const km = monthKeyOf(ins.due_date);
          if (km && overdueByMonth.has(km)) overdueByMonth.set(km, (overdueByMonth.get(km) || 0) + (ins.amount || 0));
        }
      }
    }
    return {
      months,
      value:     months.map(m => valueByMonth.get(m)     || 0),
      collected: months.map(m => collectedByMonth.get(m) || 0),
      pending:   months.map(m => pendingByMonth.get(m)   || 0),
      overdue:   months.map(m => overdueByMonth.get(m)   || 0),
    };
  }, [incomes]);

  const pipelineValue = incomes.reduce((s, i) => s + (i.total_amount || 0), 0);

  // Percentage delta last vs prior — used as the up/down/flat arrow.
  const deltaFor = (arr: number[]): { dir: 'up' | 'down' | 'flat'; label: string } => {
    const last = arr[arr.length - 1] || 0;
    const prior = arr[arr.length - 2] || 0;
    if (prior === 0 && last === 0) return { dir: 'flat', label: '±0' };
    if (prior === 0) return { dir: 'up', label: '+new' };
    const pct = Math.round(((last - prior) / prior) * 100);
    if (pct >= 5)  return { dir: 'up',   label: `+${pct}%` };
    if (pct <= -5) return { dir: 'down', label: `${pct}%` };
    return { dir: 'flat', label: '±0' };
  };

  const tiles = [
    { label: 'Pipeline value',    icon: 'TrendingUp', value: fmt(pipelineValue), spark: series.value,     delta: deltaFor(series.value),     tone: 'zinc'    },
    { label: 'Collected · month', icon: 'CheckCircle',value: fmt(paid),          spark: series.collected, delta: deltaFor(series.collected), tone: 'emerald' },
    { label: 'Pending value',     icon: 'Clock',      value: fmt(pending),       spark: series.pending,   delta: deltaFor(series.pending),   tone: 'amber'   },
    { label: 'Overdue value',     icon: 'AlertCircle',value: fmt(overdue),       spark: series.overdue,   delta: deltaFor(series.overdue),   tone: 'rose'    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
      {tiles.map((t, i) => {
        const max = Math.max(1, ...t.spark);
        const IconCmp = (Icons as any)[t.icon] || Icons.Sparkles;
        const deltaCls =
          t.delta.dir === 'up'   ? 'text-emerald-600 dark:text-emerald-400' :
          t.delta.dir === 'down' ? 'text-rose-600 dark:text-rose-400' :
                                   'text-zinc-400';
        const barTone =
          t.tone === 'emerald' ? 'bg-emerald-400' :
          t.tone === 'rose'    ? 'bg-rose-400'    :
          t.tone === 'amber'   ? 'bg-amber-400'   :
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
            {/* Sparkline — 8 bars, peak (last) gets brighter tone */}
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

// ── Income card ───────────────────────────────────────────────────
const IncomeCard: React.FC<{
  income: IncomeEntry;
  stage: StageId;
  onOpen: (i: IncomeEntry) => void;
  fmt: (n: number) => string;
}> = ({ income, stage, onOpen, fmt }) => {
  const installments = income.installments || [];
  const paidCount = installments.filter(i => i.status === 'paid').length;
  const totalCount = installments.length;
  const paidAmount = installments.filter(i => i.status === 'paid').reduce((s, i) => s + (i.amount || 0), 0);
  const dueDate = income.due_date ? new Date(income.due_date + 'T12:00:00') : null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysOff = dueDate ? Math.round((dueDate.getTime() - today.getTime()) / 86400000) : null;
  const dueLabel = (() => {
    if (!dueDate) return null;
    if (daysOff === 0) return 'Today';
    if (daysOff === 1) return 'Tomorrow';
    if (daysOff === -1) return 'Yesterday';
    if (daysOff !== null && daysOff < 0)  return `${Math.abs(daysOff)}d overdue`;
    if (daysOff !== null && daysOff <= 7) return `In ${daysOff}d`;
    return dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  })();
  const overdue = stage === 'overdue';

  return (
    <motion.button
      type="button"
      onClick={() => onOpen(income)}
      whileTap={{ scale: 0.985, transition: SPRING_TAP }}
      whileHover={{ y: -1, transition: SPRING_TAP }}
      className="relative w-full text-left px-3 py-2.5 rounded-[10px] border border-zinc-200/70 dark:border-zinc-700/60 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
    >
      {/* Left accent bar */}
      <span className={`absolute left-0 top-3 bottom-3 w-[2px] rounded-r ${TONE_ACCENT_BAR[stage]} opacity-80`} />
      {/* Top row — client + amount */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate tracking-[-0.005em]">
            {income.client_name || '(no client)'}
          </div>
          <div className="text-[11.5px] text-zinc-500 dark:text-zinc-400 truncate">
            {income.project_name || income.concept || '—'}
          </div>
        </div>
        <span className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded shrink-0">
          {income.currency || 'USD'}
        </span>
      </div>
      {/* Amount */}
      <div className="flex items-baseline gap-2 px-2.5 py-1.5 rounded-md bg-zinc-50/80 dark:bg-zinc-800/40 my-2">
        <span className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100 tabular-nums tracking-[-0.005em]">
          {fmt(income.total_amount || 0)}
        </span>
        {paidAmount > 0 && stage !== 'paid' && (
          <>
            <span className="text-zinc-300 dark:text-zinc-700">·</span>
            <span className="text-[10.5px] font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
              {fmt(paidAmount)} paid
            </span>
          </>
        )}
      </div>
      {/* Footer row */}
      <div className="flex items-center gap-2 text-[10.5px]">
        {totalCount > 0 && (
          <span className="inline-flex items-center gap-1 text-zinc-500 dark:text-zinc-400 font-mono">
            <Icons.List size={9} />
            {paidCount}/{totalCount}
          </span>
        )}
        {dueLabel && (
          <span className={`ml-auto inline-flex items-center gap-1 font-mono ${overdue ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-zinc-500 dark:text-zinc-400'}`}>
            <Icons.Clock size={9} />
            {dueLabel}
          </span>
        )}
      </div>
    </motion.button>
  );
};

// ── Main board ────────────────────────────────────────────────────
export const IncomesPipeline: React.FC<IncomesPipelineProps> = ({
  incomes,
  totalPaidIncome,
  totalPendingIncome,
  totalOverdueIncome,
  onOpenIncome,
  onAddIncome,
  fmtCurrency,
}) => {
  const fmt = fmtCurrency || defaultFmt;

  // Group incomes by stage (skip rows whose status doesn't fit our 4).
  const grouped = useMemo(() => {
    const map: Record<StageId, IncomeEntry[]> = { pending: [], partial: [], overdue: [], paid: [] };
    for (const inc of incomes) {
      const s = inc.status as StageId;
      if (map[s]) map[s].push(inc);
    }
    // Sort each column: overdue first by due_date ascending, others by
    // newest first. Paid sorted by paid date (recent on top).
    for (const k of Object.keys(map) as StageId[]) {
      map[k].sort((a, b) => {
        if (k === 'overdue' || k === 'pending') {
          return (a.due_date || '￿').localeCompare(b.due_date || '￿');
        }
        return (b.created_at || '').localeCompare(a.created_at || '');
      });
    }
    return map;
  }, [incomes]);

  return (
    <div>
      {/* Stats bar */}
      <StatsBar
        incomes={incomes}
        paid={totalPaidIncome}
        pending={totalPendingIncome}
        overdue={totalOverdueIncome}
        fmt={fmt}
      />

      {/* Kanban */}
      <div className="flex gap-3 pb-4 overflow-x-auto -mx-2 px-2">
        {STAGES.map(stage => {
          const items = grouped[stage.id];
          const colTotal = items.reduce((s, i) => s + (i.total_amount || 0), 0);
          return (
            <section
              key={stage.id}
              className={`flex-shrink-0 w-[280px] flex flex-col rounded-xl border ${TONE_COL[stage.id]} min-h-[200px] max-h-[calc(100vh-380px)] overflow-hidden`}
            >
              {/* Header */}
              <header className="flex items-center gap-2 px-3.5 py-3 border-b border-dashed border-zinc-200/60 dark:border-zinc-700/40">
                <span className={`w-1.5 h-1.5 rounded-sm ${stage.markerCls}`} />
                <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-300 font-medium">
                  {stage.label}
                </span>
                <span className="ml-auto inline-flex items-center gap-1.5">
                  <span className="font-mono text-[10px] text-zinc-600 dark:text-zinc-300 bg-white dark:bg-zinc-900 px-1.5 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-700">
                    {items.length}
                  </span>
                  {onAddIncome && (
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.94, transition: SPRING_TAP }}
                      onClick={(e) => { e.stopPropagation(); onAddIncome(stage.id); }}
                      title={`Add to ${stage.label}`}
                      className="w-5 h-5 rounded-md flex items-center justify-center text-zinc-400 hover:bg-white dark:hover:bg-zinc-900 hover:text-zinc-700 dark:hover:text-zinc-200"
                    >
                      <Icons.Plus size={11} />
                    </motion.button>
                  )}
                </span>
              </header>
              {/* Total */}
              <div className="flex items-center justify-between px-3.5 pt-2 pb-2.5 border-b border-dashed border-zinc-200/40 dark:border-zinc-700/30">
                <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-400">Value</span>
                <strong className="text-[12.5px] font-medium text-zinc-800 dark:text-zinc-100 tabular-nums">
                  {fmtCompact(colTotal)}
                </strong>
              </div>
              {/* Body */}
              <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
                {items.length === 0 ? (
                  <div className="text-center py-6 text-[10.5px] text-zinc-400 italic font-mono">empty</div>
                ) : (
                  items.map(inc => (
                    <IncomeCard
                      key={inc.id}
                      income={inc}
                      stage={stage.id}
                      onOpen={onOpenIncome}
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
