import React, { useState, useEffect } from 'react';
import { useRBAC } from '../../context/RBACContext';
import { Icons } from '../ui/Icons';
import { supabase } from '../../lib/supabase';
import { UserProfile, Role } from '../../types/rbac';

interface Invitation {
    id: string;
    email: string;
    role_id: string;
    token: string;
    status: 'pending' | 'accepted' | 'expired';
    created_at: string;
}

export const UserManagement: React.FC = () => {
  const { isAdmin } = useRBAC();
  const [users, setUsers] = useState<(UserProfile & { role: string })[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  // Fetch Data
  useEffect(() => {
    if (!isAdmin) return;

    const fetchData = async () => {
        setIsLoading(true);
        try {
            // 1. Fetch Users & Roles
            const { data: profiles } = await supabase.from('profiles').select('*');
            const { data: userRoles } = await supabase.from('user_roles').select('user_id, roles(name)');
            const { data: allRoles } = await supabase.from('roles').select('*');
            const { data: pendingInvites } = await supabase.from('invitations').select('*').eq('status', 'pending');

            setRoles(allRoles || []);
            setInvitations(pendingInvites || []);
            
            // Merge profiles with roles
            if (profiles && userRoles) {
                const mergedUsers = profiles.map(p => {
                    const roleEntry = userRoles.find((ur: any) => ur.user_id === p.id);
                    return {
                        ...p,
                        role: roleEntry?.roles?.name || 'No Role'
                    };
                });
                setUsers(mergedUsers);
            }

            // Set default role for invite
            if (allRoles && allRoles.length > 0) {
                const viewerRole = allRoles.find(r => r.name === 'viewer') || allRoles[0];
                setSelectedRole(viewerRole.id);
            }

        } catch (error) {
            console.error("Error fetching user data:", error);
        } finally {
            setIsLoading(false);
        }
    };

    fetchData();
  }, [isAdmin]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !selectedRole) return;

    try {
        const { data, error } = await supabase.from('invitations').insert({
            email: inviteEmail,
            role_id: selectedRole,
            created_by: (await supabase.auth.getUser()).data.user?.id
        }).select().single();

        if (error) throw error;

        // Generate Magic Link
        const link = `${window.location.origin}/accept-invite?token=${data.token}`;
        setInviteLink(link);
        
        // Refresh invitations list
        setInvitations([...invitations, data]);
        setInviteEmail('');
        
    } catch (error) {
        console.error("Error creating invitation:", error);
        alert("Failed to create invitation");
    }
  };

  const copyLink = () => {
    if (inviteLink) {
        navigator.clipboard.writeText(inviteLink);
        alert("Invitation link copied to clipboard!");
    }
  };

  const closeInviteModal = () => {
    setShowInvite(false);
    setInviteLink(null);
  };

  if (!isAdmin) {
    return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
             <div className="p-3 bg-rose-50 dark:bg-rose-900/20 rounded-full text-rose-500 mb-4">
                <Icons.Lock size={24} />
            </div>
            <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Access Restricted</h3>
            <p className="text-sm text-zinc-500 mt-2 max-w-xs">Only administrators can manage users and roles.</p>
        </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
            <h3 className="text-lg font-medium leading-6 text-zinc-900 dark:text-zinc-100">User Management</h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Invite team members and assign roles.
            </p>
        </div>
        <button 
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
        >
            <Icons.Plus size={16} />
            Invite User
        </button>
      </div>

      {/* Invite Modal / Section */}
      {showInvite && (
        <div className="p-6 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 rounded-xl animate-in fade-in slide-in-from-top-2">
            {!inviteLink ? (
                <form onSubmit={handleInvite} className="space-y-4">
                    <div className="flex justify-between items-center mb-2">
                        <h4 className="font-semibold text-indigo-900 dark:text-indigo-100">Invite New Member</h4>
                        <button type="button" onClick={closeInviteModal} className="text-zinc-400 hover:text-zinc-600"><Icons.X size={16}/></button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-zinc-500 mb-1">Email Address</label>
                            <input 
                                type="email" 
                                placeholder="colleague@company.com"
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                                className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-zinc-500 mb-1">Assign Role</label>
                            <select 
                                value={selectedRole}
                                onChange={(e) => setSelectedRole(e.target.value)}
                                className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                            >
                                {roles.map(role => (
                                    <option key={role.id} value={role.id}>
                                        {role.name.charAt(0).toUpperCase() + role.name.slice(1)}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="flex justify-end pt-2">
                        <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm">
                            Generate Invitation Link
                        </button>
                    </div>
                </form>
            ) : (
                <div className="space-y-4 text-center py-4">
                    <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-2">
                        <Icons.Check size={24} />
                    </div>
                    <h4 className="font-bold text-zinc-900 dark:text-zinc-100">Invitation Created!</h4>
                    <p className="text-sm text-zinc-500">Share this magic link with the user to let them join instantly.</p>
                    
                    <div className="flex items-center gap-2 max-w-md mx-auto mt-4">
                        <input 
                            type="text" 
                            value={inviteLink} 
                            readOnly 
                            className="flex-1 px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-500"
                        />
                        <button onClick={copyLink} className="p-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                            <Icons.Link size={18} />
                        </button>
                    </div>

                    <button onClick={closeInviteModal} className="text-sm text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 underline mt-4">
                        Close and invite another
                    </button>
                </div>
            )}
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm text-left">
            <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 font-medium">
                <tr>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {isLoading ? (
                    <tr><td colSpan={4} className="p-8 text-center text-zinc-400">Loading users...</td></tr>
                ) : (
                    <>
                        {/* Pending Invitations */}
                        {invitations.map((invite) => {
                             const roleName = roles.find(r => r.id === invite.role_id)?.name || 'Unknown';
                             return (
                                <tr key={invite.id} className="bg-amber-50/30 dark:bg-amber-900/10">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-700 dark:text-amber-300 font-bold text-xs">
                                                <Icons.Mail size={14} />
                                            </div>
                                            <div>
                                                <div className="font-medium text-zinc-900 dark:text-zinc-100">Invited User</div>
                                                <div className="text-xs text-zinc-500">{invite.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="inline-flex items-center px-2 py-1 rounded-md bg-white dark:bg-zinc-800 text-xs font-medium text-zinc-500 border border-dashed border-zinc-300 dark:border-zinc-700">
                                            {roleName} (Pending)
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                            Invited
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <button className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1">
                                            <Icons.MoreHorizontal size={16} />
                                        </button>
                                    </td>
                                </tr>
                             );
                        })}

                        {/* Active Users */}
                        {users.map((user) => (
                            <tr key={user.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold text-xs overflow-hidden">
                                            {user.avatar_url ? (
                                                <img src={user.avatar_url} alt={user.name || 'User'} className="w-full h-full object-cover" />
                                            ) : (
                                                user.name ? user.name.substring(0,2).toUpperCase() : user.email.substring(0,2).toUpperCase()
                                            )}
                                        </div>
                                        <div>
                                            <div className="font-medium text-zinc-900 dark:text-zinc-100">{user.name || 'User'}</div>
                                            <div className="text-xs text-zinc-500">{user.email}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <span className="inline-flex items-center px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                                        {user.role}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                                        user.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 
                                        user.status === 'suspended' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' :
                                        'bg-zinc-100 text-zinc-500'
                                    }`}>
                                        {user.status}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <button className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded">
                                        <Icons.MoreHorizontal size={16} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </>
                )}
            </tbody>
        </table>
      </div>
    </div>
  );
};
