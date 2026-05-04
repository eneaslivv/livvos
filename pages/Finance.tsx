import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { SlidePanel } from '../components/ui/SlidePanel';
import {
  TrendingUp, TrendingDown, AlertTriangle, Target, PieChart,
  CreditCard, FileText, Settings, Download,
  ChevronLeft, ChevronRight, Wallet, BarChart3, Receipt,
  ArrowDownLeft, ArrowUpFromLine, Clock, CheckCircle2, CircleDot,
  Search, Banknote, Building2, Briefcase, Tag, Users, Trash2, Pencil, Plus, Link2,
  Send, ThumbsUp, ThumbsDown, ArrowRight, Layers, Sparkles, MessageSquare
} from 'lucide-react';
import { LivvFinanceView } from '../components/finance/LivvFinanceView';
import { LivvPartnersConfig } from '../components/finance/LivvPartnersConfig';
import { FinanceAssistant } from '../components/finance/FinanceAssistant';
import { FinanceChat } from '../components/finance/FinanceChat';
import { LivvFinanceDashboard } from '../components/finance/LivvFinanceDashboard';
import {
  useFinance,
  type IncomeEntry,
  type Installment,
  type ExpenseEntry,
  type Budget,
  type CreateIncomeData,
  type CreateExpenseData,
  type CreateBudgetData,
} from '../context/FinanceContext';
import { useProjects } from '../context/ProjectsContext';
import { supabase } from '../lib/supabase';
import { useClients } from '../context/ClientsContext';
import type { Proposal, ProposalStatus } from '../types/crm';
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

type FinanceTab = 'dashboard' | 'ingresos' | 'gastos' | 'budgets' | 'propuestas' | 'proyectos' | 'livv' | 'config';

// ─── Formatters ───────────────────────────────────────────────────

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

const fmtPercent = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

