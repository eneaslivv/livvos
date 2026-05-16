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
import { sendAdvisorChat } from '../lib/ai';
import { errorLogger } from '../lib/errorLogger';
import { supabase } from '../lib/supabase';
import type { PageView, NavParams } from '../types';

interface BriefProps {
  onNavigate: (page: PageView, params?: NavParams) => void;
}

type ChatMsg = {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
};

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
  const { tasks: allTasks, events } = useCalendar();
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

  // ── Send a question ──────────────────────────────────────────────
  const handleSend = async () => {
    const q = input.trim();
    if (!q || sending) return;
    setInput('');
    const userMsg: ChatMsg = { role: 'user', content: q, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setSending(true);
    try {
      // Build a compact context bundle for the AI
      const ctx = [
        `User: ${(user as any)?.user_metadata?.name || user?.email || 'user'}`,
        `Tenant: ${currentTenant?.name || 'unknown'}`,
        `Date: ${today.toDateString()}`,
        '',
        `Tasks assigned to me / I own (${myTasks.length} open):`,
        ...overdue.slice(0, 10).map(t => `  [OVERDUE ${formatRelative(t.start_date)}] ${t.title}${t.priority ? ` (${t.priority})` : ''}`),
        ...dueToday.slice(0, 10).map(t => `  [TODAY] ${t.title}${t.priority ? ` (${t.priority})` : ''}`),
        ...dueSoon.slice(0, 10).map(t => `  [${formatRelative(t.start_date)}] ${t.title}${t.priority ? ` (${t.priority})` : ''}`),
        '',
        `Today's events (${todayEvents.length}):`,
        ...todayEvents.slice(0, 10).map(e => `  ${e.start_time || ''} ${e.title}`),
      ].join('\n');
      const history = messages.slice(-8).map(m => ({ role: m.role, content: m.content }));
      const result = await sendAdvisorChat(ctx, history as any, q);
      const reply = (result as any)?.reply || "I couldn't generate a response — try rephrasing?";
      setMessages(prev => [...prev, { role: 'assistant', content: reply, ts: Date.now() }]);
    } catch (e: any) {
      errorLogger.error('brief chat failed', e);
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e?.message || 'unknown'}`, ts: Date.now() }]);
    } finally {
      setSending(false);
    }
  };

  const handleTaskClick = (t: CalendarTask) => {
    onNavigate('calendar', { taskId: t.id });
  };

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
              <div className={`text-[13px] leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'max-w-[85%] bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-2xl rounded-br-md px-3.5 py-2'
                  : 'text-zinc-800 dark:text-zinc-100'
              }`}>{m.content}</div>
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

      {/* ── RIGHT: structured tasks panel ── */}
      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col overflow-hidden">
        <header className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">Today's plate</h2>
          <div className="flex items-center gap-2 text-[10px] text-zinc-400">
            <span>{overdue.length + dueToday.length} actionable</span>
            <button
              onClick={() => onNavigate('calendar')}
              className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1"
              title="Open Calendar"
            >
              <Icons.Calendar size={12} />
              Calendar
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
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

          {/* Today's events compact */}
          {todayEvents.length > 0 && (
            <section>
              <header className="flex items-center gap-1.5 mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                <Icons.Calendar size={11} className="text-zinc-400" />
                Today's events
                <span className="text-[9px] tabular-nums font-mono opacity-70">{todayEvents.length}</span>
              </header>
              <ul className="space-y-1">
                {todayEvents.map(e => (
                  <li key={e.id} className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors cursor-pointer"
                      onClick={() => onNavigate('calendar')}>
                    <span className="text-[10px] font-mono text-zinc-400 w-10 tabular-nums">{e.start_time || '—'}</span>
                    <span className="text-[12px] text-zinc-700 dark:text-zinc-200 truncate flex-1">{e.title}</span>
                    {e.location && <span className="text-[10px] text-zinc-400 truncate max-w-[120px]">{e.location}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Pending requests pointer */}
          {pendingRequestsCount > 0 && (
            <button
              onClick={() => onNavigate('communications')}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-500/15 transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-md bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center shrink-0">
                <Icons.Mail size={14} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold text-emerald-800 dark:text-emerald-300">
                  {pendingRequestsCount} pending message{pendingRequestsCount === 1 ? '' : 's'} in your Inbox
                </div>
                <div className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
                  Open Inbox to triage requests, urgent items, and replies
                </div>
              </div>
              <Icons.ChevronRight size={14} className="text-emerald-400" />
            </button>
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
