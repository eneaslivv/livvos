import React, { useEffect, useRef, useState } from 'react';
import { Icons } from './Icons';

const PRESETS = [
  '⭐', '🚀', '💼', '🎯', '📊', '💡', '🔥', '🎨',
  '☕', '🍔', '🍕', '🌮', '🍷', '🍳', '🥗', '🥐',
  '🏠', '🏢', '🏪', '🏛️', '🏥', '🏫', '🏖️', '🌴',
  '📱', '💻', '🖥️', '🎧', '📷', '🎬', '🎮', '🎵',
  '✏️', '📝', '📚', '🔧', '🛠️', '⚙️', '📌', '🔗',
  '🐶', '🐱', '🦊', '🐻', '🦁', '🐼', '🐧', '🦄',
];

interface IconPickerProps {
  value?: string | null;
  onChange: (icon: string | null) => void;
  size?: number;
  title?: string;
  fallback?: React.ReactNode;
}

export const IconPicker: React.FC<IconPickerProps> = ({
  value,
  onChange,
  size = 28,
  title = 'Pick an icon',
  fallback,
}) => {
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [customInput, setCustomInput] = useState('');

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (
        popRef.current && !popRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const handlePick = (emoji: string) => {
    onChange(emoji);
    setOpen(false);
    setCustomInput('');
  };

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        title={title}
        className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors flex items-center justify-center"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.55), lineHeight: 1 }}
      >
        {value || fallback || <Icons.Smile size={Math.round(size * 0.5)} className="text-zinc-400" />}
      </button>
      {open && (
        <div
          ref={popRef}
          className="absolute z-50 top-full mt-1 left-0 w-64 p-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-8 gap-1">
            {PRESETS.map(emoji => (
              <button
                key={emoji}
                type="button"
                onClick={() => handlePick(emoji)}
                className={`w-7 h-7 rounded-md flex items-center justify-center text-base hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors ${value === emoji ? 'bg-zinc-100 dark:bg-zinc-800 ring-1 ring-indigo-400' : ''}`}
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-1.5">
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customInput.trim()) {
                  handlePick(Array.from(customInput.trim())[0]);
                }
              }}
              maxLength={4}
              placeholder="Custom emoji…"
              className="flex-1 px-2 py-1 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md outline-none focus:border-indigo-400"
            />
            {customInput.trim() && (
              <button
                type="button"
                onClick={() => handlePick(Array.from(customInput.trim())[0])}
                className="px-2 py-1 text-[11px] font-medium bg-indigo-500 text-white rounded-md hover:bg-indigo-600"
              >
                Set
              </button>
            )}
            {value && (
              <button
                type="button"
                onClick={() => { onChange(null); setOpen(false); }}
                className="px-2 py-1 text-[11px] font-medium text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-md"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
