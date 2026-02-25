import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch team members — queries run in parallel to avoid one slow query blocking the rest
    const fetchTeamMembers = useCallback(async () => {
        if (!user) {
            setMembers([]);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // Run all queries in parallel so one slow/hanging query doesn't block the rest
            const [profilesResult, userRolesResult, tasksResult, projectMembersResult] = await Promise.allSettled([
                supabase.from('profiles').select('*').order('name'),
                supabase.from('user_roles').select('user_id, roles(id, name)'),
                supabase.from('tasks').select('assignee_id, completed'),
                supabase.from('project_members').select('member_id'),
            ]);

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
                    assignedProjects: projectCounts[profile.id] || 0,
                    openTasks: tc.open,
                    completedTasks: tc.completed,
                };
            });

            setMembers(enrichedMembers);
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
