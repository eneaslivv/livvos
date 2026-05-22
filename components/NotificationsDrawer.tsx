/**
 * NotificationsDrawer — full-height side panel that replaces the cramped
 * dropdown.  Mounted via createPortal so its z-index never fights with
 * the rest of the app, animated with a CSS slide-in (no framer-motion to
 * keep the bundle lean).
 *
 * Features:
 *  - Filter chips: All · Unread · Mentions · Tasks · Leads
 *  - Sectioned grouping: Today · Yesterday · This week · Older
 *  - Per-row mark-as-read button
 *  - Mark-all-as-read button at the top
 *  - Click row → fires onNavigate(path, params) and closes the drawer
 *  - Deep-links carrying ?task=<id> are parsed and forwarded as
 *    `params.taskId` so the Calendar page opens the task drawer.
 *  - Esc / click backdrop closes the drawer
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { Icons } from './ui/Icons';
import { useNotifications, type Notification } from '../context/NotificationsContext';
import {
  formatNotificationTime, formatNotificationFullDate,
} from '../lib/notificationTime';

// ── Types ─────────────────────────────────────────────────────────────────

export interface DrawerNavParams {
  taskId?: string;
  projectId?: string;
  clientId?: string;
}

interface NotificationsDrawerProps {
  open: boolean;
  onClose: () => void;
  /** App-level navigate. Receives the page name (no leading slash) and
   *  optional params (used for deep-link to a specific task / project). */
  onNavigate: (page: string, params?: DrawerNavParams) => void;
}

type FilterKey = 'all' | 'unread' | 'mentions' | 'tasks' | 'leads';

const FILTERS: { key: FilterKey; label: string; match: (n: Notification) => boolean }[] = [
  { key: 'all',      label: 'All',       match: () => true },
  { key: 'unread',   label: 'Unread',    match: (n) => !n.read },
  { key: 'mentions', label: 'Mentions',  match: (n) => n.type === 'mention' },
  { key: 'tasks',    label: 'Tasks',     match: (n) => n.type === 'task' || n.type === 'mention' },
  { key: 'leads',    label: 'Leads',     match: (n) => n.type === 'lead' },
];

const priorityAccent: Record<Notification['priority'], string> = {
  urgent: 'bg-rose-500',
  high:   'bg-amber-500',
  medium: 'bg-indigo-500',
  low:    'bg-zinc-400',
};

const getNotificationIcon = (type: Notification['type']) => {
  switch (type) {
    case 'lead':     return <Icons.Mail size={14} className="text-purple-500" />;
    case 'task':     return <Icons.Check size={14} className="text-emerald-500" />;
    case 'project':  return <Icons.Briefcase size={14} className="text-blue-500" />;
    case 'invite':   return <Icons.Users size={14} className="text-amber-500" />;
    case 'activity': return <Icons.Activity size={14} className="text-rose-500" />;
    case 'deadline': return <Icons.Clock size={14} className="text-orange-500" />;
    case 'security': return <Icons.Shield size={14} className="text-red-500" />;
    case 'billing':  return <Icons.DollarSign size={14} className="text-green-500" />;
    case 'mention':  return <Icons.Bell size={14} className="text-cyan-500" />;
    default:         return <Icons.Bell size={14} className="text-zinc-500" />;
  }
};

// ── Date bucketing ────────────────────────────────────────────────────────
// Groups by Today / Yesterday / This week / Older.  Returns an ORDERED
// array so React render order is stable.

interface Section { label: string; items: Notification[] }

function groupBySection(items: Notification[]): Section[] {
  const today: Notification[] = [];
  const yesterday: Notification[] = [];
  const thisWeek: Notification[] = [];
  const older: Notification[] = [];

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday); startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday); startOfWeek.setDate(startOfWeek.getDate() - 6);

  for (const n of items) {
    const t = new Date(n.created_at).getTime();
    if (t >= startOfToday.getTime()) today.push(n);
    else if (t >= startOfYesterday.getTime()) yesterday.push(n);
    else if (t >= startOfWeek.getTime()) thisWeek.push(n);
    else older.push(n);
  }

  return [
    { label: 'Today', items: today },
    { label: 'Yesterday', items: yesterday },
    { label: 'This week', items: thisWeek },
    { label: 'Older', items: older },
  ].filter(s => s.items.length > 0);
}

