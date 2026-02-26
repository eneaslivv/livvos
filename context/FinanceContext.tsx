import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react'
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
  vendor: string
  recurring: boolean
  status: 'paid' | 'pending'
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
  vendor: string
  recurring?: boolean
  status?: 'paid' | 'pending'
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
        console.warn('[FinanceContext] Incomes load issue:', err.code, err.message)
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
        console.warn('[FinanceContext] Expenses load issue:', err.code, err.message)
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
  }, [loadExpenses])

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
    if (!user || !currentTenant) throw new Error('Sesión no disponible. Recargá la página.')
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

      console.log('[FinanceContext] Inserting income:', incomePayload)

      const { data: income, error: incErr } = await supabase
        .from('incomes')
        .insert(incomePayload)
        .select()
        .single()

      if (incErr) {
        console.error('[FinanceContext] Income insert error:', incErr)
        throw new Error(incErr.message || 'Error al crear ingreso en la base de datos.')
      }

      // 2. Create installments
      const numInstallments = data.num_installments || 1
      const installmentAmount = Math.round((data.total_amount / numInstallments) * 100) / 100
      const baseDate = data.due_date ? new Date(data.due_date + 'T12:00:00') : new Date()

      const installmentRows = Array.from({ length: numInstallments }, (_, i) => {
        const dueDate = new Date(baseDate)
        dueDate.setMonth(dueDate.getMonth() + i)
        const amt = i === numInstallments - 1
          ? data.total_amount - installmentAmount * (numInstallments - 1)
          : installmentAmount
        return {
          income_id: income.id,
          tenant_id: currentTenant.id,
          number: i + 1,
          amount: Math.round(amt * 100) / 100,
          due_date: dueDate.toISOString().split('T')[0],
          status: 'pending',
        }
      })

      const { error: instErr } = await supabase
        .from('installments')
        .insert(installmentRows)

      if (instErr) {
        console.error('[FinanceContext] Installments insert error:', instErr)
        // Try without tenant_id in case column doesn't exist
        const rowsNoTenant = installmentRows.map(({ tenant_id: _, ...rest }) => rest)
        const { error: instErr2 } = await supabase
          .from('installments')
          .insert(rowsNoTenant)
        if (instErr2) {
          console.error('[FinanceContext] Installments retry error:', instErr2)
        }
      }

      // 3. Reload incomes to get full data with installments
      await loadIncomes()
      return income
    } catch (err) {
      console.error('[FinanceContext] createIncome failed:', err)
      throw err
    }
  }, [user, currentTenant?.id, loadIncomes])

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
    if (!user || !currentTenant) throw new Error('Sesión no disponible. Recargá la página.')
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

      console.log('[FinanceContext] Inserting expense:', expensePayload)

      const { data: expense, error: err } = await supabase
        .from('expenses')
        .insert(expensePayload)
        .select()
        .single()

      if (err) {
        console.error('[FinanceContext] Expense insert error:', err)
        throw new Error(err.message || 'Error al crear gasto en la base de datos.')
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

  // ─── Value ──────────────────────────────────────────────────

  const value: FinanceContextType = {
    // Legacy
    finances, loading, error, canViewFinances, canEditFinances,
    createFinance, updateFinance, deleteFinance,
    getFinanceByProject, getFinancialSummary,
    getTenantFinancials, updateProjectFinancials,
    // Incomes
    incomes, incomesLoading,
    createIncome, updateInstallment, deleteIncome,
    refreshIncomes: loadIncomes,
    // Expenses
    expenses, expensesLoading,
    createExpense, updateExpense, deleteExpense,
    refreshExpenses: loadExpenses,
  }

  return (
    <FinanceContext.Provider value={value}>
      {children}
    </FinanceContext.Provider>
  )
}
