import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Send, Loader2, AlertCircle, MessageSquare, CheckCircle2, XCircle, Wand2 } from 'lucide-react';
import { SlidePanel } from '../ui/SlidePanel';
import { sendFinanceChat, type AdvisorChatMessage, type FinanceChatAction } from '../../lib/ai';
import { useFinance } from '../../context/FinanceContext';
import { useTenant } from '../../context/TenantContext';
import { useClients } from '../../context/ClientsContext';
import { useProjects } from '../../context/ProjectsContext';

type ActionState = 'pending' | 'executing' | 'done' | 'cancelled' | 'error';
type Message = AdvisorChatMessage & {
  ts: number;
  actions?: FinanceChatAction[];
  // action_state[i] mirrors actions[i] so the UI knows what each card is
  // doing (waiting for click, mid-mutation, or settled).
  action_state?: ActionState[];
  action_error?: string[];
};

const SUGGESTIONS = [
  '¿Cuánto gasté en Software este mes?',
  '¿Qué facturas tengo pendientes de cobro?',
  '¿Cuál es mi runway si mantengo este nivel de gastos?',
  'Mostrame mis 5 mayores gastos del mes',
  '¿Estoy cerca del límite de algún budget?',
  'Marcá como pagado el último gasto de Figma',
];

interface FinanceChatProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FinanceChat: React.FC<FinanceChatProps> = ({ isOpen, onClose }) => {
  const {
    expenses, incomes, budgets,
    createExpense, createIncome, updateExpense, updateIncome, deleteExpense, deleteIncome,
    updateBudget,
  } = useFinance();
  const { currentTenant } = useTenant();
  const { clients } = useClients();
  const { projects } = useProjects();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset on open. Keep the conversation per-session (closing wipes it) so
  // the IA never sees stale context from yesterday's question.
  useEffect(() => {
    if (isOpen) {
      setMessages([]);
      setInput('');
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isSending]);

  // Build a compact JSON snapshot of the user's finance state. We deliberately
  // keep it small (totals + recent rows) so the prompt stays under cache limits
  // and the IA can answer without us shipping every transaction. Increase
  // RECENT_LIMIT only if questions clearly need more history.
  const RECENT_LIMIT = 30;
  const context = useMemo(() => {
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const inThisMonth = (iso: string) => {
      const d = new Date(iso + 'T12:00:00');
      return d >= monthStart && d <= monthEnd;
    };

    const monthExpenses = expenses.filter(e => inThisMonth(e.date));
    const monthIncomes = incomes.filter(i => i.due_date && inThisMonth(i.due_date));

    const expensesByCategory: Record<string, number> = {};
    monthExpenses.forEach(e => {
      const k = e.category || 'Sin categoría';
      expensesByCategory[k] = (expensesByCategory[k] || 0) + Number(e.amount || 0);
    });

    const totalExpenseMonth = monthExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const totalIncomeMonth = monthIncomes.reduce((s, i) => s + Number(i.total_amount || 0), 0);
    const totalIncomeMonthPaid = monthIncomes.filter(i => i.status === 'paid')
      .reduce((s, i) => s + Number(i.total_amount || 0), 0);
    const totalIncomeMonthPending = totalIncomeMonth - totalIncomeMonthPaid;

    // Top recent rows (sorted desc by date) — provides concrete grounding for
    // questions like "what was my biggest expense this week?". `id` is
    // included so the IA can target rows in proposed actions; the prompt
    // forbids fabricating ids outside this list.
    const sortedExpenses = [...expenses]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, RECENT_LIMIT)
      .map(e => ({
        id: e.id,
        date: e.date, concept: e.concept, vendor: e.vendor || null,
        amount: Number(e.amount || 0), category: e.category, status: e.status,
        recurring: !!e.recurring,
        budget_id: e.budget_id || null,
      }));
    const sortedIncomes = [...incomes]
      .sort((a, b) => (b.due_date || '').localeCompare(a.due_date || ''))
      .slice(0, RECENT_LIMIT)
      .map(i => ({
        id: i.id,
        due_date: i.due_date, concept: i.concept, client: i.client_name,
        total_amount: Number(i.total_amount || 0), status: i.status,
      }));

    const activeBudgets = budgets.filter(b => b.is_active).map(b => {
      const spent = expenses
        .filter(e => e.budget_id === b.id || (e.category && e.category === b.category))
        .reduce((s, e) => s + Number(e.amount || 0), 0);
      return {
        id: b.id,
        name: b.name, category: b.category, period: b.period,
        allocated: Number(b.allocated_amount || 0),
        spent,
        remaining: Number(b.allocated_amount || 0) - spent,
        utilization_pct: b.allocated_amount ? Math.round((spent / Number(b.allocated_amount)) * 100) : 0,
      };
    });

    return JSON.stringify({
      tenant: currentTenant?.name || null,
      today: today.toISOString().slice(0, 10),
      currency: 'USD',
      // Lookup catalogues so the IA can build create_expense / create_income
      // / link_budget actions referencing real ids without fabricating any.
      expense_categories: ['Software', 'Talent', 'Marketing', 'Operations', 'Legal'],
      clients: clients.slice(0, 60).map(c => ({ id: c.id, name: c.name, company: c.company || null })),
      projects: projects.slice(0, 60).map(p => ({ id: p.id, title: p.title, client_id: p.client_id || null })),
      month: { totals: { expense: totalExpenseMonth, income_total: totalIncomeMonth, income_paid: totalIncomeMonthPaid, income_pending: totalIncomeMonthPending } },
      expenses_by_category_this_month: expensesByCategory,
      active_budgets: activeBudgets,
      recent_expenses: sortedExpenses,
      recent_incomes: sortedIncomes,
      counts: { expenses: expenses.length, incomes: incomes.length, budgets: budgets.length },
    });
  }, [expenses, incomes, budgets, clients, projects, currentTenant?.name]);

