import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icons } from './Icons';

/**
 * PremiumSelect — fully-custom dropdown. Replaces native <select> so the
 * OS-rendered popup (with its garish system-blue highlight) never appears.
 * The trigger is a soft "chip"; the popover is a portal-positioned card
 * with rounded items, optional color dots, hover/selected states, and
 * Escape / outside-click to close. Width auto-anchors to the trigger.
 */
export type PremiumOption = {
  value: string | number;
  label: string;
  /** Tailwind color class for an inline dot, e.g. 'bg-rose-500'. Optional. */
  color?: string;
};

interface Props {
  value: string | number;
  onChange: (v: string) => void;
  options: PremiumOption[];
  /** When true, chip is content-width instead of full-row. */
  compact?: boolean;
  /** When true, renders the option's color dot in trigger + popover rows. */
  showDot?: boolean;
  /** Placeholder shown when value doesn't match any option. */
  placeholder?: string;
  className?: string;
}

export const PremiumSelect: React.FC<Props> = ({
  value,
  onChange,
  options,
  compact,
  showDot,
  placeholder,
  className,
}) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({
    top: 0, left: 0, width: 0,
  });

  const current = options.find(o => String(o.value) === String(value));

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: r.left, width: Math.max(r.width, 168) });
  }, [open]);

  return (
    <div className={`relative inline-block ${compact ? '' : 'w-full'} ${className || ''}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`group/sel inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 pr-6 text-[13px] text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100/70 dark:hover:bg-zinc-700/40 focus:bg-zinc-100/70 dark:focus:bg-zinc-700/40 transition-colors relative outline-none ${compact ? '' : 'w-full justify-start'}`}
      >
        {showDot && current?.color && (
          <span className={`w-2 h-2 rounded-full ${current.color} shadow-sm shrink-0`} />
        )}
        <span className={`truncate ${current ? '' : 'text-zinc-400 dark:text-zinc-500'}`}>
          {current?.label ?? placeholder ?? ''}
        </span>
        <Icons.ChevronDown
          size={12}
          className={`absolute right-2 text-zinc-400 dark:text-zinc-500 group-hover/sel:text-zinc-600 dark:group-hover/sel:text-zinc-300 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[80] rounded-xl bg-white/98 dark:bg-zinc-900/98 backdrop-blur-md border border-zinc-200/80 dark:border-zinc-700/70 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.18)] dark:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.6)] p-1 animate-in fade-in slide-in-from-top-1 duration-150"
          style={{ top: pos.top, left: pos.left, minWidth: pos.width, maxHeight: '60vh', overflowY: 'auto' }}
          role="listbox"
        >
          {options.map(opt => {
            const selected = String(opt.value) === String(value);
            return (
              <button
                key={String(opt.value)}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => { onChange(String(opt.value)); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12.5px] text-left transition-colors duration-100 ${
                  selected
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium'
                    : 'text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/70'
                }`}
              >
                {showDot && opt.color && (
                  <span className={`w-2 h-2 rounded-full ${opt.color} shadow-sm shrink-0`} />
                )}
                <span className="truncate flex-1">{opt.label}</span>
                {selected && <Icons.Check size={11} className="opacity-90 shrink-0" />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
};
