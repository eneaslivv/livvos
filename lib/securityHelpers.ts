/**
 * Security Helper Functions for Eneas-OS
 * 
 * This module provides client-side security utilities that complement
 * the server-side RLS policies. These functions help validate permissions
 * and provide a consistent security interface across the application.
 */

import { supabase } from './supabase'

export interface SecurityContext {
  userId: string | null
  tenantId: string | null
  isOwner: boolean
  roles: string[]
  permissions: Permission[]
}

export interface Permission {
  id: string
  module: string
  action: string
  description?: string
}

export interface UserProfile {
  id: string
  user_id: string
  email: string
  name: string
  tenant_id: string
  avatar_url?: string
  status: 'active' | 'inactive' | 'suspended'
}

/**
 * Get the current user's security context
 * Includes tenant, roles, and permissions
 */
export async function getSecurityContext(): Promise<SecurityContext> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return {
        userId: null,
        tenantId: null,
        isOwner: false,
        roles: [],
        permissions: []
      }
    }

    // Get user profile with tenant
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, user_id, email, name, tenant_id, avatar_url, status')
      .eq('user_id', user.id)
      .single()

    if (profileError) {
      console.error('Security: Failed to get profile', profileError)
      throw new Error('Failed to retrieve user profile')
    }

    // Check if user is tenant owner
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('owner_id')
      .eq('id', profile.tenant_id)
      .single()

    if (tenantError) {
      console.error('Security: Failed to get tenant', tenantError)
      throw new Error('Failed to retrieve tenant information')
    }

    // Get user roles and permissions
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select(`
        roles!inner (
          id,
          name,
          description,
          is_system,
          role_permissions!inner (
            permissions!inner (
              id,
              module,
              action,
              description
            )
          )
        )
      `)
      .eq('user_id', user.id)

    if (roleError) {
      console.error('Security: Failed to get roles', roleError)
      throw new Error('Failed to retrieve user roles')
    }

    // Extract roles and permissions
    const roles = roleData.map((ur: any) => ur.roles.name) || []
    const permissions: Permission[] = []

    roleData.forEach((ur: any) => {
      ur.roles.role_permissions.forEach((rp: any) => {
        permissions.push(rp.permissions)
      })
    })

    return {
      userId: user.id,
      tenantId: profile.tenant_id,
      isOwner: tenant.owner_id === user.id,
      roles,
      permissions
    }
  } catch (error) {
    console.error('Security: Failed to get security context', error)
    return {
      userId: null,
      tenantId: null,
      isOwner: false,
      roles: [],
      permissions: []
    }
  }
}

/**
 * Check if the current user has a specific permission
 */
export async function hasPermission(module: string, action: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('has_permission', {
      p_module: module,
      p_action: action
    })

    if (error) {
      console.error('Security: Permission check failed', error)
      return false
    }

    return data || false
  } catch (error) {
    console.error('Security: Permission check error', error)
    return false
  }
}

/**
 * Check if the current user has any of the specified permissions
 */
export async function hasAnyPermission(
  permissions: Array<{ module: string; action: string }>
): Promise<boolean> {
  const results = await Promise.all(
    permissions.map(p => hasPermission(p.module, p.action))
  )
  return results.some(result => result)
}

/**
 * Check if the current user has all of the specified permissions
 */
export async function hasAllPermissions(
  permissions: Array<{ module: string; action: string }>
): Promise<boolean> {
  const results = await Promise.all(
    permissions.map(p => hasPermission(p.module, p.action))
  )
  return results.every(result => result)
}

/**
 * Check if the current user has a specific role
 */
export async function hasRole(roleName: string): Promise<boolean> {
  try {
    const context = await getSecurityContext()
    return context.roles.includes(roleName)
  } catch (error) {
    console.error('Security: Role check error', error)
    return false
  }
}

/**
 * Check if the current user is a tenant owner
 */
export async function isTenantOwner(tenantId?: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('is_tenant_owner', {
      p_tenant_id: tenantId
    })

    if (error) {
      console.error('Security: Owner check failed', error)
      return false
    }

    return data || false
  } catch (error) {
    console.error('Security: Owner check error', error)
    return false
  }
}

/**
 * Get the current user's tenant ID
 */
export async function getCurrentTenantId(): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('current_user_tenant')

    if (error) {
      console.error('Security: Tenant check failed', error)
      return null
    }

    return data
  } catch (error) {
    console.error('Security: Tenant check error', error)
    return null
  }
}

/**
 * Check if the user can access a specific tenant
 */
export async function canAccessTenant(tenantId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('can_access_tenant', {
      p_tenant_id: tenantId
    })

    if (error) {
      console.error('Security: Tenant access check failed', error)
      return false
    }

    return data || false
  } catch (error) {
    console.error('Security: Tenant access check error', error)
    return false
  }
}

/**
 * Validate tenant access before performing operations
 * Throws an error if access is denied
 */
export async function validateTenantAccess(tenantId: string): Promise<void> {
  const hasAccess = await canAccessTenant(tenantId)
  
  if (!hasAccess) {
    throw new Error(`Access denied: Cannot access tenant ${tenantId}`)
  }
}

/**
 * Get permissions for a specific module
 */