  const send = useCallback(async (text?: string) => {
    const question = (text ?? input).trim();
    if (!question || isSending) return;
    setError(null);
    const userMsg: Message = { role: 'user', content: question, ts: Date.now() };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput('');
    setIsSending(true);
    try {
      const result = await sendFinanceChat(
        context,
        newHistory.map(m => ({ role: m.role, content: m.content })),
        question,
      );
      // Defensive: drop actions the frontend can't safely execute. Targeted
      // ops require a real id from our current state. Create ops require
      // amount + concept. The aim is to never let an IA hallucination reach
      // the confirm UI as a clickable action.
      const validActions = (result.actions || []).filter(a => {
        if (!a || !a.kind || !a.op) return false;
        if (a.op === 'create_expense' || a.op === 'create_income') {
          return !!(a.params && typeof a.params.amount === 'number' && a.params.amount > 0 && a.params.concept);
        }
        if (a.op === 'update_budget') {
          return !!(a.target_id && budgets.some(b => b.id === a.target_id) && a.params && typeof a.params.amount === 'number');
        }
        if (!a.target_id) return false;
        if (a.kind === 'expense') return expenses.some(e => e.id === a.target_id);
        if (a.kind === 'income') return incomes.some(i => i.id === a.target_id);
        return false;
      });
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: result.reply,
        ts: Date.now(),
        actions: validActions.length > 0 ? validActions : undefined,
        action_state: validActions.length > 0 ? validActions.map(() => 'pending' as ActionState) : undefined,
        action_error: validActions.length > 0 ? validActions.map(() => '') : undefined,
      }]);
    } catch (err: any) {
      setError(err?.message || 'No pude responder. Probá de nuevo.');
    } finally {
      setIsSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, isSending, messages, context, expenses, incomes]);

  const setActionState = useCallback((msgIdx: number, actionIdx: number, state: ActionState, errMsg?: string) => {
    setMessages(prev => prev.map((m, i) => {
      if (i !== msgIdx || !m.action_state) return m;
      const next_state = [...m.action_state]; next_state[actionIdx] = state;
      const next_err = [...(m.action_error || [])]; next_err[actionIdx] = errMsg || '';
      return { ...m, action_state: next_state, action_error: next_err };
    }));
  }, []);

  const executeAction = useCallback(async (msgIdx: number, actionIdx: number) => {
    const msg = messages[msgIdx];
    const action = msg?.actions?.[actionIdx];
    if (!action) return;
    setActionState(msgIdx, actionIdx, 'executing');
    try {
      // Create ops (no target_id required).
      if (action.op === 'create_expense') {
        const p = action.params!;
        await createExpense({
          category: p.category || 'Operations',
          concept: p.concept!.trim(),
          amount: Number(p.amount || 0),
          date: p.date || new Date().toISOString().slice(0, 10),
          vendor: p.vendor || '',
          status: p.status || 'pending',
          recurring: !!p.recurring,
          ...(p.client_id ? { client_id: p.client_id } : {}),
          ...(p.project_id ? { project_id: p.project_id } : {}),
          ...(p.budget_id ? { budget_id: p.budget_id } : {}),
        });
      } else if (action.op === 'create_income') {
        const p = action.params!;
        const client = p.client_id ? clients.find(c => c.id === p.client_id) : null;
        await createIncome({
          client_id: p.client_id || null,
          project_id: p.project_id || null,
          client_name: client?.name || p.client_name || (p.client_id ? 'Client' : 'No client'),
          project_name: 'No project',
          concept: p.concept!.trim(),
          total_amount: Number(p.amount || 0),
          due_date: p.date || new Date().toISOString().slice(0, 10),
          num_installments: 1,
        });
      } else if (action.op === 'update_budget' && action.target_id) {
        await updateBudget(action.target_id, { allocated_amount: Number(action.params?.amount || 0) });
      } else if (action.kind === 'expense' && action.target_id) {
        switch (action.op) {
          case 'mark_paid':       await updateExpense(action.target_id, { status: 'paid' }); break;
          case 'mark_pending':    await updateExpense(action.target_id, { status: 'pending' }); break;
          case 'update_amount':   if (typeof action.params?.amount === 'number') await updateExpense(action.target_id, { amount: action.params.amount }); break;
          case 'update_date':     if (action.params?.date) await updateExpense(action.target_id, { date: action.params.date }); break;
          case 'link_budget':     if (action.params?.budget_id) await updateExpense(action.target_id, { budget_id: action.params.budget_id }); break;
          case 'delete':          await deleteExpense(action.target_id); break;
        }
      } else if (action.kind === 'income' && action.target_id) {
        switch (action.op) {
          case 'mark_paid':       await updateIncome(action.target_id, { status: 'paid' }); break;
          case 'mark_pending':    await updateIncome(action.target_id, { status: 'pending' }); break;
          case 'update_amount':   if (typeof action.params?.amount === 'number') await updateIncome(action.target_id, { total_amount: action.params.amount }); break;
          case 'update_date':     if (action.params?.date) await updateIncome(action.target_id, { due_date: action.params.date }); break;
          case 'delete':          await deleteIncome(action.target_id); break;
          // link_budget is expense-only — silently no-op for incomes
        }
      }
      setActionState(msgIdx, actionIdx, 'done');
    } catch (err: any) {
      setActionState(msgIdx, actionIdx, 'error', err?.message || 'Error al ejecutar');
    }
  }, [messages, clients, createExpense, createIncome, updateExpense, updateIncome, deleteExpense, deleteIncome, updateBudget, setActionState]);

  const cancelAction = useCallback((msgIdx: number, actionIdx: number) => {
    setActionState(msgIdx, actionIdx, 'cancelled');
  }, [setActionState]);

  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={onClose}
      width="2xl"
      title="Preguntale al contador"
      subtitle="Hacele preguntas sobre tus gastos, ingresos y budgets — en lenguaje natural"
      headerRight={
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gradient-to-r from-indigo-500/10 via-fuchsia-500/10 to-rose-500/10 border border-fuchsia-500/30">
          <Sparkles size={11} className="text-fuchsia-500" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-fuchsia-600 dark:text-fuchsia-300">AI</span>
        </div>
      }
    >
      <div className="flex flex-col h-full">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 p-4 space-y-1.5">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-fuchsia-600 dark:text-fuchsia-300">
                  <MessageSquare size={11} /> Cómo funciona
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Te respondo en base a tus datos reales (gastos, ingresos, budgets activos).
                  No invento números — si la info no está, te lo digo.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Probá con</div>
                <div className="flex flex-col gap-1.5">
                  {SUGGESTIONS.map((s, i) => (
                    <button key={i} type="button"
                      onClick={() => { setInput(s); inputRef.current?.focus(); }}
                      className="text-left px-3 py-2 rounded-lg border border-zinc-100 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/40 hover:border-fuchsia-300 dark:hover:border-fuchsia-700 hover:bg-fuchsia-50/40 dark:hover:bg-fuchsia-500/5 text-[11px] text-zinc-600 dark:text-zinc-300 transition-all">
                      <span className="text-fuchsia-500 mr-1.5">›</span>{s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} gap-2`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                    : 'bg-zinc-100 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100'
                }`}>
                  {m.content}
                </div>

                {/* Action cards — confirm before executing */}
                {m.role === 'assistant' && m.actions && m.actions.length > 0 && (
                  <div className="w-full max-w-[85%] space-y-1.5">
                    {m.actions.map((a, ai) => {
                      const state: ActionState = m.action_state?.[ai] ?? 'pending';
                      const err = m.action_error?.[ai] || '';
                      const isExpense = a.kind === 'expense';
                      const opLabel: Record<string, string> = {
                        mark_paid: 'Marcar como paid',
                        mark_pending: 'Marcar como pending',
                        update_amount: 'Actualizar monto',
                        update_date: 'Actualizar fecha',
                        link_budget: 'Vincular a budget',
                        delete: 'Eliminar',
                        create_expense: 'Crear gasto',
                        create_income: 'Crear ingreso',
                        update_budget: 'Actualizar budget',
                      };
                      const isDanger = a.op === 'delete';
                      return (
                        <div key={ai} className={`rounded-xl border px-3 py-2 ${
                          isDanger
                            ? 'border-rose-200 dark:border-rose-500/30 bg-rose-50/50 dark:bg-rose-500/5'
                            : 'border-fuchsia-200 dark:border-fuchsia-500/30 bg-fuchsia-50/40 dark:bg-fuchsia-500/5'
                        }`}>
                          <div className="flex items-start gap-2">
                            <div className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                              isExpense ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200' : 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                            }`}>
                              {isExpense ? 'EX' : 'IN'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                                {opLabel[a.op] || a.op}
                              </div>
                              <div className="text-xs text-zinc-800 dark:text-zinc-200 mt-0.5">{a.summary}</div>
                              {err && state === 'error' && (
                                <div className="text-[10px] text-rose-600 dark:text-rose-400 mt-1">{err}</div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-1.5 mt-2">
                            {state === 'pending' && (
                              <>
                                <button type="button" onClick={() => cancelAction(i, ai)}
                                  className="px-2.5 py-1 rounded-md text-[10px] font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                                  Cancelar
                                </button>
                                <button type="button" onClick={() => executeAction(i, ai)}
                                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold text-white shadow-sm hover:opacity-90 transition-opacity ${
                                    isDanger ? 'bg-rose-600' : 'bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900'
                                  }`}>
                                  <Wand2 size={10} /> Ejecutar
                                </button>
                              </>
                            )}
                            {state === 'executing' && (
                              <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                                <Loader2 size={10} className="animate-spin" /> Ejecutando…
                              </span>
                            )}
                            {state === 'done' && (
                              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 size={11} /> Hecho
                              </span>
                            )}
                            {state === 'cancelled' && (
                              <span className="flex items-center gap-1 text-[10px] text-zinc-400">
                                <XCircle size={11} /> Cancelada
                              </span>
                            )}
                            {state === 'error' && (
                              <button type="button" onClick={() => executeAction(i, ai)}
                                className="px-2.5 py-1 rounded-md text-[10px] font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors">
                                Reintentar
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))
          )}

          {isSending && (
            <div className="flex justify-start">
              <div className="bg-zinc-100 dark:bg-zinc-800/60 rounded-2xl px-4 py-2.5 flex items-center gap-2">
                <Loader2 size={12} className="animate-spin text-fuchsia-500" />
                <span className="text-xs text-zinc-500">Pensando…</span>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 text-xs font-medium text-rose-600 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-lg px-3 py-2">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Composer pinned to bottom */}
        <div className="border-t border-zinc-100 dark:border-zinc-800/60 p-3 bg-white dark:bg-zinc-900">
          <div className="relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              rows={2}
              disabled={isSending}
              placeholder="Preguntá sobre tus finanzas… (Enter para enviar, Shift+Enter para salto de línea)"
              className="w-full resize-none rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 pr-12 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/30 focus:border-fuchsia-400 transition-all"
            />
            <button onClick={() => send()} type="button" disabled={!input.trim() || isSending}
              className="absolute right-2 bottom-2 p-2 rounded-lg text-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)' }}>
              <Send size={13} />
            </button>
          </div>
          <p className="text-[10px] text-zinc-400 mt-1.5 text-center">
            Las respuestas se basan en tus datos reales. Doble-checkear cualquier número antes de tomar decisiones.
          </p>
        </div>
      </div>
    </SlidePanel>
  );
};
