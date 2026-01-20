export interface Role {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
}

export interface Permission {
  id: string;
  module: string;
  action: string;
  description: string | null;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  status: 'active' | 'invited' | 'suspended';
}

export interface Service {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_active: boolean;
  requires_role: string[];
}

export interface PaymentProcessor {
  id: string;
  name: string;
  type: 'primary' | 'secondary';
  config: Record<string, any>;
  is_active: boolean;
}

export type ModuleType = 'sales' | 'crm' | 'finance' | 'projects' | 'team' | 'calendar' | 'activity' | 'documents' | 'settings';
export type ActionType = 'view' | 'edit' | 'delete' | 'create' | 'manage' | 'view_assigned' | 'view_all' | 'upload' | 'invite' | 'view_dashboard' | 'view_leads' | 'view_analytics';

export interface RBACContextType {
  user: UserProfile | null;
  roles: Role[];
  permissions: Permission[];
  isLoading: boolean;
  hasPermission: (module: ModuleType, action: ActionType) => boolean;
  hasRole: (roleName: string) => boolean;
  isAdmin: boolean;
}
