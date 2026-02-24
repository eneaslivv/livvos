import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from './TenantContext';
import { errorLogger } from '../lib/errorLogger';

// Types
export interface TeamMember {
    id: string;
    email: string;
    name: string | null;
    avatar_url: string | null;
    status: 'active' | 'invited' | 'suspended';
    role: string;
    role_id: string | null;
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
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

export const TeamProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const { currentTenant } = useTenant();
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Guard against concurrent fetches
    const isFetchingRef = useRef(false);
    const lastFetchKeyRef = useRef<string | null>(null);

    // Fetch team members - depends on stable IDs, not object references
    const fetchTeamMembers = useCallback(async () => {
        const userId = user?.id;
        const tenantId = currentTenant?.id;

        if (!userId || !tenantId) {
            setMembers([]);
            setIsLoading(false);
            return;
        }

        // Prevent duplicate concurrent fetches for the same key
        const fetchKey = `${userId}-${tenantId}`;
        if (isFetchingRef.current && lastFetchKeyRef.current === fetchKey) {
            return;
        }

        isFetchingRef.current = true;
        lastFetchKeyRef.current = fetchKey;
        setIsLoading(true);
        setError(null);

        try {
            // Parallel fetch all data sources - scoped to tenant
            const [profilesResult, userRolesResult, tasksResult, projectMembersResult] = await Promise.allSettled([
                supabase.from('profiles').select('id, email, name, avatar_url, status').eq('tenant_id', tenantId).order('name'),
                supabase.from('user_roles').select('user_id, roles(id, name)'),
                supabase.from('tasks').select('assignee_id, completed').eq('tenant_id', tenantId),
                supabase.from('project_members').select('member_id, project_id'),
            ]);

            const profiles = profilesResult.status === 'fulfilled' && !profilesResult.value.error
                ? profilesResult.value.data : null;

            if (!profiles) {
                const profileError = profilesResult.status === 'fulfilled' ? profilesResult.value.error : null;
                console.warn('Could not fetch profiles:', profileError?.message || 'unknown error');
                setMembers([]);
                setIsLoading(false);
                isFetchingRef.current = false;
                return;
            }

            const userRoles = userRolesResult.status === 'fulfilled' && !userRolesResult.value.error
                ? userRolesResult.value.data : null;

            let taskCounts: Record<string, { open: number; completed: number }> = {};
            const tasks = tasksResult.status === 'fulfilled' && !tasksResult.value.error
                ? tasksResult.value.data : null;
            if (tasks) {
                tasks.forEach((task: any) => {
                    if (task.assignee_id) {
                        if (!taskCounts[task.assignee_id]) {
                            taskCounts[task.assignee_id] = { open: 0, completed: 0 };
                        }
                        if (task.completed) {
                            taskCounts[task.assignee_id].completed++;
                        } else {
                            taskCounts[task.assignee_id].open++;
                        }
                    }
                });
            }

            let projectCounts: Record<string, number> = {};
            const projectMembers = projectMembersResult.status === 'fulfilled' && !projectMembersResult.value.error
                ? projectMembersResult.value.data : null;
            if (projectMembers) {
                projectMembers.forEach((pm: any) => {
                    projectCounts[pm.member_id] = (projectCounts[pm.member_id] || 0) + 1;
                });
            }

            // Build member ID set for filtering roles
            const profileIds = new Set(profiles.map((p: any) => p.id));

            // Merge data
            const enrichedMembers: TeamMember[] = profiles.map((profile: any) => {
                const roleEntry = userRoles?.find((ur: any) => ur.user_id === profile.id);
                const memberTasks = taskCounts[profile.id] || { open: 0, completed: 0 };

                // Handle roles which could be an object or null
                const roleData: any = roleEntry?.roles;
                const roleName: string = roleData ? (Array.isArray(roleData) ? roleData[0]?.name : roleData.name) : 'No Role';
                const roleId: string | null = roleData ? (Array.isArray(roleData) ? roleData[0]?.id : roleData.id) : null;

                return {
                    id: profile.id,
                    email: profile.email,
                    name: profile.name,
                    avatar_url: profile.avatar_url,
                    status: profile.status || 'active',
                    role: roleName || 'No Role',
                    role_id: roleId || null,
                    assignedProjects: projectCounts[profile.id] || 0,
                    openTasks: memberTasks.open,
                    completedTasks: memberTasks.completed,
                };
            });

            setMembers(enrichedMembers);
        } catch (err: any) {
            errorLogger.error('Error fetching team members:', err);
            setError(err.message || 'Failed to load team');
        } finally {
            setIsLoading(false);
            isFetchingRef.current = false;
        }
    }, [user?.id, currentTenant?.id]);

    // Initial fetch - only when user + tenant are ready
    useEffect(() => {
        fetchTeamMembers();
    }, [fetchTeamMembers]);

    // Get tasks for a specific member (memoized to prevent re-render cascades)
    const getMemberTasks = useCallback(async (memberId: string): Promise<TeamTask[]> => {
        try {
            const query = supabase
                .from('tasks')
                .select('id, title, project_id, assignee_id, completed, due_date, priority')
                .eq('assignee_id', memberId)
                .order('completed', { ascending: true })
                .order('due_date', { ascending: true });

            // Scope to tenant if available
            if (currentTenant?.id) {
                query.eq('tenant_id', currentTenant.id);
            }

            const { data, error } = await query;

            if (error) {
                console.warn('Could not fetch member tasks:', error.message);
                return [];
            }

            return data || [];
        } catch (err) {
            console.error('Error fetching member tasks:', err);
            return [];
        }
    }, [currentTenant?.id]);

    // Assign task to member
    const assignTaskToMember = useCallback(async (taskId: string, memberId: string): Promise<void> => {
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
    }, [fetchTeamMembers]);

    // Get workload summary for all members
    const getWorkloadSummary = useCallback(() => {
        return members.map((m) => ({
            memberId: m.id,
            name: m.name || m.email,
            load: m.openTasks,
        }));
    }, [members]);

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
