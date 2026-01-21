import React, { useState, useEffect } from 'react';
import { Icons } from '../components/ui/Icons';
import { useRBAC } from '../context/RBACContext';
import { SecurityProvider, useSecurity } from '../context/SecurityContext';
import { PageView } from '../types';

// Security management components
interface SecurityDashboardProps {
  onNavigate: (page: PageView) => void;
}

const SecurityDashboard: React.FC<SecurityDashboardProps> = ({ onNavigate }) => {
  const { user, hasPermission } = useRBAC();
  const { 
    credentials, 
    roles, 
    permissions, 
    loading, 
    error,
    createCredential,
    updateCredential,
    deleteCredential,
    createRole,
    updateRole,
    deleteRole,
    refreshSecurityData
  } = useSecurity();

  const [activeTab, setActiveTab] = useState<'overview' | 'credentials' | 'roles'>('overview');
  const [selectedCredential, setSelectedCredential] = useState<any>(null);
  const [showCredentialModal, setShowCredentialModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<any>(null);

  // Permission checks
  const canManageCredentials = hasPermission('security', 'manage_credentials');
  const canManageRoles = hasPermission('security', 'manage_roles');

  useEffect(() => {
    refreshSecurityData();
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
                <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{permissions?.length || 0}</p>
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
                      {role.isSystem && (
                        <span className="text-xs px-2 py-1 bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400 rounded-full">
                          System
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">{role.description}</p>
                    <div className="mt-2">
                      <span className="text-xs text-zinc-400">{role.permissions?.length || 0} permissions</span>
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
                      {role.isSystem && (
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
                      {!role.isSystem && (
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
                      {role.permissions?.slice(0, 3).map(permission => (
                        <span
                          key={permission.id}
                          className="inline-flex px-2 py-1 text-xs font-medium rounded bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300"
                        >
                          {permission.module}:{permission.action}
                        </span>
                      ))}
                      {(role.permissions?.length || 0) > 3 && (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          +{(role.permissions?.length || 0) - 3} more
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
          permissions={permissions || []}
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

// Role Modal Component
const RoleModal: React.FC<{
  role: any;
  permissions: any[];
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
}> = ({ role, permissions, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: role?.name || '',
    description: role?.description || '',
    permission_ids: role?.permissions?.map((p: any) => p.id) || [],
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
      <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-700">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {role ? 'Edit Role' : 'Create Role'}
          </h3>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Role Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
              required
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
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Permissions</label>
            <div className="max-h-64 overflow-y-auto border border-zinc-300 dark:border-zinc-600 rounded-lg p-4">
              {permissions.map(permission => (
                <label key={permission.id} className="flex items-center gap-3 py-2">
                  <input
                    type="checkbox"
                    checked={formData.permission_ids.includes(permission.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({
                          ...formData,
                          permission_ids: [...formData.permission_ids, permission.id],
                        });
                      } else {
                        setFormData({
                          ...formData,
                          permission_ids: formData.permission_ids.filter(id => id !== permission.id),
                        });
                      }
                    }}
                    className="rounded border-zinc-300 dark:border-zinc-600 text-blue-600"
                  />
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {permission.module}:{permission.action}
                    </p>
                    {permission.description && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{permission.description}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>
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
              {loading ? 'Saving...' : role ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Export wrapped component
export const Security: React.FC<SecurityDashboardProps> = (props) => {
  return (
    <SecurityProvider>
      <SecurityDashboard {...props} />
    </SecurityProvider>
  );
};