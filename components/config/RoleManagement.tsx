import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useRBAC } from '../../context/RBACContext';
import { Icons } from '../ui/Icons';
import { Role, Permission } from '../../types/rbac';

export const RoleManagement: React.FC = () => {
    const { isAdmin } = useRBAC();
    const [roles, setRoles] = useState<Role[]>([]);
    const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
    const [selectedRole, setSelectedRole] = useState<Role | null>(null);
    const [rolePermissions, setRolePermissions] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Fetch initial data
    useEffect(() => {
        if (!isAdmin) return;
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const { data: rolesData } = await supabase.from('roles').select('*').order('name');
                const { data: permsData } = await supabase.from('permissions').select('*').order('module');
                
                setRoles(rolesData || []);
                setAllPermissions(permsData || []);
                
                // Select first role by default
                if (rolesData && rolesData.length > 0) {
                    handleSelectRole(rolesData[0]);
                }
            } catch (error) {
                console.error('Error fetching roles:', error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [isAdmin]);

    const handleSelectRole = async (role: Role) => {
        setSelectedRole(role);
        // Fetch permissions for this role
        const { data } = await supabase
            .from('role_permissions')
            .select('permission_id')
            .eq('role_id', role.id);
        
        const permissionIds = new Set(data?.map((p: any) => p.permission_id) || []);
        setRolePermissions(permissionIds);
    };

    const togglePermission = (permissionId: string) => {
        if (!selectedRole) return;
        
        const newSet = new Set(rolePermissions);
        if (newSet.has(permissionId)) {
            newSet.delete(permissionId);
        } else {
            newSet.add(permissionId);
        }
        setRolePermissions(newSet);
    };

    const savePermissions = async () => {
        if (!selectedRole) return;
        setIsSaving(true);
        try {
            // 1. Delete all existing permissions for this role
            await supabase.from('role_permissions').delete().eq('role_id', selectedRole.id);

            // 2. Insert new permissions
            const newPermissions = Array.from(rolePermissions).map(pid => ({
                role_id: selectedRole.id,
                permission_id: pid
            }));

            if (newPermissions.length > 0) {
                await supabase.from('role_permissions').insert(newPermissions);
            }

            alert('Permissions saved successfully!');
        } catch (error) {
            console.error('Error saving permissions:', error);
            alert('Failed to save permissions');
        } finally {
            setIsSaving(false);
        }
    };

    // Group permissions by module
    const groupedPermissions = allPermissions.reduce((acc, perm) => {
        if (!acc[perm.module]) acc[perm.module] = [];
        acc[perm.module].push(perm);
        return acc;
    }, {} as Record<string, Permission[]>);

    if (!isAdmin) {
         return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
                 <div className="p-3 bg-rose-50 dark:bg-rose-900/20 rounded-full text-rose-500 mb-4">
                    <Icons.Lock size={24} />
                </div>
                <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Access Restricted</h3>
                <p className="text-sm text-zinc-500 mt-2 max-w-xs">Only administrators can manage roles.</p>
            </div>
        );
    }

    return (
        <div className="flex h-[calc(100%-2rem)] gap-6">
            {/* Roles List (Sidebar) */}
            <div className="w-48 flex-shrink-0 border-r border-zinc-100 dark:border-zinc-800 pr-4">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">Roles</h3>
                    <button className="text-indigo-600 hover:text-indigo-700"><Icons.Plus size={16}/></button>
                </div>
                <div className="space-y-1">
                    {roles.map(role => (
                        <button
                            key={role.id}
                            onClick={() => handleSelectRole(role)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                                selectedRole?.id === role.id 
                                ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300 font-medium' 
                                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                            }`}
                        >
                            {role.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Permissions Matrix (Main) */}
            <div className="flex-1 flex flex-col h-full overflow-hidden">
                {selectedRole ? (
                    <>
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 capitalize">{selectedRole.name} Permissions</h2>
                                <p className="text-xs text-zinc-500">{selectedRole.description || 'Manage access levels for this role'}</p>
                            </div>
                            <button 
                                onClick={savePermissions}
                                disabled={isSaving}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-all shadow-sm flex items-center gap-2"
                            >
                                {isSaving ? <Icons.Clock className="animate-spin" size={16}/> : <Icons.Check size={16}/>}
                                Save Changes
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto pr-2 space-y-6">
                            {Object.entries(groupedPermissions).map(([module, perms]) => (
                                <div key={module} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                                    <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">{module}</span>
                                        </div>
                                    </div>
                                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {perms.map(perm => (
                                            <div key={perm.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                                                <button
                                                    onClick={() => togglePermission(perm.id)}
                                                    className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center transition-all ${
                                                        rolePermissions.has(perm.id)
                                                        ? 'bg-indigo-600 border-indigo-600 text-white'
                                                        : 'bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700'
                                                    }`}
                                                >
                                                    {rolePermissions.has(perm.id) && <Icons.Check size={12} strokeWidth={3} />}
                                                </button>
                                                <div>
                                                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 capitalize">{perm.action.replace('_', ' ')}</div>
                                                    <div className="text-xs text-zinc-500">{perm.description}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <div className="flex items-center justify-center h-full text-zinc-400">Select a role to edit</div>
                )}
            </div>
        </div>
    );
};
