import React, { useState, useEffect } from 'react';
import { Icons } from './ui/Icons';
import { SlidePanel } from './ui/SlidePanel';
import { PageView, AppMode, Priority } from '../types';
import { TopNavbar } from './TopNavbar';
import { useRBAC } from '../context/RBACContext';
import { ConfigurationModal } from './config/ConfigurationModal';
import { useSupabase } from '../hooks/useSupabase';
import { generateTaskFromAI } from '../lib/ai';
import { useTeam } from '../context/TeamContext';
import { useAuth } from '../hooks/useAuth';
import { AiAdvisor } from './AiAdvisor';

interface LayoutProps {
  children: React.ReactNode;
  currentPage: PageView;
  currentMode: AppMode;
  onNavigate: (page: PageView) => void;
  onSwitchMode: (mode: AppMode) => void;
}

// Define color themes for each navigation item
const NAV_THEMES: Record<string, string> = {
  docs: 'hover:bg-indigo-50 hover:text-indigo-700 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400',
  // Sales Themes
  sales_dashboard: 'hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100',
  finance: 'hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-400',
  sales_leads: 'hover:bg-purple-50 hover:text-purple-700 dark:hover:bg-purple-500/10 dark:hover:text-purple-400',
  sales_analytics: 'hover:bg-sky-50 hover:text-sky-700 dark:hover:bg-sky-500/10 dark:hover:text-sky-400',
};

const ACTIVE_THEMES: Record<string, string> = {
  home: 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 shadow-sm', // Inverted for high contrast
  projects: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-300 shadow-sm',
  clients: 'bg-blue-100 text-blue-900 dark:bg-blue-500/20 dark:text-blue-300 shadow-sm',
  calendar: 'bg-orange-100 text-orange-900 dark:bg-orange-500/20 dark:text-orange-300 shadow-sm',
  activity: 'bg-rose-100 text-rose-900 dark:bg-rose-500/20 dark:text-rose-300 shadow-sm',
  docs: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-500/20 dark:text-indigo-300 shadow-sm',
  // Sales Active
  sales_dashboard: 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 shadow-sm',
  finance: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-300 shadow-sm',
  sales_leads: 'bg-purple-100 text-purple-900 dark:bg-purple-500/20 dark:text-purple-300 shadow-sm',
  sales_analytics: 'bg-sky-100 text-sky-900 dark:bg-sky-500/20 dark:text-sky-300 shadow-sm',
};

const NavItem: React.FC<{
  id: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  expanded: boolean;
  onClick: () => void
}> = ({ id, icon, label, active, expanded, onClick }) => {

  const themeClass = active
    ? ACTIVE_THEMES[id] || ACTIVE_THEMES.home
    : `text-zinc-500 dark:text-zinc-400 ${NAV_THEMES[id] || NAV_THEMES.home}`;

  return (
    <button
      onClick={onClick}
      className={`
        relative flex items-center w-[calc(100%-24px)] mx-3 px-3 py-2.5 rounded-2xl transition-all duration-200 group/item shrink-0
        ${themeClass}
      `}
      title={!expanded ? label : undefined}
    >
      <div className="flex items-center justify-center w-6 h-6 shrink-0 transition-transform duration-200 group-hover/item:scale-110">
        {React.cloneElement(icon as React.ReactElement, {
          size: 20,
          strokeWidth: active ? 2.5 : 2
        })}
      </div>

      <span className={`
        ml-3 text-sm font-medium whitespace-nowrap overflow-hidden transition-all duration-300 
        ${expanded ? 'opacity-100 translate-x-0 w-auto' : 'opacity-0 -translate-x-2 w-0'}
      `}>
        {label}
      </span>

      {/* Tooltip for collapsed state */}
      {!expanded && (
        <div className="absolute left-full ml-4 px-2.5 py-1.5 bg-zinc-900 dark:bg-zinc-800 text-white dark:text-zinc-100 text-xs font-medium rounded-lg opacity-0 -translate-x-2 group-hover/item:opacity-100 group-hover/item:translate-x-0 transition-all pointer-events-none whitespace-nowrap z-50 shadow-xl border border-zinc-800 dark:border-zinc-700">
          {label}
          <div className="absolute top-1/2 -left-1 -mt-1 border-4 border-transparent border-r-zinc-900 dark:border-r-zinc-800"></div>
        </div>
      )}
    </button>
  );
};

