import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useTenant } from '../context/TenantContext'
import { hasPermission } from '../lib/securityHelpers'

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

interface FinanceContextType {
  finances: Finance[]
  loading: boolean
  error: string | null
  canViewFinances: boolean
  canEditFinances: boolean

  // CRUD operations
  createFinance: (projectId: string, data: Partial<Finance>) => Promise<Finance | null>
  updateFinance: (id: string, data: Partial<Finance>) => Promise<Finance | null>
  deleteFinance: (id: string) => Promise<boolean>
  getFinanceByProject: (projectId: string) => Promise<Finance | null>
  getFinancialSummary: (projectId: string) => Promise<FinancialSummary | null>

  // Bulk operations
  getTenantFinancials: () => Promise<Finance[]>
  updateProjectFinancials: (projectId: string, updates: Partial<Finance>) => Promise<boolean>
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined)

export const useFinance = () => {
  const context = useContext(FinanceContext)
  if (context === undefined) {
    throw new Error('useFinance must be used within a FinanceProvider')
  }
  useEffect(() => { (context as any)._ensureLoaded?.() }, [])
  return context
}

interface FinanceProviderProps {
  children: ReactNode
}

export const FinanceProvider: React.FC<FinanceProviderProps> = ({ children }) => {
  const { user } = useAuth()
  const { currentTenant } = useTenant()
  const [finances, setFinances] = useState<Finance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null);
  const [canViewFinances, setCanViewFinances] = useState(false)
  const [canEditFinances, setCanEditFinances] = useState(false)
  const ensureLoadedRef = useRef(false)
  const shouldLoadRef = useRef(false)

  // Check permissions
  useEffect(() => {
    const checkPermissions = async () => {
      if (!user || !currentTenant) {
        setCanViewFinances(false)
        setCanEditFinances(false)
        return
      }

      const viewPerm = await hasPermission('finance', 'view')
      const editPerm = await hasPermission('finance', 'edit')

      setCanViewFinances(viewPerm)
      setCanEditFinances(editPerm)
    }

    checkPermissions()
  }, [user?.id, currentTenant?.id])

  // Load finances for current tenant
  const loadFinances = useCallback(async () => {
    if (!user || !currentTenant || !canViewFinances) {
      setFinances([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      const { data, error } = await supabase
        .from('finances')
        .select('*')
        .eq('tenant_id', currentTenant.id)
        .order('updated_at', { ascending: false })

      if (error) throw error

      setFinances(data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load financial data')
      setFinances([])
    } finally {
      setLoading(false)
    }
  }, [user?.id, currentTenant?.id, canViewFinances])

  // Lazy load: only fetch when first consumer mounts
  const _ensureLoaded = useCallback(() => {
    if (ensureLoadedRef.current) return
    ensureLoadedRef.current = true
    shouldLoadRef.current = true
    loadFinances()
  }, [])

  // When permissions become available, load data if consumer is mounted
  useEffect(() => {
    if (shouldLoadRef.current && canViewFinances) {
      loadFinances()
    }
  }, [canViewFinances])

  // CRUD operations
  const createFinance = async (projectId: string, data: Partial<Finance>): Promise<Finance | null> => {
    if (!user || !currentTenant || !canEditFinances) {
      throw new Error('Insufficient permissions to create financial records')
    }

    try {
      const financeData = {
        project_id: projectId,
        tenant_id: currentTenant.id,
        created_by: user.id,
        ...data
      }

      const { data: result, error } = await supabase
        .from('finances')
        .insert(financeData)
        .select()
        .single()

      if (error) throw error

      setFinances(prev => [result, ...prev])
      return result
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to create financial record')
    }
  }

  const updateFinance = async (id: string, data: Partial<Finance>): Promise<Finance | null> => {
    if (!canEditFinances) {
      throw new Error('Insufficient permissions to update financial records')
    }

    try {
      const { data: result, error } = await supabase
        .from('finances')
        .update(data)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      setFinances(prev => prev.map(f => f.id === id ? result : f))
      return result
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to update financial record')
    }
  }

  const deleteFinance = async (id: string): Promise<boolean> => {
    if (!canEditFinances) {
      throw new Error('Insufficient permissions to delete financial records')
    }

    try {
      const { error } = await supabase
        .from('finances')
        .delete()
        .eq('id', id)

      if (error) throw error

      setFinances(prev => prev.filter(f => f.id !== id))
      return true
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to delete financial record')
    }
  }

  const getFinanceByProject = async (projectId: string): Promise<Finance | null> => {
    if (!canViewFinances) return null

    try {
      const { data, error } = await supabase
        .from('finances')
        .select('*')
        .eq('project_id', projectId)
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 = not found
        throw error
      }

      return data
    } catch (err) {
      console.error('Error fetching finance by project:', err)
      return null
    }
  }

  const getFinancialSummary = async (projectId: string): Promise<FinancialSummary | null> => {
    if (!canViewFinances) return null

    try {
      const { data, error } = await supabase
        .rpc('get_project_financial_summary', { p_project_id: projectId })

      if (error) throw error

      return data
    } catch (err) {
      console.error('Error fetching financial summary:', err)
      return null
    }
  }

  const getTenantFinancials = async (): Promise<Finance[]> => {
    if (!canViewFinances) return []

    try {
      const { data, error } = await supabase
        .from('finances')
        .select('*')
        .eq('tenant_id', currentTenant?.id)
        .order('updated_at', { ascending: false })

      if (error) throw error

      return data || []
    } catch (err) {
      console.error('Error fetching tenant financials:', err)
      return []
    }
  }

  const updateProjectFinancials = async (projectId: string, updates: Partial<Finance>): Promise<boolean> => {
    if (!canEditFinances) {
      throw new Error('Insufficient permissions to update project financials')
    }

    try {
      const { error } = await supabase
        .from('finances')
        .update(updates)
        .eq('project_id', projectId)
        .eq('tenant_id', currentTenant?.id)

      if (error) throw error

      // Refresh the finances list
      await loadFinances()
      return true
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to update project financials')
    }
  }

  const value: FinanceContextType = {
    finances,
    loading,
    error,
    canViewFinances,
    canEditFinances,
    createFinance,
    updateFinance,
    deleteFinance,
    getFinanceByProject,
    getFinancialSummary,
    getTenantFinancials,
    updateProjectFinancials,
    _ensureLoaded,
  } as any

  return (
    <FinanceContext.Provider value={value}>
      {children}
    </FinanceContext.Provider>
  )
}