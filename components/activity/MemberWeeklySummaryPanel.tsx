/**
 * MemberWeeklySummaryPanel — per-member weekly recap.
 *
 * Opens from the Team roster in Activity. Shows:
 *  - Header: avatar, name, period switcher (this week / last week / month)
 *  - Stat strip: completed / assigned-to-them / completed-by-them / open
 *    / overdue / sign-ins
 *  - "AI summary" button — calls gemini with member_weekly_summary prompt
 *    and produces a 3-bullet recap (wins, blockers, what's-next)
 *  - Completed tasks list (most recent first)
 *  - Open tasks (still on their plate)
 *  - Tasks they delegated (created by them, assigned to others)
 *  - Activity feed scoped to this user (login/edit/comment events)
 *
 * Context: the user wanted to "ver un resumen de cada miembro para hacer
 * resúmenes semanales". This is the primary surface for that.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { SlidePanel } from '../ui/SlidePanel';
import { Icons } from '../ui/Icons';
import { supabase } from '../../lib/supabase';
import { generateMemberWeeklySummary, type MemberWeeklySummaryResult } from '../../lib/ai';
import { errorLogger } from '../../lib/errorLogger';
import { useTenant } from '../../context/TenantContext';
import { useAuth } from '../../hooks/useAuth';

interface Member {
  id: string;
  name: string;
  email?: string;
  avatar_url?: string | null;
}

interface Task {
  id: string;
  title?: string;
  completed?: boolean;
  completed_at?: string | null;
  completed_by?: string | null;
  assignee_id?: string | null;
  assignee_ids?: string[] | null;
  assigned_to?: string | null;
  owner_id?: string | null;
  priority?: string | null;
  status?: string | null;
  project_name?: string | null;
  client_name?: string | null;
  created_at?: string | null;
  /** First time the task entered status='in-progress'. Auto-set by DB
   *  trigger; used to compute real time-to-complete. Falls back to
   *  created_at for tasks that bypassed in-progress. */
  started_at?: string | null;
  due_date?: string | null;
  start_date?: string | null;
}

// ─── Duration helpers ─────────────────────────────────────────────
// Compute time from started_at → completed_at (or created_at → completed_at
// as fallback). Returns hours as a number + a human label.
const taskDuration = (t: Task): { hours: number; label: string } | null => {
  if (!t.completed || !t.completed_at) return null;
  const startSrc = t.started_at || t.created_at;
  if (!startSrc) return null;
  const start = new Date(startSrc).getTime();
  const end = new Date(t.completed_at).getTime();
  if (!isFinite(start) || !isFinite(end) || end < start) return null;
  const hours = Math.max(0, (end - start) / 3_600_000);
  return { hours, label: humanizeDuration(hours) };
};

// "same day" / "3h" / "2d 4h" / "5d" — concise enough to fit in a row.
const humanizeDuration = (hours: number): string => {
  if (hours < 1) return 'mismo día';
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = Math.floor(hours / 24);
  const remHours = Math.round(hours - days * 24);
  if (days < 7) {
    return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
  }
  // Past 7 days, drop the hours — clutter, not signal.
  return `${days}d`;
};

// "Slow" threshold: tasks taking more than 5 days from start to completion.
// 5 days roughly = a typical work week. Anything longer is worth flagging
// so the panel and AI surface where things are sticking.
const SLOW_THRESHOLD_HOURS = 5 * 24;

// Whether a task "belongs to" the given member — checks every column
// variant (legacy single, current array, completion attribution).
const isMemberTask = (t: Task, memberId: string): boolean => {
  if (t.completed_by === memberId) return true;
  if (Array.isArray(t.assignee_ids) && t.assignee_ids.includes(memberId)) return true;
  if (t.assigned_to === memberId) return true;
  if (t.assignee_id === memberId) return true;
  return false;
};

interface Activity {
  id: string;
  user_id: string | null;
  type: string;
  action: string;
  target: string;
  created_at: string;
  metadata?: any;
}

type Period = 'this_week' | 'last_week' | 'this_month';

const PERIOD_LABEL: Record<Period, string> = {
  this_week: 'This week',
  last_week: 'Last week',
  this_month: 'This month',
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  member: Member | null;
  /** All tasks in tenant — we filter by assignee/owner/completed_by inside. */
  tasks: Task[];
  /** All activity_logs in tenant — we filter by user_id. */
  activities: Activity[];
}

