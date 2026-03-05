import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../components/ui/Icons';
import { SlidePanel } from '../components/ui/SlidePanel';
import { useClients, Client, ClientMessage, ClientTask, ClientHistory } from '../hooks/useClients';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from '../context/TenantContext';
import { useFinance, IncomeEntry, Installment } from '../context/FinanceContext';
import { useCalendar, CalendarTask } from '../context/CalendarContext';
import { useTeam } from '../context/TeamContext';
import { errorLogger } from '../lib/errorLogger';
import { supabase } from '../lib/supabase';
import { sendInviteEmail } from '../lib/sendInviteEmail';

/* ─── Helpers ─── */
const statusConfig = {
  active:   { label: 'Activo',    bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  prospect: { label: 'Prospecto', bg: 'bg-amber-50 dark:bg-amber-500/10',     text: 'text-amber-600 dark:text-amber-400',     dot: 'bg-amber-500' },
  inactive: { label: 'Inactivo',  bg: 'bg-zinc-100 dark:bg-zinc-800',         text: 'text-zinc-500 dark:text-zinc-400',       dot: 'bg-zinc-400' },
} as const;

const priorityConfig = {
  high:   { label: 'Alta',   bg: 'bg-rose-50 dark:bg-rose-500/10',  text: 'text-rose-600 dark:text-rose-400' },
  medium: { label: 'Media',  bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400' },
  low:    { label: 'Baja',   bg: 'bg-zinc-100 dark:bg-zinc-800',     text: 'text-zinc-500 dark:text-zinc-400' },
} as const;

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : name.slice(0, 2).toUpperCase();
};

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—';
  const date = new Date(d + (d.includes('T') ? '' : 'T00:00:00'));
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
};

const fmtShortDate = (d: string | null | undefined) => {
  if (!d) return '—';
  const date = new Date(d + (d.includes('T') ? '' : 'T00:00:00'));
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
};

const fmtMoney = (v: number) => `$${v.toLocaleString()}`;

const inputClass = 'w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:border-zinc-400 dark:focus:border-zinc-500 focus:ring-2 focus:ring-zinc-100 dark:focus:ring-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 transition-all';
const labelClass = 'block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5';

/* ─── Detail Tabs ─── */
type DetailTab = 'info' | 'finance' | 'messages' | 'tasks' | 'history';

/* ─── History action icons ─── */
const historyIcons: Record<string, React.ElementType> = {
  call: Icons.Phone || Icons.Activity,
  meeting: Icons.Users,
  email: Icons.Mail || Icons.Message,
  note: Icons.Docs || Icons.Activity,
  status_change: Icons.Activity,
  task_created: Icons.CheckCircle,
  payment: Icons.DollarSign || Icons.Activity,
};

