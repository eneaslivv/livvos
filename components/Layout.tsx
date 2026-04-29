import React, { useState, useEffect } from 'react';
import { Icons } from './ui/Icons';
import { SlidePanel } from './ui/SlidePanel';
import { PageView, AppMode, Priority, NavParams } from '../types';
import { TopNavbar } from './TopNavbar';
import { CommandPalette } from './CommandPalette';
import { useRBAC } from '../context/RBACContext';
import { ConfigurationModal } from './config/ConfigurationModal';
import { useSupabase } from '../hooks/useSupabase';
import { generateTaskFromAI } from '../lib/ai';
import { useTeam } from '../context/TeamContext';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from '../context/TenantContext';
import { supabase } from '../lib/supabase';
import { AiAdvisor } from './AiAdvisor';
import { BottomTabBar } from './ui/BottomTabBar';
import { useIsMobile } from '../hooks/useMediaQuery';
import { ClientsSidebarTree } from './layout/ClientsSidebarTree';
import { TenantSwitcher } from './layout/TenantSwitcher';

interface LayoutProps {
  children: React.ReactNode;
  currentPage: PageView;
  currentMode: AppMode;
  navParams?: NavParams | null;
  onNavigate: (page: PageView, params?: NavParams) => void;
  onSwitchMode: (mode: AppMode) => void;
}

// Define color themes for each navigation item
// Compact, single-palette nav style — every item shares the same neutral
// hover/active treatment so the sidebar reads as a quiet list, not a
// rainbow of pills.
const NAV_BASE = 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-zinc-100';
const NAV_ACTIVE = 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-900 dark:text-zinc-50 font-medium';

const NavItem: React.FC<{
  id: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  expanded: boolean;
  onClick: () => void
}> = ({ id: _id, icon, label, active, expanded, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`
        relative flex items-center w-[calc(100%-16px)] mx-2 px-2.5 py-1.5 rounded-md transition-colors duration-150 group/item shrink-0
        ${active ? NAV_ACTIVE : NAV_BASE}
      `}
      title={!expanded ? label : undefined}
    >
      <div className="flex items-center justify-center w-[18px] h-[18px] shrink-0">
        {React.cloneElement(icon as React.ReactElement<any>, {
          size: 17,
          strokeWidth: 2,
        })}
      </div>

      <span className={`
        ml-2.5 text-[13px] whitespace-nowrap overflow-hidden transition-all duration-300
        ${expanded ? 'opacity-100 translate-x-0 w-auto' : 'opacity-0 -translate-x-2 w-0'}
      `}>
        {label}
      </span>

      {/* Tooltip for collapsed state */}
      {!expanded && (
        <div className="absolute left-full ml-3 px-2 py-1 bg-zinc-900 dark:bg-zinc-800 text-white dark:text-zinc-100 text-[11px] font-medium rounded-md opacity-0 -translate-x-2 group-hover/item:opacity-100 group-hover/item:translate-x-0 transition-all pointer-events-none whitespace-nowrap z-50 shadow-lg">
          {label}
          <div className="absolute top-1/2 -left-1 -mt-1 border-4 border-transparent border-r-zinc-900 dark:border-r-zinc-800"></div>
        </div>
      )}
    </button>
  );
};

