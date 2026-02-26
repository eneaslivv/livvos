import React, { useState, useEffect, useCallback } from 'react';
import { useRBAC } from '../../context/RBACContext';
import { useTenant } from '../../context/TenantContext';
import { Icons } from '../ui/Icons';
import { supabase, supabaseAdmin } from '../../lib/supabase';
import { Role } from '../../types/rbac';
import { SCREEN_PERMISSIONS, OS_SCREENS, SALES_SCREENS, ALL_SCREEN_IDS } from '../../lib/screenPermissions';

interface Invitation {
  id: string;
  email: string;
  role_id: string;
  tenant_id: string;
  token: string;
  status: 'pending' | 'accepted' | 'expired';
  created_at: string;
}

interface MemberRow {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  status: 'active' | 'invited' | 'suspended';
  role_name: string;
  role_id: string | null;
  is_system_role: boolean;
  permission_count: number;
}

// ─── Permission Checkbox Grid ───────────────────────────────────────────────

const PermissionCheckboxes: React.FC<{
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
}> = ({ selected, onChange }) => {
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next);
  };

  const toggleGroup = (ids: string[], allSelected: boolean) => {
    const next = new Set(selected);
    ids.forEach(id => allSelected ? next.delete(id) : next.add(id));
    onChange(next);
  };

  const renderGroup = (label: string, screens: typeof OS_SCREENS) => {
    const groupIds = screens.map(s => s.id);
    const allSelected = groupIds.every(id => selected.has(id));

    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{label}</span>
          <button
            type="button"
            onClick={() => toggleGroup(groupIds, allSelected)}
            className="text-[10px] font-medium text-indigo-500 hover:text-indigo-700"
          >
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {screens.map(screen => (
            <label
              key={screen.id}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                selected.has(screen.id)
                  ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800'
                  : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
              }`}
            >
              <input
                type="checkbox"
                checked={selected.has(screen.id)}
                onChange={() => toggle(screen.id)}
                className="w-3.5 h-3.5 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500/20"
              />
              <span className={`text-sm ${selected.has(screen.id) ? 'text-indigo-700 dark:text-indigo-300 font-medium' : 'text-zinc-600 dark:text-zinc-400'}`}>
                {screen.label}
              </span>
            </label>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {renderGroup('OS Mode', OS_SCREENS)}
      {renderGroup('Sales Mode', SALES_SCREENS)}
    </div>
  );
};

// ─── Main Component ─────────────────────────────────────────────────────────

export const UserManagement: React.FC = () => {
  const { isAdmin, isOwner } = useRBAC();
  const { currentTenant } = useTenant();

  // Data
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [allPermissions, setAllPermissions] = useState<{ id: string; module: string; action: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Invite form
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [accessLevel, setAccessLevel] = useState<'full' | 'custom'>('full');
  const [selectedScreens, setSelectedScreens] = useState<Set<string>>(new Set(ALL_SCREEN_IDS));
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Edit permissions
  const [editingUser, setEditingUser] = useState<MemberRow | null>(null);
  const [editScreens, setEditScreens] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  // Action menu
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // ─── Fetch data ──────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!currentTenant?.id) return;
    setIsLoading(true);
    try {
      const [profilesRes, userRolesRes, rolesRes, invitesRes, permsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('tenant_id', currentTenant.id),
        supabase.from('user_roles').select('user_id, role_id, roles(name, is_system)'),
        supabase.from('roles').select('*'),
        supabase.from('invitations').select('*').eq('status', 'pending').eq('tenant_id', currentTenant.id),
        supabase.from('permissions').select('id, module, action'),
      ]);

      setRoles(rolesRes.data || []);
      setInvitations(invitesRes.data || []);
      setAllPermissions(permsRes.data || []);

      // Build member rows
      const profiles = profilesRes.data || [];
      const userRoles = userRolesRes.data || [];

      const memberRows: MemberRow[] = profiles.map(p => {
        const ur = userRoles.find((r: any) => r.user_id === p.id);
        const roleName = ur ? (Array.isArray(ur.roles) ? (ur.roles as any)[0]?.name : (ur.roles as any)?.name) : 'No Role';
        const isSystem = ur ? (Array.isArray(ur.roles) ? (ur.roles as any)[0]?.is_system : (ur.roles as any)?.is_system) : false;

        return {
          id: p.id,
          email: p.email,
          name: p.name,
          avatar_url: p.avatar_url,
          status: p.status || 'active',
          role_name: roleName || 'No Role',
          role_id: ur?.role_id || null,
          is_system_role: isSystem ?? false,
          permission_count: 0,
        };
      });

      setMembers(memberRows);
    } catch (err) {
      console.error('Error fetching user data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => {
    if (!isAdmin()) return;
    fetchData();
  }, [isAdmin, fetchData]);

  // ─── Helpers ─────────────────────────────────────────────

  const findPermissionId = (module: string, action: string) =>
    allPermissions.find(p => p.module === module && p.action === action)?.id;

  const getAccessLabel = (member: MemberRow) => {
    const sysRoles = ['owner', 'admin'];
    if (sysRoles.includes(member.role_name.toLowerCase())) return 'Full Access';
    if (member.role_name.startsWith('custom_')) return 'Custom';
    return member.role_name.charAt(0).toUpperCase() + member.role_name.slice(1);
  };

  // ─── Invite ──────────────────────────────────────────────

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !currentTenant?.id) return;
    if (accessLevel === 'custom' && selectedScreens.size === 0) {
      alert('Please select at least one screen for the member.');
      return;
    }

    setIsSending(true);
    try {
      let roleIdToUse: string;

      if (accessLevel === 'full') {
        const adminRole = roles.find(r => r.name === 'admin');
        if (!adminRole) throw new Error('Admin role not found');
        roleIdToUse = adminRole.id;
      } else {
        // Create custom role with selected permissions (admin client bypasses RLS)
        const { data: newRole, error: roleError } = await supabaseAdmin
          .from('roles')
          .insert({
            name: `custom_${Date.now()}`,
            description: `Custom access for ${inviteEmail}`,
            is_system: false,
          })
          .select()
          .single();

        if (roleError) throw roleError;

        // Map selected screens to permission IDs
        const permInserts = SCREEN_PERMISSIONS
          .filter(sp => selectedScreens.has(sp.id))
          .map(sp => {
            const pid = findPermissionId(sp.module, sp.action);
            return pid ? { role_id: newRole.id, permission_id: pid } : null;
          })
          .filter(Boolean) as { role_id: string; permission_id: string }[];

        if (permInserts.length > 0) {
          const { error: rpError } = await supabaseAdmin.from('role_permissions').insert(permInserts);
          if (rpError) throw rpError;
        }

        roleIdToUse = newRole.id;
      }

      // Create invitation
      const { data, error } = await supabase
        .from('invitations')
        .insert({
          email: inviteEmail,
          role_id: roleIdToUse,
          tenant_id: currentTenant.id,
          created_by: (await supabase.auth.getUser()).data.user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      const link = `${window.location.origin}/accept-invite?token=${data.token}`;
      setInviteLink(link);
      setInvitations(prev => [...prev, data]);
      setInviteEmail('');
    } catch (err) {
      console.error('Error creating invitation:', err);
      alert('Failed to create invitation. Check console for details.');
    } finally {
      setIsSending(false);
    }
  };

  const cancelInvitation = async (inviteId: string) => {
    if (!confirm('Cancel this invitation?')) return;
    try {
      await supabaseAdmin.from('invitations').update({ status: 'expired' }).eq('id', inviteId);
      setInvitations(prev => prev.filter(i => i.id !== inviteId));
    } catch (err) {
      console.error('Error cancelling invitation:', err);
    }
  };

  const closeInviteModal = () => {
    setShowInvite(false);
    setInviteLink(null);
    setInviteEmail('');
    setAccessLevel('full');
    setSelectedScreens(new Set(ALL_SCREEN_IDS));
  };

  const copyLink = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      alert('Invitation link copied!');
    }
  };

  // ─── Edit permissions ────────────────────────────────────

  const openEditPermissions = async (member: MemberRow) => {
    if (!member.role_id) return;

    // Load the member's current screen permissions (admin client for reliable read)
    const { data: rolePerms } = await supabaseAdmin
      .from('role_permissions')
      .select('permissions(module, action)')
      .eq('role_id', member.role_id);

    const currentPerms = (rolePerms || []).map((rp: any) => rp.permissions);
    const screenSet = new Set<string>();

    SCREEN_PERMISSIONS.forEach(sp => {
      if (currentPerms.some((p: any) => p.module === sp.module && p.action === sp.action)) {
        screenSet.add(sp.id);
      }
    });

    // If owner/admin, pre-check everything
    if (['owner', 'admin'].includes(member.role_name.toLowerCase())) {
      ALL_SCREEN_IDS.forEach(id => screenSet.add(id));
    }

    setEditScreens(screenSet);
    setEditingUser(member);
    setOpenMenuId(null);
  };

  const saveEditPermissions = async () => {
    if (!editingUser || !currentTenant?.id) return;
    if (editScreens.size === 0) {
      alert('Please select at least one screen.');
      return;
    }

    setIsSaving(true);
    try {
      let roleId: string;

      // If user has a custom (non-system) role, update in place (admin client bypasses RLS)
      if (!editingUser.is_system_role && editingUser.role_name.startsWith('custom_') && editingUser.role_id) {
        roleId = editingUser.role_id;
        // Clear existing permissions for this role
        await supabaseAdmin.from('role_permissions').delete().eq('role_id', roleId);
      } else {
        // Create new custom role & reassign
        const { data: newRole, error: roleError } = await supabaseAdmin
          .from('roles')
          .insert({
            name: `custom_${Date.now()}`,
            description: `Custom access for ${editingUser.email}`,
            is_system: false,
          })
          .select()
          .single();

        if (roleError) throw roleError;
        roleId = newRole.id;

        // Remove old role assignment, add new
        if (editingUser.role_id) {
          await supabaseAdmin.from('user_roles').delete().eq('user_id', editingUser.id).eq('role_id', editingUser.role_id);
        }
        await supabaseAdmin.from('user_roles').insert({ user_id: editingUser.id, role_id: roleId });
      }

      // Insert selected permissions
      const permInserts = SCREEN_PERMISSIONS
        .filter(sp => editScreens.has(sp.id))
        .map(sp => {
          const pid = findPermissionId(sp.module, sp.action);
          return pid ? { role_id: roleId, permission_id: pid } : null;
        })
        .filter(Boolean) as { role_id: string; permission_id: string }[];

      if (permInserts.length > 0) {
        await supabaseAdmin.from('role_permissions').insert(permInserts);
      }

      setEditingUser(null);
      await fetchData();
    } catch (err) {
      console.error('Error saving permissions:', err);
      alert('Failed to save permissions.');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Suspend / Activate ──────────────────────────────────

  const toggleUserStatus = async (member: MemberRow) => {
    const newStatus = member.status === 'active' ? 'suspended' : 'active';
    if (!confirm(`${newStatus === 'suspended' ? 'Suspend' : 'Reactivate'} ${member.name || member.email}?`)) return;

    try {
      await supabase.from('profiles').update({ status: newStatus }).eq('id', member.id);
      setMembers(prev => prev.map(m => m.id === member.id ? { ...m, status: newStatus } : m));
    } catch (err) {
      console.error('Error updating user status:', err);
    }
    setOpenMenuId(null);
  };

  // ─── Access restricted ───────────────────────────────────

  if (!isAdmin()) {
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

  // ─── Render ──────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium leading-6 text-zinc-900 dark:text-zinc-100">User Management</h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Invite team members and configure their access.
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

      {/* ─── Invite Form ─── */}
      {showInvite && (
        <div className="p-6 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 rounded-xl animate-in fade-in slide-in-from-top-2">
          {!inviteLink ? (
            <form onSubmit={handleInvite} className="space-y-5">
              <div className="flex justify-between items-center">
                <h4 className="font-semibold text-indigo-900 dark:text-indigo-100">Invite New Member</h4>
                <button type="button" onClick={closeInviteModal} className="text-zinc-400 hover:text-zinc-600">
                  <Icons.X size={16} />
                </button>
              </div>

              {/* Email */}
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

              {/* Access Level Toggle */}
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-2">Access Level</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setAccessLevel('full'); setSelectedScreens(new Set(ALL_SCREEN_IDS)); }}
                    className={`flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                      accessLevel === 'full'
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <Icons.Shield size={14} />
                      Full Access
                    </div>
                    <div className={`text-[10px] mt-0.5 ${accessLevel === 'full' ? 'text-indigo-200' : 'text-zinc-400'}`}>
                      All screens & features
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAccessLevel('custom'); setSelectedScreens(new Set()); }}
                    className={`flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                      accessLevel === 'custom'
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <Icons.Settings size={14} />
                      Custom Access
                    </div>
                    <div className={`text-[10px] mt-0.5 ${accessLevel === 'custom' ? 'text-indigo-200' : 'text-zinc-400'}`}>
                      Choose specific screens
                    </div>
                  </button>
                </div>
              </div>

              {/* Permission Checkboxes */}
              {accessLevel === 'custom' && (
                <div className="pt-1">
                  <PermissionCheckboxes selected={selectedScreens} onChange={setSelectedScreens} />
                  {selectedScreens.size > 0 && (
                    <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-3">
                      {selectedScreens.size} of {ALL_SCREEN_IDS.length} screens selected
                    </p>
                  )}
                </div>
              )}

              {/* Submit */}
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isSending}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm disabled:opacity-50"
                >
                  {isSending ? 'Creating...' : 'Generate Invitation Link'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4 text-center py-4">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-2">
                <Icons.Check size={24} />
              </div>
              <h4 className="font-bold text-zinc-900 dark:text-zinc-100">Invitation Created!</h4>
              <p className="text-sm text-zinc-500">Share this link with the user to let them join.</p>
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

      {/* ─── Edit Permissions Modal ─── */}
      {editingUser && (
        <div className="p-6 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-xl animate-in fade-in slide-in-from-top-2">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h4 className="font-semibold text-amber-900 dark:text-amber-100">Edit Access</h4>
              <p className="text-xs text-zinc-500 mt-0.5">{editingUser.name || editingUser.email}</p>
            </div>
            <button onClick={() => setEditingUser(null)} className="text-zinc-400 hover:text-zinc-600">
              <Icons.X size={16} />
            </button>
          </div>

          <PermissionCheckboxes selected={editScreens} onChange={setEditScreens} />

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-amber-200 dark:border-amber-800/30">
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {editScreens.size} of {ALL_SCREEN_IDS.length} screens selected
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setEditingUser(null)}
                className="px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={saveEditPermissions}
                disabled={isSaving}
                className="px-4 py-1.5 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Members Table ─── */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 font-medium">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Access</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {isLoading ? (
              <tr>
                <td colSpan={4} className="p-8 text-center text-zinc-400">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
                    Loading members...
                  </div>
                </td>
              </tr>
            ) : (
              <>
                {/* Pending Invitations */}
                {invitations.map((invite) => {
                  const role = roles.find(r => r.id === invite.role_id);
                  const isCustom = role?.name?.startsWith('custom_');
                  return (
                    <tr key={`inv-${invite.id}`} className="bg-amber-50/30 dark:bg-amber-900/10">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-700 dark:text-amber-300">
                            <Icons.Mail size={14} />
                          </div>
                          <div>
                            <div className="font-medium text-zinc-900 dark:text-zinc-100">Pending Invite</div>
                            <div className="text-xs text-zinc-500">{invite.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-1 rounded-md bg-white dark:bg-zinc-800 text-xs font-medium text-zinc-500 border border-dashed border-zinc-300 dark:border-zinc-700">
                          {isCustom ? 'Custom' : role?.name || 'Unknown'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          Invited
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => cancelInvitation(invite.id)}
                          className="text-xs text-rose-500 hover:text-rose-700 font-medium px-2 py-1 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded"
                        >
                          Cancel
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {/* Active Members */}
                {members.map((member) => {
                  const accessLabel = getAccessLabel(member);
                  const isCurrentOwner = member.role_name.toLowerCase() === 'owner';

                  return (
                    <tr key={member.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold text-xs overflow-hidden">
                            {member.avatar_url ? (
                              <img src={member.avatar_url} alt={member.name || 'User'} className="w-full h-full object-cover" />
                            ) : (
                              (member.name || member.email).substring(0, 2).toUpperCase()
                            )}
                          </div>
                          <div>
                            <div className="font-medium text-zinc-900 dark:text-zinc-100">
                              {member.name || 'User'}
                              {isCurrentOwner && (
                                <span className="ml-1.5 text-[10px] text-indigo-500 font-bold uppercase">owner</span>
                              )}
                            </div>
                            <div className="text-xs text-zinc-500">{member.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${
                          accessLabel === 'Full Access'
                            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                            : accessLabel === 'Custom'
                              ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800'
                              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
                        }`}>
                          {accessLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                          member.status === 'active'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : member.status === 'suspended'
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                              : 'bg-zinc-100 text-zinc-500'
                        }`}>
                          {member.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!isCurrentOwner && (
                          <div className="relative inline-block">
                            <button
                              onClick={() => setOpenMenuId(openMenuId === member.id ? null : member.id)}
                              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"
                            >
                              <Icons.MoreHorizontal size={16} />
                            </button>
                            {openMenuId === member.id && (
                              <div className="absolute right-0 top-8 z-20 w-44 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl py-1">
                                <button
                                  onClick={() => openEditPermissions(member)}
                                  className="w-full text-left px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-2"
                                >
                                  <Icons.Settings size={14} />
                                  Edit Access
                                </button>
                                <button
                                  onClick={() => toggleUserStatus(member)}
                                  className="w-full text-left px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-2"
                                >
                                  {member.status === 'active' ? (
                                    <><Icons.Lock size={14} /> Suspend</>
                                  ) : (
                                    <><Icons.Check size={14} /> Reactivate</>
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {/* Empty state */}
                {members.length === 0 && invitations.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-zinc-400">
                      No team members yet. Invite someone to get started.
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
