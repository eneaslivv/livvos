/**
 * SearchableSelect — combobox replacement for native <select>.
 *
 * Why: the native <select> dropdown is ugly, has no search, and inherits
 * OS chrome. For lists like Projects (10+ items) or Clients in growing
 * agencies, scanning a long native list is painful. This component:
 *  - looks like our SoftSelect pill when closed (consistent with other
 *    inputs in the task panel)
 *  - opens a popover with search input always at the top
 *  - filters in real time across both label and optional `searchValue`
 *  - keyboard nav: arrows / enter / esc
 *  - renders via Portal so it escapes transform contexts (framer-motion
 *    breaks position:fixed without this)
 *  - supports leading icons and group separators per option
 *  - clamps to viewport edges so it never spills off-screen
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icons } from './Icons';

export interface SearchableSelectOption {
  value: string;
  label: string;
  /** Extra string folded into search (e.g. client name for projects). */
  searchValue?: string;
  /** Optional secondary line under the label (e.g. client name for project). */
  hint?: string;
  /** Optional emoji or short string for the leading slot. */
  icon?: string;
  /** Optional avatar URL for the leading slot. */
  avatarUrl?: string | null;
  /** Visual treatment for grouping headers (rendered as inert dividers). */
  isHeader?: boolean;
}

export interface SearchableSelectProps {
  value: string;
  onChange: (next: string) => void;
  options: SearchableSelectOption[];
  /** Placeholder shown in the trigger when nothing's selected. */
  placeholder?: string;
  /** First option, always pinned at the top (e.g. "— No project"). */
  emptyOption?: { value: string; label: string };
  /** Class for the trigger element — defaults to a SoftSelect-style pill. */
  triggerClassName?: string;
  /** Width of the popover (default 280). */
  popoverWidth?: number;
  /** Optional create-new affordance — shown at the bottom when query has no matches. */
  onCreate?: (label: string) => void;
  createLabel?: (query: string) => string;
}

// ──────────────────────────────────────────────────────────────────────
//  Trigger — the closed-state pill matching SoftSelect visuals
// ──────────────────────────────────────────────────────────────────────

