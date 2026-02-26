import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
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
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

export const TeamProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const hasLoadedRef = useRef(false);

    // Fetch team members — queries run in parallel to avoid one slow query blocking the rest
    const fetchTeamMembers = useCallback(async () => {
        if (!user) {
            setMembers([]);
            setIsLoading(false);
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

            // Run all queries in parallel so one slow/hanging query doesn't block the rest
            const [profilesResult, userRolesResult, tasksResult, projectMembersResult] = await Promise.race([
                Promise.allSettled([
                    supabase.from('profiles').select('*').order('name'),
                    supabase.from('user_roles').select('user_id, roles(id, name)'),
                    supabase.from('tasks').select('assignee_id, completed'),
                    supabase.from('project_members').select('member_id'),
                ]),
                timeout,
            ]) as [PromiseSettledResult<any>, PromiseSettledResult<any>, PromiseSettledResult<any>, PromiseSettledResult<any>];

            // 1. Profiles (required)
            const profiles = profilesResult.status === 'fulfilled' && !profilesResult.value.error
                ? profilesResult.value.data : null;

            if (!profiles) {
                const msg = profilesResult.status === 'rejected'
                    ? (profilesResult.reason as Error).message
                    : (profilesResult as PromiseFulfilledResult<any>).value?.error?.message || 'Unknown error';
                console.warn('Could not fetch profiles:', msg);
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

            // 4. Project counts (optional)
            let projectCounts: Record<string, number> = {};
            const projectMembers = projectMembersResult.status === 'fulfilled' && !projectMembersResult.value.error
                ? projectMembersResult.value.data : null;
            if (projectMembers) {
                projectMembers.forEach((pm: any) => {
                    projectCounts[pm.member_id] = (projectCounts[pm.member_id] || 0) + 1;
                });
            }

            // 5. Merge data
            const enrichedMembers: TeamMember[] = profiles.map((profile: any) => {
                const roleEntry = userRoles?.find((ur: any) => ur.user_id === profile.id);
                const tc = taskCounts[profile.id] || { open: 0, completed: 0 };

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
                    is_agent: profile.is_agent ?? false,
                    agent_type: profile.agent_type ?? null,
                    agent_description: profile.agent_description ?? null,
                    agent_connected: profile.agent_connected ?? false,
                    assignedProjects: projectCounts[profile.id] || 0,
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
    }, [user?.id]);

    // Initial fetch
    useEffect(() => {
        fetchTeamMembers();
    }, [fetchTeamMembers]);

    // Get tasks for a specific member
    const getMemberTasks = useCallback(async (memberId: string): Promise<TeamTask[]> => {
        try {
            const { data, error } = await supabase
                .from('tasks')
                .select('id, title, project_id, assignee_id, completed, due_date, priority')
                .eq('assignee_id', memberId)
                .order('completed', { ascending: true })
                .order('due_date', { ascending: true });

            if (error) {
                console.warn('Could not fetch member tasks:', error.message);
                return [];
            }

            return data || [];
        } catch (err) {
            console.error('Error fetching member tasks:', err);
            return [];
        }
    }, []);

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
