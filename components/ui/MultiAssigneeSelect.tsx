import React, { useState, useRef, useEffect } from 'react';
import { Icons } from './Icons';

interface TeamMember {
  id: string;
  name: string | null;
  email?: string;
  avatar_url?: string | null;
  status: string;
}

interface MultiAssigneeSelectProps {
  value: string[];
  onChange: (ids: string[]) => void;
  teamMembers: TeamMember[];
  currentUserId?: string;
  compact?: boolean;
}

export const MultiAssigneeSelect: React.FC<MultiAssigneeSelectProps> = ({
  value,
  onChange,
  teamMembers,
  currentUserId,
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const activeMembers = teamMembers.filter(m => m.status === 'active');
  const selected = activeMembers.filter(m => value.includes(m.id));

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id]);
  };

  const getInitials = (m: TeamMember) => {
    const name = m.name || m.email || '?';
    return name.split(/[\s@]/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  };

  const getName = (m: TeamMember) => {
    const label = m.name || m.email || 'Unknown';
    return m.id === currentUserId ? `${label} (Me)` : label;
  };

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center gap-1.5 text-left transition-all ${
          compact
            ? 'px-2.5 py-1.5 border rounded-lg text-xs'
            : 'px-3 py-2 rounded-lg text-sm'
        } ${
          selected.length > 0
            ? compact
              ? 'bg-sky-50 dark:bg-sky-500/10 border-sky-300 dark:border-sky-500/40 text-sky-700 dark:text-sky-400'
              : 'bg-zinc-50 dark:bg-zinc-800/50 text-zinc-900 dark:text-zinc-100'
            : compact
              ? 'bg-white dark:bg-zinc-800/80 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400'
              : 'bg-zinc-50 dark:bg-zinc-800/50 text-zinc-400 dark:text-zinc-500'
        } ${!compact ? 'border-0 focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10' : ''}`}
      >
        {selected.length === 0 ? (
          <span>Unassigned</span>
        ) : (
          <div className="flex items-center gap-1 flex-wrap flex-1 min-w-0">
            {/* Avatar stack */}
            <div className="flex -space-x-1.5">
              {selected.slice(0, 4).map(m => (
                <div
                  key={m.id}
                  className={`${compact ? 'w-5 h-5 text-[8px]' : 'w-6 h-6 text-[9px]'} rounded-full border-2 border-white dark:border-zinc-900 flex items-center justify-center font-medium shrink-0`}
                  style={{ backgroundColor: `hsl(${m.id.charCodeAt(0) * 37 % 360}, 45%, 65%)`, color: '#fff' }}
                  title={getName(m)}
                >
                  {m.avatar_url ? (
                    <img src={m.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    getInitials(m)
                  )}
                </div>
              ))}
              {selected.length > 4 && (
                <div className={`${compact ? 'w-5 h-5 text-[8px]' : 'w-6 h-6 text-[9px]'} rounded-full border-2 border-white dark:border-zinc-900 bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center font-medium text-zinc-600 dark:text-zinc-300 shrink-0`}>
                  +{selected.length - 4}
                </div>
              )}
            </div>
            <span className="truncate text-inherit">
              {selected.length === 1 ? getName(selected[0]) : `${selected.length} people`}
            </span>
          </div>
        )}
        <Icons.ChevronDown size={compact ? 12 : 14} className="shrink-0 opacity-50" />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full min-w-[200px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg max-h-52 overflow-y-auto py-1">
          {activeMembers.length === 0 ? (
            <div className="px-3 py-2 text-xs text-zinc-400">No team members</div>
          ) : (
            activeMembers.map(m => {
              const isSelected = value.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggle(m.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs transition-colors ${
                    isSelected
                      ? 'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-medium shrink-0"
                    style={{ backgroundColor: `hsl(${m.id.charCodeAt(0) * 37 % 360}, 45%, 65%)`, color: '#fff' }}
                  >
                    {m.avatar_url ? (
                      <img src={m.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      getInitials(m)
                    )}
                  </div>
                  <span className="flex-1 truncate">{getName(m)}</span>
                  {isSelected && <Icons.Check size={13} className="text-sky-500 shrink-0" />}
                </button>
              );
            })
          )}
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => { onChange([]); setIsOpen(false); }}
              className="w-full px-3 py-1.5 text-left text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 border-t border-zinc-100 dark:border-zinc-800 mt-1"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
};
