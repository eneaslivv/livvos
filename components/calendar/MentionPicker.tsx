/**
 * MentionPicker — lightweight @autocomplete for the comments textarea.
 *
 * No TipTap dependency: the textarea remains the source of truth, and we
 * insert mentions as `@[Name](user-id)` markup. The on-screen popover is
 * positioned near the cursor and filters team members as the user keeps
 * typing after `@`.
 *
 * Wiring (from the parent textarea):
 *   - On every input/onSelect, call `detectMention(textarea)` to know if
 *     a mention is currently being typed. It returns either `null`
 *     (no active mention) or `{ query, startIndex }` (the slice from the
 *     `@` to the cursor).
 *   - Pass `query` to this component as the `query` prop.
 *   - When the user picks a member, call `applyMention(textarea, ...)`
 *     which replaces the `@<query>` slice with `@[Name](user-id) `.
 *
 * The exported helpers are pure and unit-testable; the component is a
 * dumb visual list driven by props.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { TeamMember } from '../../context/TeamContext';

// ── Helpers ──────────────────────────────────────────────────────────────

export interface MentionState {
  /** Text typed AFTER the `@`, e.g. "lu" for "@lu" */
  query: string;
  /** Index of the `@` symbol in textarea.value */
  startIndex: number;
  /** Caret position (where the query ends) */
  caretIndex: number;
}

/**
 * Inspect a textarea and figure out whether the caret is inside an active
 * `@…` mention being composed. Returns null if not.
 *
 * Rules — the @ is "active" when:
 *  - it sits at the start of the field, after whitespace, or after a newline
 *  - the chars between `@` and the caret contain no whitespace and no `]` `(` `)`
 *  - the slice is at most 30 chars (sanity guard)
 */
export function detectMention(textarea: HTMLTextAreaElement): MentionState | null {
  const value = textarea.value;
  const caret = textarea.selectionStart ?? 0;
  if (caret === 0) return null;

  // Walk backward from the caret looking for `@`. Bail on whitespace/newlines.
  let i = caret - 1;
  while (i >= 0) {
    const ch = value[i];
    if (ch === '@') break;
    if (ch === '\n' || ch === ' ' || ch === '\t') return null;
    if (ch === ')' || ch === ']' || ch === '(') return null;
    if (caret - i > 30) return null;
    i--;
  }
  if (i < 0 || value[i] !== '@') return null;

  // The char before @ must be start-of-input or whitespace (so we don't
  // open the picker for emails like "hi@example.com").
  const prev = i > 0 ? value[i - 1] : null;
  if (prev !== null && !/\s/.test(prev)) return null;

  return {
    query: value.slice(i + 1, caret),
    startIndex: i,
    caretIndex: caret,
  };
}

/**
 * Replace the `@<query>` slice with `@[Name](user-id) `, then move the
 * caret right after the inserted mention. Updates the textarea via the
 * provided setter so React state stays in sync.
 */
export function applyMention(
  textarea: HTMLTextAreaElement,
  state: MentionState,
  member: { id: string; name: string },
  setValue: (next: string) => void,
): void {
  const value = textarea.value;
  const before = value.slice(0, state.startIndex);
  const after = value.slice(state.caretIndex);
  // Display name without the @ since we wrap it in markup ourselves.
  const safeName = (member.name || 'user').replace(/[\[\]()]/g, '').trim() || 'user';
  const insert = `@[${safeName}](${member.id}) `;
  const next = before + insert + after;
  setValue(next);
  // After React re-renders, move caret to the end of the insertion. The
  // browser preserves the textarea node reference so this is safe.
  requestAnimationFrame(() => {
    try {
      const pos = before.length + insert.length;
      textarea.setSelectionRange(pos, pos);
      textarea.focus();
    } catch { /* ignore */ }
  });
}

/** Mention regex used both for parsing comments and stripping markup for previews. */
export const MENTION_RE = /@\[([^\]]+)\]\(([0-9a-fA-F-]{36})\)/g;