// --- GLOBAL TASK MODAL ---
const PRIORITY_CONFIG = {
  [Priority.Low]: { label: 'Baja', color: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800', dot: 'bg-emerald-500' },
  [Priority.Medium]: { label: 'Media', color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800', dot: 'bg-amber-500' },
  [Priority.High]: { label: 'Alta', color: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800', dot: 'bg-red-500' },
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
  projects: { id: string; title: string }[]
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
      <span className="text-xs text-zinc-400"><b>Enter</b> para crear</span>
      <div className="flex gap-2">
        <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors rounded-lg">
          Cancelar
        </button>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || isSubmitting}
          className="px-5 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-40 flex items-center gap-2"
        >
          {isSubmitting ? <Icons.Clock size={14} className="animate-spin" /> : <Icons.Plus size={14} />}
          Crear tarea
        </button>
      </div>
    </div>
  ) : undefined;

  const activeMembers = teamMembers.filter(m => m.status === 'active');

  return (
    <SlidePanel isOpen={isOpen} onClose={onClose} title="Nueva tarea" subtitle="Crea y asigna tareas al equipo" width="md" footer={footer}>
      {/* Mode Tabs */}
      <div className="flex border-b border-zinc-100 dark:border-zinc-800">
        {[
          { id: 'quick', label: 'Rápida', icon: <Icons.Zap size={14} /> },
          { id: 'detailed', label: 'Detallada', icon: <Icons.List size={14} /> },
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
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">Describe la tarea en lenguaje natural</label>
              <textarea
                autoFocus
                value={aiInput}
                onChange={e => setAiInput(e.target.value)}
                placeholder="Ej: 'Recordarme llamar a Sofia mañana por el UI kit, es urgente'"
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
              {isThinking ? 'Procesando...' : 'Generar tarea con IA'}
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
                placeholder="¿Qué hay que hacer?"
                className="w-full px-0 py-2 bg-transparent border-0 border-b-2 border-zinc-200 dark:border-zinc-700 outline-none focus:border-zinc-900 dark:focus:border-zinc-100 text-lg font-semibold text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-300 dark:placeholder:text-zinc-600 transition-colors"
                onKeyDown={e => { if (e.key === 'Enter' && mode === 'quick') handleSubmit(); }}
              />
            </div>

            {/* Priority */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">Prioridad</label>
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
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">Asignar a</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setAssigneeId('')}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                      !assigneeId
                        ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100 font-semibold'
                        : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300'
                    }`}
                  >
                    Sin asignar
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
                      {member.id === user?.id ? 'Yo' : (member.name || member.email?.split('@')[0])}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick mode: date + project row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">Fecha límite</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg outline-none focus:border-zinc-400 text-sm text-zinc-900 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">Proyecto</label>
                <select
                  value={projectId}
                  onChange={e => setProjectId(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg outline-none focus:border-zinc-400 text-sm text-zinc-900 dark:text-zinc-100"
                >
                  <option value="">Sin proyecto</option>
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
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">Estado</label>
                    <div className="flex gap-2">
                      {([{ id: 'todo', label: 'Por hacer' }, { id: 'in-progress', label: 'En progreso' }] as const).map(s => (
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
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">Categoría</label>
                    <input
                      type="text"
                      value={tag}
                      onChange={e => setTag(e.target.value)}
                      placeholder="Ej: Diseño"
                      className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg outline-none focus:border-zinc-400 text-sm text-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">Descripción</label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Agrega detalles o contexto..."
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

export const Layout: React.FC<LayoutProps> = ({ children, currentPage, currentMode, onNavigate, onSwitchMode }) => {
  const { hasPermission, isInitialized } = useRBAC();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  // Global Task Modal State
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const { add: addTask } = useSupabase<any>('tasks', { enabled: false, subscribe: false });
  const { data: taskProjects } = useSupabase<{ id: string; title: string }>('projects', {
    enabled: isTaskModalOpen,
    subscribe: false,
    select: 'id,title'
  });

  // Persistent Sidebar State
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(() => {
    const saved = localStorage.getItem('sidebarExpanded');
    return saved === 'true'; // Default to false if not set
  });

  useEffect(() => {
    localStorage.setItem('sidebarExpanded', String(isSidebarExpanded));
  }, [isSidebarExpanded]);

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
        } else if (e.key === '2' && currentMode !== 'sales') {
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
      alert('No se pudo crear la tarea: ' + (err?.message || 'Error'));
    }
  };

  const osNavItems: { id: PageView; label: string; icon: React.ReactNode; permission?: { module: any, action: any } }[] = [
    { id: 'home', label: 'Home', icon: <Icons.Home /> },
    { id: 'projects', label: 'Projects', icon: <Icons.Briefcase />, permission: { module: 'projects', action: 'view' } },
    { id: 'team_clients', label: 'Team/Clients', icon: <Icons.Users />, permission: { module: 'team', action: 'view' } },
    { id: 'calendar', label: 'Calendar', icon: <Icons.Calendar />, permission: { module: 'calendar', action: 'view' } },
    { id: 'activity', label: 'Activity', icon: <Icons.Activity />, permission: { module: 'activity', action: 'view' } },
    { id: 'docs', label: 'Docs', icon: <Icons.Docs />, permission: { module: 'documents', action: 'view' } },
  ];

  const salesNavItems: { id: PageView; label: string; icon: React.ReactNode; permission?: { module: any, action: any } }[] = [
    { id: 'sales_dashboard', label: 'Sales Overview', icon: <Icons.Chart />, permission: { module: 'sales', action: 'view_dashboard' } },
    { id: 'sales_leads', label: 'Leads Inbox', icon: <Icons.Mail />, permission: { module: 'sales', action: 'view_leads' } },
    { id: 'finance', label: 'Financial Center', icon: <Icons.DollarSign />, permission: { module: 'finance', action: 'view' } },
    { id: 'sales_analytics', label: 'Analytics', icon: <Icons.Activity />, permission: { module: 'sales', action: 'view_analytics' } },
  ];

  const currentNavItems = (currentMode === 'os' ? osNavItems : salesNavItems).filter(item => {
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

      {/* Mobile Menu Button */}
      <div className="md:hidden fixed top-4 left-4 z-50">
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2.5 bg-white dark:bg-zinc-900 rounded-full shadow-lg border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
        >
          {isMobileMenuOpen ? <Icons.Close size={20} /> : <Icons.Menu size={20} />}
        </button>
      </div>

      {/* 
         SIDEBAR
      */}
      <aside className={`
        fixed z-50 h-[calc(100vh-32px)] top-4 bottom-4 left-4
        bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 
        shadow-2xl shadow-zinc-200/50 dark:shadow-black/80
        rounded-[2rem] flex flex-col items-center py-6 gap-2
        transition-all duration-500 ease-[cubic-bezier(0.25,0.8,0.25,1)]
        overflow-hidden
        ${isMobileMenuOpen ? 'translate-x-0 w-[240px]' : '-translate-x-[120%] md:translate-x-0'}
        ${isSidebarExpanded ? 'md:w-[240px]' : 'md:w-[72px]'}
      `}>

        {/* Workspace Switcher */}
        <div className="relative w-[calc(100%-24px)] mx-3 mb-2 shrink-0">
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
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 w-full flex flex-col gap-1 overflow-y-auto no-scrollbar mask-image-linear-gradient mt-4 items-center">
          {!isInitialized && (
            <div className="w-full flex flex-col gap-2 px-3 animate-pulse">
              {Array.from({ length: navSkeletonCount }).map((_, index) => (
                <div
                  key={index}
                  className={`h-11 rounded-2xl bg-zinc-100 dark:bg-zinc-800/60 ${isSidebarExpanded || isMobileMenuOpen ? 'w-full' : 'w-12 mx-auto'}`}
                />
              ))}
              <div className={`h-10 rounded-2xl bg-zinc-100 dark:bg-zinc-800/60 mt-3 ${isSidebarExpanded || isMobileMenuOpen ? 'w-full' : 'w-12 mx-auto'}`} />
            </div>
          )}
          {isInitialized && currentNavItems.map(item => (
            <NavItem
              key={item.id}
              id={item.id}
              icon={item.icon}
              label={item.label}
              active={currentPage === item.id || (item.id === 'team_clients' && (currentPage === 'team' || currentPage === 'clients'))}
              expanded={isSidebarExpanded || isMobileMenuOpen}
              onClick={() => {
                onNavigate(item.id);
                setIsMobileMenuOpen(false);
              }}
            />
          ))}
        </nav>

        {/* Bottom Actions */}
        <div className="w-full flex flex-col gap-1 shrink-0 mt-2 items-center">
          <button
            onClick={toggleTheme}
            className="relative flex items-center w-[calc(100%-24px)] mx-3 px-3 py-2.5 rounded-2xl text-zinc-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:text-amber-300 dark:hover:bg-amber-500/10 transition-colors group/btn shrink-0"
            title={!isSidebarExpanded ? "Toggle Theme" : undefined}
          >
            <div className="flex items-center justify-center w-6 h-6 shrink-0">
              {isDarkMode ? <Icons.Sun size={20} /> : <Icons.Moon size={20} />}
            </div>
            <span className={`ml-3 text-sm font-medium whitespace-nowrap transition-all duration-300 ${isSidebarExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'}`}>Theme</span>
          </button>

          {/* Sidebar Toggle Button */}
          <button
            onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
            className="hidden md:flex items-center justify-center w-full py-3 mt-1 text-zinc-300 hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400 transition-colors"
            title={isSidebarExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
          >
            {isSidebarExpanded ? <Icons.ChevronLeft size={16} /> : <Icons.ChevronRight size={16} />}
          </button>
        </div>

      </aside>

      {/* Main Content Area */}
      <main
        className={`
            flex-1 h-screen overflow-y-auto relative scroll-smooth bg-zinc-50 dark:bg-black 
            transition-all duration-500 ease-[cubic-bezier(0.25,0.8,0.25,1)]
            ${isSidebarExpanded ? 'md:ml-[256px]' : 'md:ml-[88px]'}
        `}
      >
        {/* Fixed Top Navbar */}
        <TopNavbar
          pageTitle={currentPage}
          onOpenSearch={() => setShowCommandPalette(true)}
          onOpenTask={() => setIsTaskModalOpen(true)}
          onNavigate={onNavigate}
        />

        <div className="px-4 md:px-8 pb-8 w-full max-w-[1600px] mx-auto min-h-full fade-in">
          {children}
        </div>
      </main>

      {/* Command Palette Modal */}
      {showCommandPalette && (
        <div className="fixed inset-0 bg-white/60 dark:bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center pt-[15vh]">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
              <Icons.Search className="text-zinc-400" size={18} />
              <input
                autoFocus
                type="text"
                placeholder="Where to? (e.g., 'New Idea', 'Project X')"
                className="flex-1 px-3 py-1 outline-none text-sm placeholder:text-zinc-400 bg-transparent text-zinc-900 dark:text-zinc-100"
              />
              <span className="text-xs text-zinc-400 font-mono bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">ESC</span>
            </div>
            <div className="py-2">
              <div className="px-3 py-1 text-xs font-medium text-zinc-400 uppercase tracking-wider">Switch Context</div>
              <button onClick={() => { onSwitchMode('os'); setShowCommandPalette(false); }} className="w-full text-left px-4 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-3 text-sm text-zinc-700 dark:text-zinc-300">
                <Icons.Home size={14} /> Eneas OS
              </button>
              <button onClick={() => { onSwitchMode('sales'); setShowCommandPalette(false); }} className="w-full text-left px-4 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-3 text-sm text-zinc-700 dark:text-zinc-300">
                <Icons.Chart size={14} /> Sales & Leads
              </button>
            </div>
          </div>
          <div className="absolute inset-0 -z-10" onClick={() => setShowCommandPalette(false)}></div>
        </div>
      )}
      <ConfigurationModal isOpen={isConfigOpen} onClose={() => setIsConfigOpen(false)} />
      <AiAdvisor />
    </div>
  );
};
