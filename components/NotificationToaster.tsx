import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Icons } from './ui/Icons';
import { useNotifications, Notification } from '../context/NotificationsContext';
import { useAuth } from '../hooks/useAuth';
import {
  formatNotificationClock,
  formatNotificationFullDate,
} from '../lib/notificationTime';
import type { NavParams, PageView } from '../types';

interface NotificationToasterProps {
  // Accepts (path, params) so the toaster can deep-link to a specific
  // task/project/client when the user clicks. Backwards-compatible with
  // legacy single-arg callers.
  onNavigate?: (path: PageView | string, params?: NavParams) => void;
}

// Mirrors the parser in NotificationsDrawer — pulls query params from
// the notification's link and merges metadata.task_id as a fallback.
function parseLinkAndMeta(link: string | null, metadata: any): { page: string; params?: NavParams } {
  if (!link) {
    const taskId = typeof metadata?.task_id === 'string' ? metadata.task_id : undefined;
    return taskId ? { page: 'calendar', params: { taskId } } : { page: 'home' };
  }
  let path = link.startsWith('/') ? link.slice(1) : link;
  let qs = '';
  const qIdx = path.indexOf('?');
  if (qIdx >= 0) {
    qs = path.slice(qIdx + 1);
    path = path.slice(0, qIdx);
  }
  const params: NavParams = {};
  if (qs) {
    try {
      const usp = new URLSearchParams(qs);
      const t = usp.get('task') || usp.get('task_id');         if (t) params.taskId    = t;
      const p = usp.get('project') || usp.get('project_id');   if (p) params.projectId = p;
      const c = usp.get('client') || usp.get('client_id');     if (c) params.clientId  = c;
    } catch { /* malformed query string */ }
  }
  if (!params.taskId && typeof metadata?.task_id === 'string') {
    params.taskId = metadata.task_id;
  }
  return { page: path || 'home', params: Object.keys(params).length ? params : undefined };
}

const TOAST_DURATION_MS = 9000;
const MAX_STACK = 3;

const priorityStyles: Record<Notification['priority'], { bar: string; ring: string; pulse: string; chip: string }> = {
  urgent: {
    bar: 'from-rose-500 via-red-500 to-orange-500',
    ring: 'ring-rose-400/40',
    pulse: 'bg-rose-500',
    chip: 'bg-rose-50 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200',
  },
  high: {
    bar: 'from-amber-400 via-orange-500 to-rose-500',
    ring: 'ring-amber-300/40',
    pulse: 'bg-amber-500',
    chip: 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
  },
  medium: {
    bar: 'from-indigo-400 via-violet-500 to-fuchsia-500',
    ring: 'ring-indigo-300/30',
    pulse: 'bg-indigo-500',
    chip: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200',
  },
  low: {
    bar: 'from-zinc-400 via-zinc-500 to-zinc-600',
    ring: 'ring-zinc-300/30',
    pulse: 'bg-zinc-400',
    chip: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  },
};

const typeIcon = (type: Notification['type']) => {
  switch (type) {
    case 'lead':
      return <Icons.Mail size={18} className="text-purple-600 dark:text-purple-400" />;
    case 'task':
      return <Icons.Check size={18} className="text-emerald-600 dark:text-emerald-400" />;
    case 'project':
      return <Icons.Briefcase size={18} className="text-blue-600 dark:text-blue-400" />;
    case 'invite':
      return <Icons.Users size={18} className="text-amber-600 dark:text-amber-400" />;
    case 'activity':
      return <Icons.Activity size={18} className="text-rose-600 dark:text-rose-400" />;
    case 'deadline':
      return <Icons.Clock size={18} className="text-orange-600 dark:text-orange-400" />;
    case 'security':
      return <Icons.Shield size={18} className="text-red-600 dark:text-red-400" />;
    case 'billing':
      return <Icons.DollarSign size={18} className="text-green-600 dark:text-green-400" />;
    default:
      return <Icons.Bell size={18} className="text-zinc-600 dark:text-zinc-400" />;
  }
};