const Trigger: React.FC<{
  label: string;
  empty: boolean;
  onClick: () => void;
  triggerRef: React.RefObject<HTMLButtonElement>;
  open: boolean;
  className?: string;
}> = ({ label, empty, onClick, triggerRef, open, className }) => (
  <button
    ref={triggerRef}
    type="button"
    onClick={onClick}
    className={
      className ||
      `inline-flex items-center justify-between gap-2 w-full bg-transparent border-0 outline-none cursor-pointer rounded-full px-2.5 py-1 text-[13px] hover:bg-zinc-100/70 dark:hover:bg-zinc-700/40 ${
        open ? 'bg-zinc-100/70 dark:bg-zinc-700/40' : ''
      } ${empty ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-800 dark:text-zinc-200'}`
    }
  >
    <span className="truncate text-left flex-1">{label}</span>
    <Icons.ChevronDown
      size={12}
      className={`shrink-0 text-zinc-400 dark:text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}
    />
  </button>
);

// ──────────────────────────────────────────────────────────────────────
//  Popover — search input + scrollable filtered list
// ──────────────────────────────────────────────────────────────────────

interface PopoverProps {
  options: SearchableSelectOption[];
  emptyOption?: { value: string; label: string };
  value: string;
  onPick: (v: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement>;
  placeholder: string;
  width: number;
  onCreate?: (label: string) => void;
  createLabel?: (query: string) => string;
}

const Popover: React.FC<PopoverProps> = ({
  options, emptyOption, value, onPick, onClose, anchorRef,
  placeholder, width, onCreate, createLabel,
}) => {
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState<{ left: number; top: number; placement: 'below' | 'above' } | null>(null);
  const [hovered, setHovered] = useState(0);
  const popRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Position calc on mount + re-layout (covers framer-motion transform contexts).
  useEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const margin = 8;
    const maxH = 380;
    let placement: 'below' | 'above' = 'below';
    let top = rect.bottom + 6;
    if (top + maxH > window.innerHeight - margin) {
      // Flip above if it doesn't fit below.
      placement = 'above';
      top = Math.max(margin, rect.top - maxH - 6);
    }
    let left = rect.left;
    if (left + width > window.innerWidth - margin) left = window.innerWidth - width - margin;
    if (left < margin) left = margin;
    setPos({ left, top, placement });
  }, [anchorRef, width]);

  // Click outside / Escape to close.
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)
          && anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchorRef, onClose]);

  // Filtered list — keeps headers next to their group's matches.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    const matches = (o: SearchableSelectOption) =>
      !o.isHeader && (
        o.label.toLowerCase().includes(q) ||
        (o.searchValue || '').toLowerCase().includes(q) ||
        (o.hint || '').toLowerCase().includes(q)
      );
    // Walk the list keeping headers only if at least one following item matches.
    const out: SearchableSelectOption[] = [];
    for (let i = 0; i < options.length; i++) {
      const o = options[i];
      if (o.isHeader) {
        // Look ahead until next header to see if any sibling matches.
        let j = i + 1;
        let hasMatch = false;
        while (j < options.length && !options[j].isHeader) {
          if (matches(options[j])) { hasMatch = true; break; }
          j++;
        }
        if (hasMatch) out.push(o);
      } else if (matches(o)) {
        out.push(o);
      }
    }
    return out;
  }, [options, query]);

  // Reset hover index on filter change so the highlight follows the list.
  useEffect(() => { setHovered(0); }, [query]);

  // Scroll active item into view on hover change (keyboard nav).
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-row]');
    const el = items[hovered] as HTMLElement | undefined;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [hovered]);

  // Selectable items only (skip headers when navigating with arrows).
  const selectable = filtered.filter(o => !o.isHeader);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHovered(h => Math.min(h + 1, Math.max(0, selectable.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHovered(h => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const picked = selectable[hovered];
      if (picked) {
        onPick(picked.value);
        onClose();
      } else if (onCreate && query.trim()) {
        onCreate(query.trim());
        onClose();
      }
    }
  };

  if (!pos || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={popRef}
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        width,
        maxHeight: 380,
        zIndex: 9000,
      }}
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl overflow-hidden flex flex-col"
    >
      {/* Search row */}
      <div className="px-2 pt-2 pb-1.5 border-b border-zinc-100 dark:border-zinc-800/60">
        <div className="relative">
          <Icons.Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className="w-full pl-7 pr-2 py-1.5 text-[12px] bg-zinc-50 dark:bg-zinc-800/50 border-0 rounded-lg outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400"
          />
        </div>
      </div>

      {/* List */}
      <div ref={listRef} className="flex-1 overflow-y-auto py-1">
        {/* Empty option pinned at top, only when not searching */}
        {emptyOption && !query && (
          <button
            data-row
            onClick={() => { onPick(emptyOption.value); onClose(); }}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12.5px] transition-colors ${
              value === emptyOption.value
                ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
            }`}
          >
            <span className="w-4 text-center text-zinc-300 dark:text-zinc-600">—</span>
            <span className="flex-1 truncate">{emptyOption.label}</span>
            {value === emptyOption.value && <Icons.Check size={12} className="text-zinc-700 dark:text-zinc-200 shrink-0" />}
          </button>
        )}

        {(() => {
          let selectableIdx = -1;
          return filtered.map((o, _i) => {
            if (o.isHeader) {
              return (
                <div
                  key={`h-${o.label}`}
                  className="px-3 pt-2.5 pb-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500"
                >{o.label}</div>
              );
            }
            selectableIdx++;
            const isActive = value === o.value;
            const isHovered = selectableIdx === hovered;
            return (
              <button
                key={o.value}
                data-row
                onClick={() => { onPick(o.value); onClose(); }}
                onMouseEnter={() => setHovered(selectableIdx)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12.5px] transition-colors ${
                  isHovered
                    ? 'bg-zinc-100 dark:bg-zinc-800/70'
                    : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/30'
                } ${isActive ? 'text-zinc-900 dark:text-zinc-100 font-medium' : 'text-zinc-700 dark:text-zinc-300'}`}
              >
                {/* Leading slot */}
                <span className="w-4 h-4 flex items-center justify-center shrink-0">
                  {o.avatarUrl
                    ? <img src={o.avatarUrl} alt="" className="w-4 h-4 rounded object-cover" />
                    : o.icon
                      ? <span className="text-[12px] leading-none">{o.icon}</span>
                      : <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-600" />}
                </span>

                <span className="flex-1 min-w-0">
                  <span className="block truncate">{o.label}</span>
                  {o.hint && (
                    <span className="block text-[10px] text-zinc-400 dark:text-zinc-500 truncate -mt-0.5">{o.hint}</span>
                  )}
                </span>

                {isActive && <Icons.Check size={12} className="text-zinc-700 dark:text-zinc-200 shrink-0" />}
              </button>
            );
          });
        })()}

        {selectable.length === 0 && (
          <div className="px-3 py-6 text-center text-[11px] text-zinc-400">
            {onCreate && query.trim()
              ? <button
                  onClick={() => { onCreate(query.trim()); onClose(); }}
                  className="inline-flex items-center gap-1.5 text-zinc-700 dark:text-zinc-200 hover:underline"
                >
                  <Icons.Plus size={11} />
                  {createLabel ? createLabel(query.trim()) : `Create "${query.trim()}"`}
                </button>
              : <>No matches for "{query}"</>}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

// ──────────────────────────────────────────────────────────────────────
//  Public component
// ──────────────────────────────────────────────────────────────────────

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value, onChange, options, placeholder = 'Search…',
  emptyOption, triggerClassName, popoverWidth = 280,
  onCreate, createLabel,
}) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Find the currently selected option for the trigger label.
  const selected = useMemo(() => {
    if (emptyOption && value === emptyOption.value) return null;
    return options.find(o => !o.isHeader && o.value === value) || null;
  }, [options, value, emptyOption]);

  const triggerLabel = selected
    ? selected.label
    : emptyOption?.label || placeholder;

  return (
    <>
      <Trigger
        triggerRef={triggerRef}
        label={triggerLabel}
        empty={!selected}
        open={open}
        onClick={() => setOpen(o => !o)}
        className={triggerClassName}
      />
      {open && (
        <Popover
          options={options}
          emptyOption={emptyOption}
          value={value}
          onPick={onChange}
          onClose={() => setOpen(false)}
          anchorRef={triggerRef}
          placeholder={placeholder}
          width={popoverWidth}
          onCreate={onCreate}
          createLabel={createLabel}
        />
      )}
    </>
  );
};
