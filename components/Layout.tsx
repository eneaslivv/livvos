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
  const { hasFeature, isViewingAsTenant, currentTenant } = useTenant();
  // Effective platform-admin gate. We hide the Master surfaces unless
  // the platform admin is currently in their HOME tenant (the LIVV
  // super-agency). Two ways to detect "not at home":
  //   1. is_super_agency=false on the active tenant — covers every way
  //      of changing tenants (TenantSwitcher dropdown, deep links,
  //      direct membership in a partner). This is the durable check.
  //   2. isViewingAsTenant — only true when they used Master →
  //      "Switch to tenant" via platform_switch_to_tenant. Kept as a
  //      safety belt for legacy code paths that pre-date is_super_agency.
  // If either condition fires, Master is hidden. Coming back to the
  // super-agency tenant restores it.
  const isMobile = useIsMobile();
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  // Tab to open the ConfigurationModal on. The Team page (and anything
  // else) can dispatch a 'open-configuration' window event with detail
  // { tab: 'roles' | 'users' | ... } to deep-link into a section.
  const [configInitialTab, setConfigInitialTab] = useState<'general' | 'services' | 'billing' | 'users' | 'content' | 'roles' | 'email' | 'ai' | undefined>(undefined);

  useEffect(() => {
    const handler = (e: Event) => {
      const tab = (e as CustomEvent).detail?.tab as typeof configInitialTab;
      setConfigInitialTab(tab);
      setIsConfigOpen(true);
    };
    window.addEventListener('open-configuration', handler);
    return () => window.removeEventListener('open-configuration', handler);
  }, []);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  // Effective gate for Master mode UI (switch + nav + Platform fallback
  // button). Master only makes sense from inside a super-agency tenant
  // (the platform's home). When the user is in a partner agency or any
  // non-super-agency tenant — even one where they happen to be a
  // member — Master is hidden. They have to switch back to their LIVV
  // tenant to access platform-level surfaces.
  const isInSuperAgency = currentTenant?.is_super_agency === true;
  const canUseMasterMode = isPlatformAdmin && isInSuperAgency && !isViewingAsTenant;

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

  // Safety net: only kick the user out of Sales mode if the tenant has
  // BOTH sales_module AND finance_module disabled. Sales mode is now
  // valid when either is on (the segment hides the sales-only items
  // and just shows Financial Center).
  useEffect(() => {
    if (currentMode === 'sales' && !hasFeature('sales_module') && !hasFeature('finance_module')) {
      onSwitchMode('os');
    }
  }, [currentMode, hasFeature, onSwitchMode]);

  // Auto-flip out of Master when the platform admin lands in a non-
  // super-agency tenant — either via "Switch to tenant" from Master →
  // Customers, or by picking a partner from the TenantSwitcher dropdown,
  // or because they're already a member of multiple tenants and chose
  // a non-LIVV one. Sitting on Master while inside a partner mixes
  // contexts; OS is the safe default.
  useEffect(() => {
    if (currentMode === 'master' && (isViewingAsTenant || (currentTenant && !currentTenant.is_super_agency))) {
      onSwitchMode('os');
    }
  }, [currentMode, isViewingAsTenant, currentTenant?.id, currentTenant?.is_super_agency, onSwitchMode]);

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

      // Quick mode switch: 1 = OS, 2 = Sales, 3 = Master (only when not typing)
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable;
      if (!isEditable && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === '1' && currentMode !== 'os') {
          e.preventDefault();
          onSwitchMode('os');
        } else if (e.key === '2' && currentMode !== 'sales' && hasFeature('sales_module')) {
          e.preventDefault();
          onSwitchMode('sales');
        } else if (e.key === '3' && currentMode !== 'master' && canUseMasterMode) {
          e.preventDefault();
          onSwitchMode('master');
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

  // OS sidebar grouped by purpose: dashboard items first, then content/work
  // surfaces, then the clients tree (rendered separately). Reordered per the
  // user's request — Home/Activity together, then Calendar/Docs.
  type NavItemDef = {
    id: PageView;
    label: string;
    icon: React.ReactNode;
    permission?: { module: any, action: any };
    feature?: keyof import('../context/TenantContext').TenantConfig['features'];
    activeIds?: PageView[];
  };
  const osNavGroups: NavItemDef[][] = [
    [
      { id: 'home', label: 'Home', icon: <Icons.Home /> },
      // Brief — chat-with-AI + structured tasks/calendar panel on the side
      { id: 'brief', label: 'Brief', icon: <Icons.Sparkles /> },
      // Studio Activity moved to the central studio-mark in the TopNavbar
      // (the logo circle) — it's the studio's "home base" button now.
    ],
    [
      { id: 'calendar', label: 'Calendar', icon: <Icons.Calendar />, permission: { module: 'calendar', action: 'view' }, feature: 'calendar_integration' },
      { id: 'docs', label: 'Docs', icon: <Icons.Docs />, permission: { module: 'documents', action: 'view' }, feature: 'documents_module' },
    ],
  ];
  // NOTE: Strategy / Content / Scaling / Growth / Toolkit / Agent USED to live
  // in the OS sidebar's "Growth engine" group, but per Eneas the user spec
  // these are revenue/business-growth surfaces that belong next to Sales
  // Pipeline + Finance. They were moved to the Sales mode sidebar (below).
  // OS mode now stays clean as the daily-work surface (Home/Brief/Activity/
  // Calendar/Docs + Clients tree).
  // Inbox (Communications Hub — unified Gmail + Slack + leads inbox) was
  // previously in OS mode. Moved into Sales mode so it lives next to
  // Leads Inbox + Finance, which is where the user actually does
  // pipeline work. Frees up the OS sidebar for "doing the work" items.
  // Flat list — kept around because some downstream code still reads it
  // (filter for permissions). We'll regroup at render time.
  const osNavItems: NavItemDef[] = osNavGroups.flat();
  const clientsActive = currentPage === 'clients' || currentPage === 'projects';
  const showProjectsModule = hasFeature('projects_module') && (!isInitialized || hasPermission('projects', 'view'));

  // Sales sidebar reorganizada en grupos lógicos para reducir cognitive
  // load — antes era 12 items en lista plana, ahora 3 grupos visuales:
  //
  //   Run     — operativa diaria de venta (4 items, top)
  //   Insights — medir resultados (2 items)
  //   Build    — construir el sistema que escala (5 items)
  //
  //   Agent queda separado al final con un divider más grueso porque es
  //   un "asistente transversal" que no compite con ningún módulo.
  //
  // Cada grupo tiene un micro-label uppercase que se muestra sólo cuando
  // el sidebar está expandido. Cuando colapsado, sólo se ven los dividers.
  type SalesNavGroupDef = { label: string; items: NavItemDef[] };
  const salesNavGroups: SalesNavGroupDef[] = [
    {
      label: 'Run',
      items: [
        { id: 'sales_dashboard', label: 'Sales', icon: <Icons.Chart />, permission: { module: 'sales', action: 'view_dashboard' }, feature: 'sales_module', activeIds: ['sales_dashboard', 'sales_pipeline', 'sales_leads', 'sales_analytics'] },
        { id: 'brief',           label: 'Brief',          icon: <Icons.Sparkles />, activeIds: ['brief', 'communications'] },
        { id: 'finance',         label: 'Finance',        icon: <Icons.DollarSign />, permission: { module: 'finance', action: 'view' }, feature: 'finance_module' },
      ],
    },
    {
      // Build se redujo de 5 items (Strategy/Content/Products/Toolkit/Scaling)
      // a 1 hub que consolida todo. Las 5 páginas siguen vivas — sólo cambia
      // el entry point. El hub muestra cada módulo como activo (verde, con
      // métricas) o vacío (muted, con purpose copy + CTA configurar).
      label: 'Build',
      items: [
        { id: 'build_hub', label: 'Growth OS', icon: <Icons.Briefcase />, activeIds: ['build_hub', 'growth_dashboard', 'agent', 'strategy_hub', 'content_engine', 'products', 'strategy_toolkit', 'team_scaling'] },
      ],
    },
  ];
  const salesNavItems: NavItemDef[] = salesNavGroups.flatMap(g => g.items);
  const isNavItemActive = (item: NavItemDef) => item.activeIds?.includes(currentPage) || currentPage === item.id;

  // Master mode (platform admin) sidebar. No permission gates — the entire
  // mode is gated at the switch level by `isPlatformAdmin`. Each page also
  // re-checks via `is_platform_admin` RPC server-side.
  const masterNavItems: NavItemDef[] = [
    { id: 'platform_admin',     label: 'Dashboard',         icon: <Icons.Home /> },
    { id: 'platform_customers', label: 'Customers',         icon: <Icons.Users /> },
    { id: 'platform_roles',     label: 'Roles & Access',    icon: <Icons.Shield /> },
    { id: 'platform_features',  label: 'Features',          icon: <Icons.Settings /> },
    { id: 'platform_audit',     label: 'Audit log',         icon: <Icons.Activity /> },
    { id: 'platform_slack_agent', label: 'Slack agent',     icon: <Icons.Message /> },
    { id: 'platform_sales_agent', label: 'Sales Agent',     icon: <Icons.Sparkles /> },
  ];

  const currentNavItems = (
    currentMode === 'os' ? osNavItems
    : currentMode === 'master' ? masterNavItems
    : salesNavItems
  ).filter(item => {
    if (item.feature && !hasFeature(item.feature)) return false;
    if (!item.permission) return true;
    if (!isInitialized) return true;
    return hasPermission(item.permission.module, item.permission.action);
  });

  const navSkeletonCount = currentMode === 'os' ? 6 : currentMode === 'master' ? 5 : 4;

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
        <TenantSwitcher expanded={isSidebarExpanded} isDarkMode={isDarkMode} onNavigate={onNavigate} />

        {/* Workspace Switcher — segmented control. The OS segment is
            ALWAYS available so users never get stranded inside a mode
            whose feature flag is disabled (e.g. switching to a tenant
            with sales_module=false while in Sales mode). Sales segment
            shows only when sales_module is on; Master only for platform
            admins.
            The icons row is always visible; the textual label sits to
            its right (only when the sidebar is expanded) in the same
            flex flow — no absolute positioning, so the buttons can
            never be hidden behind the label.
        */}
        <div className="w-[calc(100%-24px)] mx-3 mb-1.5 shrink-0">
          {(() => {
            // The segmented switch is ALWAYS 2 segments: OS + Sales.
            // Master lives as a separate button below.
            const segments: Array<{ key: AppMode; icon: React.ReactNode; label: string; shortcut: string }> = [
              { key: 'os',     icon: <Icons.Home size={13} />,  label: 'System', shortcut: '1' },
            ];
            if (hasFeature('sales_module') || hasFeature('finance_module')) {
              segments.push({ key: 'sales', icon: <Icons.Chart size={13} />, label: 'Sales', shortcut: '2' });
            }
            // activeIdx for the 2-segment switch — master mode means
            // neither is active inside the switch (both dim).
            const activeIdx = currentMode === 'master' ? -1 : Math.max(0, segments.findIndex(s => s.key === currentMode));
            const segCount = segments.length;
            const activeLabel = currentMode === 'master' ? 'Master' : (segments[Math.max(0, activeIdx)]?.label || 'System');
            const titleText = segments
              .filter(s => s.key !== currentMode)
              .map(s => `Switch to ${s.label} (${s.shortcut})`)
              .join(' · ');
            return (
              <div className={`w-full flex flex-col gap-1.5 ${isSidebarExpanded ? '' : 'items-center'}`}>
                <div className={`w-full flex items-center gap-2 ${isSidebarExpanded ? '' : 'justify-center'}`}>
                  <div
                    className="relative flex items-center p-0.5 rounded-full bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 group/switch"
                    style={{ width: `${segCount * 26 + 4}px` }}
                    title={titleText}
                  >
                    {/* Sliding highlight — hidden when Master mode is active */}
                    {activeIdx >= 0 && (
                      <div
                        className="absolute top-0.5 bottom-0.5 bg-white dark:bg-zinc-800 rounded-full shadow-sm transition-[left,width] duration-300 pointer-events-none"
                        style={{ width: `${100 / segCount}%`, left: `${(100 / segCount) * activeIdx}%` }}
                      />
                    )}
                    {segments.map(s => {
                      const isActive = s.key === currentMode;
                      return (
                        <button
                          key={s.key}
                          onClick={() => onSwitchMode(s.key)}
                          className={`relative z-10 flex items-center justify-center w-6 h-6 rounded-full transition-colors cursor-pointer shrink-0 ${
                            isActive
                              ? 'text-zinc-900 dark:text-zinc-100'
                              : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200'
                          }`}
                          title={`Switch to ${s.label} (${s.shortcut})`}
                          aria-label={`Switch to ${s.label}`}
                        >
                          {s.icon}
                        </button>
                      );
                    })}
                  </div>
                  {isSidebarExpanded && currentMode !== 'master' && (
                    <div className="flex-1 min-w-0 flex flex-col items-start">
                      <div className="font-semibold text-xs leading-tight truncate w-full text-zinc-900 dark:text-zinc-100">
                        {activeLabel}
                      </div>
                      <div className="text-[9px] text-zinc-500 uppercase tracking-wider leading-tight mt-0.5">Switch view</div>
                    </div>
                  )}
                </div>

                {/* Master button — separate from the 2-segment switch,
                    visible only to platform admins. Sits below the toggle. */}
                {canUseMasterMode && (
                  <button
                    onClick={() => onSwitchMode('master')}
                    className={`
                      w-full flex items-center gap-2 rounded-lg px-2 py-1.5 transition-all
                      ${currentMode === 'master'
                        ? 'bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40 border border-transparent'
                      }
                    `}
                    title="Switch to Master (3)"
                  >
                    <Icons.Shield size={14} className={currentMode === 'master' ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-400 dark:text-zinc-500'} />
                    {isSidebarExpanded && (
                      <span className={`text-xs font-semibold truncate ${currentMode === 'master' ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-500 dark:text-zinc-400'}`}>
                        Master
                      </span>
                    )}
                  </button>
                )}
              </div>
            );
          })()}
        </div>

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
          {/* OS mode: render in groups with thin dividers between them so the
              eye reads home/activity → calendar/docs → clients as distinct
              clusters. Sales mode keeps a single flat list. */}
          {isInitialized && currentMode === 'os' && (() => {
            const visibleGroups = osNavGroups
              .map(group => group.filter(item => {
                if (item.feature && !hasFeature(item.feature)) return false;
                if (!item.permission) return true;
                return hasPermission(item.permission.module, item.permission.action);
              }))
              .filter(group => group.length > 0);
            return visibleGroups.map((group, gi) => (
              <React.Fragment key={`group-${gi}`}>
                {gi > 0 && (
                  <div className={`shrink-0 ${isSidebarExpanded ? 'w-[calc(100%-24px)] mx-3' : 'w-8 mx-auto'} my-1.5 h-px bg-zinc-100 dark:bg-zinc-800/60`} />
                )}
                {group.map(item => (
                  <NavItem
                    key={item.id}
                    id={item.id}
                    icon={item.icon}
                    label={item.label}
                    active={isNavItemActive(item)}
                    expanded={isSidebarExpanded}
                    onClick={() => onNavigate(item.id)}
                  />
                ))}
              </React.Fragment>
            ));
          })()}

          {/* Master mode: flat nav. masterNavItems carries the platform pages. */}
          {isInitialized && currentMode === 'master' && masterNavItems.map(item => (
            <NavItem
              key={item.id}
              id={item.id}
              icon={item.icon}
              label={item.label}
              active={isNavItemActive(item)}
              expanded={isSidebarExpanded}
              onClick={() => onNavigate(item.id)}
            />
          ))}

          {/* Sales mode: 3 grupos (Run / Insights / Build) + Agent separado.
              Mismo patrón visual que OS mode — micro-labels uppercase entre
              groups cuando el sidebar está expandido, dividers cuando colapsado. */}
          {isInitialized && currentMode === 'sales' && (() => {
            const visibleGroups = salesNavGroups
              .map(g => ({
                ...g,
                items: g.items.filter(item => {
                  if (item.feature && !hasFeature(item.feature)) return false;
                  if (!item.permission) return true;
                  return hasPermission(item.permission.module, item.permission.action);
                }),
              }))
              .filter(g => g.items.length > 0);
            return (
              <>
                {visibleGroups.map((group, gi) => (
                  <React.Fragment key={`sales-group-${gi}`}>
                    {gi > 0 && (
                      <div className={`shrink-0 ${isSidebarExpanded ? 'w-[calc(100%-24px)] mx-3' : 'w-8 mx-auto'} my-1.5 h-px bg-zinc-100 dark:bg-zinc-800/60`} />
                    )}
                    {isSidebarExpanded && (
                      <div className="w-[calc(100%-24px)] mx-3 mt-0.5 mb-1 text-[8.5px] font-bold uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-600">
                        {group.label}
                      </div>
                    )}
                    {group.items.map(item => (
                      <NavItem
                        key={item.id}
                        id={item.id}
                        icon={item.icon}
                        label={item.label}
                        active={isNavItemActive(item)}
                        expanded={isSidebarExpanded}
                        onClick={() => onNavigate(item.id)}
                      />
                    ))}
                  </React.Fragment>
                ))}
              </>
            );
          })()}

          {/* Clients tree — sits in flow under the calendar/docs group with
              its own divider above (no longer pushed to the bottom of the
              sidebar). User found that more readable. */}
          {isInitialized && currentMode === 'os' && showProjectsModule && (
            <div className="w-full pt-1">
              <div className={`shrink-0 ${isSidebarExpanded ? 'w-[calc(100%-24px)] mx-3' : 'w-8 mx-auto'} mb-1.5 h-px bg-zinc-100 dark:bg-zinc-800/60`} />
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
          {/* Theme toggle removed — dark/light controlled via TopNavbar or
              system preference. Keeps sidebar minimal. */}

          <button
            onClick={toggleTheme}
            className={`hidden md:flex items-center justify-center transition-colors ${
              isSidebarExpanded
                ? 'w-[calc(100%-24px)] mx-3 gap-2 rounded-lg px-3 py-2 text-[11px] font-medium text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/70'
                : 'w-8 h-8 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-600 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/70'
            }`}
            title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDarkMode ? <Icons.Sun size={14} /> : <Icons.Moon size={14} />}
            {isSidebarExpanded && <span>{isDarkMode ? 'Light mode' : 'Dark mode'}</span>}
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
            currentMode={currentMode}
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
      <ConfigurationModal
        isOpen={isConfigOpen}
        onClose={() => { setIsConfigOpen(false); setConfigInitialTab(undefined); }}
        onNavigate={onNavigate}
        initialTab={configInitialTab}
      />
      {/* AiAdvisor (legacy gemini chat) removido por feedback de UX —
          competía con el AuroraFab en la misma esquina abajo-derecha y
          dejaba la experiencia confusa. Aurora ya cubre el caso de uso
          con el agente "advisor" entre sus 24 slugs (multi-agent +
          tool calling con OpenAI). Si querés re-habilitarlo, descomentá
          la línea siguiente — pero conviene refactorearlo a un mode
          dentro del Aurora dock antes de re-prenderlo.
          <AiAdvisor /> */}

      {/* Mobile Bottom Tab Bar */}
      {isMobile && (
        <BottomTabBar
          currentPage={currentPage}
          onNavigate={onNavigate}
          isDarkMode={isDarkMode}
          onToggleTheme={toggleTheme}
          onOpenNewTask={() => setIsTaskModalOpen(true)}
          onOpenSearch={() => setShowCommandPalette(true)}
        />
      )}
    </div>
  );
};
