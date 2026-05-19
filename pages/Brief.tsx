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
import { motion, AnimatePresence, useReducedMotion, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import { Icons } from '../components/ui/Icons';
// Shared spring presets so Brief, AiAdvisor and future surfaces all
// feel like one iOS-native UI. Tweaking the feel is a one-file change.
import { SPRING_TAP, SPRING_ENTER, TAP_SCALE, SWIPE_THRESHOLD, SWIPE_VELOCITY } from '../lib/ui/motion';
import { useCalendar, type CalendarTask } from '../context/CalendarContext';
import { useProjects } from '../context/ProjectsContext';
import { useClients } from '../context/ClientsContext';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from '../context/TenantContext';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { runOrchestrator, recordFeedback, executeProposedAction, getUserProfile, type ProposedAction } from '../lib/agents';
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
  /** Server-persisted conversation row id. Required for thumbs feedback. */
  conversationId?: string | null;
  /** Local thumbs state so we don't double-submit. */
  thumbs?: 'up' | 'down' | null;
};

type RightTab = 'tasks' | 'calendar' | 'inbox';

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
  const reduceMotion = useReducedMotion();
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const { tasks: allTasks, events, updateTask, createTask, createEvent, updateEvent, deleteEvent, deleteTask } = useCalendar();
  const [rightTab, setRightTab] = useState<RightTab>('tasks');
  const [pendingMessages, setPendingMessages] = useState<any[]>([]);
  const { projects } = useProjects();
  const { clients } = useClients();

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState<number>(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // ── Voice input ─────────────────────────────────────────────────
  // Loads the user's preferred language once, maps to a BCP-47 tag,
  // then feeds the recognizer. Live transcript pipes into the same
  // `input` state so the user sees their words as they speak. On
  // stop, the final transcript stays in the textarea so they can
  // review / edit before sending — we deliberately do NOT auto-send
  // so a hot mic in a noisy room can't fire off random questions.
  const [voiceLang, setVoiceLang] = useState<string>('en-US');
  useEffect(() => {
    if (!user?.id || !currentTenant?.id) return;
    let cancelled = false;
    getUserProfile(supabase as any, { userId: user.id, tenantId: currentTenant.id })
      .then(p => {
        if (cancelled) return;
        const map: Record<string, string> = {
          es: 'es-AR',  // could refine via geo later — es-AR is a safe default for LIVV's audience
          en: 'en-US',
          pt: 'pt-BR',
          auto: navigator.language || 'en-US',
        };
        setVoiceLang(map[p.preferred_language] || 'en-US');
      })
      .catch(() => { /* keep default */ });
    return () => { cancelled = true; };
  }, [user?.id, currentTenant?.id]);
  const voice = useVoiceInput({
    lang: voiceLang,
    onPartial: (text) => setInput(text),
  });

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
    // Single-line greeting. The numbers live in the stat cards above
    // the chat — duplicating them in the message just adds noise.
    // When everything's clear we say so explicitly so the user gets the
    // "take the win" beat.
    const allClear = overdue.length === 0 && dueToday.length === 0
      && todayEvents.length === 0 && pendingRequestsCount === 0;
    const tail = allClear
      ? "You're clear today. Take the win — or ask me what to set up for tomorrow."
      : "What do you want to do first?";
    setMessages([{
      role: 'assistant',
      content: `${greeting}, ${name}. ${tail}`,
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
  const handleSend = async (override?: string) => {
    // `override` lets action chips fire a prompt without going through
    // the input box. The user still SEES their question in the chat —
    // it just doesn't have to type it.
    const q = (override ?? input).trim();
    if (!q || sending || !currentTenant?.id || !user?.id) return;
    if (!override) setInput('');
    const userMsg: ChatMsg = { role: 'user', content: q, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setSending(true);
    try {
      const history = messages.slice(-8).map(m => ({ role: m.role, content: m.content }));
      const out = await runOrchestrator(
        {
          query: q,
          history,
          ctx: { db: supabase as any, tenantId: currentTenant.id, userId: user.id, now: new Date() },
        },
        { surface: 'brief' },
      );
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: out.reply,
        ts: Date.now(),
        skillTrace: out.skillTrace,
        agentId: out.agentId,
        conversationId: (out as any).conversationId || null,
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

  // ── Inline task actions on the cards ─────────────────────────────
  // Done = mark complete. Snooze = push start_date forward by 1 day
  // (idempotent — calling twice moves it +2). Both go through the
  // same CalendarContext mutations the action executor uses, so
  // realtime + optimistic updates kick in automatically.
  const handleTaskComplete = async (t: CalendarTask) => {
    try {
      await updateTask(t.id, { status: 'done', completed: true } as any);
    } catch (e) {
      errorLogger.warn('task complete failed', { taskId: t.id, error: e });
    }
  };
  const handleTaskSnooze = async (t: CalendarTask) => {
    try {
      const base = t.start_date ? new Date(t.start_date + 'T12:00:00') : new Date();
      base.setDate(base.getDate() + 1);
      const iso = base.toISOString().slice(0, 10);
      await updateTask(t.id, { start_date: iso, end_date: iso } as any);
    } catch (e) {
      errorLogger.warn('task snooze failed', { taskId: t.id, error: e });
    }
  };

  // ── Thumbs feedback ─────────────────────────────────────────────
  const handleThumbs = async (msgIdx: number, value: 'up' | 'down') => {
    const msg = messages[msgIdx];
    if (!msg?.conversationId || msg.thumbs || !currentTenant?.id || !user?.id) return;
    setMessages(prev => {
      const next = [...prev];
      next[msgIdx] = { ...next[msgIdx], thumbs: value };
      return next;
    });
    try {
      await recordFeedback({
        ctx: { db: supabase as any, tenantId: currentTenant.id, userId: user.id, now: new Date() },
        conversationId: msg.conversationId,
        agentId: msg.agentId || 'unknown',
        signal: value === 'up' ? 'thumbs_up' : 'thumbs_down',
      });
    } catch { /* best effort */ }
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
      // Centralized dispatcher in lib/agents/execute.ts handles every
      // ActionKind — adding a new action means editing one switch.
      const result = await executeProposedAction(
        action,
        { db: supabase as any, tenantId: currentTenant!.id, userId: user!.id, now: new Date() },
        {
          updateTask: (id, patch) => updateTask(id, patch as any),
          createTask: (data) => createTask(data as any),
          deleteTask: (id) => deleteTask(id),
          updateEvent: (id, patch) => updateEvent(id, patch as any),
          createEvent: (data) => createEvent(data as any),
          deleteEvent: (id) => deleteEvent(id),
        },
      );
      if (!result.ok) throw new Error(result.error || result.summary);
      setMessages(prev => {
        const next = [...prev];
        const m = { ...next[msgIdx] };
        m.actions = [...(m.actions || [])];
        m.actions[actionIdx] = { ...m.actions[actionIdx], state: 'done' };
        next[msgIdx] = m;
        return next;
      });
      // Log the confirmation as a positive feedback signal — feeds the
      // learning loop that this style of proposal was useful.
      const conv = msg.conversationId;
      if (conv && currentTenant?.id && user?.id) {
        recordFeedback({
          ctx: { db: supabase as any, tenantId: currentTenant.id, userId: user.id, now: new Date() },
          conversationId: conv,
          agentId: msg.agentId || 'unknown',
          signal: 'action_confirmed',
        }).catch(() => {});
      }
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
    const msg = messages[msgIdx];
    setMessages(prev => {
      const next = [...prev];
      const m = { ...next[msgIdx] };
      m.actions = [...(m.actions || [])];
      m.actions[actionIdx] = { ...m.actions[actionIdx], state: 'skipped' };
      next[msgIdx] = m;
      return next;
    });
    if (msg?.conversationId && currentTenant?.id && user?.id) {
      recordFeedback({
        ctx: { db: supabase as any, tenantId: currentTenant.id, userId: user.id, now: new Date() },
        conversationId: msg.conversationId,
        agentId: msg.agentId || 'unknown',
        signal: 'action_skipped',
      }).catch(() => {});
    }
  };

  // ── Load pending inbox messages for the Inbox tab ───────────────
  useEffect(() => {
    if (!currentTenant?.id || rightTab !== 'inbox') return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('communication_messages')
          .select('id, platform, from_name, from_email, subject, body_text, channel_name, received_at, ai_classification')
          .eq('tenant_id', currentTenant.id)
          .eq('status', 'pending')
          .order('received_at', { ascending: false })
          .limit(30);
        if (!cancelled) setPendingMessages(data || []);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [currentTenant?.id, rightTab]);

  // ── Inline "Convert to task" from the Inbox card ────────────────
  // Routes through the same executor Brief already uses for AI-proposed
  // actions, so success/error handling + activity logging stay
  // consistent. On success: drop the message from the local list (it
  // moves to status='task_created' server-side and won't come back in
  // the pending query).
  const handleConvertToTask = async (msg: any) => {
    if (!currentTenant?.id || !user?.id) return;
    const taskTitle = (msg.subject || msg.body_text?.slice(0, 60) || 'Task from inbox').trim();
    const result = await executeProposedAction(
      {
        kind: 'convert_to_task',
        label: `Convert "${taskTitle.slice(0, 40)}…" to a task`,
        params: { message_id: msg.id, task_title: taskTitle },
      },
      { db: supabase as any, tenantId: currentTenant.id, userId: user.id, now: new Date() },
      { createTask: (data) => createTask(data as any) },
    );
    if (result.ok) {
      setPendingMessages(prev => prev.filter(m => m.id !== msg.id));
      setPendingRequestsCount(c => Math.max(0, c - 1));
    } else {
      errorLogger.warn('convert_to_task failed', { error: result.error });
    }
  };

  // ── Mark message done (handled, no task needed) ─────────────────
  // Used by the LEFT swipe gesture on inbox cards. Same executor
  // path as convert_to_task — just a different action kind that flips
  // status to 'replied' so the message exits the pending queue.
  const handleMarkMessageDone = async (msg: any) => {
    if (!currentTenant?.id || !user?.id) return;
    const result = await executeProposedAction(
      {
        kind: 'mark_message_done',
        label: 'Mark message done',
        params: { message_id: msg.id },
      },
      { db: supabase as any, tenantId: currentTenant.id, userId: user.id, now: new Date() },
    );
    if (result.ok) {
      setPendingMessages(prev => prev.filter(m => m.id !== msg.id));
      setPendingRequestsCount(c => Math.max(0, c - 1));
    } else {
      errorLogger.warn('mark_message_done failed', { error: result.error });
    }
  };

  const projectsById = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);
  const clientsById = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);

  return (
    <div className="h-[calc(100vh-3rem)] grid grid-cols-1 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] gap-4 max-w-[1600px] mx-auto py-4">
      {/* ── LEFT: chat column ── */}
      <section className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col overflow-hidden">
        {/* Header — minimal: meeting status + date. No tabs, no clutter. */}
        <header className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800/60 flex items-center gap-2.5">
          {nextMeeting ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-[11px] text-zinc-700 dark:text-zinc-200">
                in {nextMeeting.minutesUntil}m · <span className="font-medium">{nextMeeting.event.title}</span>
              </span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-[11px] text-zinc-400">No meetings ahead</span>
            </>
          )}
          <span className="ml-auto text-[11px] text-zinc-400 tabular-nums">
            {today.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
        </header>

        {/* Stat cards — 2x2 grid of the 4 things that actually need
            attention. Zen minimal: thin borders, no fills, color only
            on the number. Click anywhere on a card to jump to the
            corresponding section (tasks tab, inbox, calendar).
            Stagger-in on mount via the parent variants so the four
            cards cascade rather than pop all at once. */}
        <motion.div
          className="px-5 pt-4 pb-3 grid grid-cols-2 gap-2"
          initial={reduceMotion ? false : 'hidden'}
          animate="visible"
          variants={{
            hidden:  { transition: { staggerChildren: 0 } },
            visible: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
          }}
        >
          <StatCard value={overdue.length}             label="Overdue"        tone="rose"    onClick={() => setRightTab('tasks')} />
          <StatCard value={dueToday.length}            label="Due today"      tone="amber"   onClick={() => setRightTab('tasks')} />
          <StatCard value={todayEvents.length}         label="Events today"   tone="emerald" onClick={() => setRightTab('calendar')} />
          <StatCard value={pendingRequestsCount}       label="Pending msgs"   tone="violet"  onClick={() => setRightTab('inbox')} />
        </motion.div>

        {/* Chat messages — each one slides up + fades in with spring
            physics. User msgs originate slightly from the right,
            assistant msgs from the left, so the direction reinforces
            who's speaking. Pre-existing messages on mount don't
            animate (initial=false) — only NEW ones do, which avoids
            the on-mount "all messages cascade in" awkwardness. */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 pt-2 pb-4 space-y-4">
          <AnimatePresence initial={false}>
          {messages.map((m, i) => (
            <motion.div
              key={`${m.ts}-${i}`}
              initial={reduceMotion ? false : { opacity: 0, y: 6, x: m.role === 'user' ? 8 : -4 }}
              animate={{ opacity: 1, y: 0, x: 0 }}
              transition={SPRING_ENTER}
              className={m.role === 'user' ? 'flex justify-end' : ''}
            >
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
                      <AnimatePresence key={k} mode="wait" initial={false}>
                        <ActionCard
                          action={a}
                          onConfirm={() => executeAction(i, k)}
                          onSkip={() => skipAction(i, k)}
                        />
                      </AnimatePresence>
                    ))}
                  </div>
                )}
                {/* Skill trace — surfaces which agent + which DB queries
                    produced this reply. Builds trust by showing the
                    actual data path (not just "AI said X"). */}
                {m.role === 'assistant' && m.skillTrace && m.skillTrace.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 items-center">
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
                    {/* Thumbs feedback — explicit signal that the AI was useful
                        or not. Disabled once clicked so we don't double-count
                        in agent_metrics. */}
                    {m.conversationId && (
                      <div className="ml-auto flex items-center gap-0.5">
                        <button
                          onClick={() => handleThumbs(i, 'up')}
                          disabled={!!m.thumbs}
                          title="Useful reply"
                          className={`p-1 rounded transition-colors ${
                            m.thumbs === 'up'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-zinc-300 hover:text-emerald-500 disabled:opacity-50'
                          }`}
                        >
                          <Icons.ThumbsUp size={11} />
                        </button>
                        <button
                          onClick={() => handleThumbs(i, 'down')}
                          disabled={!!m.thumbs}
                          title="Not useful"
                          className={`p-1 rounded transition-colors ${
                            m.thumbs === 'down'
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-zinc-300 hover:text-rose-500 disabled:opacity-50'
                          }`}
                        >
                          <Icons.ThumbsDown size={11} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
          </AnimatePresence>
          <AnimatePresence>
          {sending && (
            <motion.div
              key="thinking"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={SPRING_TAP}
              className="text-zinc-400 text-[12px] inline-flex items-center gap-2"
            >
              {/* Animated dots — three pulse out of phase. More iOS than
                  the spinner that was here. */}
              <span className="inline-flex gap-1 items-center">
                {[0, 1, 2].map(i => (
                  <motion.span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-zinc-400"
                    animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.12, ease: 'easeInOut' }}
                  />
                ))}
              </span>
              Thinking…
            </motion.div>
          )}
          </AnimatePresence>
        </div>

        {/* Input + action chips. Chips fire prompts directly (one-tap)
            so the user doesn't have to type the common stuff. Adapted
            to context: empty chat → broad questions; ongoing chat →
            sharper follow-ups. */}
        <div className="px-4 pt-2.5 pb-3 border-t border-zinc-100 dark:border-zinc-800/60">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {[
              { label: 'Plan my week',    prompt: 'Plan my week: pick the most important things to ship Mon–Fri.' },
              { label: 'What’s blocked?', prompt: 'What’s blocked or waiting on someone else right now?' },
              { label: 'Follow-ups',      prompt: 'Show me pending follow-ups across clients + inbox I haven’t replied to.' },
              { label: 'Catch me up',     prompt: 'Catch me up on what changed since yesterday across tasks, inbox, and finance.' },
            ].map((c, idx) => (
              <motion.button
                key={c.label}
                onClick={() => handleSend(c.prompt)}
                disabled={sending}
                initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING_ENTER, delay: 0.05 + idx * 0.03 }}
                whileTap={{ scale: 0.94, transition: SPRING_TAP }}
                whileHover={{ y: -1, transition: SPRING_TAP }}
                className="px-2.5 py-1 rounded-full border border-zinc-200 dark:border-zinc-700/70 text-[11px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {c.label}
              </motion.button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              placeholder={voice.isListening ? 'Listening…' : 'Ask anything…'}
              rows={1}
              className={`flex-1 resize-none px-3.5 py-2 rounded-xl border text-[12.5px] text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none max-h-32 transition-colors ${
                voice.isListening
                  ? 'bg-rose-50/40 dark:bg-rose-500/5 border-rose-200/60 dark:border-rose-500/30'
                  : 'bg-zinc-50 dark:bg-zinc-800/60 border-transparent focus:border-zinc-300 dark:focus:border-zinc-600'
              }`}
              style={{ minHeight: '36px' }}
            />
            {/* Mic — toggles voice input. Only rendered when the
                browser supports SpeechRecognition (hidden in Firefox
                and on iOS Safari versions that haven't shipped it).
                Listening state turns the button red + pulsing, with a
                title that reflects the current language so the user
                knows what locale is being dictated. */}
            {voice.isSupported && (
              <motion.button
                onClick={() => voice.isListening ? voice.stop() : voice.start()}
                disabled={sending}
                title={voice.isListening ? 'Stop listening' : `Dictate (${voiceLang})`}
                aria-label={voice.isListening ? 'Stop dictation' : 'Start dictation'}
                whileTap={{ scale: 0.9, transition: SPRING_TAP }}
                animate={voice.isListening
                  ? { scale: [1, 1.06, 1], transition: { duration: 1.1, repeat: Infinity, ease: 'easeInOut' } }
                  : { scale: 1 }
                }
                className={`p-2 rounded-xl border transition-colors relative ${
                  voice.isListening
                    ? 'bg-rose-500 border-rose-500 text-white shadow-[0_0_0_4px_rgba(244,63,94,0.18)]'
                    : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:border-zinc-300 dark:hover:border-zinc-600 disabled:opacity-40'
                }`}
              >
                <Icons.Mic size={14} />
                {/* Soft pulsing halo when listening — radiates out then
                    fades. Subtle vs the obvious red dot, but reads
                    instantly as "I'm hearing you". */}
                {voice.isListening && !reduceMotion && (
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 rounded-xl bg-rose-500/30"
                    initial={{ scale: 1, opacity: 0.6 }}
                    animate={{ scale: 1.6, opacity: 0 }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
                  />
                )}
              </motion.button>
            )}
            <motion.button
              onClick={() => handleSend()}
              disabled={!input.trim() || sending}
              whileTap={{ scale: 0.9, transition: SPRING_TAP }}
              className="p-2 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              aria-label="Send"
            >
              <Icons.Send size={14} />
            </motion.button>
          </div>
          {voice.error && (
            <div className="mt-1.5 text-[10.5px] text-rose-600 dark:text-rose-400">
              {voice.error}
            </div>
          )}
        </div>
      </section>

      {/* ── RIGHT: structured panel with tabs ── */}
      <section className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col overflow-hidden">
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
                onComplete={handleTaskComplete}
                onSnooze={handleTaskSnooze}
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
                onComplete={handleTaskComplete}
                onSnooze={handleTaskSnooze}
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
                onComplete={handleTaskComplete}
                onSnooze={handleTaskSnooze}
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
                <div className="space-y-2">
                  <AnimatePresence initial={false}>
                  {pendingMessages.map((m, idx) => (
                    <SwipeableInboxCard
                      key={m.id}
                      message={m}
                      idx={idx}
                      onOpen={() => onNavigate('communications')}
                      onConvert={() => handleConvertToTask(m)}
                      onMarkDone={() => handleMarkMessageDone(m)}
                    />
                  ))}
                  </AnimatePresence>
                </div>
              )}
            </section>
          )}
        </div>
      </section>
    </div>
  );
};

// ── Task section renderer ──────────────────────────────────────────
// Card style matching InboxCard: thin border, more padding, priority
// surfaced as a colored left edge (4px bar) instead of a tiny dot.
// Hover surfaces inline Done / Snooze actions so the user can clear
// items without opening the full task panel. The whole card click
// still opens the task panel as the canonical "I want to edit this"
// path.
const PRIORITY_EDGE: Record<string, string> = {
  urgent: 'bg-rose-500',
  high:   'bg-amber-500',
  medium: 'bg-indigo-400',
  low:    'bg-zinc-300 dark:bg-zinc-700',
};

const TaskSection: React.FC<{
  title: string;
  icon: React.ReactNode;
  tasks: CalendarTask[];
  tone: 'rose' | 'amber' | 'indigo';
  projectsById: Map<string, any>;
  clientsById: Map<string, any>;
  onTaskClick: (t: CalendarTask) => void;
  onComplete: (t: CalendarTask) => void;
  onSnooze: (t: CalendarTask) => void;
  emptyText: string;
}> = ({ title, icon, tasks, tone, projectsById, clientsById, onTaskClick, onComplete, onSnooze, emptyText }) => {
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
        <div className="space-y-2">
        <AnimatePresence initial={false}>
          {tasks.slice(0, 12).map((t, idx) => {
            const proj = t.project_id ? projectsById.get(t.project_id) : null;
            const cli  = t.client_id ? clientsById.get(t.client_id) : (proj?.client_id ? clientsById.get(proj.client_id) : null);
            const due = formatRelative(t.start_date);
            const edge = PRIORITY_EDGE[t.priority || 'medium'];
            return (
              <SwipeableTaskCard
                key={t.id}
                task={t}
                edge={edge}
                due={due}
                tone={tone}
                proj={proj}
                cli={cli}
                idx={idx}
                onClick={onTaskClick}
                onComplete={onComplete}
                onSnooze={onSnooze}
              />
            );
          })}
        </AnimatePresence>
          {tasks.length > 12 && (
            <div className="px-3 py-1 text-[10px] text-zinc-400">+{tasks.length - 12} more</div>
          )}
        </div>
      )}
    </section>
  );
};

