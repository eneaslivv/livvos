import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { errorLogger } from '../lib/errorLogger';
import { useTenant } from './TenantContext';
import { ResourceLimitError } from '../lib/ResourceLimitError';
import { notifyWithEmail } from '../lib/notifyWithEmail';
import { sendEmail } from '../lib/sendEmail';

// Types
export interface TeamMember {
    id: string;
    email: string;
    name: string | null;
    avatar_url: string | null;
    status: 'active' | 'invited' | 'suspended';
    role: string;
    role_id: string | null;
    // Agent fields
    is_agent: boolean;
    agent_type: string | null;
    agent_description: string | null;
    agent_connected: boolean;
    // Computed fields
    assignedProjects: number;
    openTasks: number;
    completedTasks: number;
}

export interface TeamTask {
    id: string;
    title: string;
    project_id: string | null;
    project_title?: string;
    assignee_id: string | null;
    completed: boolean;
    due_date?: string;
    priority?: 'low' | 'medium' | 'high';
}

interface TeamContextType {
    members: TeamMember[];
    isLoading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    getMemberTasks: (memberId: string) => Promise<TeamTask[]>;
    assignTaskToMember: (taskId: string, memberId: string) => Promise<void>;
    getWorkloadSummary: () => { memberId: string; name: string; load: number }[];
    updateMemberAgent: (memberId: string, agentData: { is_agent: boolean; agent_type?: string | null; agent_description?: string | null; agent_connected?: boolean }) => Promise<void>;
    updateMemberStatus: (memberId: string, status: 'active' | 'suspended') => Promise<void>;
    updateMemberRole: (memberId: string, roleId: string) => Promise<void>;
    removeMember: (memberId: string) => Promise<void>;
    canAddMember: () => Promise<void>;
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

export const TeamProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const { isWithinResourceLimit, getResourceUsage, refreshUsage, currentTenant } = useTenant();
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const hasLoadedRef = useRef(false);

