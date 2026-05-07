import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles, Send, Loader2, AlertCircle, CheckCircle2, XCircle, Wand2,
  ArrowDownLeft, ArrowUpFromLine, Wallet, TrendingUp, Receipt, Target,
  CornerDownLeft, RotateCcw, Bot,
} from 'lucide-react';
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

// Suggestions are now grouped by intent so the empty state reads like a
// quick "what can I do here?" menu instead of a wall of bullet points.
// Each group has its own icon + accent so the eye can scan.
const SUGGESTION_GROUPS: Array<{
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  accent: string;
  prompts: string[];
}> = [
  {
    id: 'analyze',
    label: 'Analizar',
    icon: TrendingUp,
    accent: 'text-violet-600 dark:text-violet-400',
    prompts: [
      '¿Cuál es mi runway si mantengo este nivel de gastos?',
      'Mostrame mis 5 mayores gastos del mes',
      '¿Cómo voy con los cobros este mes?',
    ],
  },
  {
    id: 'log',
    label: 'Registrar',
    icon: Receipt,
    accent: 'text-rose-600 dark:text-rose-400',
    prompts: [
      'Anota un gasto de $120 en Software por Figma',
      'Crea una factura de $5,000 a Acme con vencimiento en 15 días',
    ],
  },
  {
    id: 'budgets',
    label: 'Budgets',
    icon: Target,
    accent: 'text-amber-600 dark:text-amber-400',
    prompts: [
      '¿Estoy cerca del límite de algún budget?',
      'Aumentá el budget de Marketing en 20%',
    ],
  },
];

interface FinanceChatProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Optional pre-filled prompt. When provided (e.g. user typed something
   * into the slim AI bar at the top of any Finance tab and pressed Enter),
   * the chat opens with that text already in the input box, ready to send.
   * The pre-fill is applied once per open cycle.
   */
  initialInput?: string;
}

