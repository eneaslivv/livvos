/**
 * CalendarKpiStrip — 4 pill cards refinadas estilo editorial (Stripe /
 * Linear / Notion dashboard) sobre el calendario.
 *
 * KPIs:
 *   - Assigned new (last 7d, not done, not cancelled) — sky
 *   - Active (open + in_progress)                     — gold
 *   - Cancelled (status=cancelled)                    — stone
 *   - Overdue (due < today, open)                     — rose
 *
 * Sofisticación v2:
 *   • Número grande con Inter weight 700, letter-spacing tight
 *   • Mini sparkline 7 días debajo del label cuando aplica
 *   • Trend indicator (▲ / ▼ / —) con delta vs ventana previa
 *   • Conic-blur halo sutil en icon avatar on hover (estilo livv)
 *   • Hover lift con shadow tinted en accent color
 *   • Inner shadow sutilísima para depth
 *   • Dot separator (·) entre value y label en mono
 *   • Estado empty mantiene atenuación
 */
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Icons } from '../ui/Icons';

export type KpiKey = 'assigned_new' | 'active' | 'cancelled' | 'overdue';

export interface CalendarKpiStripProps {
  tasks: Array<{
    id: string;
    status?: string | null;
    completed?: boolean | null;
    due_date?: string | null;
    created_at?: string | null;
    cancelled_at?: string | null;
    assigned_at?: string | null;
    parent_task_id?: string | null;
  }>;
  onOpen?: (kpi: KpiKey) => void;
}

interface TonePreset {
  bar: string;
  bgGradient: string;
  haloGradient: string;
  icon: React.ReactNode;
  label: string;
}

const TONE: Record<KpiKey, TonePreset> = {
  assigned_new: {
    bar: '#6DBEDC',
    bgGradient: 'linear-gradient(135deg, rgba(109,190,220,0.10) 0%, rgba(109,190,220,0.02) 50%, transparent 100%)',
    haloGradient: 'conic-gradient(from 180deg, #6DBEDC 0deg, transparent 120deg, #6DBEDC 360deg)',
    icon: <Icons.User size={11} strokeWidth={2.2} />,
    label: 'ASIGNADAS NUEVAS',
  },
  active: {
    bar: '#C4A35A',
    bgGradient: 'linear-gradient(135deg, rgba(196,163,90,0.10) 0%, rgba(196,163,90,0.02) 50%, transparent 100%)',
    haloGradient: 'conic-gradient(from 180deg, #C4A35A 0deg, transparent 120deg, #C4A35A 360deg)',
    icon: <Icons.Activity size={11} strokeWidth={2.2} />,
    label: 'ACTIVAS',
  },
  cancelled: {
    bar: '#A8A29A',
    bgGradient: 'linear-gradient(135deg, rgba(168,162,154,0.08) 0%, rgba(168,162,154,0.02) 50%, transparent 100%)',
    haloGradient: 'conic-gradient(from 180deg, #A8A29A 0deg, transparent 120deg, #A8A29A 360deg)',
    icon: <Icons.X size={11} strokeWidth={2.2} />,
    label: 'CANCELADAS',
  },
  overdue: {
    bar: '#E11D48',
    bgGradient: 'linear-gradient(135deg, rgba(225,29,72,0.10) 0%, rgba(225,29,72,0.02) 50%, transparent 100%)',
    haloGradient: 'conic-gradient(from 180deg, #E11D48 0deg, transparent 120deg, #E11D48 360deg)',
    icon: <Icons.AlertCircle size={11} strokeWidth={2.2} />,
    label: 'DEMORADAS',
  },
};

