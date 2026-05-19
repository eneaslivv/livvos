/**
 * Home — the dashboard you land on every morning. Designed to match
 * the Brief redesign brief: open the app and immediately see what
 * matters, with the AI summary + chat available right here so you
 * don't have to navigate anywhere.
 *
 * Layout (top → bottom, left → right):
 *   • Gradient hero ribbon — purely cosmetic, sets the daily-ritual tone
 *   • Header row: date + greeting on the left, ModeTabs on the right
 *   • Two columns:
 *       LEFT (main):
 *         - 4 stat cards (overdue / due today / events / pending msgs)
 *         - DailyBrief (AI summary + category cards)
 *         - Slim chat block (prompt chips + ask box + last messages)
 *         - Tasks / Calendar / Inbox tabs
 *       RIGHT (sidebar):
 *         - Pending counter
 *         - Done today counter
 *         - Monthly profit sparkline
 *         - AI Insights pills
 *
 * The previous detailed Home is preserved at pages/HomeLegacy.tsx
 * (still wired in routing if we want to expose it later).
 *
 * Three "modes" (Thoughts / Vision / Deep work) — each swaps the
 * prompt chips + the placeholder + the brief synthesis tone so the
 * surface feels like it adapts to what you're trying to do, instead
 * of being a fixed dashboard.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../components/ui/Icons';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from '../context/TenantContext';
import { useCalendar } from '../context/CalendarContext';
import { useFinance } from '../context/FinanceContext';
import { useClients } from '../context/ClientsContext';
import { useProjects } from '../context/ProjectsContext';
import { runOrchestrator, executeProposedAction, type ProposedAction } from '../lib/agents';
import { errorLogger } from '../lib/errorLogger';
import { DailyBrief } from '../components/brief/DailyBrief';
import { Markdown } from '../lib/markdown';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { SPRING_ENTER, SPRING_TAP } from '../lib/ui/motion';
import type { PageView, NavParams } from '../types';

interface HomeProps {
  onNavigate: (page: PageView, params?: NavParams) => void;
}

// ── Mode definitions ───────────────────────────────────────────────
// Each mode reshapes the conversational surface for a different kind
// of working session. Chips + placeholder + a hint string that the
// brief synthesis tone reads (concise/warm/direct/coaching are the
// underlying brief synthesis_tone values).
type Mode = 'thoughts' | 'vision' | 'deep';
interface ModeConfig {
  id: Mode;
  label: string;
  icon: keyof typeof Icons;
  placeholder: string;
  chips: Array<{ label: string; prompt: string }>;
}
const MODES: ModeConfig[] = [
  {
    id: 'thoughts',
    label: 'Thoughts',
    icon: 'Sparkles',
    placeholder: "What's on your mind?",
    chips: [
      { label: 'Brainstorm',     prompt: 'Help me brainstorm — give me 5 angles on the topic I describe next.' },
      { label: 'Reflect on this week', prompt: 'Reflect on this week with me — what shipped, what stalled, what to repeat.' },
      { label: 'Write something', prompt: 'Help me write a short note about something I want to say publicly. Ask 2 quick questions first.' },
    ],
  },
  {
    id: 'vision',
    label: 'Vision',
    icon: 'Eye',
    placeholder: 'What are we building toward?',
    chips: [
      { label: 'Strategy check',  prompt: 'Read the strategy hub and tell me where I am drifting from the ICPs I defined.' },
      { label: 'Roadmap status',  prompt: 'Where are we against the growth phases? Which milestones are slipping?' },
      { label: 'Big bets',        prompt: 'If I could only do 3 things this quarter to move the business forward, what should they be?' },
    ],
  },
  {
    id: 'deep',
    label: 'Deep work',
    icon: 'Zap',
    placeholder: "Let's focus — what's the first thing?",
    chips: [
      { label: 'Plan my week',    prompt: 'Plan my week: pick the most important things to ship Mon–Fri.' },
      { label: "What's blocked?", prompt: "What's blocked or waiting on someone else right now?" },
      { label: 'Follow-ups',      prompt: "Show me pending follow-ups across clients + inbox I haven't replied to." },
      { label: 'Catch me up',     prompt: 'Catch me up on what changed since yesterday across tasks, inbox, and finance.' },
    ],
  },
];

type ActionState = 'pending' | 'executing' | 'done' | 'skipped' | 'failed';
type ChatAction = ProposedAction & { state: ActionState; error?: string };
interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
  actions?: ChatAction[];
  conversationId?: string | null;
  agentId?: string;
}

export const Home: React.FC<HomeProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { currentTenant, updateTenant } = useTenant();

  // ── Cover image upload ───────────────────────────────────────────
  // Restores the "change cover" feature from the legacy Home (where it
  // lived on a separate banner block). Now it overlays the gradient
  // hero ribbon: hover the ribbon to reveal a "Change cover" pill, or
  // click a small "×" to remove a previously uploaded one and fall
  // back to the gradient. Uploaded image is stored on tenant_assets/
  // and persisted on tenants.banner_url so it sticks across sessions
  // and is shared by everyone in the workspace.
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const handleCoverUpload = useCallback(async (file: File | undefined) => {
    if (!file || !currentTenant) return;
    if (file.size > 5 * 1024 * 1024) {
      setCoverError('Max 5MB');
      setTimeout(() => setCoverError(null), 4000);
      return;
    }
    setIsUploadingCover(true);
    setCoverError(null);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `banners/${currentTenant.id}.${ext}`;
      // Remove any older file at this path (different extension OK to leave).
      await supabase.storage.from('tenant-assets').remove([path]).catch(() => {});
      const { error: upErr } = await supabase.storage
        .from('tenant-assets')
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('tenant-assets').getPublicUrl(path);
      // Cache-bust so the new image shows immediately even if the URL string is the same.
      await updateTenant({ banner_url: `${urlData.publicUrl}?v=${Date.now()}` });
    } catch (err) {
      errorLogger.warn('home cover upload failed', err);
      setCoverError((err as Error)?.message || 'Could not upload cover');
      setTimeout(() => setCoverError(null), 6000);
    } finally {
      setIsUploadingCover(false);
    }
  }, [currentTenant, updateTenant]);
  const handleCoverRemove = useCallback(async () => {
    if (!currentTenant) return;
    try {
      await updateTenant({ banner_url: null as any });
    } catch (err) {
      errorLogger.warn('home cover remove failed', err);
    }
  }, [currentTenant, updateTenant]);
  const { tasks: allTasks, events, updateTask, createTask, updateEvent, createEvent, deleteEvent, deleteTask } = useCalendar();
  const { incomes, expenses } = useFinance();
  const { clients } = useClients();
  const { projects } = useProjects();
  const [mode, setMode] = useState<Mode>('deep');
  // Persist mode in brief_preferences.home_mode so the user's
  // workspace context survives reloads. Load once on mount; save
  // optimistically + persist in background on every change.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('brief_preferences')
          .select('home_mode')
          .eq('user_id', user.id)
          .maybeSingle();
        const persisted = (data as any)?.home_mode as Mode | undefined;
        if (!cancelled && persisted) setMode(persisted);
      } catch { /* default 'deep' is fine */ }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);
  const persistMode = useCallback(async (next: Mode) => {
    setMode(next);  // optimistic
    if (!user?.id || !currentTenant?.id) return;
    try {
      await supabase.from('brief_preferences').upsert({
        user_id: user.id,
        tenant_id: currentTenant.id,
        home_mode: next,
      });
    } catch { /* non-fatal */ }
  }, [user?.id, currentTenant?.id]);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingMsgs, setPendingMsgs] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const modeConfig = MODES.find(m => m.id === mode)!;

  // ── Derived counts for the top stat cards ───────────────────────
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const todayIso = useMemo(() => today.toISOString().slice(0, 10), [today]);
  const { overdueCount, dueTodayCount, doneTodayCount, eventsTodayCount } = useMemo(() => {
    let overdue = 0, dueToday = 0, doneToday = 0;
    for (const t of allTasks) {
      const isMine = t.assignee_ids?.includes(user?.id || '') || t.owner_id === user?.id;
      if (!isMine) continue;
      if (t.completed) {
        if (t.completed_at && t.completed_at.slice(0, 10) === todayIso) doneToday++;
        continue;
      }
      if (t.status === 'cancelled') continue;
      const due = t.start_date;
      if (!due) continue;
      if (due < todayIso) overdue++;
      else if (due === todayIso) dueToday++;
    }
    const eventsToday = events.filter(e => e.start_date?.slice(0, 10) === todayIso).length;
    return { overdueCount: overdue, dueTodayCount: dueToday, doneTodayCount: doneToday, eventsTodayCount: eventsToday };
  }, [allTasks, events, user?.id, todayIso]);

  // ── Pending inbox count ─────────────────────────────────────────
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
        if (!cancelled) setPendingMsgs(count || 0);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [currentTenant?.id]);

  // ── Monthly profit sparkline data (last 6 months) ───────────────
  const profitSeries = useMemo(() => {
    const now = new Date();
    const buckets: Array<{ label: string; profit: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthIso = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
      const paid = incomes.reduce((s, inc) => {
        return s + (inc.installments || [])
          .filter(inst => inst.status === 'paid' && inst.paid_date?.startsWith(monthIso))
          .reduce((ss, inst) => ss + (inst.amount || 0), 0);
      }, 0);
      const spent = expenses
        .filter(e => e.status === 'paid' && e.date?.startsWith(monthIso))
        .reduce((s, e) => s + (e.amount || 0), 0);
      buckets.push({ label: m.toLocaleDateString('en-US', { month: 'short' }), profit: paid - spent });
    }
    return buckets;
  }, [incomes, expenses]);
  const currentMonthProfit = profitSeries[profitSeries.length - 1]?.profit || 0;
  const lastMonthProfit = profitSeries[profitSeries.length - 2]?.profit || 0;
  const profitDelta = currentMonthProfit - lastMonthProfit;

  // ── Insights — quick auto-derived bullets ───────────────────────
  // Each insight carries a `navigateTo` page so clicking the pill
  // jumps to the relevant module. Filtering happens inside the
  // component — pills with zero values are dropped before render.
  type Insight = { label: string; tone: 'rose' | 'amber' | 'emerald' | 'violet' | 'blue'; navigateTo: PageView };
  const insights = useMemo<Insight[]>(() => {
    const out: Insight[] = [];
    const monthIso = todayIso.slice(0, 7);
    const monthPending = incomes.reduce((s, inc) => s + (inc.installments || [])
      .filter(i => i.status === 'pending' && i.due_date?.startsWith(monthIso))
      .reduce((ss, i) => ss + (i.amount || 0), 0), 0);
    if (monthPending > 0)        out.push({ label: `$${monthPending.toLocaleString()} pending`,       tone: 'amber',   navigateTo: 'finance' });
    if (currentMonthProfit > 0)  out.push({ label: `+$${currentMonthProfit.toLocaleString()} profit`, tone: 'emerald', navigateTo: 'finance' });
    if (overdueCount > 0)        out.push({ label: `${overdueCount} overdue`,                          tone: 'rose',    navigateTo: 'brief' });
    const activeProjects = projects.filter((p: any) => p.status === 'Active' || p.status === 'Pending').length;
    if (activeProjects > 0)      out.push({ label: `${activeProjects} active projects`,                tone: 'blue',    navigateTo: 'projects' });
    if (clients.length > 0)      out.push({ label: `${clients.length} clients`,                        tone: 'violet',  navigateTo: 'clients' });
    return out;
  }, [currentMonthProfit, overdueCount, incomes, projects, clients, todayIso]);

  // ── Voice input ─────────────────────────────────────────────────
  const voice = useVoiceInput({
    lang: 'es-AR',
    onPartial: (t) => setInput(t),
    onAutoSend: (t) => { if (t.trim()) handleSend(t.trim()); },
  });

  // ── Chat send through orchestrator ──────────────────────────────
  const handleSend = useCallback(async (override?: string) => {
    const q = (override ?? input).trim();
    if (!q || sending || !currentTenant?.id || !user?.id) return;
    if (!override) setInput('');
    setMessages(prev => [...prev, { role: 'user', content: q, ts: Date.now() }]);
    setSending(true);
    try {
      const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }));
      const out = await runOrchestrator(
        { query: q, history, ctx: { db: supabase as any, tenantId: currentTenant.id, userId: user.id, now: new Date() } },
        { surface: 'home' },
      );
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: out.reply,
        ts: Date.now(),
        actions: (out.proposedActions || []).map(a => ({ ...a, state: 'pending' as const })),
        conversationId: (out as any).conversationId || null,
        agentId: out.agentId,
      }]);
    } catch (e: any) {
      errorLogger.warn('home chat failed', e);
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e?.message || 'unknown'}`, ts: Date.now() }]);
    } finally {
      setSending(false);
    }
  }, [input, sending, currentTenant?.id, user?.id, messages]);

  // Auto-scroll on new message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  // Execute an AI-proposed action inline via the centralized executor.
  const executeAction = async (msgIdx: number, actionIdx: number) => {
    const msg = messages[msgIdx];
    const action = msg?.actions?.[actionIdx];
    if (!action || action.state !== 'pending') return;
    setMessages(prev => {
      const next = [...prev];
      next[msgIdx] = { ...next[msgIdx], actions: next[msgIdx].actions!.map((a, i) => i === actionIdx ? { ...a, state: 'executing' as const } : a) };
      return next;
    });
    try {
      const result = await executeProposedAction(action, {
        db: supabase as any, tenantId: currentTenant!.id, userId: user!.id, now: new Date(),
      }, {
        updateTask: (id, p) => updateTask(id, p as any),
        createTask: (d) => createTask(d as any),
        deleteTask: (id) => deleteTask(id),
        updateEvent: (id, p) => updateEvent(id, p as any),
        createEvent: (d) => createEvent(d as any),
        deleteEvent: (id) => deleteEvent(id),
      });
      const newState: ActionState = result.ok ? 'done' : 'failed';
      setMessages(prev => {
        const next = [...prev];
        next[msgIdx] = { ...next[msgIdx], actions: next[msgIdx].actions!.map((a, i) => i === actionIdx ? { ...a, state: newState, error: result.error } : a) };
        return next;
      });
    } catch (e: any) {
      setMessages(prev => {
        const next = [...prev];
        next[msgIdx] = { ...next[msgIdx], actions: next[msgIdx].actions!.map((a, i) => i === actionIdx ? { ...a, state: 'failed' as const, error: e?.message } : a) };
        return next;
      });
    }
  };

  const userFirstName = useMemo(() => {
    const n = (user as any)?.user_metadata?.name || (user as any)?.email || '';
    return n.split(/[\s@]/)[0] || 'there';
  }, [user]);
  const partOfDay = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const dateLabel = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();

  return (
    <div className="min-h-[calc(100vh-3rem)]">
      {/* Hero ribbon — atmospheric gradient by default, or a custom
          cover image when the user uploads one. Hover the ribbon to
          reveal the "Change cover" pill; if an uploaded cover is in
          place, a small "Remove" pill appears next to it to fall back
          to the gradient. Stays cosmetic — no copy lives inside. */}
      <label
        className="group relative h-[120px] w-full rounded-2xl overflow-hidden mb-6 block cursor-pointer"
        style={
          currentTenant?.banner_url
            ? undefined
            : { background: 'linear-gradient(120deg, #f9a8d4 0%, #fbcfe8 15%, #fde68a 35%, #fed7aa 55%, #fda4af 75%, #c4b5fd 100%)' }
        }
      >
        {currentTenant?.banner_url && (
          <img
            src={currentTenant.banner_url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        {/* Soft scrim on hover so the pill stays readable on any image */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors" />

        {/* Action pills — hidden until hover */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 translate-y-0.5 group-hover:translate-y-0 transition-all">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/95 dark:bg-zinc-900/95 backdrop-blur text-[11px] font-medium text-zinc-700 dark:text-zinc-200 shadow-sm">
            {isUploadingCover ? (
              <span className="w-3 h-3 border-2 border-zinc-400 border-t-zinc-900 rounded-full animate-spin" />
            ) : (
              <Icons.Upload size={11} />
            )}
            {isUploadingCover ? 'Uploading…' : currentTenant?.banner_url ? 'Change cover' : 'Add cover'}
          </span>
          {currentTenant?.banner_url && !isUploadingCover && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleCoverRemove();
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/95 dark:bg-zinc-900/95 backdrop-blur text-[11px] font-medium text-zinc-600 dark:text-zinc-300 shadow-sm hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
              title="Remove cover image"
            >
              <Icons.X size={11} />
              Remove
            </button>
          )}
        </div>

        {/* Hidden file input — click anywhere on the ribbon triggers it */}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          disabled={isUploadingCover}
          onChange={(e) => {
            const file = e.target.files?.[0];
            handleCoverUpload(file);
            e.target.value = '';
          }}
        />

        {/* Error toast — anchored bottom-center */}
        {coverError && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-rose-50/95 border border-rose-200 text-[11px] font-medium text-rose-700">
            {coverError}
          </div>
        )}
      </label>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)] gap-6 max-w-[1500px] mx-auto px-4">
        {/* ── LEFT main column ─────────────────────────────────── */}
        <div className="space-y-5">
          {/* Greeting row */}
          <header>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-zinc-400">{dateLabel}</div>
            <div className="flex items-end justify-between gap-4 mt-1.5 flex-wrap">
              <h1 className="text-[28px] md:text-[34px] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight leading-tight">
                {partOfDay}, <span className="capitalize">{userFirstName}</span>.
              </h1>
              <ModeTabs mode={mode} onChange={persistMode} />
            </div>
            <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center gap-3 text-[10.5px] text-zinc-400 uppercase tracking-wider">
              <Icons.Sparkles size={11} className="text-zinc-300 dark:text-zinc-700" />
              Brief — {today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              <span className="ml-auto inline-flex items-center gap-1.5 normal-case tracking-normal text-zinc-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> No meetings ahead
              </span>
            </div>
          </header>

          {/* Top stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <StatCard label="Overdue"      value={overdueCount}    tone="rose"    />
            <StatCard label="Due today"    value={dueTodayCount}   tone="amber"   />
            <StatCard label="Events today" value={eventsTodayCount} tone="emerald" />
            <StatCard label="Pending msgs" value={pendingMsgs}     tone="violet"  />
          </div>

          {/* Chat block — slim version of the Brief chat. Greeting +
              prompt chips + ask box + last few messages. For the
              full Tasks/Calendar/Inbox tabs, the user navigates to
              Brief (linked from the bottom). */}
          <section className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center shrink-0">
                <Icons.Sparkles size={13} className="text-white dark:text-zinc-900" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] text-zinc-900 dark:text-zinc-100 leading-snug">
                  {partOfDay.replace('Good ', 'Buen ').replace('morning', 'mañana').replace('afternoon', 'tarde').replace('evening', 'noche')}, <span className="capitalize">{userFirstName}</span>.
                  <span className="text-zinc-500 dark:text-zinc-400 font-normal ml-1">{modeConfig.placeholder}</span>
                </div>
              </div>
            </div>
            {/* Prompt chips for the current mode */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {modeConfig.chips.map(c => {
                const IconCmp = (Icons as any)[
                  c.label.includes('week') ? 'Calendar' :
                  c.label.includes('blocked') ? 'AlertTriangle' :
                  c.label.includes('Follow-ups') ? 'Mail' :
                  c.label.includes('Catch') ? 'Zap' :
                  c.label.includes('Brainstorm') ? 'Sparkles' :
                  c.label.includes('Reflect') ? 'Activity' :
                  c.label.includes('Write') ? 'Edit' :
                  c.label.includes('Strategy') ? 'Target' :
                  c.label.includes('Roadmap') ? 'Flag' :
                  c.label.includes('Big bets') ? 'Star' :
                  'Sparkles'
                ] || Icons.Sparkles;
                return (
                  <motion.button
                    key={c.label}
                    onClick={() => handleSend(c.prompt)}
                    disabled={sending}
                    whileTap={{ scale: 0.96, transition: SPRING_TAP }}
                    whileHover={{ y: -1, transition: SPRING_TAP }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700/70 text-[11px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600 disabled:opacity-40 transition-colors"
                  >
                    <IconCmp size={11} />
                    {c.label}
                  </motion.button>
                );
              })}
            </div>
            {/* Input */}
            <div className="mt-3 flex items-end gap-2">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder={voice.isListening ? 'Listening…' : `Ask anything…  e.g. show me what's overdue on Sunnyside`}
                rows={1}
                className={`flex-1 resize-none px-3.5 py-2 rounded-xl text-[12.5px] text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none max-h-32 transition-colors border ${
                  voice.isListening
                    ? 'bg-rose-50/40 dark:bg-rose-500/5 border-rose-200/60 dark:border-rose-500/30'
                    : 'bg-zinc-50 dark:bg-zinc-800/60 border-transparent focus:border-zinc-300 dark:focus:border-zinc-600'
                }`}
                style={{ minHeight: '38px' }}
              />
              {voice.isSupported && (
                <motion.button
                  onClick={() => voice.isListening ? voice.stop() : voice.start()}
                  disabled={sending}
                  whileTap={{ scale: 0.9, transition: SPRING_TAP }}
                  animate={voice.isListening ? { scale: [1, 1.06, 1], transition: { duration: 1.1, repeat: Infinity, ease: 'easeInOut' } } : { scale: 1 }}
                  className={`p-2 rounded-xl border transition-colors ${
                    voice.isListening
                      ? 'bg-rose-500 border-rose-500 text-white'
                      : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-40'
                  }`}
                  title={voice.isListening ? 'Stop' : 'Dictate'}
                >
                  <Icons.Mic size={14} />
                </motion.button>
              )}
              <motion.button
                onClick={() => handleSend()}
                disabled={!input.trim() || sending}
                whileTap={{ scale: 0.9, transition: SPRING_TAP }}
                className="p-2 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                <Icons.Send size={14} />
              </motion.button>
            </div>
            {voice.error && (
              <div className="mt-1.5 text-[10.5px] text-rose-600 dark:text-rose-400">{voice.error}</div>
            )}

            {/* Last message thread (compact). Full chat history lives in Brief. */}
            {messages.length > 0 && (
              <div ref={scrollRef} className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800/60 max-h-[40vh] overflow-y-auto space-y-3">
                <AnimatePresence initial={false}>
                  {messages.slice(-6).map((m, i) => (
                    <motion.div
                      key={`${m.ts}-${i}`}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={SPRING_ENTER}
                      className={m.role === 'user' ? 'flex justify-end' : ''}
                    >
                      <div className="max-w-full">
                        {m.role === 'user' ? (
                          <div className="max-w-[85%] bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-2xl rounded-br-md px-3.5 py-2 ml-auto text-[12.5px] leading-relaxed whitespace-pre-wrap">
                            {m.content}
                          </div>
                        ) : (
                          <>
                            <Markdown source={m.content} />
                            {m.actions && m.actions.length > 0 && (
                              <div className="mt-2 space-y-1.5">
                                {m.actions.map((a, ai) => (
                                  <ActionCard
                                    key={ai}
                                    action={a}
                                    onConfirm={() => executeAction(messages.indexOf(m), ai)}
                                  />
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {sending && (
                  <div className="text-zinc-400 text-[11.5px] inline-flex items-center gap-2">
                    <span className="inline-flex gap-1">
                      {[0,1,2].map(i => (
                        <motion.span
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-zinc-400"
                          animate={{ y: [0,-3,0], opacity: [0.4,1,0.4] }}
                          transition={{ duration: 1.1, repeat: Infinity, delay: i*0.12, ease: 'easeInOut' }}
                        />
                      ))}
                    </span>
                    Thinking…
                  </div>
                )}
                <div className="text-center pt-2">
                  <button
                    onClick={() => onNavigate('brief')}
                    className="text-[10.5px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors inline-flex items-center gap-1"
                  >
                    Continue in Brief <Icons.ArrowLeft size={9} className="rotate-180" />
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* DailyBrief — full AI structured summary. Lives below the
              chat block so the chat is the immediate focal point but
              the deeper breakdown is one scroll away. */}
          <section className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
            <DailyBrief
              onAskFollowUp={(p) => handleSend(p)}
              onNavigate={(page) => onNavigate(page as PageView)}
            />
          </section>

          {/* Bottom link to Brief for the full tabs */}
          <div className="text-center pt-2 pb-6">
            <button
              onClick={() => onNavigate('brief')}
              className="text-[11px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors inline-flex items-center gap-1.5"
            >
              <Icons.Briefcase size={11} />
              Open full Brief (Tasks · Calendar · Inbox)
              <Icons.ArrowLeft size={10} className="rotate-180" />
            </button>
          </div>
        </div>

        {/* ── RIGHT sidebar widgets ───────────────────────────── */}
        <aside className="space-y-3 lg:sticky lg:top-4 self-start">
          {/* Pending + Done — paired counters */}
          <div className="grid grid-cols-2 gap-2">
            <SideCounter label="Pending" value={overdueCount + dueTodayCount} sub="today" tone="zinc" onClick={() => onNavigate('brief')} />
            <SideCounter label="Done" value={doneTodayCount} sub={doneTodayCount > 0 ? `${doneTodayCount} today` : '0% complete'} tone="emerald" onClick={() => onNavigate('brief')} />
          </div>

          {/* Monthly profit — dark card with sparkline */}
          <MonthlyProfitCard
            series={profitSeries}
            currentMonthProfit={currentMonthProfit}
            profitDelta={profitDelta}
            onClick={() => onNavigate('finance')}
          />

          {/* Insights — colored pills + bullets */}
          <InsightsCard
            insights={insights}
            overdueCount={overdueCount}
            pendingMsgs={pendingMsgs}
            onNavigate={(page) => onNavigate(page)}
          />

          {/* Workspace shortcut — opens the legacy detailed dashboard */}
          <button
            onClick={() => onNavigate('activity')}
            className="w-full rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2.5 text-[11px] text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors flex items-center gap-2"
            title="The detailed dashboard (legacy view)"
          >
            <Icons.Activity size={12} />
            View activity feed →
          </button>
        </aside>
      </div>
    </div>
  );
};

// ── ModeTabs ──────────────────────────────────────────────────────
const ModeTabs: React.FC<{ mode: Mode; onChange: (m: Mode) => void }> = ({ mode, onChange }) => (
  <div className="inline-flex items-center gap-0.5 rounded-full border border-zinc-200/70 dark:border-zinc-800 p-0.5 bg-white dark:bg-zinc-900">
    {MODES.map(m => {
      const IconCmp = (Icons as any)[m.icon] || Icons.Sparkles;
      const active = mode === m.id;
      return (
        <motion.button
          key={m.id}
          onClick={() => onChange(m.id)}
          whileTap={{ scale: 0.96, transition: SPRING_TAP }}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-colors ${
            active
              ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          <IconCmp size={11} />
          {m.label}
        </motion.button>
      );
    })}
  </div>
);

// ── StatCard ──────────────────────────────────────────────────────
const STAT_TONE: Record<string, { text: string; mute: string }> = {
  rose:    { text: 'text-rose-600 dark:text-rose-400',       mute: 'text-zinc-400 dark:text-zinc-600' },
  amber:   { text: 'text-amber-600 dark:text-amber-400',     mute: 'text-zinc-400 dark:text-zinc-600' },
  emerald: { text: 'text-emerald-600 dark:text-emerald-400', mute: 'text-zinc-400 dark:text-zinc-600' },
  violet:  { text: 'text-violet-600 dark:text-violet-400',   mute: 'text-zinc-400 dark:text-zinc-600' },
};
const StatCard: React.FC<{ label: string; value: number; tone: keyof typeof STAT_TONE }> = ({ label, value, tone }) => {
  const t = STAT_TONE[tone];
  const alert = value > 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={SPRING_ENTER}
      className="px-4 py-3 rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900"
    >
      <div className={`text-[26px] leading-none font-semibold tabular-nums ${alert ? t.text : t.mute}`}>{value}</div>
      <div className="text-[10.5px] mt-1.5 text-zinc-500 dark:text-zinc-400">{label}</div>
    </motion.div>
  );
};

// ── SideCounter (Pending + Done) ─────────────────────────────────
const SideCounter: React.FC<{ label: string; value: number; sub: string; tone: 'zinc' | 'emerald'; onClick?: () => void }> = ({ label, value, sub, tone, onClick }) => (
  <motion.button
    onClick={onClick}
    whileTap={{ scale: 0.97, transition: SPRING_TAP }}
    whileHover={{ y: -1, transition: SPRING_TAP }}
    className="text-left px-4 py-3 rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
  >
    <div className="text-[9.5px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">{label}</div>
    <div className={`text-[28px] leading-none font-semibold tabular-nums ${
      tone === 'emerald' && value > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-900 dark:text-zinc-100'
    }`}>{value}</div>
    <div className="text-[10.5px] text-zinc-500 dark:text-zinc-400 mt-1">{sub}</div>
  </motion.button>
);

// ── MonthlyProfitCard ────────────────────────────────────────────
const MonthlyProfitCard: React.FC<{
  series: Array<{ label: string; profit: number }>;
  currentMonthProfit: number;
  profitDelta: number;
  onClick: () => void;
}> = ({ series, currentMonthProfit, profitDelta, onClick }) => {
  const [hidden, setHidden] = useState(false);
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.99, transition: SPRING_TAP }}
      whileHover={{ y: -1, transition: SPRING_TAP }}
      className="w-full text-left p-3.5 rounded-xl bg-zinc-950 dark:bg-zinc-900 border border-zinc-900 dark:border-zinc-800 text-white relative overflow-hidden hover:border-zinc-700 transition-colors"
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Monthly profit</span>
        <span
          role="button"
          tabIndex={-1}
          onClick={(e) => { e.stopPropagation(); setHidden(h => !h); }}
          className="p-1 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {hidden ? <Icons.Eye size={11} /> : <Icons.EyeOff size={11} />}
        </span>
      </div>
      <div className="h-9 -mx-1">
        {series.length > 1 && !hidden ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <Tooltip
                cursor={{ stroke: '#52525b', strokeWidth: 1 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as { label: string; profit: number };
                  return (
                    <div className="bg-white text-zinc-900 text-[10px] px-2 py-1 rounded-md shadow font-mono tabular-nums">
                      {p.label}: ${p.profit.toLocaleString()}
                    </div>
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey="profit"
                stroke={currentMonthProfit >= 0 ? '#10b981' : '#f43f5e'}
                strokeWidth={1.5}
                dot={{ r: 1.5, fill: currentMonthProfit >= 0 ? '#10b981' : '#f43f5e' }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full gap-1.5">
            {series.map((s, i) => (
              <span key={i} className="w-1.5 h-1.5 rounded-full bg-zinc-700" title={s.label} />
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between mt-2.5 text-[11px]">
        {hidden ? (
          <>
            <span className="text-emerald-400 font-mono">+$••</span>
            <span className="text-rose-400 font-mono">-$••</span>
          </>
        ) : (
          <>
            <span className={`tabular-nums font-semibold ${currentMonthProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {currentMonthProfit >= 0 ? '+' : ''}${Math.abs(currentMonthProfit).toLocaleString()}
            </span>
            <span className={`tabular-nums ${profitDelta >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
              {profitDelta >= 0 ? '↑' : '↓'} ${Math.abs(profitDelta).toLocaleString()}
            </span>
          </>
        )}
      </div>
      <div className="text-[10px] text-zinc-500 mt-1 inline-flex items-center gap-1">
        View finances <Icons.ArrowLeft size={8} className="rotate-180" />
      </div>
    </motion.button>
  );
};

// ── InsightsCard ─────────────────────────────────────────────────
const INSIGHT_TONE: Record<string, string> = {
  rose:    'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300',
  amber:   'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300',
  emerald: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  violet:  'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300',
  blue:    'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300',
};
const InsightsCard: React.FC<{
  insights: Array<{ label: string; tone: keyof typeof INSIGHT_TONE; navigateTo?: PageView }>;
  overdueCount: number;
  pendingMsgs: number;
  onNavigate?: (page: PageView) => void;
}> = ({ insights, overdueCount, pendingMsgs, onNavigate }) => {
  // Synthetic bullet copy at the bottom — quick narrative based on
  // the same data the pills come from.
  const bullets: string[] = [];
  const pendingPill = insights.find(i => i.label.includes('pending'));
  if (pendingPill) bullets.push(`${pendingPill.label.split(' ')[0]} in pending payments — follow up to improve cash flow.`);
  if (overdueCount > 5) bullets.push(`${overdueCount} overdue tasks need attention today.`);
  if (pendingMsgs > 10) bullets.push(`${pendingMsgs} pending messages — sweep your inbox before deep work.`);
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_ENTER}
      className="p-3.5 rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900"
    >
      <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 inline-flex items-center gap-1 mb-2">
        <Icons.Sparkles size={9} />
        Insights
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {insights.length === 0 ? (
          <span className="text-[10.5px] text-zinc-400 italic">Nothing to flag yet.</span>
        ) : insights.map((i, idx) => (
          i.navigateTo && onNavigate ? (
            <motion.button
              key={idx}
              onClick={() => onNavigate(i.navigateTo!)}
              whileTap={{ scale: 0.94, transition: SPRING_TAP }}
              className={`text-[10.5px] px-2 py-0.5 rounded-full transition-opacity hover:opacity-80 ${INSIGHT_TONE[i.tone]}`}
            >{i.label}</motion.button>
          ) : (
            <span key={idx} className={`text-[10.5px] px-2 py-0.5 rounded-full ${INSIGHT_TONE[i.tone]}`}>{i.label}</span>
          )
        ))}
      </div>
      {bullets.length > 0 && (
        <ul className="space-y-1 text-[10.5px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
          {bullets.map((b, i) => <li key={i} className="leading-snug">· {b}</li>)}
        </ul>
      )}
    </motion.div>
  );
};

// ── ActionCard — compact for the Home chat ───────────────────────
const ActionCard: React.FC<{ action: ChatAction; onConfirm: () => void }> = ({ action, onConfirm }) => {
  if (action.state === 'done') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10.5px] font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
        <Icons.Check size={11} /> {action.label}
      </div>
    );
  }
  if (action.state === 'failed') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10.5px] font-medium bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30" title={action.error}>
        <Icons.AlertCircle size={11} /> {action.label} — failed
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg border border-violet-200 dark:border-violet-500/30 bg-violet-50/60 dark:bg-violet-500/5">
      <Icons.Sparkles size={11} className="text-violet-600 dark:text-violet-400 shrink-0" />
      <span className="flex-1 text-[11px] text-zinc-800 dark:text-zinc-100 leading-snug">{action.label}</span>
      {action.state === 'executing' ? (
        <span className="text-[10px] text-violet-600 dark:text-violet-400 inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 border border-violet-400 border-t-transparent rounded-full animate-spin" />
          Running…
        </span>
      ) : (
        <motion.button
          onClick={onConfirm}
          whileTap={{ scale: 0.92, transition: SPRING_TAP }}
          className="text-[10.5px] font-semibold text-white bg-violet-600 hover:bg-violet-700 px-2 py-1 rounded-md inline-flex items-center gap-1"
        >
          <Icons.Check size={10} /> Confirm
        </motion.button>
      )}
    </div>
  );
};
