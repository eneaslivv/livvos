/**
 * TeamFilterBar — compact, expandable, searchable task filter.
 *
 * Replaces the inline avatar strip in Calendar that crammed 8+ initials in
 * a row with no labels. Now you get:
 *  - 5 avatars by default + a "+N" chip to expand
 *  - hover tooltip (name + email + role hint) so it's obvious WHO each
 *    initial is — was the user's main complaint
 *  - popover with a search input and three sections: Team / Projects /
 *    Clients. Search filters across all three at once
 *  - the active filter renders as a labeled chip ("Filtering by · Acme Co")
 *    so it's always clear WHAT is being filtered
 *
 * Filter value format (backward-compat with the existing 'all' | 'me' |
 * <userId> string the Calendar page already uses):
 *   'all'              → no filter
 *   'me'               → tasks assigned to current user
 *   '<userId>'         → tasks assigned to that team member
 *   'project:<id>'     → tasks in that project
 *   'client:<id>'      → tasks for that client
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Icons } from '../ui/Icons';

interface TeamMember {
  id: string;
  name: string | null;
  email?: string;
  status: string;
  avatar_url?: string | null;
}

interface ProjectOption { id: string; title: string; client_id?: string }
interface ClientOption { id: string; name: string }

export interface TeamFilterBarProps {
  value: string;                    // current filter (see header doc)
  onChange: (next: string) => void;
  teamMembers: TeamMember[];
  projects: ProjectOption[];
  clients: ClientOption[];
  currentUserId?: string;
  /** Phase grouping toggle hosted in the same row to keep one filter strip. */
  groupByPhase?: boolean;
  onTogglePhase?: () => void;
  /** Visible avatars before the "+N" chip kicks in. */
  visibleCount?: number;
}

// ──────────────────────────────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────────────────────────────

const initials = (name: string | null | undefined, email?: string): string => {
  const src = (name || email?.split('@')[0] || '?').trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.substring(0, 2).toUpperCase();
};

const memberLabel = (m: TeamMember) => m.name || m.email?.split('@')[0] || 'Member';

// Stable color from a string (so each person has a consistent avatar bg).
const colorFor = (s: string): string => {
  const hues = [12, 38, 88, 152, 200, 264, 312, 340];
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return `hsl(${hues[Math.abs(h) % hues.length]}, 45%, 70%)`;
};

// ──────────────────────────────────────────────────────────────────────
//  Avatar primitive — used in bar AND popover
// ──────────────────────────────────────────────────────────────────────

const Avatar: React.FC<{
  name?: string | null;
  email?: string;
  url?: string | null;
  size?: number;
  active?: boolean;
}> = ({ name, email, url, size = 22, active }) => {
  const txt = initials(name, email);
  const bg = colorFor(name || email || txt);
  if (url) {
    return (
      <img
        src={url}
        alt={name || ''}
        style={{ width: size, height: size, borderRadius: 9999, objectFit: 'cover' }}
        className={active
          ? 'ring-2 ring-zinc-900 dark:ring-zinc-100 ring-offset-1 ring-offset-white dark:ring-offset-zinc-950'
          : 'opacity-80 hover:opacity-100 transition-opacity'}
      />
    );
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: 9999,
        background: active ? '#09090B' : bg,
        color: active ? '#FFFFFF' : 'rgba(0,0,0,0.7)',
        fontSize: size <= 22 ? 10 : 11,
        fontWeight: 600, letterSpacing: '0.02em',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Inter',
      }}
      className={active
        ? 'ring-2 ring-zinc-900 dark:ring-zinc-100 ring-offset-1 ring-offset-white dark:ring-offset-zinc-950'
        : 'opacity-90 hover:opacity-100 transition-opacity'}
    >
      {txt}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────
//  Tooltip — anchored under the trigger, shows person details
// ──────────────────────────────────────────────────────────────────────

