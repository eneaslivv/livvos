import React from 'react';
import { Icons } from '../ui/Icons';
import type { Document } from '../../types/documents';

interface DocumentCardProps {
  document: Document;
  view: 'grid' | 'list';
  onClick: () => void;
  selected?: boolean;
  onToggleSelect?: () => void;
  onMore?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
}

export const DocumentCard: React.FC<DocumentCardProps> = ({ document, view, onClick, selected = false, onToggleSelect, onMore, onDragStart }) => {
  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const SelectBox: React.FC<{ floating?: boolean }> = ({ floating }) => (
    onToggleSelect ? (
      <button
        onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
        aria-label={selected ? 'Deselect' : 'Select'}
        className={`flex items-center justify-center w-5 h-5 rounded-md border transition-all flex-shrink-0 ${
          selected
            ? 'bg-blue-600 border-blue-600 text-white opacity-100'
            : `bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600 text-transparent ${floating ? 'opacity-0 group-hover:opacity-100' : 'opacity-0 group-hover:opacity-100'} hover:border-blue-400`
        }`}
      >
        {selected && <Icons.Tick size={12} strokeWidth={3} />}
      </button>
    ) : null
  );

  if (view === 'list') {
    return (
      <div
        onClick={onClick}
        draggable={!!onDragStart}
        onDragStart={onDragStart}
        className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors rounded-lg group border ${
          selected
            ? 'border-blue-400 dark:border-blue-500 bg-blue-50/40 dark:bg-blue-950/30'
            : 'border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
        }`}
      >
        <SelectBox />
        <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center shrink-0">
          <Icons.Docs size={18} className="text-blue-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{document.title}</p>
          <p className="text-[11px] text-zinc-400">{timeAgo(document.updated_at)}</p>
        </div>
        {document.status === 'draft' && (
          <span className="text-[10px] font-medium text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">Draft</span>
        )}
        {document.share_enabled && (
          <Icons.Globe size={13} className="text-zinc-300 dark:text-zinc-600" />
        )}
        {onMore && (
          <button
            onClick={(e) => { e.stopPropagation(); onMore(); }}
            className="text-zinc-300 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-all p-1"
          >
            <Icons.MoreVert size={14} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      className={`group relative bg-white dark:bg-zinc-900 border rounded-xl p-4 hover:shadow-sm cursor-pointer transition-all ${
        selected
          ? 'border-blue-400 dark:border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900 bg-blue-50/40 dark:bg-blue-950/30'
          : 'border-zinc-100 dark:border-zinc-800/60 hover:border-zinc-200 dark:hover:border-zinc-700'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
          <Icons.Docs size={20} className="text-blue-500" />
        </div>
        <div className="flex items-center gap-1">
          <SelectBox floating />
          {onMore && (
            <button
              onClick={(e) => { e.stopPropagation(); onMore(); }}
              className="text-zinc-300 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-all p-1"
            >
              <Icons.MoreVert size={15} />
            </button>
          )}
        </div>
      </div>
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate mb-1">{document.title}</p>
      <div className="flex items-center gap-2">
        <p className="text-[11px] text-zinc-400">{timeAgo(document.updated_at)}</p>
        {document.status === 'draft' && (
          <span className="text-[9px] font-medium text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full">Draft</span>
        )}
        {document.share_enabled && (
          <Icons.Globe size={11} className="text-zinc-300 dark:text-zinc-600" />
        )}
      </div>
    </div>
  );
};
