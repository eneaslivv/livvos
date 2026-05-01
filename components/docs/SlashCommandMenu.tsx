import React, { useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import type { Editor } from '@tiptap/react';
import { Icons } from '../ui/Icons';

export interface SlashItem {
  id: string;
  label: string;
  hint: string;
  icon: keyof typeof Icons;
  keywords: string[];
  /** If returns false, the menu doesn't close (used when item opens a sub-popover) */
  run: (editor: Editor, range: { from: number; to: number }) => void | boolean;
}

interface Props {
  editor: Editor | null;
  query: string;
  range: { from: number; to: number };
  coords: { left: number; top: number; bottom: number };
  items: SlashItem[];
  onClose: () => void;
}

export interface SlashCommandMenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

export const SlashCommandMenu = forwardRef<SlashCommandMenuHandle, Props>(({ editor, query, range, coords, items, onClose }, ref) => {
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return items;
    return items.filter(i =>
      i.label.toLowerCase().includes(q) ||
      i.keywords.some(k => k.toLowerCase().includes(q))
    );
  }, [items, query]);

  const [selectedIdx, setSelectedIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setSelectedIdx(0); }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${selectedIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  const runItem = (item: SlashItem) => {
    if (!editor) return;
    const result = item.run(editor, range);
    if (result !== false) onClose();
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: (event: KeyboardEvent) => {
      if (filtered.length === 0) {
        if (event.key === 'Escape') { onClose(); return true; }
        return false;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIdx(i => (i + 1) % filtered.length);
        return true;
      }
      if (event.key === 'ArrowUp') {
        setSelectedIdx(i => (i - 1 + filtered.length) % filtered.length);
        return true;
      }
      if (event.key === 'Enter') {
        runItem(filtered[selectedIdx]);
        return true;
      }
      if (event.key === 'Escape') { onClose(); return true; }
      return false;
    },
  }), [filtered, selectedIdx, editor, range]);

  if (filtered.length === 0) {
    return (
      <div
        className="fixed z-[60] w-64 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl py-1 px-3 text-xs text-zinc-400"
        style={{ left: coords.left, top: coords.bottom + 6 }}
      >
        Sin resultados para "{query}"
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="fixed z-[60] w-72 max-h-80 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl py-1"
      style={{ left: coords.left, top: coords.bottom + 6 }}
      onMouseDown={e => e.preventDefault()}
    >
      {filtered.map((item, idx) => {
        const Icon = Icons[item.icon] as React.FC<{ size?: number; className?: string }>;
        const isSelected = idx === selectedIdx;
        return (
          <button
            key={item.id}
            data-idx={idx}
            onMouseEnter={() => setSelectedIdx(idx)}
            onClick={() => runItem(item)}
            className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left transition-colors ${
              isSelected ? 'bg-zinc-100 dark:bg-zinc-800' : ''
            }`}
          >
            <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
              isSelected ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
            }`}>
              {Icon && <Icon size={14} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">{item.label}</p>
              <p className="text-[10px] text-zinc-400 truncate">{item.hint}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
});

SlashCommandMenu.displayName = 'SlashCommandMenu';
