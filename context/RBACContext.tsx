import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { errorLogger } from '../lib/errorLogger';
import { useTenant } from './TenantContext';

// RBAC Types
export interface Permission {
  id: string;
  module: string;
  action: string;
  description?: string;
  created_at: string;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
  status: 'active' | 'inactive' | 'suspended';
  tenant_id: string;
  created_at: string;
  updated_at: string;
}

export type ModuleType =
  | 'auth'
  | 'tenant'
  | 'security'
  | 'projects'
  | 'team'
  | 'calendar'
  | 'documents'
  | 'sales'
  | 'finance'
  | 'analytics'
  | 'system';

export type ActionType =
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'manage'
  | 'assign'
  | 'view_dashboard'
  | 'view_leads'
  | 'view_analytics'
  | 'access';

export interface UserPermission {
  role_id: string;
  permission: Permission;
}

export interface UserRole {
  user_id: string;
  role: Role;
  permissions: Permission[];
}

interface RBACContextType {
  // User data
  user: UserProfile | null;
  roles: Role[];
  permissions: Permission[];
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;

  // Permission checking methods
  hasPermission: (module: ModuleType, action: ActionType) => boolean;
  hasRole: (roleName: string) => boolean;
  hasAnyRole: (roleNames: string[]) => boolean;
  isAdmin: () => boolean;
  isOwner: () => boolean;

  // Role management
  createRole: (roleData: Omit<Role, 'id' | 'created_at' | 'updated_at'>) => Promise<Role>;
  updateRole: (roleId: string, updates: Partial<Role>) => Promise<Role>;
  deleteRole: (roleId: string) => Promise<void>;
  getRole: (roleId: string) => Promise<Role | null>;
  getAllRoles: () => Promise<Role[]>;

  // Permission management
  createPermission: (permissionData: Omit<Permission, 'id' | 'created_at'>) => Promise<Permission>;
  updatePermission: (permissionId: string, updates: Partial<Permission>) => Promise<Permission>;
  deletePermission: (permissionId: string) => Promise<void>;
  getAllPermissions: () => Promise<Permission[]>;

  // Role-Permission assignments
  assignPermissionToRole: (roleId: string, permissionId: string) => Promise<void>;
  removePermissionFromRole: (roleId: string, permissionId: string) => Promise<void>;
  getRolePermissions: (roleId: string) => Promise<Permission[]>;

  // User-Role assignments
  assignRoleToUser: (userId: string, roleId: string) => Promise<void>;
  removeRoleFromUser: (userId: string, roleId: string) => Promise<void>;
  getUserRoles: (userId: string) => Promise<UserRole[]>;
  getUserPermissions: (userId: string) => Promise<Permission[]>;

  // Utility functions
  refreshRBAC: () => Promise<void>;
  checkAccess: (module: ModuleType, action: ActionType) => { allowed: boolean; reason?: string };
  getUserRoleHierarchy: () => number; // Returns hierarchy level (owner=0, admin=1, etc.)

  // Security functions
  logPermissionCheck: (module: ModuleType, action: ActionType, allowed: boolean) => Promise<void>;
  getPermissionAudit: (userId?: string, startDate?: string, endDate?: string) => Promise<any[]>;
}

const RBACContext = createContext<RBACContextType | undefined>(undefined);

export const useRBAC = () => {
  const context = useContext(RBACContext);
  if (context === undefined) {
    throw new Error('useRBAC must be used within an RBACProvider');
  }
  return context;
};

interface RBACProviderProps {
  children: React.ReactNode;
}

