import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useTenant } from '../context/TenantContext'
import { hasPermission } from '../lib/securityHelpers'

// ─── Types ────────────────────────────────────────────────────────

export interface Finance {
  id: string
  project_id: string
  tenant_id: string
  total_agreed: number
  total_collected: number
  direct_expenses: number
  imputed_expenses: number
  hours_worked: number
  business_model: 'fixed' | 'hourly' | 'retainer'
  health: 'profitable' | 'break-even' | 'loss'
  profit_margin: number
  created_at: string
  updated_at: string
  created_by?: string
}

export interface FinancialSummary {
  project_id: string
  total_agreed: number
  total_collected: number
  direct_expenses: number
  imputed_expenses: number
  total_expenses: number
  hours_worked: number
  business_model: string
  health: string
  profit_margin: number
  collection_rate: number
  effective_hourly_rate?: number
}

export interface IncomeEntry {
  id: string
  tenant_id: string
  client_id: string | null
  project_id: string | null
  client_name: string
  project_name: string
  concept: string
  total_amount: number
  currency: string
  status: 'paid' | 'partial' | 'pending' | 'overdue'
  due_date: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  installments?: Installment[]
  linked_task_id?: string | null
}

export interface Installment {
  id: string
  income_id: string
  number: number
  amount: number
  due_date: string
  paid_date: string | null
  status: 'paid' | 'pending' | 'overdue'
  created_at: string
  updated_at: string
  linked_task_id?: string | null
}

export interface ExpenseEntry {
  id: string
  tenant_id: string
  category: string
  subcategory: string
  concept: string
  amount: number
  currency: string
  date: string
  project_id: string | null
  project_name: string
  client_id: string | null
  vendor: string
  recurring: boolean
  status: 'paid' | 'pending'
  budget_id: string | null
  recurring_source_id: string | null
  last_renewed_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CreateIncomeData {
  client_id?: string | null
  project_id?: string | null
  client_name: string
  project_name: string
  concept: string
  total_amount: number
  currency?: string
  due_date?: string | null
  num_installments?: number
  installment_dates?: string[]
}

export interface CreateExpenseData {
  category: string
  subcategory?: string
  concept: string
  amount: number
  currency?: string
  date: string
  project_id?: string | null
  project_name?: string
  client_id?: string | null
  vendor: string
  recurring?: boolean
  status?: 'paid' | 'pending'
  budget_id?: string | null
  recurring_source_id?: string | null
}

export interface TimeEntry {
  id: string
  tenant_id: string
  project_id: string | null
  client_id: string | null
  user_id: string
  description: string
  hours: number
  date: string
  hourly_rate: number | null
  created_at: string
  updated_at: string
}

export interface CreateTimeEntryData {
  project_id?: string | null
  client_id?: string | null
  description: string
  hours: number
  date: string
  hourly_rate?: number | null
}

export interface Budget {
  id: string
  tenant_id: string
  name: string
  description: string
  allocated_amount: number
  currency: string
  category: string
  color: string
  icon: string
  period: 'monthly' | 'quarterly' | 'yearly' | 'one-time'
  start_date: string | null
  end_date: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CreateBudgetData {
  name: string
  description?: string
  allocated_amount: number
  currency?: string
  category?: string
  color?: string
  icon?: string
  period?: 'monthly' | 'quarterly' | 'yearly' | 'one-time'
  start_date?: string | null
  end_date?: string | null
}

export interface Withdrawal {
  id: string
  tenant_id: string
  date: string
  amount: number
  transfer_fee: number
  net_amount: number
  fee_percentage: number
  currency: string
  source: string
  destination: string
  notes: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CreateWithdrawalData {
  date: string
  amount: number
  transfer_fee?: number
  currency?: string
  source?: string
  destination?: string
  notes?: string
}

// ─── LIVV Spreadsheet Domain ──────────────────────────────────────
// Mirrors the LIVV Creative Studio finance spreadsheet:
//   Partners → Payment Cycles → Revenues / Costs / Distributions
//   Pipeline projects (Ventas & Utilidades)

export interface FinancePartner {
  id: string
  tenant_id: string
  name: string
  default_split_percentage: number
  color: string
  notes: string
  is_active: boolean
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CreateFinancePartnerData {
  name: string
  default_split_percentage: number
  color?: string
  notes?: string
  sort_order?: number
}

export interface PaymentCycle {
  id: string
  tenant_id: string
  label: string
  period_month: string         // YYYY-MM-DD (first of month)
  cycle_number: 1 | 2
  period_description: string
  processing_fee_rate: number  // 0..1 — 0.047 default
  marketing_budget: number
  prior_balance_eneas: number
  status: 'draft' | 'closed'
  notes: string
  created_by: string | null
  created_at: string
  updated_at: string
  revenues?: CycleRevenue[]
  costs?: CycleCost[]
  distributions?: CycleDistribution[]
}

export interface CreatePaymentCycleData {
  label: string
  period_month: string
  cycle_number?: 1 | 2
  period_description?: string
  processing_fee_rate?: number
  marketing_budget?: number
  prior_balance_eneas?: number
  notes?: string
}

export interface CycleRevenue {
  id: string
  cycle_id: string
  tenant_id: string
  client_id: string | null
  client_name: string
  amount: number
  notes: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface CreateCycleRevenueData {
  cycle_id: string
  client_id?: string | null
  client_name: string
  amount: number
  notes?: string
  sort_order?: number
}

export interface CycleCost {
  id: string
  cycle_id: string
  tenant_id: string
  tool_name: string
  cost: number
  notes: string
  externally_covered: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface CreateCycleCostData {
  cycle_id: string
  tool_name: string
  cost: number
  notes?: string
  externally_covered?: boolean
  sort_order?: number
}

export interface CycleDistribution {
  id: string
  cycle_id: string
  tenant_id: string
  partner_id: string | null
  partner_name: string
  split_percentage: number
  sent_amount: number
  prior_balance: number
  notes: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface CreateCycleDistributionData {
  cycle_id: string
  partner_id?: string | null
  partner_name: string
  split_percentage: number
  sent_amount?: number
  prior_balance?: number
  notes?: string
  sort_order?: number
}

export interface PipelineProject {
  id: string
  tenant_id: string
  client_group: string
  client_id: string | null
  project_id: string | null
  client_name: string
  project_name: string
  total_amount: number
  collected_amount: number
  pending_amount: number
  status: 'open' | 'in_progress' | 'closed' | 'lost'
  notes: string
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CreatePipelineProjectData {
  client_group?: string
  client_id?: string | null
  project_id?: string | null
  client_name: string
  project_name: string
  total_amount: number
  collected_amount?: number
  status?: 'open' | 'in_progress' | 'closed' | 'lost'
  notes?: string
  sort_order?: number
}

/** Computed P&L for a payment cycle. All fields are derived. */
export interface CycleSummary {
  totalRevenue: number
  netRevenue: number          // totalRevenue × (1 − processing_fee_rate)
  processingFee: number       // totalRevenue × processing_fee_rate
  totalCosts: number          // sum of cost lines (negative ones reduce total)
  netProfit: number           // netRevenue − totalCosts
  profitMargin: number        // netProfit / totalRevenue (0 if no revenue)
  distributable: number       // netProfit − marketing_budget
}

// ─── Context Type ─────────────────────────────────────────────────

interface FinanceContextType {
  // Legacy project finances
  finances: Finance[]
  loading: boolean
  error: string | null
  canViewFinances: boolean
  canEditFinances: boolean
  createFinance: (projectId: string, data: Partial<Finance>) => Promise<Finance | null>
  updateFinance: (id: string, data: Partial<Finance>) => Promise<Finance | null>
  deleteFinance: (id: string) => Promise<boolean>
  getFinanceByProject: (projectId: string) => Promise<Finance | null>
  getFinancialSummary: (projectId: string) => Promise<FinancialSummary | null>
  getTenantFinancials: () => Promise<Finance[]>
  updateProjectFinancials: (projectId: string, updates: Partial<Finance>) => Promise<boolean>

