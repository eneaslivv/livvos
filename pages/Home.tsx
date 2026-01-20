
import React, { useState, useEffect } from 'react';
import { Icons } from '../components/ui/Icons';
import { Status, PageView, Priority, Task } from '../types';
import { useSupabase } from '../hooks/useSupabase';
import { supabase } from '../lib/supabase';
import { useRBAC } from '../context/RBACContext';

// --- REAL DATA ---
type DbProject = {
    id: string
    title: string
    description?: string
    progress?: number
    status?: Status
    client?: string
    next_steps?: string
}

// Updated Focus Modes to Earth/Warm Tones
const FOCUS_MODES = [
    { label: 'Deep Work', icon: <Icons.Zap size={14} />, color: 'text-stone-700 bg-stone-100 border-stone-200' },
    { label: 'Meeting Mode', icon: <Icons.Users size={14} />, color: 'text-orange-800 bg-orange-50 border-orange-100' },
    { label: 'Light Work', icon: <Icons.Smile size={14} />, color: 'text-emerald-800 bg-emerald-50 border-emerald-100' },
];

interface HomeProps {
    onNavigate: (page: PageView) => void;
}

export const Home: React.FC<HomeProps> = ({ onNavigate }) => {
    // State
    const { user, roles, hasPermission } = useRBAC();
    const userName = user?.name || 'there';
    const userRole = roles[0]?.name || 'Guest';

    const { data: tasks, update: updateTask } = useSupabase<Task>('tasks');
    const { data: projectsRaw } = useSupabase<DbProject>('projects');
    const projects = projectsRaw.slice(0, 4).map(p => ({
        id: p.id,
        title: p.title,
        client: p.client ?? '',
        progress: typeof p.progress === 'number' ? p.progress : 0,
        status: (p.status ?? Status.Active) as Status,
        nextSteps: p.next_steps ?? ''
    }));
    // const [userName, setUserName] = useState<string>('there'); // REMOVED
    // const [ideaInput, setIdeaInput] = useState(''); // REMOVED
    // const [ideaSaved, setIdeaSaved] = useState(false); // REMOVED
    const [currentFocusMode, setCurrentFocusMode] = useState(0);
    const [greeting, setGreeting] = useState('');

    // Effects
    useEffect(() => {
        const hour = new Date().getHours();
        if (hour < 12) setGreeting('Good morning');
        else if (hour < 18) setGreeting('Good afternoon');
        else setGreeting('Good evening');
    }, []);

    // Removed manual user fetching, using useRBAC instead

    // Handlers
    const toggleTask = (id: string) => {
        const t = tasks.find(t => t.id === id)
        if (!t) return
        updateTask(id, { completed: !t.completed })
    };

    // const saveIdea = ... // REMOVED

    const handleQuickAction = (label: string) => {
        switch (label) {
            // Note: "New Task" is now handled via the global navbar, but we keep this as a secondary trigger if needed,
            // though for this prototype we are just removing the local modal logic.
            case 'New Task': alert("Please use the 'New Task' button in the top navigation."); break;
            case 'Schedule Meeting': onNavigate('calendar'); break;
            case 'Create Document': onNavigate('docs'); break;
            case 'Email Client': onNavigate('sales_leads'); break;
            default: break;
        }
    };

    // Derived State
    const completedCount = tasks.filter(t => t.completed).length;
    const progressPercent = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;

    const getStatusColor = (status: Status) => {
        switch (status) {
            case Status.Active: return 'bg-emerald-500';
            case Status.Pending: return 'bg-orange-400';
            case Status.Review: return 'bg-stone-500';
            default: return 'bg-zinc-300';
        }
    };

    const getPriorityColor = (p?: Priority) => {
        switch (p) {
            case Priority.High: return 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-900';
            case Priority.Medium: return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900';
            default: return 'bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700';
        }
    };

    return (
        <div className="space-y-8 pb-10 max-w-[1600px] mx-auto relative pt-4">

            {/* --- HEADER --- */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 mb-1 font-medium">
                        <span className="w-1 h-1 rounded-full bg-zinc-400 dark:bg-zinc-600"></span>
                        <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                    </div>
                    <h2 className="text-4xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">{greeting}, {userName}.</h2>
                </div>

                {/* Focus Mode Toggle */}
                <button
                    onClick={() => setCurrentFocusMode((prev) => (prev + 1) % FOCUS_MODES.length)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all shadow-sm hover:shadow-md ${FOCUS_MODES[currentFocusMode].color} bg-opacity-70 dark:bg-opacity-20`}
                >
                    {FOCUS_MODES[currentFocusMode].icon}
                    <span className="text-sm font-semibold">{FOCUS_MODES[currentFocusMode].label}</span>
                    <Icons.ChevronRight size={14} className="opacity-50" />
                </button>
            </div>

            {/* --- ASYMMETRIC GRID LAYOUT (Main vs Side) --- */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">

                {/* --- LEFT COLUMN (WORK STREAM) - 8 COLS --- */}
                <div className="xl:col-span-8 space-y-8">

                    {/* 1. Main Priority Card */}
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-6 opacity-[0.05] pointer-events-none group-hover:opacity-[0.08] transition-opacity">
                            <Icons.Target size={120} className="text-zinc-900 dark:text-zinc-100" />
                        </div>

                        <div className="flex justify-between items-end mb-6 relative z-10">
                            <div>
                                <div className="flex items-center gap-3">
                                    <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                                        <Icons.Check size={20} className="text-emerald-500 dark:text-emerald-400" /> Today's Focus
                                    </h3>
                                </div>
                                <p className="text-sm text-zinc-500">Keep focus on what moves the needle.</p>
                            </div>
                            <div className="text-right">
                                <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">{completedCount}/{tasks.length}</span>
                                <div className="w-24 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full mt-1 overflow-hidden">
                                    <div className="h-full bg-zinc-800 dark:bg-zinc-200 transition-all duration-500" style={{ width: `${progressPercent}%` }}></div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-1 relative z-10">
                            {tasks.length === 0 && (
                                <div className="text-xs text-zinc-500">No hay tareas aún</div>
                            )}
                            {tasks.map((task) => (
                                <div
                                    key={task.id}
                                    onClick={() => toggleTask(task.id)}
                                    className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer group/item ${task.completed
                                        ? 'bg-zinc-50 dark:bg-zinc-900/50 border-transparent opacity-60'
                                        : 'bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-zinc-50/50 hover:shadow-sm'
                                        }`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${task.completed ? 'bg-zinc-500 border-zinc-500 text-white' : 'border-zinc-300 dark:border-zinc-600 text-transparent'
                                            }`}>
                                            <Icons.Check size={12} strokeWidth={4} />
                                        </div>
                                        <div>
                                            <div className={`text-sm font-medium transition-all ${task.completed ? 'text-zinc-500 line-through' : 'text-zinc-900 dark:text-zinc-100'}`}>
                                                {task.title}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {task.priority && !task.completed && (
                                            <div className={`w-2 h-2 rounded-full ${task.priority === Priority.High ? 'bg-rose-500' : task.priority === Priority.Medium ? 'bg-amber-500' : 'bg-zinc-300'}`}></div>
                                        )}
                                        <span className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded border ${getPriorityColor(task.priority)}`}>
                                            {task.priority ?? 'low'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Micro Tasks Integrated */}
                        <div className="mt-8 pt-6 border-t border-zinc-100 dark:border-zinc-800 relative z-10">
                            <div className="flex items-center gap-2 mb-3">
                                <Icons.List size={14} className="text-zinc-400" />
                                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Quick Hits</span>
                            </div>
                            <div className="text-xs text-zinc-500">Sin items rápidos aún</div>
                        </div>
                    </div>

                    {/* 2. Active Projects Grid */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                                <Icons.Briefcase size={20} className="text-zinc-400" /> Active Projects
                            </h3>
                            <button
                                onClick={() => onNavigate('projects')}
                                className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 px-3 py-1 rounded-full transition-colors"
                            >
                                View All Projects
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {projects.length === 0 && (
                                <div className="text-xs text-zinc-500">No hay proyectos activos</div>
                            )}
                            {projects.map(project => (
                                <div
                                    key={project.id}
                                    onClick={() => onNavigate('projects')}
                                    className="group bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between h-full"
                                >
                                    <div>
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-lg bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-600 dark:text-zinc-400 border border-zinc-100 dark:border-zinc-700">
                                                    {project.client?.substring(0, 2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-tight">{project.title}</h4>
                                                    <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wide">{project.client}</span>
                                                </div>
                                            </div>
                                            <div className={`w-2 h-2 rounded-full ${getStatusColor(project.status)}`}></div>
                                        </div>

                                        <div className="space-y-2 mb-4">
                                            <div className="flex justify-between items-center text-xs text-zinc-500">
                                                <span>Progress</span>
                                                <span className="font-mono">{project.progress}%</span>
                                            </div>
                                            <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                                                <div className="bg-zinc-800 dark:bg-zinc-200 h-full rounded-full" style={{ width: `${project.progress}%` }}></div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-zinc-50 dark:border-zinc-800/50 flex items-center justify-between">
                                        <span className="text-[10px] text-zinc-400 flex items-center gap-1.5 bg-zinc-50 dark:bg-zinc-800 px-2 py-1 rounded">
                                            <Icons.Activity size={10} /> {project.nextSteps}
                                        </span>
                                        <div className="flex -space-x-2">
                                            <div className="w-6 h-6 rounded-full border-2 border-white dark:border-zinc-900 bg-zinc-200 dark:bg-zinc-700"></div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>


                </div>

                {/* --- RIGHT COLUMN (CONTEXT & TOOLS) - 4 COLS - STICKY --- */}
                <div className="xl:col-span-4 space-y-6 sticky top-24">

                    {/* KPI Grid */}
                    <div className="grid grid-cols-2 gap-4">
                        <div
                            onClick={() => onNavigate('activity')}
                            className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between h-32 group hover:border-amber-200 dark:hover:border-amber-800/30 transition-colors cursor-pointer"
                        >
                            <div className="p-2 w-fit rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-500">
                                <Icons.Zap size={18} />
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">8.5hrs</div>
                                <div className="text-xs text-zinc-500">Productive Time</div>
                            </div>
                        </div>
                        <div
                            onClick={() => onNavigate('calendar')}
                            className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between h-32 group hover:border-emerald-200 dark:hover:border-emerald-800/30 transition-colors cursor-pointer"
                        >
                            <div className="p-2 w-fit rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-500">
                                <Icons.Check size={18} />
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">12</div>
                                <div className="text-xs text-zinc-500">Tasks Done</div>
                            </div>
                        </div>
                    </div>

                    {/* Quick Actions Menu */}
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900 flex justify-between items-center">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Quick Access</h3>
                            <Icons.Command size={12} className="text-zinc-400" />
                        </div>
                        <div className="p-2">
                            {[
                                { icon: <Icons.Plus className="text-emerald-500" />, label: 'New Task', bg: 'hover:bg-emerald-50 dark:hover:bg-emerald-500/10 hover:text-emerald-700' },
                                { icon: <Icons.Calendar className="text-orange-500" />, label: 'Schedule Meeting', bg: 'hover:bg-orange-50 dark:hover:bg-orange-500/10 hover:text-orange-700' },
                                { icon: <Icons.Docs className="text-blue-500" />, label: 'Create Document', bg: 'hover:bg-blue-50 dark:hover:bg-blue-500/10 hover:text-blue-700' },
                                { icon: <Icons.Mail className="text-purple-500" />, label: 'Email Client', bg: 'hover:bg-purple-50 dark:hover:bg-purple-500/10 hover:text-purple-700' }
                            ].map((action, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleQuickAction(action.label)}
                                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-zinc-700 dark:text-zinc-300 transition-colors ${action.bg}`}
                                >
                                    {React.cloneElement(action.icon as React.ReactElement, { size: 16 })}
                                    {action.label}
                                    <Icons.ChevronRight size={14} className="ml-auto text-zinc-300 opacity-50" />
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Account summary (Dynamic) */}
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-sm">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
                                <Icons.Users size={14} /> Account
                            </h3>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                                        {userName.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-zinc-900 bg-emerald-500"></div>
                                </div>
                                <div>
                                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 leading-none">{userName}</div>
                                    <div className="text-[10px] text-zinc-500 mt-1 capitalize">{userRole}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* AI Insight Pill */}
                    <div className="p-5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl text-zinc-900 dark:text-zinc-100 shadow-sm cursor-pointer hover:border-zinc-300 dark:hover:border-zinc-500 transition-colors" onClick={() => onNavigate('activity')}>
                        <div className="flex items-start gap-3">
                            <div className="p-1.5 bg-white dark:bg-zinc-900 rounded-md border border-zinc-200 dark:border-zinc-600 shadow-sm">
                                <Icons.Sparkles className="shrink-0 text-amber-600 dark:text-amber-500" size={14} />
                            </div>
                            <div>
                                <h4 className="text-sm font-bold mb-1.5 flex items-center gap-2">
                                    Weekly Insight
                                </h4>
                                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                                    You're 20% faster on Design tasks than last week. Consider moving "E-commerce API" to tomorrow morning.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};
