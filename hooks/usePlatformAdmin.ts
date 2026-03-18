import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { errorLogger } from '../lib/errorLogger'
import { useAuth } from './useAuth'

export interface PlatformTenant {
  id: string
  name: string
  slug: string
  status: string
  plan: string
  owner_id: string
  logo_url: string | null
  contact_email: string | null
  contact_name: string | null
  trial_ends_at: string | null
  suspended_at: string | null
  suspended_reason: string | null
  notes: string | null
  created_at: string
  user_count: number
  project_count: number
  task_count: number
  owner_email: string | null
  last_activity: string | null
}

export interface PlatformDashboard {
  total_tenants: number
  active_tenants: number
  suspended_tenants: number
  trial_tenants: number
  total_users: number
  total_projects: number
  tenants_created_last_30d: number
  tenants: PlatformTenant[]
}

export interface CreateTenantParams {
  name: string
  slug: string
  ownerEmail: string
  plan?: string
  contactEmail?: string
  contactName?: string
}

export function usePlatformAdmin() {
  const { user } = useAuth()
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [dashboard, setDashboard] = useState<PlatformDashboard | null>(null)
  const [dashboardLoading, setDashboardLoading] = useState(false)

  // Check if current user is platform admin
  useEffect(() => {
    if (!user) {
      setIsPlatformAdmin(false)
      setIsLoading(false)
      return
    }

    const check = async () => {
      try {
        const { data, error } = await supabase.rpc('is_platform_admin')
        if (!error && data === true) {
          setIsPlatformAdmin(true)
        } else {
          setIsPlatformAdmin(false)
        }
      } catch {
        setIsPlatformAdmin(false)
      } finally {
        setIsLoading(false)
      }
    }

    check()
  }, [user?.id])

  const fetchDashboard = useCallback(async () => {
    if (!isPlatformAdmin) return
    setDashboardLoading(true)
    try {
      const { data, error } = await supabase.rpc('platform_get_dashboard')
      if (error) throw error
      setDashboard(data as PlatformDashboard)
    } catch (err) {
      errorLogger.error('Error fetching platform dashboard:', err)
    } finally {
      setDashboardLoading(false)
    }
  }, [isPlatformAdmin])

  const createTenant = useCallback(async (params: CreateTenantParams): Promise<string | null> => {
    if (!isPlatformAdmin) return null
    try {
      const { data, error } = await supabase.rpc('platform_create_tenant', {
        p_name: params.name,
        p_slug: params.slug,
        p_owner_email: params.ownerEmail,
        p_plan: params.plan || 'starter',
        p_contact_email: params.contactEmail || null,
        p_contact_name: params.contactName || null,
      })
      if (error) throw error
      // Refresh dashboard after creating
      await fetchDashboard()
      return data as string
    } catch (err: any) {
      errorLogger.error('Error creating tenant:', err)
      throw new Error(err.message || 'Failed to create tenant')
    }
  }, [isPlatformAdmin, fetchDashboard])

  const suspendTenant = useCallback(async (tenantId: string, reason?: string) => {
    if (!isPlatformAdmin) return
    try {
      const { error } = await supabase.rpc('platform_suspend_tenant', {
        p_tenant_id: tenantId,
        p_reason: reason || null,
      })
      if (error) throw error
      await fetchDashboard()
    } catch (err) {
      errorLogger.error('Error suspending tenant:', err)
      throw err
    }
  }, [isPlatformAdmin, fetchDashboard])

  const reactivateTenant = useCallback(async (tenantId: string) => {
    if (!isPlatformAdmin) return
    try {
      const { error } = await supabase.rpc('platform_reactivate_tenant', {
        p_tenant_id: tenantId,
      })
      if (error) throw error
      await fetchDashboard()
    } catch (err) {
      errorLogger.error('Error reactivating tenant:', err)
      throw err
    }
  }, [isPlatformAdmin, fetchDashboard])

  const updateTenant = useCallback(async (tenantId: string, updates: Record<string, any>) => {
    if (!isPlatformAdmin) return
    try {
      const { error } = await supabase.rpc('platform_update_tenant', {
        p_tenant_id: tenantId,
        p_updates: updates,
      })
      if (error) throw error
      await fetchDashboard()
    } catch (err) {
      errorLogger.error('Error updating tenant:', err)
      throw err
    }
  }, [isPlatformAdmin, fetchDashboard])

  const switchToTenant = useCallback(async (tenantId: string) => {
    if (!isPlatformAdmin) return
    try {
      const { error } = await supabase.rpc('platform_switch_to_tenant', {
        p_tenant_id: tenantId,
      })
      if (error) throw error
      window.location.reload()
    } catch (err) {
      errorLogger.error('Error switching to tenant:', err)
      throw err
    }
  }, [isPlatformAdmin])

  const returnToHomeTenant = useCallback(async () => {
    if (!isPlatformAdmin) return
    try {
      const { error } = await supabase.rpc('platform_return_to_home_tenant')
      if (error) throw error
      window.location.reload()
    } catch (err) {
      errorLogger.error('Error returning to home tenant:', err)
      throw err
    }
  }, [isPlatformAdmin])

  const seedDemoData = useCallback(async (tenantSlug: string): Promise<string | null> => {
    if (!isPlatformAdmin || !user) return null
    try {
      const { data, error } = await supabase.rpc('platform_seed_demo_data', {
        p_tenant_slug: tenantSlug,
        p_user_id: user.id,
      })
      if (error) throw error
      await fetchDashboard()
      return data as string
    } catch (err: any) {
      errorLogger.error('Error seeding demo data:', err)
      throw new Error(err.message || 'Failed to seed demo data')
    }
  }, [isPlatformAdmin, user, fetchDashboard])

  return {
    isPlatformAdmin,
    isLoading,
    dashboard,
    dashboardLoading,
    fetchDashboard,
    createTenant,
    suspendTenant,
    reactivateTenant,
    updateTenant,
    switchToTenant,
    returnToHomeTenant,
    seedDemoData,
  }
}
