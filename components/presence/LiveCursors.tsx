import React from 'react';
import { usePresence } from '../../context/PresenceContext';

interface Props {
  currentPage: string;
}

export const LiveCursors: React.FC<Props> = ({ currentPage }) => {
  const { peers } = usePresence();
  const visible = peers.filter((p) => p.cursor && p.cursor.page === currentPage);

  if (visible.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      {visible.map((p) => (
        <div
          key={p.id}
          className="absolute top-0 left-0 will-change-transform"
          style={{
            transform: `translate3d(${p.cursor!.x}px, ${p.cursor!.y}px, 0)`,
            transition: 'transform 80ms linear',
          }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 22 22"
            fill="none"
            style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.25))' }}
          >
            <path
              d="M4 3 L4 17 L8.2 13.7 L10.3 18.6 L12.6 17.6 L10.5 12.8 L16 12.6 Z"
              fill={p.color}
              stroke="white"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </svg>
          <div
            className="absolute left-4 top-4 px-2 py-0.5 rounded-md text-[11px] font-semibold text-white whitespace-nowrap shadow-sm"
            style={{ backgroundColor: p.color }}
          >
            {p.name}
          </div>
        </div>
      ))}
    </div>
  );
};
