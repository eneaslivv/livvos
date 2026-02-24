import React, { useState, useEffect } from 'react';
import { Icons } from '../components/ui/Icons';
import { useTeam, TeamMember, TeamTask } from '../context/TeamContext';
import { useRBAC } from '../context/RBACContext';

const getRoleColor = (role: string) => {
    switch (role.toLowerCase()) {
        case 'owner':
        case 'admin':
            return 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400';
        case 'project_manager':
            return 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400';
        case 'finance_manager':
            return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400';
        case 'editor':
            return 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400';
        case 'viewer':
            return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400';
        default:
            return 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400';
    }
};

const getStatusColor = (status: TeamMember['status']) => {
    switch (status) {
        case 'active':
            return 'bg-emerald-500';
        case 'invited':
            return 'bg-amber-500';
        case 'suspended':
            return 'bg-rose-500';
        default:
            return 'bg-zinc-400';
    }
};

const getWorkloadColor = (openTasks: number) => {
    if (openTasks === 0) return 'text-zinc-400';
    if (openTasks <= 3) return 'text-emerald-500';
    if (openTasks <= 7) return 'text-amber-500';
    return 'text-rose-500';
};

export const Team: React.FC = () => {
    const { members, isLoading, error, refresh, getMemberTasks } = useTeam();
    const { isAdmin } = useRBAC();
    const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
    const [memberTasks, setMemberTasks] = useState<TeamTask[]>([]);
    const [tasksLoading, setTasksLoading] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    // Load tasks when member is selected
    useEffect(() => {
        let cancelled = false;
        if (selectedMember) {
            setTasksLoading(true);
            getMemberTasks(selectedMember.id)
                .then((tasks) => {
                    if (!cancelled) setMemberTasks(tasks);
                })
                .finally(() => {
                    if (!cancelled) setTasksLoading(false);
                });
        } else {
            setMemberTasks([]);
        }
        return () => { cancelled = true; };
    }, [selectedMember?.id, getMemberTasks]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-zinc-900 dark:border-zinc-100 mx-auto mb-4" />
                    <p className="text-zinc-600 dark:text-zinc-400">Loading team...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6">
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
                    <h2 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-2">Error loading team</h2>
                    <p className="text-red-700 dark:text-red-400 mb-4">{error}</p>
                    <button onClick={refresh} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg">
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Team</h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                        {members.length} team member{members.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {/* View Toggle */}
                    <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-2 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'}`}
                        >
                            <Icons.Grid size={16} />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-2 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'}`}
                        >
                            <Icons.List size={16} />
                        </button>
                    </div>
                    <button onClick={refresh} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                        <Icons.RefreshCw size={18} className="text-zinc-500" />
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Team Members List */}
                <div className="lg:col-span-2">
                    {viewMode === 'grid' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {members.map((member) => (
                                <div
                                    key={member.id}
                                    onClick={() => setSelectedMember(member)}
                                    className={`p-5 bg-white dark:bg-zinc-900 rounded-xl border cursor-pointer transition-all hover:shadow-md ${selectedMember?.id === member.id
                                            ? 'border-indigo-300 dark:border-indigo-700 ring-2 ring-indigo-100 dark:ring-indigo-900/30'
                                            : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                                        }`}
                                >
                                    <div className="flex items-start gap-4">
                                        {/* Avatar */}
                                        <div className="relative shrink-0">
                                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold text-lg">
                                                {member.avatar_url ? (
                                                    <img src={member.avatar_url} alt={member.name || ''} className="w-full h-full rounded-full object-cover" />
                                                ) : (
                                                    (member.name || member.email).substring(0, 2).toUpperCase()
                                                )}
                                            </div>
                                            <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-zinc-900 ${getStatusColor(member.status)}`} />
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                                                    {member.name || 'Unnamed'}
                                                </h3>
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${getRoleColor(member.role)}`}>
                                                    {member.role}
                                                </span>
                                            </div>
                                            <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate">{member.email}</p>

                                            {/* Stats */}
                                            <div className="flex items-center gap-4 mt-3 text-xs">
                                                <div className="flex items-center gap-1.5">
                                                    <Icons.Briefcase size={12} className="text-zinc-400" />
                                                    <span className="text-zinc-600 dark:text-zinc-400">{member.assignedProjects} projects</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <Icons.Check size={12} className={getWorkloadColor(member.openTasks)} />
                                                    <span className={getWorkloadColor(member.openTasks)}>{member.openTasks} open tasks</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {members.length === 0 && (
                                <div className="col-span-2 p-12 text-center bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
                                    <Icons.Users size={48} className="mx-auto text-zinc-400 mb-4" />
                                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">No team members yet</h3>
                                    <p className="text-zinc-500 dark:text-zinc-400">Invite team members from Configuration → User Management</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* List View */
                        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                                    <tr className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                                        <th className="px-4 py-3 text-left">Member</th>
                                        <th className="px-4 py-3 text-left">Role</th>
                                        <th className="px-4 py-3 text-center">Projects</th>
                                        <th className="px-4 py-3 text-center">Tasks</th>
                                        <th className="px-4 py-3 text-left">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                    {members.map((member) => (
                                        <tr
                                            key={member.id}
                                            onClick={() => setSelectedMember(member)}
                                            className={`cursor-pointer transition-colors ${selectedMember?.id === member.id ? 'bg-indigo-50 dark:bg-indigo-900/10' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/30'
                                                }`}
                                        >
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                                                        {(member.name || member.email).substring(0, 2).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div className="font-medium text-zinc-900 dark:text-zinc-100">{member.name || 'Unnamed'}</div>
                                                        <div className="text-xs text-zinc-500">{member.email}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getRoleColor(member.role)}`}>
                                                    {member.role}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center text-sm text-zinc-600 dark:text-zinc-400">{member.assignedProjects}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`text-sm font-medium ${getWorkloadColor(member.openTasks)}`}>
                                                    {member.openTasks}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-2 h-2 rounded-full ${getStatusColor(member.status)}`} />
                                                    <span className="text-xs text-zinc-600 dark:text-zinc-400 capitalize">{member.status}</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Member Detail Panel */}
                <div className="lg:col-span-1">
                    {selectedMember ? (
                        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden sticky top-24">
                            {/* Header */}
                            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/10 dark:to-purple-900/10">
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold text-2xl shadow-lg">
                                        {(selectedMember.name || selectedMember.email).substring(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{selectedMember.name || 'Unnamed'}</h2>
                                        <p className="text-sm text-zinc-500">{selectedMember.email}</p>
                                        <span className={`inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getRoleColor(selectedMember.role)}`}>
                                            {selectedMember.role}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Stats */}
                            <div className="p-4 grid grid-cols-3 gap-3 border-b border-zinc-100 dark:border-zinc-800">
                                <div className="text-center">
                                    <div className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{selectedMember.assignedProjects}</div>
                                    <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Projects</div>
                                </div>
                                <div className="text-center">
                                    <div className={`text-xl font-bold ${getWorkloadColor(selectedMember.openTasks)}`}>{selectedMember.openTasks}</div>
                                    <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Open Tasks</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-xl font-bold text-emerald-500">{selectedMember.completedTasks}</div>
                                    <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Completed</div>
                                </div>
                            </div>

                            {/* Tasks */}
                            <div className="p-4">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3">Assigned Tasks</h3>
                                {tasksLoading ? (
                                    <div className="text-center py-6 text-zinc-400">
                                        <div className="animate-spin w-5 h-5 border-2 border-zinc-300 border-t-zinc-600 rounded-full mx-auto mb-2" />
                                        Loading tasks...
                                    </div>
                                ) : memberTasks.length > 0 ? (
                                    <div className="space-y-2 max-h-64 overflow-y-auto">
                                        {memberTasks.map((task) => (
                                            <div
                                                key={task.id}
                                                className={`p-3 rounded-lg border transition-colors ${task.completed
                                                        ? 'bg-zinc-50 dark:bg-zinc-800/30 border-zinc-100 dark:border-zinc-800 opacity-60'
                                                        : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
                                                    }`}
                                            >
                                                <div className="flex items-start gap-2">
                                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${task.completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-zinc-300 dark:border-zinc-600'
                                                        }`}>
                                                        {task.completed && <Icons.Check size={10} />}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className={`text-sm ${task.completed ? 'line-through text-zinc-500' : 'text-zinc-900 dark:text-zinc-100'}`}>
                                                            {task.title}
                                                        </p>
                                                        {task.due_date && (
                                                            <p className="text-[10px] text-zinc-400 mt-1">
                                                                Due: {new Date(task.due_date).toLocaleDateString()}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-6 text-zinc-400">
                                        <Icons.Check size={24} className="mx-auto mb-2" />
                                        <p className="text-sm">No tasks assigned</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-12 text-center">
                            <Icons.Users size={48} className="mx-auto text-zinc-400 mb-4" />
                            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Select a team member</h3>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400">Click on a member to view their details and tasks</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