  // Income operations
  incomes: IncomeEntry[]
  incomesLoading: boolean
  createIncome: (data: CreateIncomeData) => Promise<IncomeEntry | null>
  updateIncome: (id: string, updates: Partial<IncomeEntry>) => Promise<void>
  updateInstallment: (id: string, updates: Partial<Installment>) => Promise<void>
  deleteIncome: (id: string) => Promise<void>
  refreshIncomes: () => Promise<void>

  // Expense operations
  expenses: ExpenseEntry[]
  expensesLoading: boolean
  createExpense: (data: CreateExpenseData) => Promise<ExpenseEntry | null>
  updateExpense: (id: string, updates: Partial<ExpenseEntry>) => Promise<void>
  deleteExpense: (id: string) => Promise<void>
  refreshExpenses: () => Promise<void>

  // Time entry operations
  timeEntries: TimeEntry[]
  timeEntriesLoading: boolean
  createTimeEntry: (data: CreateTimeEntryData) => Promise<TimeEntry | null>
  deleteTimeEntry: (id: string) => Promise<void>
  refreshTimeEntries: () => Promise<void>

  // Budget operations
  budgets: Budget[]
  budgetsLoading: boolean
  createBudget: (data: CreateBudgetData) => Promise<Budget | null>
  updateBudget: (id: string, updates: Partial<Budget>) => Promise<void>
  deleteBudget: (id: string) => Promise<void>
  refreshBudgets: () => Promise<void>

  // Withdrawal operations
  withdrawals: Withdrawal[]
  withdrawalsLoading: boolean
  createWithdrawal: (data: CreateWithdrawalData) => Promise<Withdrawal | null>
  updateWithdrawal: (id: string, updates: Partial<Withdrawal>) => Promise<void>
  deleteWithdrawal: (id: string) => Promise<void>
  refreshWithdrawals: () => Promise<void>

  // LIVV: Partners (profit-share recipients)
  partners: FinancePartner[]
  partnersLoading: boolean
  createPartner: (data: CreateFinancePartnerData) => Promise<FinancePartner | null>
  updatePartner: (id: string, updates: Partial<FinancePartner>) => Promise<void>
  deletePartner: (id: string) => Promise<void>
  refreshPartners: () => Promise<void>

  // LIVV: Payment cycles (one or two per month)
  paymentCycles: PaymentCycle[]
  paymentCyclesLoading: boolean
  createPaymentCycle: (data: CreatePaymentCycleData) => Promise<PaymentCycle | null>
  updatePaymentCycle: (id: string, updates: Partial<PaymentCycle>) => Promise<void>
  deletePaymentCycle: (id: string) => Promise<void>
  refreshPaymentCycles: () => Promise<void>
  computeCycleSummary: (cycle: PaymentCycle) => CycleSummary

  // LIVV: Cycle revenue lines
  createCycleRevenue: (data: CreateCycleRevenueData) => Promise<CycleRevenue | null>
  updateCycleRevenue: (id: string, updates: Partial<CycleRevenue>) => Promise<void>
  deleteCycleRevenue: (id: string) => Promise<void>

  // LIVV: Cycle cost lines (tools / SaaS)
  createCycleCost: (data: CreateCycleCostData) => Promise<CycleCost | null>
  updateCycleCost: (id: string, updates: Partial<CycleCost>) => Promise<void>
  deleteCycleCost: (id: string) => Promise<void>

  // LIVV: Cycle distributions (per-partner entitlement / sent)
  createCycleDistribution: (data: CreateCycleDistributionData) => Promise<CycleDistribution | null>
  updateCycleDistribution: (id: string, updates: Partial<CycleDistribution>) => Promise<void>
  deleteCycleDistribution: (id: string) => Promise<void>

  // LIVV: Pipeline projects (Ventas & Utilidades)
  pipelineProjects: PipelineProject[]
  pipelineProjectsLoading: boolean
  createPipelineProject: (data: CreatePipelineProjectData) => Promise<PipelineProject | null>
  updatePipelineProject: (id: string, updates: Partial<PipelineProject>) => Promise<void>
  deletePipelineProject: (id: string) => Promise<void>
  refreshPipelineProjects: () => Promise<void>
}

// ─── Context ──────────────────────────────────────────────────────

const FinanceContext = createContext<FinanceContextType | undefined>(undefined)

export const useFinance = () => {
  const context = useContext(FinanceContext)
  if (context === undefined) {
    throw new Error('useFinance must be used within a FinanceProvider')
  }
  return context
}

// ─── Provider ─────────────────────────────────────────────────────

interface FinanceProviderProps {
  children: ReactNode
}

export const FinanceProvider: React.FC<FinanceProviderProps> = ({ children }) => {
  const { user } = useAuth()
  const { currentTenant } = useTenant()

  // Legacy project finances
  const [finances, setFinances] = useState<Finance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const hasLoadedRef = useRef(false)
  const [canViewFinances, setCanViewFinances] = useState(false)
  const [canEditFinances, setCanEditFinances] = useState(false)

  // Income state — start false so Home renders immediately with $0, then updates
  const [incomes, setIncomes] = useState<IncomeEntry[]>([])
  const [incomesLoading, setIncomesLoading] = useState(false)

  // Expense state
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([])
  const [expensesLoading, setExpensesLoading] = useState(false)

  // Time entry state
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [timeEntriesLoading, setTimeEntriesLoading] = useState(false)
  const hasLoadedTimeEntriesRef = useRef(false)

  // Budget state
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [budgetsLoading, setBudgetsLoading] = useState(false)
  const hasLoadedBudgetsRef = useRef(false)

  // Withdrawal state
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false)
  const hasLoadedWithdrawalsRef = useRef(false)

  // LIVV state
  const [partners, setPartners] = useState<FinancePartner[]>([])
  const [partnersLoading, setPartnersLoading] = useState(false)
  const hasLoadedPartnersRef = useRef(false)
  const [paymentCycles, setPaymentCycles] = useState<PaymentCycle[]>([])
  const [paymentCyclesLoading, setPaymentCyclesLoading] = useState(false)
  const hasLoadedCyclesRef = useRef(false)
  const [pipelineProjects, setPipelineProjects] = useState<PipelineProject[]>([])
  const [pipelineProjectsLoading, setPipelineProjectsLoading] = useState(false)
  const hasLoadedPipelineRef = useRef(false)

  // ─── Permissions ────────────────────────────────────────────

