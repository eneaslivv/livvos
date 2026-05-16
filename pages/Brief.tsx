/**
 * Brief — daily-briefing AI chat with a structured-tasks panel on the side.
 *
 * Two-column layout (Kai-style):
 *   • Left: chat. Opens with a morning greeting + auto-summary of what's
 *     happening today (overdue tasks, meetings, pending requests). User
 *     can ask follow-ups; the AI replies via sendAdvisorChat, with the
 *     existing chat-context as system prompt. Action chips appear when
 *     the AI completes a step ("Inbox sorted ✓", "Tasks pulled ✓").
 *   • Right: structured tasks panel. Tabs for Tasks / Calendar / Inbox.
 *     The Tasks tab groups items by Overdue / Due today / Due soon,
 *     each with priority dots, time chips, and source channels — same
 *     visual language as Calendar/Kanban so the user sees "their day"
 *     in one place.
 *
 * User can iterate: ask the AI to mark something done, snooze it, or
 * reschedule — the right panel updates live since it reads from
 * CalendarContext which already has realtime subscriptions.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icons } from '../components/ui/Icons';
import { useCalendar, type CalendarTask } from '../context/CalendarContext';
import { useProjects } from '../context/ProjectsContext';
import { useClients } from '../context/ClientsContext';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from '../context/TenantContext';
import { runOrchestrator, type ProposedAction } from '../lib/agents';
import { errorLogger } from '../lib/errorLogger';
import { supabase } from '../lib/supabase';
import type { PageView, NavParams } from '../types';

interface BriefProps {
  onNavigate: (page: PageView, params?: NavParams) => void;
}

type ActionState = 'pending' | 'executing' | 'done' | 'skipped' | 'failed';
type ChatAction = ProposedAction & { state: ActionState; error?: string };

type ChatMsg = {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
  /** When an assistant message was produced by the orchestrator, the
   *  skill trace gets rendered as small "✓ ran X skill" chips beneath
   *  the reply so the user sees what data the AI actually pulled. */
  skillTrace?: Array<{ skillId: string; ok: boolean; summary: string }>;
  agentId?: string;
  /** Proposed write actions parsed from <action> tags in the LLM reply.
   *  Rendered as approval cards under the message — Confirm executes
   *  the corresponding CalendarContext method; Skip dismisses. */
  actions?: ChatAction[];
};

type RightTab = 'tasks' | 'calendar' | 'inbox';

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-rose-500',
  high:   'bg-amber-500',
  medium: 'bg-indigo-400',
  low:    'bg-zinc-400',
};

const formatRelative = (dateStr: string | undefined): string => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff <= 6) return `In ${diff}d`;
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
};

