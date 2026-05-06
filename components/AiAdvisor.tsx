import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from './ui/Icons';
import {
  generateAdvisorInsights,
  getCachedAdvisorInsights,
  sendAdvisorChatWithActions,
  clearAICache,
  getOutputId,
  AdvisorInsight,
  type AdvisorAction,
} from '../lib/ai';
import { AIFeedbackBar } from './ai/AIFeedbackBar';
import { supabase } from '../lib/supabase';
import { useProjects } from '../context/ProjectsContext';
import { useFinance } from '../context/FinanceContext';
import { useTeam } from '../context/TeamContext';
import { useCalendar } from '../context/CalendarContext';
import { useClients } from '../hooks/useClients';
import { useAuth } from '../hooks/useAuth';
import { errorLogger } from '../lib/errorLogger';

const AREA_CONFIG: Record<string, { gradient: string; iconBg: string; border: string }> = {
  projects: { gradient: 'from-blue-500/8 to-transparent', iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', border: 'border-blue-500/10' },
  finance: { gradient: 'from-emerald-500/8 to-transparent', iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/10' },
  marketing: { gradient: 'from-fuchsia-500/8 to-transparent', iconBg: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400', border: 'border-fuchsia-500/10' },
  team: { gradient: 'from-sky-500/8 to-transparent', iconBg: 'bg-sky-500/10 text-sky-600 dark:text-sky-400', border: 'border-sky-500/10' },
  planning: { gradient: 'from-amber-500/8 to-transparent', iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', border: 'border-amber-500/10' },
};

const PRIORITY_LABEL: Record<string, { text: string; color: string }> = {
  high: { text: 'Urgent', color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  medium: { text: 'This week', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  low: { text: 'Info', color: 'bg-zinc-500/10 text-zinc-500 dark:text-zinc-400' },
};

const getIconComponent = (iconName: string) => {
  const map: Record<string, any> = {
    Briefcase: Icons.Briefcase,
    DollarSign: Icons.DollarSign,
    TrendingUp: Icons.TrendingUp,
    Users: Icons.Users,
    Target: Icons.Target,
    Calendar: Icons.Calendar,
    Zap: Icons.Zap,
    Star: Icons.Star,
    Flag: Icons.Flag,
    Sparkles: Icons.Sparkles,
  };
  return map[iconName] || Icons.Sparkles;
};

const SUGGESTED_PROMPTS: { label: string; prompt: string; icon: keyof typeof Icons; kind: 'chat' | 'insights' }[] = [
  { label: 'Strategic overview', prompt: '__INSIGHTS__', icon: 'Sparkles', kind: 'insights' },
  { label: 'Planificá mi semana', prompt: 'Armame un plan para esta semana: 4-6 tareas prioritarias distribuidas L-V con foco en mis proyectos activos. Proponé las acciones para que las pueda aprobar.', icon: 'Calendar', kind: 'chat' },
  { label: '¿En qué enfocarme?', prompt: '¿En qué proyectos y tareas debería enfocarme esta semana, considerando deadlines y prioridades?', icon: 'Target', kind: 'chat' },
  { label: 'Salud financiera', prompt: 'Analizá mi salud financiera actual: ingresos cobrados vs pendientes, gastos y balance.', icon: 'TrendingUp', kind: 'chat' },
  { label: 'Riesgos en proyectos', prompt: '¿Qué proyectos están en riesgo o atrasados, y qué puedo hacer? Si hay que delegar algo, sugerimelo.', icon: 'Flag', kind: 'chat' },
  { label: 'Romper proyecto en tareas', prompt: 'Elegí mi proyecto más urgente y rompelo en 5-8 tareas concretas que pueda aprobar para crear de una.', icon: 'List', kind: 'chat' },
];

// Each chat message is either a user line, an assistant text reply, an
// assistant insights card, OR an assistant action proposal that the user
// can approve/reject in-line. Action statuses persist with the message
// so the chat history remembers which proposals were applied.
export type ProposedAction = AdvisorAction & {
  /** Local id so React can key + update status on this specific card. */
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'failed';
  errorMsg?: string;
};

type ChatMsg =
  | { role: 'user'; content: string; ts?: number }
  | { role: 'assistant'; content: string; outputId?: string | null; actions?: ProposedAction[]; ts?: number }
  | { role: 'assistant'; kind: 'insights'; greeting: string; insights: AdvisorInsight[]; outputId?: string | null; ts?: number };

// localStorage key — one bucket per user per day. Keeps the current day
// available across reopens without polluting older days.
const STORAGE_VERSION = 'v1';
const todayKey = () => new Date().toISOString().split('T')[0];
const storageKey = (userId: string) => `eneas-os:ai-advisor:${STORAGE_VERSION}:${userId}:${todayKey()}`;

const InsightsBlock: React.FC<{ greeting: string; insights: AdvisorInsight[] }> = ({ greeting, insights }) => (
  <div className="space-y-2.5">
    {greeting && (
      <p className="text-[12px] leading-relaxed text-zinc-700 dark:text-zinc-300">{greeting}</p>
    )}
    {insights.map((insight, idx) => {
      const config = AREA_CONFIG[insight.area] || AREA_CONFIG.planning;
      const IconComp = getIconComponent(insight.icon);
      const priority = PRIORITY_LABEL[insight.priority] || PRIORITY_LABEL.low;
      return (
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.05, duration: 0.3 }}
          className={`p-3 rounded-xl bg-gradient-to-br ${config.gradient} border ${config.border}`}
        >
          <div className="flex items-start gap-2.5">
            <div className={`w-7 h-7 rounded-lg ${config.iconBg} flex items-center justify-center shrink-0`}>
              <IconComp size={13} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-[12px] font-bold text-zinc-900 dark:text-zinc-100">{insight.title}</h4>
                <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${priority.color}`}>
                  {priority.text}
                </span>
              </div>
              <p className="text-[11px] leading-[1.55] text-zinc-600 dark:text-zinc-400">{insight.body}</p>
            </div>
          </div>
        </motion.div>
      );
    })}
  </div>
);

// ── Action proposal card ─────────────────────────────────────────
// Renders below an assistant message when the AI proposes something
// actionable. Approve runs the handler; Reject just dismisses.
const ActionCard: React.FC<{
  action: ProposedAction;
  onApprove: () => void;
  onReject: () => void;
}> = ({ action, onApprove, onReject }) => {
  const kindLabel: Record<string, { icon: keyof typeof Icons; label: string; color: string }> = {
    create_task: { icon: 'Check', label: 'Crear tarea', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
    create_project: { icon: 'Briefcase', label: 'Crear proyecto', color: 'bg-violet-500/10 text-violet-600 border-violet-500/20' },
    create_tasks_batch: { icon: 'List', label: 'Crear varias tareas', color: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20' },
    plan_week: { icon: 'Calendar', label: 'Planificar semana', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
    suggest_delegate: { icon: 'Users', label: 'Sugerencia de delegación', color: 'bg-fuchsia-500/10 text-fuchsia-600 border-fuchsia-500/20' },
  };
  const meta = kindLabel[action.kind] || { icon: 'Sparkles' as const, label: action.kind, color: 'bg-zinc-500/10 text-zinc-600 border-zinc-500/20' };
  const Icon = (Icons as any)[meta.icon] || Icons.Sparkles;

  // Render a small details preview based on action kind
  const renderDetails = () => {
    if (action.kind === 'create_task') {
      const p = action.params;
      return (
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 space-y-0.5">
          <div className="font-medium text-zinc-700 dark:text-zinc-200">{p.title}</div>
          {(p.due_date || p.priority) && (
            <div className="flex gap-2">
              {p.due_date && <span>· vence {p.due_date}</span>}
              {p.priority && <span>· {p.priority}</span>}
            </div>
          )}
        </div>
      );
    }
    if (action.kind === 'create_project') {
      const p = action.params;
      return (
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
          <div className="font-medium text-zinc-700 dark:text-zinc-200">{p.title}</div>
          {p.deadline && <div>· deadline {p.deadline}</div>}
        </div>
      );
    }
    if (action.kind === 'create_tasks_batch') {
      const p = action.params;
      return (
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 space-y-0.5">
          <div className="font-medium text-zinc-700 dark:text-zinc-200">{p.tasks.length} tareas:</div>
          <ul className="pl-3 space-y-0.5">
            {p.tasks.slice(0, 6).map((t, i) => (
              <li key={i} className="truncate">— {t.title}{t.priority ? ` · ${t.priority}` : ''}</li>
            ))}
            {p.tasks.length > 6 && <li className="italic">+{p.tasks.length - 6} más…</li>}
          </ul>
        </div>
      );
    }
    if (action.kind === 'plan_week') {
      const p = action.params;
      return (
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 space-y-0.5">
          <div className="font-medium text-zinc-700 dark:text-zinc-200">Semana del {p.week_start}</div>
          {p.goals?.length > 0 && (
            <ul className="pl-3 space-y-0.5">
              {p.goals.map((g, i) => <li key={i}>• {g}</li>)}
            </ul>
          )}
          {p.suggested_tasks && p.suggested_tasks.length > 0 && (
            <div className="mt-1">{p.suggested_tasks.length} tareas propuestas</div>
          )}
        </div>
      );
    }
    if (action.kind === 'suggest_delegate') {
      const p = action.params;
      return (
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
          {p.reason}
        </div>
      );
    }
    return null;
  };

  // Status pills
  if (action.status === 'approved') {
    return (
      <div className={`mt-2 p-2.5 rounded-lg border bg-emerald-50/50 dark:bg-emerald-500/5 border-emerald-300/50 dark:border-emerald-500/20`}>
        <div className="flex items-center gap-2">
          <Icons.CheckCircle size={12} className="text-emerald-600 dark:text-emerald-400" />
          <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">Aplicado · {meta.label}</span>
        </div>
        <div className="text-[10px] text-emerald-600/80 dark:text-emerald-500/80 mt-0.5 ml-5 truncate">{action.summary}</div>
      </div>
    );
  }
  if (action.status === 'rejected') {
    return (
      <div className="mt-2 p-2 rounded-lg border bg-zinc-50/50 dark:bg-zinc-800/30 border-zinc-200 dark:border-zinc-700/40">
        <div className="flex items-center gap-2 text-[11px] text-zinc-400 dark:text-zinc-500">
          <Icons.X size={11} />
          Rechazado · {meta.label}
        </div>
      </div>
    );
  }
  if (action.status === 'failed') {
    return (
      <div className="mt-2 p-2.5 rounded-lg border bg-rose-50/50 dark:bg-rose-500/5 border-rose-300/40 dark:border-rose-500/20">
        <div className="flex items-center gap-2">
          <Icons.AlertCircle size={12} className="text-rose-500" />
          <span className="text-[11px] font-medium text-rose-700 dark:text-rose-400">Error al aplicar</span>
        </div>
        <div className="text-[10px] text-rose-600/80 dark:text-rose-500/80 mt-0.5">{action.errorMsg || 'Reintentá o cargalo manual.'}</div>
      </div>
    );
  }

  // Pending — show approve/reject UI
  return (
    <div className={`mt-2 p-3 rounded-xl border ${meta.color}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={13} />
        <span className="text-[11px] font-bold uppercase tracking-wider">{meta.label}</span>
      </div>
      <div className="text-[12px] font-medium text-zinc-800 dark:text-zinc-100 leading-snug">{action.summary}</div>
      {renderDetails()}
      <div className="flex gap-1.5 mt-2.5">
        <button
          onClick={onApprove}
          className="flex-1 px-2.5 py-1.5 text-[11px] font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
        >
          <Icons.Check size={11} />
          Aprobar y aplicar
        </button>
        <button
          onClick={onReject}
          className="px-2.5 py-1.5 text-[11px] font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          Rechazar
        </button>
      </div>
    </div>
  );
};

export const AiAdvisor: React.FC = () => {
  const { user } = useAuth();
  const { projects, createProject } = useProjects();
  const { incomes, expenses } = useFinance();
  const { members } = useTeam();
  const { createTask } = useCalendar();
  const { clients } = useClients();

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(false);

  // ── Daily persistence: load on mount, save on every change ────────
  // Keyed per user + per day. Older days quietly stay in localStorage —
  // we don't read them, but they survive a future migration if we want
  // to add a history view. Keep clear-history for a fresh start.
  const storageKeyForUser = useMemo(() => user?.id ? storageKey(user.id) : null, [user?.id]);

  useEffect(() => {
    if (!storageKeyForUser) return;
    try {
      const raw = localStorage.getItem(storageKeyForUser);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setMessages(parsed);
      }
    } catch (err) { errorLogger.warn('advisor: load failed', err); }
  }, [storageKeyForUser]);

  useEffect(() => {
    if (!storageKeyForUser) return;
    try {
      // Don't bother writing an empty array unless something was previously
      // saved — avoids re-stamping the storage on every cold mount.
      if (messages.length === 0) {
        if (localStorage.getItem(storageKeyForUser)) localStorage.removeItem(storageKeyForUser);
        return;
      }
      localStorage.setItem(storageKeyForUser, JSON.stringify(messages));
    } catch { /* quota / private mode — ignore */ }
  }, [messages, storageKeyForUser]);

  // Hide the floating AI pill when any other modal/slide-panel is open. We
  // detect this by watching document.body's overflow style — every modal in
  // the app locks scroll via `body { overflow: hidden }` when it opens.
  // MutationObserver picks up the change without polling and reverts when
  // the modal closes.
  const [otherModalOpen, setOtherModalOpen] = useState(false);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const update = () => {
      const overflow = document.body.style.overflow;
      // While the AiAdvisor itself is open it also locks scroll; ignore that
      // case so the panel's own animation doesn't trigger our hide.
      setOtherModalOpen(overflow === 'hidden' && !isOpen);
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
    return () => observer.disconnect();
  }, [isOpen]);
  const [sessionExpired, setSessionExpired] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Close on Escape, lock body scroll while open ─────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
    if (isOpen) {
      document.addEventListener('keydown', handler);
      document.body.style.overflow = 'hidden';
      // Focus input on open
      setTimeout(() => inputRef.current?.focus(), 200);
    }
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // ── Auto-scroll on new messages ──────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending, insightsLoading]);

  // ── Build context summary from app state ─────────────────────────
  // Includes IDs for projects/clients/members so the AI can reference
  // them when proposing actions (action validators reject any id not
  // present in this context).
  const buildContextSummary = useCallback(() => {
    const lines: string[] = [];
    const now = new Date();

    const activeProjects = projects
      .filter(p => p.status === 'Active' || p.status === 'Pending')
      .sort((a, b) => {
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      })
      .slice(0, 8);
    const overdueCount = projects.filter(p => p.deadline && new Date(p.deadline) < now && p.status !== 'Completed').length;
    lines.push(`PROYECTOS (${projects.length} total, ${activeProjects.length} activos, ${overdueCount} atrasados):`);
    activeProjects.forEach(p => {
      lines.push(`- id=${p.id} | "${p.title}" | ${p.clientName} | ${p.progress}% | deadline: ${p.deadline || 'n/a'}`);
    });

    if (clients && clients.length > 0) {
      lines.push(`\nCLIENTES (${clients.length}):`);
      clients.slice(0, 12).forEach((c: any) => {
        lines.push(`- id=${c.id} | "${c.name || c.company || c.email}"`);
      });
    }

    const totalIncome = (incomes || []).reduce((s: number, i: any) => s + (i.total_amount || 0), 0);
    const paidIncome = (incomes || []).reduce((s: number, i: any) => {
      const paid = (i.installments || []).filter((inst: any) => inst.status === 'paid');
      return s + paid.reduce((sum: number, inst: any) => sum + (inst.amount || 0), 0);
    }, 0);
    const totalExpenses = (expenses || []).reduce((s: number, e: any) => s + (e.amount || 0), 0);
    lines.push(`\nFINANZAS: Ingresos $${totalIncome.toLocaleString()} (cobrado $${paidIncome.toLocaleString()}) | Gastos $${totalExpenses.toLocaleString()} | Balance $${(paidIncome - totalExpenses).toLocaleString()}`);

    const activeMembers = members.filter(m => m.status === 'active');
    const totalOpen = activeMembers.reduce((s, m) => s + (m.openTasks || 0), 0);
    lines.push(`\nEQUIPO (${activeMembers.length} activos, ${totalOpen} tareas abiertas):`);
    activeMembers.slice(0, 12).forEach((m: any) => {
      lines.push(`- id=${m.id} | "${m.name || m.email}" | ${m.openTasks || 0} abiertas`);
    });

    // Compute Monday of the current week so plan_week defaults sensibly.
    const monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    lines.push(`\nFecha hoy: ${now.toISOString().split('T')[0]} (${now.toLocaleDateString('es-AR', { weekday: 'long' })}). Lunes de esta semana: ${monday.toISOString().split('T')[0]}`);

    let result = lines.join('\n');
    if (result.length > 3000) result = result.slice(0, 3000);
    return result;
  }, [projects, clients, incomes, expenses, members]);

  // History formatted for the chat endpoint (only plain user/assistant text).
  const chatHistoryForApi = useMemo(() => {
    const out: { role: 'user' | 'assistant'; content: string }[] = [];
    for (const m of messages) {
      if ('content' in m && typeof m.content === 'string') {
        out.push({ role: m.role, content: m.content });
      }
    }
    return out;
  }, [messages]);

  // ── Send a chat question (now: receives reply + optional actions) ──
  const sendQuestion = useCallback(async (question: string) => {
    if (!question.trim() || sending || !user) return;
    const userMsg: ChatMsg = { role: 'user', content: question.trim(), ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);
    try {
      const context = buildContextSummary();
      const replyResult = await sendAdvisorChatWithActions(context, chatHistoryForApi, question.trim());
      const { reply, actions: rawActions } = replyResult;
      const actions: ProposedAction[] = (rawActions || []).map(a => ({
        ...a,
        id: crypto.randomUUID(),
        status: 'pending' as const,
      }));
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: reply,
        outputId: getOutputId(replyResult),
        actions: actions.length > 0 ? actions : undefined,
        ts: Date.now(),
      }]);
      setSessionExpired(false);
    } catch (err: any) {
      console.error('AI chat error:', err);
      if (err?.needsReLogin) setSessionExpired(true);
      const fallback = err?.needsReLogin
        ? 'Tu sesión expiró. Refrescá la página para iniciar sesión de nuevo.'
        : (err?.message || 'No pude procesar la pregunta. Probá de nuevo.');
      setMessages(prev => [...prev, { role: 'assistant', content: fallback, ts: Date.now() }]);
    } finally {
      setSending(false);
    }
  }, [sending, user, buildContextSummary, chatHistoryForApi]);

  // ── Action approval / rejection ────────────────────────────────────
  // Updates the message in-place with the new status. The actual mutation
  // (createTask / createProject / etc) runs via the existing context
  // hooks so all the same validation, optimistic updates, and realtime
  // sync apply. NEVER auto-executes.
  const updateActionStatus = useCallback((msgIdx: number, actionId: string, patch: Partial<ProposedAction>) => {
    setMessages(prev => prev.map((m, i): ChatMsg => {
      if (i !== msgIdx) return m;
      if (!('actions' in m) || !m.actions) return m;
      return { ...m, actions: m.actions.map(a => a.id === actionId ? { ...a, ...patch } as ProposedAction : a) } as ChatMsg;
    }));
  }, []);

  const handleApproveAction = useCallback(async (msgIdx: number, action: ProposedAction) => {
    try {
      if (action.kind === 'create_task') {
        const p = action.params;
        await createTask({
          title: p.title,
          description: p.description || '',
          completed: p.status === 'done',
          priority: p.priority || 'medium',
          status: (p.status || 'todo') as any,
          start_date: p.due_date || undefined,
          project_id: p.project_id || undefined,
          client_id: p.client_id || undefined,
          assignee_ids: p.assignee_id ? [p.assignee_id] : [],
          owner_id: user?.id || '',
        } as any);
      } else if (action.kind === 'create_project') {
        const p = action.params;
        await createProject({
          title: p.title,
          status: 'Active' as any,
          progress: 0,
          deadline: p.deadline || null,
          client_id: p.client_id || null,
          color: p.color,
          description: p.description,
        } as any);
      } else if (action.kind === 'create_tasks_batch') {
        const p = action.params;
        // Sequentially create — keeps optimistic-update + realtime sync
        // in order. Slow on >20 items but the typical case is 3-10.
        for (const t of p.tasks) {
          await createTask({
            title: t.title,
            description: t.description || '',
            completed: t.status === 'done',
            priority: t.priority || 'medium',
            status: (t.status || 'todo') as any,
            start_date: t.due_date || undefined,
            project_id: p.project_id || undefined,
            client_id: p.client_id || undefined,
            assignee_ids: t.assignee_id ? [t.assignee_id] : [],
            owner_id: user?.id || '',
          } as any);
        }
      } else if (action.kind === 'plan_week') {
        const p = action.params;
        // Anchor each suggested task to week_start + day_offset.
        const monday = new Date(p.week_start + 'T12:00:00');
        for (const t of (p.suggested_tasks || [])) {
          const d = new Date(monday);
          d.setDate(monday.getDate() + (t.day_offset ?? 0));
          await createTask({
            title: t.title,
            description: '',
            completed: false,
            priority: 'medium',
            status: 'todo' as any,
            start_date: d.toISOString().split('T')[0],
            project_id: t.project_id || undefined,
            assignee_ids: t.assignee_id ? [t.assignee_id] : [],
            owner_id: user?.id || '',
          } as any);
        }
      } else if (action.kind === 'suggest_delegate') {
        // Pure suggestion — no mutation. Just acknowledged.
      }
      updateActionStatus(msgIdx, action.id, { status: 'approved' });
    } catch (err: any) {
      errorLogger.error('advisor action failed', err);
      updateActionStatus(msgIdx, action.id, { status: 'failed', errorMsg: err?.message || 'No se pudo aplicar.' });
    }
  }, [createTask, createProject, user?.id, updateActionStatus]);

  const handleRejectAction = useCallback((msgIdx: number, actionId: string) => {
    updateActionStatus(msgIdx, actionId, { status: 'rejected' });
  }, [updateActionStatus]);

  // ── Generate full insights overview as an assistant message ──────
  const generateInsights = useCallback(async (forceRefresh = false) => {
    if (insightsLoading || !user) return;
    setInsightsLoading(true);
    try {
      const context = buildContextSummary();

      // Try cache first (unless force-refresh)
      if (!forceRefresh) {
        const cached = getCachedAdvisorInsights(context);
        if (cached) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            kind: 'insights',
            greeting: cached.greeting || '',
            insights: cached.insights || [],
          }]);
          return;
        }
      }

      if (forceRefresh) clearAICache('advisor');
      const result = await generateAdvisorInsights(context);
      setMessages(prev => [...prev, {
        role: 'assistant',
        kind: 'insights',
        greeting: result.greeting || '',
        insights: result.insights || [],
        outputId: getOutputId(result),
      }]);
      setSessionExpired(false);
    } catch (err: any) {
      console.error('AI Advisor error:', err);
      if (err?.needsReLogin) setSessionExpired(true);
      const fallback = err?.needsReLogin
        ? 'Tu sesión expiró. Refrescá la página para iniciar sesión de nuevo.'
        : (err?.message || 'No pude generar el análisis. Probá de nuevo.');
      setMessages(prev => [...prev, { role: 'assistant', content: fallback }]);
    } finally {
      setInsightsLoading(false);
    }
  }, [insightsLoading, user, buildContextSummary]);

  const handlePrompt = (p: typeof SUGGESTED_PROMPTS[number]) => {
    if (p.kind === 'insights') generateInsights();
    else sendQuestion(p.prompt);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    sendQuestion(input);
  };

  // Header stats
  const activeCount = projects.filter(p => p.status === 'Active').length;
  const totalIncome = (incomes || []).reduce((s: number, i: any) => s + (i.total_amount || 0), 0);
  const isEmpty = messages.length === 0;
  const busy = sending || insightsLoading;

  return (
    <>
      {/* ─── Floating Pill Button ─── (hidden while other modals are open) */}
      <AnimatePresence>
      {!otherModalOpen && (
      <motion.button
        onClick={() => setIsOpen(true)}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.12 } }}
        whileHover={{ scale: 1.03, y: -1 }}
        whileTap={{ scale: 0.97 }}
        className="fixed bottom-5 right-5 z-[55] group flex items-center gap-2 pl-2.5 pr-3.5 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-full shadow-lg shadow-black/15 dark:shadow-black/30 hover:shadow-xl transition-shadow duration-300"
      >
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center relative overflow-hidden"
          style={{ background: 'conic-gradient(from 45deg, #3b82f6, #10b981, #f59e0b, #ec4899, #06b6d4, #3b82f6)' }}
        >
          <div className="absolute inset-[1.5px] rounded-full bg-zinc-900 dark:bg-zinc-100" />
          <Icons.Sparkles size={11} className="relative z-10 text-white dark:text-zinc-900" />
        </div>
        <span className="text-[11px] font-semibold tracking-wide">AI</span>
      </motion.button>
      )}
      </AnimatePresence>

      {/* ─── Slide Panel ─── */}
      {createPortal(
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[60] overflow-hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 bg-zinc-900/20 dark:bg-black/40 backdrop-blur-[2px]"
              onClick={() => setIsOpen(false)}
            />

            {/* Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-y-0 right-0 w-screen max-w-md max-h-screen bg-white dark:bg-zinc-900 border-l border-zinc-200/60 dark:border-zinc-800 shadow-[-20px_0_60px_-10px_rgba(0,0,0,0.08)] dark:shadow-[-20px_0_60px_-10px_rgba(0,0,0,0.4)] flex flex-col overflow-hidden"
            >
              {/* ── Header ── */}
              <div className="px-4 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800/60 shrink-0">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-7 h-7 rounded-md flex items-center justify-center relative overflow-hidden"
                      style={{ background: 'conic-gradient(from 135deg, #3b82f6, #10b981, #f59e0b, #ec4899, #06b6d4, #3b82f6)' }}
                    >
                      <Icons.Sparkles size={14} className="text-white relative z-10" />
                    </div>
                    <div>
                      <h2 className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">AI Advisor</h2>
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                        {busy ? 'Pensando...' : 'Conversá sobre tu negocio'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {messages.length > 0 && (
                      <button
                        onClick={() => setMessages([])}
                        className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                        title="Nueva conversación"
                      >
                        <Icons.RefreshCw size={13} />
                      </button>
                    )}
                    <button
                      onClick={() => setIsOpen(false)}
                      className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    >
                      <Icons.X size={13} />
                    </button>
                  </div>
                </div>

                {/* Quick stats bar */}
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-100/70 dark:bg-zinc-800/50">
                    <Icons.Briefcase size={10} className="text-zinc-400" />
                    <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-300 tabular-nums">{activeCount} activos</span>
                  </div>
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-100/70 dark:bg-zinc-800/50">
                    <Icons.TrendingUp size={10} className="text-zinc-400" />
                    <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-300 tabular-nums">${totalIncome.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-100/70 dark:bg-zinc-800/50">
                    <Icons.Users size={10} className="text-zinc-400" />
                    <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-300 tabular-nums">{members.length}</span>
                  </div>
                </div>
              </div>

              {/* ── Chat scroll area ── */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-3">
                {/* Empty state: greeting + suggested prompts */}
                {isEmpty && (
                  <div className="space-y-4">
                    <div className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: 'conic-gradient(from 135deg, #3b82f6, #10b981, #f59e0b, #ec4899, #06b6d4, #3b82f6)' }}>
                        <Icons.Sparkles size={12} className="text-white" />
                      </div>
                      <div className="flex-1 px-3.5 py-2.5 rounded-2xl rounded-tl-sm bg-zinc-100 dark:bg-zinc-800 text-[12px] leading-[1.55] text-zinc-700 dark:text-zinc-200">
                        Hola, soy tu asesor IA. Tengo contexto de tus proyectos, finanzas y equipo. ¿Sobre qué querés conversar?
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {SUGGESTED_PROMPTS.map((p) => {
                        const IconComp = (Icons as any)[p.icon] || Icons.Sparkles;
                        return (
                          <button
                            key={p.label}
                            onClick={() => handlePrompt(p)}
                            disabled={busy}
                            className="flex items-start gap-2 p-2.5 rounded-xl border border-zinc-200/70 dark:border-zinc-700/60 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors text-left disabled:opacity-50"
                          >
                            <IconComp size={12} className="text-zinc-400 shrink-0 mt-0.5" />
                            <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300 leading-tight">
                              {p.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Messages */}
                {messages.map((msg, idx) => {
                  if (msg.role === 'user') {
                    return (
                      <div key={idx} className="flex justify-end">
                        <div className="max-w-[85%] px-3.5 py-2 rounded-2xl rounded-br-sm bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[12px] leading-[1.55]">
                          {msg.content}
                        </div>
                      </div>
                    );
                  }
                  // Assistant
                  const isInsightsMsg = 'kind' in msg && msg.kind === 'insights';
                  const outputId = (msg as any).outputId as string | null | undefined;
                  const msgActions = (msg as any).actions as ProposedAction[] | undefined;
                  return (
                    <div key={idx} className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: 'conic-gradient(from 135deg, #3b82f6, #10b981, #f59e0b, #ec4899, #06b6d4, #3b82f6)' }}>
                        <Icons.Sparkles size={12} className="text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`${isInsightsMsg ? '' : 'px-3.5 py-2.5 rounded-2xl rounded-tl-sm bg-zinc-100 dark:bg-zinc-800 text-[12px] leading-[1.55] text-zinc-700 dark:text-zinc-200'}`}>
                          {isInsightsMsg ? (
                            <InsightsBlock greeting={(msg as any).greeting} insights={(msg as any).insights} />
                          ) : (
                            (msg as any).content
                          )}
                          {outputId && (
                            <AIFeedbackBar outputId={outputId} className="mt-2" compact />
                          )}
                        </div>
                        {/* Action proposals — rendered as confirm cards
                            below the assistant text. Each remembers its
                            applied/rejected status across reloads via
                            the daily-persistence layer above. */}
                        {msgActions && msgActions.length > 0 && (
                          <div className="space-y-2 mt-2">
                            {msgActions.map(act => (
                              <ActionCard
                                key={act.id}
                                action={act}
                                onApprove={() => handleApproveAction(idx, act)}
                                onReject={() => handleRejectAction(idx, act.id)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Typing indicator */}
                {busy && (
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: 'conic-gradient(from 135deg, #3b82f6, #10b981, #f59e0b, #ec4899, #06b6d4, #3b82f6)' }}>
                      <Icons.Sparkles size={12} className="text-white" />
                    </div>
                    <div className="px-3.5 py-2.5 rounded-2xl rounded-tl-sm bg-zinc-100 dark:bg-zinc-800">
                      <motion.div
                        className="flex items-center gap-1"
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 1.4, repeat: Infinity }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                      </motion.div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Session expired banner ── */}
              {sessionExpired && (
                <div className="px-5 py-2 border-t border-amber-200/60 dark:border-amber-700/30 bg-amber-50/60 dark:bg-amber-500/5 shrink-0">
                  <div className="flex items-center gap-2">
                    <Icons.Alert size={12} className="text-amber-500 shrink-0" />
                    <span className="text-[10px] text-amber-700 dark:text-amber-400 flex-1">Sesión expirada. Iniciá sesión de nuevo.</span>
                    <button
                      onClick={async () => {
                        // Clear the dead session and any stray Supabase keys, then
                        // force a hard reload to land on the login screen.
                        try { await supabase.auth.signOut(); } catch { /* ignore */ }
                        try {
                          for (let i = localStorage.length - 1; i >= 0; i--) {
                            const k = localStorage.key(i);
                            if (k && (k.startsWith('sb-') || k.includes('supabase'))) {
                              localStorage.removeItem(k);
                            }
                          }
                        } catch { /* ignore */ }
                        window.location.href = window.location.pathname;
                      }}
                      className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 hover:underline"
                    >
                      Iniciar sesión
                    </button>
                  </div>
                </div>
              )}

              {/* ── Chat input ── */}
              <form
                onSubmit={handleSubmit}
                className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-800/60 shrink-0"
              >
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      // Auto-grow up to 5 lines
                      const ta = e.target as HTMLTextAreaElement;
                      ta.style.height = 'auto';
                      ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
                    }}
                    onKeyDown={(e) => {
                      // Enter sends (no Shift); Shift+Enter or Cmd+Enter
                      // inserts a newline. This matches Slack/Notion.
                      if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                        e.preventDefault();
                        handleSubmit();
                      }
                    }}
                    placeholder="Preguntale algo, o pedile crear una tarea, planificar la semana..."
                    disabled={busy}
                    rows={1}
                    className="flex-1 px-3.5 py-2.5 text-[12px] bg-zinc-100 dark:bg-zinc-800 rounded-xl border border-transparent focus:border-zinc-300 dark:focus:border-zinc-600 focus:outline-none text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 transition-colors disabled:opacity-60 resize-none leading-snug"
                  />
                  <button
                    type="submit"
                    disabled={busy || !input.trim()}
                    className="p-2.5 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                    title="Enviar (Enter)"
                  >
                    <Icons.Send size={13} />
                  </button>
                </div>
                <div className="text-[9px] text-zinc-400 mt-1.5 text-right">
                  Enter para enviar · Shift+Enter para nueva línea · El historial se guarda por día
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.body)}
    </>
  );
};