/** Render a comment string with mention chips. The chip element is provided
 *  by the caller so styling stays at the call-site. */
export function renderMentionParts(
  text: string,
  renderChip: (name: string, userId: string, key: string) => React.ReactNode,
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  // Reset regex state between calls (it's a /g regex held module-level).
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(renderChip(m[1], m[2], `m-${m.index}`));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// ── Component ────────────────────────────────────────────────────────────

interface MentionPickerProps {
  /** Active query string (the chars after `@`) */
  query: string;
  /** All team members in the tenant */
  members: TeamMember[];
  /** Optional id to skip (don't suggest the commenter themselves) */
  excludeId?: string;
  /** Whether the popover is shown */
  open: boolean;
  /** Anchor textarea — used to position the popover near the caret */
  anchor: HTMLTextAreaElement | null;
  /** Called when the user picks a member or dismisses */
  onPick: (member: TeamMember) => void;
  onClose: () => void;
}

const MAX_RESULTS = 6;

export const MentionPicker: React.FC<MentionPickerProps> = ({
  query,
  members,
  excludeId,
  open,
  anchor,
  onPick,
  onClose,
}) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Match by name OR email (case + accent insensitive).
  const matches = useMemo(() => {
    if (!members) return [];
    const norm = (s: string | null | undefined) =>
      (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const q = norm(query);
    const list = members
      .filter(m => m.id !== excludeId && m.status !== 'suspended')
      .map(m => ({
        m,
        score:
          q === ''
            ? 0
            : norm(m.name).startsWith(q) ? 3
            : norm(m.email).startsWith(q) ? 2
            : norm(m.name).includes(q) ? 1
            : norm(m.email).includes(q) ? 0.5
            : -1,
      }))
      .filter(x => x.score >= 0 || q === '')
      .sort((a, b) => b.score - a.score)
      .map(x => x.m);
    return list.slice(0, MAX_RESULTS);
  }, [members, query, excludeId]);

  // Reset highlighted row when matches change.
  useEffect(() => { setActiveIdx(0); }, [query, matches.length]);

  // Keyboard navigation when the picker is open.
  useEffect(() => {
    if (!open || !anchor) return;
    const handler = (e: KeyboardEvent) => {
      if (!matches.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(i => (i + 1) % matches.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(i => (i - 1 + matches.length) % matches.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        onPick(matches[activeIdx]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    anchor.addEventListener('keydown', handler);
    return () => anchor.removeEventListener('keydown', handler);
  }, [open, anchor, matches, activeIdx, onPick, onClose]);

  if (!open || !matches.length) return null;

  return (
    <div
      ref={containerRef}
      className="absolute z-30 left-0 bottom-full mb-1 w-64 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg overflow-hidden"
      role="listbox"
    >
      <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-zinc-400 border-b border-zinc-100 dark:border-zinc-800">
        Mention a teammate {query && <span className="text-zinc-300">· @{query}</span>}
      </div>
      <ul className="max-h-56 overflow-y-auto">
        {matches.map((m, i) => (
          <li key={m.id}>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onPick(m); }}
              onMouseEnter={() => setActiveIdx(i)}
              className={`w-full text-left px-2.5 py-1.5 flex items-center gap-2 ${
                i === activeIdx
                  ? 'bg-blue-50 dark:bg-blue-500/10'
                  : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
              }`}
              role="option"
              aria-selected={i === activeIdx}
            >
              {m.avatar_url ? (
                <img src={m.avatar_url} alt="" className="w-6 h-6 rounded-full shrink-0" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 flex items-center justify-center text-[10px] font-bold shrink-0">
                  {(m.name || m.email || '?')[0]?.toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium text-zinc-800 dark:text-zinc-100 truncate">
                  {m.name || m.email}
                </div>
                {m.name && (
                  <div className="text-[10px] text-zinc-400 truncate">{m.email}</div>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
