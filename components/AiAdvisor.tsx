import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from './ui/Icons';
import { generateAdvisorInsights, AdvisorInsight } from '../lib/ai';
import { useProjects } from '../context/ProjectsContext';
import { useFinance } from '../context/FinanceContext';
import { useTeam } from '../context/TeamContext';
import { useAuth } from '../hooks/useAuth';

const AREA_CONFIG: Record<string, { gradient: string; iconBg: string; border: string; accent: string }> = {
  projects: { gradient: 'from-blue-500/8 to-transparent', iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', border: 'border-blue-500/10', accent: 'text-blue-600 dark:text-blue-400' },
  finance: { gradient: 'from-emerald-500/8 to-transparent', iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/10', accent: 'text-emerald-600 dark:text-emerald-400' },
  marketing: { gradient: 'from-fuchsia-500/8 to-transparent', iconBg: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400', border: 'border-fuchsia-500/10', accent: 'text-fuchsia-600 dark:text-fuchsia-400' },
  team: { gradient: 'from-violet-500/8 to-transparent', iconBg: 'bg-violet-500/10 text-violet-600 dark:text-violet-400', border: 'border-violet-500/10', accent: 'text-violet-600 dark:text-violet-400' },
  planning: { gradient: 'from-amber-500/8 to-transparent', iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', border: 'border-amber-500/10', accent: 'text-amber-600 dark:text-amber-400' },
};

const PRIORITY_LABEL: Record<string, { text: string; color: string }> = {
  high: { text: 'Urgente', color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  medium: { text: 'Esta semana', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
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

export const AiAdvisor: React.FC = () => {
  const { user } = useAuth();
  const { projects } = useProjects();
  const { incomes, expenses } = useFinance();
  const { members } = useTeam();

  const [isOpen, setIsOpen] = useState(false);
  const [insights, setInsights] = useState<AdvisorInsight[]>([]);
  const [greeting, setGreeting] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener('keydown', handler);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const buildContextSummary = useCallback(() => {
    const lines: string[] = [];

    const activeProjects = projects.filter(p => p.status === 'Active' || p.status === 'Pending');
    const overdueProjects = projects.filter(p => p.deadline && new Date(p.deadline) < new Date() && p.status !== 'Completed');
    lines.push(`PROYECTOS (${projects.length} total, ${activeProjects.length} activos):`);
    activeProjects.slice(0, 8).forEach(p => {
      lines.push(`- "${p.title}" | cliente: ${p.clientName} | progreso: ${p.progress}% | deadline: ${p.deadline} | estado: ${p.status}`);
    });
    if (overdueProjects.length > 0) {
      lines.push(`ATRASADOS: ${overdueProjects.map(p => p.title).join(', ')}`);
    }

    const totalIncome = (incomes || []).reduce((s: number, i: any) => s + (i.total_amount || 0), 0);
    const paidIncome = (incomes || []).reduce((s: number, i: any) => {
      const paidInstallments = (i.installments || []).filter((inst: any) => inst.status === 'paid');
      return s + paidInstallments.reduce((sum: number, inst: any) => sum + (inst.amount || 0), 0);
    }, 0);
    const totalExpenses = (expenses || []).reduce((s: number, e: any) => s + (e.amount || 0), 0);
    const pendingIncome = totalIncome - paidIncome;
    lines.push(`\nFINANZAS:`);
    lines.push(`- Ingresos totales: $${totalIncome.toLocaleString()} | Cobrado: $${paidIncome.toLocaleString()} | Pendiente: $${pendingIncome.toLocaleString()}`);
    lines.push(`- Gastos totales: $${totalExpenses.toLocaleString()}`);
    lines.push(`- Balance neto (cobrado - gastos): $${(paidIncome - totalExpenses).toLocaleString()}`);

    const agentCount = members.filter(m => (m as any).is_agent).length;
    const activeMembers = members.filter(m => m.status === 'active');
    lines.push(`\nEQUIPO (${members.length} miembros, ${agentCount} agentes):`);
    activeMembers.slice(0, 6).forEach(m => {
      lines.push(`- ${m.name || m.email} | rol: ${m.role} | ${m.openTasks} tareas abiertas, ${m.completedTasks} completadas`);
    });

    lines.push(`\nFecha actual: ${new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);

    return lines.join('\n');
  }, [projects, incomes, expenses, members]);

  const loadInsights = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const context = buildContextSummary();
      const result = await generateAdvisorInsights(context);
      setInsights(result.insights || []);
      setGreeting(result.greeting || '');
      setHasLoaded(true);
    } catch (err: any) {
      console.error('AI Advisor error:', err);
      setError(err?.message || 'No se pudo generar el análisis');
    } finally {
      setLoading(false);
    }
  }, [user, buildContextSummary]);

  const handleOpen = () => {
    setIsOpen(true);
    if (!hasLoaded && !loading) {
      loadInsights();
    }
  };

  // Stats for the header
  const activeCount = projects.filter(p => p.status === 'Active').length;
  const totalIncome = (incomes || []).reduce((s: number, i: any) => s + (i.total_amount || 0), 0);
  const totalExpenses = (expenses || []).reduce((s: number, e: any) => s + (e.amount || 0), 0);

  const highPriority = insights.filter(i => i.priority === 'high').length;
  const medPriority = insights.filter(i => i.priority === 'medium').length;

  return (
    <>
      {/* ─── Floating Pill Button ─── */}
      <motion.button
        onClick={handleOpen}
        whileHover={{ scale: 1.03, y: -1 }}
        whileTap={{ scale: 0.97 }}
        className="fixed bottom-5 right-5 z-[55] flex items-center gap-2 pl-3 pr-3.5 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-full shadow-lg shadow-black/15 dark:shadow-black/30 hover:shadow-xl transition-shadow duration-300"
      >
        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-500 flex items-center justify-center">
          <Icons.Sparkles size={11} className="text-white" />
        </div>
        <span className="text-[11px] font-semibold tracking-wide">AI</span>
        {hasLoaded && highPriority > 0 && (
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
        )}
      </motion.button>

      {/* ─── Slide Panel ─── */}
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
              ref={panelRef}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-y-0 right-0 w-screen max-w-md bg-white dark:bg-zinc-900 border-l border-zinc-200/60 dark:border-zinc-800 shadow-[-20px_0_60px_-10px_rgba(0,0,0,0.08)] dark:shadow-[-20px_0_60px_-10px_rgba(0,0,0,0.4)] flex flex-col"
            >
              {/* ── Header ── */}
              <div className="px-6 pt-6 pb-5 border-b border-zinc-100 dark:border-zinc-800/60 shrink-0">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-sm shadow-violet-500/20">
                      <Icons.Sparkles size={17} className="text-white" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">AI Advisor</h2>
                      <p className="text-[10px] text-zinc-400 mt-0.5">Análisis inteligente de tu negocio</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={loadInsights}
                      disabled={loading}
                      className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-zinc-600"
                      title="Regenerar análisis"
                    >
                      <Icons.RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button
                      onClick={() => setIsOpen(false)}
                      className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-zinc-600"
                    >
                      <Icons.X size={14} />
                    </button>
                  </div>
                </div>

                {/* Quick stats bar */}
                <div className="flex items-center gap-3">
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

              {/* ── Content ── */}
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
                    <div className="relative">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 flex items-center justify-center">
                        <Icons.Sparkles size={22} className="text-violet-500" />
                      </div>
                      <motion.div
                        className="absolute inset-0 rounded-2xl border-2 border-violet-400/30"
                        animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                      />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Analizando tu negocio</p>
                      <p className="text-[11px] text-zinc-400 mt-1">Revisando proyectos, finanzas y equipo...</p>
                    </div>
                    <div className="flex gap-1 mt-1">
                      {[0, 1, 2].map(i => (
                        <motion.div
                          key={i}
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                          className="w-1.5 h-1.5 rounded-full bg-violet-400"
                        />
                      ))}
                    </div>
                  </div>

                ) : error ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 px-6">
                    <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                      <Icons.Alert size={20} className="text-zinc-400" />
                    </div>
                    <p className="text-xs text-zinc-500 text-center max-w-[260px]">{error}</p>
                    <button
                      onClick={loadInsights}
                      className="mt-1 px-4 py-1.5 text-xs font-medium text-violet-600 hover:text-violet-700 bg-violet-50 dark:bg-violet-500/10 dark:text-violet-400 rounded-lg transition-colors"
                    >
                      Reintentar
                    </button>
                  </div>

                ) : insights.length > 0 ? (
                  <div className="px-5 py-5 space-y-4">
                    {/* Greeting */}
                    {greeting && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 rounded-xl bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5 border border-violet-500/10"
                      >
                        <p className="text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400">{greeting}</p>
                      </motion.div>
                    )}

                    {/* Priority summary */}
                    {(highPriority > 0 || medPriority > 0) && (
                      <div className="flex items-center gap-3 px-1">
                        {highPriority > 0 && (
                          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            {highPriority} urgente{highPriority > 1 ? 's' : ''}
                          </span>
                        )}
                        {medPriority > 0 && (
                          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            {medPriority} esta semana
                          </span>
                        )}
                      </div>
                    )}

                    {/* Insight cards */}
                    {insights.map((insight, idx) => {
                      const config = AREA_CONFIG[insight.area] || AREA_CONFIG.planning;
                      const IconComp = getIconComponent(insight.icon);
                      const priority = PRIORITY_LABEL[insight.priority] || PRIORITY_LABEL.low;

                      return (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.07, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                          className={`p-4 rounded-xl bg-gradient-to-br ${config.gradient} border ${config.border} hover:shadow-sm transition-shadow duration-200`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`w-8 h-8 rounded-lg ${config.iconBg} flex items-center justify-center shrink-0`}>
                              <IconComp size={15} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1.5">
                                <h4 className="text-[12px] font-bold text-zinc-900 dark:text-zinc-100">{insight.title}</h4>
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${priority.color}`}>
                                  {priority.text}
                                </span>
                              </div>
                              <p className="text-[11px] leading-[1.6] text-zinc-600 dark:text-zinc-400">{insight.body}</p>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>

                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-3 px-6">
                    <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                      <Icons.Sparkles size={20} className="text-zinc-300 dark:text-zinc-600" />
                    </div>
                    <p className="text-xs text-zinc-400">Sin datos todavía</p>
                    <button
                      onClick={loadInsights}
                      className="mt-1 px-4 py-1.5 text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:opacity-90 transition-opacity"
                    >
                      Generar análisis
                    </button>
                  </div>
                )}
              </div>

              {/* ── Footer ── */}
              {hasLoaded && !loading && insights.length > 0 && (
                <div className="px-5 py-3.5 border-t border-zinc-100 dark:border-zinc-800/60 shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-[10px] text-zinc-400">
                        {insights.length} insights &middot; {new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <button
                      onClick={loadInsights}
                      disabled={loading}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-500/15 transition-colors"
                    >
                      <Icons.RefreshCw size={10} />
                      Actualizar
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