export const RBACProvider: React.FC<RBACProviderProps> = ({ children }) => {
  const { user: authUser, loading: authLoading } = useAuth();
  const { currentTenant } = useTenant();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [userRoleAssignments, setUserRoleAssignments] = useState<UserRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const hasLoadedRef = useRef(false);

  // Load RBAC data
  const loadRBACData = useCallback(async () => {
    console.log('[RBACContext] loadRBACData triggered. User:', authUser?.id, 'AuthLoading:', authLoading);
    if (authLoading) return;

    // Only show loading spinner on first load, not on background re-fetches
    if (!hasLoadedRef.current) {
      setIsLoading(true);
    }
    setError(null);

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const fetchProfileWithRetry = async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authUser?.id)
          .single();

        if (!profileError && profile?.tenant_id) {
          return profile as UserProfile;
        }

        if (profileError) {
          console.warn('[RBACContext] Profile not ready yet:', profileError.message);
        } else {
          console.warn('[RBACContext] User is not assigned to any tenant yet.');
        }

        if (attempt < 4) {
          await sleep(250 * (attempt + 1));
        }
      }

      return null;
    };

    try {
      if (!authUser) {
        // Clear data on logout
        setUser(null);
        setRoles([]);
        setPermissions([]);
        setUserRoleAssignments([]);
        setIsInitialized(false);
        return;
      }

      const rolesPromise = supabase
        .from('user_roles')
        .select(`
          role_id,
          roles (
            id,
            name,
            description,
            is_system,
            role_permissions (
              permissions (
                id,
                module,
                action,
                description
              )
            )
          )
        `)
        .eq('user_id', authUser.id);

      // 1. Fetch user profile with short retry window
      const profile = await fetchProfileWithRetry();

      if (!profile) {
        setUser(null);
        setRoles([]);
        setPermissions([]);
        setUserRoleAssignments([]);
        setIsInitialized(false);
        return;
      }

      setUser(profile);
      console.log('[RBACContext] Profile loaded:', profile.id, 'Tenant:', profile.tenant_id);

      // 2. Fetch user roles with permissions
      const { data: userRoles, error: rolesError } = await rolesPromise;

      if (rolesError) {
        throw new Error(`Failed to fetch user roles: ${rolesError.message}`);
      }

      const rolesWithPermissions: UserRole[] = (userRoles || []).map((ur: any) => ({
        user_id: authUser.id,
        role: ur.roles,
        permissions: (ur.roles.role_permissions || []).map((rp: any) => rp.permissions)
      }));

      setUserRoleAssignments(rolesWithPermissions);

      // Extract all roles and permissions
      const allRoles = rolesWithPermissions.map(ur => ur.role);
      const allPermissions = rolesWithPermissions.flatMap(ur => ur.permissions);

      setRoles(allRoles);
      setPermissions(allPermissions);

      console.log('[RBACContext] Roles loaded:', allRoles.map(r => r.name));

      hasLoadedRef.current = true;
      setIsInitialized(true);

    } catch (err) {
      console.error('[RBACContext] Error loading RBAC data:', err);
      errorLogger.error('Error loading RBAC data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load RBAC data');

      // Only clear state if this was the first load attempt;
      // if already initialized, keep existing data to avoid UI flicker
      if (!hasLoadedRef.current) {
        setUser(null);
        setRoles([]);
        setPermissions([]);
        setUserRoleAssignments([]);
        setIsInitialized(false);
      }
    } finally {
      setIsLoading(false);
    }
  }, [authUser, authLoading, currentTenant?.id]);

  // Utility: refresh RBAC data (declared early so CRUD functions below can reference it)
  const refreshRBAC = useCallback(async () => {
    await loadRBACData();
  }, [loadRBACData]);

  // Permission checking — hasRole must be declared before hasPermission (TDZ)
  const hasRole = useCallback((roleName: string): boolean => {
    if (!user || !isInitialized) return false;

    return roles.some(role =>
      role.name.toLowerCase() === roleName.toLowerCase()
    );
  }, [user, roles, isInitialized]);

  const hasPermission = useCallback((module: ModuleType, action: ActionType): boolean => {
    if (!user || !isInitialized) return false;

    // Owner role has all permissions
    if (hasRole('owner')) return true;

    // Check if user has explicit permission
    return permissions.some(p => p.module === module && p.action === action);
  }, [user, permissions, isInitialized, hasRole]);

  const hasAnyRole = useCallback((roleNames: string[]): boolean => {
    if (!user || !isInitialized) return false;

    return roleNames.some(roleName => hasRole(roleName));
  }, [user, isInitialized, hasRole]);

  const isAdmin = useCallback((): boolean => {
    return hasRole('admin') || hasRole('owner');
  }, [hasRole]);

  const isOwner = useCallback((): boolean => {
    return hasRole('owner');
  }, [hasRole]);

  // Role management
  const createRole = useCallback(async (roleData: Omit<Role, 'id' | 'created_at' | 'updated_at'>): Promise<Role> => {
    if (!hasPermission('security', 'manage')) {
      throw new Error('Insufficient permissions to create roles');
    }

    try {
      const { data, error } = await supabase
        .from('roles')
        .insert({
          ...roleData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      await refreshRBAC();
      return data;
    } catch (err) {
      errorLogger.error('Error creating role:', err);
      throw new Error(err instanceof Error ? err.message : 'Failed to create role');
    }
  }, [hasPermission, refreshRBAC]);

  const updateRole = useCallback(async (roleId: string, updates: Partial<Role>): Promise<Role> => {
    if (!hasPermission('security', 'manage')) {
      throw new Error('Insufficient permissions to update roles');
    }

    try {
      const { data, error } = await supabase
        .from('roles')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', roleId)
        .select()
        .single();

      if (error) throw error;

      await refreshRBAC();
      return data;
    } catch (err) {
      errorLogger.error('Error updating role:', err);
      throw new Error(err instanceof Error ? err.message : 'Failed to update role');
    }
  }, [hasPermission, refreshRBAC]);

  const deleteRole = useCallback(async (roleId: string) => {
    if (!hasPermission('security', 'manage')) {
      throw new Error('Insufficient permissions to delete roles');
    }

    try {
      const { error } = await supabase
        .from('roles')
        .delete()
        .eq('id', roleId)
        .eq('is_system', false); // Prevent deletion of system roles

      if (error) throw error;

      await refreshRBAC();
    } catch (err) {
      errorLogger.error('Error deleting role:', err);
      throw new Error(err instanceof Error ? err.message : 'Failed to delete role');
    }
  }, [hasPermission, refreshRBAC]);

  const getRole = useCallback(async (roleId: string): Promise<Role | null> => {
    try {
      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .eq('id', roleId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data;
    } catch (err) {
      errorLogger.error('Error fetching role:', err);
      return null;
    }
  }, []);

  const getAllRoles = useCallback(async (): Promise<Role[]> => {
    try {
      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .order('name');

      if (error) throw error;
      return data || [];
    } catch (err) {
      errorLogger.error('Error fetching all roles:', err);
      return [];
    }
  }, []);

  // Permission management
  const createPermission = useCallback(async (permissionData: Omit<Permission, 'id' | 'created_at'>): Promise<Permission> => {
    if (!hasPermission('security', 'manage')) {
      throw new Error('Insufficient permissions to create permissions');
    }

    try {
      const { data, error } = await supabase
        .from('permissions')
        .insert({
          ...permissionData,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      await refreshRBAC();
      return data;
    } catch (err) {
      errorLogger.error('Error creating permission:', err);
      throw new Error(err instanceof Error ? err.message : 'Failed to create permission');
    }
  }, [hasPermission, refreshRBAC]);

  const updatePermission = useCallback(async (permissionId: string, updates: Partial<Permission>): Promise<Permission> => {
    if (!hasPermission('security', 'manage')) {
      throw new Error('Insufficient permissions to update permissions');
    }

    try {
      const { data, error } = await supabase
        .from('permissions')
        .update(updates)
        .eq('id', permissionId)
        .select()
        .single();

      if (error) throw error;

      await refreshRBAC();
      return data;
    } catch (err) {
      errorLogger.error('Error updating permission:', err);
      throw new Error(err instanceof Error ? err.message : 'Failed to update permission');
    }
  }, [hasPermission, refreshRBAC]);

  const deletePermission = useCallback(async (permissionId: string) => {
    if (!hasPermission('security', 'manage')) {
      throw new Error('Insufficient permissions to delete permissions');
    }

    try {
      const { error } = await supabase
        .from('permissions')
        .delete()
        .eq('id', permissionId);

      if (error) throw error;

      await refreshRBAC();
    } catch (err) {
      errorLogger.error('Error deleting permission:', err);
      throw new Error(err instanceof Error ? err.message : 'Failed to delete permission');
    }
  }, [hasPermission, refreshRBAC]);

  const getAllPermissions = useCallback(async (): Promise<Permission[]> => {
    try {
      const { data, error } = await supabase
        .from('permissions')
        .select('*')
        .order('module, action');

      if (error) throw error;
      return data || [];
    } catch (err) {
      errorLogger.error('Error fetching all permissions:', err);
      return [];
    }
  }, []);

  // Role-Permission assignments
  const assignPermissionToRole = useCallback(async (roleId: string, permissionId: string) => {
    if (!hasPermission('security', 'manage')) {
      throw new Error('Insufficient permissions to assign permissions');
    }

    try {
      const { error } = await supabase
        .from('role_permissions')
        .insert({
          role_id: roleId,
          permission_id: permissionId
        });

      if (error) throw error;

      await refreshRBAC();
    } catch (err) {
      errorLogger.error('Error assigning permission to role:', err);
      throw new Error(err instanceof Error ? err.message : 'Failed to assign permission');
    }
  }, [hasPermission, refreshRBAC]);

  const removePermissionFromRole = useCallback(async (roleId: string, permissionId: string) => {
    if (!hasPermission('security', 'manage')) {
      throw new Error('Insufficient permissions to remove permissions');
    }

    try {
      const { error } = await supabase
        .from('role_permissions')
        .delete()
        .eq('role_id', roleId)
        .eq('permission_id', permissionId);

      if (error) throw error;

      await refreshRBAC();
    } catch (err) {
      errorLogger.error('Error removing permission from role:', err);
      throw new Error(err instanceof Error ? err.message : 'Failed to remove permission');
    }
  }, [hasPermission, refreshRBAC]);

  const getRolePermissions = useCallback(async (roleId: string): Promise<Permission[]> => {
    try {
      const { data, error } = await supabase
        .from('role_permissions')
        .select('permissions(*)')
        .eq('role_id', roleId);

      if (error) throw error;

      return (data || []).map((rp: any) => rp.permissions);
    } catch (err) {
      errorLogger.error('Error fetching role permissions:', err);
      return [];
    }
  }, []);

  // User-Role assignments
  const assignRoleToUser = useCallback(async (userId: string, roleId: string) => {
    if (!hasPermission('security', 'assign')) {
      throw new Error('Insufficient permissions to assign roles');
    }

    try {
      const { error } = await supabase
        .from('user_roles')
        .insert({
          user_id: userId,
          role_id: roleId
        });

      if (error) throw error;

      // If assigning to current user, refresh their RBAC data
      if (userId === authUser?.id) {
        await refreshRBAC();
      }
    } catch (err) {
      errorLogger.error('Error assigning role to user:', err);
      throw new Error(err instanceof Error ? err.message : 'Failed to assign role');
    }
  }, [hasPermission, authUser?.id, refreshRBAC]);

  const removeRoleFromUser = useCallback(async (userId: string, roleId: string) => {
    if (!hasPermission('security', 'assign')) {
      throw new Error('Insufficient permissions to remove roles');
    }

    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role_id', roleId);

      if (error) throw error;

      // If removing from current user, refresh their RBAC data
      if (userId === authUser?.id) {
        await refreshRBAC();
      }
    } catch (err) {
      errorLogger.error('Error removing role from user:', err);
      throw new Error(err instanceof Error ? err.message : 'Failed to remove role');
    }
  }, [hasPermission, authUser?.id, refreshRBAC]);

  const getUserRoles = useCallback(async (userId: string): Promise<UserRole[]> => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select(`
          role_id,
          roles (*)
        `)
        .eq('user_id', userId);

      if (error) throw error;

      return (data || []).map((ur: any) => ({
        user_id: userId,
        role: ur.roles,
        permissions: [] // Would need to fetch separately if needed
      }));
    } catch (err) {
      errorLogger.error('Error fetching user roles:', err);
      return [];
    }
  }, []);

  const getUserPermissions = useCallback(async (userId: string): Promise<Permission[]> => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select(`
          roles (
            role_permissions (
              permissions (*)
            )
          )
        `)
        .eq('user_id', userId);

      if (error) throw error;

      return (data || []).flatMap((ur: any) =>
        (ur.roles.role_permissions || []).map((rp: any) => rp.permissions)
      );
    } catch (err) {
      errorLogger.error('Error fetching user permissions:', err);
      return [];
    }
  }, []);

  const checkAccess = useCallback((module: ModuleType, action: ActionType) => {
    const allowed = hasPermission(module, action);
    let reason: string | undefined;

    if (!allowed) {
      if (!user) {
        reason = 'User not authenticated';
      } else if (!isInitialized) {
        reason = 'RBAC not initialized';
      } else if (!hasRole('owner')) {
        reason = `User lacks permission for ${module}:${action}`;
      }
    }

    return { allowed, reason };
  }, [hasPermission, user, isInitialized, hasRole]);

  const getUserRoleHierarchy = useCallback((): number => {
    if (hasRole('owner')) return 0;
    if (hasRole('admin')) return 1;
    if (hasRole('manager')) return 2;
    if (hasRole('lead')) return 3;
    return 4; // Regular user
  }, [hasRole]);

  // Security functions
  const logPermissionCheck = useCallback(async (module: ModuleType, action: ActionType, allowed: boolean) => {
    if (!user) return;

    try {
      await supabase
        .from('permission_audit_log')
        .insert({
          user_id: user.id,
          tenant_id: user.tenant_id,
          module,
          action,
          allowed,
          timestamp: new Date().toISOString()
        });
    } catch (err) {
      errorLogger.error('Error logging permission check:', err);
    }
  }, [user]);

  const getPermissionAudit = useCallback(async (userId?: string, startDate?: string, endDate?: string) => {
    if (!hasPermission('security', 'view')) {
      throw new Error('Insufficient permissions to view audit logs');
    }

    try {
      let query = supabase
        .from('permission_audit_log')
        .select('*')
        .order('timestamp', { ascending: false });

      if (userId) {
        query = query.eq('user_id', userId);
      }
      if (startDate) {
        query = query.gte('timestamp', startDate);
      }
      if (endDate) {
        query = query.lte('timestamp', endDate);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    } catch (err) {
      errorLogger.error('Error fetching permission audit:', err);
      return [];
    }
  }, [hasPermission]);

  // Initialize on mount and when auth state changes
  useEffect(() => {
    loadRBACData();
  }, [loadRBACData]);

  // Note: No cleanup on unmount — this provider stays mounted for the entire
  // app lifecycle. Clearing state here would cause flicker on React strict-mode
  // re-mounts and serve no real purpose since the provider never unmounts.

  const value: RBACContextType = {
    // User data
    user,
    roles,
    permissions,
    isLoading,
    error,
    isInitialized,

    // Permission checking methods
    hasPermission,
    hasRole,
    hasAnyRole,
    isAdmin,
    isOwner,

    // Role management
    createRole,
    updateRole,
    deleteRole,
    getRole,
    getAllRoles,

    // Permission management
    createPermission,
    updatePermission,
    deletePermission,
    getAllPermissions,

    // Role-Permission assignments
    assignPermissionToRole,
    removePermissionFromRole,
    getRolePermissions,

    // User-Role assignments
    assignRoleToUser,
    removeRoleFromUser,
    getUserRoles,
    getUserPermissions,

    // Utility functions
    refreshRBAC,
    checkAccess,
    getUserRoleHierarchy,

    // Security functions
    logPermissionCheck,
    getPermissionAudit,
  };

  return (
    <RBACContext.Provider value={value}>
      {children}
    </RBACContext.Provider>
  );
};
