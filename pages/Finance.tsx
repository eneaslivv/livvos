import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { SlidePanel } from '../components/ui/SlidePanel';
import {
  TrendingUp, TrendingDown, AlertTriangle, Target, PieChart,
  CreditCard, FileText, Settings, Download,
  ChevronRight, Wallet, BarChart3, Receipt,
  ArrowDownLeft, ArrowUpFromLine, Clock, CheckCircle2, CircleDot,
  Search, Banknote, Building2, Briefcase, Tag, Users, Trash2
} from 'lucide-react';
import {
  useFinance,
  type IncomeEntry,
  type Installment,
  type ExpenseEntry,
  type CreateIncomeData,
  type CreateExpenseData,
} from '../context/FinanceContext';
import { useProjects } from '../context/ProjectsContext';
import { useClients } from '../context/ClientsContext';
import { useRBAC } from '../context/RBACContext';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart as RPieChart, Pie, Cell
} from 'recharts';

// ─── Local types ──────────────────────────────────────────────────

interface LiquidityPoint {
  month: string;
  ingresos: number;
  gastos: number;
  balance: number;
}

type FinanceTab = 'dashboard' | 'ingresos' | 'gastos' | 'proyectos' | 'config';

// ─── Formatters ───────────────────────────────────────────────────

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

const fmtPercent = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