  useEffect(() => {
    const checkPermissions = async () => {
      if (!user || !currentTenant) {
        setCanViewFinances(false)
        setCanEditFinances(false)
        return
      }
      const [viewPerm, editPerm] = await Promise.all([
        hasPermission('finance', 'view'),
        hasPermission('finance', 'edit'),
      ])
      setCanViewFinances(viewPerm)
      setCanEditFinances(editPerm)
    }
    checkPermissions()
  }, [user, currentTenant])

  // ─── Load Legacy Finances ───────────────────────────────────

  const loadFinances = useCallback(async () => {
    if (!user || !currentTenant || !canViewFinances) {
      setFinances([])
      setLoading(false)
      return
    }
    try {
      // Only show loading on first load, not on background re-fetches
      if (!hasLoadedRef.current) {
        setLoading(true)
      }
      setError(null)
      const { data, error: err } = await supabase
        .from('finances')
        .select('*')
        .eq('tenant_id', currentTenant.id)
        .order('updated_at', { ascending: false })
      if (err) throw err
      setFinances(data || [])
      hasLoadedRef.current = true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load financial data')
      setFinances([])
    } finally {
      setLoading(false)
    }
  }, [user, currentTenant?.id, canViewFinances])

  useEffect(() => {
    loadFinances()
    const tid = currentTenant?.id
    const tf = tid ? { filter: `tenant_id=eq.${tid}` } : {}
    const channel = supabase
      .channel(`finances-rt${tid ? `-${tid}` : ''}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finances', ...tf }, () => { loadFinances() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadFinances])

  // ─── Load Incomes ───────────────────────────────────────────
  const hasLoadedIncomesRef = useRef(false)

  const loadIncomes = useCallback(async () => {
    if (!user || !currentTenant) {
      setIncomes([])
      setIncomesLoading(false)
      return
    }
    try {
      if (!hasLoadedIncomesRef.current) {
        setIncomesLoading(true)
      }

      // Timeout to prevent infinite loading if query hangs
      const timeout = new Promise<{ data: null; error: { code: string; message: string } }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: { code: 'TIMEOUT', message: 'Query timed out' } }), 8000)
      )

      const query = supabase
        .from('incomes')
        .select('*, installments(*)')
        .eq('tenant_id', currentTenant.id)
        .order('created_at', { ascending: false })

      const { data, error: err } = await Promise.race([query, timeout])

      if (err) {
        // Table might not exist, permission denied, or timeout — gracefully degrade
        if (import.meta.env.DEV) console.warn('[FinanceContext] Incomes load issue:', err.code, err.message)
        setIncomes([])
        return
      }

      // Sort installments by number
      const sorted = (data || []).map((inc: IncomeEntry) => ({
        ...inc,
        installments: (inc.installments || []).sort(
          (a: Installment, b: Installment) => a.number - b.number
        ),
      }))

      // Auto-detect overdue installments (pending + due_date < today)
      const today = new Date().toISOString().split('T')[0]
      const overdueIds: string[] = []
      for (const inc of sorted) {
        for (const inst of (inc.installments || [])) {
          if (inst.status === 'pending' && inst.due_date && inst.due_date < today) {
            overdueIds.push(inst.id)
            inst.status = 'overdue' // Update local state immediately
          }
        }
      }
      // Batch-update overdue installments in DB (fire-and-forget)
      if (overdueIds.length > 0) {
        supabase
          .from('installments')
          .update({ status: 'overdue' })
          .in('id', overdueIds)
          .then(({ error: oErr }) => {
            if (oErr && import.meta.env.DEV) console.warn('[FinanceContext] Overdue update error:', oErr.message)
          })
      }

      setIncomes(sorted)
      hasLoadedIncomesRef.current = true
    } catch (err) {
      console.error('Error loading incomes:', err)
      setIncomes([])
    } finally {
      setIncomesLoading(false)
    }
  }, [user, currentTenant?.id])

  useEffect(() => {
    loadIncomes()
    const tid = currentTenant?.id
    const tf = tid ? { filter: `tenant_id=eq.${tid}` } : {}
    const channel = supabase
      .channel(`incomes-rt${tid ? `-${tid}` : ''}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incomes', ...tf }, () => { loadIncomes() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'installments', ...tf }, () => { loadIncomes() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadIncomes])

  // ─── Load Expenses ──────────────────────────────────────────
  const hasLoadedExpensesRef = useRef(false)

  const loadExpenses = useCallback(async () => {
    if (!user || !currentTenant) {
      setExpenses([])
      setExpensesLoading(false)
      return
    }
    try {
      if (!hasLoadedExpensesRef.current) {
        setExpensesLoading(true)
      }

      const timeout = new Promise<{ data: null; error: { code: string; message: string } }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: { code: 'TIMEOUT', message: 'Query timed out' } }), 8000)
      )

      const query = supabase
        .from('expenses')
        .select('*')
        .eq('tenant_id', currentTenant.id)
        .order('date', { ascending: false })

      const { data, error: err } = await Promise.race([query, timeout])

      if (err) {
        if (import.meta.env.DEV) console.warn('[FinanceContext] Expenses load issue:', err.code, err.message)
        setExpenses([])
        return
      }
      setExpenses(data || [])
      hasLoadedExpensesRef.current = true
    } catch (err) {
      console.error('Error loading expenses:', err)
      setExpenses([])
    } finally {
      setExpensesLoading(false)
    }
  }, [user, currentTenant?.id])

