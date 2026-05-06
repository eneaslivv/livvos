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
  due_date?: string | null;
  start_date?: string | null;
}

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
  this_week: 'Esta semana',
  last_week: 'Semana pasada',
  this_month: 'Este mes',
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
  return new Date(s).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
};
const fmtDateTime = (s?: string | null) => {
  if (!s) return '';
  const d = new Date(s);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return min < 1 ? 'recién' : `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
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

export const MemberWeeklySummaryPanel: React.FC<Props> = ({ isOpen, onClose, member, tasks, activities }) => {
  const [period, setPeriod] = useState<Period>('this_week');
  const [aiResult, setAiResult] = useState<MemberWeeklySummaryResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Reset AI summary when member or period changes — different scope = stale.
  useEffect(() => { setAiResult(null); setAiError(null); }, [member?.id, period]);

  const range = useMemo(() => getPeriodRange(period), [period]);

  // Tasks scoped to this member + period.
  const scope = useMemo(() => {
    if (!member) return { completedInPeriod: [], openAssigned: [], delegatedByThem: [], overdue: [], allCompletedHistorical: [] };

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

    return { completedInPeriod, openAssigned, delegatedByThem, overdue, allCompletedHistorical };
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

  // ─── AI summary generation ─────────────────────────────────────────
  const handleGenerateSummary = async () => {
    if (!member) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const payload = {
        member: { name: member.name, id: member.id },
        period: PERIOD_LABEL[period],
        period_range: { from: range.from.toISOString().split('T')[0], to: range.to.toISOString().split('T')[0] },
        completed_count: scope.completedInPeriod.length,
        completed: scope.completedInPeriod.slice(0, 30).map(t => ({
          title: t.title,
          project: t.project_name,
          client: t.client_name,
          completed_at: t.completed_at,
          priority: t.priority,
        })),
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
      };
      const result = await generateMemberWeeklySummary(JSON.stringify(payload));
      setAiResult(result);
    } catch (err: any) {
      setAiError(err?.message || 'Could not generate summary');
    } finally {
      setAiLoading(false);
    }
  };

  if (!member) return null;

  const stats = [
    { label: 'Completadas', value: scope.completedInPeriod.length, color: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Asignadas abiertas', value: scope.openAssigned.length, color: 'text-zinc-700 dark:text-zinc-300' },
    { label: 'Delegadas', value: scope.delegatedByThem.length, color: 'text-zinc-500 dark:text-zinc-400' },
    { label: 'Vencidas', value: scope.overdue.length, color: scope.overdue.length > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-500' },
    { label: 'Logins', value: loginCount, color: 'text-teal-600 dark:text-teal-400' },
    { label: 'Eventos', value: memberActivities.length, color: 'text-zinc-500 dark:text-zinc-400' },
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
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400 mb-1">© Resumen semanal</div>
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
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-6">
          {stats.map(s => (
            <div key={s.label} className="px-3 py-2 bg-white dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800 rounded-xl">
              <div className="text-[9px] uppercase tracking-wider text-zinc-400 font-semibold mb-0.5 truncate">{s.label}</div>
              <div className={`text-lg font-light tabular-nums ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

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
              {aiLoading ? 'Generando…' : aiResult ? 'Regenerar' : 'Generar resumen'}
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
                  <div className="text-[9px] uppercase tracking-wider text-rose-600 dark:text-rose-400 font-semibold mb-1">⚠ Bloqueos / pendientes</div>
                  <ul className="space-y-0.5">
                    {aiResult.blockers.map((b, i) => (
                      <li key={i} className="text-[12px] text-zinc-700 dark:text-zinc-200 leading-snug">— {b}</li>
                    ))}
                  </ul>
                </div>
              )}
              {aiResult.next_focus && aiResult.next_focus.length > 0 && (
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-amber-700 dark:text-amber-400 font-semibold mb-1">→ Foco próxima semana</div>
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

        {/* Completed tasks list */}
        <Section
          title="Tareas completadas"
          count={scope.completedInPeriod.length}
          emptyText="Ninguna tarea completada en este período."
        >
          {scope.completedInPeriod.slice(0, 25).map(t => (
            <TaskRow
              key={t.id}
              icon={<Icons.CheckCircle size={11} className="text-emerald-500" />}
              title={t.title || 'Sin título'}
              subtitle={[t.project_name, t.client_name].filter(Boolean).join(' · ') || undefined}
              meta={fmtDate(t.completed_at)}
              priority={t.priority}
              strike
            />
          ))}
          {scope.completedInPeriod.length > 25 && (
            <p className="text-[10px] text-zinc-400 italic px-1 mt-1">+{scope.completedInPeriod.length - 25} más</p>
          )}
        </Section>

        {/* Open / pending tasks */}
        <Section
          title="Asignadas abiertas"
          count={scope.openAssigned.length}
          tone={scope.overdue.length > 0 ? 'warning' : 'default'}
          emptyText="Sin tareas abiertas asignadas."
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
                title={t.title || 'Sin título'}
                subtitle={[t.project_name, t.client_name].filter(Boolean).join(' · ') || undefined}
                meta={due ? `${isOverdue ? '⚠ Vencida ' : 'Vence '}${fmtDate(due)}` : undefined}
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
            title="Delegadas a otros"
            count={scope.delegatedByThem.length}
            emptyText=""
          >
            {scope.delegatedByThem.slice(0, 10).map(t => (
              <TaskRow
                key={t.id}
                icon={<Icons.External size={11} className="text-zinc-400" />}
                title={t.title || 'Sin título'}
                subtitle={[t.project_name, t.client_name].filter(Boolean).join(' · ') || undefined}
                meta={t.completed ? `Completada ${fmtDate(t.completed_at)}` : 'En curso'}
              />
            ))}
          </Section>
        )}

        {/* Activity timeline */}
        {memberActivities.length > 0 && (
          <Section
            title="Actividad"
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
                <p className="text-[10px] text-zinc-400 italic px-1">+{memberActivities.length - 20} eventos más</p>
              )}
            </div>
          </Section>
        )}
      </div>
    </SlidePanel>
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
  children: React.ReactNode;
}> = ({ title, count, emptyText, tone = 'default', children }) => (
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