const typeLabel = (type: Notification['type']): string => {
  switch (type) {
    case 'lead': return 'New lead';
    case 'task': return 'Task';
    case 'project': return 'Project';
    case 'invite': return 'Invite';
    case 'activity': return 'Activity';
    case 'deadline': return 'Deadline';
    case 'security': return 'Security';
    case 'billing': return 'Billing';
    case 'mention': return 'Mention';
    default: return 'Notice';
  }
};

// Small, self-contained "ding" using Web Audio — no dependency, no asset.
function playDing() {
  if (typeof window === 'undefined') return;
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    setTimeout(() => ctx.close().catch(() => {}), 500);
  } catch {
    // Autoplay blocked or unsupported — silent fall-through.
  }
}

interface LiveToast {
  notification: Notification;
  shownAt: number;
}

export const NotificationToaster: React.FC<NotificationToasterProps> = ({ onNavigate }) => {
  const { notifications, markAsRead } = useNotifications();
  const { user } = useAuth();
  const [live, setLive] = useState<LiveToast[]>([]);
  // High-water mark: notifications with created_at after this are treated as
  // "newly arrived" and surfaced as toasts. We initialize it to the current
  // time so the initial hydration of existing notifications does not spam
  // toasts for items the user has already seen.
  const highWaterRef = useRef<number>(Date.now());
  const seenIdsRef = useRef<Set<string>>(new Set());

  // Seed seen-ids with the currently-loaded notifications on first mount so we
  // never toast an item that was already in the list when the app started.
  useEffect(() => {
    if (seenIdsRef.current.size === 0 && notifications.length > 0) {
      notifications.forEach(n => seenIdsRef.current.add(n.id));
    }
  }, [notifications]);

  // Detect freshly-arrived notifications and queue them as toasts.
  useEffect(() => {
    if (!user) return;
    const fresh: Notification[] = [];
    for (const n of notifications) {
      if (seenIdsRef.current.has(n.id)) continue;
      seenIdsRef.current.add(n.id);
      const createdMs = new Date(n.created_at).getTime();
      if (!isNaN(createdMs) && createdMs >= highWaterRef.current && !n.read) {
        fresh.push(n);
      }
    }
    if (fresh.length === 0) return;

    setLive(prev => {
      // newest first, cap stack
      const next = [
        ...fresh.map(n => ({ notification: n, shownAt: Date.now() })),
        ...prev,
      ].slice(0, MAX_STACK);
      return next;
    });

    // Only ding once per batch
    playDing();

    // Browser-level desktop notification as a bonus for high/urgent priority
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      (window as any).Notification.permission === 'granted'
    ) {
      const urgent = fresh.find(n => n.priority === 'urgent' || n.priority === 'high');
      if (urgent) {
        try {
          new (window as any).Notification(urgent.title, {
            body: urgent.message || '',
            tag: urgent.id,
            silent: false,
          });
        } catch {
          /* ignore */
        }
      }
    }
  }, [notifications, user]);

  // Request browser notification permission lazily, once, on first user interaction.
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const perm = (window as any).Notification.permission;
    if (perm !== 'default') return;
    const request = () => {
      (window as any).Notification.requestPermission?.().catch(() => {});
      window.removeEventListener('pointerdown', request);
      window.removeEventListener('keydown', request);
    };
    window.addEventListener('pointerdown', request, { once: true });
    window.addEventListener('keydown', request, { once: true });
    return () => {
      window.removeEventListener('pointerdown', request);
      window.removeEventListener('keydown', request);
    };
  }, []);

  // Auto-dismiss after TOAST_DURATION_MS.
  useEffect(() => {
    if (live.length === 0) return;
    const timers = live.map(t =>
      setTimeout(() => {
        setLive(prev => prev.filter(x => x.notification.id !== t.notification.id));
      }, TOAST_DURATION_MS - (Date.now() - t.shownAt))
    );
    return () => { timers.forEach(clearTimeout); };
  }, [live]);

  const dismiss = useCallback((id: string) => {
    setLive(prev => prev.filter(t => t.notification.id !== id));
  }, []);

  const handleClick = useCallback((n: Notification) => {
    if (!n.read) { markAsRead(n.id).catch(() => {}); }
    if (onNavigate) {
      // Parse query params + metadata so task assignments deep-link to
      // /calendar with taskId set, opening the task detail panel directly.
      const { page, params } = parseLinkAndMeta(n.link, n.metadata);
      onNavigate(page, params);
    }
    dismiss(n.id);
  }, [markAsRead, onNavigate, dismiss]);

  if (live.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 w-[360px] max-w-[calc(100vw-2rem)] pointer-events-none"
      role="region"
      aria-label="Notificaciones nuevas"
    >
      {live.map(({ notification }) => {
        const style = priorityStyles[notification.priority] || priorityStyles.medium;
        const isLead = notification.type === 'lead';
        const isUrgent = notification.priority === 'urgent' || notification.priority === 'high';
        // Task assignments get a distinct CTA + chip — the DB trigger
        // sets category='task_assignment' so we can recognize them.
        const isTaskAssignment = notification.type === 'task' && (notification.category === 'task_assignment' || notification.metadata?.assigner_id);
        const assignerName = notification.metadata?.assigner_name as string | undefined;
        const projectTitle = notification.metadata?.project_title as string | undefined;
        return (
          <div
            key={notification.id}
            className={`pointer-events-auto relative overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl ring-1 ${style.ring} border border-zinc-200/80 dark:border-zinc-800 ${isUrgent ? 'animate-in slide-in-from-right-6 fade-in duration-300' : 'animate-in slide-in-from-right-4 fade-in duration-200'}`}
          >
            {/* Priority gradient bar */}
            <div className={`h-1 w-full bg-gradient-to-r ${style.bar}`} />

            <button
              onClick={() => handleClick(notification)}
              className="w-full text-left p-4 flex gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
            >
              {/* Icon + pulse for urgent */}
              <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                  {typeIcon(notification.type)}
                </div>
                {isUrgent && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${style.pulse} opacity-70`} />
                    <span className={`relative inline-flex rounded-full h-3 w-3 ${style.pulse}`} />
                  </span>
                )}
              </div>

              {/* Body */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${style.chip}`}>
                    {typeLabel(notification.type)}
                  </span>
                  <span
                    className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums"
                    title={formatNotificationFullDate(notification.created_at)}
                  >
                    {formatNotificationClock(notification.created_at)} · today
                  </span>
                </div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-2">
                  {notification.title}
                </p>
                {notification.message && (
                  <p className="text-xs text-zinc-600 dark:text-zinc-300 line-clamp-2 mt-0.5">
                    {notification.message}
                  </p>
                )}
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">
                  {formatNotificationFullDate(notification.created_at)}
                </p>
                {isLead && (
                  <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                    Ver lead
                    <Icons.External size={12} />
                  </div>
                )}
                {isTaskAssignment && (
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    {assignerName && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300">
                        <Icons.User size={9} />
                        de {assignerName}
                      </span>
                    )}
                    {projectTitle && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                        <Icons.Briefcase size={9} />
                        {projectTitle}
                      </span>
                    )}
                    <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                      {notification.action_text || 'Abrir tarea'}
                      <Icons.External size={12} />
                    </span>
                  </div>
                )}
              </div>

              {/* Close */}
              <button
                onClick={(e) => { e.stopPropagation(); dismiss(notification.id); }}
                className="shrink-0 self-start p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                aria-label="Dismiss notification"
              >
                <Icons.X size={14} />
              </button>
            </button>

            {/* Progress bar */}
            <div className="h-0.5 w-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
              <div
                className={`h-full bg-gradient-to-r ${style.bar}`}
                style={{
                  animation: `livv-toast-progress ${TOAST_DURATION_MS}ms linear forwards`,
                }}
              />
            </div>
          </div>
        );
      })}
      <style>{`
        @keyframes livv-toast-progress {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
};