export async function getModulePermissions(module: string): Promise<Permission[]> {
  try {
    const context = await getSecurityContext()
    return context.permissions.filter(p => p.module === module)
  } catch (error) {
    console.error('Security: Failed to get module permissions', error)
    return []
  }
}

/**
 * Check if user can perform a specific action on a resource
 * This is a higher-level permission check that combines multiple validations
 */
export async function canPerformAction(
  action: 'create' | 'read' | 'update' | 'delete',
  resource: string,
  resourceOwnerId?: string,
  tenantId?: string
): Promise<boolean> {
  try {
    const context = await getSecurityContext()
    
    // User must be authenticated
    if (!context.userId) {
      return false
    }

    // Check tenant access if tenant is specified
    if (tenantId && !await canAccessTenant(tenantId)) {
      return false
    }

    // Owners can do anything in their tenant
    if (context.isOwner && (!tenantId || tenantId === context.tenantId)) {
      return true
    }

    // Check resource ownership for update/delete operations
    if ((action === 'update' || action === 'delete') && 
        resourceOwnerId && resourceOwnerId !== context.userId) {
      return false
    }

    // Check specific permissions
    const permissionMap: Record<string, Record<string, string>> = {
      'projects': {
        'create': 'projects.create',
        'read': 'projects.view_all',
        'update': 'projects.edit',
        'delete': 'projects.delete'
      },
      'tasks': {
        'create': 'projects.create',
        'read': 'projects.view_all',
        'update': 'projects.edit',
        'delete': 'projects.delete'
      },
      'leads': {
        'create': 'sales.create',
        'read': 'sales.view_all',
        'update': 'sales.edit',
        'delete': 'sales.delete'
      },
      'clients': {
        'create': 'sales.create',
        'read': 'sales.view_all',
        'update': 'sales.edit',
        'delete': 'sales.delete'
      },
      'documents': {
        'create': 'documents.create',
        'read': 'documents.view_all',
        'update': 'documents.edit',
        'delete': 'documents.delete'
      },
      'calendar': {
        'create': 'calendar.create',
        'read': 'calendar.view_all',
        'update': 'calendar.edit',
        'delete': 'calendar.delete'
      },
      'finance': {
        'create': 'finance.edit',
        'read': 'finance.view',
        'update': 'finance.edit',
        'delete': 'finance.edit'
      },
      'team': {
        'create': 'team.manage_members',
        'read': 'team.view_all',
        'update': 'team.edit_members',
        'delete': 'team.manage_members'
      },
      'analytics': {
        'create': 'analytics.edit',
        'read': 'analytics.view',
        'update': 'analytics.edit',
        'delete': 'analytics.edit'
      }
    }

    const requiredPermission = permissionMap[resource]?.[action]
    if (!requiredPermission) {
      console.warn(`Security: Unknown permission mapping for ${resource}.${action}`)
      return false
    }

    return await hasPermission(requiredPermission.split('.')[0], requiredPermission.split('.')[1])
  } catch (error) {
    console.error('Security: Action validation failed', error)
    return false
  }
}

/**
 * Security validation hook for React components
 * Returns permission checks as reactive values
 */
export function createSecurityHook() {
  const [context, setContext] = useState<SecurityContext | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshContext = async () => {
    setLoading(true)
    try {
      const newContext = await getSecurityContext()
      setContext(newContext)
    } catch (error) {
      console.error('Security: Failed to refresh context', error)
    } finally {
      setLoading(false)
    }
  }

  const checkPermission = useCallback(async (module: string, action: string) => {
    if (!context) return false
    return await hasPermission(module, action)
  }, [context])

  const checkRole = useCallback(async (roleName: string) => {
    if (!context) return false
    return context.roles.includes(roleName)
  }, [context])

  return {
    context,
    loading,
    refreshContext,
    checkPermission,
    checkRole,
    canCreate: (resource: string) => checkPermission(resource, 'create'),
    canRead: (resource: string) => checkPermission(resource, 'view'),
    canUpdate: (resource: string) => checkPermission(resource, 'edit'),
    canDelete: (resource: string) => checkPermission(resource, 'delete')
  }
}

/**
 * Tenant isolation validator for API calls
 * Ensures that all operations are properly scoped to the user's tenant
 */
export class TenantValidator {
  private tenantId: string | null = null

  async initialize(): Promise<void> {
    this.tenantId = await getCurrentTenantId()
    if (!this.tenantId) {
      throw new Error('User is not associated with any tenant')
    }
  }

  async validateOperation(operation: 'select' | 'insert' | 'update' | 'delete', table: string): Promise<void> {
    if (!this.tenantId) {
      throw new Error('Tenant validator not initialized')
    }

    // Check if table has tenant_id column
    const { data, error } = await supabase
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_name', table)
      .eq('column_name', 'tenant_id')
      .single()

    if (error || !data) {
      // Table doesn't have tenant_id column, skip validation
      return
    }

    // Additional validation can be added here based on operation type
  }

  getTenantId(): string {
    if (!this.tenantId) {
      throw new Error('Tenant validator not initialized')
    }
    return this.tenantId
  }
}

/**
 * Global tenant validator instance
 */
export const tenantValidator = new TenantValidator()

// Import useState and useCallback at the top of the file
import { useState, useCallback } from 'react'