// ── Deep-link parsing ─────────────────────────────────────────────────────
// Notifications can carry `link='/calendar?task=<uuid>'` or pure paths like
// `/sales_leads`. Split into page name + params so the App router gets the
// data shape it expects (no react-router involved).

function parseLink(link: string | null, metadata: Record<string, any>): { page: string; params?: DrawerNavParams } | null {
  if (!link) return null;
  // Drop leading slash so "/calendar" → "calendar"
  let path = link.startsWith('/') ? link.slice(1) : link;
  let qs = '';
  const qIdx = path.indexOf('?');
  if (qIdx >= 0) {
    qs = path.slice(qIdx + 1);
    path = path.slice(0, qIdx);
  }
  const params: DrawerNavParams = {};
  if (qs) {
    try {
      const usp = new URLSearchParams(qs);
      // Accept both `task` (legacy) and `task_id` (new — matches the
      // DB triggers' link format in 2026-06-08_task_assignment_full.sql).
      const t = usp.get('task') || usp.get('task_id');         if (t) params.taskId    = t;
      const p = usp.get('project') || usp.get('project_id');   if (p) params.projectId = p;
      const c = usp.get('client') || usp.get('client_id');     if (c) params.clientId  = c;
    } catch { /* ignore malformed */ }
  }
  // Fallback: also pull from metadata.task_id which the DB triggers always set.
  if (!params.taskId && typeof metadata?.task_id === 'string') {
    params.taskId = metadata.task_id;
  }
  return { page: path || 'home', params: Object.keys(params).length ? params : undefined };
}

// ── Component ─────────────────────────────────────────────────────────────

