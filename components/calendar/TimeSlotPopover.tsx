import React, { useRef, useEffect } from 'react';
import { Icons } from '../ui/Icons';

interface TimeSlotPopoverProps {
  x: number;
  y: number;
  date: string;
  hour: number;
  mode: 'schedule' | 'content';
  onSelect: (type: 'event' | 'task' | 'block' | 'content') => void;
  onClose: () => void;
}

export const TimeSlotPopover: React.FC<TimeSlotPopoverProps> = ({
  x, y, date, hour, mode, onSelect, onClose
}) => {
  const ref = useRef<HTMLDivElement>(null);

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

  const formattedTime = `${hour.toString().padStart(2, '0')}:00`;

  const scheduleOptions = [
    { type: 'event' as const, label: 'Evento', icon: Icons.Calendar, color: 'text-blue-600 dark:text-blue-400' },
    { type: 'task' as const, label: 'Tarea', icon: Icons.Check, color: 'text-zinc-700 dark:text-zinc-300' },
    { type: 'block' as const, label: 'Bloque de trabajo', icon: Icons.Clock, color: 'text-purple-600 dark:text-purple-400' },
  ];

  const contentOptions = [
    { type: 'content' as const, label: 'Nuevo Contenido', icon: Icons.Calendar, color: 'text-emerald-600 dark:text-emerald-400' },
  ];

  const options = mode === 'content' ? contentOptions : scheduleOptions;

  // Clamp position so popover stays within viewport
  const left = Math.min(x, window.innerWidth - 230);
  const top = Math.min(y, window.innerHeight - (options.length * 40 + 50));

  return (
    <div
      ref={ref}
      className="fixed z-[60] bg-white dark:bg-zinc-800 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 py-1.5 w-52 animate-in fade-in zoom-in-95 duration-150"
      style={{ left, top }}
    >
      <div className="px-3 py-1.5 text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-700 mb-1">
        {formattedTime} &middot; Crear
      </div>
      {options.map((opt) => (
        <button
          key={opt.type}
          onClick={() => onSelect(opt.type)}
          className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors text-left"
        >
          <opt.icon size={16} className={opt.color} />
          <span className="text-zinc-800 dark:text-zinc-200">{opt.label}</span>
        </button>
      ))}
    </div>
  );
};