const HoverTip: React.FC<{
  show: boolean;
  title: string;
  subtitle?: string;
  hint?: string;
  anchorRef: React.RefObject<HTMLElement>;
}> = ({ show, title, subtitle, hint, anchorRef }) => {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    if (!show || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPos({ left: rect.left + rect.width / 2, top: rect.bottom + 6 });
  }, [show, anchorRef]);
  if (!show || !pos) return null;
  return (
    <div
      style={{
        position: 'fixed', left: pos.left, top: pos.top,
        transform: 'translateX(-50%)',
        background: '#09090B', color: '#FFFFFF',
        padding: '7px 11px', borderRadius: 8,
        fontSize: 11, fontFamily: 'Inter', fontWeight: 500,
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        pointerEvents: 'none',
        zIndex: 60,
        maxWidth: 240, lineHeight: 1.35,
      }}
    >
      <div style={{ fontWeight: 600, letterSpacing: '-0.01em' }}>{title}</div>
      {subtitle && <div style={{ opacity: 0.65, fontSize: 10, marginTop: 2 }}>{subtitle}</div>}
      {hint && <div style={{ opacity: 0.5, fontSize: 9, marginTop: 4, fontStyle: 'italic' }}>{hint}</div>}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────
//  Avatar with hover tooltip, click to filter
// ──────────────────────────────────────────────────────────────────────

const AvatarFilterButton: React.FC<{
  member: TeamMember;
  active: boolean;
  onClick: () => void;
}> = ({ member, active, onClick }) => {
  const ref = useRef<HTMLButtonElement>(null);
  const [hover, setHover] = useState(false);
  return (
    <>
      <button
        ref={ref}
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="shrink-0 p-0.5 rounded-full transition-all"
      >
        <Avatar name={member.name} email={member.email} url={member.avatar_url} active={active} size={22} />
      </button>
      <HoverTip
        show={hover}
        title={memberLabel(member)}
        subtitle={member.email}
        hint={active ? 'Filtering by this person' : 'Click to filter'}
        anchorRef={ref}
      />
    </>
  );
};

// ──────────────────────────────────────────────────────────────────────
//  Active filter chip (when not 'all' or 'me')
// ──────────────────────────────────────────────────────────────────────

const ActiveFilterChip: React.FC<{
  kind: 'person' | 'project' | 'client';
  label: string;
  sublabel?: string;
  onClear: () => void;
  onOpen: () => void;
}> = ({ kind, label, sublabel, onClear, onOpen }) => {
  const colors = {
    person:  { bg: 'rgba(99,102,241,0.08)', fg: 'rgb(99,102,241)',  dot: 'rgb(99,102,241)' },
    project: { bg: 'rgba(34,197,94,0.10)',  fg: 'rgb(22,163,74)',   dot: 'rgb(34,197,94)' },
    client:  { bg: 'rgba(245,158,11,0.10)', fg: 'rgb(217,119,6)',   dot: 'rgb(245,158,11)' },
  }[kind];
  return (
    <div
      onClick={onOpen}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '4px 10px 4px 8px', borderRadius: 9999,
        background: colors.bg, color: colors.fg,
        fontFamily: 'Inter', fontSize: 11, fontWeight: 500,
        cursor: 'pointer', lineHeight: 1, maxWidth: 220,
      }}
      title="Click to change filter"
    >
      <span style={{ width: 6, height: 6, borderRadius: 9999, background: colors.dot, flexShrink: 0 }} />
      <span style={{
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        opacity: 0.6, fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase',
      }}>{kind}</span>
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}{sublabel && <span style={{ opacity: 0.5, marginLeft: 4 }}>· {sublabel}</span>}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onClear(); }}
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: 0, color: 'inherit', display: 'flex',
          opacity: 0.6,
        }}
      >
        <Icons.Close size={11} />
      </button>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────
//  Expand popover (search + sections)
// ──────────────────────────────────────────────────────────────────────

