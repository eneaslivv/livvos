/**
 * Home — the dashboard you land on every morning. Designed to match
 * the Brief redesign brief: open the app and immediately see what
 * matters, with the AI summary + chat available right here so you
 * don't have to navigate anywhere.
 *
 * Layout (top → bottom, left → right):
 *   • Gradient hero ribbon — purely cosmetic, sets the daily-ritual tone
 *   • Header row: date + greeting
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
 *         - Quick tasks (overdue + today, with checkbox to mark done)
 *
 * The previous detailed Home is preserved at pages/HomeLegacy.tsx
 * (still wired in routing if we want to expose it later).
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
import { InboxCards, type InboxMessage } from '../components/chat/InboxCards';

interface HomeProps {
  onNavigate: (page: PageView, params?: NavParams) => void;
}

type ActionState = 'pending' | 'executing' | 'done' | 'skipped' | 'failed';
type ChatAction = ProposedAction & { state: ActionState; error?: string };
interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
  actions?: ChatAction[];
  conversationId?: string | null;
  agentId?: string;
  /** Structured inbox messages for rich card rendering */
  inboxMessages?: InboxMessage[];
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
  // Bundle's 3-preset banner switcher (Leaf / Art / Rainbow). Persisted in
  // localStorage per-user since this is a cosmetic preference, not a
  // tenant-wide setting. Click a swatch to swap the hero gradient; the
  // setting is overridden by an uploaded image.
  type BannerPreset = 'rainbow' | 'leaf' | 'art';
  const BANNER_PRESETS: Record<BannerPreset, { label: string; gradient: string; dot: string }> = {
    rainbow: {
      label: 'Rainbow',
      gradient: 'linear-gradient(120deg, #f9a8d4 0%, #fbcfe8 15%, #fde68a 35%, #fed7aa 55%, #fda4af 75%, #c4b5fd 100%)',
      dot: '#f9a8d4',
    },
    leaf: {
      label: 'Leaf',
      gradient: 'linear-gradient(120deg, #d9f99d 0%, #bbf7d0 30%, #a7f3d0 55%, #67e8f9 100%)',
      dot: '#769268',
    },
    art: {
      label: 'Art',
      gradient: 'linear-gradient(135deg, #2C0405 0%, #5C1D18 35%, #C4A35A 75%, #FDFBF7 100%)',
      dot: '#C4A35A',
    },
  };
  const [bannerPreset, setBannerPreset] = useState<BannerPreset>(() => {
    try {
      const stored = localStorage.getItem('home:bannerPreset');
      return (stored === 'leaf' || stored === 'art' || stored === 'rainbow') ? stored : 'rainbow';
    } catch { return 'rainbow'; }
  });
  useEffect(() => {
    try { localStorage.setItem('home:bannerPreset', bannerPreset); } catch {}
  }, [bannerPreset]);
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
  // ModeTabs (Thoughts / Vision / Deep work) sistema removido — el toggle
  // ocupaba espacio sin generar valor. Los chips + placeholder del Deep
  // work mode están hardcodeados abajo como defaults universales.
  //
  // Conversación persistida en sessionStorage para que la charla
  // sobreviva navegar entre páginas y volver. La idea (pedido del user):
  // el composer queda anclado abajo, los mensajes fluyen arriba y podés
  // seguir consultando cosas — resumir Slack, mails, redactar
  // respuestas — sin tener que volver a empezar cada vez.
  const CHAT_STORAGE_KEY = 'home:chat:v1';
  const [messages, setMessages] = useState<ChatMsg[]>(() => {
    try {
      const raw = sessionStorage.getItem(CHAT_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingMsgs, setPendingMsgs] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Persist on every change. We keep only the last 40 turns to avoid
  // unbounded growth in sessionStorage.
  useEffect(() => {
    try {
      const trimmed = messages.slice(-40);
      sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(trimmed));
    } catch { /* quota / private-mode: silently skip */ }
  }, [messages]);

  // Hardcoded chips + placeholder — antes venía del modeConfig dinámico.
  const HOME_PLACEHOLDER = "Let's focus — what's the first thing?";
  // Two flavors of chips. The "start" chips show only on an empty
  // conversation (heavy prompts that kick things off). The "quick" chips
  // sit above the composer always — son los que pidió el user para
  // consultar mails / slack / redactar respuestas sin esfuerzo.
  const HOME_CHIPS = [
    { label: 'Plan my week',    prompt: 'Plan my week: pick the most important things to ship Mon–Fri.' },
    { label: "What's blocked?", prompt: "What's blocked or waiting on someone else right now?" },
    { label: 'Follow-ups',      prompt: "Show me pending follow-ups across clients + inbox I haven't replied to." },
    { label: 'Catch me up',     prompt: 'Catch me up on what changed since yesterday across tasks, inbox, and finance.' },
  ];
  const QUICK_CHIPS = [
    { label: 'Resumir inbox',  icon: 'Mail',          prompt: 'Hacé un resumen corto de los mails nuevos / pendientes — agrupados por remitente o tema, qué requiere respuesta urgente.' },
    { label: 'Resumir Slack',  icon: 'Message', prompt: 'Resumime los mensajes de Slack pendientes de respuesta — qué canales / personas están esperando algo mío.' },
    { label: 'Redactar reply', icon: 'Edit',          prompt: 'Ayudame a redactar respuestas a los mensajes pendientes que más demoraron. Sugerime un draft por cada uno y yo apruebo.' },
    { label: 'Qué cambió',     icon: 'Activity',      prompt: '¿Qué cambió desde la última vez que abrí la app? Mensajes nuevos, tareas que se vencieron, eventos próximos.' },
  ];

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

  // ── Quick tasks — overdue + due today, sorted by due ASC ──────────
  // Replaces the generic Insights card in the sidebar. The user asked
  // for actionable items (real tasks they can check off) instead of
  // counter pills.
  const quickTasks = useMemo(() => {
    const mine = (allTasks || []).filter((t: any) => {
      const isMine = t.assignee_ids?.includes(user?.id || '') || t.owner_id === user?.id;
      if (!isMine) return false;
      if (t.completed) return false;
      if (t.status === 'cancelled') return false;
      if (!t.start_date) return false;
      return t.start_date <= todayIso;  // overdue + today
    });
    mine.sort((a: any, b: any) => (a.start_date || '').localeCompare(b.start_date || ''));
    return mine.slice(0, 6);
  }, [allTasks, user?.id, todayIso]);

  const handleToggleTask = useCallback(async (taskId: string) => {
    try {
      await updateTask(taskId, { completed: true, completed_at: new Date().toISOString() });
    } catch (err: any) {
      errorLogger.warn('quick-task toggle failed', err);
    }
  }, [updateTask]);

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
        inboxMessages: out.rawData?.inboxMessages as InboxMessage[] | undefined,
      }]);
    } catch (e: any) {
      errorLogger.warn('home chat failed', e);
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e?.message || 'unknown'}`, ts: Date.now() }]);
    } finally {
      setSending(false);
    }
  }, [input, sending, currentTenant?.id, user?.id, messages]);

  // Auto-scroll to bottom on every new message + when the "Thinking…"
  // indicator toggles, so the user always sees the latest turn without
  // having to scroll manually.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length, sending]);

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
            : { background: BANNER_PRESETS[bannerPreset].gradient }
        }
      >
        {/* Preset switcher — only when no custom image is uploaded. Tiny
           swatches in the bottom-left corner, hidden until hover. */}
        {!currentTenant?.banner_url && (
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            {(Object.entries(BANNER_PRESETS) as Array<[BannerPreset, typeof BANNER_PRESETS[BannerPreset]]>).map(([key, p]) => (
              <button
                key={key}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setBannerPreset(key);
                }}
                title={p.label}
                className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${bannerPreset === key ? 'border-white shadow-md scale-110' : 'border-white/60'}`}
                style={{ background: p.gradient }}
              />
            ))}
          </div>
        )}
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
          {/* Greeting row — typographic treatment from the design bundle:
             Inter Light (300) for the headline with -0.035em letter-spacing
             gives it the elegant editorial feel of the mockup, in contrast
             to the previous bold weight which felt heavier than the rest
             of the surface. The eyebrow uses font-mono with wider tracking
             so it reads as a label, not a sentence. */}
          <header>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-400">{dateLabel}</div>
            <div className="flex items-end justify-between gap-4 mt-2 flex-wrap">
              <h1 className="text-[32px] md:text-[40px] font-light text-zinc-900 dark:text-zinc-100 leading-[1.05] tracking-[-0.035em]">
                {partOfDay}, <span className="capitalize">{userFirstName}</span>.
              </h1>
            </div>
            <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center gap-3 text-[10px] font-mono text-zinc-400 uppercase tracking-[0.22em]">
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

          {/* Chat block — composer anclado abajo, mensajes fluyendo
              arriba. La idea (pedido del user): podés seguir la charla
              sin que el input se mueva, y los chips rápidos (resumir
              inbox, resumir Slack, redactar reply, qué cambió) están
              siempre visibles arriba del composer. El bloque tiene
              altura fija con scroll interno para que los mensajes
              largos no empujen al resto de la home hacia abajo. */}
          <section className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col" style={{ minHeight: '480px', maxHeight: 'calc(100vh - 220px)' }}>
            {/* ── Messages area (flex-1, scroll interno) ───────────── */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pt-4 pb-2 space-y-3">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-4">
                  <div className="w-9 h-9 rounded-full bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center mb-3">
                    <Icons.Sparkles size={15} className="text-white dark:text-zinc-900" />
                  </div>
                  <div className="text-[14px] text-zinc-900 dark:text-zinc-100 font-medium">
                    {partOfDay.replace('Good ', 'Buen ').replace('morning', 'mañana').replace('afternoon', 'tarde').replace('evening', 'noche')}, <span className="capitalize">{userFirstName}</span>.
                  </div>
                  <div className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-1 max-w-[420px]">{HOME_PLACEHOLDER}</div>
                  {/* Starter chips — only on empty conversation */}
                  <div className="flex flex-wrap gap-1.5 justify-center mt-5 max-w-[480px]">
                    {HOME_CHIPS.map(c => {
                      const IconCmp = (Icons as any)[
                        c.label.includes('week') ? 'Calendar' :
                        c.label.includes('blocked') ? 'AlertTriangle' :
                        c.label.includes('Follow-ups') ? 'Mail' :
                        c.label.includes('Catch') ? 'Zap' :
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
                </div>
              ) : (
                <>
                  <AnimatePresence initial={false}>
                    {messages.map((m, i) => (
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
                              {/* Rich inbox cards when structured data is present */}
                              {m.inboxMessages && m.inboxMessages.length > 0 ? (
                                <InboxCards
                                  messages={m.inboxMessages}
                                  aiSummary={m.content}
                                />
                              ) : (
                                <Markdown source={m.content} />
                              )}
                              {m.actions && m.actions.length > 0 && (
                                <div className="mt-2 space-y-1.5">
                                  {m.actions.map((a, ai) => (
                                    <ActionCard
                                      key={ai}
                                      action={a}
                                      onConfirm={() => executeAction(i, ai)}
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
                </>
              )}
            </div>

            {/* ── Composer anchored at bottom ───────────────────────
                Chips rápidos siempre visibles arriba del input para
                consultar mails / slack / redactar respuestas con
                un click. Border-top suave para separar visualmente
                de los mensajes sin meter ruido. */}
            <div className="border-t border-zinc-100 dark:border-zinc-800/60 px-4 pt-3 pb-3.5 bg-white dark:bg-zinc-900 rounded-b-2xl">
              {/* Quick chips — siempre visibles */}
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {QUICK_CHIPS.map(c => {
                  const IconCmp = (Icons as any)[c.icon] || Icons.Sparkles;
                  return (
                    <motion.button
                      key={c.label}
                      onClick={() => handleSend(c.prompt)}
                      disabled={sending}
                      whileTap={{ scale: 0.96, transition: SPRING_TAP }}
                      whileHover={{ y: -1, transition: SPRING_TAP }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-zinc-200 dark:border-zinc-700/70 text-[10.5px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600 disabled:opacity-40 transition-colors"
                      title={c.prompt}
                    >
                      <IconCmp size={10.5} />
                      {c.label}
                    </motion.button>
                  );
                })}
                {messages.length > 0 && (
                  <button
                    onClick={() => {
                      setMessages([]);
                      try { sessionStorage.removeItem(CHAT_STORAGE_KEY); } catch {}
                    }}
                    className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                    title="Empezar de nuevo"
                  >
                    <Icons.X size={10} /> Nueva charla
                  </button>
                )}
              </div>
              {/* Input row */}
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder={voice.isListening ? 'Listening…' : `Seguí la charla…  ej. respondele al último de Slack que sí lo hacemos`}
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
            </div>
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

          {/* Quick tasks — overdue + today con checkbox.
              Reemplaza el bloque de Insights genérico (no servía). */}
          <QuickTasksCard
            tasks={quickTasks}
            todayIso={todayIso}
            overdueCount={overdueCount}
            dueTodayCount={dueTodayCount}
            onToggle={handleToggleTask}
            onOpen={(taskId) => onNavigate('calendar', { taskId } as NavParams)}
            onSeeAll={() => onNavigate('calendar')}
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
  // Editorial-style stat tile from the design bundle: big light-weight
  // numeral with tight letter-spacing, hover lifts the tile with a
  // soft shadow. The light weight + tabular-nums combo makes the
  // numbers feel like a magazine pull-quote rather than a UI counter.
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ y: -2, transition: SPRING_TAP }}
      transition={SPRING_ENTER}
      className="px-4 py-3.5 rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 transition-shadow hover:shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05),0_10px_15px_-3px_rgba(0,0,0,0.05)]"
    >
      <div className={`text-[32px] leading-none font-light tabular-nums tracking-[-0.04em] ${alert ? t.text : t.mute}`}>{value}</div>
      <div className="text-[10.5px] mt-2 text-zinc-500 dark:text-zinc-400">{label}</div>
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
    <div className="text-[9.5px] font-mono uppercase tracking-[0.22em] text-zinc-400 mb-1.5">{label}</div>
    <div className={`text-[34px] leading-none font-light tabular-nums tracking-[-0.045em] ${
      tone === 'emerald' && value > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-900 dark:text-zinc-100'
    }`}>{value}</div>
    <div className="text-[10.5px] text-zinc-500 dark:text-zinc-400 mt-1.5">{sub}</div>
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

// ── QuickTasksCard — actionable list (overdue + today) ──────────────
// Replaces the InsightsCard. The user asked for "tareas a hacer hoy o
// cosas así en vez de insights generales" — this is exactly that. Each
// row has a checkbox to mark done + click navigates to the calendar
// with that task pre-opened.
const PRIORITY_DOT: Record<string, string> = {
  Urgent: 'bg-rose-500',
  High:   'bg-amber-500',
  Medium: 'bg-zinc-400',
  Low:    'bg-zinc-300 dark:bg-zinc-600',
};

const formatDueLabel = (start: string | null | undefined, todayIso: string): { text: string; tone: 'rose' | 'amber' | 'zinc' } => {
  if (!start) return { text: '—', tone: 'zinc' };
  const due = start.slice(0, 10);
  if (due < todayIso) {
    const a = new Date(todayIso); const b = new Date(due);
    const days = Math.max(1, Math.round((a.getTime() - b.getTime()) / 86400000));
    return { text: days === 1 ? '1d overdue' : `${days}d overdue`, tone: 'rose' };
  }
  if (due === todayIso) return { text: 'today', tone: 'amber' };
  return { text: due.slice(5), tone: 'zinc' };
};

const QuickTasksCard: React.FC<{
  tasks: any[];
  todayIso: string;
  overdueCount: number;
  dueTodayCount: number;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  onSeeAll: () => void;
}> = ({ tasks, todayIso, overdueCount, dueTodayCount, onToggle, onOpen, onSeeAll }) => {
  const total = overdueCount + dueTodayCount;
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_ENTER}
      className="p-3.5 rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900"
    >
      <div className="flex items-center justify-between mb-2.5">
        <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 inline-flex items-center gap-1">
          <Icons.Check size={9} />
          Today&apos;s tasks
        </div>
        <div className="flex items-center gap-1.5 text-[9.5px] font-mono text-zinc-400">
          {overdueCount > 0 && <span className="text-rose-500">{overdueCount} overdue</span>}
          {overdueCount > 0 && dueTodayCount > 0 && <span className="text-zinc-300 dark:text-zinc-700">·</span>}
          {dueTodayCount > 0 && <span className="text-amber-500">{dueTodayCount} today</span>}
          {total === 0 && <span>0</span>}
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="text-[11px] text-zinc-400 italic py-3 text-center">
          {total === 0 ? 'Nothing on your plate today.' : 'Nothing assigned to you — check the team board.'}
        </div>
      ) : (
        <ul className="space-y-1">
          {tasks.map((t: any) => {
            const due = formatDueLabel(t.start_date, todayIso);
            const dueColor = due.tone === 'rose' ? 'text-rose-500' : due.tone === 'amber' ? 'text-amber-500' : 'text-zinc-400';
            return (
              <li key={t.id} className="group flex items-center gap-2 px-1.5 py-1.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                <button
                  onClick={(e) => { e.stopPropagation(); onToggle(t.id); }}
                  className="flex-shrink-0 w-3.5 h-3.5 rounded-full border border-zinc-300 dark:border-zinc-600 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors flex items-center justify-center"
                  title="Mark as done"
                >
                  <Icons.Check size={9} className="opacity-0 group-hover:opacity-100 text-emerald-500 transition-opacity" />
                </button>
                <span className={`w-1 h-1 rounded-full flex-shrink-0 ${PRIORITY_DOT[t.priority] || PRIORITY_DOT.Medium}`} />
                <button
                  onClick={() => onOpen(t.id)}
                  className="flex-1 min-w-0 text-left text-[11.5px] text-zinc-800 dark:text-zinc-200 truncate hover:text-zinc-900 dark:hover:text-white"
                  title={t.title}
                >
                  {t.title}
                </button>
                {/* "Interno" indicator — pequeño punto de casa para las
                    tareas sin proyecto ni cliente (laburo de estudio).
                    Sutil para no competir con el due label, pero
                    suficiente para que no se sienta huérfana en el listado. */}
                {!t.project_id && !t.client_id && (
                  <Icons.Home size={9} className="text-zinc-300 dark:text-zinc-600 flex-shrink-0" aria-label="Interno" />
                )}
                <span className={`text-[9.5px] font-mono whitespace-nowrap ${dueColor}`}>{due.text}</span>
              </li>
            );
          })}
        </ul>
      )}

      {total > tasks.length && (
        <button
          onClick={onSeeAll}
          className="w-full mt-2 text-[10px] font-mono uppercase tracking-wider text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors text-center py-1"
        >
          See all {total} →
        </button>
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
