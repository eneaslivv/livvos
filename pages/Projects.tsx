import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../components/ui/Icons';
import { useProjects, Project, ProjectStatus } from '../context/ProjectsContext';
import { useClients } from '../context/ClientsContext';
import { errorLogger } from '../lib/errorLogger';
import { logActivity } from '../lib/activity';
import { supabase } from '../lib/supabase';
import { useSupabase } from '../hooks/useSupabase';
import PortalApp from '../components/portal/livv-client view-control/App';
import type { DashboardData, Milestone, LogEntry, PaymentEntry } from '../components/portal/livv-client view-control/types';

import { useTeam } from '../context/TeamContext';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from '../context/TenantContext';
import { useFinance } from '../context/FinanceContext';
import { colorToBg, ColorPalette } from '../components/ui/ColorPalette';
import { ProjectSidebar, ShareModal, PortalLinkSection, OverviewTab, TasksTab, TimelineTab, FilesTab, SettingsTab } from '../components/projects';

/* ─── AI Preview types ─── */
export interface AiPreviewSubtask {
  title: string;
}
export interface AiPreviewTask {
  title: string;
  priority: string;
  subtasks?: AiPreviewSubtask[];
}
export interface AiPreviewPhase {
  name: string;
  tasks: AiPreviewTask[];
  startDate?: string;
  endDate?: string;
  budget?: number;
}
export interface AiPreview {
  phases: AiPreviewPhase[];
}

/* ─── Status badge ─── */
const StatusBadge = ({ status }: { status: ProjectStatus }) => {
  const colors = {
    [ProjectStatus.Active]: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
    [ProjectStatus.Pending]: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
    [ProjectStatus.Review]: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400',
    [ProjectStatus.Completed]: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
    [ProjectStatus.Archived]: 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${colors[status]}`}>
      {status}
    </span>
  );
};

/* ─── Client Picker Dropdown ─── */
const ClientPickerDropdown = ({ clients, onSelect }: {
  clients: { id: string; name: string; company?: string; email?: string; avatar_url?: string }[];
  onSelect: (client: { id: string; name: string; company?: string }) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const filtered = clients.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.company?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(prev => !prev)}
        className="w-full flex items-center gap-2 p-3 border border-dashed border-zinc-300 dark:border-zinc-600 rounded-xl text-zinc-400 dark:text-zinc-500 hover:border-blue-400 hover:text-blue-500 dark:hover:border-blue-500 dark:hover:text-blue-400 transition-all text-[12px] font-medium"
      >
        <Icons.Plus size={14} className="shrink-0" />
        <span>Assign a client...</span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1.5 w-full bg-white dark:bg-zinc-800 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
          {clients.length > 5 && (
            <div className="p-2 border-b border-zinc-100 dark:border-zinc-700">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search clients..."
                autoFocus
                className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-300"
              />
            </div>
          )}
          <div className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-zinc-400 italic">No clients found.</p>
            ) : (
              filtered.map(c => (
                <button
                  key={c.id}
                  onClick={() => { onSelect(c); setOpen(false); setSearch(''); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-500/10 text-left transition-colors"
                >
                  {c.avatar_url ? (
                    <img src={c.avatar_url} alt={c.name} className="w-7 h-7 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                      {c.name.substring(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium text-zinc-700 dark:text-zinc-200 truncate">{c.name}</div>
                    {c.company && (
                      <div className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">{c.company}</div>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* ─── Animated Tab Bar ─── */
const TabBar = ({ tabs, active, onChange }: {
  tabs: { id: string; label: string; icon: React.ElementType }[];
  active: string;
  onChange: (id: string) => void;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const activeBtn = container.querySelector(`[data-tab="${active}"]`) as HTMLButtonElement;
    if (activeBtn) {
      setIndicator({
        left: activeBtn.offsetLeft,
        width: activeBtn.offsetWidth,
      });
    }
  }, [active]);

  return (
    <div ref={containerRef} className="relative flex items-center gap-1 p-1 bg-zinc-100/80 dark:bg-zinc-800/50 rounded-xl">
      <motion.div
        className="absolute top-1 bottom-1 bg-white dark:bg-zinc-700/80 rounded-lg shadow-sm"
        animate={{ left: indicator.left, width: indicator.width }}
        transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}
      />
      {tabs.map(tab => {
        const Icon = tab.icon;
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            data-tab={tab.id}
            onClick={() => onChange(tab.id)}
            className={`relative z-10 flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors duration-200 ${
              isActive
                ? 'text-zinc-900 dark:text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
            }`}
          >
            <Icon size={13} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};

/* ─── Progress ring (mini) ─── */
const ProgressRing = ({ progress, size = 28, stroke = 2.5, color }: { progress: number; size?: number; stroke?: number; color?: string }) => {
  const radius = (size - stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke}
        className="stroke-zinc-100 dark:stroke-zinc-800" />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke}
        strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
        className={color ? undefined : (progress === 100 ? 'stroke-emerald-500' : 'stroke-zinc-900 dark:stroke-zinc-300')}
        style={{ transition: 'stroke-dashoffset 0.6s ease', ...(color ? { stroke: color } : {}) }} />
    </svg>
  );
};

/* ─── Project View Preview ─── */
const ClientViewPreview: React.FC<{
  project: Project;
  tasks: any[];
  derivedGroups: { name: string; tasks: any[] }[];
}> = ({ project, tasks, derivedGroups }) => {
  const { incomes } = useFinance();

  // Build real payments from project incomes
  const projectIncomes = useMemo(() => incomes.filter(i => i.project_id === project.id), [incomes, project.id]);
  const payments = useMemo<PaymentEntry[]>(() => {
    const result: PaymentEntry[] = [];
    for (const inc of projectIncomes) {
      const installments = inc.installments || [];
      if (installments.length > 0) {
        for (const inst of installments) {
          result.push({
            id: inst.id,
            concept: `${inc.concept} — #${inst.number}`,
            amount: inst.amount,
            dueDate: inst.due_date || '',
            paidDate: inst.paid_date || undefined,
            status: inst.status as PaymentEntry['status'],
            number: inst.number,
          });
        }
      } else {
        result.push({
          id: inc.id,
          concept: inc.concept,
          amount: inc.total_amount,
          dueDate: inc.due_date || '',
          status: (inc.status === 'paid' ? 'paid' : inc.status === 'overdue' ? 'overdue' : 'pending') as PaymentEntry['status'],
        });
      }
    }
    return result.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  }, [projectIncomes]);

  const budgetTotal = payments.reduce((sum, p) => sum + p.amount, 0);
  const budgetPaid = payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);
  const nextPending = payments.find(p => p.status !== 'paid');

  const hiddenResourceTabs = useMemo(() => {
    const hidden: ('finance' | 'access' | 'docs')[] = [];
    if (budgetTotal === 0 && payments.length === 0) hidden.push('finance');
    if (!(project.files || []).length) hidden.push('docs');
    hidden.push('access'); // Preview never shows credentials
    return hidden;
  }, [budgetTotal, payments, project.files]);

  const dashboardData = useMemo<DashboardData>(() => {
    const totalTasks = tasks.length || 1;
    const completedTasks = tasks.filter((t: any) => t.completed).length;
    const progress = project.progress || Math.min(100, Math.round((completedTasks / totalTasks) * 100));
    const startDate = project.createdAt
      ? new Date(project.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'TBD';
    const dueDates = tasks.map((t: any) => t.due_date).filter(Boolean) as string[];
    const etaRaw = dueDates.length ? dueDates.sort().slice(-1)[0] : project.deadline;
    const etaDate = etaRaw
      ? new Date(etaRaw).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'TBD';
    const milestones: Milestone[] = derivedGroups.map((group, idx) => {
      const done = group.tasks.filter((t: any) => t.done).length;
      const total = group.tasks.length;
      const allDone = total > 0 && done === total;
      const hasSome = done > 0 && !allDone;
      return {
        id: `phase-${idx}`,
        title: group.name,
        description: `${done}/${total} tasks completed`,
        status: allDone ? 'completed' : hasSome ? 'current' : 'future',
      };
    });
    const logs: LogEntry[] = (project.activity || []).slice(0, 8).map((a, idx) => ({
      id: `log-${idx}`,
      timestamp: a.date ? new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Recent',
      message: a.text || 'Project update',
    }));
    const assets = (project.files || []).map((f, idx) => ({
      id: `file-${idx}`,
      name: f.name,
      type: f.type || 'File',
      size: f.size || '—',
    }));
    return {
      progress,
      startDate,
      etaDate,
      onTrack: project.status === ProjectStatus.Active || project.status === ProjectStatus.Review,
      budget: {
        total: budgetTotal,
        paid: budgetPaid,
        nextPayment: nextPending ? { amount: nextPending.amount, dueDate: nextPending.dueDate, concept: nextPending.concept } : undefined,
        payments,
      },
      milestones: milestones.length ? milestones : [
        { id: 'default', title: 'Project kickoff', description: 'Initial project setup.', status: 'current' as const }
      ],
      logs: logs.length ? logs : [
        { id: 'default', timestamp: 'Now', message: 'Portal connected — no activity yet.' }
      ],
      assets,
      credentials: [],
    };
  }, [project, tasks, derivedGroups, budgetTotal, budgetPaid, nextPending, payments]);

  return (
    <PortalApp
      initialData={dashboardData}
      projectTitle={project.title}
      projectSubtitle={`${project.status} — ${project.client}`}
      forceOnboarded
      disableLoading
      hideCreatorToggle
      hiddenResourceTabs={hiddenResourceTabs}
    />
  );
};