// --- GLOBAL TASK MODAL ---
const PRIORITY_CONFIG = {
  [Priority.Low]: { label: 'Low', color: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800', dot: 'bg-emerald-500' },
  [Priority.Medium]: { label: 'Medium', color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800', dot: 'bg-amber-500' },
  [Priority.High]: { label: 'High', color: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800', dot: 'bg-red-500' },
};

const CreateTaskModal = ({
  isOpen,
  onClose,
  onAdd,
  projects
}: {
  isOpen: boolean,
  onClose: () => void,
  onAdd: (task: any) => Promise<void> | void,
  projects: { id: string; title: string; client_id?: string }[]
}) => {
  const { user } = useAuth();
  const { members: teamMembers } = useTeam();
  const [mode, setMode] = useState<'quick' | 'detailed' | 'ai'>('quick');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tag, setTag] = useState('');
  const [priority, setPriority] = useState<Priority>(Priority.Medium);
  const [status, setStatus] = useState<'todo' | 'in-progress'>('todo');
  const [aiInput, setAiInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [clientId, setClientId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiResult, setAiResult] = useState<{ title: string; priority?: Priority; tag?: string } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const toPriority = (value?: string) => {
    if (!value) return Priority.Medium;
    const normalized = value.toLowerCase();
    if (normalized === 'high' || normalized === 'urgent') return Priority.High;
    if (normalized === 'low') return Priority.Low;
    return Priority.Medium;
  };

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setDescription('');
      setTag('');
      setPriority(Priority.Medium);
      setStatus('todo');
      setAiInput('');
      setMode('quick');
      setProjectId('');
      setClientId('');
      setAssigneeId('');
      setDueDate('');
      setAiResult(null);
      setAiError(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if ((mode !== 'ai' && !title.trim()) || (mode === 'ai' && !aiInput.trim())) return;
    if (isSubmitting) return;

    setIsSubmitting(true);
    let finalTitle = title;
    let finalTag = tag || 'General';
    let finalPriority = priority;

    if (mode === 'ai') {
      if (aiResult?.title) {
        finalTitle = aiResult.title;
        finalTag = aiResult.tag || 'AI Task';
        finalPriority = aiResult.priority || Priority.Medium;
      } else {
        finalTitle = aiInput;
        finalTag = 'AI Task';
        finalPriority = Priority.Medium;
      }
    }

    try {
      await onAdd({
        title: finalTitle,
        description: description || undefined,
        completed: false,
        priority: finalPriority,
        project_id: projectId || undefined,
        client_id: clientId || undefined,
        assignee_id: assigneeId || undefined,
        due_date: dueDate || undefined,
        group_name: finalTag !== 'General' ? finalTag : undefined,
        status,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAiGenerate = () => {
    if (!aiInput.trim()) return;
    setIsThinking(true);
    setAiError(null);
    generateTaskFromAI(aiInput)
      .then((result) => {
        setAiResult({
          title: result.title,
          priority: toPriority(result.priority),
          tag: result.tag || 'AI Task',
        });
        setTitle(result.title);
        setPriority(toPriority(result.priority));
        if (result.tag) setTag(result.tag);
        setMode('detailed');
      })
      .catch((err) => {
        setAiError(err?.message || 'Error de IA');
      })
      .finally(() => setIsThinking(false));
  };

  const canSubmit = mode === 'ai' ? aiInput.trim().length > 0 : title.trim().length > 0;

  const footer = mode !== 'ai' ? (
    <div className="flex justify-between items-center">
      <span className="text-xs text-zinc-400"><b>Enter</b> to create</span>
      <div className="flex gap-2">
        <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors rounded-lg">
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || isSubmitting}
          className="px-5 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-40 flex items-center gap-2"
        >
          {isSubmitting ? <Icons.Clock size={14} className="animate-spin" /> : <Icons.Plus size={14} />}
          Create task
        </button>
      </div>
    </div>
  ) : undefined;

  const activeMembers = teamMembers.filter(m => m.status === 'active');

  return (
    <SlidePanel isOpen={isOpen} onClose={onClose} title="New task" subtitle="Create and assign tasks to the team" width="md" footer={footer}>
      {/* Mode Tabs */}
      <div className="flex border-b border-zinc-100 dark:border-zinc-800">
        {[
          { id: 'quick', label: 'Quick', icon: <Icons.Zap size={14} /> },
          { id: 'detailed', label: 'Detailed', icon: <Icons.List size={14} /> },
          { id: 'ai', label: 'IA', icon: <Icons.Sparkles size={14} /> },
        ].map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id as any)}
            className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${mode === m.id
              ? 'text-zinc-900 dark:text-zinc-100 border-b-2 border-zinc-900 dark:border-zinc-100'
              : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
              }`}
          >
            {m.icon} {m.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="p-5 space-y-5">
        {mode === 'ai' ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">Describe the task in natural language</label>
              <textarea
                autoFocus
                value={aiInput}
                onChange={e => setAiInput(e.target.value)}
                placeholder="E.g.: 'Remind me to call Sofia tomorrow about the UI kit, it's urgent'"
                className="w-full h-28 p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl resize-none outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 dark:focus:border-violet-600 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiGenerate(); } }}
              />
            </div>
            {aiError && (
              <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{aiError}</div>
            )}
            <button
              onClick={handleAiGenerate}
              disabled={isThinking || !aiInput.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-50"
            >
              {isThinking ? <Icons.Clock size={16} className="animate-spin" /> : <Icons.Sparkles size={16} />}
              {isThinking ? 'Processing...' : 'Generate task with AI'}
            </button>
          </div>
        ) : (
          <>
            {/* Title */}
            <div>
              <input
                autoFocus
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="What needs to be done?"
                className="w-full px-0 py-2 bg-transparent border-0 border-b-2 border-zinc-200 dark:border-zinc-700 outline-none focus:border-zinc-900 dark:focus:border-zinc-100 text-lg font-semibold text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-300 dark:placeholder:text-zinc-600 transition-colors"
                onKeyDown={e => { if (e.key === 'Enter' && mode === 'quick') handleSubmit(); }}
              />
            </div>

            {/* Priority */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">Priority</label>
              <div className="flex gap-2">
                {([Priority.Low, Priority.Medium, Priority.High] as const).map(p => {
                  const config = PRIORITY_CONFIG[p];
                  return (
                    <button
                      key={p}
                      onClick={() => setPriority(p)}
                      className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all flex items-center justify-center gap-1.5 ${
                        priority === p ? config.color : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full ${priority === p ? config.dot : 'bg-zinc-300 dark:bg-zinc-600'}`} />
                      {config.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Assignee - always visible */}
            {activeMembers.length > 0 && (
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">Assign to</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setAssigneeId('')}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                      !assigneeId
                        ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100 font-semibold'
                        : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300'
                    }`}
                  >
                    Unassigned
                  </button>
                  {activeMembers.map(member => (
                    <button
                      key={member.id}
                      onClick={() => setAssigneeId(member.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all ${
                        assigneeId === member.id
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700 font-semibold'
                          : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300'
                      }`}
                    >
                      {member.avatar_url ? (
                        <img src={member.avatar_url} alt="" className="w-4 h-4 rounded-full" />
                      ) : (
                        <div className="w-4 h-4 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-[8px] font-bold">
                          {(member.name || member.email)?.[0]?.toUpperCase()}
                        </div>
                      )}
                      {member.id === user?.id ? 'Me' : (member.name || member.email?.split('@')[0])}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick mode: date + project row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">Deadline</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg outline-none focus:border-zinc-400 text-sm text-zinc-900 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">Project</label>
                <select
                  value={projectId}
                  onChange={e => {
                    const pid = e.target.value;
                    setProjectId(pid);
                    const proj = projects.find(p => p.id === pid);
                    if (proj?.client_id) setClientId(proj.client_id);
                    else if (!pid) setClientId('');
                  }}
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg outline-none focus:border-zinc-400 text-sm text-zinc-900 dark:text-zinc-100"
                >
                  <option value="">No project</option>
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>{project.title}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Detailed mode extras */}
            {mode === 'detailed' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">Status</label>
                    <div className="flex gap-2">
                      {([{ id: 'todo', label: 'To do' }, { id: 'in-progress', label: 'In progress' }] as const).map(s => (
                        <button
                          key={s.id}
                          onClick={() => setStatus(s.id)}
                          className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-all ${
                            status === s.id
                              ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100'
                              : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">Category</label>
                    <input
                      type="text"
                      value={tag}
                      onChange={e => setTag(e.target.value)}
                      placeholder="E.g.: Design"
                      className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg outline-none focus:border-zinc-400 text-sm text-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">Description</label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Add details or context..."
                    className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none focus:border-zinc-400 text-sm text-zinc-900 dark:text-zinc-100 resize-none placeholder:text-zinc-400"
                    rows={3}
                  />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </SlidePanel>
  );
};

export const Layout: React.FC<LayoutProps> = ({ children, currentPage, currentMode, navParams, onNavigate, onSwitchMode }) => {
  const { hasPermission, isInitialized } = useRBAC();
  const { hasFeature } = useTenant();
  const isMobile = useIsMobile();
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  // Global Task Modal State
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const { add: addTask } = useSupabase<any>('tasks', { enabled: false, subscribe: false });
  const { data: taskProjects } = useSupabase<{ id: string; title: string; client_id?: string }>('projects', {
    enabled: isTaskModalOpen,
    subscribe: false,
    select: 'id,title,client_id'
  });

  // Persistent Sidebar State
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(() => {
    const saved = localStorage.getItem('sidebarExpanded');
    return saved === 'true'; // Default to false if not set
  });

  useEffect(() => {
    localStorage.setItem('sidebarExpanded', String(isSidebarExpanded));
  }, [isSidebarExpanded]);

  // Check if user is platform admin
  useEffect(() => {
    supabase.rpc('is_platform_admin').then(({ data }) => {
      if (data === true) setIsPlatformAdmin(true);
    });
  }, []);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    } else {
      setIsDarkMode(false);
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    if (isDarkMode) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      setIsDarkMode(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setIsDarkMode(true);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
      }
      if (e.key === 'Escape') {
        setShowCommandPalette(false);
      }

      // Quick mode switch: 1 = OS, 2 = Sales (only when not typing)
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable;
      if (!isEditable && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === '1' && currentMode !== 'os') {
          e.preventDefault();
          onSwitchMode('os');
        } else if (e.key === '2' && currentMode !== 'sales' && hasFeature('sales_module')) {
          e.preventDefault();
          onSwitchMode('sales');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentMode, onSwitchMode]);

  // Mock Global Add Task Handler - In a real app this would use Context/Redux
  const handleGlobalAddTask = async (task: any) => {
    try {
      await addTask(task);
    } catch (err: any) {
      alert('Could not create task: ' + (err?.message || 'Error'));
    }
  };

  const osNavItems: { id: PageView; label: string; icon: React.ReactNode; permission?: { module: any, action: any }; feature?: keyof import('../context/TenantContext').TenantConfig['features'] }[] = [
    { id: 'home', label: 'Home', icon: <Icons.Home /> },
    // 'projects' and 'team_clients' entries removed — projects live inside the Clients tree; team mgmt moved to tenant settings.
    { id: 'calendar', label: 'Calendar', icon: <Icons.Calendar />, permission: { module: 'calendar', action: 'view' }, feature: 'calendar_integration' },
    { id: 'activity', label: 'Activity', icon: <Icons.Activity />, permission: { module: 'activity', action: 'view' } },
    { id: 'docs', label: 'Docs', icon: <Icons.Docs />, permission: { module: 'documents', action: 'view' }, feature: 'documents_module' },
  ];
  const clientsActive = currentPage === 'clients' || currentPage === 'projects';
  const showProjectsModule = hasFeature('projects_module') && (!isInitialized || hasPermission('projects', 'view'));

  const salesNavItems: { id: PageView; label: string; icon: React.ReactNode; permission?: { module: any, action: any }; feature?: keyof import('../context/TenantContext').TenantConfig['features'] }[] = [
    { id: 'sales_dashboard', label: 'Sales Overview', icon: <Icons.Chart />, permission: { module: 'sales', action: 'view_dashboard' }, feature: 'sales_module' },
    { id: 'sales_leads', label: 'Leads Inbox', icon: <Icons.Mail />, permission: { module: 'sales', action: 'view_leads' }, feature: 'sales_module' },
    { id: 'finance', label: 'Financial Center', icon: <Icons.DollarSign />, permission: { module: 'finance', action: 'view' }, feature: 'finance_module' },
    { id: 'sales_analytics', label: 'Analytics', icon: <Icons.Activity />, permission: { module: 'sales', action: 'view_analytics' }, feature: 'sales_module' },
  ];

  const currentNavItems = (currentMode === 'os' ? osNavItems : salesNavItems).filter(item => {
    if (item.feature && !hasFeature(item.feature)) return false;
    if (!item.permission) return true;
    if (!isInitialized) return true;
    return hasPermission(item.permission.module, item.permission.action);
  });

  const navSkeletonCount = currentMode === 'os' ? 6 : 4;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 font-sans selection:bg-stone-200 selection:text-stone-900 flex overflow-hidden relative transition-colors duration-300">

      {/* Global Task Modal */}
      <CreateTaskModal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onAdd={handleGlobalAddTask}
        projects={taskProjects}
      />

      {/*
         SIDEBAR — hidden on mobile, bottom tab bar used instead
      */}
      <aside className={`
        hidden md:flex
        fixed z-50 h-[calc(100vh-24px)] top-3 bottom-3 left-3
        bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800
        shadow-lg shadow-zinc-200/40 dark:shadow-black/60
        rounded-2xl flex-col items-center py-4 gap-1
        transition-all duration-300 ease-[cubic-bezier(0.25,0.8,0.25,1)]
        ${isSidebarExpanded ? 'md:w-[228px]' : 'md:w-[64px]'}
      `}>

        {/* Tenant Switcher (replaces tenant logo — opens dropdown of workspaces + connected agencies) */}
        <TenantSwitcher expanded={isSidebarExpanded} isDarkMode={isDarkMode} />

        {/* Workspace Switcher */}
        {hasFeature('sales_module') && <div className="relative w-[calc(100%-24px)] mx-3 mb-2 shrink-0">
          <button
            onClick={() => onSwitchMode(currentMode === 'os' ? 'sales' : 'os')}
            className={`w-full flex items-center p-1.5 rounded-full bg-zinc-100 dark:bg-zinc-950 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all cursor-pointer border border-zinc-200 dark:border-zinc-800 relative overflow-hidden group/switch ${isSidebarExpanded ? 'justify-start' : 'justify-center'}`}
            title={currentMode === 'os' ? "Switch to Sales (2)" : "Switch to OS (1)"}
          >
            {/* Visual Indicator Background */}
            <div className={`absolute top-0 bottom-0 w-1/2 bg-white dark:bg-zinc-800 rounded-full shadow-sm transition-all duration-300 ${currentMode === 'os' ? 'left-0' : 'left-1/2'}`}></div>

            <div className="relative z-10 flex items-center justify-center w-8 h-8 rounded-full transition-colors text-zinc-500 dark:text-zinc-400">
              <Icons.Home size={16} className={currentMode === 'os' ? 'text-zinc-900 dark:text-zinc-100' : ''} />
              <span className="absolute -bottom-0.5 text-[8px] font-bold text-zinc-400 dark:text-zinc-500 opacity-0 group-hover/switch:opacity-100 transition-opacity">1</span>
            </div>
            <div className="relative z-10 flex items-center justify-center w-8 h-8 rounded-full transition-colors text-zinc-500 dark:text-zinc-400">
              <Icons.Chart size={16} className={currentMode === 'sales' ? 'text-zinc-900 dark:text-zinc-100' : ''} />
              <span className="absolute -bottom-0.5 text-[8px] font-bold text-zinc-400 dark:text-zinc-500 opacity-0 group-hover/switch:opacity-100 transition-opacity">2</span>
            </div>

            <div className={`transition-opacity duration-300 absolute left-20 whitespace-nowrap pl-2 flex flex-col items-start ${isSidebarExpanded ? 'opacity-100' : 'opacity-0'}`}>
              <div className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                {currentMode === 'os' ? 'System' : 'Sales'}
              </div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Switch View</div>
            </div>
          </button>
        </div>}

        {/* Navigation Items */}
        <nav className="flex-1 w-full flex flex-col gap-1 overflow-y-auto overscroll-contain sidebar-thin-scroll mt-2 items-center">
          {!isInitialized && (
            <div className="w-full flex flex-col gap-1 px-2 animate-pulse">
              {Array.from({ length: navSkeletonCount }).map((_, index) => (
                <div
                  key={index}
                  className={`h-7 rounded-md bg-zinc-100 dark:bg-zinc-800/60 ${isSidebarExpanded ? 'w-full' : 'w-9 mx-auto'}`}
                />
              ))}
              <div className={`h-7 rounded-md bg-zinc-100 dark:bg-zinc-800/60 mt-2 ${isSidebarExpanded ? 'w-full' : 'w-9 mx-auto'}`} />
            </div>
          )}
          {isInitialized && currentNavItems.map(item => (
            <NavItem
              key={item.id}
              id={item.id}
              icon={item.icon}
              label={item.label}
              active={currentPage === item.id}
              expanded={isSidebarExpanded}
              onClick={() => onNavigate(item.id)}
            />
          ))}

          {/* Clients tree pinned at the bottom of the nav (Notion-style) */}
          {isInitialized && currentMode === 'os' && showProjectsModule && (
            <div className="w-full mt-auto pt-3">
              <ClientsSidebarTree
                active={clientsActive}
                expanded={isSidebarExpanded}
                currentPage={currentPage}
                currentClientId={navParams?.clientId}
                currentProjectId={navParams?.projectId}
                onNavigate={onNavigate}
              />
            </div>
          )}
        </nav>

        {/* Bottom Actions */}
        <div className="w-full flex flex-col gap-1 shrink-0 mt-2 items-center">
          {isPlatformAdmin && (
            <NavItem
              id="platform_admin"
              icon={<Icons.Shield />}
              label="Platform"
              active={currentPage === 'platform_admin'}
              expanded={isSidebarExpanded}
              onClick={() => {
                onNavigate('platform_admin');

              }}
            />
          )}
          <button
            onClick={toggleTheme}
            className="relative flex items-center w-[calc(100%-16px)] mx-2 px-2.5 py-1.5 rounded-md text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors group/btn shrink-0"
            title={!isSidebarExpanded ? "Toggle Theme" : undefined}
          >
            <div className="flex items-center justify-center w-[18px] h-[18px] shrink-0">
              {isDarkMode ? <Icons.Sun size={17} strokeWidth={2} /> : <Icons.Moon size={17} strokeWidth={2} />}
            </div>
            <span className={`ml-2.5 text-[13px] whitespace-nowrap transition-all duration-300 ${isSidebarExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'}`}>Theme</span>
          </button>

          {/* Sidebar Toggle Button */}
          <button
            onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
            className="hidden md:flex items-center justify-center w-full py-2 mt-1 text-zinc-300 hover:text-zinc-600 dark:text-zinc-700 dark:hover:text-zinc-400 transition-colors"
            title={isSidebarExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
          >
            {isSidebarExpanded ? <Icons.ChevronLeft size={14} /> : <Icons.ChevronRight size={14} />}
          </button>
        </div>

      </aside>

      {/* Main Content Area */}
      <main
        className={`
            flex-1 h-screen overflow-y-auto relative scroll-smooth bg-zinc-50 dark:bg-black
            transition-all duration-500 ease-[cubic-bezier(0.25,0.8,0.25,1)]
            pb-20 md:pb-0
            ${isSidebarExpanded ? 'md:ml-[244px]' : 'md:ml-[80px]'}
        `}
      >
        {/* Fixed Top Navbar */}
        <div className="sticky top-0 z-40 px-3 md:px-6 pt-3 pb-1.5 w-full max-w-[1440px] mx-auto">
          <TopNavbar
            pageTitle={currentPage}
            currentPage={currentPage}
            navParams={navParams}
            onOpenSearch={() => setShowCommandPalette(true)}
            onNavigate={onNavigate}
            onOpenNewTask={() => setIsTaskModalOpen(true)}
          />
        </div>

        <div className="px-3 md:px-6 pb-8 pt-1 w-full max-w-[1440px] mx-auto min-h-full fade-in">
          {children}
        </div>
      </main>

      {/* Command Palette */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        onNavigate={onNavigate}
        onSwitchMode={onSwitchMode}
        currentMode={currentMode}
      />
      <ConfigurationModal isOpen={isConfigOpen} onClose={() => setIsConfigOpen(false)} onNavigate={onNavigate} />
      <AiAdvisor />

      {/* Mobile Bottom Tab Bar */}
      {isMobile && (
        <BottomTabBar
          currentPage={currentPage}
          onNavigate={onNavigate}
          isDarkMode={isDarkMode}
          onToggleTheme={toggleTheme}
        />
      )}
    </div>
  );
};
