import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { errorLogger } from '../lib/errorLogger';
import { 
  credentialManager, 
  DecryptedCredential, 
  CredentialCreateInput, 
  CredentialUpdateInput,
  CREDENTIAL_TYPES 
} from '../lib/credentialManager';

// Enhanced security interfaces
export interface Permission {
  id: string;
  module: string;
  action: string;
  description?: string;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  permissions: Permission[];
}

export interface SecurityUser {
  id: string;
  email: string;
  roles: Role[];
  permissions: Permission[];
  isAdmin: boolean;
  isOwner: boolean;
  hasPermission: (module: string, action: string) => boolean;
  hasRole: (roleName: string) => boolean;
}

interface SecurityContextType {
  // User security state
  user: SecurityUser | null;
  loading: boolean;
  error: string | null;
  isInitialized: boolean;

  // Permission checks
  hasPermission: (module: string, action: string) => boolean;
  hasRole: (roleName: string) => boolean;
  isAdmin: () => boolean;
  isOwner: () => boolean;

  // Credential management
  credentials: DecryptedCredential[];
  credentialsLoading: boolean;
  createCredential: (input: CredentialCreateInput) => Promise<DecryptedCredential>;
  updateCredential: (id: string, updates: CredentialUpdateInput) => Promise<DecryptedCredential>;
  deleteCredential: (id: string) => Promise<void>;
  getCredentials: (projectId?: string) => Promise<void>;
  getCredential: (id: string) => Promise<DecryptedCredential>;

  // Role and permission management
  roles: Role[];
  permissions: Permission[];
  createRole: (role: Partial<Role>) => Promise<Role>;
  updateRole: (id: string, updates: Partial<Role>) => Promise<Role>;
  deleteRole: (id: string) => Promise<void>;
  assignRole: (userId: string, roleId: string) => Promise<void>;
  revokeRole: (userId: string, roleId: string) => Promise<void>;

  // Security utilities
  refreshSecurityData: () => Promise<void>;
  logSecurityEvent: (event: string, details?: any) => Promise<void>;
  checkCredentialAccess: (credentialId: string) => Promise<boolean>;
}

const SecurityContext = createContext<SecurityContextType | undefined>(undefined);