export const Brief: React.FC<BriefProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const { tasks: allTasks, events, updateTask, createTask } = useCalendar();
  const [rightTab, setRightTab] = useState<RightTab>('tasks');
  const [pendingMessages, setPendingMessages] = useState<any[]>([]);
  const { projects } = useProjects();
  const { clients } = useClients();

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState<number>(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // ── Task groupings ───────────────────────────────────────────────
  const myTasks = useMemo(() => allTasks.filter(t =>
    !t.completed
    && t.status !== 'done'
    && t.status !== 'cancelled'
    && (t.assignee_ids?.includes(user?.id || '') || t.owner_id === user?.id)
  ), [allTasks, user?.id]);

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const nextWeek = useMemo(() => { const d = new Date(today); d.setDate(d.getDate() + 7); return d; }, [today]);

  const { overdue, dueToday, dueSoon } = useMemo(() => {
    const overdue: CalendarTask[] = [];
    const dueToday: CalendarTask[] = [];
    const dueSoon: CalendarTask[] = [];
    for (const t of myTasks) {
      const due = t.start_date;
      if (!due) continue;
      const d = new Date(due + 'T12:00:00');
      if (d < today) overdue.push(t);
      else if (d.toDateString() === today.toDateString()) dueToday.push(t);
      else if (d <= nextWeek) dueSoon.push(t);
    }
    return { overdue, dueToday, dueSoon };
  }, [myTasks, today, nextWeek]);

  // ── Today's calendar events ──────────────────────────────────────
  const todayEvents = useMemo(() => {
    const todayStr = today.toISOString().slice(0, 10);
    return events
      .filter(e => e.start_date?.slice(0, 10) === todayStr)
      .sort((a, b) => (a.start_time || '00:00').localeCompare(b.start_time || '00:00'));
  }, [events, today]);

  const nextMeeting = useMemo(() => {
    const now = new Date();
    for (const e of todayEvents) {
      if (!e.start_time) continue;
      const [h, m] = e.start_time.split(':').map(Number);
      const evt = new Date(); evt.setHours(h, m, 0, 0);
      if (evt > now) return { event: e, minutesUntil: Math.round((evt.getTime() - now.getTime()) / 60000) };
    }
    return null;
  }, [todayEvents]);

  // ── Pending request count (AI-flagged inbox messages) ────────────
  useEffect(() => {
    if (!currentTenant?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { count } = await supabase
          .from('communication_messages')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', currentTenant.id)
          .eq('status', 'pending');
        if (!cancelled) setPendingRequestsCount(count || 0);
      } catch { /* silent — just informational */ }
    })();
    return () => { cancelled = true; };
  }, [currentTenant?.id]);

  // ── Initial greeting (only once when component mounts with data) ──
  const greetedRef = useRef(false);
  useEffect(() => {
    if (greetedRef.current) return;
    if (!user) return;
    greetedRef.current = true;
    const name = (user as any)?.user_metadata?.name?.split(' ')[0] || 'there';
    const now = new Date();
    const hour = now.getHours();
    const greeting = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';
    const bits: string[] = [];
    if (overdue.length > 0) bits.push(`${overdue.length} overdue task${overdue.length === 1 ? '' : 's'}`);
    if (dueToday.length > 0) bits.push(`${dueToday.length} due today`);
    if (todayEvents.length > 0) bits.push(`${todayEvents.length} event${todayEvents.length === 1 ? '' : 's'} on the calendar`);
    if (pendingRequestsCount > 0) bits.push(`${pendingRequestsCount} pending message${pendingRequestsCount === 1 ? '' : 's'}`);
    const summary = bits.length === 0
      ? "You're clear — nothing overdue, no meetings, inbox at zero. Take the win."
      : `You've got ${bits.join(', ')}.`;
    setMessages([{
      role: 'assistant',
      content: `${greeting}, ${name}.\n\n${summary}`,
      ts: Date.now(),
    }]);
  }, [user, overdue.length, dueToday.length, todayEvents.length, pendingRequestsCount]);

  // ── Auto-scroll on new message ───────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  // ── Send a question via the orchestrator ─────────────────────────
  // The orchestrator routes to the right domain agent (tasks / finance
  // / calendar / clients / projects / inbox), runs that agent's
  // read-only skills against the user's actual DB rows, and feeds the
  // results into the LLM with a strict non-invention rule. We surface
  // the skill trace as small "✓ ran X" chips beneath the reply.
  const handleSend = async () => {
    const q = input.trim();
    if (!q || sending || !currentTenant?.id || !user?.id) return;
    setInput('');
    const userMsg: ChatMsg = { role: 'user', content: q, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setSending(true);
    try {
      const history = messages.slice(-8).map(m => ({ role: m.role, content: m.content }));
      const out = await runOrchestrator({
        query: q,
        history,
        ctx: { db: supabase as any, tenantId: currentTenant.id, userId: user.id, now: new Date() },
      });
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: out.reply,
        ts: Date.now(),
        skillTrace: out.skillTrace,
        agentId: out.agentId,
        actions: (out.proposedActions || []).map(a => ({ ...a, state: 'pending' as const })),
      }]);
    } catch (e: any) {
      errorLogger.error('brief orchestrator failed', e);
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e?.message || 'unknown'}`, ts: Date.now() }]);
    } finally {
      setSending(false);
    }
  };

  const handleTaskClick = (t: CalendarTask) => {
    onNavigate('calendar', { taskId: t.id });
  };

  // ── Execute a proposed action ───────────────────────────────────
  // Called when the user clicks Confirm on an approval card. Maps the
  // action kind to the right CalendarContext mutation, runs it, and
  // updates the card state so it renders as "✓ done" or "⚠ failed".
  const executeAction = async (msgIdx: number, actionIdx: number) => {
    const msg = messages[msgIdx];
    const action = msg?.actions?.[actionIdx];
    if (!action || action.state !== 'pending') return;
    setMessages(prev => {
      const next = [...prev];
      const m = { ...next[msgIdx] };
      m.actions = [...(m.actions || [])];
      m.actions[actionIdx] = { ...m.actions[actionIdx], state: 'executing' };
      next[msgIdx] = m;
      return next;
    });
    try {
      switch (action.kind) {
        case 'complete_task':
          await updateTask(action.params.task_id, { status: 'done', completed: true } as any);
          break;
        case 'reopen_task':
          await updateTask(action.params.task_id, { status: 'todo', completed: false } as any);
          break;
        case 'start_task':
          await updateTask(action.params.task_id, { status: 'in-progress', completed: false } as any);
          break;
        case 'update_task_priority':
          await updateTask(action.params.task_id, { priority: action.params.priority as any });
          break;
        case 'update_task_due_date':
          await updateTask(action.params.task_id, { start_date: action.params.due_date, end_date: action.params.due_date } as any);
          break;
        case 'create_task':
          await createTask({
            title: action.params.title,
            description: action.params.description,
            priority: (action.params.priority as any) || 'medium',
            status: 'todo',
            completed: false,
            owner_id: user?.id || '',
            project_id: action.params.project_id,
            start_date: action.params.due_date,
            assignee_ids: [],
            order_index: 0,
          } as any);
          break;
      }
      setMessages(prev => {
        const next = [...prev];
        const m = { ...next[msgIdx] };
        m.actions = [...(m.actions || [])];
        m.actions[actionIdx] = { ...m.actions[actionIdx], state: 'done' };
        next[msgIdx] = m;
        return next;
      });
    } catch (e: any) {
      errorLogger.error('action execute failed', e);
      setMessages(prev => {
        const next = [...prev];
        const m = { ...next[msgIdx] };
        m.actions = [...(m.actions || [])];
        m.actions[actionIdx] = { ...m.actions[actionIdx], state: 'failed', error: e?.message || 'unknown' };
        next[msgIdx] = m;
        return next;
      });
    }
  };

  const skipAction = (msgIdx: number, actionIdx: number) => {
    setMessages(prev => {
      const next = [...prev];
      const m = { ...next[msgIdx] };
      m.actions = [...(m.actions || [])];
      m.actions[actionIdx] = { ...m.actions[actionIdx], state: 'skipped' };
      next[msgIdx] = m;
      return next;
    });
  };

  // ── Load pending inbox messages for the Inbox tab ───────────────
  useEffect(() => {
    if (!currentTenant?.id || rightTab !== 'inbox') return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('communication_messages')
          .select('id, platform, from_name, subject, body_text, channel_name, received_at, ai_classification')
          .eq('tenant_id', currentTenant.id)
          .eq('status', 'pending')
          .order('received_at', { ascending: false })
          .limit(30);
        if (!cancelled) setPendingMessages(data || []);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [currentTenant?.id, rightTab]);

  const projectsById = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);
  const clientsById = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);

  return (
    <div className="h-[calc(100vh-3rem)] grid grid-cols-1 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] gap-4 max-w-[1600px] mx-auto py-4">
      {/* ── LEFT: chat column ── */}
      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800/60 flex items-center gap-2.5">
          {nextMeeting ? (
            <>
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-200">
                in {nextMeeting.minutesUntil}m: <span className="font-semibold">{nextMeeting.event.title}</span>
              </span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">No meetings ahead</span>
            </>
          )}
          <span className="ml-auto text-[11px] text-zinc-400">
            {today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
        </header>

        {/* Chat messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.map((m, i) => (
            <div key={`${m.ts}-${i}`} className={m.role === 'user' ? 'flex justify-end' : ''}>
              <div className="max-w-full">
                <div className={`text-[13px] leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'max-w-[85%] bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-2xl rounded-br-md px-3.5 py-2 ml-auto'
                    : 'text-zinc-800 dark:text-zinc-100'
                }`}>{m.content}</div>
                {/* Action approval cards — render before the skill trace
                    so the user sees pending actions first. Each card
                    shows the human-readable label + Confirm/Skip; on
                    confirm it transforms into a green ✓ chip. */}
                {m.role === 'assistant' && m.actions && m.actions.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {m.actions.map((a, k) => (
                      <ActionCard
                        key={k}
                        action={a}
                        onConfirm={() => executeAction(i, k)}
                        onSkip={() => skipAction(i, k)}
                      />
                    ))}
                  </div>
                )}
                {/* Skill trace — surfaces which agent + which DB queries
                    produced this reply. Builds trust by showing the
                    actual data path (not just "AI said X"). */}
                {m.role === 'assistant' && m.skillTrace && m.skillTrace.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.agentId && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 inline-flex items-center gap-1">
                        <Icons.Sparkles size={9} />
                        {m.agentId.replace('-agent', '')}
                      </span>
                    )}
                    {m.skillTrace.map((s, k) => (
                      <span
                        key={k}
                        title={s.summary}
                        className={`text-[9px] px-1.5 py-0.5 rounded inline-flex items-center gap-1 ${
                          s.ok
                            ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'bg-zinc-100 dark:bg-zinc-800/60 text-zinc-500 dark:text-zinc-400'
                        }`}
                      >
                        {s.ok ? <Icons.Check size={9} /> : <Icons.AlertCircle size={9} />}
                        {s.skillId.split('.').pop()}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {sending && (
            <div className="text-zinc-400 text-[12px] inline-flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
              Thinking…
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-800/60">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              placeholder="Ask anything — 'what should I tackle first?', 'reschedule the overdue stuff', 'draft a recap for Christie'"
              rows={1}
              className="flex-1 resize-none px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-[12.5px] text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 max-h-32"
              style={{ minHeight: '36px' }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="p-2 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              aria-label="Send"
            >
              <Icons.Send size={14} />
            </button>
          </div>
        </div>
      </section>

      {/* ── RIGHT: structured panel with tabs ── */}
      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col overflow-hidden">
        {/* Tab strip */}
        <header className="border-b border-zinc-100 dark:border-zinc-800/60 px-3 pt-3 flex items-center gap-1">
          {([
            { id: 'tasks' as const,    label: 'Tasks',    icon: 'Check' as const,    count: overdue.length + dueToday.length + dueSoon.length },
            { id: 'calendar' as const, label: 'Calendar', icon: 'Calendar' as const, count: todayEvents.length },
            { id: 'inbox' as const,    label: 'Inbox',    icon: 'Mail' as const,     count: pendingRequestsCount },
          ]).map(t => {
            const active = rightTab === t.id;
            const IconCmp = (Icons as any)[t.icon] || Icons.Check;
            return (
              <button
                key={t.id}
                onClick={() => setRightTab(t.id)}
                className={`relative px-3 py-2 text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors ${
                  active
                    ? 'text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                }`}
              >
                <IconCmp size={12} />
                {t.label}
                {t.count > 0 && (
                  <span className={`text-[9px] tabular-nums font-mono px-1 py-0.5 rounded ${
                    active ? 'bg-zinc-900/10 dark:bg-zinc-100/10' : 'bg-zinc-100 dark:bg-zinc-800'
                  }`}>{t.count}</span>
                )}
                {active && <span className="absolute -bottom-px left-2 right-2 h-0.5 bg-zinc-900 dark:bg-zinc-100 rounded-full" />}
              </button>
            );
          })}
          <button
            onClick={() => onNavigate(rightTab === 'inbox' ? 'communications' : 'calendar')}
            className="ml-auto text-[10px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 inline-flex items-center gap-1 py-2 px-2"
            title="Open full page"
          >
            Open full →
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {rightTab === 'tasks' && (
            <>
              <TaskSection
                title="Overdue"
                icon={<Icons.Clock size={11} className="text-rose-500" />}
                tasks={overdue}
                tone="rose"
                projectsById={projectsById}
                clientsById={clientsById}
                onTaskClick={handleTaskClick}
                emptyText="Nothing slipped — good."
              />
              <TaskSection
                title="Due today"
                icon={<Icons.Activity size={11} className="text-amber-500" />}
                tasks={dueToday}
                tone="amber"
                projectsById={projectsById}
                clientsById={clientsById}
                onTaskClick={handleTaskClick}
                emptyText="Nothing on today's list."
              />
              <TaskSection
                title="Due soon"
                icon={<Icons.Sparkles size={11} className="text-indigo-500" />}
                tasks={dueSoon}
                tone="indigo"
                projectsById={projectsById}
                clientsById={clientsById}
                onTaskClick={handleTaskClick}
                emptyText="Nothing scheduled this week."
              />
            </>
          )}

          {rightTab === 'calendar' && (
            <section>
              <header className="flex items-center gap-1.5 mb-3 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                <Icons.Calendar size={11} className="text-zinc-400" />
                Today's events
                <span className="text-[9px] tabular-nums font-mono opacity-70">{todayEvents.length}</span>
              </header>
              {todayEvents.length === 0 ? (
                <p className="text-[11px] text-zinc-400 italic pl-4">No events on the calendar today.</p>
              ) : (
                <ul className="space-y-1">
                  {todayEvents.map(e => (
                    <li key={e.id}
                        className="flex items-start gap-3 px-2 py-2 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors cursor-pointer"
                        onClick={() => onNavigate('calendar')}>
                      <div className="w-12 text-[10px] font-mono text-zinc-400 tabular-nums pt-0.5">
                        {e.start_time || '—'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] font-medium text-zinc-800 dark:text-zinc-100 truncate">{e.title}</div>
                        {(e.location || e.duration) && (
                          <div className="text-[10px] text-zinc-400 mt-0.5 inline-flex items-center gap-2">
                            {e.duration && <span>⏱ {e.duration < 60 ? `${e.duration}m` : `${Math.round(e.duration / 60 * 10) / 10}h`}</span>}
                            {e.location && <span className="truncate max-w-[180px]">📍 {e.location}</span>}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {rightTab === 'inbox' && (
            <section>
              <header className="flex items-center gap-1.5 mb-3 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                <Icons.Mail size={11} className="text-zinc-400" />
                Pending messages
                <span className="text-[9px] tabular-nums font-mono opacity-70">{pendingMessages.length}</span>
                <button
                  onClick={() => onNavigate('communications')}
                  className="ml-auto text-[10px] font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 normal-case tracking-normal"
                >Open Inbox →</button>
              </header>
              {pendingMessages.length === 0 ? (
                <p className="text-[11px] text-zinc-400 italic pl-4">Inbox empty.</p>
              ) : (
                <ul className="space-y-1">
                  {pendingMessages.map(m => {
                    const isRequest = m.ai_classification?.should_create_task === true;
                    const isUrgent = m.ai_classification?.priority === 'high' || m.ai_classification?.intent === 'urgent';
                    return (
                      <li key={m.id}
                          className="flex items-start gap-2 px-2 py-2 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors cursor-pointer"
                          onClick={() => onNavigate('communications')}>
                        <div className={`w-5 h-5 rounded shrink-0 flex items-center justify-center ${
                          m.platform === 'gmail' ? 'bg-rose-50 dark:bg-rose-500/10' : 'bg-violet-50 dark:bg-violet-500/10'
                        }`}>
                          {m.platform === 'gmail'
                            ? <Icons.Mail size={10} className="text-rose-500" />
                            : <Icons.Message size={10} className="text-violet-500" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[11.5px] font-medium text-zinc-800 dark:text-zinc-100 truncate">
                              {m.from_name || m.from_email || 'Anonymous'}
                            </span>
                            {isUrgent && <span className="text-[8px] px-1 py-0.5 rounded bg-rose-500/15 text-rose-700 dark:text-rose-300 font-bold uppercase">Urgent</span>}
                            {isRequest && <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold uppercase">Request</span>}
                          </div>
                          <div className="text-[10.5px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                            {m.subject || m.channel_name || '(no subject)'}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </div>
      </section>
    </div>
  );
};

// ── Task section renderer ──────────────────────────────────────────
const TaskSection: React.FC<{
  title: string;
  icon: React.ReactNode;
  tasks: CalendarTask[];
  tone: 'rose' | 'amber' | 'indigo';
  projectsById: Map<string, any>;
  clientsById: Map<string, any>;
  onTaskClick: (t: CalendarTask) => void;
  emptyText: string;
}> = ({ title, icon, tasks, tone, projectsById, clientsById, onTaskClick, emptyText }) => {
  const [open, setOpen] = useState(true);
  if (tasks.length === 0) {
    return (
      <section>
        <header className="flex items-center gap-1.5 mb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
          {icon}
          {title}
        </header>
        <p className="text-[11px] text-zinc-400 italic pl-4">{emptyText}</p>
      </section>
    );
  }
  return (
    <section>
      <header
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400 cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
      >
        {icon}
        {title}
        <span className="text-[9px] tabular-nums font-mono opacity-70">{tasks.length}</span>
        <Icons.ChevronDown size={11} className={`ml-auto transition-transform ${open ? '' : '-rotate-90'}`} />
      </header>
      {open && (
        <ul className="space-y-1">
          {tasks.slice(0, 12).map(t => {
            const proj = t.project_id ? projectsById.get(t.project_id) : null;
            const cli  = t.client_id ? clientsById.get(t.client_id) : (proj?.client_id ? clientsById.get(proj.client_id) : null);
            const due = formatRelative(t.start_date);
            return (
              <li key={t.id}>
                <button
                  onClick={() => onTaskClick(t)}
                  className="w-full text-left flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors group"
                >
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[t.priority || 'medium']}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {t.title}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-500">
                      {due && (
                        <span className={`inline-flex items-center gap-0.5 ${tone === 'rose' ? 'text-rose-600 dark:text-rose-400 font-semibold' : ''}`}>
                          {tone === 'rose' && <Icons.Clock size={9} />}
                          {due}
                        </span>
                      )}
                      {t.duration && (
                        <span className="inline-flex items-center gap-0.5">
                          ⏱ {t.duration < 60 ? `${t.duration}m` : `${Math.round(t.duration / 60 * 10) / 10}h`}
                        </span>
                      )}
                      {proj && (
                        <span className="inline-flex items-center gap-0.5 truncate max-w-[120px]">
                          <Icons.Briefcase size={9} />
                          {proj.title}
                        </span>
                      )}
                      {cli && !proj && (
                        <span className="inline-flex items-center gap-0.5 truncate max-w-[100px]">
                          <Icons.Users size={9} />
                          {cli.name}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
          {tasks.length > 12 && (
            <li className="px-3 py-1 text-[10px] text-zinc-400">+{tasks.length - 12} more</li>
          )}
        </ul>
      )}
    </section>
  );
};

// ── Action approval card ─────────────────────────────────────────
// Renders a single ProposedAction as a small confirmation card. State
// machine: pending → executing (spinner) → done (✓ chip) or failed
// (⚠ with error tooltip). Skipped renders as a grayed-out chip too.
const ActionCard: React.FC<{
  action: ChatAction;
  onConfirm: () => void;
  onSkip: () => void;
}> = ({ action, onConfirm, onSkip }) => {
  if (action.state === 'done') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10.5px] font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
        <Icons.Check size={11} />
        {action.label}
      </div>
    );
  }
  if (action.state === 'skipped') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10.5px] font-medium bg-zinc-100 dark:bg-zinc-800/60 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
        <Icons.Close size={10} />
        {action.label} (skipped)
      </div>
    );
  }
  if (action.state === 'failed') {
    return (
      <div title={action.error} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10.5px] font-medium bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30">
        <Icons.AlertCircle size={11} />
        {action.label} — failed
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg border border-violet-200 dark:border-violet-500/30 bg-violet-50/60 dark:bg-violet-500/5">
      <Icons.Sparkles size={12} className="text-violet-600 dark:text-violet-400 shrink-0" />
      <span className="flex-1 text-[11.5px] text-zinc-800 dark:text-zinc-100 leading-snug">
        {action.label}
      </span>
      {action.state === 'executing' ? (
        <span className="text-[10px] text-violet-600 dark:text-violet-400 inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 border border-violet-400 border-t-transparent rounded-full animate-spin" />
          Running…
        </span>
      ) : (
        <>
          <button
            onClick={onSkip}
            className="text-[10.5px] font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 px-1.5 py-0.5"
          >Skip</button>
          <button
            onClick={onConfirm}
            className="text-[10.5px] font-semibold text-white bg-violet-600 hover:bg-violet-700 px-2 py-1 rounded-md inline-flex items-center gap-1"
          >
            <Icons.Check size={10} /> Confirm
          </button>
        </>
      )}
    </div>
  );
};