    // Fetch team members — queries run in parallel to avoid one slow query blocking the rest.
    //
    // IMPORTANT (tenant isolation): members come from the get_tenant_members
    // RPC (tenant_members-backed, membership-validated server-side), NOT from
    // a raw `profiles` select. The profiles RLS policy filters by
    // profiles.tenant_id — each user's *currently active workspace*, which
    // switch_active_tenant rewrites — so a raw select returned "everyone whose
    // active workspace matches mine" instead of "members of the workspace I'm
    // viewing". That leaked the full Livv Studio roster into the CK Studio
    // calendar/team UI. Same source of truth as UserManagement + refreshUsage.
    const fetchTeamMembers = useCallback(async () => {
        const tenantId = currentTenant?.id;
        if (!user) {
            setMembers([]);
            setIsLoading(false);
            return;
        }
        if (!tenantId) {
            // Tenant still resolving — keep the loading state; the effect
            // re-runs when currentTenant lands.
            setMembers([]);
            return;
        }

        // Only show loading on first load, not on background re-fetches
        if (!hasLoadedRef.current) {
            setIsLoading(true);
        }
        setError(null);

        try {
            // 10s timeout to prevent hanging forever if Supabase connection stalls
            const timeout = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Team data request timed out')), 10000)
            );

            // Run all queries in parallel so one slow/hanging query doesn't block the rest.
            // tasks are tenant-scoped explicitly: their RLS intentionally spans
            // tenants (shared projects / cross-tenant assignees), so an
            // unfiltered select would count another workspace's tasks here.
            const [membersResult, userRolesResult, tasksResult, projectMembersResult] = await Promise.race([
                Promise.allSettled([
                    supabase.rpc('get_tenant_members', { p_tenant_id: tenantId }),
                    supabase.from('user_roles').select('user_id, roles(id, name)'),
                    supabase.from('tasks').select('assignee_id, assignee_ids, completed').eq('tenant_id', tenantId),
                    supabase.from('project_members').select('user_id'),
                ]),
                timeout,
            ]) as [PromiseSettledResult<any>, PromiseSettledResult<any>, PromiseSettledResult<any>, PromiseSettledResult<any>];

            // 1. Tenant members (required)
            const tenantMembers = membersResult.status === 'fulfilled' && !membersResult.value.error
                ? membersResult.value.data : null;

            if (!tenantMembers) {
                const msg = membersResult.status === 'rejected'
                    ? (membersResult.reason as Error).message
                    : (membersResult as PromiseFulfilledResult<any>).value?.error?.message || 'Unknown error';
                if (import.meta.env.DEV) console.warn('Could not fetch tenant members:', msg);
                setMembers([]);
                setIsLoading(false);
                return;
            }

            // 2. User roles (optional)
            const userRoles = userRolesResult.status === 'fulfilled' && !userRolesResult.value.error
                ? userRolesResult.value.data : null;

            // 3. Task counts (optional)
            let taskCounts: Record<string, { open: number; completed: number }> = {};
            const tasks = tasksResult.status === 'fulfilled' && !tasksResult.value.error
                ? tasksResult.value.data : null;
            if (tasks) {
                tasks.forEach((task: any) => {
                    // Support multi-assignee: count task for each assignee
                    const ids: string[] = task.assignee_ids?.length ? task.assignee_ids : (task.assignee_id ? [task.assignee_id] : []);
                    ids.forEach((aid: string) => {
                        if (!taskCounts[aid]) taskCounts[aid] = { open: 0, completed: 0 };
                        if (task.completed) {
                            taskCounts[aid].completed++;
                        } else {
                            taskCounts[aid].open++;
                        }
                    });
                });
            }

            // 4. Project counts (optional)
            let projectCounts: Record<string, number> = {};
            const projectMembers = projectMembersResult.status === 'fulfilled' && !projectMembersResult.value.error
                ? projectMembersResult.value.data : null;
            if (projectMembers) {
                projectMembers.forEach((pm: any) => {
                    projectCounts[pm.user_id] = (projectCounts[pm.user_id] || 0) + 1;
                });
            }

            // 5. Merge data
            const enrichedMembers: TeamMember[] = tenantMembers.map((member: any) => {
                const roleEntry = userRoles?.find((ur: any) => ur.user_id === member.id);
                const tc = taskCounts[member.id] || { open: 0, completed: 0 };

                const roleData: any = roleEntry?.roles;
                // RBAC role (user_roles) first; tenant membership role as fallback.
                const roleName: string = roleData ? (Array.isArray(roleData) ? roleData[0]?.name : roleData.name) : (member.member_role || 'No Role');
                const roleId: string | null = roleData ? (Array.isArray(roleData) ? roleData[0]?.id : roleData.id) : null;

                return {
                    id: member.id,
                    email: member.email,
                    name: member.name,
                    avatar_url: member.avatar_url,
                    status: member.status || 'active',
                    role: roleName || 'No Role',
                    role_id: roleId || null,
                    is_agent: member.is_agent ?? false,
                    agent_type: member.agent_type ?? null,
                    agent_description: member.agent_description ?? null,
                    agent_connected: member.agent_connected ?? false,
                    assignedProjects: projectCounts[member.id] || 0,
                    openTasks: tc.open,
                    completedTasks: tc.completed,
                };
            });

            setMembers(enrichedMembers);
            hasLoadedRef.current = true;
        } catch (err: any) {
            errorLogger.error('Error fetching team members:', err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    // currentTenant?.id in deps: switching workspaces MUST refetch the member
    // list, otherwise the previous tenant's roster stays on screen.
    }, [user?.id, currentTenant?.id]);

    // Initial fetch + realtime
    const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        fetchTeamMembers();
        const debouncedFetch = () => {
            if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
            refetchTimerRef.current = setTimeout(() => fetchTeamMembers(), 300);
        };
        const channel = supabase
            .channel('team-rt')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, debouncedFetch)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, debouncedFetch)
            // Membership add/remove — the member list is tenant_members-backed now.
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tenant_members' }, debouncedFetch)
            .subscribe();
        return () => {
            if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
            supabase.removeChannel(channel);
        };
    }, [fetchTeamMembers]);

    // Get tasks for a specific member — tenant-scoped (tasks RLS spans tenants
    // for shared projects, so without the filter this listed tasks from OTHER
    // workspaces the member belongs to).
    const getMemberTasks = useCallback(async (memberId: string): Promise<TeamTask[]> => {
        try {
            if (!currentTenant?.id) return [];
            const { data, error } = await supabase
                .from('tasks')
                .select('id, title, project_id, assignee_id, completed, due_date, priority')
                .eq('assignee_id', memberId)
                .eq('tenant_id', currentTenant.id)
                .order('completed', { ascending: true })
                .order('due_date', { ascending: true });

            if (error) {
                if (import.meta.env.DEV) console.warn('Could not fetch member tasks:', error.message);
                return [];
            }

            return data || [];
        } catch (err) {
            console.error('Error fetching member tasks:', err);
            return [];
        }
    }, [currentTenant?.id]);

    // Assign task to member
    const assignTaskToMember = async (taskId: string, memberId: string): Promise<void> => {
        try {
            const { error } = await supabase
                .from('tasks')
                .update({ assignee_id: memberId })
                .eq('id', taskId);

            if (error) throw error;

            // Refresh to update counts
            await fetchTeamMembers();
        } catch (err) {
            console.error('Error assigning task:', err);
            throw err;
        }
    };

    // Update agent designation for a member
    const updateMemberAgent = async (memberId: string, agentData: { is_agent: boolean; agent_type?: string | null; agent_description?: string | null; agent_connected?: boolean }) => {
        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    is_agent: agentData.is_agent,
                    agent_type: agentData.agent_type ?? null,
                    agent_description: agentData.agent_description ?? null,
                    agent_connected: agentData.agent_connected ?? false,
                })
                .eq('id', memberId);

            if (error) throw error;

            // Update local state immediately
            setMembers(prev => prev.map(m =>
                m.id === memberId
                    ? { ...m, ...agentData }
                    : m
            ));
        } catch (err) {
            console.error('Error updating agent status:', err);
            throw err;
        }
    };

    // Update member status (suspend / activate)
    const updateMemberStatus = async (memberId: string, status: 'active' | 'suspended') => {
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ status })
                .eq('id', memberId);
            if (error) throw error;
            setMembers(prev => prev.map(m => m.id === memberId ? { ...m, status } : m));

            // Send email notification
            const tenantId = currentTenant?.id;
            const tenantName = currentTenant?.name || 'LIVV OS';
            if (tenantId) {
                const isSuspended = status === 'suspended';
                notifyWithEmail({
                    userId: memberId,
                    tenantId,
                    type: 'system',
                    title: isSuspended ? 'Account Suspended' : 'Account Activated',
                    message: isSuspended
                        ? `Your account in ${tenantName} has been suspended. Contact your administrator if you believe this is a mistake.`
                        : `Your account in ${tenantName} has been reactivated. You can now access the platform again.`,
                    priority: 'high',
                    brandName: tenantName,
                }).catch(() => {})
            }
        } catch (err) {
            errorLogger.error('Error updating member status', err);
            throw err;
        }
    };

    // Update member role
    const updateMemberRole = async (memberId: string, roleId: string) => {
        try {
            // Remove existing roles for this user
            const { error: delError } = await supabase
                .from('user_roles')
                .delete()
                .eq('user_id', memberId);
            if (delError) throw delError;

            // Assign new role
            const { error: insertError } = await supabase
                .from('user_roles')
                .insert({ user_id: memberId, role_id: roleId });
            if (insertError) throw insertError;

            // Look up role name for the notification
            const { data: roleRow } = await supabase
                .from('roles')
                .select('name')
                .eq('id', roleId)
                .single();

            // Refresh to get updated role names
            await fetchTeamMembers();

            // Send email notification
            const tenantId = currentTenant?.id;
            const tenantName = currentTenant?.name || 'LIVV OS';
            if (tenantId) {
                const roleName = roleRow?.name?.replace('_', ' ') || 'a new role';
                notifyWithEmail({
                    userId: memberId,
                    tenantId,
                    type: 'system',
                    title: 'Your role has been updated',
                    message: `Your role in ${tenantName} has been changed to ${roleName}. Your permissions have been updated accordingly.`,
                    priority: 'medium',
                    brandName: tenantName,
                }).catch(() => {})
            }
        } catch (err) {
            errorLogger.error('Error updating member role', err);
            throw err;
        }
    };

    // Remove member from tenant — server-side via RPC. tenant_members has no
    // client DELETE policy, and the old client-side writes either failed RLS
    // (other users' profile rows) or leaked across tenants (global task
    // unassign / account-wide suspend). remove_tenant_member scopes everything
    // to the current tenant and validates the caller is owner/admin.
    const removeMember = async (memberId: string) => {
        try {
            const tenantId = currentTenant?.id;
            if (!tenantId) throw new Error('No active workspace');
            const tenantName = currentTenant?.name || 'LIVV OS';

            // Look up their contact info BEFORE removing (from the member list
            // we already hold — a profiles select may be RLS-blocked).
            const member = members.find(m => m.id === memberId);
            const profile = member ? { email: member.email, name: member.name } : null;

            const { error: rpcError } = await supabase.rpc('remove_tenant_member', {
                p_tenant_id: tenantId,
                p_user_id: memberId,
            });
            if (rpcError) throw rpcError;

            if (profile?.email) {
                sendEmail({
                    template: 'member_removed',
                    to: profile.email,
                    subject: `You have been removed from ${tenantName}`,
                    brandName: tenantName,
                    data: {
                        recipientName: profile.name || undefined,
                        title: 'Account Removed',
                        message: `You have been removed from the ${tenantName} workspace. Your tasks have been unassigned and your access has been revoked. If you believe this is a mistake, please contact your team administrator.`,
                    },
                }).catch(() => {})
            }

            setMembers(prev => prev.filter(m => m.id !== memberId));
        } catch (err) {
            errorLogger.error('Error removing team member', err);
            throw err;
        }
    };

    // Check if tenant can add another member (throws ResourceLimitError if not)
    const canAddMember = async () => {
        await refreshUsage();
        if (!isWithinResourceLimit('max_users')) {
            const usage = getResourceUsage('max_users');
            throw new ResourceLimitError('max_users', usage.used, usage.limit);
        }
    };

    // Get workload summary for all members
    const getWorkloadSummary = () => {
        return members.map((m) => ({
            memberId: m.id,
            name: m.name || m.email,
            load: m.openTasks,
        }));
    };

    return (
        <TeamContext.Provider
            value={{
                members,
                isLoading,
                error,
                refresh: fetchTeamMembers,
                getMemberTasks,
                assignTaskToMember,
                getWorkloadSummary,
                updateMemberAgent,
                updateMemberStatus,
                updateMemberRole,
                removeMember,
                canAddMember,
            }}
        >
            {children}
        </TeamContext.Provider>
    );
};

export const useTeam = () => {
    const context = useContext(TeamContext);
    if (context === undefined) {
        throw new Error('useTeam must be used within a TeamProvider');
    }
    return context;
};
