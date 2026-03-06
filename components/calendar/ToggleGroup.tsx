import React, { useState, useRef, useLayoutEffect } from 'react';
import { motion } from 'framer-motion';

export const ToggleGroup = <T extends string>({ options, value, onChange }: {
  options: { id: T; label: string; icon?: React.ElementType }[];
  value: T;
  onChange: (v: T) => void;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const activeBtn = container.querySelector(`[data-toggle="${value}"]`) as HTMLButtonElement;
    if (activeBtn) {
      setIndicator({ left: activeBtn.offsetLeft, width: activeBtn.offsetWidth });
    }
  }, [value]);

  return (
    <div ref={containerRef} className="relative flex items-center gap-0.5 p-1 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl">
      <motion.div
        className="absolute top-1 bottom-1 bg-white dark:bg-zinc-700 rounded-lg shadow-sm"
        initial={false}
        animate={{ left: indicator.left, width: indicator.width }}
        transition={{ type: 'tween', duration: 0.15, ease: 'easeOut' }}
      />
      {options.map(opt => {
        const Icon = opt.icon;
        const isActive = value === opt.id;
        return (
          <button
            key={opt.id}
            data-toggle={opt.id}
            onClick={() => onChange(opt.id)}
            className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors duration-200 ${
              isActive
                ? 'text-zinc-900 dark:text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
            }`}
          >
            {Icon && <Icon size={13} />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};