export const SecurityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<SecurityUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Credential state
  const [credentials, setCredentials] = useState<DecryptedCredential[]>([]);
  const [credentialsLoading, setCredentialsLoading] = useState(false);

  // Role and permission state
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);

  // Permission checking functions
  const hasPermission = useCallback((module: string, action: string): boolean => {
    if (!user) return false;
    return user.hasPermission(module, action);
  }, [user]);

  const hasRole = useCallback((roleName: string): boolean => {
    if (!user) return false;
    return user.hasRole(roleName);
  }, [user]);

  const isAdmin = useCallback((): boolean => {
    if (!user) return false;
    return user.isAdmin;
  }, [user]);

  const isOwner = useCallback((): boolean => {
    if (!user) return false;
    return user.isOwner;
  }, [user]);

  // Create SecurityUser object
  const createSecurityUser = useCallback(async (userId: string): Promise<SecurityUser | null> => {
    try {
      // Get user's roles and permissions
      const { data: userRoles, error: rolesError } = await supabase
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
        .eq('user_id', userId);

      if (rolesError) throw rolesError;

      // Extract roles and permissions
      const userRolesData: Role[] = (userRoles || []).map(ur => ({
        id: ur.roles.id,
        name: ur.roles.name,
        description: ur.roles.description || '',
        isSystem: ur.roles.is_system,
        permissions: (ur.roles.role_permissions || []).map((rp: any) => rp.permissions)
      }));

      const allPermissions = userRolesData.flatMap(role => role.permissions);

      // Check if admin
      const { data: isAdminCheck } = await supabase.rpc('is_admin', { user_id: userId });

      // Create permission checking functions
      const hasPermissionFn = (module: string, action: string): boolean => {
        // Admin has all permissions
        if (isAdminCheck) return true;
        
        // Owner role has all permissions
        if (userRolesData.some(role => role.name.toLowerCase() === 'owner')) return true;
        
        // Check specific permissions
        return allPermissions.some(
          perm => perm.module === module && perm.action === action
        );
      };

      const hasRoleFn = (roleName: string): boolean => {
        return userRolesData.some(role => role.name.toLowerCase() === roleName.toLowerCase());
      };

      return {
        id: userId,
        email: '', // Will be filled from auth context
        roles: userRolesData,
        permissions: allPermissions,
        isAdmin: isAdminCheck || false,
        isOwner: hasRoleFn('owner'),
        hasPermission: hasPermissionFn,
        hasRole: hasRoleFn
      };
    } catch (error) {
      errorLogger.error('Error creating security user', error);
      return null;
    }
  }, []);

  // Load roles and permissions (declared before initializeSecurityData to avoid TDZ)
  const loadRolesAndPermissions = useCallback(async () => {
    try {
      // Load roles
      const { data: rolesData, error: rolesError } = await supabase
        .from('roles')
        .select(`
          *,
          role_permissions (
            permissions (*)
          )
        `);

      if (rolesError) throw rolesError;

      const formattedRoles: Role[] = (rolesData || []).map((role: any) => {
        return {
          id: role.id,
          name: role.name,
          description: role.description || '',
          isSystem: role.is_system,
          permissions: (role.role_permissions || []).map((rp: any) => rp.permissions || [])
        };
      });

      setRoles(formattedRoles);

      // Load all permissions
      const { data: permissionsData, error: permissionsError } = await supabase
        .from('permissions')
        .select('*');

      if (permissionsError) throw permissionsError;
      setPermissions(permissionsData || []);
    } catch (error) {
      errorLogger.error('Error loading roles and permissions', error);
    }
  }, []);

  // Initialize security data
  const initializeSecurityData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Get current user from auth
      const { data: { user: authUser } } = await supabase.auth.getUser();

      if (!authUser) {
        setUser(null);
        setIsInitialized(true);
        setLoading(false);
        return;
      }

      // Create security user
      const securityUser = await createSecurityUser(authUser.id);

      if (securityUser) {
        securityUser.email = authUser.email || '';
        setUser(securityUser);
      }

      // Load roles and permissions
      await loadRolesAndPermissions();

      setIsInitialized(true);
    } catch (err: any) {
      errorLogger.error('Error initializing security data', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [createSecurityUser, loadRolesAndPermissions]);

  // Credential management — getCredentials declared first to avoid TDZ
  const getCredentials = useCallback(async (projectId?: string): Promise<void> => {
    try {
      setCredentialsLoading(true);

      if (!projectId) {
        const { data: userProjects } = await supabase
          .from('projects')
          .select('id')
          .or(`owner_id.eq.${user?.id}`);

        if (!userProjects || userProjects.length === 0) {
          setCredentials([]);
          return;
        }

        const projectIds = userProjects.map(p => p.id);
        const allCredentials: DecryptedCredential[] = [];

        for (const pid of projectIds) {
          const projectCredentials = await credentialManager.getProjectCredentials(pid);
          allCredentials.push(...projectCredentials);
        }

        setCredentials(allCredentials);
      } else {
        const projectCredentials = await credentialManager.getProjectCredentials(projectId);
        setCredentials(projectCredentials);
      }
    } catch (error) {
      errorLogger.error('Error getting credentials', error);
    } finally {
      setCredentialsLoading(false);
    }
  }, [user?.id]);

  const createCredential = useCallback(async (input: CredentialCreateInput): Promise<DecryptedCredential> => {
    try {
      const result = await credentialManager.createCredential(input);
      await getCredentials();
      return result;
    } catch (error) {
      errorLogger.error('Error creating credential', error);
      throw error;
    }
  }, [getCredentials]);

  const updateCredential = useCallback(async (id: string, updates: CredentialUpdateInput): Promise<DecryptedCredential> => {
    try {
      const result = await credentialManager.updateCredential(id, updates);
      await getCredentials();
      return result;
    } catch (error) {
      errorLogger.error('Error updating credential', error);
      throw error;
    }
  }, [getCredentials]);

  const deleteCredential = useCallback(async (id: string): Promise<void> => {
    try {
      await credentialManager.deleteCredential(id);
      await getCredentials();
    } catch (error) {
      errorLogger.error('Error deleting credential', error);
      throw error;
    }
  }, [getCredentials]);

  const getCredential = useCallback(async (id: string): Promise<DecryptedCredential> => {
    try {
      return await credentialManager.getCredential(id);
    } catch (error) {
      errorLogger.error('Error getting credential', error);
      throw error;
    }
  }, []);

  // Role management functions
  const createRole = useCallback(async (role: Partial<Role>): Promise<Role> => {
    try {
      const { data, error } = await supabase
        .from('roles')
        .insert({
          name: role.name,
          description: role.description,
          is_system: role.isSystem || false
        })
        .select()
        .single();

      if (error) throw error;

      await loadRolesAndPermissions();
      return data;
    } catch (error) {
      errorLogger.error('Error creating role', error);
      throw error;
    }
  }, [loadRolesAndPermissions]);

  const updateRole = useCallback(async (id: string, updates: Partial<Role>): Promise<Role> => {
    try {
      const { data, error } = await supabase
        .from('roles')
        .update({
          name: updates.name,
          description: updates.description
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      await loadRolesAndPermissions();
      return data;
    } catch (error) {
      errorLogger.error('Error updating role', error);
      throw error;
    }
  }, [loadRolesAndPermissions]);

  const deleteRole = useCallback(async (id: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from('roles')
        .delete()
        .eq('id', id)
        .eq('is_system', false); // Can't delete system roles

      if (error) throw error;

      await loadRolesAndPermissions();
    } catch (error) {
      errorLogger.error('Error deleting role', error);
      throw error;
    }
  }, [loadRolesAndPermissions]);

  const assignRole = useCallback(async (userId: string, roleId: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from('user_roles')
        .insert({
          user_id: userId,
          role_id: roleId
        });

      if (error) throw error;

      // Refresh current user if it's them
      if (user?.id === userId) {
        await initializeSecurityData();
      }
    } catch (error) {
      errorLogger.error('Error assigning role', error);
      throw error;
    }
  }, [user?.id, initializeSecurityData]);

  const revokeRole = useCallback(async (userId: string, roleId: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role_id', roleId);

      if (error) throw error;

      // Refresh current user if it's them
      if (user?.id === userId) {
        await initializeSecurityData();
      }
    } catch (error) {
      errorLogger.error('Error revoking role', error);
      throw error;
    }
  }, [user?.id, initializeSecurityData]);

  // Security utilities
  const refreshSecurityData = useCallback(async (): Promise<void> => {
    await initializeSecurityData();
  }, [initializeSecurityData]);

  const logSecurityEvent = useCallback(async (event: string, details?: any): Promise<void> => {
    try {
      await supabase.from('activity_logs').insert({
        action: event,
        target: user?.email || 'unknown',
        type: 'security',
        details: details || {}
      });
    } catch (error) {
      errorLogger.error('Error logging security event', error);
    }
  }, [user?.email]);

  const checkCredentialAccess = useCallback(async (credentialId: string): Promise<boolean> => {
    try {
      const { data: credential } = await supabase
        .from('project_credentials')
        .select('project_id')
        .eq('id', credentialId)
        .single();

      if (!credential) return false;

      // Check if user owns the project or has appropriate permissions
      const { data: project } = await supabase
        .from('projects')
        .select('owner_id')
        .eq('id', credential.project_id)
        .single();

      if (!project) return false;

      return project.owner_id === user?.id || hasPermission('credentials', 'access');
    } catch (error) {
      errorLogger.error('Error checking credential access', error);
      return false;
    }
  }, [user?.id, hasPermission]);

  // Initialize on mount
  useEffect(() => {
    initializeSecurityData();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          await initializeSecurityData();
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setCredentials([]);
          setIsInitialized(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [initializeSecurityData]);

  const value: SecurityContextType = {
    // User security state
    user,
    loading,
    error,
    isInitialized,

    // Permission checks
    hasPermission,
    hasRole,
    isAdmin,
    isOwner,

    // Credential management
    credentials,
    credentialsLoading,
    createCredential,
    updateCredential,
    deleteCredential,
    getCredentials,
    getCredential,

    // Role and permission management
    roles,
    permissions,
    createRole,
    updateRole,
    deleteRole,
    assignRole,
    revokeRole,

    // Security utilities
    refreshSecurityData,
    logSecurityEvent,
    checkCredentialAccess
  };

  return (
    <SecurityContext.Provider value={value}>
      {children}
    </SecurityContext.Provider>
  );
};

export const useSecurity = (): SecurityContextType => {
  const context = useContext(SecurityContext);
  if (context === undefined) {
    throw new Error('useSecurity must be used within a SecurityProvider');
  }
  return context;
};

// Export constants
export { CREDENTIAL_TYPES };