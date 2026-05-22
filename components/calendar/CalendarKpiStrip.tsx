/**
 * CalendarKpiStrip — 4 mini cards arriba del calendario que dan un
 * read-out rápido del estado de las tareas en la ventana visible:
 *   - Assigned new   : asignadas en los últimos 7 días
 *   - Active         : status='todo'/'in_progress' (no completed, no cancelled)
 *   - Cancelled      : status='cancelled' en la ventana
 *   - Overdue        : due_date < hoy y no completed/cancelled
 *
 * Diseño: pill cards full-round con sutilezas — gradient interior tinted
 * por tono, hover lift con ring de accent, estado empty atenuado, caret
 * sutil indicando clickable. Click abre un modal de detalle con la lista
 * de tareas filtradas (CalendarKpiDetail).
 */
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Icons } from '../ui/Icons';

export type KpiKey = 'assigned_new' | 'active' | 'cancelled' | 'overdue';

export interface CalendarKpiStripProps {
  /** Las tareas de la ventana visible. Se filtran adentro por status. */
  tasks: Array<{
    id: string;
    status?: string | null;
    completed?: boolean | null;
    due_date?: string | null;
    created_at?: string | null;
    cancelled_at?: string | null;
    assigned_at?: string | null;
  }>;
  /** Click handler — abre el modal de detalle filtrado por ese kpi. */
  onOpen?: (kpi: KpiKey) => void;
}

const TONE: Record<KpiKey, { bar: string; icon: React.ReactNode; label: string; bgFrom: string }> = {
  assigned_new: { bar: '#6DBEDC', icon: <Icons.User size={11} />,         label: 'ASIGNADAS NUEVAS', bgFrom: 'rgba(109,190,220,0.05)' },
  active:       { bar: '#C4A35A', icon: <Icons.Activity size={11} />,     label: 'ACTIVAS',          bgFrom: 'rgba(196,163,90,0.05)' },
  cancelled:    { bar: '#A8A29A', icon: <Icons.X size={11} />,            label: 'CANCELADAS',       bgFrom: 'rgba(168,162,154,0.04)' },
  overdue:      { bar: '#E11D48', icon: <Icons.AlertCircle size={11} />,  label: 'DEMORADAS',        bgFrom: 'rgba(225,29,72,0.05)' },
};

export const CalendarKpiStrip: React.FC<CalendarKpiStripProps> = ({ tasks, onOpen }) => {
  const counts = useMemo(() => {
    const now = Date.now();
    const since7d = now - 7 * 86400000;
    let assignedNew = 0, active = 0, cancelled = 0, overdue = 0;
    for (const t of tasks) {
      const isDone = t.completed === true || t.status === 'done' || t.status === 'completed';
      const isCancelled = t.status === 'cancelled' || !!t.cancelled_at;
      const assignedTs = t.assigned_at ? new Date(t.assigned_at).getTime()
                         : t.created_at ? new Date(t.created_at).getTime() : 0;
      if (!isDone && !isCancelled && assignedTs >= since7d) assignedNew += 1;
      if (!isDone && !isCancelled) active += 1;
      if (isCancelled) cancelled += 1;
      if (!isDone && !isCancelled && t.due_date) {
        const dueTs = new Date(t.due_date).getTime();
        if (!isNaN(dueTs) && dueTs < now) overdue += 1;
      }
    }
    return { assigned_new: assignedNew, active, cancelled, overdue };
  }, [tasks]);

  const cards: Array<{ key: KpiKey; value: number }> = [
    { key: 'assigned_new', value: counts.assigned_new },
    { key: 'active',       value: counts.active },
    { key: 'cancelled',    value: counts.cancelled },
    { key: 'overdue',      value: counts.overdue },
  ];

  return (
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      {cards.map(({ key, value }, idx) => {
        const tone = TONE[key];
        const isEmpty = value === 0;
        const isClickable = !!onOpen && !isEmpty;
        return (
          <motion.button
            key={key}
            type="button"
            onClick={() => isClickable && onOpen?.(key)}
            disabled={!isClickable}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: idx * 0.04, ease: [0.16, 1, 0.3, 1] }}
            whileHover={isClickable ? { y: -1, transition: { duration: 0.15 } } : undefined}
            whileTap={isClickable ? { scale: 0.98, transition: { duration: 0.08 } } : undefined}
            className={`group relative flex items-center gap-2 pl-3 pr-3.5 py-1.5 rounded-full border bg-white dark:bg-zinc-900 transition-[background,border-color,box-shadow] duration-200 ${
              isEmpty
                ? 'border-zinc-200/60 dark:border-zinc-800/60 opacity-55'
                : 'border-zinc-200/80 dark:border-zinc-800 hover:shadow-sm'
            } ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
            style={{
              backgroundImage: isEmpty
                ? undefined
                : `linear-gradient(135deg, ${tone.bgFrom} 0%, transparent 60%)`,
              boxShadow: 'none',
            }}
            title={isClickable ? `Ver ${value} ${tone.label.toLowerCase()}` : tone.label.toLowerCase()}
          >
            {/* Hover ring on accent — sutil */}
            <span
              className={`absolute inset-0 rounded-full pointer-events-none transition-opacity duration-200 ${
                isClickable ? 'opacity-0 group-hover:opacity-100' : 'opacity-0'
              }`}
              style={{ boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${tone.bar} 35%, transparent)` }}
              aria-hidden
            />

            {/* Tone bar — left edge, full-height */}
            <span
              className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full transition-opacity"
              style={{
                background: tone.bar,
                opacity: isEmpty ? 0.35 : 1,
              }}
              aria-hidden
            />

            {/* Icon avatar — tinted con accent */}
            <span
              className="inline-flex items-center justify-center w-5 h-5 rounded-full transition-transform group-hover:scale-110"
              style={{
                background: isEmpty
                  ? 'rgba(161,161,170,0.10)'
                  : `color-mix(in oklab, ${tone.bar} 14%, transparent)`,
                color: isEmpty ? '#a1a1aa' : tone.bar,
              }}
            >
              {tone.icon}
            </span>

            {/* Value — bigger, tabular */}
            <span
              className={`text-[13px] font-mono tabular-nums font-semibold leading-none ${
                isEmpty ? 'text-zinc-400 dark:text-zinc-600' : 'text-zinc-900 dark:text-zinc-100'
              }`}
            >
              {value}
            </span>

            {/* Label — uppercase, micro */}
            <span
              className={`text-[10px] font-medium uppercase tracking-[0.12em] leading-none ${
                isEmpty ? 'text-zinc-400 dark:text-zinc-600' : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {tone.label}
            </span>

            {/* Subtle chevron — only when clickable, visible on hover */}
            {isClickable && (
              <span
                className="ml-0.5 -mr-1 opacity-0 group-hover:opacity-70 -translate-x-1 group-hover:translate-x-0 transition-all duration-200"
                style={{ color: tone.bar }}
                aria-hidden
              >
                <Icons.ChevronRight size={10} />
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
};
