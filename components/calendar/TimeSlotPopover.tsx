import React, { useRef, useEffect, useState } from 'react';
import { Icons } from '../ui/Icons';

interface TimeSlotPopoverProps {
  /** Bounding rect of the clicked cell */
  cellRect: { top: number; left: number; width: number; height: number };
  date: string;
  hour: number;
  mode: 'schedule' | 'content';
  onSelect: (type: 'event' | 'task' | 'block' | 'content') => void;
  onClose: () => void;
}

export const TimeSlotPopover: React.FC<TimeSlotPopoverProps> = ({
  cellRect, date, hour, mode, onSelect, onClose
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleScroll = () => onClose();

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  // Calculate position after first render so we know the popover's actual size
  useEffect(() => {
    if (!ref.current) return;
    const popover = ref.current;
    const popoverW = popover.offsetWidth;
    const popoverH = popover.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 6;

    // Try to place the popover to the right of the cell, vertically centered
    let left = cellRect.left + cellRect.width + pad;
    let top = cellRect.top + cellRect.height / 2 - popoverH / 2;

    // If it overflows right, place it to the left of the cell
    if (left + popoverW > vw - 8) {
      left = cellRect.left - popoverW - pad;
    }
    // If it still overflows left, center it horizontally over the cell
    if (left < 8) {
      left = cellRect.left + cellRect.width / 2 - popoverW / 2;
    }

    // Clamp vertically
    if (top < 8) top = 8;
    if (top + popoverH > vh - 8) top = vh - popoverH - 8;

    setPosition({ left, top });
  }, [cellRect]);

  const formattedTime = `${hour.toString().padStart(2, '0')}:00`;
  const endHour = `${(hour + 1).toString().padStart(2, '0')}:00`;

  const scheduleOptions = [
    { type: 'event' as const, label: 'Evento', icon: Icons.Calendar, color: 'text-blue-600 dark:text-blue-400' },
    { type: 'task' as const, label: 'Tarea', icon: Icons.Check, color: 'text-zinc-700 dark:text-zinc-300' },
    { type: 'block' as const, label: 'Bloque de trabajo', icon: Icons.Clock, color: 'text-purple-600 dark:text-purple-400' },
  ];

  const contentOptions = [
    { type: 'content' as const, label: 'Nuevo Contenido', icon: Icons.Calendar, color: 'text-emerald-600 dark:text-emerald-400' },
  ];

  const options = mode === 'content' ? contentOptions : scheduleOptions;

  // Format the date nicely
  const dateObj = new Date(date + 'T12:00:00');
  const dayName = dateObj.toLocaleDateString('es-ES', { weekday: 'short' });
  const dayNum = dateObj.getDate();
  const monthName = dateObj.toLocaleDateString('es-ES', { month: 'short' });

  return (
    <>
      {/* Highlight overlay on the clicked cell */}
      <div
        className="fixed z-[59] pointer-events-none rounded border-2 border-blue-500 bg-blue-500/10"
        style={{
          top: cellRect.top,
          left: cellRect.left,
          width: cellRect.width,
          height: cellRect.height,
        }}
      />

      {/* Popover */}
      <div
        ref={ref}
        className="fixed z-[60] bg-white dark:bg-zinc-800 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 py-1.5 w-48 animate-in fade-in zoom-in-95 duration-150"
        style={{
          left: position?.left ?? -9999,
          top: position?.top ?? -9999,
          opacity: position ? 1 : 0,
        }}
      >
        {/* Time + date header */}
        <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-700 mb-1">
          <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            {formattedTime} – {endHour}
          </div>
          <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
            {dayName} {dayNum} {monthName}
          </div>
        </div>
        {options.map((opt) => (
          <button
            key={opt.type}
            onClick={() => onSelect(opt.type)}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors text-left"
          >
            <opt.icon size={15} className={opt.color} />
            <span className="text-zinc-800 dark:text-zinc-200 text-[13px]">{opt.label}</span>
          </button>
        ))}
      </div>
    </>
  );
};