const ExpandPopover: React.FC<{
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement>;
  teamMembers: TeamMember[];
  projects: ProjectOption[];
  clients: ClientOption[];
  value: string;
  onPick: (next: string) => void;
}> = ({ open, onClose, anchorRef, teamMembers, projects, clients, value, onPick }) => {
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) { setQuery(''); return; }
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPos({ left: rect.left, top: rect.bottom + 8 });
  }, [open, anchorRef]);

  // Click outside to close.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)
          && anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, anchorRef, onClose]);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (s: string | null | undefined) => !q || (s || '').toLowerCase().includes(q);
    return {
      members: teamMembers.filter(m => m.status === 'active' && (matches(m.name) || matches(m.email))),
      projects: projects.filter(p => matches(p.title)),
      clients: clients.filter(c => matches(c.name)),
    };
  }, [teamMembers, projects, clients, query]);

  if (!open || !pos) return null;

  const Section: React.FC<{ label: string; count: number; children: React.ReactNode }> = ({ label, count, children }) => (
    count > 0 ? (
      <div style={{ padding: '4px 0' }}>
        <div style={{
          padding: '6px 12px 4px',
          fontFamily: 'Inter', fontSize: 9.5, fontWeight: 600,
          letterSpacing: '0.14em', textTransform: 'uppercase',
          color: 'rgba(90,62,62,0.45)',
          display: 'flex', justifyContent: 'space-between',
        }}>
          <span>{label}</span>
          <span style={{ fontFamily: '"JetBrains Mono", monospace', opacity: 0.6 }}>{count}</span>
        </div>
        <div>{children}</div>
      </div>
    ) : null
  );

  const Row: React.FC<{
    avatar: React.ReactNode;
    title: string;
    subtitle?: string;
    active: boolean;
    onClick: () => void;
  }> = ({ avatar, title, subtitle, active, onClick }) => (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
        active
          ? 'bg-zinc-900/5 dark:bg-white/5'
          : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
      }`}
    >
      <div className="shrink-0">{avatar}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-medium text-zinc-800 dark:text-zinc-100 truncate">
          {title}
        </div>
        {subtitle && (
          <div className="text-[10.5px] text-zinc-400 dark:text-zinc-500 truncate">
            {subtitle}
          </div>
        )}
      </div>
      {active && <Icons.Check size={13} className="text-zinc-700 dark:text-zinc-200 shrink-0" />}
    </button>
  );

  return (
    <div
      ref={popRef}
      style={{
        position: 'fixed', left: pos.left, top: pos.top,
        width: 320, maxHeight: 460,
        background: '#FFFFFF', borderRadius: 14,
        border: '1px solid #E6E2D8',
        boxShadow: '0 16px 40px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.04)',
        zIndex: 50, display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
      className="dark:bg-zinc-900 dark:border-zinc-800"
    >
      {/* Search input */}
      <div className="px-3 pt-3 pb-2 border-b border-zinc-100 dark:border-zinc-800/60">
        <div className="relative">
          <Icons.Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search team, projects, clients…"
            className="w-full pl-8 pr-3 py-1.5 text-[12px] bg-zinc-50 dark:bg-zinc-800/50 border-0 rounded-lg outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Quick toggles */}
        <div style={{ padding: '4px 0', borderBottom: '1px dashed rgba(90,62,62,0.12)' }}>
          <Row
            avatar={<div style={{
              width: 22, height: 22, borderRadius: 9999,
              background: 'rgba(90,62,62,0.08)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}><Icons.Users size={11} className="text-zinc-500" /></div>}
            title="All tasks"
            subtitle="No filter applied"
            active={value === 'all'}
            onClick={() => { onPick('all'); onClose(); }}
          />
          <Row
            avatar={<div style={{
              width: 22, height: 22, borderRadius: 9999,
              background: 'rgba(99,102,241,0.12)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}><Icons.User size={11} className="text-indigo-500" /></div>}
            title="Assigned to me"
            subtitle="Tasks owned by or assigned to you"
            active={value === 'me'}
            onClick={() => { onPick('me'); onClose(); }}
          />
        </div>

        <Section label="Team" count={filtered.members.length}>
          {filtered.members.map(m => (
            <Row
              key={m.id}
              avatar={<Avatar name={m.name} email={m.email} url={m.avatar_url} size={22} />}
              title={memberLabel(m)}
              subtitle={m.email}
              active={value === m.id}
              onClick={() => { onPick(m.id); onClose(); }}
            />
          ))}
        </Section>

        <Section label="Projects" count={filtered.projects.length}>
          {filtered.projects.map(p => (
            <Row
              key={p.id}
              avatar={<div style={{
                width: 22, height: 22, borderRadius: 6,
                background: 'rgba(34,197,94,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><Icons.Briefcase size={11} className="text-emerald-600" /></div>}
              title={p.title}
              active={value === `project:${p.id}`}
              onClick={() => { onPick(`project:${p.id}`); onClose(); }}
            />
          ))}
        </Section>

        <Section label="Clients" count={filtered.clients.length}>
          {filtered.clients.map(c => (
            <Row
              key={c.id}
              avatar={<div style={{
                width: 22, height: 22, borderRadius: 6,
                background: 'rgba(245,158,11,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><Icons.Users size={11} className="text-amber-600" /></div>}
              title={c.name}
              active={value === `client:${c.id}`}
              onClick={() => { onPick(`client:${c.id}`); onClose(); }}
            />
          ))}
        </Section>

        {filtered.members.length === 0 && filtered.projects.length === 0 && filtered.clients.length === 0 && (
          <div className="px-3 py-8 text-center text-[11px] text-zinc-400">
            No matches for "{query}"
          </div>
        )}
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────
//  MAIN COMPONENT
// ──────────────────────────────────────────────────────────────────────

export const TeamFilterBar: React.FC<TeamFilterBarProps> = ({
  value, onChange, teamMembers, projects, clients, currentUserId,
  groupByPhase, onTogglePhase, visibleCount = 5,
}) => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const meRef = useRef<HTMLButtonElement>(null);
  const allRef = useRef<HTMLButtonElement>(null);
  const [hover, setHover] = useState<'all' | 'me' | null>(null);

  const activeMembers = useMemo(
    () => teamMembers.filter(m => m.status === 'active' && m.id !== currentUserId),
    [teamMembers, currentUserId],
  );

  // Decide what's the active filter — drives the "ActiveFilterChip" + bar layout.
  const activeFilter = useMemo<{
    kind: 'all' | 'me' | 'person' | 'project' | 'client';
    label?: string;
    sublabel?: string;
  }>(() => {
    if (value === 'all') return { kind: 'all' };
    if (value === 'me') return { kind: 'me' };
    if (value.startsWith('project:')) {
      const p = projects.find(x => x.id === value.slice(8));
      return { kind: 'project', label: p?.title || 'Unknown project' };
    }
    if (value.startsWith('client:')) {
      const c = clients.find(x => x.id === value.slice(7));
      return { kind: 'client', label: c?.name || 'Unknown client' };
    }
    const m = teamMembers.find(x => x.id === value);
    return { kind: 'person', label: m ? memberLabel(m) : 'Member', sublabel: m?.email };
  }, [value, projects, clients, teamMembers]);

  // Pin the active person (if any) at the front of the avatar strip so it's
  // always visible even when you have many team members.
  const orderedMembers = useMemo(() => {
    if (activeFilter.kind !== 'person') return activeMembers;
    const idx = activeMembers.findIndex(m => m.id === value);
    if (idx <= 0) return activeMembers;
    return [activeMembers[idx], ...activeMembers.slice(0, idx), ...activeMembers.slice(idx + 1)];
  }, [activeMembers, activeFilter.kind, value]);

  const visible = orderedMembers.slice(0, visibleCount);
  const overflow = Math.max(0, orderedMembers.length - visibleCount);

  return (
    <div className="flex items-center gap-1.5 mb-3 flex-wrap">
      {/* Phase toggle (kept in same row to feel like ONE filter strip) */}
      {onTogglePhase && (
        <>
          <button
            onClick={onTogglePhase}
            className={`flex items-center gap-1 px-1.5 py-0.5 text-[11px] rounded-md transition-colors shrink-0 ${
              groupByPhase
                ? 'text-indigo-600 dark:text-indigo-400 font-medium'
                : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
            title="Group tasks by phase"
          >
            <Icons.Layers size={10} />
            Phases
          </button>
          <div className="w-px h-3 bg-zinc-200 dark:bg-zinc-800 shrink-0 mx-0.5" />
        </>
      )}

      {/* All / Me — keep them as text pills to read fast */}
      <button
        ref={allRef}
        onClick={() => onChange('all')}
        onMouseEnter={() => setHover('all')}
        onMouseLeave={() => setHover(null)}
        className={`px-1.5 py-0.5 text-[11px] rounded-md transition-colors shrink-0 ${
          value === 'all'
            ? 'text-zinc-900 dark:text-zinc-100 font-medium'
            : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
        }`}
      >All</button>
      <HoverTip show={hover === 'all'} title="All tasks" hint="No filter" anchorRef={allRef} />

      <button
        ref={meRef}
        onClick={() => onChange('me')}
        onMouseEnter={() => setHover('me')}
        onMouseLeave={() => setHover(null)}
        className={`px-1.5 py-0.5 text-[11px] rounded-md transition-colors shrink-0 ${
          value === 'me'
            ? 'text-zinc-900 dark:text-zinc-100 font-medium'
            : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
        }`}
      >Me</button>
      <HoverTip show={hover === 'me'} title="Assigned to me" hint="Tasks owned or assigned to you" anchorRef={meRef} />

      {/* Active filter chip (only for project/client — for persons the avatar
          ring already signals it). Clicking the chip reopens the popover so
          the user can change/clear without hunting for the right control. */}
      {(activeFilter.kind === 'project' || activeFilter.kind === 'client') && (
        <ActiveFilterChip
          kind={activeFilter.kind}
          label={activeFilter.label || ''}
          onClear={() => onChange('all')}
          onOpen={() => setPopoverOpen(true)}
        />
      )}

      {/* Visible avatars */}
      {activeMembers.length > 0 && (
        <>
          <div className="w-px h-3 bg-zinc-200 dark:bg-zinc-800 shrink-0 mx-0.5" />
          {visible.map(m => (
            <AvatarFilterButton
              key={m.id}
              member={m}
              active={value === m.id}
              onClick={() => onChange(m.id)}
            />
          ))}
        </>
      )}

      {/* "+N" or search trigger */}
      <button
        ref={moreRef}
        onClick={() => setPopoverOpen(o => !o)}
        title={overflow > 0 ? `Show ${overflow} more + search` : 'Search projects, clients, team'}
        className={`shrink-0 ml-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium transition-all
          ${popoverOpen
            ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}
        `}
      >
        {overflow > 0
          ? <><span style={{ fontFamily: '"JetBrains Mono", monospace' }}>+{overflow}</span><Icons.Search size={9} className="opacity-70" /></>
          : <Icons.Search size={11} />
        }
      </button>

      <ExpandPopover
        open={popoverOpen}
        onClose={() => setPopoverOpen(false)}
        anchorRef={moreRef}
        teamMembers={teamMembers}
        projects={projects}
        clients={clients}
        value={value}
        onPick={onChange}
      />
    </div>
  );
};
