import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../components/ui/Icons';
import { SlidePanel } from '../components/ui/SlidePanel';
import { Status, PageView, Priority, Task } from '../types';
import { useSupabase } from '../hooks/useSupabase';
import { supabaseAdmin } from '../lib/supabase';
import { useRBAC } from '../context/RBACContext';
import { useFinance } from '../context/FinanceContext';
import { useTenant } from '../context/TenantContext';
import { useCalendar } from '../hooks/useCalendar';
import type { CalendarEvent, CalendarTask } from '../hooks/useCalendar';

type DbProject = {
    id: string
    title: string
    description?: string
    progress?: number
    status?: Status
    client?: string
    next_steps?: string
}

const FOCUS_MODES = [
    { label: 'Deep Work', icon: <Icons.Zap size={13} /> },
    { label: 'Meetings', icon: <Icons.Users size={13} /> },
    { label: 'Light Work', icon: <Icons.Smile size={13} /> },
];

interface HomeProps {
    onNavigate: (page: PageView) => void;
}

export const Home: React.FC<HomeProps> = ({ onNavigate }) => {
    const { user, roles } = useRBAC();
    const { incomes, expenses } = useFinance();
    const { currentTenant, updateTenant } = useTenant();
    const { events: calendarEvents, tasks: calendarTasks } = useCalendar();
    const [showFinancials, setShowFinancials] = useState(false);
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);
    const [isUploadingBanner, setIsUploadingBanner] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    const monthlyEarnings = incomes.reduce((acc, inc) => {
        const paidThisMonth = (inc.installments || [])
            .filter(inst => inst.status === 'paid' && inst.paid_date)
            .reduce((sum, inst) => {
                const pDate = new Date(inst.paid_date + 'T12:00:00');
                if (pDate.getMonth() === currentMonth && pDate.getFullYear() === currentYear) return sum + inst.amount;
                return sum;
            }, 0);
        return acc + paidThisMonth;
    }, 0);

    const monthlyExpenses = expenses.reduce((acc, exp) => {
        if (exp.status === 'paid' && exp.date) {
            const expDate = new Date(exp.date + 'T12:00:00');
            if (expDate.getMonth() === currentMonth && expDate.getFullYear() === currentYear) return acc + exp.amount;
        }
        return acc;
    }, 0);

    const monthlyProfit = monthlyEarnings - monthlyExpenses;
    const userName = user?.name || 'there';
    const userRole = roles[0]?.name || 'Guest';

    const { data: tasks, update: updateTask } = useSupabase<Task>('tasks', { subscribe: false });
    const { data: projectsRaw } = useSupabase<DbProject>('projects', { subscribe: false });

    const projects = projectsRaw.slice(0, 4).map(p => ({
        id: p.id,
        title: p.title,
        client: p.client ?? '',
        progress: typeof p.progress === 'number' ? p.progress : 0,
        status: (p.status ?? Status.Active) as Status,
        nextSteps: p.next_steps ?? ''
    }));

    const projectLookup = projectsRaw.reduce<Record<string, string>>((acc, project) => {
        acc[project.id] = project.title || 'Project';
        return acc;
    }, {});

    const [currentFocusMode, setCurrentFocusMode] = useState(0);
    const [greeting, setGreeting] = useState('');
    const [isVisionOpen, setIsVisionOpen] = useState(false);
    const [isThoughtsOpen, setIsThoughtsOpen] = useState(false);

    const { data: visionData, add: addVision, update: updateVision } = useSupabase('user_vision', { subscribe: false });
    const userVision = visionData[0]?.content || '';
    const [visionContent, setVisionContent] = useState(userVision);

    const { data: thoughtsData, add: addThoughts, update: updateThoughts } = useSupabase('user_thoughts', { subscribe: false });
    const userThoughts = thoughtsData[0]?.content || '';
    const [thoughtsContent, setThoughtsContent] = useState(userThoughts);

    useEffect(() => { setVisionContent(userVision); }, [userVision]);
    useEffect(() => { setThoughtsContent(userThoughts); }, [userThoughts]);

    const handleSaveVision = async () => {
        if (visionData.length > 0) await updateVision(visionData[0].id, { content: visionContent });
        else await addVision({ content: visionContent });
        setIsVisionOpen(false);
    };

    const handleSaveThoughts = async () => {
        if (thoughtsData.length > 0) await updateThoughts(thoughtsData[0].id, { content: thoughtsContent });
        else await addThoughts({ content: thoughtsContent });
        setIsThoughtsOpen(false);
    };

    useEffect(() => {
        const hour = new Date().getHours();
        if (hour < 12) setGreeting('Good morning');
        else if (hour < 18) setGreeting('Good afternoon');
        else setGreeting('Good evening');
    }, []);

    const toggleTask = (id: string) => {
        const t = tasks.find(t => t.id === id);
        if (!t) return;
        updateTask(id, { completed: !t.completed });
    };

    // Quick task creation
    const { add: addTask } = useSupabase<Task>('tasks', { subscribe: false });
    const [quickTaskTitle, setQuickTaskTitle] = useState('');
    const [isAddingTask, setIsAddingTask] = useState(false);
    const [showCompleted, setShowCompleted] = useState(false);
    const quickInputRef = useRef<HTMLInputElement>(null);

    const handleQuickAddTask = async () => {
        const title = quickTaskTitle.trim();
        if (!title || isAddingTask) return;
        setIsAddingTask(true);
        try {
            await addTask({ title, completed: false, priority: Priority.Medium } as any);
            setQuickTaskTitle('');
            setTimeout(() => quickInputRef.current?.focus(), 50);
        } catch (err) {
            console.error('Quick add task error:', err);
        } finally {
            setIsAddingTask(false);
        }
    };

    // Filter: today's tasks = incomplete (carry over) + completed today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayTasks = tasks.filter(t => {
        if (!t.completed) return true; // all pending tasks always show
        // completed tasks: only show if updated today (completed today)
        const updated = (t as any).updated_at;
        if (!updated) return true; // if no timestamp, show it
        return new Date(updated) >= todayStart;
    });

    // ─── Calendar: today's events + overdue tasks ───
    const todayStr = new Date().toISOString().split('T')[0];
    const todayEvents = calendarEvents
        .filter(e => e.start_date === todayStr)
        .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

    const todayCalendarTasks = calendarTasks
        .filter(t => t.start_date === todayStr && !t.completed)
        .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

    const overdueTasks = calendarTasks
        .filter(t => t.start_date && t.start_date < todayStr && !t.completed)
        .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));

    // Merge today's agenda: events + calendar tasks, sorted by time
    const todayAgenda: { type: 'event' | 'task'; item: CalendarEvent | CalendarTask; time: string }[] = [
        ...todayEvents.map(e => ({ type: 'event' as const, item: e, time: e.start_time || '99:99' })),
        ...todayCalendarTasks.map(t => ({ type: 'task' as const, item: t, time: t.start_time || '99:99' })),
    ].sort((a, b) => a.time.localeCompare(b.time));

    const handleQuickAction = (label: string) => {
        switch (label) {
            case 'New Task': alert("Please use the 'New Task' button in the top navigation."); break;
            case 'Schedule': onNavigate('calendar'); break;
            case 'Docs': onNavigate('docs'); break;
            case 'CRM': onNavigate('sales_leads'); break;
        }
    };

    const completedCount = todayTasks.filter(t => t.completed).length;
    const pendingCount = todayTasks.filter(t => !t.completed).length;
    const progressPercent = todayTasks.length ? Math.round((completedCount / todayTasks.length) * 100) : 0;

    const aiInsights = React.useMemo(() => {
        const badges: { label: string; color: string }[] = [];
        const tips: string[] = [];

        const pendingIncome = incomes.reduce((sum, inc) =>
            sum + (inc.installments || []).filter(i => i.status !== 'paid').reduce((s, i) => s + i.amount, 0), 0);
        if (pendingIncome > 0) {
            badges.push({ label: 'Pending payments', color: 'text-amber-600 dark:text-amber-400' });
            tips.push(`You have $${pendingIncome.toLocaleString()} in pending payments. Prioritize payment follow-ups.`);
        }
        if (monthlyProfit > 0) {
            badges.push({ label: 'Positive month', color: 'text-emerald-600 dark:text-emerald-400' });
        } else if (monthlyExpenses > monthlyEarnings && monthlyExpenses > 0) {
            badges.push({ label: 'Expenses > Income', color: 'text-rose-600 dark:text-rose-400' });
            tips.push('Expenses exceed income this month. Review subscriptions and recurring expenses.');
        }

        const pendingTasks = tasks.filter(t => !t.completed);
        const highPriority = pendingTasks.filter(t => t.priority === Priority.High);
        if (highPriority.length > 0) {
            badges.push({ label: `${highPriority.length} urgent`, color: 'text-rose-600 dark:text-rose-400' });
            tips.push(`You have ${highPriority.length} high priority task${highPriority.length > 1 ? 's' : ''}. Focus there first.`);
        } else if (pendingTasks.length > 0 && progressPercent < 50) {
            badges.push({ label: 'Advance tasks', color: 'text-blue-600 dark:text-blue-400' });
            tips.push(`You completed ${progressPercent}% of your tasks. Dedicate a deep work block to advance.`);
        }

        if (userVision) {
            const visionShort = userVision.length > 60 ? userVision.substring(0, 60) + '…' : userVision;
            badges.push({ label: 'Active goal', color: 'text-violet-600 dark:text-violet-400' });
            if (tips.length === 0) tips.push(`Remember your vision: "${visionShort}"`);
        }
        if (userThoughts && tips.length < 2) {
            tips.push('Review your recent thoughts and turn ideas into concrete actions.');
        }

        if (badges.length === 0) badges.push({ label: 'All good', color: 'text-zinc-500' });
        if (tips.length === 0) tips.push('No alerts for now. Continue with your current workflow.');

        return { badges: badges.slice(0, 3), tip: tips[0] };
    }, [tasks, incomes, monthlyProfit, monthlyEarnings, monthlyExpenses, progressPercent, userVision, userThoughts]);

    const getStatusColor = (status: Status) => {
        switch (status) {
            case Status.Active: return 'bg-emerald-500';
            case Status.Pending: return 'bg-amber-400';
            case Status.Review: return 'bg-zinc-500';
            default: return 'bg-zinc-300';
        }
    };

    return (
        <div className="space-y-6 pb-10 max-w-[1600px] mx-auto relative pt-6">

            {/* Banner */}
            <div className="w-full h-40 md:h-48 rounded-2xl overflow-hidden relative group border border-zinc-200/60 dark:border-zinc-800">
                <img
                    src={currentTenant?.banner_url || "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&q=80&w=2000"}
                    alt=""
                    className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
                <label className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-all cursor-pointer">
                    <span className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/90 dark:bg-zinc-900/90 text-xs font-medium text-zinc-700 dark:text-zinc-300 opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all">
                        {isUploadingBanner ? <div className="w-3 h-3 border-2 border-zinc-400 border-t-zinc-900 rounded-full animate-spin" /> : <Icons.Upload size={12} />}
                        {isUploadingBanner ? 'Uploading...' : 'Change banner'}
                    </span>
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={isUploadingBanner}
                        onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file || !currentTenant) return;
                            if (file.size > 5 * 1024 * 1024) { setUploadError('Max 5MB'); setTimeout(() => setUploadError(null), 4000); e.target.value = ''; return; }
                            setIsUploadingBanner(true); setUploadError(null);
                            try {
                                const ext = file.name.split('.').pop();
                                const path = `banners/${currentTenant.id}.${ext}`;
                                console.log('[Banner] uploading to', path, 'tenant:', currentTenant.id);
                                const { error: rmErr } = await supabaseAdmin.storage.from('documents').remove([path]);
                                if (rmErr) console.warn('[Banner] remove error (non-fatal):', rmErr.message);
                                const { error: upErr } = await supabaseAdmin.storage.from('documents').upload(path, file, { upsert: true });
                                if (upErr) { console.error('[Banner] upload error:', upErr); throw upErr; }
                                const { data: urlData } = supabaseAdmin.storage.from('documents').getPublicUrl(path);
                                console.log('[Banner] public URL:', urlData.publicUrl);
                                await updateTenant({ banner_url: `${urlData.publicUrl}?v=${Date.now()}` });
                                console.log('[Banner] tenant updated OK');
                            } catch (err: any) {
                                console.error('[Banner] full error:', err);
                                setUploadError(err?.message || 'Error al subir imagen');
                                setTimeout(() => setUploadError(null), 6000);
                            } finally { setIsUploadingBanner(false); e.target.value = ''; }
                        }}
                    />
                </label>
                {uploadError && (
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-red-50/95 border border-red-200 text-xs font-medium text-red-700">
                        {uploadError}
                    </div>
                )}
            </div>

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                    <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-0.5">
                        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    </p>
                    <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">{greeting}, {userName}.</h2>
                </div>

                <div className="flex items-center gap-1.5">
                    <button
                        onClick={() => setIsThoughtsOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[11px] font-semibold hover:opacity-90 transition-opacity"
                    >
                        <Icons.Brain size={12} /> Thoughts
                    </button>
                    <button
                        onClick={() => setIsVisionOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 text-[11px] font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                        <Icons.Lightbulb size={12} /> Vision
                    </button>
                    <button
                        onClick={() => setCurrentFocusMode((prev) => (prev + 1) % FOCUS_MODES.length)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 text-[11px] font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                        {FOCUS_MODES[currentFocusMode].icon}
                        {FOCUS_MODES[currentFocusMode].label}
                        <Icons.ChevronRight size={11} className="opacity-30" />
                    </button>
                </div>
            </div>

            {/* Vision Panel */}
            <SlidePanel isOpen={isVisionOpen} onClose={() => setIsVisionOpen(false)} title="Your Vision" description="Your goals and direction."
                footer={<div className="flex justify-end gap-3 w-full">
                    <button onClick={() => setIsVisionOpen(false)} className="px-4 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">Cancel</button>
                    <button onClick={handleSaveVision} className="px-5 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity">Save</button>
                </div>}
            >
                <div className="space-y-4">
                    <p className="text-xs text-zinc-400 leading-relaxed">Define your main goals and the direction you want to take. Keep it in mind to focus your daily actions.</p>
                    <textarea value={visionContent} onChange={(e) => setVisionContent(e.target.value)} placeholder="Write your goals..." className="w-full h-[500px] p-5 bg-zinc-50/50 dark:bg-zinc-800/30 border border-zinc-100 dark:border-zinc-800 rounded-xl focus:outline-none focus:border-zinc-300 dark:focus:border-zinc-600 transition-colors resize-none text-zinc-800 dark:text-zinc-200 text-sm leading-relaxed placeholder:text-zinc-400" />
                </div>
            </SlidePanel>

            {/* Thoughts Panel */}
            <SlidePanel isOpen={isThoughtsOpen} onClose={() => setIsThoughtsOpen(false)} title="Thoughts" description="System metacognition."
                footer={<div className="flex justify-end gap-3 w-full">
                    <button onClick={() => setIsThoughtsOpen(false)} className="px-4 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">Cancel</button>
                    <button onClick={handleSaveThoughts} className="px-5 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity">Save</button>
                </div>}
            >
                <div className="space-y-4">
                    <p className="text-xs text-zinc-400 leading-relaxed">Log bugs, customization ideas, or how you want the AI to help you.</p>
                    <textarea value={thoughtsContent} onChange={(e) => setThoughtsContent(e.target.value)} placeholder="Ideas, bugs, improvements..." className="w-full h-[500px] p-5 bg-transparent border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600 transition-colors resize-none text-zinc-800 dark:text-zinc-200 text-sm leading-relaxed font-mono placeholder:text-zinc-400" />
                </div>
            </SlidePanel>

            {/* Main Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">

                {/* Left Column */}
                <div className="xl:col-span-8 space-y-6">

                    {/* Today's Focus */}
                    {(() => {
                        const todayPending = todayTasks.filter(t => !t.completed);
                        const todayCompleted = todayTasks.filter(t => t.completed);
                        const allDone = todayTasks.length > 0 && todayPending.length === 0;

                        return (
                            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 p-5">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Today's Focus</h3>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-zinc-400 font-mono">{completedCount}/{todayTasks.length}</span>
                                        <div className="w-20 h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full transition-all duration-500 ${allDone ? 'bg-emerald-500' : 'bg-zinc-900 dark:bg-zinc-200'}`} style={{ width: `${progressPercent}%` }} />
                                        </div>
                                    </div>
                                </div>

                                {/* Quick add task input */}
                                <form
                                    onSubmit={(e) => { e.preventDefault(); handleQuickAddTask(); }}
                                    className="flex items-center gap-2 mb-3"
                                >
                                    <div className="flex-1 flex items-center gap-2.5 px-3 py-2 rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 focus-within:border-zinc-300 dark:focus-within:border-zinc-600 transition-colors">
                                        <Icons.Plus size={13} className="text-zinc-400 shrink-0" />
                                        <input
                                            ref={quickInputRef}
                                            type="text"
                                            value={quickTaskTitle}
                                            onChange={(e) => setQuickTaskTitle(e.target.value)}
                                            placeholder="Add a quick task..."
                                            className="flex-1 bg-transparent text-[13px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none"
                                        />
                                    </div>
                                    {quickTaskTitle.trim() && (
                                        <button
                                            type="submit"
                                            disabled={isAddingTask}
                                            className="px-3 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[11px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
                                        >
                                            {isAddingTask ? '...' : 'Add'}
                                        </button>
                                    )}
                                </form>

                                {todayTasks.length === 0 && <p className="text-xs text-zinc-400 py-4 text-center">No tasks yet — add one above</p>}

                                {allDone && todayTasks.length > 0 && (
                                    <div className="flex items-center gap-2.5 px-3 py-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-500/5 mb-1">
                                        <Icons.Check size={14} className="text-emerald-500 shrink-0" />
                                        <span className="text-[13px] font-medium text-emerald-700 dark:text-emerald-400">All set for today</span>
                                    </div>
                                )}

                                {/* Pending tasks */}
                                <div className="space-y-0.5">
                                    {todayPending.map((task) => {
                                        const projectId = (task as any).projectId || (task as any).project_id;
                                        return (
                                            <div
                                                key={task.id}
                                                onClick={() => toggleTask(task.id)}
                                                className="flex items-center justify-between px-3 py-2.5 rounded-lg transition-all cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 group"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-4 h-4 rounded-full border-[1.5px] border-zinc-300 dark:border-zinc-600 group-hover:border-emerald-400 dark:group-hover:border-emerald-500 text-transparent group-hover:text-emerald-400 flex items-center justify-center shrink-0 transition-colors">
                                                        <Icons.Check size={9} strokeWidth={3} />
                                                    </div>
                                                    <div>
                                                        <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{task.title}</span>
                                                        {projectId && <span className="text-[10px] text-zinc-400 ml-2">{projectLookup[projectId] || ''}</span>}
                                                    </div>
                                                </div>
                                                {task.priority && (
                                                    <span className={`text-[9px] font-semibold uppercase tracking-wider ${task.priority === Priority.High ? 'text-rose-500' : task.priority === Priority.Medium ? 'text-amber-500' : 'text-zinc-400'}`}>
                                                        {task.priority}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Completed tasks — collapsible dropdown */}
                                {todayCompleted.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                                        <button
                                            onClick={() => setShowCompleted(!showCompleted)}
                                            className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                                        >
                                            <div className="flex items-center gap-2">
                                                <Icons.Check size={12} className="text-emerald-500" />
                                                <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                                                    {todayCompleted.length} completed today
                                                </span>
                                            </div>
                                            <motion.div
                                                animate={{ rotate: showCompleted ? 180 : 0 }}
                                                transition={{ duration: 0.2 }}
                                            >
                                                <Icons.ChevronDown size={13} className="text-zinc-400" />
                                            </motion.div>
                                        </button>
                                        <AnimatePresence>
                                            {showCompleted && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="space-y-0.5 pt-1">
                                                        {todayCompleted.map((task) => {
                                                            const projectId = (task as any).projectId || (task as any).project_id;
                                                            return (
                                                                <div
                                                                    key={task.id}
                                                                    onClick={() => toggleTask(task.id)}
                                                                    className="flex items-center justify-between px-3 py-2 rounded-lg transition-all cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 group"
                                                                >
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="w-4 h-4 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                                                                            <Icons.Check size={9} strokeWidth={3} className="text-emerald-500" />
                                                                        </div>
                                                                        <div>
                                                                            <span className="text-[13px] font-medium text-zinc-400 dark:text-zinc-500 line-through decoration-zinc-300 dark:decoration-zinc-700">{task.title}</span>
                                                                            {projectId && <span className="text-[10px] text-zinc-300 dark:text-zinc-600 ml-2">{projectLookup[projectId] || ''}</span>}
                                                                        </div>
                                                                    </div>
                                                                    <span className="text-[9px] text-zinc-300 dark:text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity">undo</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {/* Today's Agenda — calendar events + tasks for today */}
                    {(todayAgenda.length > 0 || overdueTasks.length > 0) && (
                        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 p-5">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Icons.Calendar size={14} className="text-blue-500" />
                                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Today's Agenda</h3>
                                    {todayAgenda.length > 0 && (
                                        <span className="text-[10px] font-medium text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-md">
                                            {todayAgenda.length}
                                        </span>
                                    )}
                                </div>
                                <button onClick={() => onNavigate('calendar')} className="text-[11px] font-medium text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">
                                    Ver calendario
                                </button>
                            </div>

                            {/* Overdue tasks */}
                            {overdueTasks.length > 0 && (
                                <div className="mb-3">
                                    <div className="flex items-center gap-1.5 mb-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                        <span className="text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider">
                                            {overdueTasks.length} atrasada{overdueTasks.length > 1 ? 's' : ''}
                                        </span>
                                    </div>
                                    <div className="space-y-0.5">
                                        {overdueTasks.slice(0, 5).map((task) => {
                                            const daysOverdue = Math.floor((new Date(todayStr).getTime() - new Date(task.start_date!).getTime()) / (1000 * 60 * 60 * 24));
                                            return (
                                                <div
                                                    key={task.id}
                                                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-red-50/50 dark:bg-red-500/5 border border-red-100 dark:border-red-500/10 group cursor-pointer hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                                                    onClick={() => onNavigate('calendar')}
                                                >
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <div className="w-4 h-4 rounded-full border-[1.5px] border-red-300 dark:border-red-500/40 flex items-center justify-center shrink-0">
                                                            <Icons.AlertTriangle size={8} className="text-red-500" />
                                                        </div>
                                                        <span className="text-[12px] font-medium text-zinc-800 dark:text-zinc-200 truncate">{task.title}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <span className="text-[10px] text-red-500 dark:text-red-400 font-medium">
                                                            {daysOverdue === 1 ? 'ayer' : `hace ${daysOverdue}d`}
                                                        </span>
                                                        {task.priority && (
                                                            <span className={`w-1.5 h-1.5 rounded-full ${
                                                                task.priority === 'urgent' ? 'bg-red-500' : task.priority === 'high' ? 'bg-amber-500' : task.priority === 'medium' ? 'bg-blue-500' : 'bg-emerald-500'
                                                            }`} />
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {overdueTasks.length > 5 && (
                                            <p className="text-[10px] text-red-400 px-3 pt-1">+{overdueTasks.length - 5} más</p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Today's timeline */}
                            {todayAgenda.length > 0 ? (
                                <div className="space-y-0.5">
                                    {todayAgenda.map((entry) => {
                                        const isEvent = entry.type === 'event';
                                        const item = entry.item;
                                        const timeLabel = entry.time !== '99:99' ? entry.time.slice(0, 5) : '';
                                        const duration = (item as any).duration;
                                        const eventType = isEvent ? (item as CalendarEvent).type : null;

                                        const typeColors: Record<string, string> = {
                                            'meeting': 'bg-blue-500',
                                            'call': 'bg-emerald-500',
                                            'deadline': 'bg-red-500',
                                            'work-block': 'bg-purple-500',
                                            'note': 'bg-amber-500',
                                            'content': 'bg-pink-500',
                                        };

                                        return (
                                            <div
                                                key={item.id}
                                                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer group"
                                                onClick={() => onNavigate('calendar')}
                                            >
                                                {/* Time column */}
                                                <div className="w-10 shrink-0 text-right">
                                                    {timeLabel ? (
                                                        <span className="text-[11px] font-mono font-medium text-zinc-500 dark:text-zinc-400">{timeLabel}</span>
                                                    ) : (
                                                        <span className="text-[10px] text-zinc-300 dark:text-zinc-600">--:--</span>
                                                    )}
                                                </div>

                                                {/* Color indicator */}
                                                <div className={`w-1 h-8 rounded-full shrink-0 ${
                                                    isEvent ? (typeColors[eventType || ''] || 'bg-blue-500') : 'bg-zinc-400'
                                                }`} />

                                                {/* Content */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                        {!isEvent && <Icons.Check size={10} className="text-zinc-400 shrink-0" />}
                                                        <span className="text-[12px] font-medium text-zinc-800 dark:text-zinc-200 truncate">
                                                            {item.title}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        {isEvent && eventType && (
                                                            <span className="text-[9px] font-medium text-zinc-400 capitalize">{eventType === 'work-block' ? 'bloque' : eventType}</span>
                                                        )}
                                                        {duration && (
                                                            <span className="text-[9px] text-zinc-400">{duration >= 60 ? `${Math.floor(duration / 60)}h${duration % 60 ? duration % 60 + 'm' : ''}` : `${duration}m`}</span>
                                                        )}
                                                        {(item as CalendarEvent).location && (
                                                            <span className="text-[9px] text-zinc-400 truncate">{(item as CalendarEvent).location}</span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Priority dot for tasks */}
                                                {!isEvent && (item as CalendarTask).priority && (
                                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                                        (item as CalendarTask).priority === 'urgent' ? 'bg-red-500' : (item as CalendarTask).priority === 'high' ? 'bg-amber-500' : (item as CalendarTask).priority === 'medium' ? 'bg-blue-500' : 'bg-emerald-500'
                                                    }`} />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : overdueTasks.length === 0 ? (
                                <p className="text-xs text-zinc-400 py-3 text-center">Sin eventos ni tareas para hoy</p>
                            ) : null}
                        </div>
                    )}

                    {/* Active Projects */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Active Projects</h3>
                            <button onClick={() => onNavigate('projects')} className="text-[11px] font-medium text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">
                                View All
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {projects.map(project => (
                                <div key={project.id} onClick={() => onNavigate('projects')} className="group bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/80 dark:border-zinc-800 p-4 hover:border-zinc-300 dark:hover:border-zinc-600 transition-all cursor-pointer">
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-500 dark:text-zinc-400">
                                                {project.client?.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div>
                                                <h4 className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">{project.title}</h4>
                                                <span className="text-[10px] text-zinc-400">{project.client}</span>
                                            </div>
                                        </div>
                                        <div className={`w-1.5 h-1.5 rounded-full mt-1.5 ${getStatusColor(project.status)}`} />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 bg-zinc-100 dark:bg-zinc-800 h-1 rounded-full overflow-hidden">
                                            <div className="bg-zinc-800 dark:bg-zinc-200 h-full rounded-full transition-all" style={{ width: `${project.progress}%` }} />
                                        </div>
                                        <span className="text-[10px] text-zinc-400 font-mono w-7 text-right">{project.progress}%</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Column */}
                <div className="xl:col-span-4 space-y-4 sticky top-24">

                    {/* Metrics Row */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white dark:bg-zinc-900 p-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800">
                            <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 mb-2">Tasks</div>
                            <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 leading-none">{tasks.length}</div>
                            <div className="text-[10px] text-zinc-400 mt-0.5">total</div>
                        </div>
                        <div className="bg-white dark:bg-zinc-900 p-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800">
                            <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 mb-2">Done</div>
                            <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 leading-none">{completedCount}</div>
                            <div className="text-[10px] text-emerald-500 mt-0.5">{progressPercent}% complete</div>
                        </div>
                    </div>

                    {/* Profit */}
                    <div className="bg-zinc-900 dark:bg-zinc-100 px-4 py-3.5 rounded-xl relative overflow-hidden">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Monthly Profit</span>
                            <button onClick={() => setShowFinancials(!showFinancials)} className="text-zinc-500 hover:text-zinc-300 dark:hover:text-zinc-600 transition-colors">
                                {showFinancials ? <Icons.EyeOff size={13} /> : <Icons.Eye size={13} />}
                            </button>
                        </div>
                        <div className="text-xl font-bold text-white dark:text-zinc-900 tracking-tight leading-none mb-1.5">
                            {showFinancials ? `$${monthlyProfit.toLocaleString()}` : '•••••'}
                        </div>
                        <div className="flex items-center gap-3 text-[10px]">
                            <span className="text-emerald-400 dark:text-emerald-600 font-medium">+${showFinancials ? monthlyEarnings.toLocaleString() : '••'}</span>
                            <span className="text-rose-400 dark:text-rose-500 font-medium">-${showFinancials ? monthlyExpenses.toLocaleString() : '••'}</span>
                        </div>
                        <button onClick={() => onNavigate('finance' as PageView)} className="mt-2 text-[10px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-300 dark:hover:text-zinc-600 transition-colors font-medium">
                            View finances →
                        </button>
                    </div>

                    {/* AI Insights */}
                    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/80 dark:border-zinc-800 p-4">
                        <div className="flex items-center gap-1.5 mb-2.5">
                            <Icons.Sparkles size={11} className="text-zinc-400" />
                            <span className="text-[9px] font-semibold uppercase tracking-widest text-zinc-400">Insights</span>
                        </div>
                        <div className="flex flex-wrap gap-1 mb-2">
                            {aiInsights.badges.map((badge, i) => (
                                <span key={i} className={`text-[10px] font-semibold ${badge.color}`}>
                                    {badge.label}{i < aiInsights.badges.length - 1 && <span className="text-zinc-300 dark:text-zinc-700 mx-1">·</span>}
                                </span>
                            ))}
                        </div>
                        <p className="text-[12px] text-zinc-500 dark:text-zinc-400 leading-relaxed">{aiInsights.tip}</p>
                    </div>

                    {/* Quick Actions */}
                    <div className="grid grid-cols-4 gap-2">
                        {[
                            { icon: <Icons.Plus size={15} />, label: 'New Task', key: 'New Task' },
                            { icon: <Icons.Calendar size={15} />, label: 'Calendar', key: 'Schedule' },
                            { icon: <Icons.Docs size={15} />, label: 'Docs', key: 'Docs' },
                            { icon: <Icons.Mail size={15} />, label: 'CRM', key: 'CRM' },
                        ].map((a) => (
                            <button key={a.key} onClick={() => handleQuickAction(a.key)}
                                className="flex flex-col items-center gap-1.5 py-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:border-zinc-300 dark:hover:border-zinc-600 transition-all">
                                {a.icon}
                                <span className="text-[9px] font-medium">{a.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Account */}
                    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-zinc-100 dark:border-zinc-800/50">
                        <div className="relative group">
                            {currentTenant?.logo_url ? (
                                <img src={currentTenant.logo_url} alt="" className="w-8 h-8 rounded-full object-cover border border-zinc-200 dark:border-zinc-700" />
                            ) : (
                                <div className="w-8 h-8 rounded-full bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center text-white dark:text-zinc-900 text-xs font-bold">
                                    {userName.charAt(0).toUpperCase()}
                                </div>
                            )}
                            <label className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                                <Icons.Upload size={10} className="text-white" />
                                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={isUploadingLogo}
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file || !currentTenant) return;
                                        if (file.size > 2 * 1024 * 1024) { setUploadError('Max 2MB'); setTimeout(() => setUploadError(null), 4000); e.target.value = ''; return; }
                                        setIsUploadingLogo(true); setUploadError(null);
                                        try {
                                            const ext = file.name.split('.').pop();
                                            const path = `logos/${currentTenant.id}.${ext}`;
                                            await supabaseAdmin.storage.from('documents').remove([path]);
                                            const { error: upErr } = await supabaseAdmin.storage.from('documents').upload(path, file, { upsert: true });
                                            if (upErr) throw upErr;
                                            const { data: urlData } = supabaseAdmin.storage.from('documents').getPublicUrl(path);
                                            await updateTenant({ logo_url: `${urlData.publicUrl}?v=${Date.now()}` });
                                        } catch (err: any) {
                                            setUploadError(err?.message || 'Error'); setTimeout(() => setUploadError(null), 4000);
                                        } finally { setIsUploadingLogo(false); e.target.value = ''; }
                                    }}
                                />
                            </label>
                        </div>
                        <div className="min-w-0">
                            <div className="text-[12px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">{userName}</div>
                            <div className="text-[10px] text-zinc-400 truncate">{userRole}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