const fmtDate = (s?: string | null) => {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
};
const fmtDateTime = (s?: string | null) => {
  if (!s) return '';
  const d = new Date(s);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return min < 1 ? 'just now' : `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
};

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : name.substring(0, 2)).toUpperCase();
};

// Bound a period to a [from, to) Date range. Inclusive of "to" for filtering.
const getPeriodRange = (period: Period): { from: Date; to: Date } => {
  const now = new Date();
  if (period === 'this_week') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return { from: d, to: now };
  }
  if (period === 'last_week') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { from: start, to: end };
  }
  // this_month
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: start, to: now };
};

// ─── Trend computation helpers ─────────────────────────────────────
// All client-side. Operates on the same `tasks` array the panel already
// has, so no new round-trip. The signals get passed to the AI so it can
// reference real performance shifts ("best week in 6 weeks", "output
// dropped vs last week") instead of describing the same week in isolation.

interface TrendSignals {
  /** [oldest, …, this-week] count of completed tasks, length 8. */
  weeklyCompletedLast8w: number[];
  /** Percentage delta of this-week vs the average of the prior 7 weeks. */
  vsLastWeekPct: number | null;
  /** Day of week the member completes the most tasks ('Mon'..'Sun') over last 8 weeks. */
  bestDayOfWeek: string | null;
  /** Consecutive weeks with at least 1 completion ending in this week. */
  currentStreakWeeksActive: number;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const startOfWeekMonday = (d: Date): Date => {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
  return out;
};

const computeTrendSignals = (tasks: Task[], memberId: string): TrendSignals => {
  const now = new Date();
  const thisMonday = startOfWeekMonday(now);
  // 8 weeks ending this Monday — bucket the member's completed tasks by week.
  const weeklyCounts: number[] = Array(8).fill(0);
  const weekStarts: number[] = Array(8).fill(0).map((_, i) => {
    const d = new Date(thisMonday);
    d.setDate(d.getDate() - 7 * (7 - i)); // i=0 → 7 weeks ago, i=7 → this week
    return d.getTime();
  });
  const dayCounts: number[] = Array(7).fill(0);

  for (const t of tasks) {
    if (!isMemberTask(t, memberId)) continue;
    if (!t.completed || !t.completed_at) continue;
    const tCompleted = new Date(t.completed_at);
    const tMs = tCompleted.getTime();
    // Bucket into 8-week window
    for (let i = 0; i < 8; i++) {
      const start = weekStarts[i];
      const end = i < 7 ? weekStarts[i + 1] : Infinity;
      if (tMs >= start && tMs < end) {
        weeklyCounts[i]++;
        // Day-of-week tally only counts the 8-week window.
        dayCounts[tCompleted.getDay()]++;
        break;
      }
    }
  }

  // vs prior 7 weeks (avg). Null when there's no prior data.
  const thisWeek = weeklyCounts[7];
  const prior = weeklyCounts.slice(0, 7);
  const priorTotal = prior.reduce((a, b) => a + b, 0);
  const priorAvg = priorTotal / 7;
  let vsLastWeekPct: number | null = null;
  if (priorTotal > 0) {
    vsLastWeekPct = Math.round(((thisWeek - priorAvg) / priorAvg) * 100);
  }

  // Best day of week (only when there's at least 1 completion total).
  const totalCompletedInWindow = dayCounts.reduce((a, b) => a + b, 0);
  let bestDayOfWeek: string | null = null;
  if (totalCompletedInWindow > 0) {
    const bestIdx = dayCounts.indexOf(Math.max(...dayCounts));
    bestDayOfWeek = DAY_LABELS[bestIdx];
  }

  // Streak: count consecutive weeks ending in this-week with >=1 completion.
  let currentStreakWeeksActive = 0;
  for (let i = 7; i >= 0; i--) {
    if (weeklyCounts[i] > 0) currentStreakWeeksActive++;
    else break;
  }

  return { weeklyCompletedLast8w: weeklyCounts, vsLastWeekPct, bestDayOfWeek, currentStreakWeeksActive };
};

// ─── Persisted summaries loader ────────────────────────────────────
interface SavedSummary {
  id: string;
  period: Period;
  period_label: string;
  period_from: string; // YYYY-MM-DD
  period_to: string;
  completed_count: number;
  open_count: number;
  overdue_count: number;
  delegated_count: number;
  login_count: number;
  activity_count: number;
  headline: string | null;
  wins: string[];
  blockers: string[];
  next_focus: string[];
  signals: Record<string, any>;
  generated_at: string;
}

export const MemberWeeklySummaryPanel: React.FC<Props> = ({ isOpen, onClose, member, tasks, activities }) => {
  const [period, setPeriod] = useState<Period>('this_week');
  const [aiResult, setAiResult] = useState<MemberWeeklySummaryResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  // Persisted past summaries for THIS member, sorted newest-first.
  const [savedSummaries, setSavedSummaries] = useState<SavedSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const { currentTenant } = useTenant();
  const { user: currentUser } = useAuth();

  // Reset AI summary when member or period changes — different scope = stale.
  useEffect(() => { setAiResult(null); setAiError(null); }, [member?.id, period]);

  // Load past summaries whenever the member changes. Newest 12 across any period.
  useEffect(() => {
    if (!member || !currentTenant?.id) { setSavedSummaries([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('member_performance_summaries')
          .select('id, period, period_label, period_from, period_to, completed_count, open_count, overdue_count, delegated_count, login_count, activity_count, headline, wins, blockers, next_focus, signals, generated_at')
          .eq('tenant_id', currentTenant.id)
          .eq('user_id', member.id)
          .order('period_from', { ascending: false })
          .limit(12);
        if (cancelled) return;
        if (error) {
          errorLogger.warn('member summaries load failed', error);
          setSavedSummaries([]);
          return;
        }
        setSavedSummaries((data as any) || []);
      } catch (err) {
        if (!cancelled) errorLogger.warn('member summaries load throw', err);
      }
    })();
    return () => { cancelled = true; };
  }, [member?.id, currentTenant?.id]);

  const range = useMemo(() => getPeriodRange(period), [period]);

  // Tasks scoped to this member + period.
  const scope = useMemo(() => {
    if (!member) return {
      completedInPeriod: [], openAssigned: [], delegatedByThem: [], overdue: [],
      allCompletedHistorical: [], slowestInPeriod: [],
      avgHours: null as number | null, longTimers: [] as Task[],
    };

    const isInRange = (s?: string | null) => {
      if (!s) return false;
      const d = new Date(s);
      return d >= range.from && d <= range.to;
    };

    const completedInPeriod = tasks
      .filter(t => isMemberTask(t, member.id) && t.completed && isInRange(t.completed_at))
      .sort((a, b) => new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime());

    const openAssigned = tasks
      .filter(t => isMemberTask(t, member.id) && !t.completed && t.status !== 'cancelled')
      .sort((a, b) => (b.priority === 'urgent' ? 1 : 0) - (a.priority === 'urgent' ? 1 : 0));

    // "Delegated by them" — tasks they own but are assigned to someone else.
    const delegatedByThem = tasks.filter(t => {
      if (t.owner_id !== member.id) return false;
      const otherAssignee =
        (Array.isArray(t.assignee_ids) && t.assignee_ids.find(id => id && id !== member.id))
        || (t.assigned_to && t.assigned_to !== member.id ? t.assigned_to : null)
        || (t.assignee_id && t.assignee_id !== member.id ? t.assignee_id : null);
      return !!otherAssignee;
    });

    const todayMs = new Date().setHours(0, 0, 0, 0);
    const overdue = openAssigned.filter(t => {
      const due = t.due_date || t.start_date;
      return due && new Date(due).getTime() < todayMs;
    });

    const allCompletedHistorical = tasks
      .filter(t => isMemberTask(t, member.id) && t.completed)
      .sort((a, b) => new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime());

    // ─── Duration analytics ──────────────────────────────────────
    // Top 5 slowest closures in the period — anything taking longer than
    // SLOW_THRESHOLD_HOURS gets surfaced as a "where are we sticking" signal.
    const completedWithDuration = completedInPeriod
      .map(t => ({ task: t, dur: taskDuration(t) }))
      .filter(x => x.dur !== null) as { task: Task; dur: { hours: number; label: string } }[];
    const slowestInPeriod = completedWithDuration
      .filter(x => x.dur.hours >= SLOW_THRESHOLD_HOURS)
      .sort((a, b) => b.dur.hours - a.dur.hours)
      .slice(0, 5)
      .map(x => x.task);

    // Average completion time across all completions in the period (hours).
    const avgHours = completedWithDuration.length > 0
      ? Math.round(
          completedWithDuration.reduce((s, x) => s + x.dur.hours, 0)
          / completedWithDuration.length
        )
      : null;

    // OPEN tasks that are sitting in-progress for >SLOW_THRESHOLD without
    // being closed yet. These are the "where are things stuck right now"
    // signal. Excludes tasks that were just created — only flags ones that
    // have actually been worked on (started_at set).
    const nowMs = Date.now();
    const longTimers = openAssigned
      .filter(t => {
        const started = t.started_at;
        if (!started) return false;
        const ageHours = (nowMs - new Date(started).getTime()) / 3_600_000;
        return ageHours >= SLOW_THRESHOLD_HOURS;
      })
      .sort((a, b) => new Date(a.started_at!).getTime() - new Date(b.started_at!).getTime())
      .slice(0, 5);

    return { completedInPeriod, openAssigned, delegatedByThem, overdue, allCompletedHistorical, slowestInPeriod, avgHours, longTimers };
  }, [member, tasks, range]);

  // Activity events scoped to this member + period.
  const memberActivities = useMemo(() => {
    if (!member) return [];
    return activities
      .filter(a => a.user_id === member.id)
      .filter(a => {
        const d = new Date(a.created_at);
        return d >= range.from && d <= range.to;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 50);
  }, [member, activities, range]);

  const loginCount = useMemo(() => memberActivities.filter(a => a.type === 'user_login').length, [memberActivities]);

  // 8-week trend window — recomputes whenever the underlying tasks change.
  // Independent of `period` because it always shows the rolling 8 weeks.
  const trendSignals = useMemo<TrendSignals>(() => {
    if (!member) return { weeklyCompletedLast8w: Array(8).fill(0), vsLastWeekPct: null, bestDayOfWeek: null, currentStreakWeeksActive: 0 };
    return computeTrendSignals(tasks, member.id);
  }, [member, tasks]);

  // When the user opens the panel and there's a saved summary that exactly
  // matches the current period window, surface it immediately (so they see
  // last time's recap without having to regenerate). The "Regenerar" button
  // still works to refresh.
  useEffect(() => {
    if (!member || aiResult) return;
    const fromStr = range.from.toISOString().split('T')[0];
    const match = savedSummaries.find(s => s.period === period && s.period_from === fromStr);
    if (match && match.headline) {
      setAiResult({
        headline: match.headline,
        wins: match.wins || [],
        blockers: match.blockers || [],
        next_focus: match.next_focus || [],
      });
    }
  }, [savedSummaries, member, period, range.from, aiResult]);

  // ─── AI summary generation ─────────────────────────────────────────
  const handleGenerateSummary = async () => {
    if (!member) return;
    setAiLoading(true);
    setAiError(null);
    try {
      // Last 3 prior summaries from the SAME period bucket — gives the AI
      // a sense of trajectory ("last week you said X, this week Y").
      const priorOfSamePeriod = savedSummaries
        .filter(s => s.period === period && s.period_from !== range.from.toISOString().split('T')[0])
        .slice(0, 3)
        .map(s => ({
          period_from: s.period_from,
          period_to: s.period_to,
          headline: s.headline,
          wins: (s.wins || []).slice(0, 3),
          blockers: (s.blockers || []).slice(0, 3),
          completed_count: s.completed_count,
        }));

      const payload = {
        member: { name: member.name, id: member.id },
        period: PERIOD_LABEL[period],
        period_range: { from: range.from.toISOString().split('T')[0], to: range.to.toISOString().split('T')[0] },
        completed_count: scope.completedInPeriod.length,
        // Each completed task now carries duration_hours + duration_label
        // so the AI can call out specific slow closures by name.
        completed: scope.completedInPeriod.slice(0, 30).map(t => {
          const dur = taskDuration(t);
          return {
            title: t.title,
            project: t.project_name,
            client: t.client_name,
            completed_at: t.completed_at,
            priority: t.priority,
            duration_hours: dur ? Math.round(dur.hours) : null,
            duration_label: dur ? dur.label : null,
          };
        }),
        open_count: scope.openAssigned.length,
        open_high_priority: scope.openAssigned.filter(t => t.priority === 'high' || t.priority === 'urgent').slice(0, 10).map(t => ({
          title: t.title,
          priority: t.priority,
          project: t.project_name,
        })),
        overdue_count: scope.overdue.length,
        delegated_count: scope.delegatedByThem.length,
        login_count: loginCount,
        activity_count: memberActivities.length,
        // Duration analytics so the AI can flag where things are sticking.
        duration_stats: {
          avg_hours_in_period: scope.avgHours,
          slow_threshold_hours: SLOW_THRESHOLD_HOURS,
          slowest_completed_in_period: scope.slowestInPeriod.map(t => ({
            title: t.title,
            project: t.project_name,
            duration_label: taskDuration(t)?.label || null,
            duration_hours: Math.round(taskDuration(t)?.hours || 0),
          })),
          long_running_open_now: scope.longTimers.map(t => ({
            title: t.title,
            project: t.project_name,
            in_progress_for_label: humanizeDuration((Date.now() - new Date(t.started_at!).getTime()) / 3_600_000),
            in_progress_for_hours: Math.round((Date.now() - new Date(t.started_at!).getTime()) / 3_600_000),
          })),
        },
        // Performance learning context — drives "best week in N" / trend phrasing.
        trend: {
          weekly_completed_last_8w: trendSignals.weeklyCompletedLast8w,
          vs_last_week_pct: trendSignals.vsLastWeekPct,
          best_day_of_week: trendSignals.bestDayOfWeek,
          current_streak_weeks_active: trendSignals.currentStreakWeeksActive,
        },
        prior_summaries: priorOfSamePeriod,
      };
      const result = await generateMemberWeeklySummary(JSON.stringify(payload));
      setAiResult(result);

      // Persist so future runs can reference this in prior_summaries, and
      // so the panel can show history without re-asking the AI. Upserts on
      // the (tenant, user, period, period_from) uniqueness so a regenerate
      // overwrites the previous attempt for the same window.
      if (currentTenant?.id) {
        try {
          const { error: upsertErr } = await supabase
            .from('member_performance_summaries')
            .upsert({
              tenant_id: currentTenant.id,
              user_id: member.id,
              period,
              period_label: PERIOD_LABEL[period],
              period_from: range.from.toISOString().split('T')[0],
              period_to: range.to.toISOString().split('T')[0],
              completed_count: scope.completedInPeriod.length,
              open_count: scope.openAssigned.length,
              overdue_count: scope.overdue.length,
              delegated_count: scope.delegatedByThem.length,
              login_count: loginCount,
              activity_count: memberActivities.length,
              headline: result.headline || null,
              wins: result.wins || [],
              blockers: result.blockers || [],
              next_focus: result.next_focus || [],
              signals: trendSignals,
              generated_by: currentUser?.id || null,
              generated_at: new Date().toISOString(),
            }, { onConflict: 'tenant_id,user_id,period,period_from' });
          if (upsertErr) {
            errorLogger.warn('member summary upsert failed', upsertErr);
          } else {
            // Re-fetch so the History section + "vs prior" reflect the new row.
            const { data } = await supabase
              .from('member_performance_summaries')
              .select('id, period, period_label, period_from, period_to, completed_count, open_count, overdue_count, delegated_count, login_count, activity_count, headline, wins, blockers, next_focus, signals, generated_at')
              .eq('tenant_id', currentTenant.id)
              .eq('user_id', member.id)
              .order('period_from', { ascending: false })
              .limit(12);
            if (data) setSavedSummaries(data as any);
          }
        } catch (err) {
          errorLogger.warn('member summary persist throw', err);
        }
      }
    } catch (err: any) {
      setAiError(err?.message || 'Could not generate summary');
    } finally {
      setAiLoading(false);
    }
  };

  if (!member) return null;

  const stats = [
    { label: 'Completed', value: scope.completedInPeriod.length, color: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Open assigned', value: scope.openAssigned.length, color: 'text-zinc-700 dark:text-zinc-300' },
    { label: 'Delegated', value: scope.delegatedByThem.length, color: 'text-zinc-500 dark:text-zinc-400' },
    { label: 'Overdue', value: scope.overdue.length, color: scope.overdue.length > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-500' },
    { label: 'Sign-ins', value: loginCount, color: 'text-teal-600 dark:text-teal-400' },
    { label: 'Events', value: memberActivities.length, color: 'text-zinc-500 dark:text-zinc-400' },
  ];

  return (
    <SlidePanel isOpen={isOpen} onClose={onClose} width="2xl">
      <div className="px-6 py-5">
        {/* Header — avatar + name + period switcher */}
        <div className="flex items-start gap-4 mb-6">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 text-white flex items-center justify-center text-base font-bold shrink-0 shadow-md">
            {member.avatar_url
              ? <img src={member.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
              : getInitials(member.name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400 mb-1">© Weekly recap</div>
            <h2 className="text-2xl font-light tracking-tight text-zinc-900 dark:text-zinc-100">{member.name}</h2>
            {member.email && (
              <p className="text-[12px] text-zinc-400 truncate">{member.email}</p>
            )}
          </div>
        </div>

        {/* Period switcher */}
        <div className="inline-flex items-center gap-0.5 p-0.5 bg-zinc-100 dark:bg-zinc-800/60 rounded-full mb-5">
          {(['this_week', 'last_week', 'this_month'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded-full text-[11px] font-medium transition-colors ${
                period === p
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
          {stats.map(s => (
            <div key={s.label} className="px-3 py-2 bg-white dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800 rounded-xl">
              <div className="text-[9px] uppercase tracking-wider text-zinc-400 font-semibold mb-0.5 truncate">{s.label}</div>
              <div className={`text-lg font-light tabular-nums ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* 8-week trend strip — sparkline of weekly completions, plus
            chips for vs-last-week, best day of week, current streak.
            All learned from this member's own task history. */}
        <TrendStrip signals={trendSignals} />


        {/* AI summary card */}
        <div className="mb-6 p-4 rounded-2xl bg-gradient-to-br from-amber-50 via-white to-white dark:from-amber-500/10 dark:via-zinc-900 dark:to-zinc-900 border border-amber-200/50 dark:border-amber-500/15">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-100/70 dark:bg-amber-500/15">
                <Icons.Sparkles size={13} className="text-amber-600 dark:text-amber-400" />
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-400">AI Recap</span>
              <span className="text-[10px] text-zinc-400">· {PERIOD_LABEL[period]}</span>
            </div>
            <button
              onClick={handleGenerateSummary}
              disabled={aiLoading}
              className="text-[10px] font-medium px-2.5 py-1 rounded-md bg-amber-100/80 hover:bg-amber-200/70 dark:bg-amber-500/15 dark:hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 disabled:opacity-50 transition-colors"
            >
              {aiLoading ? 'Generating…' : aiResult ? 'Regenerate' : 'Generate recap'}
            </button>
          </div>

          {aiError && <p className="text-[11px] text-rose-500 mt-2">{aiError}</p>}

          {!aiResult && !aiLoading && !aiError && (
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400 italic mt-1">
              Click "Generar" para que la IA arme un resumen de los logros, bloqueos y próximos pasos de {member.name.split(' ')[0]}.
            </p>
          )}

          {aiResult && (
            <div className="space-y-3 mt-3">
              {aiResult.headline && (
                <p className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100 leading-snug">
                  {aiResult.headline}
                </p>
              )}
              {aiResult.wins && aiResult.wins.length > 0 && (
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold mb-1">✓ Wins</div>
                  <ul className="space-y-0.5">
                    {aiResult.wins.map((w, i) => (
                      <li key={i} className="text-[12px] text-zinc-700 dark:text-zinc-200 leading-snug">— {w}</li>
                    ))}
                  </ul>
                </div>
              )}
              {aiResult.blockers && aiResult.blockers.length > 0 && (
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-rose-600 dark:text-rose-400 font-semibold mb-1">⚠ Blockers / open items</div>
                  <ul className="space-y-0.5">
                    {aiResult.blockers.map((b, i) => (
                      <li key={i} className="text-[12px] text-zinc-700 dark:text-zinc-200 leading-snug">— {b}</li>
                    ))}
                  </ul>
                </div>
              )}
              {aiResult.next_focus && aiResult.next_focus.length > 0 && (
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-amber-700 dark:text-amber-400 font-semibold mb-1">→ Focus next week</div>
                  <ul className="space-y-0.5">
                    {aiResult.next_focus.map((n, i) => (
                      <li key={i} className="text-[12px] text-zinc-700 dark:text-zinc-200 leading-snug">— {n}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Completed tasks list — each row now carries a duration chip
            (started_at → completed_at) so the user can see at a glance
            which tasks took a beat vs which closed same-day. */}
        <Section
          title="Completed tasks"
          count={scope.completedInPeriod.length}
          emptyText="No tasks completed in this period."
          headerExtra={scope.avgHours != null ? (
            <span className="text-[10px] text-zinc-400">
              avg <span className="text-zinc-600 dark:text-zinc-300 font-medium tabular-nums">{humanizeDuration(scope.avgHours)}</span> per task
            </span>
          ) : undefined}
        >
          {scope.completedInPeriod.slice(0, 25).map(t => {
            const dur = taskDuration(t);
            const isSlow = dur && dur.hours >= SLOW_THRESHOLD_HOURS;
            return (
              <TaskRow
                key={t.id}
                icon={<Icons.CheckCircle size={11} className="text-emerald-500" />}
                title={t.title || 'Untitled'}
                subtitle={[t.project_name, t.client_name].filter(Boolean).join(' · ') || undefined}
                meta={
                  dur
                    ? `${fmtDate(t.completed_at)} · tomó ${dur.label}`
                    : fmtDate(t.completed_at)
                }
                metaClass={isSlow ? 'text-amber-600 dark:text-amber-400 font-medium' : undefined}
                priority={t.priority}
                strike
              />
            );
          })}
          {scope.completedInPeriod.length > 25 && (
            <p className="text-[10px] text-zinc-400 italic px-1 mt-1">+{scope.completedInPeriod.length - 25} más</p>
          )}
        </Section>

        {/* Slowest closures in the period — only renders when there's at
            least one task above the threshold. Helps the user see which
            specific deliverables are dragging out, not just an aggregate. */}
        {scope.slowestInPeriod.length > 0 && (
          <Section
            title="Tardó más de la cuenta"
            count={scope.slowestInPeriod.length}
            tone="warning"
            emptyText=""
          >
            {scope.slowestInPeriod.map(t => {
              const dur = taskDuration(t)!;
              return (
                <TaskRow
                  key={t.id}
                  icon={<Icons.Clock size={11} className="text-amber-500" />}
                  title={t.title || 'Untitled'}
                  subtitle={[t.project_name, t.client_name].filter(Boolean).join(' · ') || undefined}
                  meta={`${dur.label} · cerrada ${fmtDate(t.completed_at)}`}
                  metaClass="text-amber-600 dark:text-amber-400 font-medium"
                  priority={t.priority}
                />
              );
            })}
          </Section>
        )}

        {/* Tasks currently sitting in-progress for >5 days. These are the
            "where are we stuck right now" signal — different from overdue
            (which is about due_date) because it's purely about how long
            the task has been actively on someone's plate. */}
        {scope.longTimers.length > 0 && (
          <Section
            title="In progress for a while"
            count={scope.longTimers.length}
            tone="warning"
            emptyText=""
          >
            {scope.longTimers.map(t => {
              const ageHours = (Date.now() - new Date(t.started_at!).getTime()) / 3_600_000;
              return (
                <TaskRow
                  key={t.id}
                  icon={<Icons.Clock size={11} className="text-rose-500" />}
                  title={t.title || 'Untitled'}
                  subtitle={[t.project_name, t.client_name].filter(Boolean).join(' · ') || undefined}
                  meta={`empezada hace ${humanizeDuration(ageHours)}`}
                  metaClass="text-rose-600 dark:text-rose-400 font-medium"
                  priority={t.priority}
                />
              );
            })}
          </Section>
        )}

        {/* Open / pending tasks */}
        <Section
          title="Open assigned"
          count={scope.openAssigned.length}
          tone={scope.overdue.length > 0 ? 'warning' : 'default'}
          emptyText="No open assigned tasks."
        >
          {scope.openAssigned.slice(0, 15).map(t => {
            const due = (t as any).due_date || (t as any).start_date;
            const isOverdue = due && new Date(due).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);
            return (
              <TaskRow
                key={t.id}
                icon={<span className={`w-2.5 h-2.5 rounded-full ${
                  t.status === 'in-progress' ? 'bg-blue-500' : 'bg-zinc-300 dark:bg-zinc-600'
                }`} />}
                title={t.title || 'Untitled'}
                subtitle={[t.project_name, t.client_name].filter(Boolean).join(' · ') || undefined}
                meta={due ? `${isOverdue ? '⚠ Overdue ' : 'Due '}${fmtDate(due)}` : undefined}
                metaClass={isOverdue ? 'text-rose-500 dark:text-rose-400' : undefined}
                priority={t.priority}
              />
            );
          })}
          {scope.openAssigned.length > 15 && (
            <p className="text-[10px] text-zinc-400 italic px-1 mt-1">+{scope.openAssigned.length - 15} más</p>
          )}
        </Section>

        {/* Delegated */}
        {scope.delegatedByThem.length > 0 && (
          <Section
            title="Delegated to others"
            count={scope.delegatedByThem.length}
            emptyText=""
          >
            {scope.delegatedByThem.slice(0, 10).map(t => (
              <TaskRow
                key={t.id}
                icon={<Icons.External size={11} className="text-zinc-400" />}
                title={t.title || 'Untitled'}
                subtitle={[t.project_name, t.client_name].filter(Boolean).join(' · ') || undefined}
                meta={t.completed ? `Completed ${fmtDate(t.completed_at)}` : 'In progress'}
              />
            ))}
          </Section>
        )}

        {/* Activity timeline */}
        {memberActivities.length > 0 && (
          <Section
            title="Activity"
            count={memberActivities.length}
            emptyText=""
          >
            <div className="space-y-1">
              {memberActivities.slice(0, 20).map(a => (
                <div key={a.id} className="flex items-center gap-2 px-1 py-0.5 text-[11px]">
                  <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-600 shrink-0" />
                  <span className="flex-1 text-zinc-600 dark:text-zinc-400 truncate">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">{a.action}</span>
                    {' '}
                    <span>{a.target}</span>
                  </span>
                  <span className="text-[9px] text-zinc-400 shrink-0">{fmtDateTime(a.created_at)}</span>
                </div>
              ))}
              {memberActivities.length > 20 && (
                <p className="text-[10px] text-zinc-400 italic px-1">+{memberActivities.length - 20} more events</p>
              )}
            </div>
          </Section>
        )}

        {/* Past AI recaps — collapsed by default. Each row shows the
            window, completed count, headline, and (when expanded) wins.
            This is the "memory" — every regeneration writes a row, so
            over time we have a real performance log per member. */}
        {savedSummaries.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setShowHistory(v => !v)}
              className="w-full flex items-center justify-between gap-2 mb-2 text-left group"
            >
              <div className="flex items-center gap-2">
                <Icons.ChevronDown
                  size={11}
                  className={`text-zinc-400 transition-transform ${showHistory ? '' : '-rotate-90'}`}
                />
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors">
                  Recap history
                </span>
                <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded font-semibold bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  {savedSummaries.length}
                </span>
              </div>
              <span className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800" />
            </button>
            {showHistory && (
              <div className="space-y-1.5">
                {savedSummaries.map(s => (
                  <SavedSummaryRow key={s.id} summary={s} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </SlidePanel>
  );
};

// ─── TrendStrip — 8-week sparkline + signals chips ────────────────
const TrendStrip: React.FC<{ signals: TrendSignals }> = ({ signals }) => {
  const max = Math.max(...signals.weeklyCompletedLast8w, 1);
  const hasData = signals.weeklyCompletedLast8w.some(v => v > 0);
  if (!hasData) {
    return (
      <div className="mb-6 px-3 py-2.5 bg-white/40 dark:bg-zinc-900/40 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl text-[11px] text-zinc-400 italic">
        No completed tasks in the last 8 weeks. The trend chart appears once you start marking tasks done.
      </div>
    );
  }
  const trendColor = signals.vsLastWeekPct == null
    ? 'text-zinc-500'
    : signals.vsLastWeekPct > 0
      ? 'text-emerald-600 dark:text-emerald-400'
      : signals.vsLastWeekPct < 0
        ? 'text-rose-500 dark:text-rose-400'
        : 'text-zinc-500';
  const trendArrow = signals.vsLastWeekPct == null ? '·'
    : signals.vsLastWeekPct > 0 ? '▲'
    : signals.vsLastWeekPct < 0 ? '▼' : '→';
  return (
    <div className="mb-6 px-3 py-3 bg-white/60 dark:bg-zinc-900/40 border border-zinc-100 dark:border-zinc-800 rounded-xl">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
          Tendencia · 8 semanas
        </span>
        <div className="flex items-center gap-2">
          {signals.vsLastWeekPct != null && (
            <span className={`text-[11px] font-medium tabular-nums ${trendColor}`}>
              {trendArrow} {signals.vsLastWeekPct > 0 ? '+' : ''}{signals.vsLastWeekPct}% vs prom.
            </span>
          )}
          {signals.bestDayOfWeek && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
              best: {signals.bestDayOfWeek}
            </span>
          )}
          {signals.currentStreakWeeksActive >= 2 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 font-medium">
              {signals.currentStreakWeeksActive}w streak
            </span>
          )}
        </div>
      </div>
      {/* Sparkline */}
      <div className="flex items-end gap-1 h-10">
        {signals.weeklyCompletedLast8w.map((v, i) => {
          const isThisWeek = i === 7;
          const pct = (v / max) * 100;
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center justify-end gap-1"
              title={`${i === 7 ? 'This week' : `${7 - i}w ago`}: ${v} ${v === 1 ? 'task' : 'tasks'}`}
            >
              <div
                className={`w-full rounded-sm transition-all ${
                  isThisWeek
                    ? 'bg-zinc-900 dark:bg-zinc-100'
                    : 'bg-zinc-300 dark:bg-zinc-700'
                }`}
                style={{ height: `${Math.max(4, pct)}%` }}
              />
              <span className={`text-[8px] tabular-nums ${isThisWeek ? 'text-zinc-700 dark:text-zinc-300 font-medium' : 'text-zinc-400'}`}>
                {v}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── SavedSummaryRow — collapsible past recap entry ─────────────────
const SavedSummaryRow: React.FC<{ summary: SavedSummary }> = ({ summary }) => {
  const [expanded, setExpanded] = useState(false);
  const dateLabel = `${fmtDate(summary.period_from)} → ${fmtDate(summary.period_to)}`;
  return (
    <div className="rounded-lg border border-zinc-100 dark:border-zinc-800 overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 shrink-0">
          {summary.period_label}
        </span>
        <span className="text-[10px] text-zinc-400 shrink-0">·</span>
        <span className="text-[10px] tabular-nums text-zinc-500 shrink-0">{dateLabel}</span>
        <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 shrink-0 font-semibold">
          {summary.completed_count} ✓
        </span>
        {summary.headline && (
          <span className="text-[11px] text-zinc-700 dark:text-zinc-200 truncate flex-1">
            {summary.headline}
          </span>
        )}
        <Icons.ChevronDown
          size={11}
          className={`text-zinc-400 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-2 bg-zinc-50/50 dark:bg-zinc-900/40 border-t border-zinc-100 dark:border-zinc-800">
          {summary.wins.length > 0 && (
            <div>
              <div className="text-[9px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold mb-1">✓ Wins</div>
              <ul className="space-y-0.5">
                {summary.wins.slice(0, 5).map((w, i) => (
                  <li key={i} className="text-[11px] text-zinc-700 dark:text-zinc-200 leading-snug">— {w}</li>
                ))}
              </ul>
            </div>
          )}
          {summary.blockers.length > 0 && (
            <div>
              <div className="text-[9px] uppercase tracking-wider text-rose-600 dark:text-rose-400 font-semibold mb-1">⚠ Bloqueos</div>
              <ul className="space-y-0.5">
                {summary.blockers.slice(0, 3).map((b, i) => (
                  <li key={i} className="text-[11px] text-zinc-700 dark:text-zinc-200 leading-snug">— {b}</li>
                ))}
              </ul>
            </div>
          )}
          {summary.next_focus.length > 0 && (
            <div>
              <div className="text-[9px] uppercase tracking-wider text-amber-700 dark:text-amber-400 font-semibold mb-1">→ Foco</div>
              <ul className="space-y-0.5">
                {summary.next_focus.slice(0, 3).map((n, i) => (
                  <li key={i} className="text-[11px] text-zinc-700 dark:text-zinc-200 leading-snug">— {n}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────
//  Sub-components
// ──────────────────────────────────────────────────────────────────────

const Section: React.FC<{
  title: string;
  count: number;
  emptyText: string;
  tone?: 'default' | 'warning';
  /** Optional right-aligned annotation rendered next to the title — used
   *  for "promedio Xh por tarea" on the completed list. */
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, count, emptyText, tone = 'default', headerExtra, children }) => (
  <div className="mb-6">
    <div className="flex items-center gap-2 mb-2">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
        {title}
      </span>
      <span className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded font-semibold ${
        tone === 'warning' ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400'
        : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
      }`}>{count}</span>
      <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800" />
      {headerExtra}
    </div>
    {count === 0 && emptyText
      ? <p className="text-[11px] text-zinc-400 italic px-1">{emptyText}</p>
      : <div className="space-y-0.5">{children}</div>}
  </div>
);

const TaskRow: React.FC<{
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  meta?: string;
  metaClass?: string;
  priority?: string | null;
  strike?: boolean;
}> = ({ icon, title, subtitle, meta, metaClass, priority, strike }) => (
  <div className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
    <span className="w-3 flex items-center justify-center shrink-0">{icon}</span>
    <div className="flex-1 min-w-0">
      <div className={`text-[12px] truncate ${strike ? 'line-through text-zinc-500 dark:text-zinc-400' : 'text-zinc-700 dark:text-zinc-200'}`}>
        {title}
      </div>
      {subtitle && (
        <div className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">{subtitle}</div>
      )}
    </div>
    {priority && priority !== 'medium' && (
      <span className={`text-[9px] uppercase tracking-wider font-bold px-1 py-0 rounded ${
        priority === 'urgent' ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400'
        : priority === 'high' ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400'
        : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
      }`}>{priority}</span>
    )}
    {meta && (
      <span className={`text-[10px] whitespace-nowrap shrink-0 ${metaClass || 'text-zinc-400 dark:text-zinc-500'}`}>{meta}</span>
    )}
  </div>
);
