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
import type { DashboardData, Milestone, LogEntry } from '../components/portal/livv-client view-control/types';

import { useTeam } from '../context/TeamContext';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from '../context/TenantContext';
import { useFinance } from '../context/FinanceContext';

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
const ProgressRing = ({ progress, size = 28, stroke = 2.5 }: { progress: number; size?: number; stroke?: number }) => {
  const radius = (size - stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke}
        className="stroke-zinc-100 dark:stroke-zinc-800" />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke}
        strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
        className={progress === 100 ? 'stroke-emerald-500' : 'stroke-zinc-900 dark:stroke-zinc-300'}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
    </svg>
  );
};

/* ─── Client View Preview ─── */
const ClientViewPreview: React.FC<{
  project: Project;
  tasks: any[];
  derivedGroups: { name: string; tasks: any[] }[];
}> = ({ project, tasks, derivedGroups }) => {
  const dashboardData = useMemo<DashboardData>(() => {
    const totalTasks = tasks.length || 1;
    const completedTasks = tasks.filter((t: any) => t.completed).length;
    const progress = project.progress || Math.min(100, Math.round((completedTasks / totalTasks) * 100));
    const startDate = project.updatedAt
      ? new Date(project.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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
      budget: { total: project.budget || 0, paid: 0 },
      milestones: milestones.length ? milestones : [
        { id: 'default', title: 'Project kickoff', description: 'Initial project setup.', status: 'current' as const }
      ],
      logs: logs.length ? logs : [
        { id: 'default', timestamp: 'Now', message: 'Portal connected — no activity yet.' }
      ],
      assets,
      credentials: [],
    };
  }, [project, tasks, derivedGroups]);

  return (
    <PortalApp
      initialData={dashboardData}
      projectTitle={project.title}
      projectSubtitle={`${project.status} — ${project.client}`}
      forceOnboarded
      disableLoading
      hideCreatorToggle
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
export const Projects: React.FC = () => {
  const { projects, loading, error, createProject, updateProject, deleteProject } = useProjects();
  const { clients } = useClients();
  const { members } = useTeam();
  const { user: currentUser } = useAuth();
  const { currentTenant } = useTenant();
  const { incomes, expenses, createIncome } = useFinance();
  const { data: syncedTasks, add: addSyncedTask, update: updateSyncedTask, remove: removeSyncedTask, refresh: refreshTasks } = useSupabase<any>('tasks', {
    enabled: true,
    subscribe: true,
    select: 'id,title,completed,project_id,due_date,assignee_id,priority,group_name'
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
    errorLogger.log('Projects component montado', { loading, error, projectsCount: projects?.length });
  }, [loading, error, projects?.length]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const [sidebarFilter, setSidebarFilter] = useState<'all' | 'client' | 'personal'>('all');
  const [timelineNewStart, setTimelineNewStart] = useState('');
  const [timelineNewEnd, setTimelineNewEnd] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiPreview, setAiPreview] = useState<{ phases: { name: string; tasks: { title: string; priority: string }[] }[] } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const selectedProject = projects.find(p => p.id === selectedId) || projects[0];
  const projectTasks = selectedProject
    ? syncedTasks.filter((task: any) => (task.project_id || task.projectId) === selectedProject.id)
    : [];

  /* ─── Derive phase groups ─── */
  const derivedTasksGroups = useMemo(() => {
    const groupMap = new Map<string, { name: string; tasks: any[] }>();
    for (const task of projectTasks) {
      const gName = task.group_name || 'General';
      if (!groupMap.has(gName)) groupMap.set(gName, { name: gName, tasks: [] });
      groupMap.get(gName)!.tasks.push({
        id: task.id, title: task.title, done: !!task.completed,
        assignee: task.assignee_id || '', dueDate: task.due_date || undefined,
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
        label: 'Proyectos propios',
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
    if (!selectedProject) return { totalIncome: 0, totalCollected: 0, totalExpenses: 0, profit: 0, pendingAmount: 0, incomeEntries: [] as typeof incomes, expenseEntries: [] as typeof expenses };
    const incomeEntries = incomes.filter(i => i.project_id === selectedProject.id);
    const expenseEntries = expenses.filter(e => e.project_id === selectedProject.id);
    const totalIncome = incomeEntries.reduce((sum, i) => sum + i.total_amount, 0);
    const totalCollected = incomeEntries.reduce((sum, i) => {
      const paid = (i.installments || []).filter(inst => inst.status === 'paid').reduce((s, inst) => s + inst.amount, 0);
      return sum + paid;
    }, 0);
    const totalExpenses = expenseEntries.reduce((sum, e) => sum + e.amount, 0);
    const profit = totalCollected - totalExpenses;
    const pendingAmount = totalIncome - totalCollected;
    return { totalIncome, totalCollected, totalExpenses, profit, pendingAmount, incomeEntries, expenseEntries };
  }, [selectedProject, incomes, expenses]);

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
      errorLogger.log('Creando nuevo proyecto', { title: newProjectTitle });

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
        deadline: newProjectDeadline || new Date().toISOString().slice(0, 10),
        nextSteps: 'Kick-off',
        tags: [],
        team: [],
        tasksGroups: [],
        files: [],
        activity: [],
        color: '#3b82f6',
      });
      errorLogger.log('Proyecto creado exitosamente');
      await logActivity({
        action: 'created project', target: newProject.title,
        project_title: newProject.title, type: 'project_created', details: 'New project added'
      });
      resetCreateForm();
      setIsCreating(false);
      setSelectedId(newProject.id);
    } catch (err: any) {
      errorLogger.error('Error creando proyecto', err);
      setCreateError(err?.message || 'Error al crear el proyecto.');
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
      errorLogger.log('Actualizando proyecto', { id: selectedProject.id, updates });
      if (!selectedProject) return;
      const updatedProject = await updateProject(selectedProject.id, updates);
      errorLogger.log('Proyecto actualizado exitosamente');
      await logActivity({
        action: 'updated project', target: updatedProject.title,
        project_title: updatedProject.title, type: 'status_change', details: 'Project settings updated'
      });
    } catch (err) {
      errorLogger.error('Error actualizando proyecto', err);
      alert('Error al actualizar el proyecto. Por favor intenta de nuevo.');
    }
  };

  useEffect(() => {
    if (!selectedId && projects.length) {
      errorLogger.log('Seleccionando primer proyecto por defecto');
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

  const handleAddTask = async (groupIdx: number) => {
    if (!selectedProject) return;
    const title = newTaskTitle[groupIdx]?.trim();
    if (!title) return;
    const groupName = derivedTasksGroups[groupIdx]?.name || 'General';
    setTaskError(null);
    try {
      await addSyncedTask({ title, completed: false, project_id: selectedProject.id, assignee_id: currentUser?.id || null, priority: 'medium', group_name: groupName } as any);
      setNewTaskTitle(prev => ({ ...prev, [groupIdx]: '' }));
      // Safety net: refresh tasks after a short delay in case realtime doesn't fire
      setTimeout(() => refreshTasks(), 1000);
      await logActivity({ action: 'added task', target: title, project_title: selectedProject.title, type: 'project_update' });
    } catch (err: any) {
      errorLogger.error('Error creando tarea', err);
      setTaskError(err?.message || 'Error al crear tarea');
      setTimeout(() => setTaskError(null), 5000);
    }
  };

  const handleToggleTask = async (groupIdx: number, taskId: string) => {
    if (!selectedProject) return;
    const task = derivedTasksGroups[groupIdx]?.tasks.find((t: any) => t.id === taskId);
    if (!task) return;
    const newDone = !task.done;
    try {
      await updateSyncedTask(taskId, { completed: newDone } as any);
      setTimeout(() => refreshTasks(), 800);
      await logActivity({ action: newDone ? 'completed task' : 'reopened task', target: task.title, project_title: selectedProject.title, type: 'task_completed' });
    } catch (err: any) {
      errorLogger.error('Error actualizando tarea', err);
      alert('Error al actualizar tarea: ' + (err?.message || 'Error desconocido'));
    }
  };

  const handleDeleteTask = async (taskId: string, taskTitle: string) => {
    if (!selectedProject) return;
    try {
      await removeSyncedTask(taskId);
      setTimeout(() => refreshTasks(), 500);
      await logActivity({ action: 'deleted task', target: taskTitle, project_title: selectedProject.title, type: 'project_update' });
    } catch (err: any) {
      errorLogger.error('Error eliminando tarea', err);
    }
  };

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
      if (!json.result?.phases?.length) throw new Error('No se generaron tareas');
      setAiPreview(json.result);
    } catch (err: any) {
      setAiError(err.message || 'Error generando tareas con AI');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleAiAccept = async () => {
    if (!aiPreview || !selectedProject) return;
    setAiGenerating(true);
    try {
      // Create phases that don't exist yet
      const existingPhaseNames = new Set(selectedProject.tasksGroups.map(g => g.name));
      const newPhases = aiPreview.phases
        .filter(p => !existingPhaseNames.has(p.name))
        .map(p => ({ name: p.name, tasks: [] }));
      if (newPhases.length > 0) {
        await updateProject(selectedProject.id, { tasksGroups: [...selectedProject.tasksGroups, ...newPhases] });
      }

      // Insert all tasks in parallel
      const taskInserts = aiPreview.phases.flatMap(phase =>
        phase.tasks.map(task => addSyncedTask({
          title: task.title,
          completed: false,
          project_id: selectedProject.id,
          assignee_id: currentUser?.id || null,
          priority: task.priority || 'medium',
          group_name: phase.name,
        } as any))
      );
      await Promise.all(taskInserts);
      setTimeout(() => refreshTasks(), 1000);

      const totalTasks = aiPreview.phases.reduce((sum, p) => sum + p.tasks.length, 0);
      await logActivity({ action: 'generated tasks with AI', target: `${totalTasks} tasks in ${aiPreview.phases.length} phases`, project_title: selectedProject.title, type: 'project_update' });

      setAiPreview(null);
      setAiPrompt('');
    } catch (err: any) {
      errorLogger.error('Error saving AI tasks', err);
      setAiError(err.message || 'Error guardando tareas');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleInviteMember = async () => {
    if (!selectedProject || !inviteEmail.trim()) return;
    const { data: profiles, error: profileErr } = await supabase.from('profiles').select('user_id,email').eq('email', inviteEmail.trim()).limit(1);
    if (profileErr) { alert('Error buscando usuario: ' + profileErr.message); return; }
    if (!profiles || profiles.length === 0) { alert('No existe un usuario con ese email. Pídeles que inicien sesión al menos una vez.'); return; }
    const memberId = profiles[0].user_id;
    const { error: insertErr } = await supabase.from('project_members').insert({ project_id: selectedProject.id, member_id: memberId });
    if (insertErr) { alert('Error invitando: ' + insertErr.message); return; }
    setInviteEmail('');
    setIsShareModalOpen(false);
    await logActivity({ action: 'invited', target: inviteEmail.trim(), project_title: selectedProject.title, type: 'project_update', details: 'Member added to project' });
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
          <h2 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-2">Error al cargar proyectos</h2>
          <p className="text-red-700 dark:text-red-400 mb-4">{error}</p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium">
            Recargar
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
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Cargando proyectos...</p>
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
              <span className="text-xs font-bold text-zinc-300 uppercase tracking-widest">Client View Preview</span>
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
                      placeholder="Nombre del proyecto..."
                      className="w-full px-2.5 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                    />
                    <select
                      value={newProjectClient}
                      onChange={e => setNewProjectClient(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600 text-zinc-900 dark:text-zinc-100"
                    >
                      <option value="">Sin cliente</option>
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
                      placeholder="Descripción (opcional)..."
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
                        Crear
                      </button>
                      <button
                        onClick={() => { setIsCreating(false); resetCreateForm(); }}
                        className="px-2.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Category filter pills */}
            <div className="flex items-center gap-1">
              {([
                { id: 'all' as const, label: 'Todos', count: projects.length },
                { id: 'client' as const, label: 'Clientes', count: clientCount },
                { id: 'personal' as const, label: 'Propios', count: personalCount },
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
                <p className="text-xs text-zinc-400">No hay proyectos en esta categoría</p>
              </div>
            )}

            {filteredGroups.map(group => (
              <div key={group.id}>
                {/* Group header */}
                <div className="flex items-center gap-2 px-2 pt-3 pb-1.5">
                  {group.category === 'client' && group.clientAvatar ? (
                    <img src={group.clientAvatar} alt={group.label} className="w-4 h-4 rounded-full object-cover" />
                  ) : group.category === 'client' ? (
                    <div className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-[7px] font-bold text-white">
                      {group.label.substring(0, 2).toUpperCase()}
                    </div>
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
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
                        <ProgressRing progress={p.progress} size={26} stroke={2} />
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
              <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 truncate">{selectedProject ? selectedProject.title : 'Sin proyecto seleccionado'}</h1>
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
                        Proyecto propio
                      </span>
                    )}
                    <span className="flex items-center gap-1"><Icons.Calendar size={12} /> {selectedProject.deadline}</span>
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
                Client View
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
                    <div className="mb-5">
                      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Invite Team Member</div>
                      <div className="flex items-center gap-2">
                        <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="team@company.com"
                          className="flex-1 px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm" />
                        <button onClick={handleInviteMember} className="px-3 py-2 text-sm bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg font-medium">Invite</button>
                      </div>
                      <p className="text-[10px] text-zinc-400 mt-1.5">El usuario debe tener cuenta activa en el sistema.</p>
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
                          <p className="text-[10px] text-zinc-400">El cliente recibirá un link para registrarse. Su acceso es privado y protegido.</p>
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
                          <p className="text-[10px] text-amber-600 dark:text-amber-500">Asigná un cliente desde Settings para habilitar el portal.</p>
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
                  <div className="grid grid-cols-3 gap-6">
                    <div className="col-span-2 space-y-6">
                      {/* Description (editable) */}
                      <div className="p-5 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
                        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Description</h3>
                        <textarea
                          rows={3}
                          value={selectedProject.description}
                          onChange={e => handleUpdateProject({ description: e.target.value })}
                          placeholder="Add a project description..."
                          className="w-full text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed bg-transparent resize-none focus:outline-none focus:ring-1 focus:ring-zinc-200 dark:focus:ring-zinc-700 rounded-lg px-2 py-1 -mx-2 -my-1"
                        />
                      </div>
                      {/* Stats */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
                          <div className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider mb-2">Progress</div>
                          <div className="flex items-end gap-3">
                            <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">{selectedProject.progress}%</span>
                            <div className="flex-1 mb-1.5">
                              <div className="w-full bg-zinc-200/60 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
                                <motion.div
                                  className={`h-full rounded-full ${selectedProject.progress === 100 ? 'bg-emerald-500' : 'bg-zinc-900 dark:bg-zinc-200'}`}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${selectedProject.progress}%` }}
                                  transition={{ duration: 0.8, ease: 'easeOut' }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="p-4 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
                          <div className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider mb-2">Tasks Open</div>
                          <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-1 tabular-nums">
                            {derivedTasksGroups.flatMap(g => g.tasks).filter((t: any) => !t.done).length}
                          </div>
                          <div className="text-[11px] text-zinc-400">Across {derivedTasksGroups.length} phases</div>
                        </div>
                      </div>
                      {/* Financial Summary */}
                      <div className="p-5 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Finances</h3>
                          {selectedProject.budget > 0 && (
                            <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                              Budget: {selectedProject.currency} {selectedProject.budget.toLocaleString()}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-4 gap-3 mb-4">
                          <div>
                            <div className="text-[10px] text-zinc-400 font-medium mb-0.5">Facturado</div>
                            <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                              ${projectFinancials.totalIncome.toLocaleString()}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-zinc-400 font-medium mb-0.5">Cobrado</div>
                            <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                              ${projectFinancials.totalCollected.toLocaleString()}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-zinc-400 font-medium mb-0.5">Gastos</div>
                            <div className="text-lg font-bold text-red-500 dark:text-red-400 tabular-nums">
                              ${projectFinancials.totalExpenses.toLocaleString()}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-zinc-400 font-medium mb-0.5">Ganancia</div>
                            <div className={`text-lg font-bold tabular-nums ${projectFinancials.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                              ${projectFinancials.profit.toLocaleString()}
                            </div>
                          </div>
                        </div>

                        {/* Collection progress bar */}
                        {projectFinancials.totalIncome > 0 && (
                          <div className="mb-4">
                            <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1">
                              <span>Avance de cobro</span>
                              <span className="tabular-nums">{Math.round((projectFinancials.totalCollected / projectFinancials.totalIncome) * 100)}%</span>
                            </div>
                            <div className="w-full bg-zinc-200/60 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                                style={{ width: `${Math.min(100, (projectFinancials.totalCollected / projectFinancials.totalIncome) * 100)}%` }}
                              />
                            </div>
                            {projectFinancials.pendingAmount > 0 && (
                              <div className="text-[10px] text-amber-500 font-medium mt-1">
                                ${projectFinancials.pendingAmount.toLocaleString()} pendiente de cobro
                              </div>
                            )}
                          </div>
                        )}

                        {/* Recent income entries */}
                        {projectFinancials.incomeEntries.length > 0 && (
                          <div className="space-y-1.5 mb-3">
                            {projectFinancials.incomeEntries.slice(0, 3).map(inc => (
                              <div key={inc.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-zinc-100/50 dark:hover:bg-zinc-800/30">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                    inc.status === 'paid' ? 'bg-emerald-500' : inc.status === 'overdue' ? 'bg-red-500' : 'bg-amber-500'
                                  }`} />
                                  <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate">{inc.concept || inc.client_name}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                                    inc.status === 'paid' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                                      : inc.status === 'overdue' ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'
                                      : 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400'
                                  }`}>{inc.status}</span>
                                  <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">${inc.total_amount.toLocaleString()}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Budget input (if no budget set) + Add income */}
                        <div className="flex items-center gap-2">
                          {!selectedProject.budget && (
                            <div className="flex-1 flex items-center gap-2">
                              <input
                                type="number"
                                placeholder="Budget del proyecto..."
                                className="flex-1 px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600"
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    const val = parseFloat((e.target as HTMLInputElement).value);
                                    if (val > 0) {
                                      handleUpdateProject({ budget: val });
                                      (e.target as HTMLInputElement).value = '';
                                    }
                                  }
                                }}
                              />
                            </div>
                          )}
                          <button
                            onClick={async () => {
                              if (!selectedProject) return;
                              const concept = prompt('Concepto de la factura:');
                              if (!concept) return;
                              const amountStr = prompt('Monto total:');
                              if (!amountStr) return;
                              const amount = parseFloat(amountStr);
                              if (isNaN(amount) || amount <= 0) return;
                              const installmentsStr = prompt('Cantidad de cuotas (1 = pago único):', '1');
                              const numInstallments = parseInt(installmentsStr || '1') || 1;
                              try {
                                await createIncome({
                                  project_id: selectedProject.id,
                                  client_id: selectedProject.client_id || null,
                                  client_name: selectedProject.clientName || selectedProject.client || '',
                                  project_name: selectedProject.title,
                                  concept,
                                  total_amount: amount,
                                  currency: selectedProject.currency || 'USD',
                                  num_installments: numInstallments,
                                });
                              } catch (err) {
                                errorLogger.error('Error creating income', err);
                              }
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors"
                          >
                            <Icons.Plus size={12} />
                            Agregar ingreso
                          </button>
                        </div>
                      </div>

                      {/* Client info card (if linked) */}
                      {selectedClient && (
                        <div className="p-4 bg-blue-50/50 dark:bg-blue-500/5 rounded-xl border border-blue-100 dark:border-blue-500/10 flex items-center gap-4">
                          {selectedClient.avatar_url ? (
                            <img src={selectedClient.avatar_url} alt={selectedClient.name} className="w-10 h-10 rounded-full object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-sm font-bold text-white">
                              {selectedClient.name.substring(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{selectedClient.name}</div>
                            <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                              {[selectedClient.company, selectedClient.email].filter(Boolean).join(' · ')}
                            </div>
                          </div>
                          <div className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            selectedClient.status === 'active' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                              : selectedClient.status === 'prospect' ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400'
                              : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                          }`}>
                            {selectedClient.status}
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Right column */}
                    <div className="col-span-1 space-y-6">
                      {/* Team */}
                      <div className="p-5 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
                        <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-4">Team</h3>
                        <div className="flex flex-col gap-3">
                          {selectedProject.team.map(userId => {
                            const member = members.find(m => m.id === userId);
                            if (!member) return null;
                            return (
                              <div key={member.id} className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-xs font-bold text-white overflow-hidden">
                                  {member.avatar_url ? (
                                    <img src={member.avatar_url} alt={member.name || ''} className="w-full h-full object-cover" />
                                  ) : (
                                    (member.name || member.email).substring(0, 2).toUpperCase()
                                  )}
                                </div>
                                <div className="overflow-hidden">
                                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{member.name || member.email}</div>
                                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400">{member.role}</div>
                                </div>
                              </div>
                            );
                          })}
                          {selectedProject.team.length === 0 && (
                            <p className="text-xs text-zinc-400">No team members assigned yet.</p>
                          )}
                        </div>
                      </div>

                      {/* Tags */}
                      {selectedProject.tags.length > 0 && (
                        <div className="p-5 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
                          <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-3">Tags</h3>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedProject.tags.map((tag, i) => (
                              <span key={i} className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-[11px] font-medium rounded-full">{tag}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Deadline */}
                      <div className="p-5 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
                        <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-3">Deadline</h3>
                        <div className="flex items-center gap-2">
                          <Icons.Calendar size={14} className="text-zinc-400" />
                          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {selectedProject.deadline ? new Date(selectedProject.deadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Not set'}
                          </span>
                        </div>
                        {selectedProject.deadline && (() => {
                          const deadlineDate = new Date(selectedProject.deadline);
                          const now = new Date();
                          const daysLeft = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                          return (
                            <div className={`mt-2 text-xs font-medium ${daysLeft < 0 ? 'text-red-500' : daysLeft <= 7 ? 'text-amber-500' : 'text-zinc-400'}`}>
                              {daysLeft < 0 ? `${Math.abs(daysLeft)} days overdue` : daysLeft === 0 ? 'Due today' : `${daysLeft} days remaining`}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Recent Activity */}
                      {selectedProject.activity.length > 0 && (
                        <div className="p-5 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
                          <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-3">Recent Activity</h3>
                          <div className="space-y-2.5">
                            {selectedProject.activity.slice(0, 5).map((a, i) => (
                              <div key={i} className="flex items-start gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600 mt-1.5 shrink-0" />
                                <div>
                                  <div className="text-xs text-zinc-700 dark:text-zinc-300">{a.text}</div>
                                  <div className="text-[10px] text-zinc-400">{a.date ? new Date(a.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''} {a.user && `· ${a.user}`}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Tasks Tab ── */}
                {activeTab === 'tasks' && selectedProject && (
                  <div className="space-y-6">

                    {/* ── AI Task Generator ── */}
                    <div className="rounded-xl border border-violet-100 dark:border-violet-900/30 bg-gradient-to-br from-violet-50/50 to-white dark:from-violet-950/20 dark:to-zinc-950 overflow-hidden">
                      <div className="px-5 py-3.5 flex items-center gap-2 border-b border-violet-100/50 dark:border-violet-900/20">
                        <Icons.Sparkles size={14} className="text-violet-500" />
                        <span className="text-xs font-bold text-violet-700 dark:text-violet-400 uppercase tracking-wider">AI Task Generator</span>
                      </div>
                      <div className="p-5 space-y-3">
                        <textarea
                          value={aiPrompt}
                          onChange={e => setAiPrompt(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleAiGenerate(); } }}
                          placeholder="Describe el trabajo a realizar y la AI lo dividirá en fases y tareas..."
                          rows={2}
                          className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 dark:focus:ring-violet-800 resize-none placeholder:text-zinc-400 text-zinc-800 dark:text-zinc-200"
                        />
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-zinc-400">Ctrl+Enter para generar</span>
                          <button
                            onClick={handleAiGenerate}
                            disabled={aiGenerating || !aiPrompt.trim()}
                            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                          >
                            {aiGenerating ? (
                              <><Icons.Loader size={13} className="animate-spin" /> Generando...</>
                            ) : (
                              <><Icons.Sparkles size={13} /> Generar tareas</>
                            )}
                          </button>
                        </div>
                        {aiError && (
                          <div className="flex items-center gap-2 text-xs text-red-500 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded-lg">
                            <Icons.AlertCircle size={13} /> {aiError}
                          </div>
                        )}
                      </div>

                      {/* AI Preview */}
                      {aiPreview && (
                        <div className="border-t border-violet-100/50 dark:border-violet-900/20">
                          <div className="px-5 py-3 flex items-center justify-between bg-violet-50/50 dark:bg-violet-950/10">
                            <span className="text-xs font-semibold text-violet-700 dark:text-violet-400">
                              {aiPreview.phases.reduce((s, p) => s + p.tasks.length, 0)} tareas en {aiPreview.phases.length} fases
                            </span>
                            <div className="flex items-center gap-2">
                              <button onClick={() => { setAiPreview(null); setAiPrompt(''); }} className="px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors">
                                Descartar
                              </button>
                              <button
                                onClick={handleAiAccept}
                                disabled={aiGenerating}
                                className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-all disabled:opacity-50 active:scale-95"
                              >
                                {aiGenerating ? <Icons.Loader size={12} className="animate-spin" /> : <Icons.Check size={12} />}
                                Aceptar y crear
                              </button>
                            </div>
                          </div>
                          <div className="p-5 space-y-4 max-h-80 overflow-y-auto">
                            {aiPreview.phases.map((phase, pIdx) => (
                              <div key={pIdx}>
                                <div className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">{phase.name}</div>
                                <div className="space-y-1">
                                  {phase.tasks.map((task, tIdx) => (
                                    <div key={tIdx} className="flex items-center gap-3 px-3 py-2 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-100 dark:border-zinc-800">
                                      <div className="w-4 h-4 rounded-full border-2 border-zinc-200 dark:border-zinc-700 shrink-0" />
                                      <span className="text-sm text-zinc-800 dark:text-zinc-200 flex-1">{task.title}</span>
                                      <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize font-medium ${
                                        task.priority === 'high' ? 'bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400'
                                          : task.priority === 'medium' ? 'bg-amber-50 text-amber-500 dark:bg-amber-500/10 dark:text-amber-400'
                                          : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                                      }`}>{task.priority}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ── Error banner ── */}
                    {taskError && (
                      <div className="px-4 py-2 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl text-xs text-rose-600 dark:text-rose-400">
                        {taskError}
                      </div>
                    )}

                    {/* ── Summary bar ── */}
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{projectTasks.length} tareas</span>
                        {projectTasks.length > 0 && (
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                                style={{ width: `${projectTasks.length ? Math.round(projectTasks.filter((t: any) => t.completed).length / projectTasks.length * 100) : 0}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-zinc-400 tabular-nums">
                              {projectTasks.filter((t: any) => t.completed).length}/{projectTasks.length}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ── Phase groups ── */}
                    {derivedTasksGroups.map((group: any, gIdx: number) => {
                      const doneCount = group.tasks.filter((t: any) => t.done).length;
                      const totalCount = group.tasks.length;
                      const phasePct = totalCount ? Math.round(doneCount / totalCount * 100) : 0;
                      return (
                        <div key={gIdx} className="rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 overflow-hidden shadow-sm">
                          {/* Phase header */}
                          <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-950/30">
                            <div className="flex items-center gap-3">
                              <div className={`w-2 h-2 rounded-full ${phasePct === 100 && totalCount > 0 ? 'bg-emerald-500' : phasePct > 0 ? 'bg-amber-400' : 'bg-zinc-300 dark:bg-zinc-600'}`} />
                              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{group.name}</h3>
                              {totalCount > 0 && (
                                <span className="text-[10px] text-zinc-400 tabular-nums bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">{doneCount}/{totalCount}</span>
                              )}
                            </div>
                            <button
                              onClick={() => handleDeletePhase(group.name)}
                              className="p-1 text-zinc-300 dark:text-zinc-600 hover:text-red-400 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                              title="Delete phase"
                            >
                              <Icons.X size={14} />
                            </button>
                          </div>

                          {/* Tasks */}
                          <div className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
                            {group.tasks.map((task: any) => (
                              <div key={task.id} className="group/task flex items-center gap-3 px-5 py-3 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/20 transition-colors">
                                <button
                                  onClick={() => handleToggleTask(gIdx, task.id)}
                                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                                    task.done
                                      ? 'bg-emerald-500 border-emerald-500 text-white'
                                      : 'border-zinc-300 dark:border-zinc-600 hover:border-emerald-400 text-transparent'
                                  }`}
                                >
                                  <Icons.Check size={11} strokeWidth={3} />
                                </button>
                                <span className={`flex-1 text-sm transition-colors ${task.done ? 'line-through text-zinc-400 dark:text-zinc-500' : 'text-zinc-800 dark:text-zinc-200'}`}>
                                  {task.title}
                                </span>
                                <div className="flex items-center gap-2">
                                  {task.dueDate && (
                                    <span className="text-[10px] text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full font-mono">
                                      {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                    </span>
                                  )}
                                  <button
                                    onClick={() => handleDeleteTask(task.id, task.title)}
                                    className="p-1 text-zinc-300 dark:text-zinc-600 hover:text-red-400 dark:hover:text-red-400 transition-colors opacity-0 group-hover/task:opacity-100"
                                  >
                                    <Icons.Trash size={13} />
                                  </button>
                                </div>
                              </div>
                            ))}

                            {/* Add task input */}
                            <div className="flex items-center gap-2 px-5 py-2.5">
                              <div className="w-5 h-5 rounded-full border-2 border-dashed border-zinc-200 dark:border-zinc-700 shrink-0" />
                              <input
                                value={newTaskTitle[gIdx] ?? ''}
                                onChange={e => setNewTaskTitle(prev => ({ ...prev, [gIdx]: e.target.value }))}
                                onKeyDown={e => e.key === 'Enter' && handleAddTask(gIdx)}
                                placeholder="Agregar tarea..."
                                className="flex-1 bg-transparent text-sm text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none py-1"
                              />
                              {(newTaskTitle[gIdx] ?? '').trim() && (
                                <button onClick={() => handleAddTask(gIdx)} className="px-3 py-1 text-[11px] font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:opacity-90 transition-opacity active:scale-95">
                                  Add
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* ── Add phase ── */}
                    <div className="flex items-center gap-2">
                      <input
                        value={newGroupName}
                        onChange={e => setNewGroupName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddGroup()}
                        placeholder="Nueva fase..."
                        className="px-4 py-2.5 border border-dashed border-zinc-200 dark:border-zinc-700 rounded-xl text-sm bg-transparent focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 transition-colors"
                      />
                      {newGroupName.trim() && (
                        <button onClick={handleAddGroup} className="px-4 py-2.5 text-xs font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl hover:opacity-90 transition-opacity active:scale-95">
                          + Add Phase
                        </button>
                      )}
                    </div>

                    {/* Empty state */}
                    {derivedTasksGroups.length === 0 && projectTasks.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
                          <Icons.CheckCircle size={24} className="text-zinc-300 dark:text-zinc-600" />
                        </div>
                        <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">No hay tareas todavía</p>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 max-w-xs">
                          Usá el generador AI para crear tareas automáticamente o agregá fases manualmente.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Timeline Tab ── */}
                {activeTab === 'timeline' && selectedProject && (() => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);

                  // Collect all dates for chart range
                  const allDates: Date[] = [today];
                  for (const g of derivedTasksGroups) {
                    const grp = selectedProject.tasksGroups.find(tg => tg.name === g.name);
                    if (grp?.startDate) allDates.push(new Date(grp.startDate));
                    if (grp?.endDate) allDates.push(new Date(grp.endDate));
                    for (const t of g.tasks) {
                      if (t.dueDate) allDates.push(new Date(t.dueDate));
                    }
                  }
                  if (selectedProject.deadline) allDates.push(new Date(selectedProject.deadline));

                  const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
                  const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
                  // Add padding
                  minDate.setDate(minDate.getDate() - 7);
                  maxDate.setDate(maxDate.getDate() + 14);
                  const totalDays = Math.max(1, Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)));
                  const dayToPercent = (d: Date) => Math.max(0, Math.min(100, ((d.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24) / totalDays) * 100));

                  // Generate month markers
                  const months: { label: string; left: number }[] = [];
                  const cursor = new Date(minDate);
                  cursor.setDate(1);
                  if (cursor < minDate) cursor.setMonth(cursor.getMonth() + 1);
                  while (cursor <= maxDate) {
                    months.push({
                      label: cursor.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
                      left: dayToPercent(cursor),
                    });
                    cursor.setMonth(cursor.getMonth() + 1);
                  }

                  return (
                    <div className="space-y-6">
                      {/* Gantt Header */}
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Project Timeline</h3>
                        <div className="flex items-center gap-3 text-[10px] text-zinc-400">
                          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Completed</span>
                          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" /> In Progress</span>
                          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-600" /> Upcoming</span>
                        </div>
                      </div>

                      {/* Gantt Chart */}
                      {derivedTasksGroups.length > 0 && (
                        <div className="bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
                          {/* Month headers */}
                          <div className="relative h-8 border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                            {months.map((m, i) => (
                              <div key={i} className="absolute top-0 h-full flex items-center text-[10px] font-semibold text-zinc-400 uppercase tracking-wider" style={{ left: `${m.left}%` }}>
                                <div className="pl-2 border-l border-zinc-200 dark:border-zinc-700 h-full flex items-center">{m.label}</div>
                              </div>
                            ))}
                            {/* Today marker */}
                            <div className="absolute top-0 h-full w-px bg-rose-400" style={{ left: `${dayToPercent(today)}%` }}>
                              <div className="absolute -top-0 -translate-x-1/2 px-1 py-0 text-[9px] font-bold text-rose-500 bg-rose-50 dark:bg-rose-500/10 rounded-b">HOY</div>
                            </div>
                          </div>

                          {/* Phase bars */}
                          {derivedTasksGroups.map((group: any, gIdx: number) => {
                            const grp = selectedProject.tasksGroups.find(tg => tg.name === group.name);
                            const total = group.tasks.length;
                            const done = group.tasks.filter((t: any) => t.done).length;
                            const pct = total > 0 ? Math.round((done / total) * 100) : 0;

                            const phaseStart = grp?.startDate ? new Date(grp.startDate) : null;
                            const phaseEnd = grp?.endDate ? new Date(grp.endDate) : null;
                            const hasDateRange = phaseStart && phaseEnd;

                            const barLeft = hasDateRange ? dayToPercent(phaseStart) : 0;
                            const barWidth = hasDateRange ? Math.max(2, dayToPercent(phaseEnd) - barLeft) : 0;
                            const barColor = pct === 100 ? 'bg-emerald-400/80 dark:bg-emerald-500/60' : pct > 0 ? 'bg-blue-400/80 dark:bg-blue-500/60' : 'bg-zinc-300/80 dark:bg-zinc-600/60';

                            return (
                              <div key={gIdx} className="relative h-10 border-b border-zinc-100 dark:border-zinc-800 last:border-b-0 hover:bg-white/60 dark:hover:bg-zinc-900/40 transition-colors group">
                                {/* Phase label */}
                                <div className="absolute left-2 top-0 h-full flex items-center gap-2 z-10 pointer-events-none">
                                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 truncate max-w-[140px]">{group.name}</span>
                                  <span className="text-[10px] font-mono text-zinc-400 tabular-nums">{done}/{total}</span>
                                </div>
                                {/* Bar */}
                                {hasDateRange && (
                                  <div
                                    className={`absolute top-2 h-6 rounded-md ${barColor} transition-all`}
                                    style={{ left: `${barLeft}%`, width: `${barWidth}%`, minWidth: '24px' }}
                                  >
                                    {/* Progress fill inside bar */}
                                    <div className={`h-full rounded-md ${pct === 100 ? 'bg-emerald-500' : 'bg-blue-500'} opacity-60`} style={{ width: `${pct}%` }} />
                                  </div>
                                )}
                                {/* Today line extends through rows */}
                                <div className="absolute top-0 h-full w-px bg-rose-400/30" style={{ left: `${dayToPercent(today)}%` }} />
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Add Phase */}
                      <div className="bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800 p-5">
                        <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 mb-3">Add Phase</h4>
                        <div className="flex items-end gap-3">
                          <div className="flex-1">
                            <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Name</label>
                            <input
                              value={newGroupName}
                              onChange={e => setNewGroupName(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && handleAddGroup()}
                              placeholder="e.g. Discovery, Design, Development..."
                              className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Start</label>
                            <input
                              type="date"
                              value={timelineNewStart}
                              onChange={e => setTimelineNewStart(e.target.value)}
                              className="px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">End</label>
                            <input
                              type="date"
                              value={timelineNewEnd}
                              onChange={e => setTimelineNewEnd(e.target.value)}
                              className="px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600"
                            />
                          </div>
                          <button
                            onClick={handleAddPhaseWithDates}
                            disabled={!newGroupName.trim()}
                            className="px-4 py-2 text-sm font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-40"
                          >
                            Add Phase
                          </button>
                        </div>
                      </div>

                      {/* Phase Details */}
                      {derivedTasksGroups.map((group: any, gIdx: number) => {
                        const grp = selectedProject.tasksGroups.find(tg => tg.name === group.name);
                        const total = group.tasks.length;
                        const done = group.tasks.filter((t: any) => t.done).length;
                        const pct = total > 0 ? Math.round((done / total) * 100) : 0;

                        return (
                          <div key={gIdx} className="bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
                            <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`w-3 h-3 rounded-full ${pct === 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-blue-500' : 'bg-zinc-300 dark:bg-zinc-600'}`} />
                                <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{group.name}</h4>
                                <span className="text-[10px] font-mono text-zinc-400 tabular-nums">{done}/{total}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="date"
                                  value={grp?.startDate || ''}
                                  onChange={e => handleUpdatePhaseDate(group.name, 'startDate', e.target.value)}
                                  className="px-2 py-1 text-[11px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-300"
                                  title="Start date"
                                />
                                <span className="text-zinc-300 dark:text-zinc-600">→</span>
                                <input
                                  type="date"
                                  value={grp?.endDate || ''}
                                  onChange={e => handleUpdatePhaseDate(group.name, 'endDate', e.target.value)}
                                  className="px-2 py-1 text-[11px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-300"
                                  title="End date"
                                />
                                <button
                                  onClick={() => handleDeletePhase(group.name)}
                                  className="ml-2 p-1 text-zinc-300 hover:text-red-500 dark:text-zinc-600 dark:hover:text-red-400 transition-colors"
                                  title="Delete phase"
                                >
                                  <Icons.Trash size={14} />
                                </button>
                              </div>
                            </div>
                            {/* Progress bar */}
                            <div className="px-5 py-2 border-b border-zinc-100 dark:border-zinc-800">
                              <div className="w-full bg-zinc-200/60 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                                <motion.div
                                  className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${pct}%` }}
                                  transition={{ duration: 0.6, ease: 'easeOut' }}
                                />
                              </div>
                            </div>
                            {/* Tasks */}
                            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                              {group.tasks.map((task: any) => (
                                <div key={task.id} className="px-5 py-2.5 flex items-center justify-between hover:bg-white dark:hover:bg-zinc-900/30 transition-colors">
                                  <div className="flex items-center gap-3">
                                    <input
                                      type="checkbox"
                                      checked={task.done}
                                      onChange={() => handleToggleTask(gIdx, task.id)}
                                      className="rounded border-zinc-300 dark:border-zinc-600 text-zinc-900 dark:text-zinc-100 focus:ring-zinc-400"
                                    />
                                    <span className={`text-sm ${task.done ? 'line-through text-zinc-400' : 'text-zinc-800 dark:text-zinc-200'}`}>
                                      {task.title}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {task.dueDate && (
                                      <span className="text-[10px] text-zinc-400 font-mono bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                                        {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                      </span>
                                    )}
                                    <div className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-500 overflow-hidden">
                                      {(() => {
                                        const assignee = members.find(m => m.id === task.assignee);
                                        if (assignee?.avatar_url) return <img src={assignee.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />;
                                        return (assignee?.name || '?').substring(0, 2).toUpperCase();
                                      })()}
                                    </div>
                                  </div>
                                </div>
                              ))}
                              {/* Add task inline */}
                              <div className="px-5 py-2.5 flex items-center gap-2">
                                <input
                                  value={newTaskTitle[gIdx] ?? ''}
                                  onChange={e => setNewTaskTitle(prev => ({ ...prev, [gIdx]: e.target.value }))}
                                  onKeyDown={e => e.key === 'Enter' && handleAddTask(gIdx)}
                                  placeholder="Add task..."
                                  className="flex-1 px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600"
                                />
                                <button onClick={() => handleAddTask(gIdx)} className="px-3 py-1.5 text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg">Add</button>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Empty state */}
                      {derivedTasksGroups.length === 0 && (
                        <div className="text-center py-12">
                          <div className="text-zinc-300 dark:text-zinc-600 mb-3"><Icons.Clock size={36} className="mx-auto" /></div>
                          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">No phases defined yet</p>
                          <p className="text-xs text-zinc-400">Create your first phase above to start building the project timeline.</p>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ── Files Tab ── */}
                {activeTab === 'files' && selectedProject && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Project Files</h3>
                      <label className="px-4 py-2 text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors cursor-pointer flex items-center gap-2">
                        <Icons.Upload size={14} />
                        Upload File
                        <input type="file" className="hidden" multiple onChange={async (e: React.ChangeEvent<HTMLInputElement>) => {
                          const fileList = e.target.files;
                          if (!fileList || !selectedProject) return;
                          const newFiles = [...selectedProject.files];
                          for (let i = 0; i < fileList.length; i++) {
                            const f = fileList[i];
                            const sizeStr = f.size < 1024 ? `${f.size} B`
                              : f.size < 1024 * 1024 ? `${(f.size / 1024).toFixed(1)} KB`
                              : `${(f.size / (1024 * 1024)).toFixed(1)} MB`;
                            newFiles.push({
                              name: f.name,
                              type: f.type || f.name.split('.').pop() || 'file',
                              size: sizeStr,
                              date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                            });
                          }
                          await updateProject(selectedProject.id, { files: newFiles });
                          await logActivity({ action: 'uploaded files', target: `${fileList.length} file(s)`, project_title: selectedProject.title, type: 'project_update' });
                          e.target.value = '';
                        }} />
                      </label>
                    </div>
                    {selectedProject.files.length === 0 ? (
                      <div className="text-center py-16 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700">
                        <Icons.File size={36} className="mx-auto text-zinc-300 dark:text-zinc-600 mb-3" />
                        <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">No files yet</p>
                        <p className="text-xs text-zinc-400">Upload files to keep project assets organized.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {selectedProject.files.map((file, i) => (
                          <motion.div
                            key={i}
                            whileHover={{ y: -2 }}
                            className="group relative p-4 bg-zinc-50/50 dark:bg-zinc-950/50 border border-zinc-100 dark:border-zinc-800 rounded-xl hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow-md transition-all cursor-pointer flex flex-col items-center text-center"
                          >
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                const updated = selectedProject.files.filter((_, idx) => idx !== i);
                                await updateProject(selectedProject.id, { files: updated });
                              }}
                              className="absolute top-2 right-2 p-1 rounded-md opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
                              title="Remove file"
                            >
                              <Icons.Trash size={12} />
                            </button>
                            <div className="w-12 h-12 bg-white dark:bg-zinc-900 rounded-xl flex items-center justify-center text-zinc-400 mb-3 group-hover:scale-105 transition-transform">
                              <Icons.File size={24} />
                            </div>
                            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate w-full mb-1">{file.name}</div>
                            <div className="text-[10px] text-zinc-400">{file.size} · {file.date}</div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Settings Tab ── */}
                {activeTab === 'settings' && selectedProject && (
                  <div className="max-w-2xl space-y-6">
                    {/* General */}
                    <div className="p-6 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
                      <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-5">General</h3>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">Title</label>
                          <input type="text" value={selectedProject.title} onChange={e => handleUpdateProject({ title: e.target.value })}
                            className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">Description</label>
                          <textarea rows={3} value={selectedProject.description} onChange={e => handleUpdateProject({ description: e.target.value })}
                            className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">Status</label>
                            <select value={selectedProject.status} onChange={e => handleUpdateProject({ status: e.target.value as ProjectStatus })}
                              className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600">
                              {Object.values(ProjectStatus).map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">Deadline</label>
                            <input type="date" value={selectedProject.deadline} onChange={e => handleUpdateProject({ deadline: e.target.value })}
                              className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">Color</label>
                            <div className="flex items-center gap-2">
                              <input type="color" value={selectedProject.color} onChange={e => handleUpdateProject({ color: e.target.value })}
                                className="w-8 h-8 rounded-lg cursor-pointer border-0 p-0" />
                              <span className="text-xs text-zinc-400 font-mono">{selectedProject.color}</span>
                            </div>
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">Progress</label>
                            <div className="flex items-center gap-3">
                              <input type="range" min={0} max={100} value={selectedProject.progress}
                                onChange={e => handleUpdateProject({ progress: parseInt(e.target.value) })}
                                className="flex-1 accent-zinc-900 dark:accent-zinc-100" />
                              <span className="text-sm font-mono text-zinc-600 dark:text-zinc-300 tabular-nums w-10 text-right">{selectedProject.progress}%</span>
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">Budget</label>
                            <input type="number" min={0} step={100} value={selectedProject.budget || ''} placeholder="0"
                              onChange={e => handleUpdateProject({ budget: parseFloat(e.target.value) || 0 })}
                              className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600" />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">Currency</label>
                            <select value={selectedProject.currency || 'USD'} onChange={e => handleUpdateProject({ currency: e.target.value })}
                              className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600">
                              <option value="USD">USD</option>
                              <option value="EUR">EUR</option>
                              <option value="ARS">ARS</option>
                              <option value="BRL">BRL</option>
                              <option value="GBP">GBP</option>
                              <option value="MXN">MXN</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Client */}
                    <div className="p-6 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
                      <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-5">Client</h3>
                      <div>
                        <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">Assigned Client</label>
                        <select
                          value={selectedProject.client_id || ''}
                          onChange={e => {
                            const cid = e.target.value || null;
                            const client = clients.find(c => c.id === cid);
                            handleUpdateProject({
                              client_id: cid,
                              client: client?.name || 'TBD',
                              clientName: client?.name || 'TBD',
                            } as any);
                          }}
                          className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600"
                        >
                          <option value="">No client (personal project)</option>
                          {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ''}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Team */}
                    <div className="p-6 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
                      <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-5">Team Members</h3>
                      <div className="space-y-3 mb-4">
                        {selectedProject.team.length === 0 && (
                          <p className="text-xs text-zinc-400">No team members assigned yet.</p>
                        )}
                        {selectedProject.team.map(userId => {
                          const member = members.find(m => m.id === userId);
                          if (!member) return null;
                          return (
                            <div key={member.id} className="flex items-center justify-between group">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-xs font-bold text-white overflow-hidden">
                                  {member.avatar_url ? <img src={member.avatar_url} alt="" className="w-full h-full object-cover" /> : (member.name || member.email).substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{member.name || member.email}</div>
                                  <div className="text-[10px] text-zinc-400">{member.role}</div>
                                </div>
                              </div>
                              <button
                                onClick={() => handleUpdateProject({ team: selectedProject.team.filter(id => id !== userId) })}
                                className="p-1 rounded-md opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 transition-all"
                              >
                                <Icons.Close size={14} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">Add Member</label>
                        <select
                          value=""
                          onChange={e => {
                            if (!e.target.value) return;
                            if (selectedProject.team.includes(e.target.value)) return;
                            handleUpdateProject({ team: [...selectedProject.team, e.target.value] });
                          }}
                          className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600"
                        >
                          <option value="">Select a team member...</option>
                          {members.filter(m => !selectedProject.team.includes(m.id)).map(m => (
                            <option key={m.id} value={m.id}>{m.name || m.email} ({m.role})</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Tags */}
                    <div className="p-6 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
                      <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-5">Tags</h3>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {selectedProject.tags.map((tag, i) => (
                          <span key={i} className="flex items-center gap-1 px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-medium rounded-full group">
                            {tag}
                            <button onClick={() => handleUpdateProject({ tags: selectedProject.tags.filter((_, idx) => idx !== i) })}
                              className="text-zinc-400 hover:text-red-500 transition-colors">
                              <Icons.Close size={12} />
                            </button>
                          </span>
                        ))}
                        {selectedProject.tags.length === 0 && <span className="text-xs text-zinc-400">No tags</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          placeholder="Add tag..."
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              const val = (e.target as HTMLInputElement).value.trim();
                              if (val && !selectedProject.tags.includes(val)) {
                                handleUpdateProject({ tags: [...selectedProject.tags, val] });
                                (e.target as HTMLInputElement).value = '';
                              }
                            }
                          }}
                          className="flex-1 px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600"
                        />
                      </div>
                    </div>

                    {/* Danger Zone */}
                    <div className="p-6 bg-red-50/50 dark:bg-red-950/20 rounded-xl border border-red-200 dark:border-red-900/30">
                      <h3 className="text-xs font-bold text-red-500 uppercase tracking-wider mb-3">Danger Zone</h3>
                      <p className="text-xs text-red-600/70 dark:text-red-400/70 mb-4">These actions are irreversible. Proceed with caution.</p>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleUpdateProject({ status: ProjectStatus.Archived })}
                          className="px-4 py-2 text-xs font-medium border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
                        >
                          Archive Project
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm('Are you sure you want to delete this project? This cannot be undone.')) return;
                            try {
                              await deleteProject(selectedProject.id);
                              setSelectedId(null);
                            } catch (err) { alert('Error deleting project.'); }
                          }}
                          className="px-4 py-2 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                        >
                          Delete Project
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};
