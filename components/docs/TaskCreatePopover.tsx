import React, { useEffect, useRef, useState } from 'react';
import { Icons } from '../ui/Icons';

interface Props {
  coords: { left: number; top: number; bottom: number };
  defaultTitle?: string;
  onSubmit: (data: { title: string; date: string | null }) => void;
  onCancel: () => void;
}

const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const tomorrowISO = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const TaskCreatePopover: React.FC<Props> = ({ coords, defaultTitle = '', onSubmit, onCancel }) => {
  const [title, setTitle] = useState(defaultTitle);
  const [date, setDate] = useState<string>(todayISO());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = () => {
    if (!title.trim()) return;
    onSubmit({ title: title.trim(), date: date || null });
  };

  return (
    <div
      className="fixed z-[60] w-80 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl p-3"
      style={{ left: coords.left, top: coords.bottom + 6 }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 mb-2.5">
        <div className="w-6 h-6 rounded-md bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
          <Icons.SquareCheck size={13} />
        </div>
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Nueva tarea</span>
        <button
          onClick={onCancel}
          className="ml-auto p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400"
        >
          <Icons.Close size={12} />
        </button>
      </div>

      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
          else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
        placeholder="Título de la tarea..."
        className="w-full px-2.5 py-1.5 text-sm bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none focus:border-blue-400"
      />

      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setDate(todayISO())}
          className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${
            date === todayISO()
              ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-300 dark:border-blue-500/30 text-blue-700 dark:text-blue-400'
              : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
          }`}
        >Hoy</button>
        <button
          type="button"
          onClick={() => setDate(tomorrowISO())}
          className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${
            date === tomorrowISO()
              ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-300 dark:border-blue-500/30 text-blue-700 dark:text-blue-400'
              : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
          }`}
        >Mañana</button>
        <button
          type="button"
          onClick={() => setDate('')}
          className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${
            !date
              ? 'bg-zinc-200 dark:bg-zinc-700 border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300'
              : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
          }`}
        >Sin fecha</button>
      </div>

      <input
        type="date"
        value={date}
        onChange={e => setDate(e.target.value)}
        className="mt-2 w-full px-2.5 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-700 dark:text-zinc-300 outline-none focus:border-blue-400"
      />

      <div className="mt-3 flex justify-end gap-1.5">
        <button
          onClick={onCancel}
          className="px-2.5 py-1 rounded-md text-[11px] font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >Cancelar</button>
        <button
          onClick={submit}
          disabled={!title.trim()}
          className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white"
        >Crear tarea</button>
      </div>

      <p className="mt-2 text-[10px] text-zinc-400">
        Aparecerá en el calendario {date ? `el ${date}` : 'sin fecha'} y como checkbox en este doc.
      </p>
    </div>
  );
};
