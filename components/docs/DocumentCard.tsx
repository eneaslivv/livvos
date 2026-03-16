import React from 'react';
import { Icons } from '../ui/Icons';
import type { Document } from '../../types/documents';

interface DocumentCardProps {
  document: Document;
  view: 'grid' | 'list';
  onClick: () => void;
}

export const DocumentCard: React.FC<DocumentCardProps> = ({ document, view, onClick }) => {
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

  if (view === 'list') {
    return (
      <div
        onClick={onClick}
        className="flex items-center gap-4 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 cursor-pointer transition-colors rounded-lg group"
      >
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
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className="group relative bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/60 rounded-xl p-4 hover:border-zinc-200 dark:hover:border-zinc-700 hover:shadow-sm cursor-pointer transition-all"
    >
      <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center mb-3">
        <Icons.Docs size={20} className="text-blue-500" />
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
