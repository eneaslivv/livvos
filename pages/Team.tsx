import React, { useState, useEffect, useMemo } from 'react';
import { Icons } from '../components/ui/Icons';
import { SlidePanel } from '../components/ui/SlidePanel';
import { useTeam, TeamMember, TeamTask } from '../context/TeamContext';
import { useRBAC } from '../context/RBACContext';

const AGENT_TYPES = [
    { value: 'ai-assistant', label: 'AI Assistant', icon: 'Brain' },
    { value: 'automation', label: 'Automation Bot', icon: 'Workflow' },
    { value: 'integration', label: 'Integration', icon: 'Plug' },
    { value: 'monitor', label: 'Monitor', icon: 'Radio' },
    { value: 'custom', label: 'Custom Agent', icon: 'Cpu' },
] as const;

const getRoleBadge = (role: string) => {
    switch (role.toLowerCase()) {
        case 'owner':
        case 'admin':
            return { bg: 'bg-violet-500/10 border-violet-500/20', text: 'text-violet-600 dark:text-violet-400', dot: 'bg-violet-500' };
        case 'project_manager':
            return { bg: 'bg-blue-500/10 border-blue-500/20', text: 'text-blue-600 dark:text-blue-400', dot: 'bg-blue-500' };
        case 'finance_manager':
            return { bg: 'bg-emerald-500/10 border-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' };
        case 'editor':
            return { bg: 'bg-amber-500/10 border-amber-500/20', text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' };
        case 'viewer':
            return { bg: 'bg-zinc-500/10 border-zinc-500/20', text: 'text-zinc-600 dark:text-zinc-400', dot: 'bg-zinc-400' };
        default:
            return { bg: 'bg-zinc-500/10 border-zinc-500/20', text: 'text-zinc-500 dark:text-zinc-400', dot: 'bg-zinc-400' };
    }
};

const getStatusIndicator = (status: TeamMember['status']) => {
    switch (status) {
        case 'active': return { color: 'bg-emerald-400', ring: 'ring-emerald-400/20', label: 'Online' };
        case 'invited': return { color: 'bg-amber-400', ring: 'ring-amber-400/20', label: 'Invited' };
        case 'suspended': return { color: 'bg-rose-400', ring: 'ring-rose-400/20', label: 'Suspended' };
        default: return { color: 'bg-zinc-400', ring: 'ring-zinc-400/20', label: 'Unknown' };
    }
};

const getAgentTypeInfo = (type: string | null) => {
    const found = AGENT_TYPES.find(t => t.value === type);
    return found || { value: 'custom', label: type || 'Agent', icon: 'Bot' };
};

type FilterTab = 'all' | 'people' | 'agents';

export const Team: React.FC = () => {
    const { members, isLoading, error, refresh, getMemberTasks, updateMemberAgent } = useTeam();
    const { isAdmin } = useRBAC();
    const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
    const [memberTasks, setMemberTasks] = useState<TeamTask[]>([]);
    const [tasksLoading, setTasksLoading] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [filterTab, setFilterTab] = useState<FilterTab>('all');
    const [search, setSearch] = useState('');
    const [panelOpen, setPanelOpen] = useState(false);

    // Agent config state
    const [agentEditing, setAgentEditing] = useState(false);
    const [agentForm, setAgentForm] = useState({ is_agent: false, agent_type: '' as string, agent_description: '' as string, agent_connected: false });
    const [agentSaving, setAgentSaving] = useState(false);

    // Filtered members
    const filteredMembers = useMemo(() => {
        let list = members;
        if (filterTab === 'people') list = list.filter(m => !m.is_agent);
        if (filterTab === 'agents') list = list.filter(m => m.is_agent);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(m =>
                (m.name || '').toLowerCase().includes(q) ||
                m.email.toLowerCase().includes(q) ||
                m.role.toLowerCase().includes(q) ||
                (m.agent_type || '').toLowerCase().includes(q)
            );
        }
        return list;
    }, [members, filterTab, search]);

    const agentCount = useMemo(() => members.filter(m => m.is_agent).length, [members]);
    const peopleCount = members.length - agentCount;

    // Load tasks when member is selected
    useEffect(() => {
        if (selectedMember) {
            setTasksLoading(true);
            getMemberTasks(selectedMember.id)
                .then(setMemberTasks)
                .finally(() => setTasksLoading(false));
        } else {
            setMemberTasks([]);
        }
    }, [selectedMember, getMemberTasks]);

    const handleSelectMember = (member: TeamMember) => {
        setSelectedMember(member);
        setPanelOpen(true);
        setAgentEditing(false);
        setAgentForm({
            is_agent: member.is_agent,
            agent_type: member.agent_type || '',
            agent_description: member.agent_description || '',
            agent_connected: member.agent_connected,
        });
    };

    const handleSaveAgent = async () => {
        if (!selectedMember) return;
        setAgentSaving(true);
        try {
            await updateMemberAgent(selectedMember.id, {
                is_agent: agentForm.is_agent,
                agent_type: agentForm.is_agent ? (agentForm.agent_type || 'custom') : null,
                agent_description: agentForm.is_agent ? agentForm.agent_description : null,
                agent_connected: agentForm.is_agent ? agentForm.agent_connected : false,
            });
            // Update local selectedMember
            setSelectedMember(prev => prev ? {
                ...prev,
                is_agent: agentForm.is_agent,
                agent_type: agentForm.is_agent ? (agentForm.agent_type || 'custom') : null,
                agent_description: agentForm.is_agent ? agentForm.agent_description : null,
                agent_connected: agentForm.is_agent ? agentForm.agent_connected : false,
            } : null);
            setAgentEditing(false);
        } catch (err) {
            console.error('Error saving agent config:', err);
        } finally {
            setAgentSaving(false);
        }
    };

    const handleToggleConnection = async (member: TeamMember) => {
        try {
            await updateMemberAgent(member.id, {
                is_agent: member.is_agent,
                agent_type: member.agent_type,
                agent_description: member.agent_description,
                agent_connected: !member.agent_connected,
            });
            if (selectedMember?.id === member.id) {
                setSelectedMember(prev => prev ? { ...prev, agent_connected: !prev.agent_connected } : null);
                setAgentForm(prev => ({ ...prev, agent_connected: !prev.agent_connected }));
            }
        } catch (err) {
            console.error('Error toggling connection:', err);
        }
    };

    const AgentIcon = ({ type, size = 16, className = '' }: { type: string | null; size?: number; className?: string }) => {
        const info = getAgentTypeInfo(type);
        const I = Icons[info.icon as keyof typeof Icons] || Icons.Bot;
        return <I size={size} className={className} />;
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <Icons.Loader size={24} className="animate-spin mx-auto mb-3 text-zinc-400" />
                    <p className="text-sm text-zinc-500">Loading team...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6">
                <div className="bg-red-50 dark:bg-red-900/10 border border-red-200/60 dark:border-red-800/40 rounded-2xl p-6">
                    <h2 className="text-base font-semibold text-red-900 dark:text-red-100 mb-1">Error loading team</h2>
                    <p className="text-sm text-red-600 dark:text-red-400 mb-4">{error}</p>
                    <button onClick={refresh} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors">
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-[1600px] mx-auto pb-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Team</h1>
                    <p className="text-sm text-zinc-500 mt-0.5">
                        {peopleCount} member{peopleCount !== 1 ? 's' : ''}
                        {agentCount > 0 && <span className="ml-1 text-violet-500"> &middot; {agentCount} agent{agentCount !== 1 ? 's' : ''}</span>}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {/* Search */}
                    <div className="relative">
                        <Icons.Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search..."
                            className="pl-9 pr-3 py-2 w-48 text-sm bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/40 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 dark:focus:border-violet-600 transition-all placeholder:text-zinc-400"
                        />
                    </div>
                    {/* View Toggle */}
                    <div className="flex bg-zinc-100 dark:bg-zinc-800/60 rounded-xl p-1 border border-zinc-200/60 dark:border-zinc-700/40">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 hover:text-zinc-600'}`}
                        >
                            <Icons.Grid size={15} />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 hover:text-zinc-600'}`}
                        >
                            <Icons.List size={15} />
                        </button>
                    </div>
                    <button onClick={refresh} className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors border border-zinc-200/60 dark:border-zinc-700/40">
                        <Icons.RefreshCw size={15} className="text-zinc-400" />
                    </button>
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 mb-5 bg-zinc-100/80 dark:bg-zinc-800/40 rounded-xl p-1 w-fit border border-zinc-200/40 dark:border-zinc-700/30">
                {([
                    { key: 'all' as FilterTab, label: 'All', count: members.length },
                    { key: 'people' as FilterTab, label: 'People', count: peopleCount },
                    { key: 'agents' as FilterTab, label: 'Agents', count: agentCount },
                ]).map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setFilterTab(tab.key)}
                        className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
                            filterTab === tab.key
                                ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100'
                                : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                        }`}
                    >
                        {tab.key === 'agents' && <Icons.Bot size={14} />}
                        {tab.key === 'people' && <Icons.Users size={14} />}
                        {tab.label}
                        <span className={`text-[11px] px-1.5 py-0.5 rounded-md ${
                            filterTab === tab.key
                                ? 'bg-zinc-100 dark:bg-zinc-600 text-zinc-600 dark:text-zinc-300'
                                : 'bg-zinc-200/60 dark:bg-zinc-700/60 text-zinc-400'
                        }`}>
                            {tab.count}
                        </span>
                    </button>
                ))}
            </div>

            {/* Grid View */}
            {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredMembers.map((member) => {
                        const statusInfo = getStatusIndicator(member.status);
                        const roleBadge = getRoleBadge(member.role);
                        const isSelected = selectedMember?.id === member.id;
                        const agentInfo = member.is_agent ? getAgentTypeInfo(member.agent_type) : null;

                        return (
                            <div
                                key={member.id}
                                onClick={() => handleSelectMember(member)}
                                className={`group relative p-5 rounded-2xl border cursor-pointer transition-all duration-200 ${
                                    isSelected
                                        ? 'bg-white dark:bg-zinc-900 border-violet-300 dark:border-violet-700 ring-2 ring-violet-100 dark:ring-violet-900/30 shadow-lg shadow-violet-500/5'
                                        : 'bg-white dark:bg-zinc-900 border-zinc-200/70 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md'
                                }`}
                            >
                                {/* Agent badge */}
                                {member.is_agent && (
                                    <div className="absolute top-3 right-3 flex items-center gap-1.5">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleToggleConnection(member); }}
                                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide border transition-all ${
                                                member.agent_connected
                                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
                                                    : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                            }`}
                                        >
                                            {member.agent_connected ? <Icons.Radio size={10} /> : <Icons.Unplug size={10} />}
                                            {member.agent_connected ? 'Live' : 'Off'}
                                        </button>
                                    </div>
                                )}

                                {/* Avatar + Info */}
                                <div className="flex items-start gap-3.5">
                                    <div className="relative shrink-0">
                                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-sm ${
                                            member.is_agent
                                                ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500'
                                                : 'bg-gradient-to-br from-zinc-600 to-zinc-800 dark:from-zinc-500 dark:to-zinc-700'
                                        }`}>
                                            {member.is_agent ? (
                                                <AgentIcon type={member.agent_type} size={18} />
                                            ) : member.avatar_url ? (
                                                <img src={member.avatar_url} alt={member.name || ''} className="w-full h-full rounded-xl object-cover" />
                                            ) : (
                                                (member.name || member.email).substring(0, 2).toUpperCase()
                                            )}
                                        </div>
                                        <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-zinc-900 ${statusInfo.color}`} />
                                    </div>

                                    <div className="flex-1 min-w-0 pt-0.5">
                                        <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                                            {member.name || 'Unnamed'}
                                        </h3>
                                        <p className="text-xs text-zinc-400 truncate mt-0.5">{member.email}</p>
                                    </div>
                                </div>

                                {/* Role + agent type */}
                                <div className="flex items-center gap-2 mt-3.5">
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border ${roleBadge.bg} ${roleBadge.text}`}>
                                        <span className={`w-1 h-1 rounded-full ${roleBadge.dot}`} />
                                        {member.role === 'No Role' ? 'No role' : member.role.replace('_', ' ')}
                                    </span>
                                    {agentInfo && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-violet-500/10 border border-violet-500/20 text-violet-500 dark:text-violet-400">
                                            <Icons.Bot size={9} />
                                            {agentInfo.label}
                                        </span>
                                    )}
                                </div>

                                {/* Stats bar */}
                                <div className="flex items-center gap-3 mt-3.5 pt-3.5 border-t border-zinc-100 dark:border-zinc-800/60">
                                    <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                                        <Icons.Briefcase size={12} className="text-zinc-400" />
                                        <span>{member.assignedProjects}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                                        <Icons.Target size={12} className="text-zinc-400" />
                                        <span>{member.openTasks} open</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                                        <Icons.Check size={12} className="text-emerald-400" />
                                        <span>{member.completedTasks}</span>
                                    </div>
                                    {/* Workload mini bar */}
                                    <div className="flex-1 flex justify-end">
                                        <div className="w-16 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all ${
                                                    member.openTasks === 0 ? 'bg-zinc-300' :
                                                    member.openTasks <= 3 ? 'bg-emerald-400' :
                                                    member.openTasks <= 7 ? 'bg-amber-400' : 'bg-rose-400'
                                                }`}
                                                style={{ width: `${Math.min(100, (member.openTasks / 10) * 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {filteredMembers.length === 0 && (
                        <div className="col-span-full p-16 text-center bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/70 dark:border-zinc-800">
                            {filterTab === 'agents' ? (
                                <>
                                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-violet-500/10 flex items-center justify-center">
                                        <Icons.Bot size={28} className="text-violet-400" />
                                    </div>
                                    <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-1">No agents yet</h3>
                                    <p className="text-sm text-zinc-500 max-w-xs mx-auto">
                                        Select a team member and designate them as an agent to automate tasks and integrations.
                                    </p>
                                </>
                            ) : (
                                <>
                                    <Icons.Users size={36} className="mx-auto text-zinc-300 dark:text-zinc-600 mb-4" />
                                    <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-1">No members found</h3>
                                    <p className="text-sm text-zinc-500">
                                        {search ? 'Try a different search term.' : 'Invite team members from Configuration.'}
                                    </p>
                                </>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                /* List View */
                <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/70 dark:border-zinc-800 overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800">
                                <th className="px-5 py-3 text-left">Member</th>
                                <th className="px-5 py-3 text-left">Role</th>
                                <th className="px-5 py-3 text-center">Projects</th>
                                <th className="px-5 py-3 text-center">Tasks</th>
                                <th className="px-5 py-3 text-left">Status</th>
                                <th className="px-5 py-3 text-center">Agent</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
                            {filteredMembers.map((member) => {
                                const statusInfo = getStatusIndicator(member.status);
                                const roleBadge = getRoleBadge(member.role);

                                return (
                                    <tr
                                        key={member.id}
                                        onClick={() => handleSelectMember(member)}
                                        className={`cursor-pointer transition-colors ${
                                            selectedMember?.id === member.id
                                                ? 'bg-violet-50/50 dark:bg-violet-900/5'
                                                : 'hover:bg-zinc-50/80 dark:hover:bg-zinc-800/20'
                                        }`}
                                    >
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold ${
                                                    member.is_agent
                                                        ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500'
                                                        : 'bg-gradient-to-br from-zinc-600 to-zinc-800'
                                                }`}>
                                                    {member.is_agent ? (
                                                        <AgentIcon type={member.agent_type} size={14} />
                                                    ) : (
                                                        (member.name || member.email).substring(0, 2).toUpperCase()
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{member.name || 'Unnamed'}</div>
                                                    <div className="text-[11px] text-zinc-400">{member.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${roleBadge.bg} ${roleBadge.text}`}>
                                                <span className={`w-1 h-1 rounded-full ${roleBadge.dot}`} />
                                                {member.role === 'No Role' ? 'No role' : member.role.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5 text-center text-sm text-zinc-500">{member.assignedProjects}</td>
                                        <td className="px-5 py-3.5 text-center">
                                            <span className={`text-sm font-medium ${
                                                member.openTasks === 0 ? 'text-zinc-400' :
                                                member.openTasks <= 3 ? 'text-emerald-500' :
                                                member.openTasks <= 7 ? 'text-amber-500' : 'text-rose-500'
                                            }`}>
                                                {member.openTasks}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full ${statusInfo.color}`} />
                                                <span className="text-xs text-zinc-500 capitalize">{member.status}</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3.5 text-center">
                                            {member.is_agent ? (
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                                                        member.agent_connected
                                                            ? 'bg-emerald-500/10 text-emerald-500'
                                                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
                                                    }`}>
                                                        {member.agent_connected ? <Icons.Radio size={9} /> : <Icons.Unplug size={9} />}
                                                        {member.agent_connected ? 'Live' : 'Off'}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-zinc-300 dark:text-zinc-700">-</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {filteredMembers.length === 0 && (
                        <div className="p-12 text-center text-zinc-400">
                            <Icons.Search size={24} className="mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No members match your search.</p>
                        </div>
                    )}
                </div>
            )}

            {/* Detail Slide Panel */}
            <SlidePanel
                isOpen={panelOpen}
                onClose={() => { setPanelOpen(false); setAgentEditing(false); }}
                title={selectedMember?.name || 'Unnamed'}
                subtitle={selectedMember?.email}
                width="md"
            >
                {selectedMember && (
                    <div>
                        {/* Profile header */}
                        <div className="p-6 bg-gradient-to-br from-zinc-50 to-zinc-100/50 dark:from-zinc-800/30 dark:to-zinc-900/50 border-b border-zinc-100 dark:border-zinc-800/60">
                            <div className="flex items-center gap-4">
                                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-xl shadow-lg ${
                                    selectedMember.is_agent
                                        ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500'
                                        : 'bg-gradient-to-br from-zinc-600 to-zinc-800'
                                }`}>
                                    {selectedMember.is_agent ? (
                                        <AgentIcon type={selectedMember.agent_type} size={26} />
                                    ) : selectedMember.avatar_url ? (
                                        <img src={selectedMember.avatar_url} alt="" className="w-full h-full rounded-2xl object-cover" />
                                    ) : (
                                        (selectedMember.name || selectedMember.email).substring(0, 2).toUpperCase()
                                    )}
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border ${getRoleBadge(selectedMember.role).bg} ${getRoleBadge(selectedMember.role).text}`}>
                                            <span className={`w-1 h-1 rounded-full ${getRoleBadge(selectedMember.role).dot}`} />
                                            {selectedMember.role.replace('_', ' ')}
                                        </span>
                                        {selectedMember.is_agent && (
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                                                selectedMember.agent_connected
                                                    ? 'bg-emerald-500/10 text-emerald-500'
                                                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
                                            }`}>
                                                {selectedMember.agent_connected ? <Icons.Radio size={9} /> : <Icons.Unplug size={9} />}
                                                {selectedMember.agent_connected ? 'Connected' : 'Disconnected'}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-2">
                                        <div className={`w-2 h-2 rounded-full ${getStatusIndicator(selectedMember.status).color}`} />
                                        <span className="text-xs text-zinc-500 capitalize">{selectedMember.status}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-px bg-zinc-100 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-800/60">
                            {[
                                { label: 'Projects', value: selectedMember.assignedProjects, color: 'text-blue-500' },
                                { label: 'Open Tasks', value: selectedMember.openTasks, color: selectedMember.openTasks > 7 ? 'text-rose-500' : selectedMember.openTasks > 3 ? 'text-amber-500' : 'text-emerald-500' },
                                { label: 'Completed', value: selectedMember.completedTasks, color: 'text-emerald-500' },
                            ].map(stat => (
                                <div key={stat.label} className="bg-white dark:bg-zinc-900 p-4 text-center">
                                    <div className={`text-xl font-bold ${stat.color}`}>{stat.value}</div>
                                    <div className="text-[10px] text-zinc-400 uppercase tracking-wide mt-0.5">{stat.label}</div>
                                </div>
                            ))}
                        </div>

                        {/* Agent Configuration Section */}
                        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800/60">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                                    <Icons.Bot size={13} />
                                    Agent Configuration
                                </h3>
                                {!agentEditing ? (
                                    <button
                                        onClick={() => setAgentEditing(true)}
                                        className="text-xs text-violet-500 hover:text-violet-600 font-medium transition-colors"
                                    >
                                        {selectedMember.is_agent ? 'Edit' : 'Configure'}
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setAgentEditing(false)}
                                            className="text-xs text-zinc-400 hover:text-zinc-600 font-medium transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleSaveAgent}
                                            disabled={agentSaving}
                                            className="text-xs bg-violet-500 hover:bg-violet-600 text-white px-3 py-1 rounded-lg font-medium transition-colors disabled:opacity-50"
                                        >
                                            {agentSaving ? 'Saving...' : 'Save'}
                                        </button>
                                    </div>
                                )}
                            </div>

                            {agentEditing ? (
                                <div className="space-y-3">
                                    {/* Agent toggle */}
                                    <label className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/30 border border-zinc-200/50 dark:border-zinc-700/30 cursor-pointer">
                                        <div className="flex items-center gap-2">
                                            <Icons.Bot size={16} className="text-violet-500" />
                                            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Designate as Agent</span>
                                        </div>
                                        <button
                                            onClick={() => setAgentForm(f => ({ ...f, is_agent: !f.is_agent }))}
                                            className={`relative w-10 h-5.5 rounded-full transition-colors ${agentForm.is_agent ? 'bg-violet-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}
                                        >
                                            <span className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-transform ${agentForm.is_agent ? 'translate-x-[18px]' : ''}`}
                                                  style={{ width: 18, height: 18, top: 2, left: 2, transform: agentForm.is_agent ? 'translateX(18px)' : 'translateX(0)' }} />
                                        </button>
                                    </label>

                                    {agentForm.is_agent && (
                                        <>
                                            {/* Agent type */}
                                            <div>
                                                <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-1.5 block">Type</label>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {AGENT_TYPES.map(type => {
                                                        const TypeIcon = Icons[type.icon as keyof typeof Icons] || Icons.Bot;
                                                        return (
                                                            <button
                                                                key={type.value}
                                                                onClick={() => setAgentForm(f => ({ ...f, agent_type: type.value }))}
                                                                className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-medium border transition-all ${
                                                                    agentForm.agent_type === type.value
                                                                        ? 'bg-violet-500/10 border-violet-500/30 text-violet-600 dark:text-violet-400'
                                                                        : 'bg-white dark:bg-zinc-800/50 border-zinc-200/60 dark:border-zinc-700/40 text-zinc-600 dark:text-zinc-400 hover:border-violet-300'
                                                                }`}
                                                            >
                                                                <TypeIcon size={14} />
                                                                {type.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {/* Description */}
                                            <div>
                                                <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-1.5 block">Description</label>
                                                <textarea
                                                    value={agentForm.agent_description}
                                                    onChange={e => setAgentForm(f => ({ ...f, agent_description: e.target.value }))}
                                                    placeholder="What does this agent do?"
                                                    rows={2}
                                                    className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-700/40 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/30 resize-none placeholder:text-zinc-400"
                                                />
                                            </div>

                                            {/* Connected toggle */}
                                            <label className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/30 border border-zinc-200/50 dark:border-zinc-700/30 cursor-pointer">
                                                <div className="flex items-center gap-2">
                                                    {agentForm.agent_connected ? <Icons.Radio size={16} className="text-emerald-500" /> : <Icons.Unplug size={16} className="text-zinc-400" />}
                                                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                                                        {agentForm.agent_connected ? 'Connected' : 'Disconnected'}
                                                    </span>
                                                </div>
                                                <button
                                                    onClick={() => setAgentForm(f => ({ ...f, agent_connected: !f.agent_connected }))}
                                                    className={`relative w-10 rounded-full transition-colors ${agentForm.agent_connected ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}
                                                >
                                                    <span className="rounded-full bg-white shadow transition-transform block"
                                                          style={{ width: 18, height: 18, marginTop: 2, marginLeft: 2, transform: agentForm.agent_connected ? 'translateX(18px)' : 'translateX(0)' }} />
                                                </button>
                                            </label>
                                        </>
                                    )}
                                </div>
                            ) : selectedMember.is_agent ? (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 p-3 rounded-xl bg-violet-500/5 border border-violet-500/10">
                                        <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                                            <AgentIcon type={selectedMember.agent_type} size={16} className="text-violet-500" />
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{getAgentTypeInfo(selectedMember.agent_type).label}</div>
                                            {selectedMember.agent_description && (
                                                <p className="text-xs text-zinc-500 mt-0.5">{selectedMember.agent_description}</p>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleToggleConnection(selectedMember); }}
                                        className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                                            selectedMember.agent_connected
                                                ? 'bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100'
                                                : 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100'
                                        }`}
                                    >
                                        {selectedMember.agent_connected ? (
                                            <><Icons.Unplug size={15} /> Disconnect Agent</>
                                        ) : (
                                            <><Icons.Plug size={15} /> Connect Agent</>
                                        )}
                                    </button>
                                </div>
                            ) : (
                                <div className="text-center py-4">
                                    <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                                        <Icons.Bot size={18} className="text-zinc-400" />
                                    </div>
                                    <p className="text-xs text-zinc-400 mb-2">Not configured as an agent</p>
                                    <button
                                        onClick={() => { setAgentForm({ is_agent: true, agent_type: 'ai-assistant', agent_description: '', agent_connected: false }); setAgentEditing(true); }}
                                        className="text-xs text-violet-500 hover:text-violet-600 font-medium"
                                    >
                                        Set up as Agent
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Tasks */}
                        <div className="p-5">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1.5">
                                <Icons.Target size={13} />
                                Assigned Tasks
                            </h3>
                            {tasksLoading ? (
                                <div className="text-center py-8 text-zinc-400">
                                    <Icons.Loader size={20} className="animate-spin mx-auto mb-2" />
                                    <p className="text-xs">Loading tasks...</p>
                                </div>
                            ) : memberTasks.length > 0 ? (
                                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                    {memberTasks.map((task) => (
                                        <div
                                            key={task.id}
                                            className={`p-3 rounded-xl border transition-all ${
                                                task.completed
                                                    ? 'bg-zinc-50/50 dark:bg-zinc-800/20 border-zinc-100 dark:border-zinc-800/40 opacity-50'
                                                    : 'bg-white dark:bg-zinc-800/30 border-zinc-200/50 dark:border-zinc-700/30'
                                            }`}
                                        >
                                            <div className="flex items-start gap-2.5">
                                                <div className={`w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                                                    task.completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-zinc-300 dark:border-zinc-600'
                                                }`}>
                                                    {task.completed && <Icons.Check size={10} />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-sm ${task.completed ? 'line-through text-zinc-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
                                                        {task.title}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        {task.due_date && (
                                                            <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                                                                <Icons.Calendar size={9} />
                                                                {new Date(task.due_date).toLocaleDateString()}
                                                            </span>
                                                        )}
                                                        {task.priority && (
                                                            <span className={`text-[10px] font-bold uppercase ${
                                                                task.priority === 'high' ? 'text-rose-500' :
                                                                task.priority === 'medium' ? 'text-amber-500' : 'text-zinc-400'
                                                            }`}>
                                                                {task.priority}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8">
                                    <Icons.Check size={20} className="mx-auto mb-2 text-zinc-300 dark:text-zinc-600" />
                                    <p className="text-xs text-zinc-400">No tasks assigned</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </SlidePanel>
        </div>
    );
};