  useEffect(() => {
    loadExpenses()
    const tid = currentTenant?.id
    const tf = tid ? { filter: `tenant_id=eq.${tid}` } : {}
    const channel = supabase
      .channel(`expenses-rt${tid ? `-${tid}` : ''}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', ...tf }, () => { loadExpenses() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadExpenses])

  // ─── Time Entries Load + Realtime ──────────────────────────

  const loadTimeEntries = useCallback(async () => {
    if (!user || !currentTenant) {
      setTimeEntries([])
      setTimeEntriesLoading(false)
      return
    }
    try {
      if (!hasLoadedTimeEntriesRef.current) {
        setTimeEntriesLoading(true)
      }

      const timeout = new Promise<{ data: null; error: { code: string; message: string } }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: { code: 'TIMEOUT', message: 'Query timed out' } }), 8000)
      )

      const query = supabase
        .from('time_entries')
        .select('*')
        .eq('tenant_id', currentTenant.id)
        .order('date', { ascending: false })

      const { data, error: err } = await Promise.race([query, timeout])

      if (err) {
        if (import.meta.env.DEV) console.warn('[FinanceContext] Time entries load issue:', err.code, err.message)
        setTimeEntries([])
        return
      }
      setTimeEntries(data || [])
      hasLoadedTimeEntriesRef.current = true
    } catch (err) {
      console.error('Error loading time entries:', err)
      setTimeEntries([])
    } finally {
      setTimeEntriesLoading(false)
    }
  }, [user, currentTenant?.id])

  useEffect(() => {
    loadTimeEntries()
    const tid = currentTenant?.id
    const tf = tid ? { filter: `tenant_id=eq.${tid}` } : {}
    const channel = supabase
      .channel(`time-entries-rt${tid ? `-${tid}` : ''}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'time_entries', ...tf }, () => { loadTimeEntries() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadTimeEntries])

  // ─── Legacy Finance CRUD ────────────────────────────────────

  const createFinance = async (projectId: string, data: Partial<Finance>): Promise<Finance | null> => {
    if (!user || !currentTenant || !canEditFinances) {
      throw new Error('Insufficient permissions to create financial records')
    }
    try {
      const financeData = {
        project_id: projectId,
        tenant_id: currentTenant.id,
        created_by: user.id,
        ...data,
      }
      const { data: result, error: err } = await supabase
        .from('finances')
        .insert(financeData)
        .select()
        .single()
      if (err) throw err
      setFinances(prev => [result, ...prev])
      return result
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to create financial record')
    }
  }

  const updateFinance = async (id: string, data: Partial<Finance>): Promise<Finance | null> => {
    if (!canEditFinances) throw new Error('Insufficient permissions')
    try {
      const { data: result, error: err } = await supabase
        .from('finances').update(data).eq('id', id).select().single()
      if (err) throw err
      setFinances(prev => prev.map(f => f.id === id ? result : f))
      return result
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to update financial record')
    }
  }

  const deleteFinance = async (id: string): Promise<boolean> => {
    if (!canEditFinances) throw new Error('Insufficient permissions')
    try {
      const { error: err } = await supabase.from('finances').delete().eq('id', id)
      if (err) throw err
      setFinances(prev => prev.filter(f => f.id !== id))
      return true
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to delete financial record')
    }
  }

  const getFinanceByProject = async (projectId: string): Promise<Finance | null> => {
    if (!canViewFinances) return null
    try {
      const { data, error: err } = await supabase
        .from('finances').select('*').eq('project_id', projectId).single()
      if (err && err.code !== 'PGRST116') throw err
      return data
    } catch (err) {
      console.error('Error fetching finance by project:', err)
      return null
    }
  }

  const getFinancialSummary = async (projectId: string): Promise<FinancialSummary | null> => {
    if (!canViewFinances) return null
    try {
      const { data, error: err } = await supabase
        .rpc('get_project_financial_summary', { p_project_id: projectId })
      if (err) throw err
      return data
    } catch (err) {
      console.error('Error fetching financial summary:', err)
      return null
    }
  }

  const getTenantFinancials = async (): Promise<Finance[]> => {
    if (!canViewFinances) return []
    try {
      const { data, error: err } = await supabase
        .from('finances').select('*').eq('tenant_id', currentTenant?.id)
        .order('updated_at', { ascending: false })
      if (err) throw err
      return data || []
    } catch (err) {
      console.error('Error fetching tenant financials:', err)
      return []
    }
  }

  const updateProjectFinancials = async (projectId: string, updates: Partial<Finance>): Promise<boolean> => {
    if (!canEditFinances) throw new Error('Insufficient permissions')
    try {
      const { error: err } = await supabase
        .from('finances').update(updates)
        .eq('project_id', projectId).eq('tenant_id', currentTenant?.id)
      if (err) throw err
      await loadFinances()
      return true
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to update project financials')
    }
  }

  // ─── Income CRUD ────────────────────────────────────────────

  const createIncome = useCallback(async (data: CreateIncomeData): Promise<IncomeEntry | null> => {
    if (!user || !currentTenant) throw new Error('Session not available. Reload the page.')
    try {
      // 1. Build income payload — strip empty-string FKs to null
      const incomePayload: Record<string, any> = {
        tenant_id: currentTenant.id,
        client_name: data.client_name,
        project_name: data.project_name,
        concept: data.concept,
        total_amount: data.total_amount,
        currency: data.currency || 'USD',
        due_date: data.due_date || null,
        status: 'pending',
        created_by: user.id,
      }
      // Only include FK references when they are valid UUIDs (not empty strings)
      if (data.client_id) incomePayload.client_id = data.client_id
      if (data.project_id) incomePayload.project_id = data.project_id

      if (import.meta.env.DEV) console.log('[FinanceContext] Inserting income:', incomePayload)

      const { data: income, error: incErr } = await supabase
        .from('incomes')
        .insert(incomePayload)
        .select()
        .single()

      if (incErr) {
        console.error('[FinanceContext] Income insert error:', incErr)
        throw new Error(incErr.message || 'Error creating income record in the database.')
      }

      // 2. Create installments (installments table has NO tenant_id column)
      const numInstallments = data.num_installments || 1
      const installmentAmount = Math.round((data.total_amount / numInstallments) * 100) / 100
      const baseDate = data.due_date ? new Date(data.due_date + 'T12:00:00') : new Date()
      const customDates = data.installment_dates

      const installmentRows = Array.from({ length: numInstallments }, (_, i) => {
        let dueDateStr: string
        if (customDates && customDates[i]) {
          dueDateStr = customDates[i]
        } else {
          const dueDate = new Date(baseDate)
          dueDate.setMonth(dueDate.getMonth() + i)
          dueDateStr = dueDate.toISOString().split('T')[0]
        }
        const amt = i === numInstallments - 1
          ? data.total_amount - installmentAmount * (numInstallments - 1)
          : installmentAmount
        return {
          income_id: income.id,
          number: i + 1,
          amount: Math.round(amt * 100) / 100,
          due_date: dueDateStr,
          status: 'pending',
        }
      })

      const { error: instErr } = await supabase
        .from('installments')
        .insert(installmentRows)

      if (instErr) {
        console.error('[FinanceContext] Installments insert error:', instErr)
        throw new Error(instErr.message || 'Error creating installments.')
      }

      // 3. Reload incomes to get full data with installments
      await loadIncomes()
      return income
    } catch (err) {
      console.error('[FinanceContext] createIncome failed:', err)
      throw err
    }
  }, [user, currentTenant?.id, loadIncomes])

  const updateIncome = useCallback(async (id: string, updates: Partial<IncomeEntry>): Promise<void> => {
    try {
      const { error: err } = await supabase
        .from('incomes').update(updates).eq('id', id)
      if (err) throw err
      await loadIncomes()
    } catch (err) {
      console.error('Error updating income:', err)
      throw err
    }
  }, [loadIncomes])

  const updateInstallment = useCallback(async (id: string, updates: Partial<Installment>): Promise<void> => {
    try {
      const { error: err } = await supabase
        .from('installments')
        .update(updates)
        .eq('id', id)

      if (err) throw err
      // Reload to get updated income status (trigger updates parent)
      await loadIncomes()
    } catch (err) {
      console.error('Error updating installment:', err)
      throw err
    }
  }, [loadIncomes])

  const deleteIncome = useCallback(async (id: string): Promise<void> => {
    try {
      // Installments cascade-delete via FK
      const { error: err } = await supabase.from('incomes').delete().eq('id', id)
      if (err) throw err
      setIncomes(prev => prev.filter(i => i.id !== id))
    } catch (err) {
      console.error('Error deleting income:', err)
      throw err
    }
  }, [])

  // ─── Expense CRUD ───────────────────────────────────────────

  const createExpense = useCallback(async (data: CreateExpenseData): Promise<ExpenseEntry | null> => {
    if (!user || !currentTenant) throw new Error('Session not available. Reload the page.')
    try {
      const expensePayload: Record<string, any> = {
        tenant_id: currentTenant.id,
        category: data.category,
        subcategory: data.subcategory || '',
        concept: data.concept,
        amount: data.amount,
        currency: data.currency || 'USD',
        date: data.date,
        project_name: data.project_name || 'General',
        vendor: data.vendor,
        recurring: data.recurring || false,
        status: data.status || 'pending',
        created_by: user.id,
      }
      if (data.project_id) expensePayload.project_id = data.project_id
      if (data.client_id) expensePayload.client_id = data.client_id
      if (data.budget_id) expensePayload.budget_id = data.budget_id
      if (data.recurring_source_id) expensePayload.recurring_source_id = data.recurring_source_id

      if (import.meta.env.DEV) console.log('[FinanceContext] Inserting expense:', expensePayload)

      const { data: expense, error: err } = await supabase
        .from('expenses')
        .insert(expensePayload)
        .select()
        .single()

      if (err) {
        console.error('[FinanceContext] Expense insert error:', err)
        throw new Error(err.message || 'Error creating expense in the database.')
      }
      setExpenses(prev => [expense, ...prev])
      return expense
    } catch (err) {
      console.error('[FinanceContext] createExpense failed:', err)
      throw err
    }
  }, [user, currentTenant?.id])

  const updateExpense = useCallback(async (id: string, updates: Partial<ExpenseEntry>): Promise<void> => {
    try {
      const { data: result, error: err } = await supabase
        .from('expenses').update(updates).eq('id', id).select().single()
      if (err) throw err
      setExpenses(prev => prev.map(e => e.id === id ? result : e))
    } catch (err) {
      console.error('Error updating expense:', err)
      throw err
    }
  }, [])

  const deleteExpense = useCallback(async (id: string): Promise<void> => {
    try {
      const { error: err } = await supabase.from('expenses').delete().eq('id', id)
      if (err) throw err
      setExpenses(prev => prev.filter(e => e.id !== id))
    } catch (err) {
      console.error('Error deleting expense:', err)
      throw err
    }
  }, [])

  // ─── Time Entry CRUD ───────────────────────────────────────

  const createTimeEntry = useCallback(async (data: CreateTimeEntryData): Promise<TimeEntry | null> => {
    if (!user || !currentTenant?.id) throw new Error('Not authenticated')
    try {
      const timePayload: Record<string, any> = {
        tenant_id: currentTenant.id,
        user_id: user.id,
        description: data.description,
        hours: data.hours,
        date: data.date,
        hourly_rate: data.hourly_rate || null,
      }
      if (data.project_id) timePayload.project_id = data.project_id
      if (data.client_id) timePayload.client_id = data.client_id

      const { data: entry, error: err } = await supabase
        .from('time_entries')
        .insert(timePayload)
        .select()
        .single()
      if (err) {
        console.error('[FinanceContext] Time entry insert error:', err)
        throw new Error(err.message || 'Error creating time entry.')
      }
      setTimeEntries(prev => [entry, ...prev])
      return entry
    } catch (err) {
      console.error('[FinanceContext] createTimeEntry failed:', err)
      throw err
    }
  }, [user, currentTenant?.id])

  const deleteTimeEntry = useCallback(async (id: string): Promise<void> => {
    try {
      const { error: err } = await supabase.from('time_entries').delete().eq('id', id)
      if (err) throw err
      setTimeEntries(prev => prev.filter(e => e.id !== id))
    } catch (err) {
      console.error('Error deleting time entry:', err)
      throw err
    }
  }, [])

  // ─── Budget CRUD ───────────────────────────────────────────

  const loadBudgets = useCallback(async () => {
    if (!user || !currentTenant) {
      setBudgets([])
      setBudgetsLoading(false)
      return
    }
    try {
      if (!hasLoadedBudgetsRef.current) {
        setBudgetsLoading(true)
      }
      const timeout = new Promise<{ data: null; error: { code: string; message: string } }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: { code: 'TIMEOUT', message: 'Query timed out' } }), 8000)
      )
      const query = supabase
        .from('budgets')
        .select('*')
        .eq('tenant_id', currentTenant.id)
        .order('created_at', { ascending: false })