// Month boundary helpers
const getMonthBounds = (year: number, month: number) => {
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const now = new Date();
const INITIAL_MONTH_BOUNDS = getMonthBounds(now.getFullYear(), now.getMonth());

const fmtDate = (d: string) => {
  const date = new Date(d + 'T12:00:00');
  return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ─── Expense categories ───────────────────────────────────────────

const EXPENSE_CATEGORIES: Record<string, { icon: typeof BarChart3; color: string }> = {
  'Software': { icon: Building2, color: 'text-blue-500 bg-blue-50 dark:bg-blue-500/10' },
  'Talent': { icon: Users, color: 'text-violet-500 bg-violet-50 dark:bg-violet-500/10' },
  'Marketing': { icon: Target, color: 'text-amber-500 bg-amber-50 dark:bg-amber-500/10' },
  'Operations': { icon: Briefcase, color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' },
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
    paid: 'Paid', partial: 'Partial', pending: 'Pending', overdue: 'Overdue',
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
    incomes, incomesLoading, createIncome, updateIncome, updateInstallment, deleteIncome,
    expenses, expensesLoading, createExpense, updateExpense, deleteExpense, refreshExpenses,
    budgets, budgetsLoading, createBudget, updateBudget, deleteBudget,
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

  // Auto-renew recurring expenses on mount (once per session)
  const renewedRef = useRef(false);
  useEffect(() => {
    if (renewedRef.current || expensesLoading) return;
    renewedRef.current = true;
    supabase.rpc('renew_recurring_expenses').then(({ data, error }) => {
      if (error) { if (import.meta.env.DEV) console.warn('Recurring renewal error:', error.message); return; }
      if (data && data > 0) {
        if (import.meta.env.DEV) console.log(`[Finance] Renewed ${data} recurring expenses`);
        refreshExpenses();
      }
    });
  }, [expensesLoading]);

  const [activeTab, setActiveTab] = useState<FinanceTab>('dashboard');
  const [incomeSearch, setIncomeSearch] = useState('');
  const [incomeStatusFilter, setIncomeStatusFilter] = useState<'all' | 'pending' | 'paid' | 'overdue'>('all');
  const [incomeDateFrom, setIncomeDateFrom] = useState('');
  const [incomeDateTo, setIncomeDateTo] = useState('');
  const [expenseSearch, setExpenseSearch] = useState('');
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<string>('all');
  const [expenseViewMonth, setExpenseViewMonth] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [expenseDateFrom, setExpenseDateFrom] = useState(INITIAL_MONTH_BOUNDS.from);
  const [expenseDateTo, setExpenseDateTo] = useState(INITIAL_MONTH_BOUNDS.to);
  const [expenseCustomDateRange, setExpenseCustomDateRange] = useState(false); // true when user picks custom dates
  const [expandedIncome, setExpandedIncome] = useState<string | null>(null);

  // Slide panel state
  const [isEntryOpen, setIsEntryOpen] = useState(false);
  const [entryType, setEntryType] = useState<'income' | 'expense' | 'budget'>('income');
  const [entryError, setEntryError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingIncomeId, setEditingIncomeId] = useState<string | null>(null);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  // When materializing a projected (virtual) recurring row, this holds the source id
  // so the new INSERT can be linked back to the original recurring expense.
  const [materializingSourceId, setMaterializingSourceId] = useState<string | null>(null);

  // AI assistant state
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);

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
    budget_id: '',
  });

  // Budget form state
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [budgetSearch, setBudgetSearch] = useState('');
  const [budgetCategoryFilter, setBudgetCategoryFilter] = useState<string>('all');
  const [expandedBudgetId, setExpandedBudgetId] = useState<string | null>(null);
  const [budgetForm, setBudgetForm] = useState({
    name: '', description: '', allocated_amount: '',
    category: '', color: '#3b82f6',
    period: 'monthly' as 'monthly' | 'quarterly' | 'yearly' | 'one-time',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
  });

  // ─── Project tasks cache for linking installments to deliveries ───
  const [projectTasksCache, setProjectTasksCache] = useState<Record<string, { id: string; title: string }[]>>({});
  const fetchProjectTasks = useCallback(async (projectId: string) => {
    if (projectTasksCache[projectId]) return;
    const { data } = await supabase
      .from('tasks')
      .select('id,title')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });
    if (data) setProjectTasksCache(prev => ({ ...prev, [projectId]: data }));
  }, [projectTasksCache]);

  // ─── Proposals data ─────────────────────────────────────────
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(true);
  const [proposalStatusFilter, setProposalStatusFilter] = useState<'all' | ProposalStatus>('all');
  const [leads, setLeads] = useState<{ id: string; name: string; company?: string; email?: string }[]>([]);
  const [editingProposalId, setEditingProposalId] = useState<string | null>(null);

  useEffect(() => {
    const fetchProposals = async () => {
      setProposalsLoading(true);
      const { data } = await supabase
        .from('proposals')
        .select('id,tenant_id,title,status,pricing_total,client_id,lead_id,currency,sent_at,approved_at,rejected_at,created_at,updated_at')
        .order('created_at', { ascending: false });
      setProposals((data as Proposal[]) || []);
      setProposalsLoading(false);
    };
    const fetchLeads = async () => {
      const { data } = await supabase
        .from('leads')
        .select('id,name,company,email')
        .order('name');
      setLeads(data || []);
    };
    fetchProposals();
    fetchLeads();
  }, []);

  const proposalMetrics = useMemo(() => {
    const sent = proposals.filter(p => p.status === 'sent');
    const approved = proposals.filter(p => p.status === 'approved');
    const rejected = proposals.filter(p => p.status === 'rejected');
    const draft = proposals.filter(p => p.status === 'draft');
    const potentialRevenue = sent.reduce((s, p) => s + (p.pricing_total || 0), 0);
    const confirmedRevenue = approved.reduce((s, p) => s + (p.pricing_total || 0), 0);
    const lostRevenue = rejected.reduce((s, p) => s + (p.pricing_total || 0), 0);
    const responded = sent.length + approved.length + rejected.length;
    const conversionRate = responded > 0 ? (approved.length / responded) * 100 : 0;
    return { sent, approved, rejected, draft, potentialRevenue, confirmedRevenue, lostRevenue, conversionRate };
  }, [proposals]);

  const filteredProposals = useMemo(() => {
    if (proposalStatusFilter === 'all') return proposals;
    return proposals.filter(p => p.status === proposalStatusFilter);
  }, [proposals, proposalStatusFilter]);

  const updateProposalField = useCallback(async (id: string, field: string, value: any) => {
    await supabase.from('proposals').update({ [field]: value }).eq('id', id);
    setProposals(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  }, []);

  const updateProposalStatus = useCallback(async (id: string, status: ProposalStatus) => {
    const updates: Record<string, any> = { status };
    if (status === 'approved') updates.approved_at = new Date().toISOString();
    if (status === 'rejected') updates.rejected_at = new Date().toISOString();
    await supabase.from('proposals').update(updates).eq('id', id);
    setProposals(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));

    // Auto-sync: when approved and linked to a lead, convert lead to client
    if (status === 'approved') {
      const proposal = proposals.find(p => p.id === id);
      if (proposal?.lead_id && !proposal.client_id) {
        const lead = leads.find(l => l.id === proposal.lead_id);
        if (lead) {
          // Check if a client with this email already exists
          const existingClient = lead.email ? clients.find((c: any) => c.email === lead.email) : null;
          if (existingClient) {
            // Link to existing client
            await supabase.from('proposals').update({ client_id: existingClient.id }).eq('id', id);
            setProposals(prev => prev.map(p => p.id === id ? { ...p, client_id: existingClient.id } : p));
          } else {
            // Create new client from lead data
            const { data: newClient } = await supabase.from('clients').insert({
              name: lead.name,
              email: lead.email || null,
              company: lead.company || null,
              status: 'active',
            }).select('id').single();
            if (newClient) {
              await supabase.from('proposals').update({ client_id: newClient.id }).eq('id', id);
              setProposals(prev => prev.map(p => p.id === id ? { ...p, client_id: newClient.id } : p));
            }
          }
          // Update lead status
          await supabase.from('leads').update({ proposal_status: 'approved', proposal_approved_at: new Date().toISOString() }).eq('id', proposal.lead_id);
        }
      }
    }
  }, [proposals, leads, clients]);

  const convertProposalToIncome = useCallback((proposal: Proposal) => {
    setIncomeForm({
      client_id: proposal.client_id || '',
      project_id: '',
      concept: proposal.title,
      total_amount: String(proposal.pricing_total || 0),
      num_installments: '1',
      due_date: new Date().toISOString().split('T')[0],
    });
    setEditingIncomeId(null);
    setEntryType('income');
    setEntryError(null);
    setIsEntryOpen(true);
  }, []);

  // ─── Computed Data ────────────────────────────────────────────

  const totalPaidIncome = useMemo(() =>
    incomes.reduce((sum: number, inc: IncomeEntry) =>
      sum + (inc.installments || []).filter((i: Installment) => i.status === 'paid').reduce((s: number, i: Installment) => s + i.amount, 0), 0
    ), [incomes]);

  const totalPendingIncome = useMemo(() =>
    incomes.reduce((sum: number, inc: IncomeEntry) =>
      sum + (inc.installments || []).filter((i: Installment) => i.status !== 'paid').reduce((s: number, i: Installment) => s + i.amount, 0), 0
    ), [incomes]);

  const totalOverdueIncome = useMemo(() =>
    incomes.reduce((sum: number, inc: IncomeEntry) =>
      sum + (inc.installments || []).filter((i: Installment) => i.status === 'overdue').reduce((s: number, i: Installment) => s + i.amount, 0), 0
    ), [incomes]);

  const overdueInstallmentCount = useMemo(() =>
    incomes.reduce((count: number, inc: IncomeEntry) =>
      count + (inc.installments || []).filter((i: Installment) => i.status === 'overdue').length, 0
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
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
      const key = inc.project_name || 'No Project';
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
    let result = incomes;
    if (incomeStatusFilter === 'pending') {
      result = result.filter((inc: IncomeEntry) => inc.status === 'pending' || inc.status === 'partial');
    } else if (incomeStatusFilter !== 'all') {
      result = result.filter((inc: IncomeEntry) => inc.status === incomeStatusFilter);
    }
    if (incomeDateFrom) {
      result = result.filter((inc: IncomeEntry) => (inc.due_date || inc.created_at?.split('T')[0] || '') >= incomeDateFrom);
    }
    if (incomeDateTo) {
      result = result.filter((inc: IncomeEntry) => (inc.due_date || inc.created_at?.split('T')[0] || '') <= incomeDateTo);
    }
    if (incomeSearch) {
      const q = incomeSearch.toLowerCase();
      result = result.filter((inc: IncomeEntry) =>
        inc.client_name.toLowerCase().includes(q) ||
        inc.project_name.toLowerCase().includes(q) ||
        inc.concept.toLowerCase().includes(q)
      );
    }
    return result;
  }, [incomeSearch, incomeStatusFilter, incomeDateFrom, incomeDateTo, incomes]);

  const filteredExpenses = useMemo(() => {
    // Project recurring expenses as virtual rows for the current and future months
    // when no real DB copy exists yet. The DB-side RPC backfills past/current months,
    // but it runs once per session and can lag — projecting client-side guarantees
    // the user always sees a row to act on (and to materialize via Edit if they need
    // to tweak the amount this month).
    let working: ExpenseEntry[] = expenses;
    if (!expenseCustomDateRange) {
      const today = new Date();
      const todayMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const viewMonthStart = new Date(expenseViewMonth.year, expenseViewMonth.month, 1);
      if (viewMonthStart >= todayMonthStart) {
        const monthFirst = `${expenseViewMonth.year}-${String(expenseViewMonth.month + 1).padStart(2, '0')}-01`;
        const projected: ExpenseEntry[] = expenses
          .filter((e) => e.recurring && !e.recurring_source_id && e.date <= monthFirst)
          // Skip if a real DB copy already exists in the viewed range.
          .filter((src) => !expenses.some((e) =>
            e.recurring_source_id === src.id &&
            e.date >= expenseDateFrom && e.date <= expenseDateTo
          ))
          // Skip if the source itself already lives in the viewed range — its
          // own creation month should display the original, not a projection.
          .filter((src) => !(src.date >= expenseDateFrom && src.date <= expenseDateTo))
          .map((src) => ({
            ...src,
            id: `proj-${src.id}-${monthFirst}`,
            date: monthFirst,
            recurring: false,
            recurring_source_id: src.id,
            status: 'pending',
            last_renewed_at: null,
          }));
        working = [...expenses, ...projected];
      }
    }

    let result = working;
    if (expenseCategoryFilter !== 'all') {
      result = result.filter((e: ExpenseEntry) => e.category === expenseCategoryFilter);
    }
    if (expenseDateFrom) {
      result = result.filter((e: ExpenseEntry) => e.date >= expenseDateFrom);
    }
    if (expenseDateTo) {
      result = result.filter((e: ExpenseEntry) => e.date <= expenseDateTo);
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
  }, [expenseSearch, expenseCategoryFilter, expenseDateFrom, expenseDateTo, expenseCustomDateRange, expenseViewMonth, expenses]);

  // ─── Budget Computed Data ──────────────────────────────────────

  const budgetSpending = useMemo(() => {
    const map: Record<string, { spent: number; count: number }> = {};
    expenses.forEach((e: ExpenseEntry) => {
      if (e.budget_id) {
        if (!map[e.budget_id]) map[e.budget_id] = { spent: 0, count: 0 };
        map[e.budget_id].spent += e.amount;
        map[e.budget_id].count += 1;
      }
    });
    return map;
  }, [expenses]);

  const totalAllocated = useMemo(() => budgets.filter(b => b.is_active).reduce((s, b) => s + b.allocated_amount, 0), [budgets]);
  const totalBudgetSpent = useMemo(() => budgets.filter(b => b.is_active).reduce((s, b) => s + (budgetSpending[b.id]?.spent || 0), 0), [budgets, budgetSpending]);

  const budgetCategories = useMemo(() => {
    const cats = new Set<string>();
    budgets.forEach(b => { if (b.category) cats.add(b.category); });
    return Array.from(cats).sort();
  }, [budgets]);

  const filteredBudgets = useMemo(() => {
    let result = [...budgets];
    if (budgetCategoryFilter !== 'all') {
      result = result.filter(b => b.category === budgetCategoryFilter);
    }
    if (budgetSearch) {
      const q = budgetSearch.toLowerCase();
      result = result.filter(b =>
        b.name.toLowerCase().includes(q) ||
        b.category.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q)
      );
    }
    return result;
  }, [budgets, budgetCategoryFilter, budgetSearch]);

  // ─── Form Handlers ────────────────────────────────────────────

  const resetIncomeForm = useCallback(() => {
    setIncomeForm({ client_id: '', project_id: '', concept: '', total_amount: '', num_installments: '1', due_date: new Date().toISOString().split('T')[0] });
  }, []);

  const resetExpenseForm = useCallback(() => {
    setExpenseForm({ concept: '', category: 'Software', amount: '', vendor: '', project_id: '', date: new Date().toISOString().split('T')[0], recurring: false, status: 'pending', budget_id: '' });
  }, []);

  const openIncomeForm = useCallback(() => {
    resetIncomeForm();
    setEditingIncomeId(null);
    setEntryType('income');
    setEntryError(null);
    setIsEntryOpen(true);
  }, [resetIncomeForm]);

  const openExpenseForm = useCallback(() => {
    resetExpenseForm();
    setEditingExpenseId(null);
    setEntryType('expense');
    setEntryError(null);
    setIsEntryOpen(true);
  }, [resetExpenseForm]);

  const openEditIncome = useCallback((inc: IncomeEntry) => {
    setIncomeForm({
      client_id: inc.client_id || '',
      project_id: inc.project_id || '',
      concept: inc.concept,
      total_amount: String(inc.total_amount),
      num_installments: String((inc.installments || []).length || 1),
      due_date: inc.due_date || new Date().toISOString().split('T')[0],
    });
    setEditingIncomeId(inc.id);
    setEntryType('income');
    setEntryError(null);
    setIsEntryOpen(true);
  }, []);

  const openEditExpense = useCallback((exp: ExpenseEntry) => {
    const isProjected = exp.id.startsWith('proj-');
    setExpenseForm({
      concept: exp.concept,
      category: exp.category,
      amount: String(exp.amount),
      vendor: exp.vendor || '',
      project_id: exp.project_id || '',
      date: exp.date,
      // Projected/materialized copies are themselves not recurring — the source drives renewal.
      recurring: isProjected ? false : exp.recurring,
      status: exp.status as 'paid' | 'pending',
      budget_id: exp.budget_id || '',
    });
    if (isProjected) {
      setEditingExpenseId(null);
      setMaterializingSourceId(exp.recurring_source_id || null);
    } else {
      setEditingExpenseId(exp.id);
      setMaterializingSourceId(null);
    }
    setEntryType('expense');
    setEntryError(null);
    setIsEntryOpen(true);
  }, []);

  const closeForm = useCallback(() => {
    setIsEntryOpen(false);
    setEntryError(null);
    setEditingIncomeId(null);
    setEditingExpenseId(null);
    setEditingBudgetId(null);
    setMaterializingSourceId(null);
  }, []);

  const resetBudgetForm = useCallback(() => {
    setBudgetForm({ name: '', description: '', allocated_amount: '', category: '', color: '#3b82f6', period: 'monthly', start_date: new Date().toISOString().split('T')[0], end_date: '' });
  }, []);

  const openBudgetForm = useCallback(() => {
    resetBudgetForm();
    setEditingBudgetId(null);
    setEntryType('budget');
    setEntryError(null);
    setIsEntryOpen(true);
  }, [resetBudgetForm]);

  const openEditBudget = useCallback((b: Budget) => {
    setBudgetForm({
      name: b.name,
      description: b.description || '',
      allocated_amount: String(b.allocated_amount),
      category: b.category || '',
      color: b.color || '#3b82f6',
      period: b.period,
      start_date: b.start_date || '',
      end_date: b.end_date || '',
    });
    setEditingBudgetId(b.id);
    setEntryType('budget');
    setEntryError(null);
    setIsEntryOpen(true);
  }, []);

  const handleSubmitIncome = useCallback(async () => {
    if (!incomeForm.concept.trim()) { setEntryError('Enter a concept.'); return; }
    if (!incomeForm.total_amount || Number(incomeForm.total_amount) <= 0) { setEntryError('Amount must be greater than 0.'); return; }

    setIsSubmitting(true);
    setEntryError(null);

    try {
      // Resolve client/project names
      const client = clients.find((c: any) => c.id === incomeForm.client_id);
      const project = projects.find((p: any) => p.id === incomeForm.project_id);

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out. Please try again.')), 15000)
      );

      if (editingIncomeId) {
        const updates: Partial<IncomeEntry> = {
          client_id: incomeForm.client_id || null,
          project_id: incomeForm.project_id || null,
          client_name: client?.name || (incomeForm.client_id ? 'Client' : 'No client'),
          project_name: project?.title || (incomeForm.project_id ? 'Project' : 'No project'),
          concept: incomeForm.concept.trim(),
        };
        if (import.meta.env.DEV) console.log('[Finance] Updating income:', editingIncomeId, updates);
        await Promise.race([updateIncome(editingIncomeId, updates), timeout]);
      } else {
        const data: CreateIncomeData = {
          client_id: incomeForm.client_id || null,
          project_id: incomeForm.project_id || null,
          client_name: client?.name || (incomeForm.client_id ? 'Client' : 'No client'),
          project_name: project?.title || (incomeForm.project_id ? 'Project' : 'No project'),
          concept: incomeForm.concept.trim(),
          total_amount: Number(incomeForm.total_amount),
          due_date: incomeForm.due_date || new Date().toISOString().split('T')[0],
          num_installments: Math.max(1, parseInt(incomeForm.num_installments) || 1),
        };
        if (import.meta.env.DEV) console.log('[Finance] Creating income:', data);
        await Promise.race([createIncome(data), timeout]);
      }

      closeForm();
    } catch (err: any) {
      console.error('[Finance] Error saving income:', err);
      setEntryError(err?.message || 'Error saving income. Check the console.');
    } finally {
      setIsSubmitting(false);
    }
  }, [incomeForm, clients, projects, createIncome, updateIncome, editingIncomeId, closeForm]);

  const handleSubmitExpense = useCallback(async () => {
    if (!expenseForm.concept.trim()) { setEntryError('Enter a concept.'); return; }
    if (!expenseForm.amount || Number(expenseForm.amount) <= 0) { setEntryError('Amount must be greater than 0.'); return; }
    if (!expenseForm.date) { setEntryError('Select a date.'); return; }

    setIsSubmitting(true);
    setEntryError(null);

    try {
      const project = projects.find((p: any) => p.id === expenseForm.project_id);

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out. Please try again.')), 15000)
      );

      if (editingExpenseId) {
        const updates: Partial<ExpenseEntry> = {
          category: expenseForm.category,
          concept: expenseForm.concept.trim(),
          amount: Number(expenseForm.amount),
          date: expenseForm.date,
          project_id: expenseForm.project_id || null,
          project_name: project?.title || 'General',
          vendor: expenseForm.vendor.trim(),
          recurring: expenseForm.recurring,
          status: expenseForm.status,
          budget_id: expenseForm.budget_id || null,
        };
        if (import.meta.env.DEV) console.log('[Finance] Updating expense:', editingExpenseId, updates);
        await Promise.race([updateExpense(editingExpenseId, updates), timeout]);
      } else {
        const data: CreateExpenseData = {
          category: expenseForm.category,
          concept: expenseForm.concept.trim(),
          amount: Number(expenseForm.amount),
          date: expenseForm.date,
          project_id: expenseForm.project_id || null,
          project_name: project?.title || 'General',
          vendor: expenseForm.vendor.trim(),
          // Materialized copies of a recurring source aren't themselves recurring —
          // the source row drives renewal.
          recurring: materializingSourceId ? false : expenseForm.recurring,
          status: expenseForm.status,
          budget_id: expenseForm.budget_id || null,
          recurring_source_id: materializingSourceId,
        };
        if (import.meta.env.DEV) console.log('[Finance] Creating expense:', data);
        await Promise.race([createExpense(data), timeout]);
      }

      closeForm();
    } catch (err: any) {
      console.error('[Finance] Error saving expense:', err);
      setEntryError(err?.message || 'Error saving expense. Check the console.');
    } finally {
      setIsSubmitting(false);
    }
  }, [expenseForm, projects, createExpense, updateExpense, editingExpenseId, materializingSourceId, closeForm]);

  const handleSubmitBudget = useCallback(async () => {
    if (!budgetForm.name.trim()) { setEntryError('Enter a name.'); return; }
    if (!budgetForm.allocated_amount || Number(budgetForm.allocated_amount) <= 0) { setEntryError('Amount must be greater than 0.'); return; }

    setIsSubmitting(true);
    setEntryError(null);

    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out. Please try again.')), 15000)
      );

      if (editingBudgetId) {
        const updates: Partial<Budget> = {
          name: budgetForm.name.trim(),
          description: budgetForm.description.trim(),
          allocated_amount: Number(budgetForm.allocated_amount),
          category: budgetForm.category.trim(),
          color: budgetForm.color,
          period: budgetForm.period,
          start_date: budgetForm.start_date || null,
          end_date: budgetForm.end_date || null,
        };
        await Promise.race([updateBudget(editingBudgetId, updates), timeout]);
      } else {
        const data: CreateBudgetData = {
          name: budgetForm.name.trim(),
          description: budgetForm.description.trim(),
          allocated_amount: Number(budgetForm.allocated_amount),
          category: budgetForm.category.trim(),
          color: budgetForm.color,
          period: budgetForm.period,
          start_date: budgetForm.start_date || null,
          end_date: budgetForm.end_date || null,
        };
        await Promise.race([createBudget(data), timeout]);
      }

      closeForm();
    } catch (err: any) {
      console.error('[Finance] Error saving budget:', err);
      setEntryError(err?.message || 'Error saving budget.');
    } finally {
      setIsSubmitting(false);
    }
  }, [budgetForm, createBudget, updateBudget, editingBudgetId, closeForm]);

  const handleDeleteBudget = useCallback(async (id: string) => {
    try {
      await deleteBudget(id);
    } catch (err) {
      console.error('Error deleting budget:', err);
    }
  }, [deleteBudget]);

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
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Restricted Access</h3>
        <p className="text-zinc-400 text-xs max-w-xs">You do not have permission to access financial data.</p>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="max-w-[1600px] mx-auto space-y-5 animate-in fade-in duration-500 pt-4 pb-16">

      {/* ─── Header ──────────────────────────────────────────────
          On the Dashboard tab the Livv editorial hero owns the title + action
          toolbar, so we collapse this header to a tiny bar (just the tabs +
          export). On every other tab we keep the original h1 + action set. */}
      <div className={`flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-5 ${activeTab === 'dashboard' ? '' : 'border-b border-zinc-100 dark:border-zinc-800/60'}`}>
        {activeTab !== 'dashboard' && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-zinc-400 text-[10px] font-semibold uppercase tracking-[0.15em] mb-2">
              <div className="w-1 h-1 rounded-full bg-emerald-500" />
              Finance Module
            </div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Finance</h1>
            <p className="text-zinc-400 text-xs max-w-md">Track income, expenses, margins, and team liquidity.</p>
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
          {hasPermission('finance', 'create') && activeTab !== 'dashboard' && (
            <>
              <button onClick={() => setIsAssistantOpen(true)}
                className="group flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium shadow-sm active:scale-[0.98] transition-all duration-200 text-white"
                style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)' }}
                title="Add an entry by describing it in natural language">
                <Sparkles size={14} strokeWidth={2.5} className="group-hover:rotate-12 transition-transform" />
                <span>Add with AI</span>
              </button>
              <button onClick={() => setIsChatOpen(true)}
                className="group flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium shadow-sm active:scale-[0.98] transition-all duration-200 border border-fuchsia-300 dark:border-fuchsia-500/40 text-fuchsia-700 dark:text-fuchsia-300 bg-white dark:bg-zinc-900 hover:bg-fuchsia-50/60 dark:hover:bg-fuchsia-500/10"
                title="Preguntale sobre tus finanzas">
                <MessageSquare size={14} strokeWidth={2.5} />
                <span>Preguntale</span>
              </button>
              <button onClick={openIncomeForm} className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium shadow-sm active:scale-[0.98] transition-all duration-200">
                <ArrowDownLeft size={14} strokeWidth={2.5} />
                <span>Income</span>
              </button>
              <button onClick={openExpenseForm} className="flex items-center gap-1.5 px-3.5 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg text-xs font-medium shadow-sm hover:opacity-90 active:scale-[0.98] transition-all duration-200">
                <ArrowUpFromLine size={14} strokeWidth={2.5} />
                <span>Expense</span>
              </button>
              <button onClick={openBudgetForm} className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium shadow-sm active:scale-[0.98] transition-all duration-200">
                <Wallet size={14} strokeWidth={2.5} />
                <span>Budget</span>
              </button>
            </>
          )}
          {activeTab !== 'dashboard' && (
            <button className="flex items-center gap-1.5 px-3.5 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-lg text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all duration-200">
              <Download size={14} />
              <span>Export</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── Tabs ──────────────────────────────────────────────── */}
      <div className="flex overflow-x-auto no-scrollbar gap-0.5 p-0.5 bg-zinc-100/60 dark:bg-zinc-900/60 rounded-lg w-fit">
        {([
          { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
          { id: 'livv', label: 'LIVV', icon: Layers },
          { id: 'ingresos', label: 'Income', icon: ArrowDownLeft },
          { id: 'gastos', label: 'Expenses', icon: Receipt },
          { id: 'budgets', label: 'Budgets', icon: Wallet },
          { id: 'propuestas', label: 'Proposals', icon: FileText },
          { id: 'proyectos', label: 'Projects P&L', icon: Target },
          { id: 'config', label: 'Settings', icon: Settings },
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

      {/* ═══════════════ DASHBOARD (Livv editorial) ═══════════════ */}
      {activeTab === 'dashboard' && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
          <LivvFinanceDashboard
            incomes={incomes}
            expenses={expenses}
            budgets={budgets}
            liquidityData={liquidityData}
            projectPnL={projectPnL}
            currentBalance={currentBalance}
            projection90d={projection90d}
            margin={margin}
            totalPaidIncome={totalPaidIncome}
            totalExpensesPaid={totalExpensesPaid}
            totalExpensesPending={totalExpensesPending}
            onAddIncome={openIncomeForm}
            onAddExpense={openExpenseForm}
            onOpenAIAssistant={() => setIsAssistantOpen(true)}
            onOpenAIChat={() => setIsChatOpen(true)}
            onMarkInstallmentPaid={handleMarkInstallmentPaid}
            onMarkExpensePaid={async (exp) => { await updateExpense(exp.id, { status: 'paid' }); }}
            onJumpToTab={setActiveTab}
            canCreate={hasPermission('finance', 'create')}
          />
        </div>
      )}

      {/* ═══════════════ LEGACY DASHBOARD (replaced by LivvFinanceDashboard) ═══════════════
          Kept disabled below by `false` so the old code is one-line-flip away if we
          need to revert. Will be removed after the editorial layout is approved. */}
      {false && (
        <div className="space-y-5 animate-in slide-in-from-bottom-2 duration-500">

          {/* Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { title: 'Overall Balance', value: fmtCurrency(currentBalance), change: incomes.length > 0 ? fmtPercent(margin > 0 ? 12.4 : -5.2) : null, trend: 'up' as const, status: currentBalance >= 0 ? 'positive' as const : 'negative' as const, icon: Wallet, accent: 'emerald' },
              { title: 'Available Liquidity', value: fmtCurrency(liquidez), change: incomes.length > 0 ? fmtPercent(8.2) : null, trend: 'up' as const, status: liquidez >= 0 ? 'positive' as const : 'negative' as const, icon: Banknote, accent: 'blue' },
              { title: '90-Day Forecast', value: fmtCurrency(projection90d), change: null, trend: 'up' as const, status: 'neutral' as const, icon: TrendingUp, accent: 'violet' },
              { title: 'Operating Margin', value: `${margin.toFixed(1)}%`, change: incomes.length > 0 ? fmtPercent(3.1) : null, trend: 'up' as const, status: margin >= 0 ? 'positive' as const : 'negative' as const, icon: PieChart, accent: 'amber' },
              { title: 'Potential Revenue', value: fmtCurrency(proposalMetrics.potentialRevenue), change: proposalMetrics.sent.length > 0 ? `${proposalMetrics.sent.length} pending` : null, trend: 'up' as const, status: proposalMetrics.potentialRevenue > 0 ? 'positive' as const : 'neutral' as const, icon: FileText, accent: 'indigo' },
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
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Liquidity Timeline</h3>
                  <p className="text-[10px] text-zinc-400 mt-0.5">Income vs expenses by month</p>
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
                        <Bar dataKey="ingresos" name="Income" fill="#34d399" radius={[4, 4, 0, 0]} barSize={24} />
                        <Bar dataKey="gastos" name="Expenses" fill="#fb7185" radius={[4, 4, 0, 0]} barSize={24} />
                        <Line type="monotone" dataKey="balance" name="Balance" stroke="#818cf8" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3, fill: '#818cf8' }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex items-center gap-4 mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/40">
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-400"><div className="w-3 h-2 rounded-sm bg-emerald-400" /> Income</div>
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-400"><div className="w-3 h-2 rounded-sm bg-rose-400" /> Expenses</div>
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-400"><div className="w-3 h-0.5 border-t-2 border-dashed border-indigo-400" style={{ width: 12 }} /> Balance</div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-[220px] text-zinc-400">
                  <BarChart3 size={28} className="mb-2 text-zinc-300" />
                  <p className="text-xs">Add income and expenses to see the timeline.</p>
                </div>
              )}
            </div>

            {/* Expense Breakdown */}
            <div className="p-5 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Expenses by Category</h3>
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
                  <p className="text-xs">No expenses recorded.</p>
                </div>
              )}
              {expenses.length > 0 && (
                <div className="mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800/40 space-y-2">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-zinc-400">Recurring</span>
                    <span className="font-medium text-zinc-700 dark:text-zinc-200">
                      {fmtCurrency(expenses.filter((e: ExpenseEntry) => e.recurring).reduce((s: number, e: ExpenseEntry) => s + e.amount, 0))}/mo
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-zinc-400">Pending</span>
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
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Upcoming Payments</h3>
                <button onClick={() => setActiveTab('ingresos')} className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 flex items-center gap-0.5">
                  View all <ChevronRight size={10} />
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
                <p className="text-xs text-zinc-400 text-center py-6">Add an income entry to see upcoming payments.</p>
              )}
            </div>

            {/* Recent Expenses */}
            <div className="p-5 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Recent Expenses</h3>
                <button onClick={() => setActiveTab('gastos')} className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 flex items-center gap-0.5">
                  View all <ChevronRight size={10} />
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
                <p className="text-xs text-zinc-400 text-center py-6">Add an expense to see it here.</p>
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
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">Total Invoiced</div>
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {fmtCurrency(incomes.reduce((s: number, i: IncomeEntry) => s + i.total_amount, 0))}
              </div>
            </div>
            <div className="p-3 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">Collected</div>
              <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{fmtCurrency(totalPaidIncome)}</div>
            </div>
            <div className="p-3 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">Pending</div>
              <div className="text-sm font-semibold text-amber-600 dark:text-amber-400">{fmtCurrency(totalPendingIncome)}</div>
            </div>
            <div className="p-3 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">Overdue</div>
              <div className={`text-sm font-semibold ${totalOverdueIncome > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
                {fmtCurrency(totalOverdueIncome)}
                {overdueInstallmentCount > 0 && <span className="text-[10px] font-normal text-rose-400 ml-1">({overdueInstallmentCount} installments)</span>}
              </div>
            </div>
          </div>

          {/* Status filter tabs */}
          <div className="flex gap-1 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60 p-1">
            {([
              { key: 'all' as const, label: 'All', count: incomes.length },
              { key: 'pending' as const, label: 'To collect', count: incomes.filter(i => i.status === 'pending' || i.status === 'partial').length },
              { key: 'paid' as const, label: 'Collected', count: incomes.filter(i => i.status === 'paid').length },
              { key: 'overdue' as const, label: 'Overdue', count: incomes.filter(i => i.status === 'overdue').length },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setIncomeStatusFilter(tab.key)}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  incomeStatusFilter === tab.key
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                }`}
              >
                {tab.label}
                {tab.count > 0 && <span className={`ml-1.5 text-[10px] ${incomeStatusFilter === tab.key ? 'opacity-60' : 'opacity-40'}`}>{tab.count}</span>}
              </button>
            ))}
          </div>

          {/* Income breakdown chart + search */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* Income by Source Chart */}
            <div className="p-5 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Income by Service</h3>
                  <p className="text-[10px] text-zinc-400 mt-0.5">Distribution by project</p>
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
                                    <p className="text-zinc-500">{fmtCurrency(d.amount)} · {d.count} income{d.count > 1 ? 's' : ''}</p>
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
                  <p className="text-xs text-center">Create income entries to see<br />the distribution by service.</p>
                </div>
              )}
            </div>

            {/* Search + quick stats */}
            <div className="lg:col-span-2 space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input type="text" value={incomeSearch} onChange={e => setIncomeSearch(e.target.value)}
                    placeholder="Search by client, project, or concept..."
                    className="w-full pl-9 pr-4 py-2.5 text-xs bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/40 transition-all" />
                </div>
                <div className="flex items-center gap-1.5">
                  <input type="date" value={incomeDateFrom} onChange={e => setIncomeDateFrom(e.target.value)}
                    className="px-2.5 py-2 text-[11px] bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/40 transition-all text-zinc-600 dark:text-zinc-300" />
                  <span className="text-[10px] text-zinc-400">to</span>
                  <input type="date" value={incomeDateTo} onChange={e => setIncomeDateTo(e.target.value)}
                    className="px-2.5 py-2 text-[11px] bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/40 transition-all text-zinc-600 dark:text-zinc-300" />
                  {(incomeDateFrom || incomeDateTo) && (
                    <button onClick={() => { setIncomeDateFrom(''); setIncomeDateTo(''); }}
                      className="px-2 py-2 text-[10px] font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Collection progress */}
              {incomes.length > 0 && (
                <div className="p-4 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Collection progress</span>
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
                    <span>Collected: {fmtCurrency(totalPaidIncome)}</span>
                    <span>Pending: {fmtCurrency(totalPendingIncome)}</span>
                  </div>
                </div>
              )}

              {/* Top clients mini-list */}
              {incomes.length > 0 && (
                <div className="p-4 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-2.5">Top Clients</h4>
                  <div className="space-y-2">
                    {(() => {
                      const clientMap: Record<string, number> = {};
                      incomes.forEach((inc: IncomeEntry) => {
                        const key = inc.client_name || 'No client';
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
                <p className="text-zinc-400 text-[10px] font-medium uppercase tracking-wider">Loading income...</p>
              </div>
            ) : filteredIncomes.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-10 gap-2">
                <ArrowDownLeft size={24} className="text-zinc-300" />
                <p className="text-zinc-400 text-xs">{incomeSearch ? 'No results.' : 'No income recorded. Create the first one with the "Income" button.'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead>
                    <tr className="bg-zinc-50/50 dark:bg-zinc-800/20">
                      <th className="px-5 py-2.5 text-left text-[10px] font-medium text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/60">Client / Project</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-medium text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/60">Concept</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-medium text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/60">Total</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-medium text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/60">Collected</th>
                      <th className="px-4 py-2.5 text-center text-[10px] font-medium text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/60">Installments</th>
                      <th className="px-4 py-2.5 text-center text-[10px] font-medium text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/60">Status</th>
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
                            onClick={() => { setExpandedIncome(isExpanded ? null : inc.id); if (!isExpanded && inc.project_id) fetchProjectTasks(inc.project_id); }}>
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
                              <div className="flex items-center gap-0.5 justify-end">
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                                  <button onClick={(e) => { e.stopPropagation(); openEditIncome(inc); }}
                                    className="p-1 rounded text-zinc-300 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
                                    <Pencil size={12} />
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); handleDeleteIncome(inc.id); }}
                                    className="p-1 rounded text-zinc-300 hover:text-rose-500 transition-colors">
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                                <ChevronRight size={14} className={`text-zinc-300 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={7} className="bg-zinc-50/50 dark:bg-zinc-800/10 px-5 py-3">
                                <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-2">Installment Details</div>
                                <div className="space-y-1.5">
                                  {(inc.installments || []).map((inst: Installment) => (
                                    <div key={inst.id} className="flex items-center gap-3 p-2 rounded-lg bg-white dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800/40">
                                      <div className={`p-1 rounded ${inst.status === 'paid' ? 'bg-emerald-50 dark:bg-emerald-500/10' : inst.status === 'overdue' ? 'bg-rose-50 dark:bg-rose-500/10' : 'bg-amber-50 dark:bg-amber-500/10'}`}>
                                        {inst.status === 'paid' ? <CheckCircle2 size={12} className="text-emerald-500" /> :
                                         inst.status === 'overdue' ? <AlertTriangle size={12} className="text-rose-500" /> :
                                         <Clock size={12} className="text-amber-500" />}
                                      </div>
                                      <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300 w-20">Inst. {inst.number}</span>
                                      <span className="text-[11px] font-semibold text-zinc-900 dark:text-zinc-100 w-24">{fmtCurrency(inst.amount)}</span>
                                      <span className="text-[10px] text-zinc-400 w-28">Due: {fmtDate(inst.due_date)}</span>
                                      {inst.paid_date && <span className="text-[10px] text-emerald-500">Paid: {fmtDate(inst.paid_date)}</span>}
                                      {/* Linked delivery selector */}
                                      {inc.project_id && (
                                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                          <Link2 size={10} className="text-zinc-300 dark:text-zinc-600 flex-shrink-0" />
                                          <select
                                            value={inst.linked_task_id || ''}
                                            onChange={async (e) => {
                                              const taskId = e.target.value || null;
                                              await updateInstallment(inst.id, { linked_task_id: taskId } as any);
                                            }}
                                            className="text-[10px] bg-transparent border border-zinc-100 dark:border-zinc-700 rounded px-1.5 py-0.5 text-zinc-500 dark:text-zinc-400 max-w-[140px] truncate focus:outline-none focus:ring-1 focus:ring-indigo-200"
                                          >
                                            <option value="">No delivery link</option>
                                            {(projectTasksCache[inc.project_id] || []).map(t => (
                                              <option key={t.id} value={t.id}>{t.title}</option>
                                            ))}
                                          </select>
                                        </div>
                                      )}
                                      <div className="ml-auto flex items-center gap-2">
                                        <StatusBadge status={inst.status} />
                                        {inst.status !== 'paid' && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleMarkInstallmentPaid(inst); }}
                                            className="px-2 py-0.5 text-[10px] font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors"
                                          >
                                            Mark as paid
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
          {/* Summary strip — reflects filtered data */}
          {(() => {
            const filtPaid = filteredExpenses.filter((e: ExpenseEntry) => e.status === 'paid').reduce((s: number, e: ExpenseEntry) => s + e.amount, 0);
            const filtPending = filteredExpenses.filter((e: ExpenseEntry) => e.status === 'pending').reduce((s: number, e: ExpenseEntry) => s + e.amount, 0);
            const filtRecurring = filteredExpenses.filter((e: ExpenseEntry) => e.recurring).reduce((s: number, e: ExpenseEntry) => s + e.amount, 0);
            const monthLabel = !expenseCustomDateRange
              ? `${MONTH_NAMES[expenseViewMonth.month].slice(0, 3)} ${expenseViewMonth.year}`
              : 'Filtered';
            return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">Total Expenses · {monthLabel}</div>
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{fmtCurrency(filtPaid + filtPending)}</div>
            </div>
            <div className="p-3 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">Paid</div>
              <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{fmtCurrency(filtPaid)}</div>
            </div>
            <div className="p-3 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">Pending</div>
              <div className="text-sm font-semibold text-amber-600 dark:text-amber-400">{fmtCurrency(filtPending)}</div>
            </div>
            <div className="p-3 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">Recurring / month</div>
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{fmtCurrency(filtRecurring)}</div>
            </div>
          </div>
            );
          })()}

          {/* Filters */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input type="text" value={expenseSearch} onChange={e => setExpenseSearch(e.target.value)}
                  placeholder="Search expenses..."
                  className="w-full pl-9 pr-4 py-2.5 text-xs bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400 transition-all" />
              </div>
              <div className="flex items-center gap-1.5">
                {!expenseCustomDateRange ? (
                  <>
                    <button onClick={() => {
                      const prev = new Date(expenseViewMonth.year, expenseViewMonth.month - 1, 1);
                      const m = { year: prev.getFullYear(), month: prev.getMonth() };
                      setExpenseViewMonth(m);
                      const b = getMonthBounds(m.year, m.month);
                      setExpenseDateFrom(b.from);
                      setExpenseDateTo(b.to);
                    }} className="p-2 rounded-lg bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all">
                      <ChevronLeft size={14} className="text-zinc-500" />
                    </button>
                    <span className="px-3 py-2 text-[11px] font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-lg min-w-[120px] text-center">
                      {MONTH_NAMES[expenseViewMonth.month]} {expenseViewMonth.year}
                    </span>
                    <button onClick={() => {
                      const next = new Date(expenseViewMonth.year, expenseViewMonth.month + 1, 1);
                      const m = { year: next.getFullYear(), month: next.getMonth() };
                      setExpenseViewMonth(m);
                      const b = getMonthBounds(m.year, m.month);
                      setExpenseDateFrom(b.from);
                      setExpenseDateTo(b.to);
                    }} className="p-2 rounded-lg bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all">
                      <ChevronRight size={14} className="text-zinc-500" />
                    </button>
                    <button onClick={() => setExpenseCustomDateRange(true)}
                      className="px-2 py-2 text-[10px] font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
                      Custom
                    </button>
                  </>
                ) : (
                  <>
                    <input type="date" value={expenseDateFrom} onChange={e => setExpenseDateFrom(e.target.value)}
                      className="px-2.5 py-2 text-[11px] bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400 transition-all text-zinc-600 dark:text-zinc-300" />
                    <span className="text-[10px] text-zinc-400">to</span>
                    <input type="date" value={expenseDateTo} onChange={e => setExpenseDateTo(e.target.value)}
                      className="px-2.5 py-2 text-[11px] bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400 transition-all text-zinc-600 dark:text-zinc-300" />
                    <button onClick={() => {
                      setExpenseCustomDateRange(false);
                      const m = { year: now.getFullYear(), month: now.getMonth() };
                      setExpenseViewMonth(m);
                      const b = getMonthBounds(m.year, m.month);
                      setExpenseDateFrom(b.from);
                      setExpenseDateTo(b.to);
                    }} className="px-2 py-2 text-[10px] font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
                      Reset
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-1 overflow-x-auto no-scrollbar">
              {['all', ...Object.keys(EXPENSE_CATEGORIES)].map(cat => (
                <button key={cat} onClick={() => setExpenseCategoryFilter(cat)}
                  className={`px-3 py-2 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all
                    ${expenseCategoryFilter === cat
                      ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm'
                      : 'bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700'
                    }`}>
                  {cat === 'all' ? 'All' : cat}
                </button>
              ))}
            </div>
          </div>

          {/* Expenses list */}
          <div className="bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60 overflow-hidden">
            {expensesLoading && !expensesTimedOut ? (
              <div className="flex flex-col items-center justify-center p-10 gap-2">
                <div className="w-6 h-6 border-2 border-zinc-200 dark:border-zinc-800 border-t-zinc-900 dark:border-t-zinc-100 rounded-full animate-spin" />
                <p className="text-zinc-400 text-[10px] font-medium uppercase tracking-wider">Loading expenses...</p>
              </div>
            ) : filteredExpenses.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-10 gap-2">
                <Receipt size={24} className="text-zinc-300" />
                <p className="text-zinc-400 text-xs">{expenseSearch || expenseCategoryFilter !== 'all' ? 'No results.' : 'No expenses recorded. Create the first one with the "Expense" button.'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[650px]">
                  <thead>
                    <tr className="bg-zinc-50/50 dark:bg-zinc-800/20">
                      <th className="px-5 py-2.5 text-left text-[10px] font-medium text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/60">Concept</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-medium text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/60">Category</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-medium text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/60">Project</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-medium text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/60">Amount</th>
                      <th className="px-4 py-2.5 text-center text-[10px] font-medium text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/60">Date</th>
                      <th className="px-4 py-2.5 text-center text-[10px] font-medium text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800/60">Status</th>
                      <th className="px-4 py-2.5 w-10 border-b border-zinc-100 dark:border-zinc-800/60" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/40">
                    {filteredExpenses.map((exp: ExpenseEntry) => {
                      const catInfo = EXPENSE_CATEGORIES[exp.category];
                      const CatIcon = catInfo?.icon || Tag;
                      const isProjected = exp.id.startsWith('proj-');
                      return (
                        <tr key={exp.id} className={`group hover:bg-zinc-50/50 dark:hover:bg-zinc-800/10 transition-colors ${isProjected ? 'opacity-60 italic' : ''}`}>
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
                              {exp.recurring && <span className="text-[8px] bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500 px-1 rounded font-semibold">REC</span>}
                              {exp.recurring_source_id && !isProjected && <span className="text-[8px] bg-blue-50 dark:bg-blue-500/10 text-blue-500 px-1 rounded font-semibold">AUTO</span>}
                              {isProjected && <span className="text-[8px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500 px-1 rounded font-semibold">PROJECTED</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[11px] text-zinc-500 dark:text-zinc-400">{exp.project_name}</td>
                          <td className="px-4 py-3 text-xs font-semibold text-zinc-900 dark:text-zinc-100 text-right">{fmtCurrency(exp.amount)}</td>
                          <td className="px-4 py-3 text-[11px] text-zinc-400 text-center">{fmtDate(exp.date)}</td>
                          <td className="px-4 py-3 text-center"><StatusBadge status={exp.status} /></td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-0.5 justify-end opacity-0 group-hover:opacity-100 transition-all">
                              <button onClick={() => openEditExpense(exp)}
                                title={isProjected ? 'Materialize and edit this month’s copy' : 'Edit'}
                                className="p-1 rounded text-zinc-300 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
                                <Pencil size={12} />
                              </button>
                              {!isProjected && (
                                <button onClick={() => handleDeleteExpense(exp.id)}
                                  className="p-1 rounded text-zinc-300 hover:text-rose-500 transition-colors">
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
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

      {/* ═══════════════ BUDGETS ═══════════════ */}
      {activeTab === 'budgets' && (
        <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-500">
          {/* Summary strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">Total Allocated</div>
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{fmtCurrency(totalAllocated)}</div>
            </div>
            <div className="p-3 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">Total Spent</div>
              <div className="text-sm font-semibold text-rose-600 dark:text-rose-400">{fmtCurrency(totalBudgetSpent)}</div>
            </div>
            <div className="p-3 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">Remaining</div>
              <div className={`text-sm font-semibold ${totalAllocated - totalBudgetSpent >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {fmtCurrency(totalAllocated - totalBudgetSpent)}
              </div>
            </div>
          </div>

          {/* Filter bar */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={budgetSearch}
                  onChange={e => setBudgetSearch(e.target.value)}
                  placeholder="Search budgets..."
                  className="pl-8 pr-3 py-1.5 w-48 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                />
              </div>
              <div className="flex gap-0.5 p-0.5 bg-zinc-100 dark:bg-zinc-900/60 rounded-lg">
                <button
                  onClick={() => setBudgetCategoryFilter('all')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${budgetCategoryFilter === 'all' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-600'}`}
                >All</button>
                {budgetCategories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setBudgetCategoryFilter(cat)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${budgetCategoryFilter === cat ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-600'}`}
                  >{cat}</button>
                ))}
              </div>
            </div>
            {hasPermission('finance', 'create') && (
              <button onClick={openBudgetForm} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-medium transition-colors">
                <Plus size={13} />
                New Budget
              </button>
            )}
          </div>

          {/* Budget cards */}
          {budgetsLoading ? (
            <div className="text-center py-12">
              <div className="w-5 h-5 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-zinc-400">Loading budgets...</p>
            </div>
          ) : filteredBudgets.length === 0 ? (
            <div className="text-center py-12">
              <Wallet size={28} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-2" />
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                {budgets.length === 0 ? 'No budgets yet' : 'No budgets match this filter'}
              </p>
              <p className="text-[11px] text-zinc-400 mb-3">Create a budget to track spending against allocated funds</p>
              {budgets.length === 0 && hasPermission('finance', 'create') && (
                <button onClick={openBudgetForm} className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors">
                  <Plus size={14} /> Create Budget
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredBudgets.map(budget => {
                const spending = budgetSpending[budget.id] || { spent: 0, count: 0 };
                const pct = budget.allocated_amount > 0 ? (spending.spent / budget.allocated_amount) * 100 : 0;
                const remaining = budget.allocated_amount - spending.spent;
                const barColor = pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
                const isExpanded = expandedBudgetId === budget.id;
                const linkedExpenses = isExpanded ? expenses.filter(e => e.budget_id === budget.id) : [];

                return (
                  <div key={budget.id} className="bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60 overflow-hidden group">
                    {/* Color top bar */}
                    <div className="h-1" style={{ backgroundColor: budget.color }} />

                    <div className="p-4">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{budget.name}</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            {budget.category && (
                              <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                                {budget.category}
                              </span>
                            )}
                            <span className="text-[9px] font-medium text-zinc-400 capitalize">{budget.period}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          {hasPermission('finance', 'create') && (
                            <>
                              <button onClick={() => openEditBudget(budget)} className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors" title="Edit">
                                <Pencil size={12} />
                              </button>
                              <button onClick={() => handleDeleteBudget(budget.id)} className="p-1.5 text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors" title="Delete">
                                <Trash2 size={12} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {budget.description && (
                        <p className="text-[11px] text-zinc-400 line-clamp-2 mb-3">{budget.description}</p>
                      )}

                      {/* Amounts */}
                      <div className="flex items-baseline justify-between mb-2">
                        <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{fmtCurrency(budget.allocated_amount)}</span>
                        <span className={`text-xs font-semibold ${remaining >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {fmtCurrency(remaining)} left
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="mb-2">
                        <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[10px] text-zinc-400">{fmtCurrency(spending.spent)} spent</span>
                          <span className="text-[10px] font-semibold text-zinc-500">{pct.toFixed(0)}%</span>
                        </div>
                      </div>

                      {/* Expense count + expand */}
                      <button
                        onClick={() => setExpandedBudgetId(isExpanded ? null : budget.id)}
                        className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors mt-1"
                      >
                        <Receipt size={11} />
                        <span>{spending.count} expense{spending.count !== 1 ? 's' : ''}</span>
                        <ChevronRight size={10} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      </button>

                      {/* Expanded: linked expenses */}
                      {isExpanded && linkedExpenses.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-1.5">
                          {linkedExpenses.slice(0, 8).map(exp => (
                            <div key={exp.id} className="flex items-center justify-between text-[11px]">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <div className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-600 shrink-0" />
                                <span className="text-zinc-600 dark:text-zinc-400 truncate">{exp.concept}</span>
                              </div>
                              <span className="font-medium text-zinc-700 dark:text-zinc-300 shrink-0 ml-2">{fmtCurrency(exp.amount)}</span>
                            </div>
                          ))}
                          {linkedExpenses.length > 8 && (
                            <p className="text-[10px] text-zinc-400 italic">+{linkedExpenses.length - 8} more</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ PROPOSALS ═══════════════ */}
      {activeTab === 'propuestas' && (
        <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-500">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/10">
                  <Send size={12} className="text-indigo-500" />
                </div>
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium">Pending</span>
              </div>
              <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{proposalMetrics.sent.length}</div>
              <div className="text-[10px] text-indigo-500 font-medium mt-0.5">{fmtCurrency(proposalMetrics.potentialRevenue)}</div>
            </div>
            <div className="p-4 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10">
                  <ThumbsUp size={12} className="text-emerald-500" />
                </div>
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium">Confirmed</span>
              </div>
              <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{proposalMetrics.approved.length}</div>
              <div className="text-[10px] text-emerald-500 font-medium mt-0.5">{fmtCurrency(proposalMetrics.confirmedRevenue)}</div>
            </div>
            <div className="p-4 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-500/10">
                  <ThumbsDown size={12} className="text-rose-500" />
                </div>
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium">Rejected</span>
              </div>
              <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{proposalMetrics.rejected.length}</div>
              <div className="text-[10px] text-rose-400 font-medium mt-0.5">{fmtCurrency(proposalMetrics.lostRevenue)}</div>
            </div>
            <div className="p-4 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800">
                  <Target size={12} className="text-zinc-500" />
                </div>
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium">Conversion</span>
              </div>
              <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{proposalMetrics.conversionRate.toFixed(0)}%</div>
              <div className="text-[10px] text-zinc-400 font-medium mt-0.5">{proposalMetrics.approved.length + proposalMetrics.rejected.length + proposalMetrics.sent.length} total responded</div>
            </div>
          </div>

          {/* Filter pills */}
          <div className="flex items-center gap-1.5">
            {([
              { key: 'all', label: 'All', count: proposals.length },
              { key: 'draft', label: 'Draft', count: proposalMetrics.draft.length },
              { key: 'sent', label: 'Sent', count: proposalMetrics.sent.length },
              { key: 'approved', label: 'Approved', count: proposalMetrics.approved.length },
              { key: 'rejected', label: 'Rejected', count: proposalMetrics.rejected.length },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setProposalStatusFilter(tab.key)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                  proposalStatusFilter === tab.key
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                    : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                {tab.label}
                {tab.count > 0 && <span className={`ml-1 text-[10px] ${proposalStatusFilter === tab.key ? 'opacity-60' : 'opacity-40'}`}>{tab.count}</span>}
              </button>
            ))}
          </div>

          {/* Proposals table */}
          <div className="bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60 overflow-hidden">
            {proposalsLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-5 h-5 border-2 border-zinc-200 dark:border-zinc-700 border-t-indigo-500 rounded-full animate-spin" />
              </div>
            ) : filteredProposals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
                <FileText size={28} className="mb-2 text-zinc-300" />
                <p className="text-xs">No proposals found.</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {filteredProposals.map(p => {
                  const client = p.client_id ? clients.find((c: any) => c.id === p.client_id) : null;
                  const lead = p.lead_id ? leads.find(l => l.id === p.lead_id) : null;
                  const isEditing = editingProposalId === p.id;
                  const statusStyles: Record<string, string> = {
                    draft: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400',
                    sent: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
                    approved: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                    rejected: 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400',
                  };
                  return (
                    <div key={p.id} className="group/proposal hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                      <div className="flex items-center gap-3 px-5 py-3.5">
                        {/* Title + client/lead */}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate">{p.title}</div>
                          <div className="text-[10px] text-zinc-400 truncate mt-0.5">
                            {client?.name || (lead ? `Lead: ${lead.name}` : 'No client')}
                            {p.sent_at && ` · Sent ${fmtDate(p.sent_at.split('T')[0])}`}
                          </div>
                        </div>

                        {/* Amount — click to edit */}
                        {isEditing ? (
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[10px] text-zinc-400">$</span>
                            <input
                              type="number"
                              defaultValue={p.pricing_total || ''}
                              autoFocus
                              onBlur={e => {
                                const val = parseFloat(e.target.value) || null;
                                if (val !== p.pricing_total) updateProposalField(p.id, 'pricing_total', val);
                              }}
                              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                              className="w-24 text-sm font-semibold text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 tabular-nums"
                              placeholder="0"
                            />
                          </div>
                        ) : (
                          <button
                            onClick={() => setEditingProposalId(p.id)}
                            className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 shrink-0 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-text"
                            title="Click to edit amount"
                          >
                            {p.pricing_total ? fmtCurrency(p.pricing_total) : '—'}
                          </button>
                        )}

                        {/* Status badge */}
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide shrink-0 ${statusStyles[p.status] || statusStyles.draft}`}>
                          {p.status}
                        </span>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          {/* Edit toggle */}
                          <button
                            onClick={() => setEditingProposalId(isEditing ? null : p.id)}
                            className={`p-1.5 rounded-md transition-colors ${isEditing ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600' : 'text-zinc-300 hover:text-zinc-500 opacity-0 group-hover/proposal:opacity-100'}`}
                            title={isEditing ? 'Done editing' : 'Edit'}
                          >
                            <Pencil size={13} />
                          </button>
                          {p.status === 'sent' && (
                            <>
                              <button
                                onClick={() => updateProposalStatus(p.id, 'approved')}
                                className="p-1.5 rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                                title="Approve"
                              >
                                <CheckCircle2 size={14} />
                              </button>
                              <button
                                onClick={() => updateProposalStatus(p.id, 'rejected')}
                                className="p-1.5 rounded-md hover:bg-rose-50 dark:hover:bg-rose-500/10 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                                title="Reject"
                              >
                                <ThumbsDown size={14} />
                              </button>
                            </>
                          )}
                          {p.status === 'approved' && p.pricing_total && (
                            <button
                              onClick={() => convertProposalToIncome(p)}
                              className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 text-[10px] font-semibold transition-colors"
                              title="Convert to Income"
                            >
                              <ArrowRight size={10} />
                              Income
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expanded edit row — client/lead assignment */}
                      {isEditing && (
                        <div className="px-5 pb-3 flex items-center gap-3 animate-in slide-in-from-top-1 duration-200">
                          <div className="flex items-center gap-2 flex-1">
                            <label className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider shrink-0">Client</label>
                            <select
                              value={p.client_id || ''}
                              onChange={e => updateProposalField(p.id, 'client_id', e.target.value || null)}
                              className="flex-1 max-w-[200px] text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 text-zinc-700 dark:text-zinc-300"
                            >
                              <option value="">No client</option>
                              {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ''}</option>)}
                            </select>
                          </div>
                          <div className="flex items-center gap-2 flex-1">
                            <label className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider shrink-0">Lead</label>
                            <select
                              value={p.lead_id || ''}
                              onChange={e => updateProposalField(p.id, 'lead_id', e.target.value || null)}
                              className="flex-1 max-w-[200px] text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 text-zinc-700 dark:text-zinc-300"
                            >
                              <option value="">No lead</option>
                              {leads.map(l => <option key={l.id} value={l.id}>{l.name}{l.company ? ` — ${l.company}` : ''}</option>)}
                            </select>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider shrink-0">Currency</label>
                            <select
                              value={p.currency || 'USD'}
                              onChange={e => updateProposalField(p.id, 'currency', e.target.value)}
                              className="text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 text-zinc-700 dark:text-zinc-300"
                            >
                              <option value="USD">USD</option>
                              <option value="EUR">EUR</option>
                              <option value="ARS">ARS</option>
                              <option value="GBP">GBP</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
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
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">Projects</div>
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{projectPnL.length}</div>
            </div>
            <div className="p-3 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">Total Income</div>
              <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                {fmtCurrency(projectPnL.reduce((s: number, p: { income: number }) => s + p.income, 0))}
              </div>
            </div>
            <div className="p-3 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">Total Expenses</div>
              <div className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                {fmtCurrency(projectPnL.reduce((s: number, p: { expenses: number }) => s + p.expenses, 0))}
              </div>
            </div>
            <div className="p-3 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">Net Profit</div>
              <div className={`text-sm font-semibold ${projectPnL.reduce((s: number, p: { profit: number }) => s + p.profit, 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {fmtCurrency(projectPnL.reduce((s: number, p: { profit: number }) => s + p.profit, 0))}
              </div>
            </div>
          </div>

          {projectPnL.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-10 bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60 gap-2">
              <Target size={24} className="text-zinc-300" />
              <p className="text-zinc-400 text-xs">Add income and expenses linked to projects to see the P&L analysis.</p>
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
                            {p.health === 'profitable' ? 'Profitable' : p.health === 'loss' ? 'Loss' : 'Break-even'}
                          </span>
                          <span className="text-[10px] text-zinc-400">Margin: {p.margin.toFixed(1)}%</span>
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
                        <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mb-0.5">Income</div>
                        <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{fmtCurrency(p.income)}</div>
                      </div>
                      <div className="p-2.5 bg-rose-50/50 dark:bg-rose-500/5 rounded-lg">
                        <div className="text-[10px] text-rose-600 dark:text-rose-400 mb-0.5">Expenses</div>
                        <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{fmtCurrency(p.expenses)}</div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-zinc-400">
                        <span>Burn Rate</span>
                        <span>{progressPct.toFixed(0)}% consumed</span>
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

      {/* ═══════════════ LIVV (Cycles + Pipeline + Summary) ═══════════════ */}
      {activeTab === 'livv' && (<LivvFinanceView />)}

      {/* ═══════════════ CONFIGURACIÓN ═══════════════ */}
      {activeTab === 'config' && (
        <div className="animate-in fade-in duration-500 space-y-5">
          <div className="bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60 p-5">
            <LivvPartnersConfig />
          </div>
          <div className="bg-white dark:bg-zinc-900/80 rounded-xl border border-zinc-100 dark:border-zinc-800/60 p-5">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Financial Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-lg">
                <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 mb-1">Primary Currency</div>
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">USD ($)</div>
                <p className="text-[10px] text-zinc-400 mt-0.5">All records use this currency.</p>
              </div>
              <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-lg">
                <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 mb-1">Records</div>
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{incomes.length} income / {expenses.length} expenses</div>
                <p className="text-[10px] text-zinc-400 mt-0.5">Total financial records loaded.</p>
              </div>
              <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-lg">
                <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 mb-1">Expense Categories</div>
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{Object.keys(EXPENSE_CATEGORIES).length}</div>
                <p className="text-[10px] text-zinc-400 mt-0.5">Software, Talent, Marketing, Operations, Legal</p>
              </div>
              <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-lg">
                <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 mb-1">Client Integration</div>
                <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Connected</div>
                <p className="text-[10px] text-zinc-400 mt-0.5">{clients.length} clients synced from CRM.</p>
              </div>
              <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-lg">
                <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 mb-1">Project Integration</div>
                <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Connected</div>
                <p className="text-[10px] text-zinc-400 mt-0.5">{projects.length} projects synced.</p>
              </div>
              <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-lg">
                <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 mb-1">Business Models</div>
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Fixed + Hourly + Retainer</div>
                <p className="text-[10px] text-zinc-400 mt-0.5">Supports all 3 models per project.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ SLIDE PANEL ═══════════════ */}
      <SlidePanel
        isOpen={isEntryOpen}
        onClose={closeForm}
        title={
          entryType === 'income' ? (editingIncomeId ? 'Edit Income' : 'New Income') :
          entryType === 'budget' ? (editingBudgetId ? 'Edit Budget' : 'New Budget') :
          (editingExpenseId ? 'Edit Expense' : 'New Expense')
        }
        subtitle={
          entryType === 'income' ? (editingIncomeId ? 'Update income details' : 'Select a project or register a general income') :
          entryType === 'budget' ? (editingBudgetId ? 'Update budget details' : 'Create a fund to track spending') :
          (editingExpenseId ? 'Update expense details' : materializingSourceId ? 'Adjust this month’s copy of the recurring expense' : 'Register expense')
        }
        width="md"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={closeForm}
              className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
              Cancel
            </button>
            <button
              onClick={
                entryType === 'income' ? handleSubmitIncome :
                entryType === 'budget' ? handleSubmitBudget :
                handleSubmitExpense
              }
              disabled={isSubmitting}
              className={`px-4 py-1.5 rounded-lg text-white text-xs font-medium shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity
                ${
                  entryType === 'income' ? 'bg-emerald-600' :
                  entryType === 'budget' ? 'bg-blue-600' :
                  'bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900'
                }`}
            >
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        }
      >
        <div className="p-5 space-y-4">
          {entryType === 'income' ? (
            <>
              {/* Project selector — primary action, auto-fills client + concept */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Project</label>
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
                        <span className="text-[10px] font-medium">No project (general income)</span>
                      </button>
                    </>
                  ) : (
                    <div className="text-xs text-zinc-400 italic py-2">No projects created yet</div>
                  )}
                </div>
              </div>

              {/* Client — auto-filled from project, but editable */}
              {!incomeForm.project_id && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Client</label>
                  <select value={incomeForm.client_id} onChange={e => setIncomeForm(p => ({ ...p, client_id: e.target.value }))}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100">
                    <option value="">No client assigned</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ''}</option>)}
                  </select>
                </div>
              )}

              {/* Concept — auto-filled from project, always editable */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Concept *</label>
                <input type="text" value={incomeForm.concept} onChange={e => setIncomeForm(p => ({ ...p, concept: e.target.value }))}
                  placeholder="E.g.: Full web development, Consulting..."
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100" />
              </div>

              {/* Amount + installments in a row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Total Amount *{editingIncomeId ? ' (read-only)' : ''}</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 font-medium">$</span>
                    <input type="number" min="0" step="0.01" value={incomeForm.total_amount}
                      onChange={e => setIncomeForm(p => ({ ...p, total_amount: e.target.value }))}
                      placeholder="0"
                      disabled={!!editingIncomeId}
                      className={`w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 pl-7 pr-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100 ${editingIncomeId ? 'opacity-50 cursor-not-allowed' : ''}`} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Installments</label>
                  <input type="number" min="1" max="24" value={incomeForm.num_installments}
                    onChange={e => setIncomeForm(p => ({ ...p, num_installments: e.target.value }))}
                    disabled={!!editingIncomeId}
                    className={`w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100 text-center ${editingIncomeId ? 'opacity-50 cursor-not-allowed' : ''}`} />
                </div>
              </div>

              {/* Due date */}
              {!editingIncomeId && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">First installment date</label>
                <input type="date" value={incomeForm.due_date}
                  onChange={e => setIncomeForm(p => ({ ...p, due_date: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100" />
              </div>
              )}

              {/* Installment preview */}
              {!editingIncomeId && incomeForm.total_amount && parseInt(incomeForm.num_installments) > 1 && (
                <div className="flex items-center gap-2 p-2.5 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg border border-emerald-100 dark:border-emerald-500/20">
                  <Receipt size={14} className="text-emerald-500 shrink-0" />
                  <span className="text-xs text-emerald-700 dark:text-emerald-300">
                    {incomeForm.num_installments} installments of ~{fmtCurrency(Number(incomeForm.total_amount) / parseInt(incomeForm.num_installments))} each
                  </span>
                </div>
              )}
            </>
          ) : entryType === 'budget' ? (
            <>
              {/* Budget name */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Name *</label>
                <input type="text" value={budgetForm.name} onChange={e => setBudgetForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="E.g.: Marketing, Infrastructure..."
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100" />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Description</label>
                <input type="text" value={budgetForm.description} onChange={e => setBudgetForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="What is this budget for?"
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100" />
              </div>

              {/* Amount + Category */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Allocated Amount *</label>
                  <input type="number" min="0" step="0.01" value={budgetForm.allocated_amount}
                    onChange={e => setBudgetForm(p => ({ ...p, allocated_amount: e.target.value }))}
                    placeholder="0"
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Category</label>
                  <input type="text" value={budgetForm.category} onChange={e => setBudgetForm(p => ({ ...p, category: e.target.value }))}
                    placeholder="E.g.: Investment, Ads..."
                    list="budget-categories"
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100" />
                  <datalist id="budget-categories">
                    {budgetCategories.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
              </div>

              {/* Period + Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Period</label>
                  <select value={budgetForm.period} onChange={e => setBudgetForm(p => ({ ...p, period: e.target.value as typeof p.period }))}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100">
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                    <option value="one-time">One-time</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Start</label>
                  <input type="date" value={budgetForm.start_date}
                    onChange={e => setBudgetForm(p => ({ ...p, start_date: e.target.value }))}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">End</label>
                  <input type="date" value={budgetForm.end_date}
                    onChange={e => setBudgetForm(p => ({ ...p, end_date: e.target.value }))}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100" />
                </div>
              </div>

              {/* Color picker */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Color</label>
                <div className="flex gap-2">
                  {['#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#06b6d4', '#6366f1', '#84cc16', '#f97316'].map(c => (
                    <button
                      key={c}
                      onClick={() => setBudgetForm(p => ({ ...p, color: c }))}
                      className={`w-6 h-6 rounded-full transition-all ${budgetForm.color === c ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-zinc-900 scale-110' : 'hover:scale-110'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Concept *</label>
                <input type="text" value={expenseForm.concept} onChange={e => setExpenseForm(p => ({ ...p, concept: e.target.value }))}
                  placeholder="E.g.: Figma licenses, Hosting..."
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Category</label>
                  <select value={expenseForm.category} onChange={e => setExpenseForm(p => ({ ...p, category: e.target.value }))}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100">
                    {Object.keys(EXPENSE_CATEGORIES).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Amount *</label>
                  <input type="number" min="0" step="0.01" value={expenseForm.amount}
                    onChange={e => setExpenseForm(p => ({ ...p, amount: e.target.value }))}
                    placeholder="0"
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Vendor</label>
                <input type="text" value={expenseForm.vendor} onChange={e => setExpenseForm(p => ({ ...p, vendor: e.target.value }))}
                  placeholder="Vendor name..."
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Project</label>
                  <select value={expenseForm.project_id} onChange={e => setExpenseForm(p => ({ ...p, project_id: e.target.value }))}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100">
                    <option value="">General</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Date *</label>
                  <input type="date" value={expenseForm.date}
                    onChange={e => setExpenseForm(p => ({ ...p, date: e.target.value }))}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Status</label>
                  <select value={expenseForm.status} onChange={e => setExpenseForm(p => ({ ...p, status: e.target.value as 'paid' | 'pending' }))}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100">
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={expenseForm.recurring}
                      onChange={e => setExpenseForm(p => ({ ...p, recurring: e.target.checked }))}
                      className="rounded border-zinc-300 dark:border-zinc-700 text-emerald-600 focus:ring-emerald-500" />
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">Recurring (monthly)</span>
                  </label>
                </div>
              </div>
              {/* Budget selector */}
              {budgets.filter(b => b.is_active).length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Budget (optional)</label>
                  <select value={expenseForm.budget_id} onChange={e => setExpenseForm(p => ({ ...p, budget_id: e.target.value }))}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100">
                    <option value="">No budget</option>
                    {budgets.filter(b => b.is_active).map(b => (
                      <option key={b.id} value={b.id}>{b.name} ({fmtCurrency(b.allocated_amount)})</option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          {entryError && (
            <div className="text-xs font-medium text-rose-600 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-lg px-3 py-2">
              {entryError}
            </div>
          )}
        </div>
      </SlidePanel>

      {/* ═══════════════ AI ASSISTANT ═══════════════ */}
      <FinanceAssistant isOpen={isAssistantOpen} onClose={() => setIsAssistantOpen(false)} />
      <FinanceChat isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
    </div>
  );
};

export default Finance;
