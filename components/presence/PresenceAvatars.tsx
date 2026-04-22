import React from 'react';
import { usePresence } from '../../context/PresenceContext';

interface Props {
  currentPage: string;
  max?: number;
}

const pageLabel = (p: string) =>
  p === 'home' ? 'Dashboard' : p.replace(/_/g, ' ');

export const PresenceAvatars: React.FC<Props> = ({ currentPage, max = 4 }) => {
  const { peers } = usePresence();

  if (peers.length === 0) return null;

  const sorted = [...peers].sort((a, b) => {
    const aHere = a.page === currentPage ? 0 : 1;
    const bHere = b.page === currentPage ? 0 : 1;
    if (aHere !== bHere) return aHere - bHere;
    return a.name.localeCompare(b.name);
  });

  const visible = sorted.slice(0, max);
  const overflow = sorted.length - visible.length;

  return (
    <div className="flex items-center -space-x-1.5">
      {visible.map((p) => {
        const here = p.page === currentPage;
        return (
          <div
            key={p.id}
            title={`${p.name} — ${here ? 'en esta página' : pageLabel(p.page)}`}
            className="relative w-7 h-7 rounded-full ring-2 ring-zinc-50 dark:ring-black flex items-center justify-center text-[10px] font-bold text-white overflow-hidden"
            style={{ backgroundColor: p.color }}
          >
            {p.avatar_url ? (
              <img
                src={p.avatar_url}
                alt={p.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span>{p.name.charAt(0).toUpperCase()}</span>
            )}
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-zinc-50 dark:ring-black ${
                here ? 'bg-emerald-500' : 'bg-zinc-400'
              }`}
            />
          </div>
        );
      })}
      {overflow > 0 && (
        <div className="relative w-7 h-7 rounded-full ring-2 ring-zinc-50 dark:ring-black bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-[10px] font-semibold flex items-center justify-center">
          +{overflow}
        </div>
      )}
    </div>
  );
};
