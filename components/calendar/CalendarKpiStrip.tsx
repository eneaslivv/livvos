/**
 * CalendarKpiStrip — 4 mini cards arriba del calendario que dan un
 * read-out rápido del estado de las tareas en la ventana visible:
 *   - Assigned new   : asignadas en los últimos 7 días
 *   - Active         : status='todo'/'in_progress' (no completed, no cancelled)
 *   - Cancelled      : status='cancelled' en la ventana
 *   - Overdue        : due_date < hoy y no completed/cancelled
 *
 * Diseño: pill cards full-round, divider izquierdo de color tono por kpi,
 * matching el resto del calendar header (que también se hizo full-round).
 *
 * Las cards son clickables — emiten un evento opcional onSelect(kpi) que
 * el host puede usar para filtrar la lista de tareas debajo.
 */
import React, { useMemo } from 'react';
import { Icons } from '../ui/Icons';

interface CalendarKpiStripProps {
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
  /** Opcional: callback cuando el user clickea una card para filtrar la lista. */
  onSelect?: (kpi: 'assigned_new' | 'active' | 'cancelled' | 'overdue' | null) => void;
  /** Cuál card está visualmente highlighted como filtro activo. */
  selected?: 'assigned_new' | 'active' | 'cancelled' | 'overdue' | null;
}

type KpiKey = 'assigned_new' | 'active' | 'cancelled' | 'overdue';

const TONE: Record<KpiKey, { bar: string; ico: React.ReactNode; label: string }> = {
  assigned_new: { bar: '#6DBEDC', ico: <Icons.User size={11} />,         label: 'Asignadas nuevas' },
  active:       { bar: '#C4A35A', ico: <Icons.Activity size={11} />,     label: 'Activas' },
  cancelled:    { bar: '#A8A29A', ico: <Icons.X size={11} />,            label: 'Canceladas' },
  overdue:      { bar: '#E11D48', ico: <Icons.AlertCircle size={11} />,  label: 'Demoradas' },
};

export const CalendarKpiStrip: React.FC<CalendarKpiStripProps> = ({ tasks, onSelect, selected }) => {
  const counts = useMemo(() => {
    const now = Date.now();
    const since7d = now - 7 * 86400000;
    let assignedNew = 0;
    let active = 0;
    let cancelled = 0;
    let overdue = 0;
    for (const t of tasks) {
      const isDone = t.completed === true || t.status === 'done' || t.status === 'completed';
      const isCancelled = t.status === 'cancelled' || !!t.cancelled_at;
      // Assigned new = asignada en últimos 7d (proxy: assigned_at o created_at).
      const assignedTs = t.assigned_at ? new Date(t.assigned_at).getTime()
                         : t.created_at ? new Date(t.created_at).getTime() : 0;
      if (!isDone && !isCancelled && assignedTs >= since7d) assignedNew += 1;
      // Active = no done, no cancelled.
      if (!isDone && !isCancelled) active += 1;
      // Cancelled — cualquiera con status cancelled.
      if (isCancelled) cancelled += 1;
      // Overdue = due_date pasado, no done, no cancelled.
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
      {cards.map(({ key, value }) => {
        const tone = TONE[key];
        const isActive = selected === key;
        const isClickable = !!onSelect;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect?.(isActive ? null : key)}
            disabled={!isClickable}
            className={`relative flex items-center gap-2 pl-3 pr-3.5 py-1.5 rounded-full border bg-white dark:bg-zinc-900 transition-all ${
              isActive
                ? 'border-zinc-900 dark:border-zinc-100 shadow-sm'
                : 'border-zinc-200/80 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
            } ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
            title={isClickable ? (isActive ? 'Limpiar filtro' : `Filtrar por ${tone.label.toLowerCase()}`) : tone.label}
          >
            {/* Tone bar (left edge) */}
            <span
              className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full"
              style={{ background: tone.bar }}
              aria-hidden
            />
            <span
              className="inline-flex items-center justify-center w-5 h-5 rounded-full text-zinc-700 dark:text-zinc-300"
              style={{ background: `color-mix(in oklab, ${tone.bar} 14%, transparent)`, color: tone.bar }}
            >
              {tone.ico}
            </span>
            <span className="text-[12.5px] font-mono tabular-nums font-medium text-zinc-900 dark:text-zinc-100">
              {value}
            </span>
            <span className="text-[10.5px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              {tone.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};
