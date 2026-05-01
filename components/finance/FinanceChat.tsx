import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Send, Loader2, AlertCircle, MessageSquare } from 'lucide-react';
import { SlidePanel } from '../ui/SlidePanel';
import { sendAdvisorChat, type AdvisorChatMessage } from '../../lib/ai';
import { useFinance } from '../../context/FinanceContext';
import { useTenant } from '../../context/TenantContext';

type Message = AdvisorChatMessage & { ts: number };

const SUGGESTIONS = [
  '¿Cuánto gasté en Software este mes?',
  '¿Qué facturas tengo pendientes de cobro?',
  '¿Cuál es mi runway si mantengo este nivel de gastos?',
  'Mostrame mis 5 mayores gastos del mes',
  '¿Estoy cerca del límite de algún budget?',
];

interface FinanceChatProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FinanceChat: React.FC<FinanceChatProps> = ({ isOpen, onClose }) => {
  const { expenses, incomes, budgets } = useFinance();
  const { currentTenant } = useTenant();
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
    // questions like "what was my biggest expense this week?".
    const sortedExpenses = [...expenses]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, RECENT_LIMIT)
      .map(e => ({
        date: e.date, concept: e.concept, vendor: e.vendor || null,
        amount: Number(e.amount || 0), category: e.category, status: e.status,
        recurring: !!e.recurring,
      }));
    const sortedIncomes = [...incomes]
      .sort((a, b) => (b.due_date || '').localeCompare(a.due_date || ''))
      .slice(0, RECENT_LIMIT)
      .map(i => ({
        due_date: i.due_date, concept: i.concept, client: i.client_name,
        total_amount: Number(i.total_amount || 0), status: i.status,
      }));

    const activeBudgets = budgets.filter(b => b.is_active).map(b => {
      const spent = expenses
        .filter(e => e.budget_id === b.id || (e.category && e.category === b.category))
        .reduce((s, e) => s + Number(e.amount || 0), 0);
      return {
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
      month: { totals: { expense: totalExpenseMonth, income_total: totalIncomeMonth, income_paid: totalIncomeMonthPaid, income_pending: totalIncomeMonthPending } },
      expenses_by_category_this_month: expensesByCategory,
      active_budgets: activeBudgets,
      recent_expenses: sortedExpenses,
      recent_incomes: sortedIncomes,
      counts: { expenses: expenses.length, incomes: incomes.length, budgets: budgets.length },
    });
  }, [expenses, incomes, budgets, currentTenant?.name]);

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
      const result = await sendAdvisorChat(
        context,
        newHistory.map(m => ({ role: m.role, content: m.content })),
        question,
      );
      setMessages(prev => [...prev, { role: 'assistant', content: result.reply, ts: Date.now() }]);
    } catch (err: any) {
      setError(err?.message || 'No pude responder. Probá de nuevo.');
    } finally {
      setIsSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, isSending, messages, context]);

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
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                    : 'bg-zinc-100 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100'
                }`}>
                  {m.content}
                </div>
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