      const { data, error: err } = await Promise.race([query, timeout])
      if (err) {
        if (import.meta.env.DEV) console.warn('[FinanceContext] Budgets load issue:', err.code, err.message)
        setBudgets([])
        return
      }
      setBudgets(data || [])
      hasLoadedBudgetsRef.current = true
    } catch (err) {
      console.error('Error loading budgets:', err)
      setBudgets([])
    } finally {
      setBudgetsLoading(false)
    }
  }, [user, currentTenant?.id])

  useEffect(() => {
    loadBudgets()
    const tid = currentTenant?.id
    const tf = tid ? { filter: `tenant_id=eq.${tid}` } : {}
    const channel = supabase
      .channel(`budgets-rt${tid ? `-${tid}` : ''}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budgets', ...tf }, () => { loadBudgets() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadBudgets])

  const createBudget = useCallback(async (data: CreateBudgetData): Promise<Budget | null> => {
    if (!user || !currentTenant?.id) throw new Error('Not authenticated')
    try {
      const payload: Record<string, any> = {
        tenant_id: currentTenant.id,
        name: data.name,
        description: data.description || '',
        allocated_amount: data.allocated_amount,
        currency: data.currency || 'USD',
        category: data.category || '',
        color: data.color || '#3b82f6',
        icon: data.icon || 'wallet',
        period: data.period || 'monthly',
        start_date: data.start_date || null,
        end_date: data.end_date || null,
        created_by: user.id,
      }
      const { data: budget, error: err } = await supabase
        .from('budgets')
        .insert(payload)
        .select()
        .single()
      if (err) {
        console.error('[FinanceContext] Budget insert error:', err)
        throw new Error(err.message || 'Error creating budget.')
      }
      setBudgets(prev => [budget, ...prev])
      return budget
    } catch (err) {
      console.error('[FinanceContext] createBudget failed:', err)
      throw err
    }
  }, [user, currentTenant?.id])

  const updateBudget = useCallback(async (id: string, updates: Partial<Budget>): Promise<void> => {
    try {
      const { data: updated, error: err } = await supabase
        .from('budgets')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (err) throw err
      setBudgets(prev => prev.map(b => b.id === id ? updated : b))
    } catch (err) {
      console.error('Error updating budget:', err)
      throw err
    }
  }, [])

  const deleteBudget = useCallback(async (id: string): Promise<void> => {
    try {
      const { error: err } = await supabase.from('budgets').delete().eq('id', id)
      if (err) throw err
      setBudgets(prev => prev.filter(b => b.id !== id))
    } catch (err) {
      console.error('Error deleting budget:', err)
      throw err
    }
  }, [])

  // ─── Withdrawal Load + Realtime ────────────────────────────

  const loadWithdrawals = useCallback(async () => {
    if (!user || !currentTenant) {
      setWithdrawals([])
      setWithdrawalsLoading(false)
      return
    }
    try {
      if (!hasLoadedWithdrawalsRef.current) {
        setWithdrawalsLoading(true)
      }
      const timeout = new Promise<{ data: null; error: { code: string; message: string } }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: { code: 'TIMEOUT', message: 'Query timed out' } }), 8000)
      )
      const query = supabase
        .from('withdrawals')
        .select('*')
        .eq('tenant_id', currentTenant.id)
        .order('date', { ascending: false })

      const { data, error: err } = await Promise.race([query, timeout])
      if (err) {
        if (import.meta.env.DEV) console.warn('[FinanceContext] Withdrawals load issue:', err.code, err.message)
        setWithdrawals([])
        return
      }
      setWithdrawals(data || [])
      hasLoadedWithdrawalsRef.current = true
    } catch (err) {
      console.error('Error loading withdrawals:', err)
      setWithdrawals([])
    } finally {
      setWithdrawalsLoading(false)
    }
  }, [user, currentTenant?.id])

  useEffect(() => {
    loadWithdrawals()
    const tid = currentTenant?.id
    const tf = tid ? { filter: `tenant_id=eq.${tid}` } : {}
    const channel = supabase
      .channel(`withdrawals-rt${tid ? `-${tid}` : ''}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'withdrawals', ...tf }, () => { loadWithdrawals() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadWithdrawals])

  const createWithdrawal = useCallback(async (data: CreateWithdrawalData): Promise<Withdrawal | null> => {
    if (!user || !currentTenant?.id) throw new Error('Not authenticated')
    try {
      const payload: Record<string, any> = {
        tenant_id: currentTenant.id,
        date: data.date,
        amount: data.amount,
        transfer_fee: data.transfer_fee || 0,
        currency: data.currency || 'USD',
        source: data.source || 'bank',
        destination: data.destination || '',
        notes: data.notes || '',
        created_by: user.id,
      }
      const { data: withdrawal, error: err } = await supabase
        .from('withdrawals')
        .insert(payload)
        .select()
        .single()
      if (err) {
        console.error('[FinanceContext] Withdrawal insert error:', err)
        throw new Error(err.message || 'Error creating withdrawal.')
      }
      setWithdrawals(prev => [withdrawal, ...prev])
      return withdrawal
    } catch (err) {
      console.error('[FinanceContext] createWithdrawal failed:', err)
      throw err
    }
  }, [user, currentTenant?.id])

  const updateWithdrawal = useCallback(async (id: string, updates: Partial<Withdrawal>): Promise<void> => {
    try {
      // Strip generated columns — DB rejects writes to them
      const { net_amount, fee_percentage, ...writable } = updates as any
      void net_amount; void fee_percentage
      const { data: result, error: err } = await supabase
        .from('withdrawals').update(writable).eq('id', id).select().single()
      if (err) throw err
      setWithdrawals(prev => prev.map(w => w.id === id ? result : w))
    } catch (err) {
      console.error('Error updating withdrawal:', err)
      throw err
    }
  }, [])

  const deleteWithdrawal = useCallback(async (id: string): Promise<void> => {
    try {
      const { error: err } = await supabase.from('withdrawals').delete().eq('id', id)
      if (err) throw err
      setWithdrawals(prev => prev.filter(w => w.id !== id))
    } catch (err) {
      console.error('Error deleting withdrawal:', err)
      throw err
    }
  }, [])

  // ════════════════════════════════════════════════════════════════
  // LIVV: Partners
  // ════════════════════════════════════════════════════════════════

  const loadPartners = useCallback(async () => {
    if (!user || !currentTenant) {
      setPartners([])
      setPartnersLoading(false)
      return
    }
    try {
      if (!hasLoadedPartnersRef.current) setPartnersLoading(true)
      const { data, error: err } = await supabase
        .from('finance_partners')
        .select('*')
        .eq('tenant_id', currentTenant.id)
        .order('sort_order', { ascending: true })
      if (err) {
        if (import.meta.env.DEV) console.warn('[FinanceContext] Partners load issue:', err.message)
        setPartners([])
        return
      }
      setPartners(data || [])
      hasLoadedPartnersRef.current = true
    } catch (err) {
      console.error('Error loading partners:', err)
      setPartners([])
    } finally {
      setPartnersLoading(false)
    }
  }, [user, currentTenant?.id])

  useEffect(() => {
    loadPartners()
    const tid = currentTenant?.id
    const tf = tid ? { filter: `tenant_id=eq.${tid}` } : {}
    const channel = supabase
      .channel(`finance-partners-rt${tid ? `-${tid}` : ''}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_partners', ...tf }, () => { loadPartners() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadPartners])

  const createPartner = useCallback(async (data: CreateFinancePartnerData): Promise<FinancePartner | null> => {
    if (!user || !currentTenant?.id) throw new Error('Not authenticated')
    const payload: Record<string, any> = {
      tenant_id: currentTenant.id,
      name: data.name,
      default_split_percentage: data.default_split_percentage,
      color: data.color || '#10b981',
      notes: data.notes || '',
      sort_order: data.sort_order ?? partners.length,
      created_by: user.id,
    }
    const { data: row, error: err } = await supabase
      .from('finance_partners').insert(payload).select().single()
    if (err) throw new Error(err.message)
    setPartners(prev => [...prev, row].sort((a, b) => a.sort_order - b.sort_order))
    return row
  }, [user, currentTenant?.id, partners.length])

  const updatePartner = useCallback(async (id: string, updates: Partial<FinancePartner>): Promise<void> => {
    const { data: row, error: err } = await supabase
      .from('finance_partners').update(updates).eq('id', id).select().single()
    if (err) throw err
    setPartners(prev => prev.map(p => p.id === id ? row : p))
  }, [])

  const deletePartner = useCallback(async (id: string): Promise<void> => {
    const { error: err } = await supabase.from('finance_partners').delete().eq('id', id)
    if (err) throw err
    setPartners(prev => prev.filter(p => p.id !== id))
  }, [])

  // ════════════════════════════════════════════════════════════════
  // LIVV: Payment Cycles (with revenues / costs / distributions)
  // ════════════════════════════════════════════════════════════════

  const loadPaymentCycles = useCallback(async () => {
    if (!user || !currentTenant) {
      setPaymentCycles([])
      setPaymentCyclesLoading(false)
      return
    }
    try {
      if (!hasLoadedCyclesRef.current) setPaymentCyclesLoading(true)
      const { data, error: err } = await supabase
        .from('finance_payment_cycles')
        .select('*, revenues:finance_cycle_revenues(*), costs:finance_cycle_costs(*), distributions:finance_cycle_distributions(*)')
        .eq('tenant_id', currentTenant.id)
        .order('period_month', { ascending: false })
        .order('cycle_number', { ascending: true })
      if (err) {
        if (import.meta.env.DEV) console.warn('[FinanceContext] PaymentCycles load issue:', err.message)
        setPaymentCycles([])
        return
      }
      const sorted = (data || []).map((c: PaymentCycle) => ({
        ...c,
        revenues: (c.revenues || []).slice().sort((a, b) => a.sort_order - b.sort_order),
        costs: (c.costs || []).slice().sort((a, b) => a.sort_order - b.sort_order),
        distributions: (c.distributions || []).slice().sort((a, b) => a.sort_order - b.sort_order),
      }))
      setPaymentCycles(sorted)
      hasLoadedCyclesRef.current = true
    } catch (err) {
      console.error('Error loading payment cycles:', err)
      setPaymentCycles([])
    } finally {
      setPaymentCyclesLoading(false)
    }
  }, [user, currentTenant?.id])

  useEffect(() => {
    loadPaymentCycles()
    const tid = currentTenant?.id
    const tf = tid ? { filter: `tenant_id=eq.${tid}` } : {}
    const channel = supabase
      .channel(`finance-cycles-rt${tid ? `-${tid}` : ''}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_payment_cycles', ...tf }, () => { loadPaymentCycles() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_cycle_revenues', ...tf }, () => { loadPaymentCycles() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_cycle_costs', ...tf }, () => { loadPaymentCycles() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_cycle_distributions', ...tf }, () => { loadPaymentCycles() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadPaymentCycles])

  const createPaymentCycle = useCallback(async (data: CreatePaymentCycleData): Promise<PaymentCycle | null> => {
    if (!user || !currentTenant?.id) throw new Error('Not authenticated')
    const payload: Record<string, any> = {
      tenant_id: currentTenant.id,
      label: data.label,
      period_month: data.period_month,
      cycle_number: data.cycle_number ?? 1,
      period_description: data.period_description ?? '',
      processing_fee_rate: data.processing_fee_rate ?? 0.047,
      marketing_budget: data.marketing_budget ?? 0,
      prior_balance_eneas: data.prior_balance_eneas ?? 0,
      notes: data.notes ?? '',
      created_by: user.id,
    }
    const { data: row, error: err } = await supabase
      .from('finance_payment_cycles').insert(payload).select().single()
    if (err) throw new Error(err.message)

    // Auto-seed default partner distributions
    if (partners.length > 0) {
      const distRows = partners.map((p, idx) => ({
        cycle_id: row.id,
        tenant_id: currentTenant.id,
        partner_id: p.id,
        partner_name: p.name,
        split_percentage: p.default_split_percentage,
        sent_amount: 0,
        prior_balance: 0,
        sort_order: idx,
      }))
      await supabase.from('finance_cycle_distributions').insert(distRows)
    }

    await loadPaymentCycles()
    return row
  }, [user, currentTenant?.id, partners, loadPaymentCycles])

  const updatePaymentCycle = useCallback(async (id: string, updates: Partial<PaymentCycle>): Promise<void> => {
    // Strip nested arrays — those are loaded via join, not writable here
    const { revenues, costs, distributions, ...writable } = updates as any
    void revenues; void costs; void distributions
    const { error: err } = await supabase
      .from('finance_payment_cycles').update(writable).eq('id', id)
    if (err) throw err
    await loadPaymentCycles()
  }, [loadPaymentCycles])

  const deletePaymentCycle = useCallback(async (id: string): Promise<void> => {
    const { error: err } = await supabase.from('finance_payment_cycles').delete().eq('id', id)
    if (err) throw err
    setPaymentCycles(prev => prev.filter(c => c.id !== id))
  }, [])

  /**
   * Compute the spreadsheet-style P&L block for a single cycle.
   * Net Revenue = Total Revenue × (1 − fee_rate). Net Profit = Net Revenue − Total Costs.
   * Negative cost lines (e.g. Jitter = -$19) reduce Total Costs (partner-covered tools).
   */
  const computeCycleSummary = useCallback((cycle: PaymentCycle): CycleSummary => {
    const totalRevenue = (cycle.revenues || []).reduce((s, r) => s + Number(r.amount || 0), 0)
    const processingFee = totalRevenue * Number(cycle.processing_fee_rate || 0)
    const netRevenue = totalRevenue - processingFee
    const totalCosts = (cycle.costs || []).reduce((s, c) => s + Number(c.cost || 0), 0)
    const netProfit = netRevenue - totalCosts
    const profitMargin = totalRevenue > 0 ? netProfit / totalRevenue : 0
    const distributable = netProfit - Number(cycle.marketing_budget || 0)
    return { totalRevenue, netRevenue, processingFee, totalCosts, netProfit, profitMargin, distributable }
  }, [])

  // ─── Cycle Revenue CRUD ─────────────────────────────────────

  const createCycleRevenue = useCallback(async (data: CreateCycleRevenueData): Promise<CycleRevenue | null> => {
    if (!currentTenant?.id) throw new Error('Not authenticated')
    const payload: Record<string, any> = {
      cycle_id: data.cycle_id,
      tenant_id: currentTenant.id,
      client_id: data.client_id ?? null,
      client_name: data.client_name,
      amount: data.amount,
      notes: data.notes ?? '',
      sort_order: data.sort_order ?? 0,
    }
    const { data: row, error: err } = await supabase
      .from('finance_cycle_revenues').insert(payload).select().single()
    if (err) throw new Error(err.message)
    await loadPaymentCycles()
    return row
  }, [currentTenant?.id, loadPaymentCycles])

  const updateCycleRevenue = useCallback(async (id: string, updates: Partial<CycleRevenue>): Promise<void> => {
    const { error: err } = await supabase.from('finance_cycle_revenues').update(updates).eq('id', id)
    if (err) throw err
    await loadPaymentCycles()
  }, [loadPaymentCycles])

  const deleteCycleRevenue = useCallback(async (id: string): Promise<void> => {
    const { error: err } = await supabase.from('finance_cycle_revenues').delete().eq('id', id)
    if (err) throw err
    await loadPaymentCycles()
  }, [loadPaymentCycles])

  // ─── Cycle Cost CRUD ────────────────────────────────────────

  const createCycleCost = useCallback(async (data: CreateCycleCostData): Promise<CycleCost | null> => {
    if (!currentTenant?.id) throw new Error('Not authenticated')
    const payload: Record<string, any> = {
      cycle_id: data.cycle_id,
      tenant_id: currentTenant.id,
      tool_name: data.tool_name,
      cost: data.cost,
      notes: data.notes ?? '',
      externally_covered: data.externally_covered ?? false,
      sort_order: data.sort_order ?? 0,
    }
    const { data: row, error: err } = await supabase
      .from('finance_cycle_costs').insert(payload).select().single()
    if (err) throw new Error(err.message)
    await loadPaymentCycles()
    return row
  }, [currentTenant?.id, loadPaymentCycles])

  const updateCycleCost = useCallback(async (id: string, updates: Partial<CycleCost>): Promise<void> => {
    const { error: err } = await supabase.from('finance_cycle_costs').update(updates).eq('id', id)
    if (err) throw err
    await loadPaymentCycles()
  }, [loadPaymentCycles])

  const deleteCycleCost = useCallback(async (id: string): Promise<void> => {
    const { error: err } = await supabase.from('finance_cycle_costs').delete().eq('id', id)
    if (err) throw err
    await loadPaymentCycles()
  }, [loadPaymentCycles])

  // ─── Cycle Distribution CRUD ────────────────────────────────

  const createCycleDistribution = useCallback(async (data: CreateCycleDistributionData): Promise<CycleDistribution | null> => {
    if (!currentTenant?.id) throw new Error('Not authenticated')
    const payload: Record<string, any> = {
      cycle_id: data.cycle_id,
      tenant_id: currentTenant.id,
      partner_id: data.partner_id ?? null,
      partner_name: data.partner_name,
      split_percentage: data.split_percentage,
      sent_amount: data.sent_amount ?? 0,
      prior_balance: data.prior_balance ?? 0,
      notes: data.notes ?? '',
      sort_order: data.sort_order ?? 0,
    }
    const { data: row, error: err } = await supabase
      .from('finance_cycle_distributions').insert(payload).select().single()
    if (err) throw new Error(err.message)
    await loadPaymentCycles()
    return row
  }, [currentTenant?.id, loadPaymentCycles])

  const updateCycleDistribution = useCallback(async (id: string, updates: Partial<CycleDistribution>): Promise<void> => {
    const { error: err } = await supabase.from('finance_cycle_distributions').update(updates).eq('id', id)
    if (err) throw err
    await loadPaymentCycles()
  }, [loadPaymentCycles])

  const deleteCycleDistribution = useCallback(async (id: string): Promise<void> => {
    const { error: err } = await supabase.from('finance_cycle_distributions').delete().eq('id', id)
    if (err) throw err
    await loadPaymentCycles()
  }, [loadPaymentCycles])

  // ════════════════════════════════════════════════════════════════
  // LIVV: Pipeline Projects (Ventas & Utilidades)
  // ════════════════════════════════════════════════════════════════

  const loadPipelineProjects = useCallback(async () => {
    if (!user || !currentTenant) {
      setPipelineProjects([])
      setPipelineProjectsLoading(false)
      return
    }
    try {
      if (!hasLoadedPipelineRef.current) setPipelineProjectsLoading(true)
      const { data, error: err } = await supabase
        .from('finance_pipeline_projects')
        .select('*')
        .eq('tenant_id', currentTenant.id)
        .order('client_group', { ascending: true })
        .order('sort_order', { ascending: true })
      if (err) {
        if (import.meta.env.DEV) console.warn('[FinanceContext] Pipeline load issue:', err.message)
        setPipelineProjects([])
        return
      }
      setPipelineProjects(data || [])
      hasLoadedPipelineRef.current = true
    } catch (err) {
      console.error('Error loading pipeline:', err)
      setPipelineProjects([])
    } finally {
      setPipelineProjectsLoading(false)
    }
  }, [user, currentTenant?.id])

  useEffect(() => {
    loadPipelineProjects()
    const tid = currentTenant?.id
    const tf = tid ? { filter: `tenant_id=eq.${tid}` } : {}
    const channel = supabase
      .channel(`finance-pipeline-rt${tid ? `-${tid}` : ''}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_pipeline_projects', ...tf }, () => { loadPipelineProjects() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadPipelineProjects])

  const createPipelineProject = useCallback(async (data: CreatePipelineProjectData): Promise<PipelineProject | null> => {
    if (!user || !currentTenant?.id) throw new Error('Not authenticated')
    const payload: Record<string, any> = {
      tenant_id: currentTenant.id,
      client_group: data.client_group ?? 'Otros Clientes',
      client_id: data.client_id ?? null,
      project_id: data.project_id ?? null,
      client_name: data.client_name,
      project_name: data.project_name,
      total_amount: data.total_amount,
      collected_amount: data.collected_amount ?? 0,
      status: data.status ?? 'open',
      notes: data.notes ?? '',
      sort_order: data.sort_order ?? 0,
      created_by: user.id,
    }
    const { data: row, error: err } = await supabase
      .from('finance_pipeline_projects').insert(payload).select().single()
    if (err) throw new Error(err.message)
    setPipelineProjects(prev => [...prev, row])
    return row
  }, [user, currentTenant?.id])

  const updatePipelineProject = useCallback(async (id: string, updates: Partial<PipelineProject>): Promise<void> => {
    // Strip generated columns
    const { pending_amount, ...writable } = updates as any
    void pending_amount
    const { data: row, error: err } = await supabase
      .from('finance_pipeline_projects').update(writable).eq('id', id).select().single()
    if (err) throw err
    setPipelineProjects(prev => prev.map(p => p.id === id ? row : p))
  }, [])

  const deletePipelineProject = useCallback(async (id: string): Promise<void> => {
    const { error: err } = await supabase.from('finance_pipeline_projects').delete().eq('id', id)
    if (err) throw err
    setPipelineProjects(prev => prev.filter(p => p.id !== id))
  }, [])

  // ─── Value ──────────────────────────────────────────────────

  const value: FinanceContextType = useMemo(() => ({
    finances, loading, error, canViewFinances, canEditFinances,
    createFinance, updateFinance, deleteFinance,
    getFinanceByProject, getFinancialSummary,
    getTenantFinancials, updateProjectFinancials,
    incomes, incomesLoading,
    createIncome, updateIncome, updateInstallment, deleteIncome,
    refreshIncomes: loadIncomes,
    expenses, expensesLoading,
    createExpense, updateExpense, deleteExpense,
    refreshExpenses: loadExpenses,
    timeEntries, timeEntriesLoading,
    createTimeEntry, deleteTimeEntry,
    refreshTimeEntries: loadTimeEntries,
    budgets, budgetsLoading,
    createBudget, updateBudget, deleteBudget,
    refreshBudgets: loadBudgets,
    withdrawals, withdrawalsLoading,
    createWithdrawal, updateWithdrawal, deleteWithdrawal,
    refreshWithdrawals: loadWithdrawals,
    // LIVV
    partners, partnersLoading,
    createPartner, updatePartner, deletePartner,
    refreshPartners: loadPartners,
    paymentCycles, paymentCyclesLoading,
    createPaymentCycle, updatePaymentCycle, deletePaymentCycle,
    refreshPaymentCycles: loadPaymentCycles,
    computeCycleSummary,
    createCycleRevenue, updateCycleRevenue, deleteCycleRevenue,
    createCycleCost, updateCycleCost, deleteCycleCost,
    createCycleDistribution, updateCycleDistribution, deleteCycleDistribution,
    pipelineProjects, pipelineProjectsLoading,
    createPipelineProject, updatePipelineProject, deletePipelineProject,
    refreshPipelineProjects: loadPipelineProjects,
  }), [finances, loading, error, canViewFinances, canEditFinances,
    createFinance, updateFinance, deleteFinance,
    getFinanceByProject, getFinancialSummary,
    getTenantFinancials, updateProjectFinancials,
    incomes, incomesLoading, createIncome, updateIncome, updateInstallment, deleteIncome, loadIncomes,
    expenses, expensesLoading, createExpense, updateExpense, deleteExpense, loadExpenses,
    timeEntries, timeEntriesLoading, createTimeEntry, deleteTimeEntry, loadTimeEntries,
    budgets, budgetsLoading, createBudget, updateBudget, deleteBudget, loadBudgets,
    withdrawals, withdrawalsLoading, createWithdrawal, updateWithdrawal, deleteWithdrawal, loadWithdrawals,
    partners, partnersLoading, createPartner, updatePartner, deletePartner, loadPartners,
    paymentCycles, paymentCyclesLoading, createPaymentCycle, updatePaymentCycle, deletePaymentCycle, loadPaymentCycles,
    computeCycleSummary,
    createCycleRevenue, updateCycleRevenue, deleteCycleRevenue,
    createCycleCost, updateCycleCost, deleteCycleCost,
    createCycleDistribution, updateCycleDistribution, deleteCycleDistribution,
    pipelineProjects, pipelineProjectsLoading, createPipelineProject, updatePipelineProject, deletePipelineProject, loadPipelineProjects])

  return (
    <FinanceContext.Provider value={value}>
      {children}
    </FinanceContext.Provider>
  )
}