/** Compute counts AND a per-day 7-day sparkline for context. */
function computeKpis(tasks: CalendarKpiStripProps['tasks']) {
  const now = Date.now();
  const since7d = now - 7 * 86400000;
  const since14d = now - 14 * 86400000;
  let assignedNew = 0, prevAssigned = 0;
  let active = 0;
  let cancelled = 0, prevCancelled = 0;
  let overdue = 0;
  // Sparkline: 7 buckets, one per day, count of NEW assignments per day
  const spark = [0, 0, 0, 0, 0, 0, 0];

  for (const t of tasks) {
    // Exclude subtasks from KPI counts — they shouldn't inflate the dashboard.
    // A parent task with 5 subtasks should count as 1, not 6.
    if (t.parent_task_id) continue;
    const isDone = t.completed === true || t.status === 'done' || t.status === 'completed';
    const isCancelled = t.status === 'cancelled' || !!t.cancelled_at;
    const assignedTs = t.assigned_at ? new Date(t.assigned_at).getTime()
                       : t.created_at ? new Date(t.created_at).getTime() : 0;
    const cancelTs = t.cancelled_at ? new Date(t.cancelled_at).getTime() : 0;

    // assigned new (last 7d) + previous window (7-14d) for trend
    if (!isDone && !isCancelled && assignedTs >= since7d) {
      assignedNew += 1;
      // Sparkline bucket — days since now, 0 = oldest of window
      const daysAgo = Math.floor((now - assignedTs) / 86400000);
      const bucket = 6 - Math.min(6, Math.max(0, daysAgo));
      spark[bucket] += 1;
    }
    if (!isDone && !isCancelled && assignedTs >= since14d && assignedTs < since7d) {
      prevAssigned += 1;
    }
    // active
    if (!isDone && !isCancelled) active += 1;
    // cancelled (this window + previous)
    if (isCancelled) {
      cancelled += 1;
      if (cancelTs && cancelTs >= since14d && cancelTs < since7d) prevCancelled += 1;
    }
    // overdue
    if (!isDone && !isCancelled && t.due_date) {
      const dueTs = new Date(t.due_date).getTime();
      if (!isNaN(dueTs) && dueTs < now) overdue += 1;
    }
  }

  return {
    counts: { assigned_new: assignedNew, active, cancelled, overdue },
    trends: {
      assigned_new: assignedNew - prevAssigned,
      cancelled: cancelled - prevCancelled,
    },
    spark,
  };
}

const Sparkline: React.FC<{ data: number[]; color: string }> = ({ data, color }) => {
  const max = Math.max(...data, 1);
  return (
    <svg viewBox="0 0 60 12" width="60" height="12" className="overflow-visible">
      {data.map((v, i) => {
        const h = Math.max(1.5, (v / max) * 10);
        const x = i * 9 + 1;
        const y = 11 - h;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width="6"
            height={h}
            rx="1"
            fill={color}
            opacity={v === 0 ? 0.18 : 0.45 + (v / max) * 0.55}
          />
        );
      })}
    </svg>
  );
};

const TrendBadge: React.FC<{ delta: number; tone: 'green' | 'red' | 'neutral' }> = ({ delta, tone }) => {
  if (delta === 0) return null;
  const sign = delta > 0 ? '+' : '';
  const color = tone === 'green'
    ? 'text-emerald-600 dark:text-emerald-400'
    : tone === 'red'
    ? 'text-rose-600 dark:text-rose-400'
    : 'text-zinc-500';
  const arrow = delta > 0 ? '▲' : '▼';
  return (
    <span className={`inline-flex items-center gap-0.5 text-[9.5px] font-mono tabular-nums leading-none ${color}`}>
      <span className="text-[7.5px]">{arrow}</span>
      {sign}{delta}
    </span>
  );
};