export const FinanceChat: React.FC<FinanceChatProps> = ({ isOpen, onClose, initialInput }) => {
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
      setInput(initialInput ?? '');
      setError(null);
      setTimeout(() => {
        inputRef.current?.focus();
        // Move caret to the end so the user can keep typing if they want
        // to refine the question before sending.
        if (inputRef.current && initialInput) {
          inputRef.current.setSelectionRange(initialInput.length, initialInput.length);
        }
      }, 80);
    }
  }, [isOpen, initialInput]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isSending]);

  // Auto-resize the composer textarea up to a sane max height. Saves the user
  // from manually dragging the corner when pasting a longer question.
  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.style.height = '0px';
    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 180)}px`;
  }, [input]);

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

  // Quick context summary — shown as small pills under the empty-state
  // header so the user knows what the AI can see right now. Reassures
  // the user that the answers are grounded in their actual data.
  const contextPreview = useMemo(() => ([
    { icon: Receipt, label: `${expenses.length} gastos`, color: 'text-rose-500 bg-rose-50 dark:bg-rose-500/10' },
    { icon: ArrowDownLeft, label: `${incomes.length} ingresos`, color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' },
    { icon: Wallet, label: `${budgets.filter(b => b.is_active).length} budgets`, color: 'text-amber-500 bg-amber-50 dark:bg-amber-500/10' },
  ]), [expenses.length, incomes.length, budgets]);

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
  }, [input, isSending, messages, context, expenses, incomes, budgets]);

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

  const resetConversation = useCallback(() => {
    setMessages([]);
    setError(null);
    setInput('');
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={onClose}
      width="3xl"
      title="Finance copilot"
      subtitle="Hacele preguntas o registrá movimientos en lenguaje natural — siempre con tus datos reales"
      headerRight={
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={resetConversation}
              title="Empezar de nuevo"
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <RotateCcw size={11} />
              Reset
            </button>
          )}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-indigo-500/10 via-fuchsia-500/10 to-rose-500/10 border border-fuchsia-500/30">
            <Sparkles size={11} className="text-fuchsia-500" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-fuchsia-600 dark:text-fuchsia-300">AI</span>
          </div>
        </div>
      }
    >
      <div className="flex flex-col h-full bg-gradient-to-b from-white via-white to-zinc-50/40 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900/40">
        {/* ── Conversation ── */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-5 min-h-0">
          {messages.length === 0 ? (
            <EmptyState
              tenantName={currentTenant?.name || null}
              contextPreview={contextPreview}
              onPick={(s) => { setInput(s); inputRef.current?.focus(); }}
            />
          ) : (
            messages.map((m, i) => (
              <MessageRow
                key={i}
                message={m}
                msgIdx={i}
                executeAction={executeAction}
                cancelAction={cancelAction}
              />
            ))
          )}

          {isSending && <TypingIndicator />}

          {error && (
            <div className="flex items-start gap-2 text-xs font-medium text-rose-600 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl px-3.5 py-2.5">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* ── Composer ── */}
        <div className="border-t border-zinc-100 dark:border-zinc-800/60 px-6 py-4 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md shrink-0">
          <div
            className={`relative rounded-2xl border bg-white dark:bg-zinc-900 transition-all duration-200 ${
              isSending
                ? 'border-zinc-200 dark:border-zinc-800 opacity-60'
                : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 focus-within:border-fuchsia-400 dark:focus-within:border-fuchsia-500/50 focus-within:shadow-[0_0_0_4px_rgba(236,72,153,0.08)]'
            }`}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              rows={1}
              disabled={isSending}
              placeholder="Preguntale al copilot, o registrá un movimiento…"
              className="w-full resize-none rounded-2xl bg-transparent px-4 pt-3.5 pb-12 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none leading-relaxed"
              style={{ minHeight: 76 }}
            />
            {/* Footer of the composer — shortcut hint left, send button right */}
            <div className="absolute left-0 right-0 bottom-0 flex items-center justify-between px-3 pb-2.5">
              <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-medium text-zinc-500 dark:text-zinc-400 text-[9px] border border-zinc-200/60 dark:border-zinc-700/60">
                  Enter
                </kbd>
                <span>enviar</span>
                <span className="text-zinc-300 dark:text-zinc-700">·</span>
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-medium text-zinc-500 dark:text-zinc-400 text-[9px] border border-zinc-200/60 dark:border-zinc-700/60">
                  Shift + Enter
                </kbd>
                <span>nueva línea</span>
              </div>
              <button
                onClick={() => send()}
                type="button"
                disabled={!input.trim() || isSending}
                className="group flex items-center gap-1.5 h-7 px-3 rounded-full text-[11px] font-semibold text-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-md transition-all"
                style={{
                  background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)',
                }}
              >
                <span>Enviar</span>
                <CornerDownLeft size={11} strokeWidth={2.5} />
              </button>
            </div>
          </div>
          <p className="text-[10px] text-zinc-400 mt-2 text-center">
            Las respuestas se basan en tus datos reales. Doble-checkear cualquier número antes de tomar decisiones.
          </p>
        </div>
      </div>
    </SlidePanel>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// Sub-components
// ══════════════════════════════════════════════════════════════════════════

const EmptyState: React.FC<{
  tenantName: string | null;
  contextPreview: Array<{ icon: any; label: string; color: string }>;
  onPick: (prompt: string) => void;
}> = ({ tenantName, contextPreview, onPick }) => (
  <div className="space-y-6">
    {/* Hero */}
    <div className="flex items-start gap-4">
      <div
        className="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg"
        style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)' }}
      >
        <Bot size={22} strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0 pt-1">
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
          ¿En qué te ayudo hoy?
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
          {tenantName
            ? `Soy tu copilot financiero${tenantName ? ` para ${tenantName}` : ''} — analizo, registro y respondo en base a tus datos reales.`
            : 'Soy tu copilot financiero — analizo, registro y respondo en base a tus datos reales.'}
        </p>
        {/* Context pills — what I can see */}
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          {contextPreview.map((c, i) => (
            <div
              key={i}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${c.color}`}
            >
              <c.icon size={10} />
              <span>{c.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* Suggestion grid */}
    <div className="space-y-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400 px-1">
        Sugerencias
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {SUGGESTION_GROUPS.map((group) => (
          <div
            key={group.id}
            className="rounded-2xl border border-zinc-100 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/60 p-4 hover:border-zinc-200 dark:hover:border-zinc-700 hover:shadow-sm transition-all"
          >
            <div className="flex items-center gap-2 mb-3">
              <group.icon size={13} className={group.accent} />
              <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 uppercase tracking-wider">
                {group.label}
              </span>
            </div>
            <div className="space-y-1.5">
              {group.prompts.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onPick(p)}
                  className="w-full text-left text-[11px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 leading-snug py-1 px-2 -mx-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const MessageRow: React.FC<{
  message: Message;
  msgIdx: number;
  executeAction: (msgIdx: number, actionIdx: number) => void;
  cancelAction: (msgIdx: number, actionIdx: number) => void;
}> = ({ message: m, msgIdx, executeAction, cancelAction }) => {
  const isUser = m.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser
          ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
          : 'text-white shadow-sm'
      }`}
        style={!isUser ? { background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)' } : undefined}
      >
        {isUser ? (
          <span className="text-[10px] font-semibold tracking-tight">YO</span>
        ) : (
          <Bot size={14} strokeWidth={2} />
        )}
      </div>

      {/* Bubble + actions */}
      <div className={`flex flex-col gap-2 max-w-[78%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-tr-sm'
            : 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-100 dark:border-zinc-800/60 rounded-tl-sm shadow-sm'
        }`}>
          {m.content}
        </div>

        {!isUser && m.actions && m.actions.length > 0 && (
          <div className="w-full space-y-2">
            {m.actions.map((a, ai) => (
              <ActionCard
                key={ai}
                action={a}
                state={m.action_state?.[ai] ?? 'pending'}
                err={m.action_error?.[ai] || ''}
                onExecute={() => executeAction(msgIdx, ai)}
                onCancel={() => cancelAction(msgIdx, ai)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const ActionCard: React.FC<{
  action: FinanceChatAction;
  state: ActionState;
  err: string;
  onExecute: () => void;
  onCancel: () => void;
}> = ({ action: a, state, err, onExecute, onCancel }) => {
  const isExpense = a.kind === 'expense';
  const isDanger = a.op === 'delete';

  // Op-level metadata: friendly label + a tiny icon so the user can scan
  // a stack of action cards without reading every word.
  const opMeta: Record<string, { label: string; icon: any }> = {
    mark_paid:      { label: 'Marcar como paid',      icon: CheckCircle2 },
    mark_pending:   { label: 'Marcar como pending',   icon: Loader2 },
    update_amount:  { label: 'Actualizar monto',      icon: Wand2 },
    update_date:    { label: 'Actualizar fecha',      icon: Wand2 },
    link_budget:    { label: 'Vincular a budget',     icon: Wallet },
    delete:         { label: 'Eliminar',              icon: XCircle },
    create_expense: { label: 'Crear gasto',           icon: ArrowUpFromLine },
    create_income:  { label: 'Crear ingreso',         icon: ArrowDownLeft },
    update_budget:  { label: 'Actualizar budget',     icon: Wallet },
  };
  const meta = opMeta[a.op] || { label: a.op, icon: Wand2 };
  const OpIcon = meta.icon;

  return (
    <div className={`rounded-xl border ${
      isDanger
        ? 'border-rose-200 dark:border-rose-500/30 bg-rose-50/40 dark:bg-rose-500/5'
        : 'border-fuchsia-200/70 dark:border-fuchsia-500/25 bg-gradient-to-br from-fuchsia-50/40 via-white to-indigo-50/40 dark:from-fuchsia-500/5 dark:via-zinc-900 dark:to-indigo-500/5'
    }`}>
      <div className="flex items-start gap-3 p-3">
        <div className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${
          isDanger
            ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400'
            : isExpense
              ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
              : 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
        }`}>
          <OpIcon size={13} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              {meta.label}
            </span>
            <span className={`px-1.5 py-0 rounded text-[9px] font-bold uppercase tracking-wider ${
              isExpense
                ? 'bg-zinc-200/70 dark:bg-zinc-700/60 text-zinc-700 dark:text-zinc-300'
                : 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
            }`}>
              {isExpense ? 'Expense' : 'Income'}
            </span>
          </div>
          <div className="text-xs text-zinc-800 dark:text-zinc-200 mt-1 leading-relaxed">
            {a.summary}
          </div>
          {err && state === 'error' && (
            <div className="text-[10px] text-rose-600 dark:text-rose-400 mt-1.5">{err}</div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-1.5 px-3 pb-2.5">
        {state === 'pending' && (
          <>
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1 rounded-md text-[10px] font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onExecute}
              className={`flex items-center gap-1 px-3 py-1 rounded-md text-[10px] font-semibold text-white shadow-sm hover:opacity-90 transition-opacity ${
                isDanger ? 'bg-rose-600' : 'bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900'
              }`}
            >
              <Wand2 size={10} />
              {isDanger ? 'Eliminar' : 'Ejecutar'}
            </button>
          </>
        )}
        {state === 'executing' && (
          <span className="flex items-center gap-1 text-[10px] text-zinc-500">
            <Loader2 size={11} className="animate-spin" /> Ejecutando…
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
          <button
            type="button"
            onClick={onExecute}
            className="px-3 py-1 rounded-md text-[10px] font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
          >
            Reintentar
          </button>
        )}
      </div>
    </div>
  );
};

// Three-dot typing animation for the assistant turn while we wait on the
// model. More tactile than a bare spinner — feels like the AI is thinking.
const TypingIndicator: React.FC = () => (
  <div className="flex gap-3">
    <div
      className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white shadow-sm"
      style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)' }}
    >
      <Bot size={14} strokeWidth={2} />
    </div>
    <div className="rounded-2xl rounded-tl-sm bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/60 px-4 py-3 shadow-sm flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-bounce" style={{ animationDelay: '120ms' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-bounce" style={{ animationDelay: '240ms' }} />
    </div>
  </div>
);