export const Clients: React.FC = () => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const {
    clients, loading, error,
    createClient, updateClient, deleteClient,
    getClientMessages, sendMessage,
    getClientTasks, createTask, updateTask,
    getClientHistory, addHistoryEntry
  } = useClients();
  const { incomes, updateInstallment, createIncome, deleteIncome, refreshIncomes } = useFinance();
  const { createTask: createCalendarTask, updateTask: updateCalendarTask, deleteTask: deleteCalendarTask, tasks: allCalendarTasks } = useCalendar();
  const { members: teamMembers } = useTeam();

  /* ─── Loading timeout ─── */
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

  /* ─── State ─── */
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [tasks, setTasks] = useState<ClientTask[]>([]);
  const [history, setHistory] = useState<ClientHistory[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [showNewClientPanel, setShowNewClientPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [detailTab, setDetailTab] = useState<DetailTab>('info');
  const [showNewTaskInline, setShowNewTaskInline] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [newTaskData, setNewTaskData] = useState({ title: '', description: '', priority: 'medium' as const, due_date: new Date().toISOString().split('T')[0], assignee_id: '', status: 'todo' as const });
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [creatingClient, setCreatingClient] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});

  const [portalInviteLink, setPortalInviteLink] = useState<string | null>(null);
  const [portalInviteError, setPortalInviteError] = useState<string | null>(null);
  const [isInvitingPortal, setIsInvitingPortal] = useState(false);
  const [emailSent, setEmailSent] = useState<boolean | null>(null);
  const [clientInviteStatus, setClientInviteStatus] = useState<'none' | 'pending' | 'accepted'>('none');
  const [availableProjects, setAvailableProjects] = useState<{ id: string; title: string; client_id?: string | null; status?: string; progress?: number }[]>([]);
  const [assignedProjects, setAssignedProjects] = useState<{ id: string; title: string; status?: string; progress?: number }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [taskProjectFilter, setTaskProjectFilter] = useState<string>('all');
  const [projectTasks, setProjectTasks] = useState<{ id: string; title: string; completed: boolean; priority: string; due_date?: string; project_id?: string; client_id?: string; start_date?: string; start_time?: string; status?: string; assignee_id?: string; parent_task_id?: string; description?: string; blocked_by?: string; project_name?: string }[]>([]);

  const [showNewIncomeForm, setShowNewIncomeForm] = useState(false);
  const [newIncomeData, setNewIncomeData] = useState({
    concept: '', total_amount: '', num_installments: '1', due_date: '', project_id: '', currency: 'USD',
    installment_dates: [] as string[],
  });
  const [creatingIncome, setCreatingIncome] = useState(false);
  const [deletingIncomeId, setDeletingIncomeId] = useState<string | null>(null);

  const [newClientData, setNewClientData] = useState({
    name: '', email: '', company: '', phone: '',
    status: 'prospect' as const, notes: '', industry: '', address: ''
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  /* ─── Client finance data ─── */
  const clientIncomes = useMemo(() => {
    if (!selectedClient) return [];
    return incomes.filter(i => i.client_id === selectedClient.id);
  }, [selectedClient?.id, incomes]);

  const clientFinanceSummary = useMemo(() => {
    const totalInvoiced = clientIncomes.reduce((s, i) => s + i.total_amount, 0);
    const allInstallments = clientIncomes.flatMap(i => i.installments || []);
    const totalPaid = allInstallments.filter(inst => inst.status === 'paid').reduce((s, inst) => s + inst.amount, 0);
    const totalPending = totalInvoiced - totalPaid;
    const paidCount = allInstallments.filter(i => i.status === 'paid').length;
    const totalCount = allInstallments.length || clientIncomes.length;
    const overdue = allInstallments.filter(i => i.status === 'overdue').length;
    return { totalInvoiced, totalPaid, totalPending, paidCount, totalCount, overdue };
  }, [clientIncomes]);

  /* ─── Data loading ─── */
  useEffect(() => {
    if (selectedClient) {
      loadClientData(selectedClient.id);
      setDetailTab('info');
      setPortalInviteLink(null);
      setPortalInviteError(null);
      setEditingField(null);
    }
  }, [selectedClient?.id]);

  useEffect(() => {
    if (!selectedClient) return;
    const channel = supabase
      .channel(`client-messages-${selectedClient.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'client_messages', filter: `client_id=eq.${selectedClient.id}` },
        () => loadMessages(selectedClient.id)
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedClient?.id]);

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const { data } = await supabase
          .from('projects')
          .select('id, title, client_id, status, progress')
          .order('created_at', { ascending: false });
        setAvailableProjects(data || []);
      } catch (err) {
        errorLogger.error('Error loading projects', err);
      }
    };
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedClient && availableProjects.length > 0) {
      const linked = availableProjects.filter(p => p.client_id === selectedClient.id);
      setAssignedProjects(linked.map(p => ({ id: p.id, title: p.title, status: p.status, progress: p.progress })));
      setSelectedProjectId('');
      setTaskProjectFilter('all');
    } else {
      setAssignedProjects([]);
    }
  }, [selectedClient?.id, availableProjects]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadClientData = async (clientId: string) => {
    try {
      const [msgs, tsks, hist] = await Promise.all([
        getClientMessages(clientId),
        getClientTasks(clientId),
        getClientHistory(clientId)
      ]);
      setMessages(msgs);
      setTasks(tsks);
      setHistory(hist);

      // Load ALL tasks linked to this client from the unified tasks table
      // This includes: tasks with client_id directly set + tasks from linked projects
      const linkedProjects = availableProjects.filter(p => p.client_id === clientId);
      const projectIds = linkedProjects.map(p => p.id);

      // Fetch tasks by client_id (direct link) and by project_id (indirect via project)
      // Use select('*') to avoid failures from missing columns in the schema
      const clientTasksQuery = supabase
        .from('tasks')
        .select('*')
        .eq('client_id', clientId)
        .order('completed', { ascending: true })
        .order('created_at', { ascending: false });

      const projectTasksQuery = projectIds.length > 0
        ? supabase
            .from('tasks')
            .select('*')
            .in('project_id', projectIds)
            .order('completed', { ascending: true })
            .order('created_at', { ascending: false })
        : null;

      const [clientResult, projectResult] = await Promise.all([
        clientTasksQuery,
        projectTasksQuery,
      ]);
      if (clientResult?.error) errorLogger.error('Error cargando tareas del cliente', clientResult.error);
      if (projectResult && 'error' in projectResult && projectResult.error) errorLogger.error('Error cargando tareas de proyectos', projectResult.error);
      const clientDirectTasks = clientResult?.data || [];
      const projectLinkedTasks = projectResult?.data || [];

      // Merge and deduplicate (a task might have both client_id AND project_id)
      const seen = new Set<string>();
      const allTasks = [...clientDirectTasks, ...projectLinkedTasks].filter(t => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      });

      const enriched = allTasks.map(t => ({
        ...t,
        start_date: t.start_date || t.due_date || undefined,
        due_date: t.due_date || t.start_date || undefined,
        project_name: linkedProjects.find(p => p.id === t.project_id)?.title || ''
      }));
      setProjectTasks(enriched);

      // Load portal invitation status
      try {
        const { data: invite } = await supabase
          .from('invitations')
          .select('token, status')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (invite) {
          setClientInviteStatus(invite.status === 'accepted' ? 'accepted' : 'pending');
          setPortalInviteLink(`${window.location.origin}/accept-invite?token=${invite.token}&portal=client`);
        } else {
          setClientInviteStatus('none');
          setPortalInviteLink(null);
        }
        setEmailSent(null);
        setPortalInviteError(null);
      } catch {
        // Non-critical
      }
    } catch (err) {
      errorLogger.error('Error cargando datos del cliente', err);
    }
  };

  const loadMessages = async (clientId: string) => {
    try {
      const msgs = await getClientMessages(clientId);
      setMessages(msgs);
    } catch (err) {
      errorLogger.error('Error cargando mensajes', err);
    }
  };

  /* ─── Handlers ─── */
  const handleCreateClient = async () => {
    if (!newClientData.name.trim() || creatingClient) return;
    setCreatingClient(true);
    try {
      const client = await createClient(newClientData);
      await addHistoryEntry({
        client_id: client.id,
        user_id: user?.id || '',
        user_name: user?.email?.split('@')[0] || 'User',
        action_type: 'note',
        action_description: `Cliente creado: ${client.name}`
      });

      // Auto-invite to portal if client has email
      if (client.email && currentTenant?.id) {
        try {
          let roleId: string;
          const { data: roleData } = await supabase.from('roles').select('id').eq('name', 'client').maybeSingle();
          if (roleData) {
            roleId = roleData.id;
          } else {
            const { data: newRole, error: newRoleErr } = await supabase
              .from('roles').insert({ name: 'client', description: 'Portal client access', is_system: true }).select('id').single();
            if (newRoleErr) throw newRoleErr;
            roleId = newRole.id;
          }

          const { data: invite } = await supabase.from('invitations')
            .insert({ email: client.email, role_id: roleId, tenant_id: currentTenant.id, created_by: user?.id, status: 'pending', client_id: client.id, type: 'client' })
            .select('token').single();

          if (invite?.token) {
            const inviteLink = `${window.location.origin}/accept-invite?token=${invite.token}&portal=client`;
            sendInviteEmail({ clientName: client.name, clientEmail: client.email, inviteLink, tenantName: currentTenant.name })
              .catch(err => console.warn('[auto-invite] Email failed:', err));
            await addHistoryEntry({
              client_id: client.id, user_id: user?.id || '', user_name: user?.email?.split('@')[0] || 'User',
              action_type: 'email', action_description: `Invitación al portal enviada automáticamente a ${client.email}`,
            });
          }
        } catch (autoInviteErr) {
          console.warn('[auto-invite] Failed:', autoInviteErr);
        }
      }

      setNewClientData({ name: '', email: '', company: '', phone: '', status: 'prospect', notes: '', industry: '', address: '' });
      setShowNewClientPanel(false);
      setSelectedClient(client);
    } catch (err: any) {
      errorLogger.error('Error creando cliente', err);
      alert('Error al crear cliente: ' + (err?.message || 'Error desconocido'));
    } finally {
      setCreatingClient(false);
    }
  };

  const [assigningProject, setAssigningProject] = useState(false);
  const handleAssignProject = async () => {
    if (!selectedClient || !selectedProjectId || assigningProject) return;
    setAssigningProject(true);
    try {
      const { error: err } = await supabase.from('projects').update({ client_id: selectedClient.id }).eq('id', selectedProjectId);
      if (err) throw err;
      const proj = availableProjects.find(p => p.id === selectedProjectId);
      setAvailableProjects(prev => prev.map(p => p.id === selectedProjectId ? { ...p, client_id: selectedClient.id } : p));
      if (proj) setAssignedProjects(prev => [...prev, { id: proj.id, title: proj.title, status: proj.status, progress: proj.progress }]);
      setSelectedProjectId('');
      addHistoryEntry({
        client_id: selectedClient.id,
        user_id: user?.id || '',
        user_name: user?.email?.split('@')[0] || 'User',
        action_type: 'note',
        action_description: `Proyecto asignado: ${proj?.title || ''}`
      }).catch(() => {});
      loadClientData(selectedClient.id);
    } catch (err: any) {
      errorLogger.error('Error assigning project', err);
      alert('Error al asignar proyecto: ' + (err?.message || 'Error desconocido'));
    } finally {
      setAssigningProject(false);
    }
  };

  const handleUnassignProject = async (projectId: string) => {
    try {
      await supabase.from('projects').update({ client_id: null }).eq('id', projectId);
      setAvailableProjects(prev => prev.map(p => p.id === projectId ? { ...p, client_id: null } : p));
      setAssignedProjects(prev => prev.filter(p => p.id !== projectId));
      setProjectTasks(prev => prev.filter(t => t.project_id !== projectId));
    } catch (err) {
      errorLogger.error('Error unassigning project', err);
    }
  };

  const handleInvitePortal = async () => {
    if (!selectedClient || !selectedClient.email) {
      setPortalInviteError('El cliente necesita un email para ser invitado al portal.');
      return;
    }
    setIsInvitingPortal(true);
    setPortalInviteError(null);
    setEmailSent(null);
    setPortalInviteLink(null);

    // Resolve tenant
    let tenantId = currentTenant?.id;
    if (!tenantId) {
      try {
        const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user?.id).single();
        tenantId = profile?.tenant_id;
      } catch {}
    }

    try {
      // Helper: race a promise against a timeout
      const withTimeout = <T,>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> =>
        Promise.race([
          Promise.resolve(promise),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${label} tardó más de ${ms / 1000}s`)), ms))
        ]);

      // 1. Try to find/create role and invitation in DB
      let inviteLink: string | null = null;

      // Check if roles table exists and find/create client role
      let roleId: string | null = null;
      try {
        const { data: roleData, error: roleError } = await withTimeout(
          supabase.from('roles').select('id').eq('name', 'client').maybeSingle(),
          8000, 'buscar rol'
        );
        if (!roleError && roleData) {
          roleId = roleData.id;
        } else if (!roleError && !roleData) {
          const { data: newRole } = await withTimeout(
            supabase.from('roles').insert({ name: 'client', description: 'Portal client access', is_system: true }).select('id').single(),
            8000, 'crear rol'
          );
          roleId = newRole?.id || null;
        }
      } catch (roleErr) {
        console.warn('[handleInvitePortal] Roles table issue:', roleErr);
      }

      // 2. Check for existing invitation
      if (roleId && tenantId) {
        try {
          const { data: existing } = await withTimeout(
            supabase.from('invitations').select('token').eq('email', selectedClient.email!).eq('tenant_id', tenantId).eq('status', 'pending').maybeSingle(),
            8000, 'buscar invitación existente'
          );
          if (existing?.token) {
            inviteLink = `${window.location.origin}/accept-invite?token=${existing.token}&portal=client`;
          }
        } catch (existErr) {
          console.warn('[handleInvitePortal] Check existing invite:', existErr);
        }
      }

      // 3. Create new invitation if needed
      if (!inviteLink && roleId && tenantId) {
        try {
          const payload: Record<string, any> = {
            email: selectedClient.email,
            role_id: roleId,
            tenant_id: tenantId,
            created_by: user?.id,
            status: 'pending',
          };
          const { data: invite, error: invErr } = await withTimeout(
            supabase.from('invitations').insert({ ...payload, client_id: selectedClient.id, type: 'client' }).select('token').single(),
            8000, 'crear invitación'
          );
          if (invErr) {
            // Retry without optional columns
            const { data: invite2, error: invErr2 } = await withTimeout(
              supabase.from('invitations').insert(payload).select('token').single(),
              8000, 'crear invitación (retry)'
            );
            if (!invErr2 && invite2) inviteLink = `${window.location.origin}/accept-invite?token=${invite2.token}&portal=client`;
          } else if (invite) {
            inviteLink = `${window.location.origin}/accept-invite?token=${invite.token}&portal=client`;
          }
        } catch (createErr) {
          console.warn('[handleInvitePortal] Create invite:', createErr);
        }
      }

      // 4. Fallback: generate a direct portal link if DB invitation failed
      if (!inviteLink) {
        const fallbackToken = btoa(JSON.stringify({ client_id: selectedClient.id, email: selectedClient.email, tenant_id: tenantId || 'none', ts: Date.now() }));
        inviteLink = `${window.location.origin}/client-portal?token=${encodeURIComponent(fallbackToken)}`;
        console.log('[handleInvitePortal] Using fallback link (no DB invitation)');
      }

      setPortalInviteLink(inviteLink);
      setClientInviteStatus('pending');

      // 5. Try to send email (non-blocking, with timeout)
      try {
        await withTimeout(
          sendInviteEmail({ clientName: selectedClient.name, clientEmail: selectedClient.email!, inviteLink, tenantName: currentTenant?.name || 'Portal' }),
          10000, 'enviar email'
        );
        setEmailSent(true);
      } catch (emailErr) {
        console.warn('[handleInvitePortal] Email failed:', emailErr);
        setEmailSent(false);
      }

      // 6. Auto-share projects (fire-and-forget)
      if (tenantId) {
        Promise.resolve(supabase.from('projects').select('id').eq('client_id', selectedClient.id)).then(({ data: clientProjects }) => {
          if (clientProjects?.length) {
            const shares = clientProjects.map(p => ({
              project_id: p.id, tenant_id: tenantId!, email: selectedClient.email!.toLowerCase(),
              role: 'collaborator' as const, invited_by: user?.id,
            }));
            Promise.resolve(supabase.from('project_shares').upsert(shares, { onConflict: 'project_id,email', ignoreDuplicates: true })).catch(() => {});
          }
        }).catch(() => {});
      }

      // 7. Log to history (fire-and-forget)
      addHistoryEntry({
        client_id: selectedClient.id, user_id: user?.id || '',
        user_name: user?.email?.split('@')[0] || 'User', action_type: 'email',
        action_description: `Invitación al portal creada para ${selectedClient.email}`,
        action_date: new Date().toISOString(),
      }).catch(() => {});

    } catch (err: any) {
      console.error('[handleInvitePortal]', err);
      setPortalInviteError(err.message || 'Error al crear invitación');
    } finally {
      setIsInvitingPortal(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedClient) return;
    try {
      await sendMessage({
        client_id: selectedClient.id,
        sender_type: 'user',
        sender_id: user?.id,
        sender_name: user?.email?.split('@')[0] || 'You',
        message: newMessage,
        message_type: 'text'
      });
      setNewMessage('');
    } catch (err) {
      errorLogger.error('Error enviando mensaje', err);
    }
  };

  const handleCreateTask = async () => {
    if (!selectedClient || !newTaskData.title.trim() || creatingTask) return;
    setCreatingTask(true);
    try {
      await createCalendarTask({
        client_id: selectedClient.id,
        owner_id: user?.id || '',
        title: newTaskData.title,
        description: newTaskData.description || undefined,
        priority: newTaskData.priority as any,
        start_date: newTaskData.due_date || new Date().toISOString().split('T')[0],
        status: newTaskData.status || 'todo',
        assignee_id: newTaskData.assignee_id || undefined,
        completed: false,
        order_index: 0,
      } as any);
      // Reload unified tasks for this client
      if (selectedClient) await loadClientData(selectedClient.id);
      try {
        await addHistoryEntry({
          client_id: selectedClient.id,
          user_id: user?.id || '',
          user_name: user?.email?.split('@')[0] || 'User',
          action_type: 'task_created',
          action_description: `Tarea creada: ${newTaskData.title}`
        });
      } catch { /* history entry is non-critical */ }
      setNewTaskData({ title: '', description: '', priority: 'medium', due_date: new Date().toISOString().split('T')[0], assignee_id: '', status: 'todo' });
      setShowNewTaskInline(false);
    } catch (err: any) {
      errorLogger.error('Error creando tarea', err);
      alert('No se pudo crear la tarea: ' + (err?.message || 'Error desconocido'));
    } finally {
      setCreatingTask(false);
    }
  };

  const handleToggleTask = async (taskId: string, completed: boolean) => {
    // Optimistic update for legacy tasks
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed } : t));
    try {
      await updateTask(taskId, { completed });
      if (selectedClient) {
        const updatedTasks = await getClientTasks(selectedClient.id);
        setTasks(updatedTasks);
      }
    } catch (err: any) {
      // Rollback
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: !completed } : t));
      errorLogger.error('Error actualizando tarea', err);
      alert('Error actualizando tarea: ' + (err?.message || 'Error desconocido'));
    }
  };

  const handleToggleUnifiedTask = async (taskId: string, completed: boolean) => {
    // Optimistic update — instant UI feedback
    setProjectTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed, status: completed ? 'done' : 'todo' } : t));
    try {
      await updateCalendarTask(taskId, { completed, status: completed ? 'done' : 'todo' });
      if (selectedClient) await loadClientData(selectedClient.id);
    } catch (err: any) {
      // Rollback
      setProjectTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: !completed, status: !completed ? 'done' : 'todo' } : t));
      errorLogger.error('Error actualizando tarea', err);
      alert('Error actualizando tarea: ' + (err?.message || 'Error desconocido'));
    }
  };

  const handleAddSubtask = async (parentTaskId: string) => {
    if (!newSubtaskTitle.trim() || addingSubtask) return;
    setAddingSubtask(true);
    try {
      const parentTask = projectTasks.find(t => t.id === parentTaskId);
      await createCalendarTask({
        title: newSubtaskTitle.trim(),
        owner_id: user?.id || '',
        completed: false,
        priority: (parentTask?.priority as any) || 'medium',
        status: 'todo',
        order_index: 0,
        parent_task_id: parentTaskId,
        client_id: selectedClient?.id,
        project_id: parentTask?.project_id || undefined,
      } as any);
      setNewSubtaskTitle('');
      if (selectedClient) await loadClientData(selectedClient.id);
    } catch (err) {
      errorLogger.error('Error creando subtarea', err);
    } finally {
      setAddingSubtask(false);
    }
  };

  const handleToggleSubtask = async (subtaskId: string, completed: boolean) => {
    try {
      await updateCalendarTask(subtaskId, { completed, status: completed ? 'done' : 'todo' });
      if (selectedClient) await loadClientData(selectedClient.id);
    } catch (err) {
      errorLogger.error('Error actualizando subtarea', err);
    }
  };

  const handleUpdateClientStatus = async (status: string) => {
    if (!selectedClient) return;
    try {
      await updateClient(selectedClient.id, { status });
      await addHistoryEntry({
        client_id: selectedClient.id,
        user_id: user?.id || '',
        user_name: user?.email?.split('@')[0] || 'User',
        action_type: 'status_change',
        action_description: `Estado cambiado a ${statusConfig[status as keyof typeof statusConfig]?.label || status}`,
        metadata: { prevStatus: selectedClient.status, newStatus: status }
      });
      setSelectedClient({ ...selectedClient, status });
    } catch (err) {
      errorLogger.error('Error actualizando estado', err);
    }
  };

  const handleInlineEdit = async (field: string) => {
    if (!selectedClient || !editDraft[field]) return;
    try {
      await updateClient(selectedClient.id, { [field]: editDraft[field] });
      setSelectedClient({ ...selectedClient, [field]: editDraft[field] });
      setEditingField(null);
    } catch (err) {
      errorLogger.error('Error updating field', err);
    }
  };

  const handleMarkInstallmentPaid = async (installment: Installment) => {
    try {
      await updateInstallment(installment.id, {
        status: installment.status === 'paid' ? 'pending' : 'paid',
        paid_date: installment.status === 'paid' ? null : new Date().toISOString().slice(0, 10)
      });
    } catch (err) {
      errorLogger.error('Error updating installment', err);
    }
  };

  const handleCreateIncome = async () => {
    if (!selectedClient || !newIncomeData.concept.trim() || !newIncomeData.total_amount || creatingIncome) return;
    setCreatingIncome(true);
    try {
      const amount = parseFloat(newIncomeData.total_amount);
      if (isNaN(amount) || amount <= 0) throw new Error('Monto inválido');
      const numInst = parseInt(newIncomeData.num_installments) || 1;
      await createIncome({
        client_id: selectedClient.id,
        client_name: selectedClient.name,
        project_id: newIncomeData.project_id || null,
        project_name: newIncomeData.project_id
          ? availableProjects.find(p => p.id === newIncomeData.project_id)?.title || 'General'
          : 'General',
        concept: newIncomeData.concept,
        total_amount: amount,
        currency: newIncomeData.currency || 'USD',
        due_date: newIncomeData.due_date || null,
        num_installments: numInst,
        installment_dates: newIncomeData.installment_dates.length === numInst
          ? newIncomeData.installment_dates
          : undefined,
      });
      await addHistoryEntry({
        client_id: selectedClient.id,
        user_id: user?.id || '',
        user_name: user?.email?.split('@')[0] || 'User',
        action_type: 'payment' as any,
        action_description: `Ingreso creado: ${newIncomeData.concept} — ${fmtMoney(amount)}`,
        action_date: new Date().toISOString(),
      });
      setNewIncomeData({ concept: '', total_amount: '', num_installments: '1', due_date: '', project_id: '', currency: 'USD', installment_dates: [] });
      setShowNewIncomeForm(false);
    } catch (err: any) {
      errorLogger.error('Error creando ingreso', err);
      alert(err.message || 'Error al crear ingreso');
    } finally {
      setCreatingIncome(false);
    }
  };

  const handleDeleteIncome = async (incomeId: string) => {
    if (!confirm('¿Eliminar este ingreso y todas sus cuotas?')) return;
    setDeletingIncomeId(incomeId);
    try {
      await deleteIncome(incomeId);
      if (selectedClient) {
        await addHistoryEntry({
          client_id: selectedClient.id,
          user_id: user?.id || '',
          user_name: user?.email?.split('@')[0] || 'User',
          action_type: 'note',
          action_description: 'Ingreso eliminado',
          action_date: new Date().toISOString(),
        });
      }
    } catch (err) {
      errorLogger.error('Error eliminando ingreso', err);
    } finally {
      setDeletingIncomeId(null);
    }
  };

  /* ─── Filtered clients ─── */
  const filteredClients = clients.filter(c => {
    const matchesSearch = !searchQuery ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.company?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  /* ─── Loading / Error states ─── */
  if (loading && !loadingTimedOut) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-600 dark:border-t-zinc-100" />
      </div>
    );
  }

  if (error && clients.length === 0 && !error.includes('Could not find') && !error.includes('does not exist')) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
        <p className="text-sm text-red-700 dark:text-red-400 mb-3">{error}</p>
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm">Recargar</button>
      </div>
    );
  }

  /* ─── Detail tabs ─── */
  const detailTabs: { id: DetailTab; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: 'info', label: 'Info', icon: Icons.Users },
    { id: 'finance', label: 'Finanzas', icon: Icons.DollarSign || Icons.Activity, badge: clientFinanceSummary.overdue },
    { id: 'messages', label: 'Chat', icon: Icons.Message, badge: messages.filter(m => m.sender_type === 'client' && !m.read_at).length },
    { id: 'tasks', label: 'Tareas', icon: Icons.CheckCircle, badge: tasks.filter(t => !t.completed).length + projectTasks.filter(t => !t.completed).length },
    { id: 'history', label: 'Historial', icon: Icons.Clock },
  ];

  /* ─── Editable info field ─── */
  const [savedField, setSavedField] = useState<string | null>(null);
  const EditableField = ({ field, label, value, type = 'text', placeholder = '' }: { field: string; label: string; value: string | undefined; type?: string; placeholder?: string }) => {
    const isEditing = editingField === field;
    const justSaved = savedField === field;
    return (
      <div className="group">
        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">{label}</p>
        {isEditing ? (
          <div className="flex items-center gap-1.5">
            <input
              type={type}
              value={editDraft[field] || ''}
              onChange={e => setEditDraft({ ...editDraft, [field]: e.target.value })}
              className="flex-1 px-2.5 py-1.5 bg-white dark:bg-zinc-800 border-2 border-indigo-400 dark:border-indigo-500 rounded-lg text-sm outline-none ring-2 ring-indigo-100 dark:ring-indigo-900/30"
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') { handleInlineEdit(field); setSavedField(field); setTimeout(() => setSavedField(null), 1500); }
                if (e.key === 'Escape') setEditingField(null);
              }}
            />
            <button
              onClick={() => { handleInlineEdit(field); setSavedField(field); setTimeout(() => setSavedField(null), 1500); }}
              className="p-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors"
              title="Guardar"
            >
              <Icons.Check size={14} />
            </button>
            <button
              onClick={() => setEditingField(null)}
              className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              title="Cancelar"
            >
              <Icons.X size={14} />
            </button>
          </div>
        ) : (
          <div
            onClick={() => { setEditingField(field); setEditDraft({ ...editDraft, [field]: value || '' }); }}
            className="flex items-center gap-1.5 cursor-pointer rounded-lg px-2 py-1.5 -mx-2 -my-1 transition-all hover:bg-zinc-50 dark:hover:bg-zinc-800/60 group/edit"
          >
            {justSaved ? (
              <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
                <Icons.CheckCircle size={14} /> Guardado
              </span>
            ) : (
              <>
                <p className="text-sm text-zinc-900 dark:text-zinc-100 truncate flex-1">
                  {value || <span className="text-zinc-300 dark:text-zinc-600 italic">{placeholder || 'Agregar...'}</span>}
                </p>
                <Icons.Edit size={12} className="text-zinc-300 opacity-0 group-hover/edit:opacity-100 transition-opacity shrink-0" />
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="pt-2 pb-6">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Clientes</h1>
          <p className="text-xs text-zinc-400 mt-0.5">{clients.length} {clients.length === 1 ? 'cliente' : 'clientes'} en total</p>
        </div>
        <button
          onClick={() => setShowNewClientPanel(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all active:scale-[0.97] text-xs font-semibold"
        >
          <Icons.Plus size={15} />
          Nuevo Cliente
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ─── Left: Client List ─── */}
        <div className="lg:col-span-4 xl:col-span-3">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 overflow-hidden">
            {/* Search */}
            <div className="p-3 border-b border-zinc-100 dark:border-zinc-800/60">
              <div className="relative">
                <Icons.Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Buscar cliente..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/60 rounded-xl outline-none focus:border-zinc-300 dark:focus:border-zinc-600 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                />
              </div>
              <div className="flex gap-1 mt-2">
                {(['all', 'active', 'prospect', 'inactive'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors ${
                      statusFilter === s
                        ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                        : 'bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                    }`}
                  >
                    {s === 'all' ? 'Todos' : statusConfig[s].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Client list */}
            <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
              {filteredClients.length > 0 ? (
                <div className="p-2 space-y-1">
                  {filteredClients.map((client) => {
                    const cfg = statusConfig[client.status] || statusConfig.inactive;
                    const isSelected = selectedClient?.id === client.id;
                    const clientInc = incomes.filter(i => i.client_id === client.id);
                    const clientTotal = clientInc.reduce((s, i) => s + i.total_amount, 0);
                    return (
                      <button
                        key={client.id}
                        onClick={() => setSelectedClient(client)}
                        className={`w-full text-left p-3 rounded-xl transition-all group ${
                          isSelected
                            ? 'bg-zinc-900 dark:bg-zinc-100'
                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            isSelected
                              ? 'bg-white/20 text-white dark:bg-zinc-900/30 dark:text-zinc-900'
                              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                          }`}>
                            {client.avatar_url ? (
                              <img src={client.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                            ) : getInitials(client.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className={`text-sm font-medium truncate ${
                                isSelected ? 'text-white dark:text-zinc-900' : 'text-zinc-900 dark:text-zinc-100'
                              }`}>
                                {client.name}
                              </p>
                              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                            </div>
                            <div className="flex items-center justify-between mt-0.5">
                              <p className={`text-[11px] truncate ${
                                isSelected ? 'text-white/60 dark:text-zinc-900/50' : 'text-zinc-400'
                              }`}>
                                {client.company || client.email || 'Sin detalles'}
                              </p>
                              {clientTotal > 0 && (
                                <span className={`text-[10px] font-semibold ${isSelected ? 'text-white/50' : 'text-zinc-300'}`}>
                                  {fmtMoney(clientTotal)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 px-4">
                  <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-3">
                    <Icons.Users size={18} className="text-zinc-400" />
                  </div>
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    {searchQuery || statusFilter !== 'all' ? 'Sin resultados' : 'No hay clientes'}
                  </p>
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    {searchQuery || statusFilter !== 'all' ? 'Ajusta tu búsqueda' : 'Crea tu primer cliente'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── Right: Client Detail ─── */}
        <div className="lg:col-span-8 xl:col-span-9">
          {selectedClient ? (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 overflow-hidden">
              {/* Client header */}
              <div className="p-5 border-b border-zinc-100 dark:border-zinc-800/60">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-zinc-200 to-zinc-300 dark:from-zinc-700 dark:to-zinc-600 flex items-center justify-center text-sm font-bold text-zinc-600 dark:text-zinc-300 overflow-hidden">
                      {selectedClient.avatar_url ? (
                        <img src={selectedClient.avatar_url} alt="" className="w-12 h-12 object-cover" />
                      ) : getInitials(selectedClient.name)}
                    </div>
                    <div>
                      {editingField === 'name' ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            autoFocus
                            className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-800 border-2 border-indigo-400 dark:border-indigo-500 rounded-lg outline-none px-2.5 py-1 ring-2 ring-indigo-100 dark:ring-indigo-900/30"
                            value={editDraft['name'] || ''}
                            onChange={e => setEditDraft({ ...editDraft, name: e.target.value })}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { handleInlineEdit('name'); setSavedField('name'); setTimeout(() => setSavedField(null), 1500); }
                              if (e.key === 'Escape') setEditingField(null);
                            }}
                          />
                          <button
                            onClick={() => { handleInlineEdit('name'); setSavedField('name'); setTimeout(() => setSavedField(null), 1500); }}
                            className="p-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors"
                            title="Guardar"
                          >
                            <Icons.CheckCircle size={16} />
                          </button>
                          <button
                            onClick={() => setEditingField(null)}
                            className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                            title="Cancelar (Esc)"
                          >
                            <Icons.X size={16} />
                          </button>
                        </div>
                      ) : savedField === 'name' ? (
                        <div className="flex items-center gap-2">
                          <h2 className="text-lg font-semibold text-emerald-600">{selectedClient.name}</h2>
                          <span className="text-xs text-emerald-500 font-medium flex items-center gap-1">
                            <Icons.CheckCircle size={13} /> Guardado
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 group/name">
                          <h2
                            className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                            onClick={() => { setEditingField('name'); setEditDraft({ ...editDraft, name: selectedClient.name || '' }); }}
                          >{selectedClient.name}</h2>
                          <button
                            onClick={() => { setEditingField('name'); setEditDraft({ ...editDraft, name: selectedClient.name || '' }); }}
                            className="p-1 text-zinc-300 hover:text-zinc-500 opacity-0 group-hover/name:opacity-100 transition-all"
                            title="Editar nombre"
                          >
                            <Icons.Edit size={13} />
                          </button>
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-0.5">
                        {selectedClient.company && (
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">{selectedClient.company}</span>
                        )}
                        {selectedClient.company && selectedClient.email && <span className="text-zinc-300 dark:text-zinc-600">·</span>}
                        {selectedClient.email && (
                          <span className="text-xs text-zinc-400">{selectedClient.email}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedClient.status}
                      onChange={(e) => handleUpdateClientStatus(e.target.value)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border-0 outline-none cursor-pointer ${statusConfig[selectedClient.status]?.bg} ${statusConfig[selectedClient.status]?.text}`}
                    >
                      <option value="prospect">Prospecto</option>
                      <option value="active">Activo</option>
                      <option value="inactive">Inactivo</option>
                    </select>
                    <button
                      onClick={async () => {
                        if (!confirm('¿Estás seguro de que querés eliminar este cliente? Esta acción no se puede deshacer.')) return;
                        try {
                          await deleteClient(selectedClient.id);
                          setSelectedClient(null);
                        } catch (err: any) {
                          alert('Error eliminando cliente: ' + (err?.message || 'Error desconocido'));
                        }
                      }}
                      className="p-1.5 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all"
                      title="Eliminar cliente"
                    >
                      <Icons.Trash size={15} />
                    </button>
                  </div>
                </div>

                {/* Finance summary cards in header */}
                {clientFinanceSummary.totalInvoiced > 0 && (
                  <div className="grid grid-cols-3 gap-2 mt-4">
                    <div className="p-2.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl">
                      <p className="text-[9px] font-semibold text-zinc-400 uppercase tracking-wider">Facturado</p>
                      <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">{fmtMoney(clientFinanceSummary.totalInvoiced)}</p>
                    </div>
                    <div className="p-2.5 bg-emerald-50/70 dark:bg-emerald-500/10 rounded-xl">
                      <p className="text-[9px] font-semibold text-emerald-600/60 uppercase tracking-wider">Cobrado</p>
                      <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">{fmtMoney(clientFinanceSummary.totalPaid)}</p>
                    </div>
                    <div className="p-2.5 bg-amber-50/70 dark:bg-amber-500/10 rounded-xl">
                      <p className="text-[9px] font-semibold text-amber-600/60 uppercase tracking-wider">Pendiente</p>
                      <p className="text-sm font-bold text-amber-700 dark:text-amber-400 mt-0.5">{fmtMoney(clientFinanceSummary.totalPending)}</p>
                    </div>
                  </div>
                )}

                {/* Portal Access Card */}
                <div className={`mt-4 p-4 rounded-xl border ${
                  clientInviteStatus === 'accepted'
                    ? 'bg-gradient-to-r from-emerald-50/80 to-teal-50/80 dark:from-emerald-950/20 dark:to-teal-950/20 border-emerald-200 dark:border-emerald-900/30'
                    : clientInviteStatus === 'pending'
                    ? 'bg-gradient-to-r from-amber-50/80 to-orange-50/80 dark:from-amber-950/20 dark:to-orange-950/20 border-amber-200 dark:border-amber-900/30'
                    : 'bg-gradient-to-r from-indigo-50/80 to-violet-50/80 dark:from-indigo-950/30 dark:to-violet-950/30 border-indigo-100 dark:border-indigo-900/30'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Icons.External size={14} className={clientInviteStatus === 'accepted' ? 'text-emerald-500' : clientInviteStatus === 'pending' ? 'text-amber-500' : 'text-indigo-500'} />
                      <h4 className={`text-xs font-bold uppercase tracking-wider ${
                        clientInviteStatus === 'accepted' ? 'text-emerald-700 dark:text-emerald-400'
                        : clientInviteStatus === 'pending' ? 'text-amber-700 dark:text-amber-400'
                        : 'text-indigo-700 dark:text-indigo-400'
                      }`}>Portal del Cliente</h4>
                    </div>
                    {clientInviteStatus === 'accepted' && (
                      <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/15 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        <Icons.CheckCircle size={10} /> Activo
                      </span>
                    )}
                    {clientInviteStatus === 'pending' && (
                      <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/15 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        <Icons.Clock size={10} /> Pendiente
                      </span>
                    )}
                  </div>

                  {/* Status: No invitation yet */}
                  {clientInviteStatus === 'none' && (
                    <div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                        {selectedClient.email
                          ? 'Invitá al cliente para que pueda ver el progreso de sus proyectos, archivos y comunicarse.'
                          : 'Agregá un email al cliente para poder invitarlo al portal.'}
                      </p>
                      <button
                        onClick={handleInvitePortal}
                        disabled={!selectedClient.email || isInvitingPortal}
                        className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                      >
                        {isInvitingPortal ? (
                          <><Icons.Loader size={13} className="animate-spin" /> Generando invitación...</>
                        ) : (
                          <><Icons.Send size={13} /> Invitar al portal</>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Status: Pending - invited but not accepted yet */}
                  {clientInviteStatus === 'pending' && (
                    <div className="space-y-2.5">
                      <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
                        Invitación enviada. El cliente aún no creó su cuenta.
                      </p>
                      {emailSent === true && (
                        <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50/80 dark:bg-emerald-500/10 px-3 py-2 rounded-lg">
                          <Icons.CheckCircle size={14} className="shrink-0" />
                          <span>Email enviado a <strong>{selectedClient.email}</strong></span>
                        </div>
                      )}
                      {emailSent === false && (
                        <div className="flex items-center gap-2 text-xs text-rose-700 dark:text-rose-400 bg-rose-50/80 dark:bg-rose-500/10 px-3 py-2 rounded-lg">
                          <Icons.AlertCircle size={14} className="shrink-0" />
                          <span>No se pudo enviar el email. Copiá el link manualmente.</span>
                        </div>
                      )}
                      {portalInviteLink && (
                        <div className="flex items-center gap-2">
                          <input type="text" readOnly value={portalInviteLink}
                            className="flex-1 px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-600 dark:text-zinc-400 select-all"
                            onClick={(e) => (e.target as HTMLInputElement).select()} />
                          <button onClick={() => navigator.clipboard.writeText(portalInviteLink)}
                            className="px-3 py-2 text-xs font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shrink-0">
                            Copiar link
                          </button>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <button onClick={() => window.open(`/?portal=client&clientId=${selectedClient.id}`, '_blank')}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors">
                          <Icons.External size={12} /> Vista previa
                        </button>
                        <button onClick={handleInvitePortal} disabled={isInvitingPortal}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-40">
                          {isInvitingPortal ? <Icons.Loader size={12} className="animate-spin" /> : <Icons.Send size={12} />} Reenviar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Status: Accepted - client has portal access */}
                  {clientInviteStatus === 'accepted' && (
                    <div className="space-y-2.5">
                      <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
                        El cliente tiene acceso al portal y puede ver sus proyectos, pagos y documentos.
                      </p>
                      <div className="flex items-center gap-2">
                        <button onClick={() => window.open(`/?portal=client&clientId=${selectedClient.id}`, '_blank')}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors">
                          <Icons.External size={12} /> Ver portal del cliente
                        </button>
                        {portalInviteLink && (
                          <button onClick={() => navigator.clipboard.writeText(portalInviteLink)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                            <Icons.Link size={12} /> Copiar link
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {portalInviteError && (
                    <p className="mt-2 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 rounded-lg px-3 py-2">
                      {portalInviteError}
                    </p>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-0.5 px-5 pt-3 border-b border-zinc-100 dark:border-zinc-800/60 overflow-x-auto">
                {detailTabs.map(tab => {
                  const Icon = tab.icon;
                  const isActive = detailTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setDetailTab(tab.id)}
                      className={`relative px-3.5 py-2.5 text-[11px] font-medium flex items-center gap-1.5 transition-colors rounded-t-lg whitespace-nowrap ${
                        isActive
                          ? 'text-zinc-900 dark:text-zinc-100'
                          : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
                      }`}
                    >
                      <Icon size={13} />
                      {tab.label}
                      {tab.badge && tab.badge > 0 ? (
                        <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${
                          tab.id === 'finance' ? 'bg-red-100 dark:bg-red-500/20 text-red-600' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                        }`}>
                          {tab.badge}
                        </span>
                      ) : null}
                      {isActive && (
                        <motion.div layoutId="clientTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900 dark:bg-zinc-100 rounded-full" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Tab Content */}
              <div className="p-5 min-h-[300px] max-h-[calc(100vh-380px)] overflow-y-auto">
                <AnimatePresence mode="wait">
                  {/* ─── INFO TAB ─── */}
                  {detailTab === 'info' && (
                    <motion.div key="info" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4 mb-6">
                        <EditableField field="email" label="Email" value={selectedClient.email} type="email" placeholder="email@ejemplo.com" />
                        <EditableField field="phone" label="Teléfono" value={selectedClient.phone} placeholder="+54 11..." />
                        <EditableField field="company" label="Empresa" value={selectedClient.company} />
                        <EditableField field="industry" label="Industria" value={selectedClient.industry} />
                        <EditableField field="address" label="Dirección" value={selectedClient.address} />
                      </div>

                      {selectedClient.notes && (
                        <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl mb-6">
                          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Notas</p>
                          <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-line">{selectedClient.notes}</p>
                        </div>
                      )}

                      {/* Projects assignment (multiple) */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Proyectos vinculados</p>
                          {assignedProjects.length > 0 && (
                            <span className="text-[10px] font-semibold text-zinc-400">{assignedProjects.length}</span>
                          )}
                        </div>

                        {/* Linked projects list */}
                        <AnimatePresence>
                          {assignedProjects.length > 0 && (
                            <div className="space-y-2 mb-3">
                              {assignedProjects.map((proj, idx) => (
                                <motion.div
                                  key={proj.id}
                                  initial={{ opacity: 0, y: -8 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, x: -20 }}
                                  transition={{ duration: 0.2, delay: idx * 0.05 }}
                                  className="group flex items-center justify-between p-3 bg-white dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/40 rounded-xl shadow-sm hover:shadow-md transition-all"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center shrink-0">
                                      <Icons.Briefcase size={15} className="text-emerald-600 dark:text-emerald-400" />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">{proj.title}</p>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                                          proj.status === 'Active' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                                          : proj.status === 'Pending' ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400'
                                          : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400'
                                        }`}>
                                          {proj.status || 'Activo'}
                                        </span>
                                        {typeof proj.progress === 'number' && (
                                          <div className="flex items-center gap-1.5">
                                            <div className="w-16 h-1.5 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden">
                                              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${proj.progress}%` }} />
                                            </div>
                                            <span className="text-[10px] text-zinc-400 font-medium">{proj.progress}%</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => handleUnassignProject(proj.id)}
                                    className="p-1.5 text-zinc-300 dark:text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-rose-500 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all shrink-0"
                                    title="Desvincular"
                                  >
                                    <Icons.X size={13} />
                                  </button>
                                </motion.div>
                              ))}
                            </div>
                          )}
                        </AnimatePresence>

                        {/* Assign new project */}
                        <div className="flex gap-2">
                          <select
                            value={selectedProjectId}
                            onChange={(e) => setSelectedProjectId(e.target.value)}
                            className={inputClass + ' flex-1'}
                          >
                            <option value="">Vincular proyecto...</option>
                            {availableProjects.filter(p => !p.client_id).map(p => (
                              <option key={p.id} value={p.id}>{p.title}</option>
                            ))}
                          </select>
                          <button
                            onClick={handleAssignProject}
                            disabled={!selectedProjectId || assigningProject}
                            className="px-4 py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 text-xs font-semibold transition-all active:scale-[0.97]"
                          >
                            {assigningProject ? '...' : 'Asignar'}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* ─── FINANCE TAB ─── */}
                  {detailTab === 'finance' && (
                    <motion.div key="finance" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                      {/* New income form / toggle */}
                      {showNewIncomeForm ? (
                        <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl mb-4 space-y-3">
                          <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Nuevo ingreso</p>
                          <input
                            type="text"
                            placeholder="Concepto (ej: Desarrollo web, Diseño UX...)"
                            value={newIncomeData.concept}
                            onChange={e => setNewIncomeData({ ...newIncomeData, concept: e.target.value })}
                            className={inputClass}
                            autoFocus
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className={labelClass}>Monto total *</label>
                              <input
                                type="number"
                                placeholder="0.00"
                                min="0"
                                step="0.01"
                                value={newIncomeData.total_amount}
                                onChange={e => setNewIncomeData({ ...newIncomeData, total_amount: e.target.value })}
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label className={labelClass}>Moneda</label>
                              <select
                                value={newIncomeData.currency}
                                onChange={e => setNewIncomeData({ ...newIncomeData, currency: e.target.value })}
                                className={inputClass}
                              >
                                <option value="USD">USD</option>
                                <option value="ARS">ARS</option>
                                <option value="EUR">EUR</option>
                              </select>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className={labelClass}>Cuotas</label>
                              <input
                                type="number"
                                min="1"
                                max="24"
                                value={newIncomeData.num_installments}
                                onChange={e => {
                                  const n = parseInt(e.target.value) || 1;
                                  const base = newIncomeData.due_date ? new Date(newIncomeData.due_date + 'T12:00:00') : new Date();
                                  const dates = Array.from({ length: n }, (_, i) => {
                                    const d = new Date(base);
                                    d.setMonth(d.getMonth() + i);
                                    return d.toISOString().split('T')[0];
                                  });
                                  setNewIncomeData({ ...newIncomeData, num_installments: e.target.value, installment_dates: dates });
                                }}
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label className={labelClass}>Fecha primer vencimiento</label>
                              <input
                                type="date"
                                value={newIncomeData.due_date}
                                onChange={e => {
                                  const n = parseInt(newIncomeData.num_installments) || 1;
                                  const base = e.target.value ? new Date(e.target.value + 'T12:00:00') : new Date();
                                  const dates = Array.from({ length: n }, (_, i) => {
                                    const d = new Date(base);
                                    d.setMonth(d.getMonth() + i);
                                    return d.toISOString().split('T')[0];
                                  });
                                  setNewIncomeData({ ...newIncomeData, due_date: e.target.value, installment_dates: dates });
                                }}
                                className={inputClass}
                              />
                            </div>
                          </div>
                          {/* Per-installment date editors */}
                          {parseInt(newIncomeData.num_installments) > 1 && newIncomeData.installment_dates.length > 0 && (
                            <div className="space-y-1.5 p-3 bg-zinc-100/60 dark:bg-zinc-700/20 rounded-lg">
                              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Fechas por cuota</p>
                              {newIncomeData.installment_dates.map((date, idx) => {
                                const totalAmt = parseFloat(newIncomeData.total_amount) || 0;
                                const n = parseInt(newIncomeData.num_installments) || 1;
                                const perInst = Math.round((totalAmt / n) * 100) / 100;
                                const amt = idx === n - 1 ? Math.round((totalAmt - perInst * (n - 1)) * 100) / 100 : perInst;
                                return (
                                  <div key={idx} className="flex items-center gap-2">
                                    <span className="text-[10px] font-medium text-zinc-500 w-14 shrink-0">Cuota {idx + 1}</span>
                                    <input
                                      type="date"
                                      value={date}
                                      onChange={e => {
                                        const updated = [...newIncomeData.installment_dates];
                                        updated[idx] = e.target.value;
                                        setNewIncomeData({ ...newIncomeData, installment_dates: updated });
                                      }}
                                      className={inputClass + ' flex-1'}
                                    />
                                    {totalAmt > 0 && (
                                      <span className="text-[10px] text-zinc-400 w-20 text-right shrink-0">${amt.toLocaleString()}</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {/* Optional project link */}
                          {availableProjects.filter(p => p.client_id === selectedClient?.id || !p.client_id).length > 0 && (
                            <div>
                              <label className={labelClass}>Proyecto (opcional)</label>
                              <select
                                value={newIncomeData.project_id}
                                onChange={e => setNewIncomeData({ ...newIncomeData, project_id: e.target.value })}
                                className={inputClass}
                              >
                                <option value="">Sin proyecto</option>
                                {availableProjects
                                  .filter(p => p.client_id === selectedClient?.id || !p.client_id)
                                  .map(p => <option key={p.id} value={p.id}>{p.title}</option>)
                                }
                              </select>
                            </div>
                          )}
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={handleCreateIncome}
                              disabled={!newIncomeData.concept.trim() || !newIncomeData.total_amount || creatingIncome}
                              className="px-4 py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-xs font-semibold disabled:opacity-40 transition-all flex items-center gap-2"
                            >
                              {creatingIncome ? (
                                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              ) : (
                                <Icons.Plus size={13} />
                              )}
                              {creatingIncome ? 'Creando...' : 'Crear Ingreso'}
                            </button>
                            <button
                              onClick={() => { setShowNewIncomeForm(false); setNewIncomeData({ concept: '', total_amount: '', num_installments: '1', due_date: '', project_id: '', currency: 'USD', installment_dates: [] }); }}
                              className="px-4 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowNewIncomeForm(true)}
                          className="w-full p-3 border border-dashed border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors mb-4 flex items-center justify-center gap-1.5"
                        >
                          <Icons.Plus size={13} />
                          Agregar ingreso
                        </button>
                      )}

                      {clientIncomes.length > 0 ? (
                        <div className="space-y-4">
                          {/* Progress bar */}
                          {clientFinanceSummary.totalInvoiced > 0 && (
                            <div>
                              <div className="flex justify-between text-[10px] mb-1.5">
                                <span className="text-zinc-400 font-medium">Progreso de cobro</span>
                                <span className="font-semibold text-zinc-500">
                                  {Math.round((clientFinanceSummary.totalPaid / clientFinanceSummary.totalInvoiced) * 100)}%
                                  <span className="text-zinc-300 font-normal ml-1">({clientFinanceSummary.paidCount}/{clientFinanceSummary.totalCount})</span>
                                </span>
                              </div>
                              <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${Math.round((clientFinanceSummary.totalPaid / clientFinanceSummary.totalInvoiced) * 100)}%` }}
                                  transition={{ duration: 1, ease: 'circOut' }}
                                  className="h-full bg-emerald-500 rounded-full"
                                />
                              </div>
                            </div>
                          )}

                          {/* Income groups with installments */}
                          {clientIncomes.map(income => {
                            const installments = income.installments || [];
                            const paidInst = installments.filter(i => i.status === 'paid');
                            const isDeleting = deletingIncomeId === income.id;
                            return (
                              <div key={income.id} className={`bg-zinc-50 dark:bg-zinc-800/40 rounded-xl overflow-hidden transition-opacity ${isDeleting ? 'opacity-40' : ''}`}>
                                {/* Income header */}
                                <div className="p-4 flex items-center justify-between group">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{income.concept || 'Ingreso'}</p>
                                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                                        income.status === 'paid' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700'
                                        : income.status === 'overdue' ? 'bg-red-100 dark:bg-red-500/20 text-red-600'
                                        : income.status === 'partial' ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700'
                                        : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'
                                      }`}>
                                        {income.status === 'paid' ? 'Pagado' : income.status === 'overdue' ? 'Vencido' : income.status === 'partial' ? 'Parcial' : 'Pendiente'}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-zinc-400 mt-0.5">
                                      {income.project_name && income.project_name !== 'General' ? `${income.project_name} · ` : ''}
                                      {installments.length > 0 ? `${paidInst.length}/${installments.length} cuotas` : 'Pago único'}
                                      {income.due_date ? ` · Vence ${fmtShortDate(income.due_date)}` : ''}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2 ml-4">
                                    <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">{fmtMoney(income.total_amount)}</p>
                                    <button
                                      onClick={() => handleDeleteIncome(income.id)}
                                      disabled={isDeleting}
                                      className="p-1.5 text-zinc-300 hover:text-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                      title="Eliminar ingreso"
                                    >
                                      <Icons.Trash size={13} />
                                    </button>
                                  </div>
                                </div>

                                {/* Installments */}
                                {installments.length > 0 && (
                                  <div className="border-t border-zinc-200/60 dark:border-zinc-700/40">
                                    {installments.map(inst => {
                                      const isPaid = inst.status === 'paid';
                                      const isOverdue = inst.status === 'overdue';
                                      return (
                                        <div
                                          key={inst.id}
                                          className={`flex items-center gap-3 px-4 py-2.5 border-b border-zinc-100/80 dark:border-zinc-700/30 last:border-b-0 transition-colors ${
                                            isPaid ? 'bg-emerald-50/30 dark:bg-emerald-500/5' : ''
                                          }`}
                                        >
                                          <button
                                            onClick={() => handleMarkInstallmentPaid(inst)}
                                            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                                              isPaid
                                                ? 'bg-emerald-500 border-emerald-500'
                                                : isOverdue
                                                ? 'border-red-300 dark:border-red-600 hover:border-red-400'
                                                : 'border-zinc-300 dark:border-zinc-600 hover:border-zinc-400'
                                            }`}
                                          >
                                            {isPaid && <Icons.Check size={12} className="text-white" />}
                                          </button>
                                          <div className="flex-1 min-w-0">
                                            <p className={`text-xs font-medium ${isPaid ? 'text-emerald-700 dark:text-emerald-400 line-through' : isOverdue ? 'text-red-600' : 'text-zinc-700 dark:text-zinc-300'}`}>
                                              Cuota {inst.number}
                                            </p>
                                            <p className={`text-[10px] ${isPaid ? 'text-emerald-500 dark:text-emerald-500/60' : isOverdue ? 'text-red-400' : 'text-zinc-400'}`}>
                                              {isPaid && inst.paid_date ? `Pagado ${fmtShortDate(inst.paid_date)}` : `Vence ${fmtShortDate(inst.due_date)}`}
                                            </p>
                                          </div>
                                          <p className={`text-xs font-bold ${isPaid ? 'text-emerald-600' : isOverdue ? 'text-red-600' : 'text-zinc-600 dark:text-zinc-400'}`}>
                                            {fmtMoney(inst.amount)}
                                          </p>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : !showNewIncomeForm ? (
                        <div className="text-center py-8">
                          <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-3">
                            {Icons.DollarSign ? <Icons.DollarSign size={20} className="text-zinc-400" /> : <Icons.Activity size={20} className="text-zinc-400" />}
                          </div>
                          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Sin registros financieros</p>
                          <p className="text-[10px] text-zinc-400 mt-1 max-w-xs mx-auto">
                            Usa el botón de arriba para agregar el primer ingreso de este cliente.
                          </p>
                        </div>
                      ) : null}
                    </motion.div>
                  )}

                  {/* ─── MESSAGES TAB ─── */}
                  {detailTab === 'messages' && (
                    <motion.div key="messages" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex flex-col h-full">
                      <div className="flex-1 mb-4 space-y-2.5 min-h-[200px]">
                        {messages.length > 0 ? (
                          <>
                            {messages.map((message) => {
                              const isUser = message.sender_type === 'user';
                              return (
                                <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                                  {!isUser && (
                                    <div className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-500 mr-2 shrink-0 mt-1">
                                      {getInitials(message.sender_name)}
                                    </div>
                                  )}
                                  <div>
                                    {!isUser && (
                                      <p className="text-[10px] text-zinc-400 mb-0.5 ml-1">{message.sender_name}</p>
                                    )}
                                    <div className={`max-w-[320px] px-3.5 py-2.5 rounded-2xl ${
                                      isUser
                                        ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-br-md'
                                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-bl-md'
                                    }`}>
                                      <p className="text-sm leading-relaxed">{message.message}</p>
                                      <p className={`text-[10px] mt-1 ${isUser ? 'text-white/40 dark:text-zinc-900/30' : 'text-zinc-400'}`}>
                                        {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                            <div ref={messagesEndRef} />
                          </>
                        ) : (
                          <div className="text-center py-12">
                            <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-3">
                              <Icons.Message size={18} className="text-zinc-400" />
                            </div>
                            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Sin mensajes</p>
                            <p className="text-[10px] text-zinc-400 mt-0.5">Los mensajes se sincronizan con el portal del cliente</p>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 mt-auto sticky bottom-0 bg-white dark:bg-zinc-900 pt-2">
                        <input
                          type="text"
                          placeholder="Escribe un mensaje..."
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                          className={inputClass + ' flex-1'}
                        />
                        <button
                          onClick={handleSendMessage}
                          disabled={!newMessage.trim()}
                          className="px-3.5 py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl hover:bg-zinc-800 disabled:opacity-40 transition-all"
                        >
                          <Icons.Send size={15} />
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* ─── TASKS TAB ─── */}
                  {detailTab === 'tasks' && (
                    <motion.div key="tasks" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                      {/* Project filter bar */}
                      {assignedProjects.length > 0 && (
                        <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1">
                          <button
                            onClick={() => setTaskProjectFilter('all')}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors ${taskProjectFilter === 'all' ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                          >
                            Todas
                          </button>
                          <button
                            onClick={() => setTaskProjectFilter('general')}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors ${taskProjectFilter === 'general' ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                          >
                            General
                          </button>
                          {assignedProjects.map(proj => (
                            <button
                              key={proj.id}
                              onClick={() => setTaskProjectFilter(proj.id)}
                              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors ${taskProjectFilter === proj.id ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                            >
                              {proj.title}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* New task form */}
                      {showNewTaskInline ? (
                        <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl mb-4 space-y-3 border border-zinc-200/60 dark:border-zinc-700/60">
                          <input
                            type="text"
                            placeholder="Título de la tarea..."
                            value={newTaskData.title}
                            onChange={(e) => setNewTaskData({ ...newTaskData, title: e.target.value })}
                            className={inputClass}
                            autoFocus
                            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleCreateTask()}
                          />
                          <textarea
                            placeholder="Descripción (opcional)..."
                            value={newTaskData.description}
                            onChange={(e) => setNewTaskData({ ...newTaskData, description: e.target.value })}
                            className={`${inputClass} resize-none`}
                            rows={2}
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className={labelClass}>Prioridad</label>
                              <select
                                value={newTaskData.priority}
                                onChange={(e) => setNewTaskData({ ...newTaskData, priority: e.target.value as any })}
                                className={inputClass}
                              >
                                <option value="low">Baja</option>
                                <option value="medium">Media</option>
                                <option value="high">Alta</option>
                                <option value="urgent">Urgente</option>
                              </select>
                            </div>
                            <div>
                              <label className={labelClass}>Fecha</label>
                              <input
                                type="date"
                                value={newTaskData.due_date}
                                onChange={(e) => setNewTaskData({ ...newTaskData, due_date: e.target.value })}
                                className={inputClass}
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className={labelClass}>Asignar a</label>
                              <select
                                value={newTaskData.assignee_id}
                                onChange={(e) => setNewTaskData({ ...newTaskData, assignee_id: e.target.value })}
                                className={inputClass}
                              >
                                <option value="">Sin asignar</option>
                                {teamMembers.map(m => (
                                  <option key={m.id} value={m.id}>{m.name || m.email}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className={labelClass}>Estado</label>
                              <select
                                value={newTaskData.status}
                                onChange={(e) => setNewTaskData({ ...newTaskData, status: e.target.value as any })}
                                className={inputClass}
                              >
                                <option value="todo">Por hacer</option>
                                <option value="in-progress">En progreso</option>
                                <option value="done">Completada</option>
                              </select>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={handleCreateTask}
                              disabled={!newTaskData.title.trim() || creatingTask}
                              className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-xs font-semibold disabled:opacity-40 transition-all"
                            >
                              {creatingTask ? 'Creando...' : 'Crear Tarea'}
                            </button>
                            <button
                              onClick={() => { setShowNewTaskInline(false); setNewTaskData({ title: '', description: '', priority: 'medium', due_date: new Date().toISOString().split('T')[0], assignee_id: '', status: 'todo' }); }}
                              className="px-4 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowNewTaskInline(true)}
                          className="w-full p-3 border border-dashed border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors mb-4 flex items-center justify-center gap-1.5"
                        >
                          <Icons.Plus size={13} />
                          Nueva tarea
                        </button>
                      )}

                      {/* Unified task list from tasks table */}
                      {(() => {
                        // Only use unified tasks (from tasks table) — filter out subtasks for main list
                        const mainTasks = projectTasks.filter(t => !t.parent_task_id);
                        const subtasksByParent = projectTasks.filter(t => t.parent_task_id).reduce<Record<string, typeof projectTasks>>((acc, t) => {
                          const pid = t.parent_task_id!;
                          if (!acc[pid]) acc[pid] = [];
                          acc[pid].push(t);
                          return acc;
                        }, {});

                        // Apply filter
                        let filtered = mainTasks;
                        if (taskProjectFilter === 'general') filtered = mainTasks.filter(t => !t.project_id);
                        else if (taskProjectFilter !== 'all') filtered = mainTasks.filter(t => t.project_id === taskProjectFilter);

                        // Also include legacy client_tasks in "all" and "general"
                        type UnifiedTask = typeof projectTasks[number] & { _legacy?: boolean };
                        const legacyTasks: UnifiedTask[] = (taskProjectFilter === 'all' || taskProjectFilter === 'general')
                          ? tasks.map(t => ({ id: t.id, title: t.title, completed: t.completed, priority: t.priority || 'medium', due_date: t.due_date, _legacy: true } as any))
                          : [];
                        const allFiltered: UnifiedTask[] = [...legacyTasks, ...filtered];

                        const pending = allFiltered.filter(t => !t.completed);
                        const completed = allFiltered.filter(t => t.completed);
                        const totalCount = allFiltered.length;
                        const completedCount = completed.length;

                        // Helper to get member name
                        const getMemberName = (id?: string) => {
                          if (!id) return null;
                          if (id === user?.id) return 'Yo';
                          const m = teamMembers.find(m => m.id === id);
                          return m?.name || m?.email || null;
                        };

                        // Status labels
                        const statusLabels: Record<string, { label: string; color: string }> = {
                          'todo': { label: 'Por hacer', color: 'text-zinc-500 bg-zinc-100 dark:bg-zinc-800' },
                          'in-progress': { label: 'En progreso', color: 'text-blue-600 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400' },
                          'done': { label: 'Hecho', color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400' },
                          'cancelled': { label: 'Cancelada', color: 'text-zinc-400 bg-zinc-100 dark:bg-zinc-800' },
                        };

                        if (totalCount === 0) {
                          return (
                            <div className="text-center py-8">
                              <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-3">
                                <Icons.CheckCircle size={18} className="text-zinc-400" />
                              </div>
                              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Sin tareas</p>
                              {taskProjectFilter !== 'all' && (
                                <button onClick={() => setTaskProjectFilter('all')} className="text-[10px] text-zinc-400 hover:text-zinc-600 mt-1">
                                  Ver todas
                                </button>
                              )}
                            </div>
                          );
                        }

                        const renderTask = (task: UnifiedTask, isCompleted: boolean) => {
                          const pcfg = priorityConfig[task.priority as keyof typeof priorityConfig] || priorityConfig.medium;
                          const isLegacy = (task as any)._legacy;
                          const isExpanded = expandedTaskId === task.id;
                          const taskSubtasks = subtasksByParent[task.id] || [];
                          const subtasksDone = taskSubtasks.filter(s => s.completed).length;
                          const stLabel = !isLegacy && task.status ? statusLabels[task.status] || null : null;

                          // Dependency check
                          const blockerTask = task.blocked_by ? allFiltered.find(t => t.id === task.blocked_by) || projectTasks.find(t => t.id === task.blocked_by) : null;
                          const isBlocked = blockerTask ? !blockerTask.completed : false;
                          const blockerOwner = blockerTask?.assignee_id ? getMemberName(blockerTask.assignee_id) : null;

                          return (
                            <div key={task.id} className={`rounded-xl transition-colors ${isCompleted ? 'opacity-60' : ''}`}>
                              <div className={`flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors group ${isExpanded && !isCompleted ? 'bg-zinc-50 dark:bg-zinc-800/40' : ''} ${isBlocked && !isCompleted ? 'ring-1 ring-amber-300 dark:ring-amber-500/30 bg-amber-50/30 dark:bg-amber-500/5' : ''}`}>
                                {/* Checkbox or lock icon */}
                                {isBlocked && !isCompleted ? (
                                  <div className="w-5 h-5 rounded-md border-2 border-amber-300 dark:border-amber-500/40 flex items-center justify-center shrink-0" title="Bloqueada por dependencia">
                                    <Icons.Lock size={10} className="text-amber-500" />
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => isLegacy ? handleToggleTask(task.id, !isCompleted) : handleToggleUnifiedTask(task.id, !isCompleted)}
                                    className={isCompleted
                                      ? 'w-5 h-5 rounded-md bg-emerald-500 border-2 border-emerald-500 flex items-center justify-center shrink-0'
                                      : 'w-5 h-5 rounded-md border-2 border-zinc-300 dark:border-zinc-600 hover:border-emerald-400 flex items-center justify-center shrink-0 transition-all group-hover:text-emerald-400'
                                    }
                                  >
                                    {isCompleted
                                      ? <Icons.Check size={12} className="text-white" />
                                      : <Icons.Check size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                                    }
                                  </button>
                                )}
                                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => !isLegacy && setExpandedTaskId(isExpanded ? null : task.id)}>
                                  <p className={`text-sm ${isCompleted ? 'line-through text-zinc-400' : isBlocked ? 'text-amber-700 dark:text-amber-400' : 'text-zinc-900 dark:text-zinc-100'}`}>{task.title}</p>
                                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    {isBlocked && !isCompleted && (
                                      <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-0.5">
                                        <Icons.Lock size={8} />
                                        {blockerOwner ? `Esperando a ${blockerOwner}` : `Esperando: ${blockerTask?.title}`}
                                      </span>
                                    )}
                                    {task.project_name && taskProjectFilter === 'all' && (
                                      <span className="text-[10px] text-blue-500 dark:text-blue-400 font-medium">{task.project_name}</span>
                                    )}
                                    {task.assignee_id && (
                                      <span className="text-[10px] text-violet-500 dark:text-violet-400 font-medium flex items-center gap-0.5">
                                        <Icons.User size={8} />
                                        {getMemberName(task.assignee_id)}
                                      </span>
                                    )}
                                    {(task.due_date || task.start_date) && (
                                      <span className="text-[10px] text-zinc-400 flex items-center gap-0.5">
                                        <Icons.Clock size={9} />
                                        {fmtShortDate(task.due_date || task.start_date)}
                                      </span>
                                    )}
                                    {!isLegacy && taskSubtasks.length > 0 && (
                                      <span className="text-[10px] text-zinc-400 font-medium">{subtasksDone}/{taskSubtasks.length} sub</span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {isBlocked && !isCompleted && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400">Bloqueada</span>
                                  )}
                                  {stLabel && !isCompleted && !isBlocked && (
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${stLabel.color}`}>{stLabel.label}</span>
                                  )}
                                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${pcfg.bg} ${pcfg.text}`}>
                                    {pcfg.label}
                                  </span>
                                </div>
                              </div>

                              {/* Blocked detail card when expanded */}
                              {isExpanded && isBlocked && !isCompleted && blockerTask && (
                                <div className="mx-3 mb-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30">
                                  <div className="flex items-center gap-2">
                                    <div className="w-5 h-5 rounded bg-amber-400 flex items-center justify-center flex-shrink-0">
                                      <Icons.Lock size={10} className="text-white" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 truncate">
                                        Depende de: {blockerTask.title}
                                      </p>
                                      <p className="text-[10px] text-amber-600/80 dark:text-amber-400/60">
                                        {blockerOwner
                                          ? `${blockerOwner} necesita completar esta tarea`
                                          : 'Esta tarea no tiene asignado — necesita ser completada primero'}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Expanded: subtasks + add subtask */}
                              {isExpanded && !isLegacy && !isCompleted && (
                                <div className="ml-8 pl-3 border-l-2 border-zinc-200 dark:border-zinc-700 pb-2 space-y-1">
                                  {taskSubtasks.map(sub => {
                                    const subBlocker = sub.blocked_by ? projectTasks.find(t => t.id === sub.blocked_by) : null;
                                    const subBlocked = subBlocker ? !subBlocker.completed : false;
                                    const subBlockerOwner = subBlocker?.assignee_id ? getMemberName(subBlocker.assignee_id) : null;
                                    return (
                                    <div key={sub.id} className={`flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors group/sub ${subBlocked ? 'bg-amber-50/50 dark:bg-amber-500/5' : ''}`}>
                                      {subBlocked ? (
                                        <div className="w-4 h-4 rounded border border-amber-300 dark:border-amber-500/40 flex items-center justify-center shrink-0" title={subBlockerOwner ? `Esperando a ${subBlockerOwner}` : 'Bloqueada'}>
                                          <Icons.Lock size={8} className="text-amber-500" />
                                        </div>
                                      ) : (
                                        <button
                                          onClick={() => handleToggleSubtask(sub.id, !sub.completed)}
                                          className={sub.completed
                                            ? 'w-4 h-4 rounded bg-emerald-500 border border-emerald-500 flex items-center justify-center shrink-0'
                                            : 'w-4 h-4 rounded border border-zinc-300 dark:border-zinc-600 hover:border-emerald-400 flex items-center justify-center shrink-0 transition-all'
                                          }
                                        >
                                          {sub.completed && <Icons.Check size={9} className="text-white" />}
                                        </button>
                                      )}
                                      <span className={`text-xs flex-1 ${subBlocked ? 'text-amber-600 dark:text-amber-400/70' : sub.completed ? 'line-through text-zinc-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                                        {sub.title}
                                      </span>
                                      {subBlocked && (
                                        <span className="text-[9px] text-amber-500 font-medium flex-shrink-0">
                                          {subBlockerOwner ? `esp. ${subBlockerOwner}` : 'bloqueada'}
                                        </span>
                                      )}
                                    </div>
                                    );
                                  })}
                                  {/* Add subtask input */}
                                  <div className="flex items-center gap-2 pt-1">
                                    <div className="w-4 h-4 rounded border border-dashed border-zinc-300 dark:border-zinc-600 shrink-0" />
                                    <input
                                      type="text"
                                      placeholder="Agregar subtarea..."
                                      value={newSubtaskTitle}
                                      onChange={e => setNewSubtaskTitle(e.target.value)}
                                      onKeyDown={e => e.key === 'Enter' && handleAddSubtask(task.id)}
                                      className="flex-1 text-xs bg-transparent outline-none text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400"
                                    />
                                    {newSubtaskTitle.trim() && (
                                      <button
                                        onClick={() => handleAddSubtask(task.id)}
                                        disabled={addingSubtask}
                                        className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 disabled:opacity-40"
                                      >
                                        {addingSubtask ? '...' : 'Agregar'}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        };

                        return (
                          <div className="space-y-0.5">
                            {/* Progress summary */}
                            <div className="flex items-center gap-3 px-3 pb-2">
                              <div className="flex-1 h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-500 ${completedCount === totalCount ? 'bg-emerald-500' : 'bg-zinc-900 dark:bg-zinc-200'}`} style={{ width: `${totalCount ? Math.round((completedCount / totalCount) * 100) : 0}%` }} />
                              </div>
                              <span className="text-[10px] text-zinc-400 font-mono shrink-0">{completedCount}/{totalCount}</span>
                            </div>

                            {/* Pending tasks */}
                            {pending.map(task => renderTask(task, false))}

                            {/* Completed tasks */}
                            {completed.length > 0 && (
                              <div className="mt-3 border-t border-zinc-100 dark:border-zinc-800 pt-3">
                                <div className="flex items-center gap-2 px-3 pb-2">
                                  <Icons.CheckCircle size={12} className="text-emerald-500" />
                                  <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Completadas ({completed.length})</p>
                                </div>
                                {completed.map(task => renderTask(task, true))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </motion.div>
                  )}

                  {/* ─── HISTORY TAB ─── */}
                  {detailTab === 'history' && (
                    <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                      {history.length > 0 ? (
                        <div className="relative">
                          {/* Timeline line */}
                          <div className="absolute left-[17px] top-4 bottom-4 w-px bg-zinc-100 dark:bg-zinc-800" />
                          <div className="space-y-0.5">
                            {history.map((entry) => {
                              const HIcon = historyIcons[entry.action_type] || Icons.Activity;
                              return (
                                <div key={entry.id} className="flex items-start gap-3 p-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors relative">
                                  <div className="w-7 h-7 rounded-full bg-white dark:bg-zinc-900 border-2 border-zinc-100 dark:border-zinc-800 flex items-center justify-center shrink-0 z-10">
                                    <HIcon size={11} className="text-zinc-400" />
                                  </div>
                                  <div className="flex-1 min-w-0 pt-0.5">
                                    <p className="text-sm text-zinc-700 dark:text-zinc-300">
                                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{entry.user_name}</span>
                                      {' '}{entry.action_description}
                                    </p>
                                    <p className="text-[10px] text-zinc-400 mt-0.5">
                                      {fmtDate(entry.action_date)}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-12">
                          <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-3">
                            <Icons.Clock size={18} className="text-zinc-400" />
                          </div>
                          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Sin historial</p>
                          <p className="text-[10px] text-zinc-400 mt-0.5">Las acciones aparecerán aquí</p>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
              <div className="w-14 h-14 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
                <Icons.Users size={24} className="text-zinc-400" />
              </div>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Selecciona un cliente</h3>
              <p className="text-xs text-zinc-400 max-w-xs">
                Elige un cliente de la lista o crea uno nuevo para ver sus detalles, mensajes y tareas.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ─── New Client SlidePanel ─── */}
      <SlidePanel
        isOpen={showNewClientPanel}
        onClose={() => setShowNewClientPanel(false)}
        title="Nuevo Cliente"
        width="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setShowNewClientPanel(false)}
              className="px-4 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreateClient}
              disabled={!newClientData.name.trim() || creatingClient}
              className="px-5 py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all active:scale-[0.97] flex items-center gap-2"
            >
              {creatingClient ? (
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Icons.Plus size={14} />
              )}
              {creatingClient ? 'Creando...' : 'Crear Cliente'}
            </button>
          </div>
        }
      >
        <div className="p-5 space-y-4">
          <div>
            <label className={labelClass}>Nombre *</label>
            <input
              type="text"
              placeholder="Nombre del cliente"
              value={newClientData.name}
              onChange={(e) => setNewClientData({ ...newClientData, name: e.target.value })}
              className={inputClass}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                placeholder="email@ejemplo.com"
                value={newClientData.email}
                onChange={(e) => setNewClientData({ ...newClientData, email: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Teléfono</label>
              <input
                type="text"
                placeholder="+54 11 1234-5678"
                value={newClientData.phone}
                onChange={(e) => setNewClientData({ ...newClientData, phone: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Empresa</label>
              <input
                type="text"
                placeholder="Nombre de la empresa"
                value={newClientData.company}
                onChange={(e) => setNewClientData({ ...newClientData, company: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Industria</label>
              <input
                type="text"
                placeholder="Tecnología, Salud..."
                value={newClientData.industry}
                onChange={(e) => setNewClientData({ ...newClientData, industry: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Estado</label>
            <select
              value={newClientData.status}
              onChange={(e) => setNewClientData({ ...newClientData, status: e.target.value as any })}
              className={inputClass}
            >
              <option value="prospect">Prospecto</option>
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
            </select>
          </div>

          <div>
            <label className={labelClass}>Notas</label>
            <textarea
              placeholder="Notas adicionales..."
              value={newClientData.notes}
              onChange={(e) => setNewClientData({ ...newClientData, notes: e.target.value })}
              className={inputClass + ' resize-none'}
              rows={3}
            />
          </div>
        </div>
      </SlidePanel>
    </div>
  );
};