export const CalendarKpiStrip: React.FC<CalendarKpiStripProps> = ({ tasks, onOpen }) => {
  const { counts, trends, spark } = useMemo(() => computeKpis(tasks), [tasks]);

  const cards: Array<{ key: KpiKey; value: number; delta?: number; deltaTone?: 'green' | 'red' | 'neutral'; sparkline?: number[] }> = [
    {
      key: 'assigned_new',
      value: counts.assigned_new,
      delta: trends.assigned_new,
      // Más asignaciones = más volumen entrante = "buena señal" si volumen entrante es bueno
      deltaTone: trends.assigned_new >= 0 ? 'green' : 'neutral',
      sparkline: spark,
    },
    {
      key: 'active',
      value: counts.active,
    },
    {
      key: 'cancelled',
      value: counts.cancelled,
      delta: trends.cancelled,
      // Más cancelaciones = mala señal
      deltaTone: trends.cancelled > 0 ? 'red' : trends.cancelled < 0 ? 'green' : 'neutral',
    },
    {
      key: 'overdue',
      value: counts.overdue,
      // Cualquier overdue > 0 es señal roja
      deltaTone: counts.overdue > 0 ? 'red' : 'neutral',
    },
  ];

  return (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      {cards.map(({ key, value, delta, deltaTone, sparkline }, idx) => {
        const tone = TONE[key];
        const isEmpty = value === 0;
        const isClickable = !!onOpen && !isEmpty;
        const isUrgent = key === 'overdue' && value > 0;
        return (
          <motion.button
            key={key}
            type="button"
            onClick={() => isClickable && onOpen?.(key)}
            disabled={!isClickable}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: idx * 0.04, ease: [0.16, 1, 0.3, 1] }}
            whileHover={isClickable ? { y: -1.5, transition: { duration: 0.15 } } : undefined}
            whileTap={isClickable ? { scale: 0.98, transition: { duration: 0.08 } } : undefined}
            className={`group relative isolate flex items-center gap-2.5 pl-3 pr-3.5 py-2 rounded-full bg-white dark:bg-zinc-900 transition-[box-shadow,border-color] duration-200 ${
              isEmpty
                ? 'opacity-55 border border-zinc-200/60 dark:border-zinc-800/60'
                : 'border border-zinc-200/70 dark:border-zinc-800'
            } ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
            style={{
              boxShadow: isEmpty
                ? 'none'
                : `inset 0 1px 0 rgba(255,255,255,0.6), 0 1px 2px rgba(0,0,0,0.025)`,
              backgroundImage: isEmpty ? undefined : tone.bgGradient,
            }}
            title={isClickable ? `Ver ${value} ${tone.label.toLowerCase()}` : tone.label.toLowerCase()}
          >
            {/* Hover halo — conic gradient blur en accent. Sutil pero premium. */}
            {isClickable && (
              <span
                aria-hidden
                className="absolute -inset-px rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none -z-10"
                style={{
                  background: tone.haloGradient,
                  filter: 'blur(8px)',
                  opacity: 0,
                }}
              />
            )}

            {/* Outer ring on hover — sutil accent */}
            <span
              className={`absolute inset-0 rounded-full pointer-events-none transition-opacity duration-200 ${
                isClickable ? 'opacity-0 group-hover:opacity-100' : 'opacity-0'
              }`}
              style={{ boxShadow: `0 0 0 1px color-mix(in oklab, ${tone.bar} 30%, transparent), 0 6px 14px -4px color-mix(in oklab, ${tone.bar} 25%, transparent)` }}
              aria-hidden
            />

            {/* Tone bar — más sutil, integrado al avatar */}
            <span
              className="relative inline-flex items-center justify-center w-5 h-5 rounded-full transition-transform group-hover:scale-105"
              style={{
                background: isEmpty
                  ? 'rgba(161,161,170,0.08)'
                  : `color-mix(in oklab, ${tone.bar} 14%, transparent)`,
                color: isEmpty ? '#a1a1aa' : tone.bar,
                boxShadow: isEmpty
                  ? 'none'
                  : `inset 0 0 0 1px color-mix(in oklab, ${tone.bar} 24%, transparent)`,
              }}
            >
              {/* Pulse ring solo si es urgent y count > 0 */}
              {isUrgent && (
                <span
                  className="absolute inset-0 rounded-full animate-ping"
                  style={{
                    background: tone.bar,
                    opacity: 0.35,
                    animationDuration: '2.4s',
                  }}
                  aria-hidden
                />
              )}
              <span className="relative">{tone.icon}</span>
            </span>

            {/* Value — Inter weight 700, tighter tracking */}
            <span
              className={`text-[14px] font-semibold tabular-nums leading-none ${
                isEmpty ? 'text-zinc-400 dark:text-zinc-600' : 'text-zinc-900 dark:text-zinc-50'
              }`}
              style={{ letterSpacing: '-0.02em' }}
            >
              {value}
            </span>

            {/* Dot separator — sutil */}
            <span
              className={`text-[10px] leading-none -mx-0.5 ${
                isEmpty ? 'text-zinc-300 dark:text-zinc-700' : 'text-zinc-300 dark:text-zinc-600'
              }`}
              aria-hidden
            >
              ·
            </span>

            {/* Label — caps, tracking más ancho, weight más liviano */}
            <span
              className={`text-[9.5px] font-medium uppercase tracking-[0.14em] leading-none ${
                isEmpty ? 'text-zinc-400 dark:text-zinc-600' : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {tone.label}
            </span>

            {/* Sparkline 7d — sólo para assigned_new si hay data */}
            {sparkline && !isEmpty && (
              <span className="ml-1 opacity-70 group-hover:opacity-100 transition-opacity" aria-hidden>
                <Sparkline data={sparkline} color={tone.bar} />
              </span>
            )}

            {/* Trend badge */}
            {delta != null && delta !== 0 && deltaTone && !isEmpty && (
              <TrendBadge delta={delta} tone={deltaTone} />
            )}

            {/* Chevron hint — más sutil que antes */}
            {isClickable && (
              <span
                className="ml-0.5 -mr-1 opacity-0 group-hover:opacity-60 -translate-x-1 group-hover:translate-x-0 transition-all duration-200 leading-none"
                style={{ color: tone.bar }}
                aria-hidden
              >
                <Icons.ChevronRight size={10} strokeWidth={2.2} />
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
};