const fmtDate = (d: string) => {
  const date = new Date(d + 'T12:00:00');
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ─── Expense categories ───────────────────────────────────────────

const EXPENSE_CATEGORIES: Record<string, { icon: typeof BarChart3; color: string }> = {
  'Software': { icon: Building2, color: 'text-blue-500 bg-blue-50 dark:bg-blue-500/10' },
  'Talento': { icon: Users, color: 'text-violet-500 bg-violet-50 dark:bg-violet-500/10' },
  'Marketing': { icon: Target, color: 'text-amber-500 bg-amber-50 dark:bg-amber-500/10' },
  'Operaciones': { icon: Briefcase, color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' },
  'Legal': { icon: FileText, color: 'text-rose-500 bg-rose-50 dark:bg-rose-500/10' },
};

// ─── Status badge ─────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const styles: Record<string, string> = {
    paid: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
    partial: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
    pending: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
    overdue: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400',
  };
  const labels: Record<string, string> = {
    paid: 'Cobrado', partial: 'Parcial', pending: 'Pendiente', overdue: 'Vencido',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${styles[status] || styles.pending}`}>
      {labels[status] || status}
    </span>
  );
};

// ─── Chart Tooltip ────────────────────────────────────────────────

const ChartTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ color: string; name: string; value: number }>; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-zinc-700 dark:text-zinc-200 mb-1.5">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-zinc-500 dark:text-zinc-400">{p.name}:</span>
          <span className="font-medium text-zinc-800 dark:text-zinc-100">{fmtCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════

export const Finance: React.FC = () => {
  const {
    incomes, incomesLoading, createIncome, updateInstallment, deleteIncome,
    expenses, expensesLoading, createExpense, deleteExpense,
  } = useFinance();
  const { projects } = useProjects();
  const { clients } = useClients();
  const { hasPermission } = useRBAC();

  // Loading timeouts
  const [incomesTimedOut, setIncomesTimedOut] = useState(false);
  const incomesStartRef = useRef(Date.now());
  useEffect(() => {
    if (incomesLoading) {
      const elapsed = Date.now() - incomesStartRef.current;
      const timer = setTimeout(() => setIncomesTimedOut(true), Math.max(0, 5000 - elapsed));
      return () => clearTimeout(timer);
    }
    incomesStartRef.current = Date.now();
    setIncomesTimedOut(false);
  }, [incomesLoading]);

  const [expensesTimedOut, setExpensesTimedOut] = useState(false);
  const expensesStartRef = useRef(Date.now());
  useEffect(() => {
    if (expensesLoading) {
      const elapsed = Date.now() - expensesStartRef.current;
      const timer = setTimeout(() => setExpensesTimedOut(true), Math.max(0, 5000 - elapsed));
      return () => clearTimeout(timer);
    }
    expensesStartRef.current = Date.now();
    setExpensesTimedOut(false);
  }, [expensesLoading]);

  const [activeTab, setActiveTab] = useState<FinanceTab>('dashboard');
  const [incomeSearch, setIncomeSearch] = useState('');
  const [expenseSearch, setExpenseSearch] = useState('');
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<string>('all');
  const [expandedIncome, setExpandedIncome] = useState<string | null>(null);

  // Slide panel state
  const [isEntryOpen, setIsEntryOpen] = useState(false);
  const [entryType, setEntryType] = useState<'income' | 'expense'>('income');
  const [entryError, setEntryError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Income form state
  const [incomeForm, setIncomeForm] = useState({
    client_id: '', project_id: '', concept: '',
    total_amount: '', num_installments: '1', due_date: new Date().toISOString().split('T')[0],
  });

  // Expense form state
  const [expenseForm, setExpenseForm] = useState({
    concept: '', category: 'Software', amount: '',
    vendor: '', project_id: '', date: new Date().toISOString().split('T')[0],
    recurring: false, status: 'pending' as 'paid' | 'pending',
  });

  // ─── Computed Data ────────────────────────────────────────────

  const totalPaidIncome = useMemo(() =>
    incomes.reduce((sum: number, inc: IncomeEntry) =>
      sum + (inc.installments || []).filter((i: Installment) => i.status === 'paid').reduce((s: number, i: Installment) => s + i.amount, 0), 0
    ), [incomes]);

  const totalPendingIncome = useMemo(() =>
    incomes.reduce((sum: number, inc: IncomeEntry) =>
      sum + (inc.installments || []).filter((i: Installment) => i.status !== 'paid').reduce((s: number, i: Installment) => s + i.amount, 0), 0
    ), [incomes]);

  const totalExpensesPaid = useMemo(() =>
    expenses.filter((e: ExpenseEntry) => e.status === 'paid').reduce((s: number, e: ExpenseEntry) => s + e.amount, 0), [expenses]);

  const totalExpensesPending = useMemo(() =>
    expenses.filter((e: ExpenseEntry) => e.status === 'pending').reduce((s: number, e: ExpenseEntry) => s + e.amount, 0), [expenses]);

  const currentBalance = totalPaidIncome - totalExpensesPaid;
  const liquidez = totalPaidIncome - totalExpensesPaid - totalExpensesPending;
  const projection90d = totalPendingIncome - totalExpensesPending;
  const margin = totalPaidIncome > 0 ? ((totalPaidIncome - totalExpensesPaid) / totalPaidIncome) * 100 : 0;

  // Expense breakdown by category
  const expenseByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach((e: ExpenseEntry) => { map[e.category] = (map[e.category] || 0) + e.amount; });
    return Object.entries(map)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [expenses]);

  // Income breakdown by project/service
  const incomeBySource = useMemo(() => {
    const map: Record<string, { amount: number; paid: number; count: number }> = {};
    incomes.forEach((inc: IncomeEntry) => {
      const key = inc.project_name || inc.client_name || 'General';
      if (!map[key]) map[key] = { amount: 0, paid: 0, count: 0 };
      map[key].amount += inc.total_amount;
      map[key].paid += (inc.installments || []).filter((i: Installment) => i.status === 'paid').reduce((s: number, i: Installment) => s + i.amount, 0);
      map[key].count += 1;
    });
    return Object.entries(map)
      .map(([source, data]) => ({ source, ...data }))
      .sort((a, b) => b.amount - a.amount);
  }, [incomes]);

  // Build liquidity timeline from real data (group by month)
  const liquidityData = useMemo((): LiquidityPoint[] => {
    const monthMap: Record<string, { ingresos: number; gastos: number }> = {};
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    // Count paid installments as income
    incomes.forEach((inc: IncomeEntry) => {
      (inc.installments || []).forEach((inst: Installment) => {
        if (inst.status === 'paid' && inst.paid_date) {
          const d = new Date(inst.paid_date + 'T12:00:00');
          const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
          if (!monthMap[key]) monthMap[key] = { ingresos: 0, gastos: 0 };
          monthMap[key].ingresos += inst.amount;
        }
      });
    });

    // Count expenses
    expenses.forEach((exp: ExpenseEntry) => {
      const d = new Date(exp.date + 'T12:00:00');
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
      if (!monthMap[key]) monthMap[key] = { ingresos: 0, gastos: 0 };
      monthMap[key].gastos += exp.amount;
    });

    // Sort by month key and build running balance
    const sorted = Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b));
    let runningBalance = 0;
    return sorted.map(([key, val]) => {
      runningBalance += val.ingresos - val.gastos;
      const [, monthIdx] = key.split('-');
      return {
        month: monthNames[parseInt(monthIdx)] || key,
        ingresos: val.ingresos,
        gastos: val.gastos,
        balance: runningBalance,
      };
    });
  }, [incomes, expenses]);

  // Project P&L
  const projectPnL = useMemo(() => {
    const map: Record<string, { name: string; income: number; expenses: number }> = {};
    incomes.forEach((inc: IncomeEntry) => {
      const key = inc.project_name || 'Sin Proyecto';
      if (!map[key]) map[key] = { name: key, income: 0, expenses: 0 };
      map[key].income += (inc.installments || []).filter((i: Installment) => i.status === 'paid').reduce((s: number, i: Installment) => s + i.amount, 0);
    });
    expenses.forEach((exp: ExpenseEntry) => {
      const key = exp.project_name || 'General';
      if (!map[key]) map[key] = { name: key, income: 0, expenses: 0 };
      map[key].expenses += exp.amount;
    });
    return Object.values(map).map(p => ({
      ...p,
      profit: p.income - p.expenses,
      margin: p.income > 0 ? ((p.income - p.expenses) / p.income) * 100 : p.expenses > 0 ? -100 : 0,
      health: (p.income - p.expenses) > 0 ? 'profitable' as const : (p.income - p.expenses) === 0 ? 'break-even' as const : 'loss' as const,
    })).sort((a, b) => b.profit - a.profit);
  }, [incomes, expenses]);

  // Filtered lists
  const filteredIncomes = useMemo(() => {
    if (!incomeSearch) return incomes;
    const q = incomeSearch.toLowerCase();
    return incomes.filter((inc: IncomeEntry) =>
      inc.client_name.toLowerCase().includes(q) ||
      inc.project_name.toLowerCase().includes(q) ||
      inc.concept.toLowerCase().includes(q)
    );
  }, [incomeSearch, incomes]);

  const filteredExpenses = useMemo(() => {
    let result = expenses;
    if (expenseCategoryFilter !== 'all') {
      result = result.filter((e: ExpenseEntry) => e.category === expenseCategoryFilter);
    }
    if (expenseSearch) {
      const q = expenseSearch.toLowerCase();
      result = result.filter((e: ExpenseEntry) =>
        e.concept.toLowerCase().includes(q) ||
        e.vendor.toLowerCase().includes(q) ||
        e.project_name.toLowerCase().includes(q)
      );
    }
    return result;
  }, [expenseSearch, expenseCategoryFilter, expenses]);

  // ─── Form Handlers ────────────────────────────────────────────

  const resetIncomeForm = useCallback(() => {
    setIncomeForm({ client_id: '', project_id: '', concept: '', total_amount: '', num_installments: '1', due_date: new Date().toISOString().split('T')[0] });
  }, []);

  const resetExpenseForm = useCallback(() => {
    setExpenseForm({ concept: '', category: 'Software', amount: '', vendor: '', project_id: '', date: new Date().toISOString().split('T')[0], recurring: false, status: 'pending' });
  }, []);

  const openIncomeForm = useCallback(() => {
    resetIncomeForm();
    setEntryType('income');
    setEntryError(null);
    setIsEntryOpen(true);
  }, [resetIncomeForm]);

  const openExpenseForm = useCallback(() => {
    resetExpenseForm();
    setEntryType('expense');
    setEntryError(null);
    setIsEntryOpen(true);
  }, [resetExpenseForm]);

  const closeForm = useCallback(() => {
    setIsEntryOpen(false);
    setEntryError(null);
  }, []);

  const handleSubmitIncome = useCallback(async () => {
    if (!incomeForm.concept.trim()) { setEntryError('Ingresa un concepto.'); return; }
    if (!incomeForm.total_amount || Number(incomeForm.total_amount) <= 0) { setEntryError('El monto debe ser mayor a 0.'); return; }

    setIsSubmitting(true);
    setEntryError(null);

    try {
      // Resolve client/project names
      const client = clients.find((c: any) => c.id === incomeForm.client_id);
      const project = projects.find((p: any) => p.id === incomeForm.project_id);

      const data: CreateIncomeData = {
        client_id: incomeForm.client_id || null,
        project_id: incomeForm.project_id || null,
        client_name: client?.name || (incomeForm.client_id ? 'Cliente' : 'Sin cliente'),
        project_name: project?.title || (incomeForm.project_id ? 'Proyecto' : 'Sin proyecto'),
        concept: incomeForm.concept.trim(),
        total_amount: Number(incomeForm.total_amount),
        due_date: incomeForm.due_date || new Date().toISOString().split('T')[0],
        num_installments: Math.max(1, parseInt(incomeForm.num_installments) || 1),
      };

      console.log('[Finance] Creating income:', data);

      // Timeout wrapper to prevent infinite "Guardando..." state
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Tiempo de espera agotado. Intentá de nuevo.')), 15000)
      );

      await Promise.race([createIncome(data), timeout]);
      closeForm();
    } catch (err: any) {
      console.error('[Finance] Error creating income:', err);
      setEntryError(err?.message || 'Error al guardar ingreso. Revisá la consola.');
    } finally {
      setIsSubmitting(false);
    }
  }, [incomeForm, clients, projects, createIncome, closeForm]);

  const handleSubmitExpense = useCallback(async () => {
    if (!expenseForm.concept.trim()) { setEntryError('Ingresa un concepto.'); return; }
    if (!expenseForm.amount || Number(expenseForm.amount) <= 0) { setEntryError('El monto debe ser mayor a 0.'); return; }
    if (!expenseForm.date) { setEntryError('Selecciona una fecha.'); return; }

    setIsSubmitting(true);
    setEntryError(null);

    try {
      const project = projects.find((p: any) => p.id === expenseForm.project_id);

      const data: CreateExpenseData = {
        category: expenseForm.category,
        concept: expenseForm.concept.trim(),
        amount: Number(expenseForm.amount),
        date: expenseForm.date,
        project_id: expenseForm.project_id || null,
        project_name: project?.title || 'General',
        vendor: expenseForm.vendor.trim(),
        recurring: expenseForm.recurring,
        status: expenseForm.status,
      };

      console.log('[Finance] Creating expense:', data);

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Tiempo de espera agotado. Intentá de nuevo.')), 15000)
      );

      await Promise.race([createExpense(data), timeout]);
      closeForm();
    } catch (err: any) {
      console.error('[Finance] Error creating expense:', err);
      setEntryError(err?.message || 'Error al guardar gasto. Revisá la consola.');
    } finally {
      setIsSubmitting(false);
    }
  }, [expenseForm, projects, createExpense, closeForm]);

  const handleMarkInstallmentPaid = useCallback(async (installment: Installment) => {
    try {
      await updateInstallment(installment.id, {
        status: 'paid',
        paid_date: new Date().toISOString().split('T')[0],
      });
    } catch (err) {
      console.error('Error marking installment as paid:', err);
    }
  }, [updateInstallment]);

  const handleDeleteIncome = useCallback(async (id: string) => {
    try {
      await deleteIncome(id);
    } catch (err) {
      console.error('Error deleting income:', err);
    }
  }, [deleteIncome]);

  const handleDeleteExpense = useCallback(async (id: string) => {
    try {
      await deleteExpense(id);
    } catch (err) {
      console.error('Error deleting expense:', err);
    }
  }, [deleteExpense]);

  // ─── Permission gate ──────────────────────────────────────────

  if (!hasPermission('finance', 'view')) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
        <div className="p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-lg mb-4">
          <CreditCard className="w-8 h-8 text-zinc-400" />
        </div>
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Acceso Restringido</h3>
        <p className="text-zinc-400 text-xs max-w-xs">No tienes permisos para acceder a los datos financieros.</p>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="max-w-[1600px] mx-auto space-y-5 animate-in fade-in duration-500 pt-4 pb-16">

      {/* ─── Header ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-5 border-b border-zinc-100 dark:border-zinc-800/60">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-zinc-400 text-[10px] font-semibold uppercase tracking-[0.15em] mb-2">
            <div className="w-1 h-1 rounded-full bg-emerald-500" />
            Módulo Financiero
          </div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Finanzas</h1>
          <p className="text-zinc-400 text-xs max-w-md">Control de ingresos, gastos, márgenes y liquidez del equipo.</p>
        </div>
        <div className="flex gap-2">
          {hasPermission('finance', 'create') && (
            <>
              <button onClick={openIncomeForm} className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium shadow-sm active:scale-[0.98] transition-all duration-200">
                <ArrowDownLeft size={14} strokeWidth={2.5} />
                <span>Ingreso</span>
              </button>
              <button onClick={openExpenseForm} className="flex items-center gap-1.5 px-3.5 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg text-xs font-medium shadow-sm hover:opacity-90 active:scale-[0.98] transition-all duration-200">
                <ArrowUpFromLine size={14} strokeWidth={2.5} />
                <span>Gasto</span>
              </button>
            </>
          )}
          <button className="flex items-center gap-1.5 px-3.5 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-lg text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all duration-200">
            <Download size={14} />
            <span>Exportar</span>
          </button>
        </div>
      </div>

      {/* ─── Tabs ──────────────────────────────────────────────── */}
      <div className="flex overflow-x-auto no-scrollbar gap-0.5 p-0.5 bg-zinc-100/60 dark:bg-zinc-900/60 rounded-lg w-fit">
        {([
          { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
          { id: 'ingresos', label: 'Ingresos', icon: ArrowDownLeft },
          { id: 'gastos', label: 'Gastos', icon: Receipt },
          { id: 'proyectos', label: 'Proyectos P&L', icon: Target },
          { id: 'config', label: 'Configuración', icon: Settings },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all duration-200 font-medium text-xs whitespace-nowrap
              ${activeTab === tab.id
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
              }`}
          >
            <tab.icon size={13} strokeWidth={activeTab === tab.id ? 2 : 1.5} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ═══════════════ DASHBOARD ═══════════════ */}
      {activeTab === 'dashboard' && (
        <div className="space-y-5 animate-in slide-in-from-bottom-2 duration-500">

          {/* Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { title: 'Balance General', value: fmtCurrency(currentBalance), change: incomes.length > 0 ? fmtPercent(margin > 0 ? 12.4 : -5.2) : null, trend: 'up' as const, status: currentBalance >= 0 ? 'positive' as const : 'negative' as const, icon: Wallet, accent: 'emerald' },
              { title: 'Liquidez Disponible', value: fmtCurrency(liquidez), change: incomes.length > 0 ? fmtPercent(8.2) : null, trend: 'up' as const, status: liquidez >= 0 ? 'positive' as const : 'negative' as const, icon: Banknote, accent: 'blue' },
              { title: 'Proyección 90d', value: fmtCurrency(projection90d), change: null, trend: 'up' as const, status: 'neutral' as const, icon: TrendingUp, accent: 'violet' },
              { title: 'Margen Operativo', value: `${margin.toFixed(1)}%`, change: incomes.length > 0 ? fmtPercent(3.1) : null, trend: 'up' as const, status: margin >= 0 ? 'positive' as const : 'negative' as const, icon: PieChart, accent: 'amber' },
            ].map((m, i) => (
              <div key={i} className="group relative p-4 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60 hover:border-zinc-200 dark:hover:border-zinc-700 hover:shadow-sm transition-all duration-300">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`p-1.5 rounded-lg bg-${m.accent}-50 dark:bg-${m.accent}-500/10`}>
                    <m.icon className={`text-${m.accent}-500`} size={14} />
                  </div>
                  <p className="text-zinc-400 text-[10px] font-medium uppercase tracking-wider">{m.title}</p>
                  {m.change && (
                    <div className={`ml-auto flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold
                      ${m.status === 'positive' ? 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10' :
                        m.status === 'negative' ? 'text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-500/10' :
                        'text-zinc-500 bg-zinc-50 dark:text-zinc-400 dark:bg-zinc-800'}`}
                    >
                      {m.change}
                      {m.trend === 'up' ? <TrendingUp size={8} /> : <TrendingDown size={8} />}
                    </div>
                  )}
                </div>
                <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">{m.value}</p>
              </div>
            ))}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

            {/* Liquidity Timeline */}
            <div className="lg:col-span-2 p-5 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Timeline de Liquidez</h3>
                  <p className="text-[10px] text-zinc-400 mt-0.5">Ingresos vs gastos por mes</p>
                </div>
                <span className="flex items-center gap-1 text-[9px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider px-2 py-0.5 bg-emerald-50 dark:bg-emerald-500/10 rounded">
                  <CircleDot size={8} /> Live
                </span>
              </div>
              {liquidityData.length > 0 ? (
                <>
                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={liquidityData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-zinc-100, #f4f4f5)" />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#a1a1aa' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#a1a1aa' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="ingresos" name="Ingresos" fill="#34d399" radius={[4, 4, 0, 0]} barSize={24} />
                        <Bar dataKey="gastos" name="Gastos" fill="#fb7185" radius={[4, 4, 0, 0]} barSize={24} />
                        <Line type="monotone" dataKey="balance" name="Balance" stroke="#818cf8" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3, fill: '#818cf8' }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex items-center gap-4 mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/40">
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-400"><div className="w-3 h-2 rounded-sm bg-emerald-400" /> Ingresos</div>
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-400"><div className="w-3 h-2 rounded-sm bg-rose-400" /> Gastos</div>
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-400"><div className="w-3 h-0.5 border-t-2 border-dashed border-indigo-400" style={{ width: 12 }} /> Balance</div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-[220px] text-zinc-400">
                  <BarChart3 size={28} className="mb-2 text-zinc-300" />
                  <p className="text-xs">Carga ingresos y gastos para ver el timeline.</p>
                </div>
              )}
            </div>

            {/* Expense Breakdown */}
            <div className="p-5 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Gastos por Categoría</h3>
                <span className="text-[10px] text-zinc-400">{fmtCurrency(totalExpensesPaid + totalExpensesPending)}</span>
              </div>
              {expenseByCategory.length > 0 ? (
                <div className="space-y-3">
                  {expenseByCategory.map((cat) => {
                    const total = totalExpensesPaid + totalExpensesPending;
                    const pct = total > 0 ? (cat.amount / total) * 100 : 0;
                    const catInfo = EXPENSE_CATEGORIES[cat.category];
                    const CatIcon = catInfo?.icon || Tag;
                    return (
                      <div key={cat.category} className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <div className={`p-1 rounded ${catInfo?.color || 'text-zinc-500 bg-zinc-50 dark:bg-zinc-800'}`}>
                              <CatIcon size={11} />
                            </div>
                            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{cat.category}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{fmtCurrency(cat.amount)}</span>
                            <span className="text-[10px] text-zinc-400 ml-1.5">{pct.toFixed(0)}%</span>
                          </div>
                        </div>
                        <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800/60 rounded-full overflow-hidden">
                          <div className="h-full bg-zinc-700 dark:bg-zinc-300 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[160px] text-zinc-400">
                  <Receipt size={24} className="mb-2 text-zinc-300" />
                  <p className="text-xs">Sin gastos registrados.</p>
                </div>
              )}
              {expenses.length > 0 && (
                <div className="mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800/40 space-y-2">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-zinc-400">Recurrentes</span>
                    <span className="font-medium text-zinc-700 dark:text-zinc-200">
                      {fmtCurrency(expenses.filter((e: ExpenseEntry) => e.recurring).reduce((s: number, e: ExpenseEntry) => s + e.amount, 0))}/mes
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-zinc-400">Pendientes</span>
                    <span className="font-medium text-amber-600 dark:text-amber-400">{fmtCurrency(totalExpensesPending)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Overview Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Upcoming Payments */}
            <div className="p-5 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Próximos Cobros</h3>
                <button onClick={() => setActiveTab('ingresos')} className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 flex items-center gap-0.5">
                  Ver todos <ChevronRight size={10} />
                </button>
              </div>
              {incomes.length > 0 ? (
                <div className="space-y-2">
                  {incomes
                    .flatMap((inc: IncomeEntry) => (inc.installments || []).filter((i: Installment) => i.status !== 'paid').map(i => ({ ...i, client: inc.client_name, project: inc.project_name })))
                    .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
                    .slice(0, 4)
                    .map(inst => (
                      <div key={inst.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                        <div className={`p-1.5 rounded-lg ${inst.status === 'overdue' ? 'bg-rose-50 dark:bg-rose-500/10' : 'bg-blue-50 dark:bg-blue-500/10'}`}>
                          <Clock size={12} className={inst.status === 'overdue' ? 'text-rose-500' : 'text-blue-500'} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">{inst.client}</div>
                          <div className="text-[10px] text-zinc-400 truncate">{inst.project}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{fmtCurrency(inst.amount)}</div>
                          <div className={`text-[10px] ${inst.status === 'overdue' ? 'text-rose-500' : 'text-zinc-400'}`}>{fmtDate(inst.due_date)}</div>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-400 text-center py-6">Carga un ingreso para ver los próximos cobros.</p>
              )}
            </div>

            {/* Recent Expenses */}
            <div className="p-5 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Gastos Recientes</h3>
                <button onClick={() => setActiveTab('gastos')} className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 flex items-center gap-0.5">
                  Ver todos <ChevronRight size={10} />
                </button>
              </div>
              {expenses.length > 0 ? (
                <div className="space-y-2">
                  {expenses.slice(0, 4).map((exp: ExpenseEntry) => {
                    const catInfo = EXPENSE_CATEGORIES[exp.category];
                    const CatIcon = catInfo?.icon || Tag;
                    return (
                      <div key={exp.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                        <div className={`p-1.5 rounded-lg ${catInfo?.color || 'bg-zinc-50 dark:bg-zinc-800 text-zinc-500'}`}>
                          <CatIcon size={12} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">{exp.concept}</div>
                          <div className="text-[10px] text-zinc-400 truncate">{exp.vendor}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">-{fmtCurrency(exp.amount)}</div>
                          <div className="text-[10px] text-zinc-400">{fmtDate(exp.date)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-zinc-400 text-center py-6">Carga un gasto para verlo aquí.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ INGRESOS ═══════════════ */}
      {activeTab === 'ingresos' && (
        <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-500">
          {/* Summary strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">Total Facturado</div>
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {fmtCurrency(incomes.reduce((s: number, i: IncomeEntry) => s + i.total_amount, 0))}
              </div>
            </div>
            <div className="p-3 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">Cobrado</div>
              <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{fmtCurrency(totalPaidIncome)}</div>
            </div>
            <div className="p-3 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">Pendiente</div>
              <div className="text-sm font-semibold text-amber-600 dark:text-amber-400">{fmtCurrency(totalPendingIncome)}</div>
            </div>
            <div className="p-3 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">Clientes Activos</div>
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{new Set(incomes.map((i: IncomeEntry) => i.client_name)).size}</div>
            </div>
          </div>

          {/* Income breakdown chart + search */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* Income by Source Chart */}
            <div className="p-5 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Ingresos por Servicio</h3>
                  <p className="text-[10px] text-zinc-400 mt-0.5">Distribución por proyecto</p>
                </div>
                <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10">
                  <PieChart size={14} className="text-emerald-500" />
                </div>
              </div>
              {incomeBySource.length > 0 ? (
                <div className="space-y-3">
                  {(() => {
                    const COLORS = ['#34d399', '#60a5fa', '#a78bfa', '#f472b6', '#fbbf24', '#fb923c', '#94a3b8'];
                    const totalAmount = incomeBySource.reduce((s, x) => s + x.amount, 0);
                    return (
                      <>
                        {/* Donut chart */}
                        <div className="h-[140px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <RPieChart>
                              <Pie
                                data={incomeBySource.slice(0, 6)}
                                cx="50%"
                                cy="50%"
                                innerRadius={38}
                                outerRadius={60}
                                paddingAngle={2}
                                dataKey="amount"
                                nameKey="source"
                                strokeWidth={0}
                              >
                                {incomeBySource.slice(0, 6).map((_, idx) => (
                                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip content={({ active, payload }) => {
                                if (!active || !payload?.length) return null;
                                const d = payload[0].payload;
                                return (
                                  <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg p-2.5 text-xs">
                                    <p className="font-semibold text-zinc-800 dark:text-zinc-100">{d.source}</p>
                                    <p className="text-zinc-500">{fmtCurrency(d.amount)} · {d.count} ingreso{d.count > 1 ? 's' : ''}</p>
                                  </div>
                                );
                              }} />
                            </RPieChart>
                          </ResponsiveContainer>
                        </div>
                        {/* Legend */}
                        <div className="space-y-2">
                          {incomeBySource.slice(0, 5).map((item, idx) => {
                            const pct = totalAmount > 0 ? (item.amount / totalAmount) * 100 : 0;
                            return (
                              <div key={item.source} className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                                <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300 truncate flex-1">{item.source}</span>
                                <span className="text-[11px] font-semibold text-zinc-900 dark:text-zinc-100 shrink-0">{fmtCurrency(item.amount)}</span>
                                <span className="text-[10px] text-zinc-400 w-8 text-right shrink-0">{pct.toFixed(0)}%</span>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    );
                  })()}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[180px] text-zinc-400">
                  <Briefcase size={24} className="mb-2 text-zinc-300" />
                  <p className="text-xs text-center">Crea ingresos para ver<br />la distribución por servicio.</p>
                </div>
              )}
            </div>

            {/* Search + quick stats */}
            <div className="lg:col-span-2 space-y-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input type="text" value={incomeSearch} onChange={e => setIncomeSearch(e.target.value)}
                  placeholder="Buscar por cliente, proyecto o concepto..."
                  className="w-full pl-9 pr-4 py-2.5 text-xs bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/40 transition-all" />
              </div>

              {/* Collection progress */}
              {incomes.length > 0 && (
                <div className="p-4 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Progreso de cobro</span>
                    <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      {incomes.reduce((s: number, i: IncomeEntry) => s + i.total_amount, 0) > 0
                        ? `${((totalPaidIncome / incomes.reduce((s: number, i: IncomeEntry) => s + i.total_amount, 0)) * 100).toFixed(0)}%`
                        : '0%'}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800/60 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                      style={{ width: `${incomes.reduce((s: number, i: IncomeEntry) => s + i.total_amount, 0) > 0 ? (totalPaidIncome / incomes.reduce((s: number, i: IncomeEntry) => s + i.total_amount, 0)) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-2 text-[10px] text-zinc-400">
                    <span>Cobrado: {fmtCurrency(totalPaidIncome)}</span>
                    <span>Pendiente: {fmtCurrency(totalPendingIncome)}</span>
                  </div>
                </div>
              )}

              {/* Top clients mini-list */}
              {incomes.length > 0 && (
                <div className="p-4 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-2.5">Top Clientes</h4>
                  <div className="space-y-2">
                    {(() => {
                      const clientMap: Record<string, number> = {};
                      incomes.forEach((inc: IncomeEntry) => {
                        const key = inc.client_name || 'Sin cliente';
                        clientMap[key] = (clientMap[key] || 0) + inc.total_amount;
                      });
                      return Object.entries(clientMap)
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 4)
                        .map(([name, amount]) => (
                          <div key={name} className="flex items-center gap-2.5">
                            <div className="w-6 h-6 rounded-md bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[9px] font-bold text-zinc-500 shrink-0">
                              {name.substring(0, 2).toUpperCase()}
                            </div>
                            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 flex-1 truncate">{name}</span>
                            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 shrink-0">{fmtCurrency(amount)}</span>
                          </div>
                        ));
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Income list */}
          <div className="bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60 overflow-hidden">
            {incomesLoading && !incomesTimedOut ? (
              <div className="flex flex-col items-center justify-center p-10 gap-2">
                <div className="w-6 h-6 border-2 border-zinc-200 dark:border-zinc-800 border-t-zinc-900 dark:border-t-zinc-100 rounded-full animate-spin" />
                <p className="text-zinc-400 text-[10px] font-medium uppercase tracking-wider">Cargando ingresos...</p>
              </div>
            ) : filteredIncomes.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-10 gap-2">
                <ArrowDownLeft size={24} className="text-zinc-300" />
                <p className="text-zinc-400 text-xs">{incomeSearch ? 'Sin resultados.' : 'Sin ingresos registrados. Crea el primero con el botón "Ingreso".'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead>
                    <tr className="bg-zinc-50/50 dark:bg-zinc-800/20">
                      <th className="px-5 py-2.5 text-left text-[10px] font-medium text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/60">Cliente / Proyecto</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-medium text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/60">Concepto</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-medium text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/60">Total</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-medium text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/60">Cobrado</th>
                      <th className="px-4 py-2.5 text-center text-[10px] font-medium text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/60">Cuotas</th>
                      <th className="px-4 py-2.5 text-center text-[10px] font-medium text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/60">Estado</th>
                      <th className="px-4 py-2.5 w-16 border-b border-zinc-100 dark:border-zinc-800/60" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/40">
                    {filteredIncomes.map((inc: IncomeEntry) => {
                      const paid = (inc.installments || []).filter((i: Installment) => i.status === 'paid').reduce((s: number, i: Installment) => s + i.amount, 0);
                      const paidCount = (inc.installments || []).filter((i: Installment) => i.status === 'paid').length;
                      const totalCount = (inc.installments || []).length;
                      const isExpanded = expandedIncome === inc.id;
                      return (
                        <React.Fragment key={inc.id}>
                          <tr className="group hover:bg-zinc-50/50 dark:hover:bg-zinc-800/10 transition-colors cursor-pointer"
                            onClick={() => setExpandedIncome(isExpanded ? null : inc.id)}>
                            <td className="px-5 py-3">
                              <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{inc.client_name}</div>
                              <div className="text-[10px] text-zinc-400">{inc.project_name}</div>
                            </td>
                            <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400 max-w-[200px] truncate">{inc.concept}</td>
                            <td className="px-4 py-3 text-xs font-medium text-zinc-900 dark:text-zinc-100 text-right">{fmtCurrency(inc.total_amount)}</td>
                            <td className="px-4 py-3 text-xs font-medium text-emerald-600 dark:text-emerald-400 text-right">{fmtCurrency(paid)}</td>
                            <td className="px-4 py-3 text-center">
                              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">{paidCount}/{totalCount}</span>
                            </td>
                            <td className="px-4 py-3 text-center"><StatusBadge status={inc.status} /></td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1 justify-end">
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteIncome(inc.id); }}
                                  className="p-1 rounded text-zinc-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all">
                                  <Trash2 size={12} />
                                </button>
                                <ChevronRight size={14} className={`text-zinc-300 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={7} className="bg-zinc-50/50 dark:bg-zinc-800/10 px-5 py-3">
                                <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-2">Detalle de Cuotas</div>
                                <div className="space-y-1.5">
                                  {(inc.installments || []).map((inst: Installment) => (
                                    <div key={inst.id} className="flex items-center gap-3 p-2 rounded-lg bg-white dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800/40">
                                      <div className={`p-1 rounded ${inst.status === 'paid' ? 'bg-emerald-50 dark:bg-emerald-500/10' : inst.status === 'overdue' ? 'bg-rose-50 dark:bg-rose-500/10' : 'bg-amber-50 dark:bg-amber-500/10'}`}>
                                        {inst.status === 'paid' ? <CheckCircle2 size={12} className="text-emerald-500" /> :
                                         inst.status === 'overdue' ? <AlertTriangle size={12} className="text-rose-500" /> :
                                         <Clock size={12} className="text-amber-500" />}
                                      </div>
                                      <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300 w-20">Cuota {inst.number}</span>
                                      <span className="text-[11px] font-semibold text-zinc-900 dark:text-zinc-100 w-24">{fmtCurrency(inst.amount)}</span>
                                      <span className="text-[10px] text-zinc-400 w-28">Vence: {fmtDate(inst.due_date)}</span>
                                      {inst.paid_date && <span className="text-[10px] text-emerald-500">Pagado: {fmtDate(inst.paid_date)}</span>}
                                      <div className="ml-auto flex items-center gap-2">
                                        <StatusBadge status={inst.status} />
                                        {inst.status !== 'paid' && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleMarkInstallmentPaid(inst); }}
                                            className="px-2 py-0.5 text-[10px] font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors"
                                          >
                                            Marcar pagada
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════ GASTOS ═══════════════ */}
      {activeTab === 'gastos' && (
        <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-500">
          {/* Summary strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">Gastos Totales</div>
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{fmtCurrency(totalExpensesPaid + totalExpensesPending)}</div>
            </div>
            <div className="p-3 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">Pagados</div>
              <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{fmtCurrency(totalExpensesPaid)}</div>
            </div>
            <div className="p-3 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">Pendientes</div>
              <div className="text-sm font-semibold text-amber-600 dark:text-amber-400">{fmtCurrency(totalExpensesPending)}</div>
            </div>
            <div className="p-3 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">Recurrentes / mes</div>
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {fmtCurrency(expenses.filter((e: ExpenseEntry) => e.recurring).reduce((s: number, e: ExpenseEntry) => s + e.amount, 0))}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input type="text" value={expenseSearch} onChange={e => setExpenseSearch(e.target.value)}
                placeholder="Buscar gastos..."
                className="w-full pl-9 pr-4 py-2.5 text-xs bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400 transition-all" />
            </div>
            <div className="flex gap-1 overflow-x-auto no-scrollbar">
              {['all', ...Object.keys(EXPENSE_CATEGORIES)].map(cat => (
                <button key={cat} onClick={() => setExpenseCategoryFilter(cat)}
                  className={`px-3 py-2 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all
                    ${expenseCategoryFilter === cat
                      ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm'
                      : 'bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700'
                    }`}>
                  {cat === 'all' ? 'Todas' : cat}
                </button>
              ))}
            </div>
          </div>

          {/* Expenses list */}
          <div className="bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60 overflow-hidden">
            {expensesLoading && !expensesTimedOut ? (
              <div className="flex flex-col items-center justify-center p-10 gap-2">
                <div className="w-6 h-6 border-2 border-zinc-200 dark:border-zinc-800 border-t-zinc-900 dark:border-t-zinc-100 rounded-full animate-spin" />
                <p className="text-zinc-400 text-[10px] font-medium uppercase tracking-wider">Cargando gastos...</p>
              </div>
            ) : filteredExpenses.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-10 gap-2">
                <Receipt size={24} className="text-zinc-300" />
                <p className="text-zinc-400 text-xs">{expenseSearch || expenseCategoryFilter !== 'all' ? 'Sin resultados.' : 'Sin gastos registrados. Crea el primero con el botón "Gasto".'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[650px]">
                  <thead>
                    <tr className="bg-zinc-50/50 dark:bg-zinc-800/20">
                      <th className="px-5 py-2.5 text-left text-[10px] font-medium text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/60">Concepto</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-medium text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/60">Categoría</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-medium text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/60">Proyecto</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-medium text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/60">Monto</th>
                      <th className="px-4 py-2.5 text-center text-[10px] font-medium text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/60">Fecha</th>
                      <th className="px-4 py-2.5 text-center text-[10px] font-medium text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/60">Estado</th>
                      <th className="px-4 py-2.5 w-10 border-b border-zinc-100 dark:border-zinc-800/60" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/40">
                    {filteredExpenses.map((exp: ExpenseEntry) => {
                      const catInfo = EXPENSE_CATEGORIES[exp.category];
                      const CatIcon = catInfo?.icon || Tag;
                      return (
                        <tr key={exp.id} className="group hover:bg-zinc-50/50 dark:hover:bg-zinc-800/10 transition-colors">
                          <td className="px-5 py-3">
                            <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{exp.concept}</div>
                            <div className="text-[10px] text-zinc-400">{exp.vendor}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <div className={`p-1 rounded ${catInfo?.color || 'bg-zinc-50 text-zinc-500'}`}>
                                <CatIcon size={10} />
                              </div>
                              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{exp.category}</span>
                              {exp.recurring && <span className="text-[8px] bg-zinc-100 dark:bg-zinc-800 text-zinc-400 px-1 rounded">REC</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[11px] text-zinc-500 dark:text-zinc-400">{exp.project_name}</td>
                          <td className="px-4 py-3 text-xs font-semibold text-zinc-900 dark:text-zinc-100 text-right">{fmtCurrency(exp.amount)}</td>
                          <td className="px-4 py-3 text-[11px] text-zinc-400 text-center">{fmtDate(exp.date)}</td>
                          <td className="px-4 py-3 text-center"><StatusBadge status={exp.status} /></td>
                          <td className="px-4 py-3">
                            <button onClick={() => handleDeleteExpense(exp.id)}
                              className="p-1 rounded text-zinc-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all">
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════ PROYECTOS P&L ═══════════════ */}
      {activeTab === 'proyectos' && (
        <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-500">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">Proyectos</div>
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{projectPnL.length}</div>
            </div>
            <div className="p-3 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">Ingresos Total</div>
              <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                {fmtCurrency(projectPnL.reduce((s: number, p: { income: number }) => s + p.income, 0))}
              </div>
            </div>
            <div className="p-3 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">Gastos Total</div>
              <div className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                {fmtCurrency(projectPnL.reduce((s: number, p: { expenses: number }) => s + p.expenses, 0))}
              </div>
            </div>
            <div className="p-3 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">Profit Neto</div>
              <div className={`text-sm font-semibold ${projectPnL.reduce((s: number, p: { profit: number }) => s + p.profit, 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {fmtCurrency(projectPnL.reduce((s: number, p: { profit: number }) => s + p.profit, 0))}
              </div>
            </div>
          </div>

          {projectPnL.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-10 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60 gap-2">
              <Target size={24} className="text-zinc-300" />
              <p className="text-zinc-400 text-xs">Carga ingresos y gastos asociados a proyectos para ver el análisis P&L.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {projectPnL.map(p => {
                const progressPct = p.income > 0 ? Math.min(100, (p.expenses / p.income) * 100) : (p.expenses > 0 ? 100 : 0);
                return (
                  <div key={p.name} className="p-5 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60 hover:border-zinc-200 dark:hover:border-zinc-700 hover:shadow-sm transition-all">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{p.name}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wide
                            ${p.health === 'profitable' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' :
                              p.health === 'loss' ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400' :
                              'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400'}`}>
                            {p.health === 'profitable' ? 'Rentable' : p.health === 'loss' ? 'Pérdida' : 'Break-even'}
                          </span>
                          <span className="text-[10px] text-zinc-400">Margen: {p.margin.toFixed(1)}%</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-lg font-semibold ${p.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {p.profit >= 0 ? '+' : ''}{fmtCurrency(p.profit)}
                        </div>
                        <div className="text-[10px] text-zinc-400">Profit</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="p-2.5 bg-emerald-50/50 dark:bg-emerald-500/5 rounded-lg">
                        <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mb-0.5">Ingresos</div>
                        <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{fmtCurrency(p.income)}</div>
                      </div>
                      <div className="p-2.5 bg-rose-50/50 dark:bg-rose-500/5 rounded-lg">
                        <div className="text-[10px] text-rose-600 dark:text-rose-400 mb-0.5">Gastos</div>
                        <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{fmtCurrency(p.expenses)}</div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-zinc-400">
                        <span>Burn Rate</span>
                        <span>{progressPct.toFixed(0)}% consumido</span>
                      </div>
                      <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800/60 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-700 ${progressPct > 90 ? 'bg-rose-500' : progressPct > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${progressPct}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ CONFIGURACIÓN ═══════════════ */}
      {activeTab === 'config' && (
        <div className="animate-in fade-in duration-500">
          <div className="bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60 p-5">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Configuración Financiera</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-lg">
                <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 mb-1">Moneda Principal</div>
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">USD ($)</div>
                <p className="text-[10px] text-zinc-400 mt-0.5">Todos los registros usan esta moneda.</p>
              </div>
              <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-lg">
                <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 mb-1">Registros</div>
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{incomes.length} ingresos / {expenses.length} gastos</div>
                <p className="text-[10px] text-zinc-400 mt-0.5">Total de registros financieros cargados.</p>
              </div>
              <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-lg">
                <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 mb-1">Categorías de Gasto</div>
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{Object.keys(EXPENSE_CATEGORIES).length}</div>
                <p className="text-[10px] text-zinc-400 mt-0.5">Software, Talento, Marketing, Operaciones, Legal</p>
              </div>
              <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-lg">
                <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 mb-1">Integración Clientes</div>
                <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Conectado</div>
                <p className="text-[10px] text-zinc-400 mt-0.5">{clients.length} clientes sincronizados desde CRM.</p>
              </div>
              <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-lg">
                <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 mb-1">Integración Proyectos</div>
                <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Conectado</div>
                <p className="text-[10px] text-zinc-400 mt-0.5">{projects.length} proyectos sincronizados.</p>
              </div>
              <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-lg">
                <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 mb-1">Modelos de Negocio</div>
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Fixed + Hourly + Retainer</div>
                <p className="text-[10px] text-zinc-400 mt-0.5">Soporta los 3 modelos por proyecto.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ SLIDE PANEL ═══════════════ */}
      <SlidePanel
        isOpen={isEntryOpen}
        onClose={closeForm}
        title={entryType === 'income' ? 'Nuevo Ingreso' : 'Nuevo Gasto'}
        subtitle={entryType === 'income' ? 'Seleccioná un proyecto o registrá un ingreso general' : 'Registrar gasto'}
        width="md"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={closeForm}
              className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
              Cancelar
            </button>
            <button
              onClick={entryType === 'income' ? handleSubmitIncome : handleSubmitExpense}
              disabled={isSubmitting}
              className={`px-4 py-1.5 rounded-lg text-white text-xs font-medium shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity
                ${entryType === 'income' ? 'bg-emerald-600' : 'bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900'}`}
            >
              {isSubmitting ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        }
      >
        <div className="p-5 space-y-4">
          {entryType === 'income' ? (
            <>
              {/* Project selector — primary action, auto-fills client + concept */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Proyecto</label>
                <div className="grid grid-cols-1 gap-1.5">
                  {projects.length > 0 ? (
                    <>
                      {projects.slice(0, 6).map(p => {
                        const isSelected = incomeForm.project_id === p.id;
                        return (
                          <button key={p.id} type="button"
                            onClick={() => {
                              if (isSelected) {
                                setIncomeForm(prev => ({ ...prev, project_id: '', client_id: '', concept: prev.concept === p.title ? '' : prev.concept }));
                              } else {
                                const projectClient = clients.find(c => c.id === p.client_id || c.name === p.client || c.name === p.clientName);
                                setIncomeForm(prev => ({
                                  ...prev,
                                  project_id: p.id,
                                  client_id: projectClient?.id || prev.client_id,
                                  concept: prev.concept || p.title,
                                }));
                              }
                            }}
                            className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg border text-left transition-all ${
                              isSelected
                                ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-500/10 ring-1 ring-emerald-400/30'
                                : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                            }`}
                          >
                            <div className={`w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${
                              isSelected ? 'bg-emerald-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                            }`}>
                              {p.client?.substring(0, 2).toUpperCase() || p.title.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className={`text-xs font-medium truncate ${isSelected ? 'text-emerald-700 dark:text-emerald-300' : 'text-zinc-900 dark:text-zinc-100'}`}>{p.title}</div>
                              {p.client && <div className="text-[10px] text-zinc-400 truncate">{p.client}</div>}
                            </div>
                            {isSelected && <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />}
                          </button>
                        );
                      })}
                      {/* Option for no project */}
                      <button type="button"
                        onClick={() => setIncomeForm(prev => ({ ...prev, project_id: '' }))}
                        className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-lg border text-left transition-all ${
                          !incomeForm.project_id
                            ? 'border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800'
                            : 'border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
                        }`}
                      >
                        <span className="text-[10px] font-medium">Sin proyecto (ingreso general)</span>
                      </button>
                    </>
                  ) : (
                    <div className="text-xs text-zinc-400 italic py-2">No hay proyectos creados aún</div>
                  )}
                </div>
              </div>

              {/* Client — auto-filled from project, but editable */}
              {!incomeForm.project_id && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Cliente</label>
                  <select value={incomeForm.client_id} onChange={e => setIncomeForm(p => ({ ...p, client_id: e.target.value }))}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100">
                    <option value="">Sin cliente asignado</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ''}</option>)}
                  </select>
                </div>
              )}

              {/* Concept — auto-filled from project, always editable */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Concepto *</label>
                <input type="text" value={incomeForm.concept} onChange={e => setIncomeForm(p => ({ ...p, concept: e.target.value }))}
                  placeholder="Ej: Desarrollo web completo, Consultoría..."
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100" />
              </div>

              {/* Amount + installments in a row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Monto Total *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 font-medium">$</span>
                    <input type="number" min="0" step="0.01" value={incomeForm.total_amount}
                      onChange={e => setIncomeForm(p => ({ ...p, total_amount: e.target.value }))}
                      placeholder="0"
                      className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 pl-7 pr-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Cuotas</label>
                  <input type="number" min="1" max="24" value={incomeForm.num_installments}
                    onChange={e => setIncomeForm(p => ({ ...p, num_installments: e.target.value }))}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100 text-center" />
                </div>
              </div>

              {/* Due date */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Fecha primera cuota</label>
                <input type="date" value={incomeForm.due_date}
                  onChange={e => setIncomeForm(p => ({ ...p, due_date: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100" />
              </div>

              {/* Installment preview */}
              {incomeForm.total_amount && parseInt(incomeForm.num_installments) > 1 && (
                <div className="flex items-center gap-2 p-2.5 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg border border-emerald-100 dark:border-emerald-500/20">
                  <Receipt size={14} className="text-emerald-500 shrink-0" />
                  <span className="text-xs text-emerald-700 dark:text-emerald-300">
                    {incomeForm.num_installments} cuotas de ~{fmtCurrency(Number(incomeForm.total_amount) / parseInt(incomeForm.num_installments))} c/u
                  </span>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Concepto *</label>
                <input type="text" value={expenseForm.concept} onChange={e => setExpenseForm(p => ({ ...p, concept: e.target.value }))}
                  placeholder="Ej: Licencias Figma, Hosting..."
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Categoría</label>
                  <select value={expenseForm.category} onChange={e => setExpenseForm(p => ({ ...p, category: e.target.value }))}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100">
                    {Object.keys(EXPENSE_CATEGORIES).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Monto *</label>
                  <input type="number" min="0" step="0.01" value={expenseForm.amount}
                    onChange={e => setExpenseForm(p => ({ ...p, amount: e.target.value }))}
                    placeholder="0"
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Proveedor / Vendor</label>
                <input type="text" value={expenseForm.vendor} onChange={e => setExpenseForm(p => ({ ...p, vendor: e.target.value }))}
                  placeholder="Nombre del proveedor..."
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Proyecto</label>
                  <select value={expenseForm.project_id} onChange={e => setExpenseForm(p => ({ ...p, project_id: e.target.value }))}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100">
                    <option value="">General</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Fecha *</label>
                  <input type="date" value={expenseForm.date}
                    onChange={e => setExpenseForm(p => ({ ...p, date: e.target.value }))}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Estado</label>
                  <select value={expenseForm.status} onChange={e => setExpenseForm(p => ({ ...p, status: e.target.value as 'paid' | 'pending' }))}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100">
                    <option value="pending">Pendiente</option>
                    <option value="paid">Pagado</option>
                  </select>
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={expenseForm.recurring}
                      onChange={e => setExpenseForm(p => ({ ...p, recurring: e.target.checked }))}
                      className="rounded border-zinc-300 dark:border-zinc-700 text-emerald-600 focus:ring-emerald-500" />
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">Recurrente (mensual)</span>
                  </label>
                </div>
              </div>
            </>
          )}

          {entryError && (
            <div className="text-xs font-medium text-rose-600 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-lg px-3 py-2">
              {entryError}
            </div>
          )}
        </div>
      </SlidePanel>
    </div>
  );
};

export default Finance;