// ── Swipeable task card (iOS Mail style) ────────────────────────────
// Drag right (+X) → reveals indigo "Snooze +1d" panel underneath →
// past 80px, releasing fires onSnooze and the card exits.
// Drag left (-X) → reveals emerald "Mark done" panel → past 80px,
// fires onComplete.
// Below threshold or short distance: spring-back-to-origin (handled
// by dragSnapToOrigin). The whole card is also still clickable for
// non-drag interactions — Framer Motion treats small movements as
// taps, big ones as drags.
//
// SWIPE_THRESHOLD and SWIPE_VELOCITY are imported from lib/ui/motion
// so the inbox card uses identical numbers — a swipe feels the same
// regardless of which surface you're on.

interface SwipeableTaskCardProps {
  task: CalendarTask;
  edge: string;
  due: string;
  tone: 'rose' | 'amber' | 'indigo';
  proj: any;
  cli: any;
  idx: number;
  onClick: (t: CalendarTask) => void;
  onComplete: (t: CalendarTask) => void;
  onSnooze: (t: CalendarTask) => void;
}

const SwipeableTaskCard: React.FC<SwipeableTaskCardProps> = ({
  task: t, edge, due, tone, proj, cli, idx, onClick, onComplete, onSnooze,
}) => {
  const reduceMotion = useReducedMotion();
  // x tracks the card's horizontal offset during a drag. The
  // background opacities + icon scales are derived from it via
  // useTransform so they respond live with no extra state.
  const x = useMotionValue(0);
  // Reveal the snooze (indigo) panel when dragging right; intensify
  // sharply near the threshold so the user feels the "snap zone".
  const snoozeOpacity = useTransform(x, [0, 30, 70, 80, 200], [0, 0.3, 0.85, 1, 1]);
  const snoozeScale   = useTransform(x, [0, 60, 80, 200], [0.85, 0.95, 1.1, 1.1]);
  // Same on the left side for the complete (emerald) panel.
  const completeOpacity = useTransform(x, [-200, -80, -70, -30, 0], [1, 1, 0.85, 0.3, 0]);
  const completeScale   = useTransform(x, [-200, -80, -60, 0], [1.1, 1.1, 0.95, 0.85]);

  const handleDragEnd = (_: any, info: PanInfo) => {
    const past = Math.abs(info.offset.x) > SWIPE_THRESHOLD;
    const fast = Math.abs(info.velocity.x) > SWIPE_VELOCITY;
    if (past || fast) {
      if (info.offset.x < 0) onComplete(t);
      else onSnooze(t);
      // Card removal is handled by the parent updating its tasks
      // list (the AnimatePresence exit animation runs automatically).
      // If for some reason the parent doesn't update (e.g. failed
      // mutation), spring x back so the card stays usable.
      setTimeout(() => x.set(0), 200);
    } else {
      // Below threshold — spring back to origin.
      x.set(0);
    }
  };

  return (
    <motion.div
      layout
      initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.22 } }}
      transition={{ type: 'spring', stiffness: 320, damping: 26, delay: idx < 8 ? idx * 0.02 : 0 }}
      className="relative rounded-xl overflow-hidden"
    >
      {/* Background panels under the card — reveal during drag.
          Pointer-events none so they never interfere with the card's
          own click handling. */}
      <div className="absolute inset-0 flex items-center justify-between px-4 pointer-events-none">
        <motion.div
          style={{ opacity: snoozeOpacity, scale: snoozeScale }}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300"
        >
          <Icons.Clock size={13} />
          Snooze +1d
        </motion.div>
        <motion.div
          style={{ opacity: completeOpacity, scale: completeScale }}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300"
        >
          Mark done
          <Icons.Check size={13} />
        </motion.div>
      </div>
      {/* Background tint — also driven by x. Sits below the panels'
          text so the card slides over a colored ground. */}
      <motion.div
        style={{ opacity: useTransform(x, [-100, 0, 100], [0.18, 0, 0.18]) }}
        className="absolute inset-0 pointer-events-none"
      >
        <motion.div
          style={{ opacity: useTransform(x, [-100, 0], [1, 0]) }}
          className="absolute inset-0 bg-emerald-100 dark:bg-emerald-500/20"
        />
        <motion.div
          style={{ opacity: useTransform(x, [0, 100], [0, 1]) }}
          className="absolute inset-0 bg-indigo-100 dark:bg-indigo-500/20"
        />
      </motion.div>

      {/* The draggable card itself */}
      <motion.div
        drag={reduceMotion ? false : 'x'}
        dragConstraints={{ left: -150, right: 150 }}
        dragElastic={0.15}
        dragMomentum={false}
        style={{ x }}
        onDragEnd={handleDragEnd}
        whileTap={{ scale: 0.995 }}
        whileHover={{ y: -1, transition: SPRING_TAP }}
        className="group relative bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 rounded-xl overflow-hidden"
      >
        {/* Left priority edge — 4px colored bar absolute-positioned
            so the rest of the card stays a clean rectangle. */}
        <span className={`absolute left-0 top-0 bottom-0 w-1 ${edge}`} aria-hidden />
        <button
          onClick={() => onClick(t)}
          className="w-full text-left pl-4 pr-3 pt-2.5 pb-2"
        >
          <div className="text-[12.5px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
            {t.title}
          </div>
          <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-500">
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
        </button>
        {/* Hover-revealed inline actions — kept for mouse users who
            don't want to drag. Touch users get the swipe gestures
            via the parent motion.div. */}
        <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white dark:bg-zinc-900 rounded-md">
          <button
            onClick={(e) => { e.stopPropagation(); onComplete(t); }}
            title="Mark done"
            className="p-1.5 rounded-md text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
          >
            <Icons.Check size={11} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onSnooze(t); }}
            title="Snooze +1 day"
            className="p-1.5 rounded-md text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
          >
            <Icons.Clock size={11} />
          </button>
        </div>
      </motion.div>
    </motion.div>
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
  // Each state is its own motion.div under an AnimatePresence
  // mode="wait" so the card morphs between forms: pending → executing
  // (small scale-out, spin in) → done (chip swooshes in with a Check
  // pop). iOS feel: spring physics, never linear easing.
  const tx = SPRING_TAP;
  if (action.state === 'done') {
    return (
      <motion.div
        key="done"
        layout
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={tx}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10.5px] font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30"
      >
        {/* The check pops in slightly after the chip so the eye reads
            the chip first, then the action confirmation. */}
        <motion.span
          initial={{ scale: 0, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ ...tx, delay: 0.08 }}
        >
          <Icons.Check size={11} />
        </motion.span>
        {action.label}
      </motion.div>
    );
  }
  if (action.state === 'skipped') {
    return (
      <motion.div
        key="skipped"
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={tx}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10.5px] font-medium bg-zinc-100 dark:bg-zinc-800/60 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700"
      >
        <Icons.Close size={10} />
        {action.label} (skipped)
      </motion.div>
    );
  }
  if (action.state === 'failed') {
    return (
      <motion.div
        key="failed"
        layout
        title={action.error}
        initial={{ opacity: 0, x: -6 }}
        animate={{ opacity: 1, x: [0, -3, 3, -2, 2, 0] }}
        transition={{ x: { duration: 0.4 }, opacity: { duration: 0.2 } }}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10.5px] font-medium bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30"
      >
        <Icons.AlertCircle size={11} />
        {action.label} — failed
      </motion.div>
    );
  }
  return (
    <motion.div
      key="pending"
      layout
      initial={{ opacity: 0, y: 4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={SPRING_ENTER}
      className="flex items-center gap-2 p-2 rounded-lg border border-violet-200 dark:border-violet-500/30 bg-violet-50/60 dark:bg-violet-500/5"
    >
      <Icons.Sparkles size={12} className="text-violet-600 dark:text-violet-400 shrink-0" />
      <span className="flex-1 text-[11.5px] text-zinc-800 dark:text-zinc-100 leading-snug">
        {action.label}
      </span>
      {action.state === 'executing' ? (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={tx}
          className="text-[10px] text-violet-600 dark:text-violet-400 inline-flex items-center gap-1"
        >
          <span className="w-2.5 h-2.5 border border-violet-400 border-t-transparent rounded-full animate-spin" />
          Running…
        </motion.span>
      ) : (
        <>
          <motion.button
            onClick={onSkip}
            whileTap={{ scale: 0.92, transition: tx }}
            className="text-[10.5px] font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 px-1.5 py-0.5"
          >Skip</motion.button>
          <motion.button
            onClick={onConfirm}
            whileTap={{ scale: 0.92, transition: tx }}
            whileHover={{ y: -1, transition: tx }}
            className="text-[10.5px] font-semibold text-white bg-violet-600 hover:bg-violet-700 px-2 py-1 rounded-md inline-flex items-center gap-1"
          >
            <Icons.Check size={10} /> Confirm
          </motion.button>
        </>
      )}
    </motion.div>
  );
};

// ── Stat card ─────────────────────────────────────────────────────
// 2x2 grid above the chat. Zen minimal: thin border, white bg, color
// ONLY on the number (and only when > 0 — when zero it goes muted so
// "0 overdue" reads as "ok" instead of as a red alarm). Clicking
// jumps to the relevant section of the right panel.
const STAT_TONE: Record<string, { text: string; mute: string }> = {
  rose:    { text: 'text-rose-600 dark:text-rose-400',       mute: 'text-zinc-400 dark:text-zinc-600' },
  amber:   { text: 'text-amber-600 dark:text-amber-400',     mute: 'text-zinc-400 dark:text-zinc-600' },
  emerald: { text: 'text-emerald-600 dark:text-emerald-400', mute: 'text-zinc-400 dark:text-zinc-600' },
  violet:  { text: 'text-violet-600 dark:text-violet-400',   mute: 'text-zinc-400 dark:text-zinc-600' },
};

const StatCard: React.FC<{
  value: number;
  label: string;
  tone: keyof typeof STAT_TONE;
  onClick?: () => void;
}> = ({ value, label, tone, onClick }) => {
  const t = STAT_TONE[tone];
  const isAlert = value > 0;
  return (
    <motion.button
      onClick={onClick}
      variants={{
        hidden:  { opacity: 0, y: 8, scale: 0.96 },
        visible: { opacity: 1, y: 0, scale: 1, transition: SPRING_ENTER },
      }}
      whileTap={{ scale: TAP_SCALE, transition: SPRING_TAP }}
      whileHover={{ y: -1, transition: SPRING_TAP }}
      className="group text-left px-3 py-2.5 rounded-xl border border-zinc-200/70 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors"
    >
      {/* Number animates in via an inline AnimatePresence so the value
          itself feels alive when it changes (e.g. user completes a
          task → overdue count drops by one with a tiny slide). */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={value}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={SPRING_TAP}
          className={`text-[20px] leading-none font-semibold tabular-nums ${isAlert ? t.text : t.mute}`}
        >
          {value}
        </motion.div>
      </AnimatePresence>
      <div className="text-[10.5px] mt-1 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-300 transition-colors">
        {label}
      </div>
    </motion.button>
  );
};

// ── Inbox card ───────────────────────────────────────────────────
// Replaces the old flat-list row. Top: AI classification badge +
// sender + relative time. Middle: subject (or first body line) in
// medium weight + truncated body preview. Bottom: inline actions
// — Convert to task (1-click via the executor) and Reply (jumps to
// the full Inbox page with the message focused). The whole card is
// clickable as a fallback to open the message.
type InboxClassification = {
  should_create_task?: boolean;
  priority?: string;
  intent?: string;
  category?: string;
};

const formatMsgTime = (iso: string | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
};

const InboxCard: React.FC<{
  message: any;
  onOpen: () => void;
  onConvert: () => void;
}> = ({ message, onOpen, onConvert }) => {
  const cls: InboxClassification = message.ai_classification || {};
  const isRequest = cls.should_create_task === true;
  const isUrgent = cls.priority === 'high' || cls.intent === 'urgent';

  // Badge: pick the most informative one. Urgent wins, then Request,
  // then a generic FYI. Kept TINY (8px) so it never overwhelms the
  // card — the zen-minimal vibe wants info hierarchy, not a sticker
  // explosion.
  const badge = isUrgent
    ? { text: 'URGENT',  bg: 'bg-rose-50 dark:bg-rose-500/10',     fg: 'text-rose-700 dark:text-rose-300' }
    : isRequest
      ? { text: 'REQUEST', bg: 'bg-emerald-50 dark:bg-emerald-500/10', fg: 'text-emerald-700 dark:text-emerald-300' }
      : { text: 'FYI',     bg: 'bg-zinc-100 dark:bg-zinc-800',         fg: 'text-zinc-500 dark:text-zinc-400' };

  const sender = message.from_name || message.from_email || message.channel_name || 'Anonymous';
  const subject = message.subject || message.body_text?.split('\n')[0]?.slice(0, 80) || '(no subject)';
  const preview = (message.body_text || '').replace(/\s+/g, ' ').slice(0, 120);
  const time = formatMsgTime(message.received_at);

  const isGmail = message.platform === 'gmail';

  return (
    <div className="group rounded-xl border border-zinc-200/70 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900 transition-colors overflow-hidden">
      {/* Top: classification + sender + time. Clickable to open. */}
      <button
        onClick={onOpen}
        className="w-full text-left px-3 pt-2.5 pb-2"
      >
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className={`text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${badge.bg} ${badge.fg}`}>
            {badge.text}
          </span>
          {isGmail
            ? <Icons.Mail size={10} className="text-zinc-400" />
            : <Icons.Message size={10} className="text-zinc-400" />}
          <span className="text-[11.5px] font-medium text-zinc-800 dark:text-zinc-100 truncate">
            {sender}
          </span>
          <span className="ml-auto text-[10px] text-zinc-400 tabular-nums shrink-0">{time}</span>
        </div>
        <div className="text-[12px] font-medium text-zinc-700 dark:text-zinc-200 truncate">
          {subject}
        </div>
        {preview && preview !== subject && (
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-1 mt-0.5">
            {preview}
          </div>
        )}
      </button>
      {/* Inline actions — only render Convert when the AI flagged this
          as a real request, so we don't tempt the user into a flood of
          spurious task creation on FYI messages. */}
      <div className="px-3 pb-2 flex items-center gap-1">
        {isRequest && (
          <button
            onClick={onConvert}
            className="text-[10.5px] font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 px-2 py-1 rounded-md inline-flex items-center gap-1 transition-colors"
          >
            <Icons.Plus size={10} /> Convert to task
          </button>
        )}
        <button
          onClick={onOpen}
          className="text-[10.5px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 px-2 py-1 rounded-md inline-flex items-center gap-1 transition-colors"
        >
          <Icons.Mail size={10} /> Draft reply
        </button>
      </div>
    </div>
  );
};

// ── Swipeable inbox card ────────────────────────────────────────────
// iOS Mail style — same physics as SwipeableTaskCard but with
// different action semantics that match the inbox domain:
//   Drag LEFT  (-X) → reveals emerald "Mark done" → marks message
//                     status='replied', drops from pending queue
//   Drag RIGHT (+X) → reveals violet  "Convert to task" → creates
//                     a task from the message, status='task_created'
//
// Both gestures are universally available even on FYI messages
// (vs. the inline buttons which gate "Convert to task" behind
// isRequest). The deliberate physical commitment of a swipe makes
// false positives much less likely than an accidentally-clicked
// chip would, so universal coverage is fine here.
interface SwipeableInboxCardProps {
  message: any;
  idx: number;
  onOpen: () => void;
  onConvert: () => void;
  onMarkDone: () => void;
}

const SwipeableInboxCard: React.FC<SwipeableInboxCardProps> = ({
  message, idx, onOpen, onConvert, onMarkDone,
}) => {
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(0);
  // Mirror the task-card transforms so the snap zone feels identical
  // across both surfaces.
  const doneOpacity    = useTransform(x, [-200, -80, -70, -30, 0], [1, 1, 0.85, 0.3, 0]);
  const doneScale      = useTransform(x, [-200, -80, -60, 0], [1.1, 1.1, 0.95, 0.85]);
  const convertOpacity = useTransform(x, [0, 30, 70, 80, 200], [0, 0.3, 0.85, 1, 1]);
  const convertScale   = useTransform(x, [0, 60, 80, 200], [0.85, 0.95, 1.1, 1.1]);

  const handleDragEnd = (_: any, info: PanInfo) => {
    const past = Math.abs(info.offset.x) > SWIPE_THRESHOLD;
    const fast = Math.abs(info.velocity.x) > SWIPE_VELOCITY;
    if (past || fast) {
      if (info.offset.x < 0) onMarkDone();
      else onConvert();
      setTimeout(() => x.set(0), 200);
    } else {
      x.set(0);
    }
  };

  return (
    <motion.div
      layout
      initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.22 } }}
      transition={{ ...SPRING_ENTER, delay: idx < 8 ? idx * 0.025 : 0 }}
      className="relative rounded-xl overflow-hidden"
    >
      {/* Reveal-on-drag panels. Mirrors SwipeableTaskCard's structure
          so the two surfaces feel like one design. */}
      <div className="absolute inset-0 flex items-center justify-between px-4 pointer-events-none">
        <motion.div
          style={{ opacity: convertOpacity, scale: convertScale }}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-violet-700 dark:text-violet-300"
        >
          <Icons.Plus size={13} />
          Convert to task
        </motion.div>
        <motion.div
          style={{ opacity: doneOpacity, scale: doneScale }}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300"
        >
          Mark done
          <Icons.Check size={13} />
        </motion.div>
      </div>
      <motion.div
        style={{ opacity: useTransform(x, [-100, 0, 100], [0.18, 0, 0.18]) }}
        className="absolute inset-0 pointer-events-none"
      >
        <motion.div
          style={{ opacity: useTransform(x, [-100, 0], [1, 0]) }}
          className="absolute inset-0 bg-emerald-100 dark:bg-emerald-500/20"
        />
        <motion.div
          style={{ opacity: useTransform(x, [0, 100], [0, 1]) }}
          className="absolute inset-0 bg-violet-100 dark:bg-violet-500/20"
        />
      </motion.div>

      {/* The draggable card — wraps the existing InboxCard so the
          presentational logic stays in one place. */}
      <motion.div
        drag={reduceMotion ? false : 'x'}
        dragConstraints={{ left: -150, right: 150 }}
        dragElastic={0.15}
        dragMomentum={false}
        style={{ x }}
        onDragEnd={handleDragEnd}
        whileTap={{ scale: 0.995 }}
        whileHover={{ y: -1, transition: SPRING_TAP }}
      >
        <InboxCard message={message} onOpen={onOpen} onConvert={onConvert} />
      </motion.div>
    </motion.div>
  );
};
