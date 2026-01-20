import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { RBACContextType, Role, Permission, UserProfile, ModuleType, ActionType } from '../types/rbac';

const RBACContext = createContext<RBACContextType | undefined>(undefined);

// MOCK DATA FOR DEMO PURPOSES (Fallback if DB is not set up)
const MOCK_OWNER_ROLE: Role = { id: '1', name: 'owner', description: 'Owner', is_system: true };
const MOCK_PROFILE: UserProfile = { id: 'mock-id', email: 'demo@eneas.os', name: 'NEAS', avatar_url: null, status: 'active' };

export const RBACProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user: authUser, loading: authLoading } = useAuth();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    const fetchRBAC = async () => {
      setIsLoading(true);
      try {
        if (!authUser) {
          setUserProfile(null);
          setRoles([]);
          setPermissions([]);
          return;
        }

        // 1. Fetch Profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .single();

        if (profileError) {
            console.warn('RBAC: Could not fetch profile (tables might be missing). Using Mock.', profileError);
            // FALLBACK FOR DEMO
            setUserProfile({ ...MOCK_PROFILE, id: authUser.id, email: authUser.email || 'demo@eneas.os' });
            setRoles([MOCK_OWNER_ROLE]);
            // Grant all permissions for owner mock
            setPermissions([{ id: 'all', module: 'sales', action: 'view', description: 'all' }, { id: 'all', module: 'finance', action: 'view', description: 'all' }]); 
            setIsLoading(false);
            return;
        }
        
        setUserProfile(profile);

        // 2. Fetch User Roles
        const { data: userRoles } = await supabase
          .from('user_roles')
          .select('roles(*)')
          .eq('user_id', authUser.id);

        const activeRoles = userRoles?.map((ur: any) => ur.roles) || [];
        setRoles(activeRoles);

        // 3. Fetch Permissions for these roles
        if (activeRoles.length > 0) {
          const roleIds = activeRoles.map(r => r.id);
          const { data: rolePerms } = await supabase
            .from('role_permissions')
            .select('permissions(*)')
            .in('role_id', roleIds);

          const uniquePerms = Array.from(new Set(rolePerms?.map((rp: any) => JSON.stringify(rp.permissions))))
            .map((s) => JSON.parse(s as string));
          
          setPermissions(uniquePerms);
        } else {
          setPermissions([]);
        }

      } catch (error) {
        console.error('Error fetching RBAC data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRBAC();
  }, [authUser, authLoading]);

  const hasRole = (roleName: string) => {
    if (!userProfile) return false;
    // Owner has all roles implicitly in this simple logic, or just specific check
    if (roles.some(r => r.name === 'owner')) return true; 
    return roles.some(r => r.name === roleName);
  };

  const hasPermission = (module: ModuleType, action: ActionType) => {
    if (!userProfile) return false;
    if (roles.some(r => r.name === 'owner')) return true; // Owner has full access
    
    return permissions.some(p => p.module === module && p.action === action);
  };

  const isAdmin = hasRole('owner') || hasRole('admin');

  return (
    <RBACContext.Provider value={{ 
      user: userProfile, 
      roles, 
      permissions, 
      isLoading, 
      hasPermission, 
      hasRole,
      isAdmin
    }}>
      {children}
    </RBACContext.Provider>
  );
};

export const useRBAC = () => {
  const context = useContext(RBACContext);
  if (context === undefined) {
    throw new Error('useRBAC must be used within an RBACProvider');
  }
  return context;
};