/* ─── Category type for sidebar grouping ─── */
type ProjectCategory = 'client' | 'personal';

interface SidebarGroup {
  id: string;
  label: string;
  category: ProjectCategory;
  clientId?: string;
  clientAvatar?: string;
  clientEmail?: string;
  projects: Project[];
}

/* ════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                             */
/* ════════════════════════════════════════════════════════════ */
export const Projects: React.FC<{ navProjectId?: string }> = ({ navProjectId }) => {
  const { projects, loading, error, createProject, updateProject, deleteProject } = useProjects();
  const { clients } = useClients();
  const { members } = useTeam();
  const { user: currentUser } = useAuth();
  const { currentTenant } = useTenant();
  const { incomes, expenses, createIncome, updateInstallment, deleteIncome, createExpense, deleteExpense, timeEntries, createTimeEntry, deleteTimeEntry } = useFinance();
  const { data: syncedTasks, add: addSyncedTask, update: updateSyncedTask, remove: removeSyncedTask, refresh: refreshTasks } = useSupabase<any>('tasks', {
    enabled: true,
    subscribe: true,
    select: 'id,title,completed,completed_at,project_id,due_date,assignee_id,priority,group_name,parent_task_id,status'
  });

  // Loading timeout — prevents infinite spinner
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const loadingStartRef = useRef(Date.now());

  useEffect(() => {
    if (loading) {
      const elapsed = Date.now() - loadingStartRef.current;
      const remaining = Math.max(0, 5000 - elapsed);
      const timer = setTimeout(() => setLoadingTimedOut(true), remaining);
      return () => clearTimeout(timer);
    }
    loadingStartRef.current = Date.now();
    setLoadingTimedOut(false);
  }, [loading]);

  useEffect(() => {
    errorLogger.log('Projects component mounted', { loading, error, projectsCount: projects?.length });
  }, [loading, error, projects?.length]);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Navigate to a specific project when coming from another page (e.g. Clients)
  useEffect(() => {
    if (navProjectId) setSelectedId(navProjectId);
  }, [navProjectId]);
  const [activeTab, setActiveTab] = useState('overview');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isClientPreviewMode, setIsClientPreviewMode] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState<Record<number, string>>({});
  const [taskError, setTaskError] = useState<string | null>(null);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [newProjectClient, setNewProjectClient] = useState('');
  const [newProjectDeadline, setNewProjectDeadline] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSubmittingProject, setIsSubmittingProject] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [clientInviteLink, setClientInviteLink] = useState<string | null>(null);
  const [clientInviteError, setClientInviteError] = useState<string | null>(null);
  const [isInvitingClient, setIsInvitingClient] = useState(false);
  const [externalShareEmail, setExternalShareEmail] = useState('');
  const [externalShareRole, setExternalShareRole] = useState<'viewer' | 'collaborator' | 'editor'>('viewer');
  const [externalShareLink, setExternalShareLink] = useState<string | null>(null);
  const [externalShareError, setExternalShareError] = useState<string | null>(null);
  const [isCreatingShare, setIsCreatingShare] = useState(false);
  const [existingShares, setExistingShares] = useState<any[]>([]);
  const [sidebarFilter, setSidebarFilter] = useState<'all' | 'client' | 'personal'>('all');
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [timelineNewStart, setTimelineNewStart] = useState('');
  const [timelineNewEnd, setTimelineNewEnd] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiPreview, setAiPreview] = useState<AiPreview | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Finance inline form state
  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [incomeFormData, setIncomeFormData] = useState({ concept: '', amount: '', installments: '1', dueDate: new Date().toISOString().split('T')[0], currency: 'USD', installment_dates: [] as string[] });
  const [expenseFormData, setExpenseFormData] = useState({ concept: '', amount: '', category: 'Software', date: new Date().toISOString().split('T')[0] });
  const [isSubmittingFinance, setIsSubmittingFinance] = useState(false);
  const [showTimeForm, setShowTimeForm] = useState(false);
  const [timeFormData, setTimeFormData] = useState({ description: '', hours: '', date: new Date().toISOString().split('T')[0], hourlyRate: '' });

  const selectedProject = projects.find(p => p.id === selectedId) || projects[0];
  const allProjectTasks = selectedProject
    ? syncedTasks.filter((task: any) => (task.project_id || task.projectId) === selectedProject.id)
    : [];
  // Separate parent tasks from subtasks
  const projectTasks = allProjectTasks.filter((t: any) => !t.parent_task_id);
  const projectSubtasks = allProjectTasks.filter((t: any) => !!t.parent_task_id);
  const getSubtasksFor = (taskId: string) => projectSubtasks.filter((s: any) => s.parent_task_id === taskId);

  // Subtask UI state
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  /* ─── Derive phase groups ─── */
  const derivedTasksGroups = useMemo(() => {
    const groupMap = new Map<string, { name: string; tasks: any[] }>();
    for (const task of projectTasks) {
      const gName = task.group_name || 'General';
      if (!groupMap.has(gName)) groupMap.set(gName, { name: gName, tasks: [] });
      groupMap.get(gName)!.tasks.push({
        id: task.id, title: task.title, done: !!task.completed,
        assignee: task.assignee_id || '', dueDate: task.due_date || undefined,
        priority: task.priority || 'medium', status: task.status || 'todo',
        completedAt: task.completed_at || undefined,
      });
    }
    if (selectedProject) {
      for (const g of selectedProject.tasksGroups) {
        if (!groupMap.has(g.name)) groupMap.set(g.name, { name: g.name, tasks: [] });
      }
    }
    return Array.from(groupMap.values());
  }, [projectTasks, selectedProject]);

  /* ─── Build sidebar groups ─── */
  const sidebarGroups = useMemo<SidebarGroup[]>(() => {
    const clientMap = new Map<string, SidebarGroup>();
    const personalProjects: Project[] = [];

    for (const p of projects) {
      if (p.client_id) {
        if (!clientMap.has(p.client_id)) {
          const client = clients.find(c => c.id === p.client_id);
          clientMap.set(p.client_id, {
            id: p.client_id,
            label: client?.name || p.clientName || p.client || 'Client',
            category: 'client',
            clientId: p.client_id,
            clientAvatar: client?.avatar_url,
            clientEmail: client?.email,
            projects: [],
          });
        }
        clientMap.get(p.client_id)!.projects.push(p);
      } else {
        personalProjects.push(p);
      }
    }

    const groups: SidebarGroup[] = [];

    // Client groups
    const clientGroups = Array.from(clientMap.values()).sort((a, b) => a.label.localeCompare(b.label));
    groups.push(...clientGroups);

    // Personal/own projects
    if (personalProjects.length > 0) {
      groups.push({
        id: 'personal',
        label: 'Own projects',
        category: 'personal',
        projects: personalProjects,
      });
    }

    return groups;
  }, [projects, clients]);

  /* ─── Filtered groups ─── */
  const filteredGroups = useMemo(() => {
    if (sidebarFilter === 'all') return sidebarGroups;
    return sidebarGroups.filter(g => g.category === sidebarFilter);
  }, [sidebarGroups, sidebarFilter]);

  /* ─── Get resolved client for selected project ─── */
  const selectedClient = useMemo(() => {
    if (!selectedProject?.client_id) return null;
    return clients.find(c => c.id === selectedProject.client_id) || null;
  }, [selectedProject, clients]);

  /* ─── Project financials from incomes/expenses ─── */
  const projectFinancials = useMemo(() => {
    if (!selectedProject) return { totalIncome: 0, totalCollected: 0, totalExpenses: 0, profit: 0, pendingAmount: 0, incomeEntries: [] as typeof incomes, expenseEntries: [] as typeof expenses, projectTimeEntries: [] as typeof timeEntries, totalHours: 0, timeCost: 0 };
    const incomeEntries = incomes.filter(i => i.project_id === selectedProject.id);
    const expenseEntries = expenses.filter(e => e.project_id === selectedProject.id);
    const projectTimeEntries = timeEntries.filter(t => t.project_id === selectedProject.id);
    const totalIncome = incomeEntries.reduce((sum, i) => sum + i.total_amount, 0);
    const totalCollected = incomeEntries.reduce((sum, i) => {
      const paid = (i.installments || []).filter(inst => inst.status === 'paid').reduce((s, inst) => s + inst.amount, 0);
      return sum + paid;
    }, 0);
    const totalExpenses = expenseEntries.reduce((sum, e) => sum + e.amount, 0);
    const totalHours = projectTimeEntries.reduce((sum, t) => sum + Number(t.hours), 0);
    const timeCost = projectTimeEntries.reduce((sum, t) => sum + (Number(t.hours) * Number(t.hourly_rate || 0)), 0);
    const profit = totalCollected - totalExpenses - timeCost;
    const pendingAmount = totalIncome - totalCollected;
    return { totalIncome, totalCollected, totalExpenses, profit, pendingAmount, incomeEntries, expenseEntries, projectTimeEntries, totalHours, timeCost };
  }, [selectedProject, incomes, expenses, timeEntries]);

  useEffect(() => {
    errorLogger.log('Projects data updated', { projectsCount: projects.length, selectedProject: selectedProject?.id, activeTab });
  }, [projects.length, selectedProject?.id, activeTab]);

  /* ─── Handlers ─── */
  const resetCreateForm = () => {
    setNewProjectTitle('');
    setNewProjectClient('');
    setNewProjectDeadline('');
    setNewProjectDesc('');
    setCreateError(null);
  };

  const handleCreateProject = async () => {
    if (!newProjectTitle.trim()) return;
    setIsSubmittingProject(true);
    setCreateError(null);
    try {
      errorLogger.log('Creating new project', { title: newProjectTitle });

      // Resolve client_id if a client was selected
      const selectedClientObj = clients.find(c => c.id === newProjectClient);

      const newProject = await createProject({
        title: newProjectTitle.trim(),
        description: newProjectDesc.trim(),
        progress: 0,
        status: ProjectStatus.Active,
        client: selectedClientObj?.name || selectedClientObj?.company || 'TBD',
        clientName: selectedClientObj?.name || selectedClientObj?.company || 'TBD',
        clientAvatar: selectedClientObj?.name?.substring(0, 2).toUpperCase() || 'XX',
        ...(selectedClientObj ? { client_id: selectedClientObj.id } as any : {}),
        deadline: newProjectDeadline || '',
        nextSteps: 'Kick-off',
        tags: [],
        team: [],
        tasksGroups: [],
        files: [],
        activity: [],
        color: '#3b82f6',
      });
      errorLogger.log('Project created successfully');
      await logActivity({
        action: 'created project', target: newProject.title,
        project_title: newProject.title, type: 'project_created', details: 'New project added'
      });
      resetCreateForm();
      setIsCreating(false);
      setSelectedId(newProject.id);
    } catch (err: any) {
      errorLogger.error('Error creating project', err);
      setCreateError(err?.message || 'Error creating the project.');
    } finally {
      setIsSubmittingProject(false);
    }
  };

  const handleInviteClientPortal = async () => {
    if (!selectedProject?.client_id || !currentTenant?.id) return;
    setIsInvitingClient(true);
    setClientInviteError(null);
    try {
      const { data: clientData, error: clientError } = await supabase
        .from('clients').select('id,email').eq('id', selectedProject.client_id).single();
      if (clientError || !clientData?.email) throw clientError || new Error('Client email not found');
      const { data: roleData, error: roleError } = await supabase
        .from('roles').select('id').eq('name', 'client').single();
      if (roleError || !roleData) throw roleError || new Error('Client role not found');
      const { data: invite, error: inviteError } = await supabase
        .from('invitations').insert({
          email: clientData.email, role_id: roleData.id, tenant_id: currentTenant.id,
          client_id: clientData.id, created_by: currentUser?.id, type: 'client'
        }).select('token').single();
      if (inviteError) throw inviteError;
      setClientInviteLink(`${window.location.origin}/accept-invite?token=${invite.token}&portal=client`);
    } catch (err: any) {
      setClientInviteError(err.message || 'Error creating client invite');
    } finally {
      setIsInvitingClient(false);
    }
  };

  const handleUpdateProject = async (updates: Partial<Project>) => {
    try {
      errorLogger.log('Updating project', { id: selectedProject.id, updates });
      if (!selectedProject) return;
      const updatedProject = await updateProject(selectedProject.id, updates);
      errorLogger.log('Project updated successfully');
      await logActivity({
        action: 'updated project', target: updatedProject.title,
        project_title: updatedProject.title, type: 'status_change', details: 'Project settings updated'
      });
    } catch (err) {
      errorLogger.error('Error updating project', err);
      alert('Error updating the project. Please try again.');
    }
  };

  useEffect(() => {
    if (!selectedId && projects.length) {
      errorLogger.log('Selecting first project by default');
      setSelectedId(projects[0].id);
    }
  }, [projects, selectedId]);

  const handleAddGroup = async () => {
    if (!selectedProject || !newGroupName.trim()) return;
    const updated = [...selectedProject.tasksGroups, { name: newGroupName.trim(), tasks: [] }];
    await updateProject(selectedProject.id, { tasksGroups: updated });
    setNewGroupName('');
    await logActivity({ action: 'added phase', target: newGroupName.trim(), project_title: selectedProject.title, type: 'project_update' });
  };

  const handleQuickTask = async () => {
    if (!selectedProject) return;
    const title = quickTaskTitle.trim();
    if (!title) return;
    setTaskError(null);
    try {
      await addSyncedTask({ title, completed: false, project_id: selectedProject.id, client_id: (selectedProject as any).client_id || null, assignee_id: currentUser?.id || null, priority: 'medium', group_name: 'General', due_date: new Date().toISOString().slice(0, 10) } as any);
      setQuickTaskTitle('');
      setTimeout(() => refreshTasks(), 1000);
      await logActivity({ action: 'added task', target: title, project_title: selectedProject.title, type: 'project_update' });
    } catch (err: any) {
      errorLogger.error('Error creating quick task', err);
      setTaskError(err?.message || 'Error creating task');
      setTimeout(() => setTaskError(null), 5000);
    }
  };

  const handleAddTask = async (groupIdx: number) => {
    if (!selectedProject) return;
    const title = newTaskTitle[groupIdx]?.trim();
    if (!title) return;
    const groupName = derivedTasksGroups[groupIdx]?.name || 'General';
    setTaskError(null);
    try {
      await addSyncedTask({ title, completed: false, project_id: selectedProject.id, client_id: (selectedProject as any).client_id || null, assignee_id: currentUser?.id || null, priority: 'medium', group_name: groupName, due_date: new Date().toISOString().slice(0, 10) } as any);
      setNewTaskTitle(prev => ({ ...prev, [groupIdx]: '' }));
      // Safety net: refresh tasks after a short delay in case realtime doesn't fire
      setTimeout(() => refreshTasks(), 1000);
      await logActivity({ action: 'added task', target: title, project_title: selectedProject.title, type: 'project_update' });
    } catch (err: any) {
      errorLogger.error('Error creating task', err);
      setTaskError(err?.message || 'Error creating task');
      setTimeout(() => setTaskError(null), 5000);
    }
  };

  const handleToggleTask = async (groupIdx: number, taskId: string) => {
    if (!selectedProject) return;
    const task = derivedTasksGroups[groupIdx]?.tasks.find((t: any) => t.id === taskId);
    if (!task) return;
    const newDone = !task.done;
    try {
      await updateSyncedTask(taskId, {
        completed: newDone,
        completed_at: newDone ? new Date().toISOString() : null,
        status: newDone ? 'done' : 'todo',
      } as any);
      setTimeout(() => refreshTasks(), 800);
      await logActivity({ action: newDone ? 'completed task' : 'reopened task', target: task.title, project_title: selectedProject.title, type: 'task_completed' });
    } catch (err: any) {
      errorLogger.error('Error updating task', err);
      alert('Error updating task: ' + (err?.message || 'Unknown error'));
    }
  };

  const handleDeleteTask = async (taskId: string, taskTitle: string) => {
    if (!selectedProject) return;
    try {
      await removeSyncedTask(taskId);
      setTimeout(() => refreshTasks(), 500);
      await logActivity({ action: 'deleted task', target: taskTitle, project_title: selectedProject.title, type: 'project_update' });
    } catch (err: any) {
      errorLogger.error('Error deleting task', err);
    }
  };

  // ─── Subtask handlers ───
  const handleAddSubtask = async (parentTaskId: string) => {
    if (!selectedProject || !newSubtaskTitle.trim()) return;
    try {
      await addSyncedTask({
        title: newSubtaskTitle.trim(),
        completed: false,
        project_id: selectedProject.id,
        parent_task_id: parentTaskId,
        priority: 'medium',
        status: 'todo',
        assignee_id: currentUser?.id || null,
        group_name: null,
        due_date: null,
      } as any);
      setNewSubtaskTitle('');
      setTimeout(() => refreshTasks(), 800);
    } catch (err: any) {
      errorLogger.error('Error creating subtask', err);
    }
  };

  const handleToggleSubtask = async (subtaskId: string, currentCompleted: boolean) => {
    try {
      await updateSyncedTask(subtaskId, { completed: !currentCompleted, status: !currentCompleted ? 'done' : 'todo' } as any);
      setTimeout(() => refreshTasks(), 800);
    } catch (err: any) {
      errorLogger.error('Error updating subtask', err);
    }
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    try {
      await removeSyncedTask(subtaskId);
      setTimeout(() => refreshTasks(), 500);
    } catch (err: any) {
      errorLogger.error('Error deleting subtask', err);
    }
  };

  const handleUpdateTaskDate = async (taskId: string, date: string | null) => {
    try {
      await updateSyncedTask(taskId, { due_date: date || null } as any);
      setTimeout(() => refreshTasks(), 500);
    } catch (err: any) {
      errorLogger.error('Error updating task date', err);
    }
  };

  // Build payment data for tasks tab
  const taskPayments = useMemo(() => {
    if (!selectedProject) return new Map<string, { amount: number; status: string }>();
    const projectInc = incomes.filter(i => i.project_id === selectedProject.id);
    const map = new Map<string, { amount: number; status: string }>();
    for (const inc of projectInc) {
      if (inc.linked_task_id) {
        map.set(inc.linked_task_id, { amount: inc.total_amount, status: inc.status });
      }
      for (const inst of (inc.installments || [])) {
        if (inst.linked_task_id) {
          map.set(inst.linked_task_id, { amount: inst.amount, status: inst.status });
        }
      }
    }
    return map;
  }, [incomes, selectedProject]);

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim() || !selectedProject) return;
    setAiGenerating(true);
    setAiError(null);
    setAiPreview(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gemini`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ type: 'tasks_bulk', input: aiPrompt.trim() }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'AI generation failed');
      if (!json.result?.phases?.length) throw new Error('No tasks generated');
      setAiPreview(json.result);
    } catch (err: any) {
      setAiError(err.message || 'Error generating tasks with AI');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleAiAccept = async () => {
    if (!aiPreview || !selectedProject) return;
    setAiGenerating(true);
    try {
      // Create phases that don't exist yet (with dates)
      const existingPhaseNames = new Set(selectedProject.tasksGroups.map(g => g.name));
      const newPhases = aiPreview.phases
        .filter(p => !existingPhaseNames.has(p.name))
        .map(p => ({ name: p.name, startDate: p.startDate || undefined, endDate: p.endDate || undefined, tasks: [] }));
      // Also update dates on existing phases if AI provided them
      const updatedExisting = selectedProject.tasksGroups.map(g => {
        const aiPhase = aiPreview.phases.find(p => p.name === g.name);
        if (aiPhase && (aiPhase.startDate || aiPhase.endDate)) {
          return { ...g, startDate: aiPhase.startDate || g.startDate, endDate: aiPhase.endDate || g.endDate };
        }
        return g;
      });
      if (newPhases.length > 0 || updatedExisting.some((g, i) => g !== selectedProject.tasksGroups[i])) {
        await updateProject(selectedProject.id, { tasksGroups: [...updatedExisting, ...newPhases] });
      }

      // Insert tasks + subtasks — use supabase directly to get parent IDs back
      let totalTasks = 0;
      let totalSubtasks = 0;
      for (const phase of aiPreview.phases) {
        for (const task of phase.tasks) {
          const { data: inserted } = await supabase.from('tasks').insert({
            title: task.title,
            completed: false,
            project_id: selectedProject.id,
            client_id: (selectedProject as any).client_id || null,
            assignee_id: currentUser?.id || null,
            priority: task.priority || 'medium',
            group_name: phase.name,
            due_date: phase.endDate || new Date().toISOString().slice(0, 10),
            tenant_id: currentTenant?.id || null,
            owner_id: currentUser?.id || null,
          }).select('id').single();
          totalTasks++;

          // Insert subtasks linked to parent
          if (task.subtasks?.length && inserted?.id) {
            const subtaskRows = task.subtasks.map(sub => ({
              title: sub.title,
              completed: false,
              project_id: selectedProject.id,
              parent_task_id: inserted.id,
              priority: 'medium',
              status: 'todo',
              assignee_id: currentUser?.id || null,
              group_name: null,
              due_date: phase.endDate || new Date().toISOString().slice(0, 10),
              tenant_id: currentTenant?.id || null,
              owner_id: currentUser?.id || null,
            }));
            await supabase.from('tasks').insert(subtaskRows);
            totalSubtasks += task.subtasks.length;
          }
        }
      }

      // Create income entries for phases with budget
      const phasesWithBudget = aiPreview.phases.filter(p => p.budget && p.budget > 0);
      if (phasesWithBudget.length > 0 && createIncome) {
        for (const phase of phasesWithBudget) {
          await createIncome({
            client_id: (selectedProject as any).client_id || null,
            project_id: selectedProject.id,
            client_name: (selectedProject as any).client_name || selectedProject.title,
            project_name: selectedProject.title,
            concept: `${phase.name}`,
            total_amount: phase.budget!,
            currency: 'USD',
            status: 'pending',
            due_date: phase.endDate || null,
          } as any);
        }
      }

      setTimeout(() => refreshTasks(), 1000);

      const subtaskLabel = totalSubtasks > 0 ? ` + ${totalSubtasks} subtasks` : '';
      await logActivity({ action: 'generated tasks with AI', target: `${totalTasks} tasks${subtaskLabel} in ${aiPreview.phases.length} phases`, project_title: selectedProject.title, type: 'project_update' });

      setAiPreview(null);
      setAiPrompt('');
    } catch (err: any) {
      errorLogger.error('Error saving AI tasks', err);
      setAiError(err.message || 'Error saving tasks');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleInviteMember = async () => {
    if (!selectedProject || !inviteEmail.trim()) return;
    const { data: profiles, error: profileErr } = await supabase.from('profiles').select('user_id,email').eq('email', inviteEmail.trim()).limit(1);
    if (profileErr) { alert('Error searching user: ' + profileErr.message); return; }
    if (!profiles || profiles.length === 0) { alert('No user found with that email. Ask them to sign in at least once.'); return; }
    const memberId = profiles[0].user_id;
    const { error: insertErr } = await supabase.from('project_members').insert({ project_id: selectedProject.id, member_id: memberId });
    if (insertErr) { alert('Error inviting: ' + insertErr.message); return; }
    setInviteEmail('');
    setIsShareModalOpen(false);
    await logActivity({ action: 'invited', target: inviteEmail.trim(), project_title: selectedProject.title, type: 'project_update', details: 'Member added to project' });
  };

  // Load existing shares when modal opens
  const loadExistingShares = async () => {
    if (!selectedProject) return;
    const { data } = await supabase
      .from('project_shares')
      .select('id, email, role, status, created_at')
      .eq('project_id', selectedProject.id)
      .neq('status', 'revoked')
      .order('created_at', { ascending: false });
    setExistingShares(data || []);
  };

  useEffect(() => {
    if (isShareModalOpen && selectedProject) {
      loadExistingShares();
    }
  }, [isShareModalOpen, selectedProject?.id]);

  const handleCreateExternalShare = async () => {
    if (!selectedProject || !externalShareEmail.trim() || !currentTenant?.id) return;
    setIsCreatingShare(true);
    setExternalShareError(null);
    setExternalShareLink(null);
    try {
      const { data, error } = await supabase
        .from('project_shares')
        .insert({
          project_id: selectedProject.id,
          tenant_id: currentTenant.id,
          email: externalShareEmail.trim().toLowerCase(),
          role: externalShareRole,
          invited_by: currentUser?.id,
        })
        .select('token')
        .single();
      if (error) {
        if (error.code === '23505') {
          setExternalShareError('This person already has access to this project.');
        } else {
          throw error;
        }
        return;
      }
      const link = `${window.location.origin}/?shared_project=${data.token}`;
      setExternalShareLink(link);
      setExternalShareEmail('');
      await loadExistingShares();
      await logActivity({ action: 'shared externally', target: externalShareEmail.trim(), project_title: selectedProject.title, type: 'project_update', details: `Shared with role: ${externalShareRole}` });
    } catch (err: any) {
      setExternalShareError(err.message || 'Error creating share');
    } finally {
      setIsCreatingShare(false);
    }
  };

  const handleRevokeShare = async (shareId: string) => {
    const { error } = await supabase
      .from('project_shares')
      .update({ status: 'revoked' })
      .eq('id', shareId);
    if (error) { alert('Error revoking: ' + error.message); return; }
    await loadExistingShares();
  };

  const handleAddPhaseWithDates = async () => {
    if (!selectedProject || !newGroupName.trim()) return;
    const newGroup = { name: newGroupName.trim(), startDate: timelineNewStart || undefined, endDate: timelineNewEnd || undefined, tasks: [] };
    const updated = [...selectedProject.tasksGroups, newGroup];
    await updateProject(selectedProject.id, { tasksGroups: updated });
    setNewGroupName('');
    setTimelineNewStart('');
    setTimelineNewEnd('');
    await logActivity({ action: 'added phase', target: newGroup.name, project_title: selectedProject.title, type: 'project_update' });
  };

  const handleUpdatePhaseDate = async (phaseName: string, field: 'startDate' | 'endDate', value: string) => {
    if (!selectedProject) return;
    const updated = selectedProject.tasksGroups.map(g =>
      g.name === phaseName ? { ...g, [field]: value || undefined } : g
    );
    await updateProject(selectedProject.id, { tasksGroups: updated });
  };

  const handleDeletePhase = async (phaseName: string) => {
    if (!selectedProject) return;
    const updated = selectedProject.tasksGroups.filter(g => g.name !== phaseName);
    await updateProject(selectedProject.id, { tasksGroups: updated });
    await logActivity({ action: 'removed phase', target: phaseName, project_title: selectedProject.title, type: 'project_update' });
  };

  const handleCreateIncome = async () => {
    if (!selectedProject) return;
    setIsSubmittingFinance(true);
    try {
      await createIncome({
        project_id: selectedProject.id,
        client_id: selectedProject.client_id || null,
        client_name: selectedProject.clientName || selectedProject.client || '',
        project_name: selectedProject.title,
        concept: incomeFormData.concept.trim(),
        total_amount: Number(incomeFormData.amount),
        currency: incomeFormData.currency || selectedProject.currency || 'USD',
        num_installments: Math.max(1, parseInt(incomeFormData.installments) || 1),
        due_date: incomeFormData.dueDate || undefined,
        installment_dates: incomeFormData.installment_dates.length > 0 ? incomeFormData.installment_dates : undefined,
      });
      setShowIncomeForm(false);
      setIncomeFormData({ concept: '', amount: '', installments: '1', dueDate: new Date().toISOString().split('T')[0], currency: 'USD', installment_dates: [] });
    } catch (err) {
      errorLogger.error('Error creating income', err);
    } finally {
      setIsSubmittingFinance(false);
    }
  };

  const handleCreateExpense = async () => {
    if (!selectedProject) return;
    setIsSubmittingFinance(true);
    try {
      await createExpense({
        category: expenseFormData.category,
        concept: expenseFormData.concept.trim(),
        amount: Number(expenseFormData.amount),
        date: expenseFormData.date || new Date().toISOString().split('T')[0],
        project_id: selectedProject.id,
        project_name: selectedProject.title,
        vendor: '',
        recurring: false,
        status: 'paid',
      });
      setShowExpenseForm(false);
      setExpenseFormData({ concept: '', amount: '', category: 'Software', date: new Date().toISOString().split('T')[0] });
    } catch (err) {
      errorLogger.error('Error creating expense', err);
    } finally {
      setIsSubmittingFinance(false);
    }
  };

  const handleCreateTimeEntry = async () => {
    if (!selectedProject) return;
    setIsSubmittingFinance(true);
    try {
      await createTimeEntry({
        project_id: selectedProject.id,
        description: timeFormData.description.trim(),
        hours: Number(timeFormData.hours),
        date: timeFormData.date || new Date().toISOString().split('T')[0],
        hourly_rate: timeFormData.hourlyRate ? Number(timeFormData.hourlyRate) : null,
      });
      setShowTimeForm(false);
      setTimeFormData({ description: '', hours: '', date: new Date().toISOString().split('T')[0], hourlyRate: '' });
    } catch (err) {
      errorLogger.error('Error creating time entry', err);
    } finally {
      setIsSubmittingFinance(false);
    }
  };

  const handleDeleteExpenseEntry = async (id: string) => {
    try { await deleteExpense(id); } catch (err) { errorLogger.error('Error deleting expense', err); }
  };

  const handleDeleteTimeEntry = async (id: string) => {
    try { await deleteTimeEntry(id); } catch (err) { errorLogger.error('Error deleting time entry', err); }
  };

  /* ─── Tab definitions ─── */
  const tabDefs = [
    { id: 'overview', label: 'Overview', icon: Icons.Layers },
    { id: 'tasks', label: 'Tasks', icon: Icons.Check },
    { id: 'timeline', label: 'Timeline', icon: Icons.Clock },
    { id: 'files', label: 'Files', icon: Icons.File },
    { id: 'settings', label: 'Settings', icon: Icons.Settings },
  ];

  /* ─── Error state ─── */
  if (error) {
    return (
      <div className="flex flex-col h-[calc(100vh-100px)] pt-4 pb-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-2">Error loading projects</h2>
          <p className="text-red-700 dark:text-red-400 mb-4">{error}</p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium">
            Reload
          </button>
        </div>
      </div>
    );
  }

  /* ─── Loading state ─── */
  if (loading && !loadingTimedOut && projects.length === 0) {
    return (
      <div className="flex flex-col h-[calc(100vh-100px)] pt-4 pb-6">
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-zinc-200 dark:border-zinc-700 border-t-zinc-900 dark:border-t-zinc-100 mx-auto mb-4" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading projects...</p>
          </div>
        </div>
      </div>
    );
  }

  const clientCount = sidebarGroups.filter(g => g.category === 'client').length;
  const personalCount = sidebarGroups.filter(g => g.category === 'personal').reduce((a, g) => a + g.projects.length, 0);

  return (
    <div className="flex flex-col h-[calc(100vh-100px)]">
      {/* ── Client Preview Overlay ── */}
      {isClientPreviewMode && selectedProject && (
        <div className="fixed inset-0 z-50 animate-in fade-in overflow-auto">
          <div className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-between px-6 py-3 bg-zinc-900/90 backdrop-blur-sm border-b border-zinc-700">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-bold text-zinc-300 uppercase tracking-widest">Project View Preview</span>
              <span className="text-xs text-zinc-500 font-mono">— {selectedProject.title}</span>
            </div>
            <button onClick={() => setIsClientPreviewMode(false)}
              className="flex items-center gap-2 px-4 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 rounded-lg transition-colors">
              <Icons.Close size={14} /> Exit Preview
            </button>
          </div>
          <div className="pt-12">
            <ClientViewPreview project={selectedProject} tasks={projectTasks} derivedGroups={derivedTasksGroups} />
          </div>
        </div>
      )}

      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* ════════════════════════════════════════ */}
        {/*  SIDEBAR                                 */}
        {/* ════════════════════════════════════════ */}
        <div className="w-[280px] shrink-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex flex-col overflow-hidden">
          {/* Sidebar header */}
          <div className="px-4 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">Projects</h2>
              <button
                onClick={() => setIsCreating(!isCreating)}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 transition-colors"
              >
                <Icons.Plus size={14} />
              </button>
            </div>

            {/* New project form */}
            <AnimatePresence>
              {isCreating && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-2 pb-3">
                    <input
                      autoFocus
                      value={newProjectTitle}
                      onChange={e => setNewProjectTitle(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && newProjectTitle.trim()) handleCreateProject(); if (e.key === 'Escape') { setIsCreating(false); resetCreateForm(); } }}
                      placeholder="Project name..."
                      className="w-full px-2.5 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                    />
                    <select
                      value={newProjectClient}
                      onChange={e => setNewProjectClient(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600 text-zinc-900 dark:text-zinc-100"
                    >
                      <option value="">No client</option>
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>{c.name || c.company || c.email}</option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={newProjectDeadline}
                      onChange={e => setNewProjectDeadline(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600 text-zinc-900 dark:text-zinc-100"
                    />
                    <textarea
                      value={newProjectDesc}
                      onChange={e => setNewProjectDesc(e.target.value)}
                      placeholder="Description (optional)..."
                      rows={2}
                      className="w-full px-2.5 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 resize-none"
                    />
                    {createError && (
                      <p className="text-[10px] text-rose-500 px-0.5">{createError}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={handleCreateProject}
                        disabled={!newProjectTitle.trim() || isSubmittingProject}
                        className="flex-1 py-1.5 text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-1.5"
                      >
                        {isSubmittingProject ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Icons.Plus size={12} />}
                        Create
                      </button>
                      <button
                        onClick={() => { setIsCreating(false); resetCreateForm(); }}
                        className="px-2.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Category filter pills */}
            <div className="flex items-center gap-1">
              {([
                { id: 'all' as const, label: 'All', count: projects.length },
                { id: 'client' as const, label: 'Clients', count: clientCount },
                { id: 'personal' as const, label: 'Own', count: personalCount },
              ]).map(f => (
                <button
                  key={f.id}
                  onClick={() => setSidebarFilter(f.id)}
                  className={`px-2.5 py-1 text-[10px] font-semibold rounded-full transition-all duration-200 ${
                    sidebarFilter === f.id
                      ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                      : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {f.label}{f.count > 0 ? ` · ${f.count}` : ''}
                </button>
              ))}
            </div>
          </div>

          {/* Sidebar body */}
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
            {filteredGroups.length === 0 && (
              <div className="px-3 py-8 text-center">
                <div className="text-zinc-300 dark:text-zinc-600 mb-2"><Icons.Folder size={28} className="mx-auto" /></div>
                <p className="text-xs text-zinc-400">No projects in this category</p>
              </div>
            )}

            {filteredGroups.map(group => (
              <div key={group.id}>
                {/* Group header */}
                <div className="flex items-center gap-2 px-2 pt-3 pb-1.5">
                  {group.category === 'client' && group.clientAvatar ? (
                    <img src={group.clientAvatar} alt={group.label} className="w-4 h-4 rounded object-cover" />
                  ) : group.category === 'client' ? (
                    <div className="w-4 h-4 rounded bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-[7px] font-bold text-white">
                      {group.label.substring(0, 2).toUpperCase()}
                    </div>
                  ) : (
                    <div className="w-4 h-4 rounded bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                      <Icons.Star size={8} className="text-white" />
                    </div>
                  )}
                  <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider truncate">
                    {group.label}
                  </span>
                  <span className="text-[10px] text-zinc-300 dark:text-zinc-600 ml-auto">{group.projects.length}</span>
                </div>

                {/* Project cards */}
                {group.projects.map(p => {
                  const isSelected = selectedId === p.id;
                  return (
                    <motion.button
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      whileTap={{ scale: 0.98 }}
                      className={`w-full text-left px-3 py-2.5 rounded-xl transition-all duration-200 group ${
                        isSelected
                          ? 'bg-zinc-100 dark:bg-zinc-800/80'
                          : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                          style={{ backgroundColor: colorToBg(p.color || '#3b82f6', 0.12) }}
                        >
                          <ProgressRing progress={p.progress} size={22} stroke={2} color={p.color || '#3b82f6'} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`text-[13px] font-medium truncate transition-colors ${
                            isSelected ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-400'
                          }`}>
                            {p.title}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <StatusBadge status={p.status} />
                          </div>
                        </div>
                        <span className={`text-[10px] font-mono tabular-nums transition-colors ${
                          isSelected ? 'text-zinc-500 dark:text-zinc-400' : 'text-zinc-300 dark:text-zinc-600'
                        }`}>
                          {p.progress}%
                        </span>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* ════════════════════════════════════════ */}
        {/*  DETAIL PANEL                            */}
        {/* ════════════════════════════════════════ */}
        <div className="flex-1 flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
          {/* Header */}
          <div className="px-8 py-5 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-start shrink-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 mb-1.5">
                <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">{selectedProject ? `PRJ-${selectedProject.id.slice(0, 6)}` : '—'}</span>
                {selectedProject && <StatusBadge status={selectedProject.status} />}
              </div>
              <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 truncate">{selectedProject ? selectedProject.title : 'No project selected'}</h1>
              <div className="flex items-center gap-4 mt-1.5 text-xs text-zinc-400">
                {selectedProject && (
                  <>
                    {selectedClient ? (
                      <span className="flex items-center gap-1.5">
                        {selectedClient.avatar_url ? (
                          <img src={selectedClient.avatar_url} alt={selectedClient.name} className="w-4 h-4 rounded-full object-cover" />
                        ) : (
                          <Icons.Users size={12} />
                        )}
                        <span className="text-zinc-600 dark:text-zinc-300 font-medium">{selectedClient.name}</span>
                        {selectedClient.company && <span className="text-zinc-400">· {selectedClient.company}</span>}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-zinc-400">
                        <Icons.Star size={12} />
                        Own project
                      </span>
                    )}
                    <span className="flex items-center gap-1"><Icons.Calendar size={12} /> {new Date(selectedProject.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setIsShareModalOpen(true)}
                className="px-3 py-1.5 text-xs font-medium border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                Share
              </button>
              <button onClick={() => setIsClientPreviewMode(true)}
                className="px-3 py-1.5 text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors">
                Project View
              </button>
            </div>
          </div>

          {/* ── Share modal ── */}
          <AnimatePresence>
            {isShareModalOpen && selectedProject && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden border-b border-zinc-100 dark:border-zinc-800"
              >
                <div className="px-8 py-4">
                  <div className="max-w-lg p-5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Share Project</h3>
                      <button onClick={() => setIsShareModalOpen(false)} className="text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"><Icons.Close size={16} /></button>
                    </div>

                    {/* ── Portal Link (prominent) ── */}
                    <div className="mb-5">
                      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Project Link</div>
                      <PortalLinkSection project={selectedProject} />
                    </div>

                    <div className="border-t border-zinc-100 dark:border-zinc-800 my-4" />
                    <div className="mb-5">
                      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Invite Team Member</div>
                      <div className="flex items-center gap-2">
                        <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="team@company.com"
                          className="flex-1 px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm" />
                        <button onClick={handleInviteMember} className="px-3 py-2 text-sm bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg font-medium">Invite</button>
                      </div>
                      <p className="text-[10px] text-zinc-400 mt-1.5">The user must have an active account in the system.</p>
                    </div>
                    <div className="border-t border-zinc-100 dark:border-zinc-800 my-4" />
                    <div>
                      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Client Portal Access</div>
                      {selectedProject.client_id ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-200 dark:border-emerald-500/20 rounded-lg">
                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Client linked to this project</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={handleInviteClientPortal} disabled={isInvitingClient}
                              className="flex-1 px-3 py-2 text-sm bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg font-medium disabled:opacity-60">
                              {isInvitingClient ? 'Generating...' : 'Generate Invite Link'}
                            </button>
                            <button onClick={() => window.open(`/?portal=client&projectId=${selectedProject.id}`, '_blank')}
                              className="px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800">
                              Open Portal
                            </button>
                          </div>
                          <p className="text-[10px] text-zinc-400">The client will receive a link to register. Their access is private and secure.</p>
                          {clientInviteError && <p className="text-xs text-rose-600">{clientInviteError}</p>}
                          {clientInviteLink && (
                            <div className="p-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Invitation Link</span>
                                <button onClick={() => { navigator.clipboard.writeText(clientInviteLink); }}
                                  className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium hover:underline">Copy</button>
                              </div>
                              <p className="text-xs text-zinc-600 dark:text-zinc-300 break-all font-mono">{clientInviteLink}</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="p-3 bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 rounded-lg">
                          <p className="text-xs text-amber-700 dark:text-amber-400 font-medium mb-1">No client linked</p>
                          <p className="text-[10px] text-amber-600 dark:text-amber-500">Assign a client from Settings to enable the portal.</p>
                        </div>
                      )}
                    </div>

                    {/* ── External Sharing ── */}
                    <div className="border-t border-zinc-100 dark:border-zinc-800 my-4" />
                    <div>
                      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Share with External People</div>
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          value={externalShareEmail}
                          onChange={e => { setExternalShareEmail(e.target.value); setExternalShareError(null); }}
                          placeholder="person@email.com"
                          className="flex-1 px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm"
                        />
                        <select
                          value={externalShareRole}
                          onChange={e => setExternalShareRole(e.target.value as any)}
                          className="px-2 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs"
                        >
                          <option value="viewer">Viewer</option>
                          <option value="collaborator">Collaborator</option>
                          <option value="editor">Editor</option>
                        </select>
                        <button
                          onClick={handleCreateExternalShare}
                          disabled={isCreatingShare || !externalShareEmail.trim()}
                          className="px-3 py-2 text-sm bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg font-medium disabled:opacity-50"
                        >
                          {isCreatingShare ? '...' : 'Share'}
                        </button>
                      </div>
                      <p className="text-[10px] text-zinc-400 mb-2">The person will receive a link to create an account and view the project.</p>
                      {externalShareError && <p className="text-xs text-rose-600 mb-2">{externalShareError}</p>}
                      {externalShareLink && (
                        <div className="p-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg mb-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Share Link</span>
                            <button onClick={() => { navigator.clipboard.writeText(externalShareLink); }} className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium hover:underline">Copy</button>
                          </div>
                          <p className="text-xs text-zinc-600 dark:text-zinc-300 break-all font-mono">{externalShareLink}</p>
                        </div>
                      )}
                      {/* Existing shares list */}
                      {existingShares.length > 0 && (
                        <div className="space-y-1.5 mt-3">
                          <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Active Shares</div>
                          {existingShares.map(share => (
                            <div key={share.id} className="flex items-center justify-between p-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-lg">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-[10px] font-bold text-zinc-500 dark:text-zinc-400 shrink-0">
                                  {share.email?.[0]?.toUpperCase() || '?'}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs text-zinc-700 dark:text-zinc-300 truncate">{share.email}</p>
                                  <p className="text-[10px] text-zinc-400">{share.role} · {share.status}</p>
                                </div>
                              </div>
                              <button
                                onClick={() => handleRevokeShare(share.id)}
                                className="text-[10px] text-rose-500 hover:text-rose-600 font-medium shrink-0 ml-2"
                              >
                                Revoke
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Tab Bar ── */}
          <div className="px-8 py-3 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
            <TabBar tabs={tabDefs} active={activeTab} onChange={setActiveTab} />
          </div>

          {/* ── Tab Content ── */}
          <div className="flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="p-8"
              >
                {/* ── Overview Tab ── */}
                {activeTab === 'overview' && selectedProject && (
                  <OverviewTab
                    project={selectedProject}
                    selectedClient={clients.find(c => c.id === selectedProject.client_id) || null}
                    clients={clients}
                    members={members}
                    derivedTasksGroups={derivedTasksGroups}
                    projectFinancials={projectFinancials}
                    onUpdateProject={handleUpdateProject}
                    onToggleTask={handleToggleTask}
                    onSetActiveTab={setActiveTab}
                    onSetExpandedTaskId={setExpandedTaskId}
                    showIncomeForm={showIncomeForm}
                    showExpenseForm={showExpenseForm}
                    onShowIncomeForm={setShowIncomeForm}
                    onShowExpenseForm={setShowExpenseForm}
                    incomeFormData={incomeFormData}
                    expenseFormData={expenseFormData}
                    onIncomeFormChange={setIncomeFormData}
                    onExpenseFormChange={setExpenseFormData}
                    isSubmittingFinance={isSubmittingFinance}
                    onCreateIncome={handleCreateIncome}
                    onCreateExpense={handleCreateExpense}
                    onUpdateInstallment={updateInstallment}
                    onDeleteIncome={deleteIncome}
                    errorLogger={errorLogger}
                    showTimeForm={showTimeForm}
                    onShowTimeForm={setShowTimeForm}
                    timeFormData={timeFormData}
                    onTimeFormChange={setTimeFormData}
                    onCreateTimeEntry={handleCreateTimeEntry}
                    onDeleteTimeEntry={handleDeleteTimeEntry}
                    onDeleteExpense={handleDeleteExpenseEntry}
                  />
                )}

                {/* ── Tasks Tab ── */}
                {activeTab === 'tasks' && selectedProject && (
                  <TasksTab
                    project={selectedProject}
                    projectTasks={projectTasks}
                    derivedTasksGroups={derivedTasksGroups}
                    getSubtasksFor={getSubtasksFor}
                    onToggleTask={handleToggleTask}
                    onDeleteTask={handleDeleteTask}
                    onAddTask={handleAddTask}
                    newTaskTitle={newTaskTitle}
                    onNewTaskTitleChange={setNewTaskTitle}
                    quickTaskTitle={quickTaskTitle}
                    onQuickTaskTitleChange={setQuickTaskTitle}
                    onQuickTask={handleQuickTask}
                    expandedTaskId={expandedTaskId}
                    onSetExpandedTaskId={setExpandedTaskId}
                    newSubtaskTitle={newSubtaskTitle}
                    onNewSubtaskTitleChange={setNewSubtaskTitle}
                    onAddSubtask={handleAddSubtask}
                    onToggleSubtask={handleToggleSubtask}
                    onDeleteSubtask={handleDeleteSubtask}
                    newGroupName={newGroupName}
                    onNewGroupNameChange={setNewGroupName}
                    onAddGroup={handleAddGroup}
                    onDeletePhase={handleDeletePhase}
                    onUpdatePhaseDate={handleUpdatePhaseDate}
                    onUpdateTaskDate={handleUpdateTaskDate}
                    taskPayments={taskPayments}
                    aiPrompt={aiPrompt}
                    onAiPromptChange={setAiPrompt}
                    aiGenerating={aiGenerating}
                    aiPreview={aiPreview}
                    onAiPreviewChange={setAiPreview}
                    aiError={aiError}
                    onAiGenerate={handleAiGenerate}
                    onAiAccept={handleAiAccept}
                    onAiDiscard={() => { setAiPreview(null); setAiPrompt(''); }}
                    taskError={taskError}
                  />
                )}

                {/* ── Timeline Tab ── */}
                {activeTab === 'timeline' && selectedProject && (
                  <TimelineTab
                    project={selectedProject}
                    derivedTasksGroups={derivedTasksGroups}
                    members={members}
                    newGroupName={newGroupName}
                    onNewGroupNameChange={setNewGroupName}
                    timelineNewStart={timelineNewStart}
                    onTimelineNewStartChange={setTimelineNewStart}
                    timelineNewEnd={timelineNewEnd}
                    onTimelineNewEndChange={setTimelineNewEnd}
                    onAddPhaseWithDates={handleAddPhaseWithDates}
                    onUpdatePhaseDate={handleUpdatePhaseDate}
                    onDeletePhase={handleDeletePhase}
                    onToggleTask={handleToggleTask}
                    onAddTask={handleAddTask}
                    newTaskTitle={newTaskTitle}
                    onNewTaskTitleChange={setNewTaskTitle}
                  />
                )}

                {/* ── Files Tab ── */}
                {activeTab === 'files' && selectedProject && (
                  <FilesTab
                    project={selectedProject}
                    onUpdateProject={updateProject}
                  />
                )}

                {/* ── Settings Tab ── */}
                {activeTab === 'settings' && selectedProject && (
                  <SettingsTab
                    project={selectedProject}
                    clients={clients}
                    members={members}
                    onUpdateProject={handleUpdateProject}
                    onDeleteProject={async () => {
                      if (!confirm('Are you sure you want to delete this project? This cannot be undone.')) return;
                      try {
                        await deleteProject(selectedProject.id);
                        setSelectedId(null);
                      } catch (err: any) { alert('Error deleting project: ' + (err?.message || 'Unknown error')); }
                    }}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};
