import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from './ui/Icons';
import {
  generateAdvisorInsights,
  getCachedAdvisorInsights,
  sendAdvisorChat,
  clearAICache,
  getOutputId,
  AdvisorInsight,
} from '../lib/ai';
import { AIFeedbackBar } from './ai/AIFeedbackBar';
import { useProjects } from '../context/ProjectsContext';
import { useFinance } from '../context/FinanceContext';
import { useTeam } from '../context/TeamContext';
import { useAuth } from '../hooks/useAuth';

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
  { label: '¿En qué enfocarme esta semana?', prompt: '¿En qué proyectos y tareas debería enfocarme esta semana, considerando deadlines y prioridades?', icon: 'Target', kind: 'chat' },
  { label: 'Salud financiera', prompt: 'Analiza mi salud financiera actual: ingresos cobrados vs pendientes, gastos y balance.', icon: 'TrendingUp', kind: 'chat' },
  { label: 'Riesgos en proyectos', prompt: '¿Qué proyectos están en riesgo o atrasados, y qué puedo hacer al respecto?', icon: 'Flag', kind: 'chat' },
];

type ChatMsg =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; outputId?: string | null }
  | { role: 'assistant'; kind: 'insights'; greeting: string; insights: AdvisorInsight[]; outputId?: string | null };

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

export const AiAdvisor: React.FC = () => {
  const { user } = useAuth();
  const { projects } = useProjects();
  const { incomes, expenses } = useFinance();
  const { members } = useTeam();

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      .slice(0, 5);
    const overdueCount = projects.filter(p => p.deadline && new Date(p.deadline) < now && p.status !== 'Completed').length;
    lines.push(`PROYECTOS (${projects.length} total, ${activeProjects.length} activos, ${overdueCount} atrasados):`);
    activeProjects.forEach(p => {
      lines.push(`- "${p.title}" | ${p.clientName} | ${p.progress}% | deadline: ${p.deadline || 'n/a'}`);
    });

    const totalIncome = (incomes || []).reduce((s: number, i: any) => s + (i.total_amount || 0), 0);
    const paidIncome = (incomes || []).reduce((s: number, i: any) => {
      const paid = (i.installments || []).filter((inst: any) => inst.status === 'paid');
      return s + paid.reduce((sum: number, inst: any) => sum + (inst.amount || 0), 0);
    }, 0);
    const totalExpenses = (expenses || []).reduce((s: number, e: any) => s + (e.amount || 0), 0);
    lines.push(`\nFINANZAS: Ingresos $${totalIncome.toLocaleString()} (cobrado $${paidIncome.toLocaleString()}) | Gastos $${totalExpenses.toLocaleString()} | Balance $${(paidIncome - totalExpenses).toLocaleString()}`);

    const activeMembers = members.filter(m => m.status === 'active');
    const totalOpen = activeMembers.reduce((s, m) => s + (m.openTasks || 0), 0);
    lines.push(`\nEQUIPO: ${activeMembers.length} activos, ${totalOpen} tareas abiertas`);

    lines.push(`\nFecha: ${now.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);

    let result = lines.join('\n');
    if (result.length > 1500) result = result.slice(0, 1500);
    return result;
  }, [projects, incomes, expenses, members]);

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

  // ── Send a chat question ─────────────────────────────────────────
  const sendQuestion = useCallback(async (question: string) => {
    if (!question.trim() || sending || !user) return;
    const userMsg: ChatMsg = { role: 'user', content: question.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);
    try {
      const context = buildContextSummary();
      const replyResult = await sendAdvisorChat(context, chatHistoryForApi, question.trim());
      const { reply } = replyResult;
      setMessages(prev => [...prev, { role: 'assistant', content: reply, outputId: getOutputId(replyResult) }]);
      setSessionExpired(false);
    } catch (err: any) {
      console.error('AI chat error:', err);
      if (err?.needsReLogin) setSessionExpired(true);
      const fallback = err?.needsReLogin
        ? 'Tu sesión expiró. Refrescá la página para iniciar sesión de nuevo.'
        : (err?.message || 'No pude procesar la pregunta. Probá de nuevo.');
      setMessages(prev => [...prev, { role: 'assistant', content: fallback }]);
    } finally {
      setSending(false);
    }
  }, [sending, user, buildContextSummary, chatHistoryForApi]);

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
      {/* ─── Floating Pill Button ─── */}
      <motion.button
        onClick={() => setIsOpen(true)}
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
              <div className="px-5 pt-5 pb-4 border-b border-zinc-100 dark:border-zinc-800/60 shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center relative overflow-hidden shadow-sm"
                      style={{ background: 'conic-gradient(from 135deg, #3b82f6, #10b981, #f59e0b, #ec4899, #06b6d4, #3b82f6)' }}
                    >
                      <Icons.Sparkles size={17} className="text-white relative z-10" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">AI Advisor</h2>
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        {busy ? 'Pensando...' : 'Conversá sobre tu negocio'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {messages.length > 0 && (
                      <button
                        onClick={() => setMessages([])}
                        className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-zinc-600"
                        title="Nueva conversación"
                      >
                        <Icons.RefreshCw size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => setIsOpen(false)}
                      className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-zinc-600"
                    >
                      <Icons.X size={14} />
                    </button>
                  </div>
                </div>

                {/* Quick stats bar */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100/80 dark:bg-zinc-800/50">
                    <Icons.Briefcase size={11} className="text-zinc-400" />
                    <span className="text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">{activeCount} activos</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100/80 dark:bg-zinc-800/50">
                    <Icons.TrendingUp size={11} className="text-zinc-400" />
                    <span className="text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">${totalIncome.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100/80 dark:bg-zinc-800/50">
                    <Icons.Users size={11} className="text-zinc-400" />
                    <span className="text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">{members.length}</span>
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
                  return (
                    <div key={idx} className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: 'conic-gradient(from 135deg, #3b82f6, #10b981, #f59e0b, #ec4899, #06b6d4, #3b82f6)' }}>
                        <Icons.Sparkles size={12} className="text-white" />
                      </div>
                      <div className={`flex-1 min-w-0 ${isInsightsMsg ? '' : 'px-3.5 py-2.5 rounded-2xl rounded-tl-sm bg-zinc-100 dark:bg-zinc-800 text-[12px] leading-[1.55] text-zinc-700 dark:text-zinc-200'}`}>
                        {isInsightsMsg ? (
                          <InsightsBlock greeting={(msg as any).greeting} insights={(msg as any).insights} />
                        ) : (
                          (msg as any).content
                        )}
                        {outputId && (
                          <AIFeedbackBar outputId={outputId} className="mt-2" compact />
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
                    <span className="text-[10px] text-amber-700 dark:text-amber-400 flex-1">Sesión expirada. Refrescá la página para iniciar sesión.</span>
                    <button
                      onClick={() => window.location.reload()}
                      className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 hover:underline"
                    >
                      Refrescar
                    </button>
                  </div>
                </div>
              )}

              {/* ── Chat input ── */}
              <form
                onSubmit={handleSubmit}
                className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-800/60 shrink-0"
              >
                <div className="flex items-center gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Preguntale algo a tu asesor..."
                    disabled={busy}
                    className="flex-1 px-3.5 py-2.5 text-[12px] bg-zinc-100 dark:bg-zinc-800 rounded-xl border border-transparent focus:border-zinc-300 dark:focus:border-zinc-600 focus:outline-none text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 transition-colors disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={busy || !input.trim()}
                    className="p-2.5 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                    title="Enviar"
                  >
                    <Icons.Send size={13} />
                  </button>
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