export const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({ open, onClose, onNavigate }) => {
  const { notifications, unreadCount, markAsRead, markAllAsRead, isLoading } = useNotifications();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [reviewingIds, setReviewingIds] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);

  // Esc closes the drawer.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Lock body scroll while open so the drawer is the only thing scrolling.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const filtered = useMemo(() => {
    const f = FILTERS.find(x => x.key === filter)!;
    return notifications.filter(f.match);
  }, [notifications, filter]);

  const sections = useMemo(() => groupBySection(filtered), [filtered]);

  const handleClick = useCallback(async (n: Notification) => {
    if (!n.read) {
      void markAsRead(n.id);
    }
    const target = parseLink(n.link, n.metadata || {});
    if (target) {
      onNavigate(target.page, target.params);
    }
    onClose();
  }, [markAsRead, onNavigate, onClose]);

  const handleMarkRead = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    void markAsRead(id);
  }, [markAsRead]);

  // For portal-access requests we keep the legacy approve/reject buttons.
  const handleReviewRequest = useCallback(async (n: Notification, status: 'approved' | 'rejected') => {
    const requestId = n.metadata?.request_id;
    if (!requestId) return;
    setReviewingIds(prev => new Set(prev).add(n.id));
    try {
      await supabase.rpc('review_portal_request', { p_request_id: requestId, p_status: status });
      await markAsRead(n.id);
    } finally {
      setReviewingIds(prev => { const next = new Set(prev); next.delete(n.id); return next; });
    }
  }, [markAsRead]);

  if (!open) return null;

  const filterCounts: Record<FilterKey, number> = {
    all:      notifications.length,
    unread:   notifications.filter(n => !n.read).length,
    mentions: notifications.filter(n => n.type === 'mention').length,
    tasks:    notifications.filter(n => n.type === 'task' || n.type === 'mention').length,
    leads:    notifications.filter(n => n.type === 'lead').length,
  };

  return createPortal(
    <div className="fixed inset-0 z-[60]" aria-modal="true" role="dialog">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-200"
        onClick={onClose}
      />
      {/* Panel — slides in from the right */}
      <div
        ref={panelRef}
        className="absolute top-0 right-0 h-full w-full sm:w-[420px] md:w-[460px] bg-white dark:bg-zinc-900 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300"
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-zinc-100 dark:border-zinc-800/60">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">Inbox</div>
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">
                Notifications
                {unreadCount > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-rose-500 text-white text-[11px] font-bold align-middle">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label="Close"
            >
              <Icons.X size={18} />
            </button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-1 mt-3 overflow-x-auto -mx-1 px-1 pb-1">
            {FILTERS.map(f => {
              const count = filterCounts[f.key];
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                    active
                      ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                      : 'text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                  }`}
                >
                  {f.label}
                  {count > 0 && (
                    <span className={`ml-1.5 ${active ? 'text-white/70 dark:text-zinc-900/60' : 'text-zinc-400'}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="shrink-0 ml-auto px-2.5 py-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-md inline-flex items-center gap-1"
              >
                <Icons.Check size={11} /> Mark all read
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-zinc-400">
              <div className="w-5 h-5 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 px-8 text-center">
              <div className="w-14 h-14 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-3">
                <Icons.Inbox size={26} className="text-zinc-400" />
              </div>
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                {filter === 'unread' ? "You're all caught up" : 'No notifications yet'}
              </p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 max-w-[260px]">
                {filter === 'unread'
                  ? 'Nothing unread on this filter. Switch to "All" to see history.'
                  : "We'll ping you when something needs your attention."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {sections.map(section => (
                <div key={section.label}>
                  <div className="px-5 pt-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500 bg-zinc-50/60 dark:bg-zinc-900/40 sticky top-0 backdrop-blur z-[1]">
                    {section.label}
                  </div>
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                    {section.items.map(n => {
                      const reviewing = reviewingIds.has(n.id);
                      return (
                        <button
                          key={n.id}
                          onClick={() => handleClick(n)}
                          className={`group relative w-full text-left px-5 py-3 transition-colors flex gap-3 ${
                            !n.read
                              ? 'bg-indigo-50/40 dark:bg-indigo-500/5 hover:bg-indigo-50 dark:hover:bg-indigo-500/10'
                              : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                          }`}
                        >
                          {/* Priority accent bar */}
                          {!n.read && (
                            <span
                              aria-hidden
                              className={`absolute left-0 top-3 bottom-3 w-1 rounded-r ${priorityAccent[n.priority] || priorityAccent.medium}`}
                            />
                          )}
                          <div className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                            {getNotificationIcon(n.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className={`text-sm leading-snug ${!n.read ? 'font-semibold text-zinc-900 dark:text-zinc-100' : 'text-zinc-700 dark:text-zinc-300'}`}>
                                {n.title}
                              </p>
                              {!n.read && <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0 mt-1.5" />}
                            </div>
                            {n.message && (
                              <p className="text-[12px] text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-0.5">
                                {n.message}
                              </p>
                            )}
                            <div className="flex items-center justify-between mt-1.5 gap-2">
                              <span
                                className="text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums"
                                title={formatNotificationFullDate(n.created_at)}
                              >
                                {formatNotificationTime(n.created_at)}
                              </span>
                              {!n.read && (
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => handleMarkRead(e, n.id)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); void markAsRead(n.id); } }}
                                  className="opacity-0 group-hover:opacity-100 text-[10px] font-medium text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Icons.Check size={10} /> Mark read
                                </span>
                              )}
                            </div>
                            {/* Inline actions for portal access requests */}
                            {n.action_required && n.metadata?.request_id && !n.read && (
                              <div className="flex items-center gap-1.5 mt-2">
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => { e.stopPropagation(); handleReviewRequest(n, 'approved'); }}
                                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); handleReviewRequest(n, 'approved'); } }}
                                  className={`px-2.5 py-1 text-[10px] font-semibold bg-emerald-600 text-white rounded-md hover:bg-emerald-700 inline-flex items-center gap-1 cursor-pointer ${reviewing ? 'opacity-50 pointer-events-none' : ''}`}
                                >
                                  Approve
                                </span>
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => { e.stopPropagation(); handleReviewRequest(n, 'rejected'); }}
                                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); handleReviewRequest(n, 'rejected'); } }}
                                  className={`px-2.5 py-1 text-[10px] font-semibold bg-rose-500 text-white rounded-md hover:bg-rose-600 inline-flex items-center gap-1 cursor-pointer ${reviewing ? 'opacity-50 pointer-events-none' : ''}`}
                                >
                                  Reject
                                </span>
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800/60 text-[10px] text-zinc-400">
          {filtered.length > 0 ? (
            <>Showing {filtered.length} of {notifications.length} · Click any item to open it.</>
          ) : (
            <>{notifications.length} total in your inbox</>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
