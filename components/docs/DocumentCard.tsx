import React from 'react';
import { Icons } from '../ui/Icons';
import type { Document } from '../../types/documents';
import { avatarColor, initials } from './FolderIcon';

interface DocumentCardProps {
  document: Document;
  view: 'grid' | 'list';
  onClick: () => void;
  selected?: boolean;
  onToggleSelect?: () => void;
  onMore?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  /** When this doc is linked to a task, show a small inline chip with
   *  the task title. Clicking the chip unlinks. Renders inside the card
   *  layout (not absolute-positioned) so it never overflows past the
   *  card's bottom edge. */
  linkedTaskTitle?: string | null;
  onUnlinkTask?: () => void;
}

export const DocumentCard: React.FC<DocumentCardProps> = ({ document, view, onClick, selected = false, onToggleSelect, onMore, onDragStart, linkedTaskTitle, onUnlinkTask }) => {
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

  // Indigo accent — internal docs are always "doc" type, so pick a
  // consistent editorial color (sage for live, gold for draft) to match
  // the rest of the LIVV palette.
  const tone = document.status === 'draft' ? '#c4a35a' : '#769268';

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
        className={`flex items-center gap-3 px-4 py-3 transition-colors rounded-lg group border ${
          onDragStart ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
        } ${
          selected
            ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-50 dark:bg-zinc-800/40'
            : 'border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
        }`}
      >
        <SelectBox />
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `color-mix(in oklab, ${tone} 14%, #ffffff)`, color: tone, border: `0.5px solid color-mix(in oklab, ${tone} 22%, transparent)` }}
        >
          <Icons.Docs size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{document.title}</p>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{timeAgo(document.updated_at)}</p>
        </div>
        <span className={`dxd-status ${document.status === 'draft' ? 'draft' : 'live'}`}>
          <span className="dot" />{document.status === 'draft' ? 'draft' : 'live'}
        </span>
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
      className={`dxd-doc group ${onDragStart ? 'cursor-grab active:cursor-grabbing' : ''} ${
        selected ? 'ring-2 ring-zinc-300/40 dark:ring-zinc-700/40 !border-zinc-900 dark:!border-zinc-100' : ''
      }`}
    >
      {/* Pin button — top-right */}
      <button
        className={`dxd-doc-pin ${document.is_favorite ? 'pinned' : ''}`}
        aria-label="Pin"
        onClick={(e) => { e.stopPropagation(); }}
      >
        <svg width={11} height={11} viewBox="0 0 24 24" fill={document.is_favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="M12 2v6M9 8h6l-1 5h-4l-1-5zM12 13v9" />
        </svg>
      </button>

      {/* Notebook-lined preview with DOC ext badge */}
      <div className="dxd-doc-preview" style={{ ['--c' as any]: tone }}>
        <div
          className="dxd-doc-preview-ic"
          style={{
            background: `color-mix(in oklab, ${tone} 14%, #ffffff)`,
            border: `0.5px solid color-mix(in oklab, ${tone} 22%, transparent)`,
            color: tone,
          }}
        >
          DOC
        </div>
        <div className="dxd-doc-preview-thumb">
          <span className="ln title" style={{ background: `color-mix(in oklab, ${tone} 50%, transparent)` }} />
          <span className="ln short" />
          <span className="ln" />
          <span className="ln shorter" />
          <span className="ln short" />
          <span className="ln" />
          <span className="ln short" />
        </div>
      </div>

      {/* Body */}
      <div className="dxd-doc-body">
        <div className="dxd-doc-name">{document.title || 'Untitled Document'}</div>
        <div className="dxd-doc-meta">
          <span>{timeAgo(document.updated_at)}</span>
          {document.share_enabled && (
            <>
              <span className="sep">·</span>
              <span className="inline-flex items-center gap-1"><Icons.Globe size={10} /> shared</span>
            </>
          )}
        </div>
        <div className="dxd-doc-foot">
          <span className={`dxd-status ${document.status === 'draft' ? 'draft' : 'live'}`}>
            <span className="dot" />{document.status === 'draft' ? 'draft' : 'live'}
          </span>
          {linkedTaskTitle && (
            <button
              onClick={(e) => { e.stopPropagation(); onUnlinkTask?.(); }}
              title={`Linked to: ${linkedTaskTitle} — click to unlink`}
              className="dxd-tag"
              style={{ background: 'rgba(118,146,104,0.13)', color: '#4d6b4d' }}
            >
              <span className="dot" style={{ background: '#4d6b4d' }} />
              <span className="truncate max-w-[120px]">{linkedTaskTitle}</span>
            </button>
          )}
          <span className="dxd-doc-av" style={{ background: avatarColor(1) }}>
            {initials(document.title)}
          </span>
        </div>
      </div>

      {/* Hover-only actions, top-right area */}
      <div className="absolute top-2 right-9 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <SelectBox floating />
        {onMore && (
          <button
            onClick={(e) => { e.stopPropagation(); onMore(); }}
            className="bg-white/90 dark:bg-zinc-800/90 backdrop-blur-sm text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 p-1 rounded-md"
          >
            <Icons.MoreVert size={11} />
          </button>
        )}
      </div>
    </div>
  );
};
