import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Icons } from '../components/ui/Icons';
import { useRBAC, Permission, Role } from '../context/RBACContext';
import { useSecurity } from '../context/SecurityContext';
// Note: SecurityProvider is already in App.tsx provider tree
import { PageView } from '../types';

// Security management components
interface SecurityDashboardProps {
  onNavigate: (page: PageView) => void;
}

interface RoleWithPermissions extends Role {
  rolePermissions: Permission[];
}

const SecurityDashboard: React.FC<SecurityDashboardProps> = ({ onNavigate }) => {
  const {
    user,
    hasPermission,
    getAllRoles,
    getAllPermissions,
    createRole: rbacCreateRole,
    updateRole: rbacUpdateRole,
    deleteRole: rbacDeleteRole,
    setRolePermissions,
    getRolePermissions
  } = useRBAC();
  const {
    credentials,
    loading: credentialsLoading,
    error: credentialsError,
    createCredential,
    updateCredential,
    deleteCredential,
    refreshSecurityData
  } = useSecurity();

  // Local state for all roles/permissions (management view)
  const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesError, setRolesError] = useState<string | null>(null);

  const loading = credentialsLoading || rolesLoading;
  const error = credentialsError || rolesError;

  const loadRolesAndPermissions = useCallback(async () => {
    try {
      setRolesLoading(true);
      setRolesError(null);

      const [fetchedRoles, fetchedPermissions] = await Promise.all([
        getAllRoles(),
        getAllPermissions()
      ]);

      // Load permissions for each role
      const rolesWithPerms: RoleWithPermissions[] = await Promise.all(
        fetchedRoles.map(async (role) => {
          const rolePerms = await getRolePermissions(role.id);
          return { ...role, rolePermissions: rolePerms };
        })
      );

      setRoles(rolesWithPerms);
      setAllPermissions(fetchedPermissions);
    } catch (err: any) {
      setRolesError(err.message);
    } finally {
      setRolesLoading(false);
    }
  }, [getAllRoles, getAllPermissions, getRolePermissions]);

  const createRole = useCallback(async (data: any) => {
    const { permission_ids = [], ...roleData } = data;
    const created = await rbacCreateRole(roleData);
    if (created?.id && Array.isArray(permission_ids)) {
      await setRolePermissions(created.id, permission_ids);
    }
    await loadRolesAndPermissions();
  }, [rbacCreateRole, setRolePermissions, loadRolesAndPermissions]);

  const updateRole = useCallback(async (id: string, data: any) => {
    const { permission_ids, ...roleData } = data;
    if (Object.keys(roleData).length > 0) {
      await rbacUpdateRole(id, roleData);
    }
    if (Array.isArray(permission_ids)) {
      await setRolePermissions(id, permission_ids);
    }
    await loadRolesAndPermissions();
  }, [rbacUpdateRole, setRolePermissions, loadRolesAndPermissions]);

  const deleteRole = useCallback(async (id: string) => {
    await rbacDeleteRole(id);
    await loadRolesAndPermissions();
  }, [rbacDeleteRole, loadRolesAndPermissions]);

  const [activeTab, setActiveTab] = useState<'overview' | 'credentials' | 'roles'>('overview');
  const [selectedCredential, setSelectedCredential] = useState<any>(null);
  const [showCredentialModal, setShowCredentialModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<any>(null);

  // Permission checks
  const canManageCredentials = hasPermission('security', 'manage');
  const canManageRoles = hasPermission('security', 'manage');

  useEffect(() => {
    refreshSecurityData();
    loadRolesAndPermissions();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <div className="flex items-center">
          <Icons.Alert className="text-red-500 mr-2" size={20} />
          <span className="text-red-700 dark:text-red-300">Error loading security data: {error}</span>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: <Icons.Shield /> },
    { id: 'credentials', label: 'Credentials', icon: <Icons.Key />, permission: canManageCredentials },
    { id: 'roles', label: 'Roles', icon: <Icons.Users />, permission: canManageRoles },
  ].filter(tab => tab.permission !== false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Security Center</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">Manage security settings, credentials, and access control</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshSecurityData}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
          >
            <Icons.RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Security Metrics */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Active Users</p>
                <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{user ? 1 : 0}</p>
              </div>
              <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                <Icons.Users className="text-blue-600 dark:text-blue-400" size={20} />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Total Roles</p>
                <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{roles?.length || 0}</p>
              </div>
              <div className="p-3 bg-emerald-100 dark:bg-emerald-900/20 rounded-lg">
                <Icons.Shield className="text-emerald-600 dark:text-emerald-400" size={20} />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Credentials</p>
                <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{credentials?.length || 0}</p>
              </div>
              <div className="p-3 bg-amber-100 dark:bg-amber-900/20 rounded-lg">
                <Icons.Key className="text-amber-600 dark:text-amber-400" size={20} />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Permissions</p>
                <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{allPermissions?.length || 0}</p>
              </div>
              <div className="p-3 bg-rose-100 dark:bg-rose-900/20 rounded-lg">
                <Icons.Lock className="text-rose-600 dark:text-rose-400" size={20} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-zinc-200 dark:border-zinc-700">
        <nav className="flex space-x-8">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Security Health */}
            <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-6">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Security Status</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Authentication system active</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Permissions system active</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Credentials encrypted</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Multi-factor authentication available</span>
                </div>
              </div>
            </div>

            {/* Recent Roles */}
            <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-6">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">System Roles</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {roles?.slice(0, 6).map(role => (
                  <div key={role.id} className="p-4 border border-zinc-200 dark:border-zinc-700 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-zinc-900 dark:text-zinc-100">{role.name}</h4>
                      {role.is_system && (
                        <span className="text-xs px-2 py-1 bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400 rounded-full">
                          System
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">{role.description}</p>
                    <div className="mt-2">
                      <span className="text-xs text-zinc-400">{role.rolePermissions?.length || 0} permissions</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'credentials' && canManageCredentials && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Service Credentials</h3>
              <button
                onClick={() => {
                  setSelectedCredential(null);
                  setShowCredentialModal(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <Icons.Plus size={16} />
                Add Credential
              </button>
            </div>

            <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-700">
                    <tr>
                      <th className="text-left py-3 px-4 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Service</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Environment</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Created</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Last Accessed</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
                    {credentials?.map(cred => (
                      <tr key={cred.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Icons.Key size={16} className="text-zinc-400" />
                            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{cred.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
                            {cred.environment || 'production'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-zinc-500 dark:text-zinc-400">
                          {new Date(cred.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-sm text-zinc-500 dark:text-zinc-400">
                          {cred.lastAccessedAt ? new Date(cred.lastAccessedAt).toLocaleDateString() : 'Never'}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setSelectedCredential(cred);
                                setShowCredentialModal(true);
                              }}
                              className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded"
                            >
                              <Icons.Edit size={16} className="text-zinc-400" />
                            </button>
                            <button
                              onClick={() => deleteCredential(cred.id)}
                              className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded"
                            >
                              <Icons.Trash size={16} className="text-red-400" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'roles' && canManageRoles && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Role Management</h3>
              <button
                onClick={() => {
                  setSelectedRole(null);
                  setShowRoleModal(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <Icons.Plus size={16} />
                Create Role
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {roles?.map(role => (
                <div key={role.id} className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h4 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{role.name}</h4>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">{role.description}</p>
                      {role.is_system && (
                        <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400 mt-2">
                          System Role
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setSelectedRole(role);
                          setShowRoleModal(true);
                        }}
                        className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded"
                      >
                        <Icons.Edit size={16} className="text-zinc-400" />
                      </button>
                      {!role.is_system && (
                        <button
                          onClick={() => deleteRole(role.id)}
                          className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded"
                        >
                          <Icons.Trash size={16} className="text-red-400" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Permissions</p>
                    <div className="flex flex-wrap gap-1">
                      {role.rolePermissions?.slice(0, 3).map(permission => (
                        <span
                          key={permission.id}
                          className="inline-flex px-2 py-1 text-xs font-medium rounded bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300"
                        >
                          {permission.module}:{permission.action}
                        </span>
                      ))}
                      {(role.rolePermissions?.length || 0) > 3 && (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          +{(role.rolePermissions?.length || 0) - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Credential Modal */}
      {showCredentialModal && (
        <CredentialModal
          credential={selectedCredential}
          onClose={() => setShowCredentialModal(false)}
          onSave={async (data) => {
            if (selectedCredential) {
              await updateCredential(selectedCredential.id, data);
            } else {
              await createCredential(data);
            }
            setShowCredentialModal(false);
          }}
        />
      )}

      {/* Role Modal */}
      {showRoleModal && (
        <RoleModal
          role={selectedRole}
          permissions={allPermissions || []}
          initialPermissionIds={selectedRole?.rolePermissions?.map((p: Permission) => p.id) || []}
          onClose={() => setShowRoleModal(false)}
          onSave={async (data) => {
            if (selectedRole) {
              await updateRole(selectedRole.id, data);
            } else {
              await createRole(data);
            }
            setShowRoleModal(false);
          }}
        />
      )}
    </div>
  );
};

// Credential Modal Component
const CredentialModal: React.FC<{
  credential: any;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
}> = ({ credential, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: credential?.name || '',
    environment: credential?.environment || 'production',
    username: credential?.username || '',
    credential: '',
    description: credential?.description || '',
    projectId: credential?.projectId || '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSave(formData);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 w-full max-w-md">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-700">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {credential ? 'Edit Credential' : 'Add Credential'}
          </h3>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Service Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Environment</label>
            <select
              value={formData.environment}
              onChange={(e) => setFormData({ ...formData, environment: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
            >
              <option value="development">Development</option>
              <option value="staging">Staging</option>
              <option value="production">Production</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Username</label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Password/Credential</label>
            <input
              type="password"
              value={formData.credential}
              onChange={(e) => setFormData({ ...formData, credential: e.target.value })}
              placeholder={credential ? "Leave empty to keep current" : "Enter credential"}
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
              required={!credential}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
            >
              {loading ? 'Saving...' : credential ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ----- Module metadata for the permission matrix -----
const MODULE_META: Record<string, { label: string; description: string }> = {
  crm:       { label: 'CRM',         description: 'Contacts, leads, deals' },
  sales:     { label: 'Sales',       description: 'Sales pipeline & dashboards' },
  finance:   { label: 'Finance',     description: 'Income, expenses, invoicing' },
  projects:  { label: 'Projects',    description: 'Projects & assigned work' },
  team:      { label: 'Team',        description: 'Members & invitations' },
  calendar:  { label: 'Calendar',    description: 'Events & integrations' },
  documents: { label: 'Documents',   description: 'Files & folders' },
  analytics: { label: 'Analytics',   description: 'Reports & insights' },
  tenant:    { label: 'Workspace',   description: 'Branding, billing, connections' },
  security:  { label: 'Security',    description: 'Roles, credentials, audit' },
  system:    { label: 'System',      description: 'Platform-wide admin' },
  auth:      { label: 'Auth',        description: 'Authentication' },
  settings:  { label: 'Settings',    description: 'General settings' },
};

const ACTION_LABELS: Record<string, string> = {
  view: 'View',
  view_dashboard: 'Dashboard',
  view_leads: 'Leads',
  view_analytics: 'Analytics',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  manage: 'Manage',
  assign: 'Assign',
  access: 'Access',
};

// Presets that match the SQL defaults — clicking one fills the matrix
const PRESETS: Record<string, (perm: Permission) => boolean> = {
  Owner:   () => true,
  Admin:   (p) => !(p.module === 'system' && p.action === 'manage'),
  Manager: (p) =>
    ['view', 'view_dashboard', 'view_leads', 'view_analytics', 'access'].includes(p.action) ||
    (['crm','sales','projects','calendar','documents','team'].includes(p.module) && ['create','edit'].includes(p.action)) ||
    (p.module === 'projects' && p.action === 'assign'),
  Sales:   (p) => ['sales','crm'].includes(p.module),
  Finance: (p) => ['finance','analytics'].includes(p.module),
  Viewer:  (p) => ['view','view_dashboard','view_leads','view_analytics','access'].includes(p.action),
  None:    () => false,
};

// Role Modal Component
const RoleModal: React.FC<{
  role: any;
  permissions: Permission[];
  initialPermissionIds: string[];
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
}> = ({ role, permissions, initialPermissionIds, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: role?.name || '',
    description: role?.description || '',
    permission_ids: initialPermissionIds,
  });
  const [loading, setLoading] = useState(false);
  const isOwnerRole = role?.name?.toLowerCase() === 'owner';

  const togglePermission = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      permission_ids: prev.permission_ids.includes(id)
        ? prev.permission_ids.filter((x: string) => x !== id)
        : [...prev.permission_ids, id],
    }));
  };

  const applyPreset = (presetName: keyof typeof PRESETS) => {
    const filter = PRESETS[presetName];
    setFormData((prev) => ({
      ...prev,
      permission_ids: permissions.filter(filter).map((p) => p.id),
    }));
  };

  // Group permissions by module
  const grouped = useMemo(() => {
    const map: Record<string, Permission[]> = {};
    permissions.forEach((p) => {
      if (!map[p.module]) map[p.module] = [];
      map[p.module].push(p);
    });
    // Sort actions within each module by a stable order
    const order = ['view','view_dashboard','view_leads','view_analytics','access','create','edit','assign','manage','delete'];
    Object.keys(map).forEach((m) => {
      map[m].sort((a, b) => (order.indexOf(a.action) - order.indexOf(b.action)) || a.action.localeCompare(b.action));
    });
    return map;
  }, [permissions]);

  const moduleKeys = useMemo(() => {
    const known = Object.keys(MODULE_META);
    return Object.keys(grouped).sort((a, b) => {
      const ai = known.indexOf(a); const bi = known.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [grouped]);

  const visibleModules = useMemo(() => {
    const set = new Set<string>();
    formData.permission_ids.forEach((id: string) => {
      const p = permissions.find((x) => x.id === id);
      if (p) set.add(p.module);
    });
    return [...set].map((m) => MODULE_META[m]?.label || m).sort();
  }, [formData.permission_ids, permissions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSave(formData);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-700">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {role ? `Edit role · ${role.name}` : 'Create role'}
          </h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Pick what this role can see and do across the system. Use a preset to start, then fine-tune.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Name + Description */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1">
                <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">Role Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                  disabled={role?.is_system}
                  required
                />
                {role?.is_system && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">System role — name cannot be changed.</p>
                )}
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="What does this role do?"
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                />
              </div>
            </div>

            {/* Presets */}
            {!isOwnerRole && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">Quick Presets</label>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => applyPreset(name)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-200 transition-colors"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Visibility summary */}
            <div className="rounded-lg border border-blue-200 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-900/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300 mb-2">
                What members with this role will see
              </p>
              {visibleModules.length === 0 ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Nothing yet — pick permissions below or apply a preset.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {visibleModules.map((m) => (
                    <span key={m} className="inline-flex items-center px-2 py-0.5 text-xs rounded-md bg-white dark:bg-zinc-800 border border-blue-200 dark:border-blue-900/40 text-blue-700 dark:text-blue-300 font-medium">
                      {m}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-2">
                {formData.permission_ids.length} of {permissions.length} permissions granted
              </p>
            </div>

            {/* Permission Matrix */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">Permissions</label>
              <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
                {moduleKeys.map((moduleKey, idx) => {
                  const meta = MODULE_META[moduleKey];
                  const perms = grouped[moduleKey];
                  const granted = perms.filter((p) => formData.permission_ids.includes(p.id)).length;
                  const allOn = granted === perms.length;
                  const noneOn = granted === 0;

                  return (
                    <div
                      key={moduleKey}
                      className={`p-4 ${idx > 0 ? 'border-t border-zinc-200 dark:border-zinc-700' : ''} ${allOn ? 'bg-emerald-50/40 dark:bg-emerald-900/5' : noneOn ? 'bg-zinc-50/40 dark:bg-zinc-900/30' : ''}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                              {meta?.label || moduleKey}
                            </h4>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 font-medium">
                              {granted}/{perms.length}
                            </span>
                          </div>
                          {meta?.description && (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">{meta.description}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setFormData((prev) => {
                              const otherIds = prev.permission_ids.filter((id: string) => !perms.some((p) => p.id === id));
                              return {
                                ...prev,
                                permission_ids: allOn ? otherIds : [...otherIds, ...perms.map((p) => p.id)],
                              };
                            });
                          }}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
                        >
                          {allOn ? 'Clear all' : 'Grant all'}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                        {perms.map((p) => {
                          const checked = formData.permission_ids.includes(p.id);
                          return (
                            <label
                              key={p.id}
                              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border cursor-pointer transition-colors text-xs ${
                                checked
                                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300'
                                  : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
                              }`}
                              title={p.description || `${p.module}:${p.action}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => togglePermission(p.id)}
                                className="rounded border-zinc-300 dark:border-zinc-600 text-blue-600"
                              />
                              <span className="font-medium">{ACTION_LABELS[p.action] || p.action}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/30">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {formData.permission_ids.length} permission{formData.permission_ids.length === 1 ? '' : 's'} selected
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !formData.name.trim()}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 font-medium"
              >
                {loading ? 'Saving...' : role ? 'Save changes' : 'Create role'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export const Security: React.FC<SecurityDashboardProps> = SecurityDashboard;