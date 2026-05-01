import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../components/ui/Icons';
import { useIsMobile } from '../hooks/useMediaQuery';
import { useClients, Client, ClientMessage, ClientTask, ClientHistory } from '../hooks/useClients';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from '../context/TenantContext';
import { useFinance, IncomeEntry, Installment } from '../context/FinanceContext';
import { useCalendar, CalendarTask } from '../context/CalendarContext';
import { useTeam } from '../context/TeamContext';
import { useProjects } from '../context/ProjectsContext';
import { errorLogger } from '../lib/errorLogger';
import { supabase } from '../lib/supabase';
import { sendInviteEmail } from '../lib/sendInviteEmail';
import { PageView, NavParams } from '../types';

import { ClientListSidebar } from '../components/clients/ClientListSidebar';
import { NewClientPanel } from '../components/clients/NewClientPanel';
import { IconPicker } from '../components/ui/IconPicker';

/* ─── Helpers ─── */
const statusConfig = {
  active:   { label: 'Active',    bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  prospect: { label: 'Prospect', bg: 'bg-amber-50 dark:bg-amber-500/10',     text: 'text-amber-600 dark:text-amber-400',     dot: 'bg-amber-500' },
  inactive: { label: 'Inactive',  bg: 'bg-zinc-100 dark:bg-zinc-800',         text: 'text-zinc-500 dark:text-zinc-400',       dot: 'bg-zinc-400' },
} as const;

/* ─── Simplified client header (name + color + status) ─── */
const getClientInitials = (name: string) =>
  name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

const ClientSimpleHeader: React.FC<{
  client: Client;
  editingField: string | null;
  editDraft: Record<string, string>;
  ownerName: string | null;
  onEditField: (field: string) => void;
  onEditDraftChange: (draft: Record<string, string>) => void;
  onCancelEdit: () => void;
  onInlineEdit: (field: string) => Promise<boolean>;
  onUpdateStatus: (status: string) => void;
  onUpdateColor: (color: string | null) => void;
  onUpdateIcon: (icon: string | null) => void;
  onUploadLogo: (file: File) => Promise<void> | void;
  onRemoveLogo: () => Promise<void> | void;
  isUploadingLogo: boolean;
}> = ({ client, editingField, editDraft, onEditField, onEditDraftChange, onCancelEdit, onInlineEdit, onUpdateStatus, onUpdateColor, onUpdateIcon, onUploadLogo, onRemoveLogo, isUploadingLogo }) => {
  const status = statusConfig[client.status as keyof typeof statusConfig] ?? statusConfig.inactive;
  const [statusOpen, setStatusOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const palette = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899','#71717a'];
  const editingName = editingField === 'name';
  const logoInputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="p-5 border-b border-zinc-100 dark:border-zinc-800/60">
      <div className="flex items-center gap-3">
        {/* Logo / avatar (editable) */}
        <div className="relative group shrink-0">
          <button
            onClick={() => logoInputRef.current?.click()}
            disabled={isUploadingLogo}
            className="w-11 h-11 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-xs font-bold transition-all hover:border-zinc-400 dark:hover:border-zinc-500 disabled:opacity-50"
            style={!client.avatar_url && client.color ? { backgroundColor: `${client.color}22`, color: client.color } : undefined}
            title={client.avatar_url ? 'Change logo' : 'Upload logo'}
          >
            {isUploadingLogo ? (
              <div className="w-4 h-4 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
            ) : client.avatar_url ? (
              <img
                src={client.avatar_url}
                alt={client.name}
                className="w-full h-full object-cover"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            ) : client.icon ? (
              <span className="text-xl leading-none">{client.icon}</span>
            ) : (
              <span className={!client.color ? 'text-zinc-500 dark:text-zinc-400' : ''}>
                {getClientInitials(client.name)}
              </span>
            )}
          </button>
          <div className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 pointer-events-none">
            <Icons.Upload size={14} className="text-white pointer-events-auto cursor-pointer" onClick={() => logoInputRef.current?.click()} />
            {client.avatar_url && (
              <Icons.Trash
                size={14}
                className="text-white pointer-events-auto cursor-pointer hover:text-red-300"
                onClick={(e) => { e.stopPropagation(); onRemoveLogo(); }}
              />
            )}
          </div>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadLogo(f);
              e.target.value = '';
            }}
          />
        </div>
        <IconPicker value={client.icon} onChange={onUpdateIcon} size={26} title="Pick an icon for this client" />
        <button
          onClick={() => setColorOpen(v => !v)}
          className="relative w-3 h-3 rounded-full shrink-0 ring-2 ring-offset-2 ring-transparent hover:ring-zinc-200 dark:hover:ring-zinc-700 dark:ring-offset-zinc-900 transition-all"
          style={{ backgroundColor: client.color || '#71717a' }}
          title="Change color"
        >
          {colorOpen && (
            <div className="absolute left-0 top-5 z-20 p-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl flex gap-1">
              {palette.map(c => (
                <span
                  key={c}
                  onClick={(e) => { e.stopPropagation(); onUpdateColor(c); setColorOpen(false); }}
                  className="w-5 h-5 rounded-full cursor-pointer hover:scale-110 transition-transform"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          )}
        </button>
        {editingName ? (
          <input
            autoFocus
            value={editDraft.name ?? client.name}
            onChange={e => onEditDraftChange({ ...editDraft, name: e.target.value })}
            onBlur={() => onInlineEdit('name')}
            onKeyDown={e => {
              if (e.key === 'Enter') onInlineEdit('name');
              if (e.key === 'Escape') onCancelEdit();
            }}
            className="text-lg font-bold text-zinc-900 dark:text-zinc-100 bg-transparent border-b border-zinc-300 dark:border-zinc-600 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-100 px-1 flex-1"
          />
        ) : (
          <button
            onClick={() => { onEditField('name'); onEditDraftChange({ name: client.name }); }}
            className="text-lg font-bold text-zinc-900 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 px-1 -mx-1 rounded transition-colors text-left truncate"
          >
            {client.name || 'Untitled client'}
          </button>
        )}
        <div className="relative">
          <button
            onClick={() => setStatusOpen(v => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold ${status.bg} ${status.text}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
            {status.label}
            <Icons.ChevronDown size={10} />
          </button>
          {statusOpen && (
            <div className="absolute right-0 top-full mt-1 z-20 py-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl min-w-[120px]">
              {(['active','prospect','inactive'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => { onUpdateStatus(s); setStatusOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700/60 text-left"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${statusConfig[s].dot}`} />
                  {statusConfig[s].label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ─── Inline editable property ─── */
const InlineProp: React.FC<{
  label: string;
  value: string;
  editing: boolean;
  draft: string | undefined;
  onEdit: () => void;
  onDraftChange: (v: string) => void;
  onCancel: () => void;
  onSave: () => Promise<boolean> | void;
}> = ({ label, value, editing, draft, onEdit, onDraftChange, onCancel, onSave }) => (
  <div>
    <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 mb-1">{label}</p>
    {editing ? (
      <input
        autoFocus
        value={draft ?? ''}
        onChange={e => onDraftChange(e.target.value)}
        onBlur={() => onSave()}
        onKeyDown={e => {
          if (e.key === 'Enter') onSave();
          if (e.key === 'Escape') onCancel();
        }}
        className="w-full text-[12px] bg-transparent border-b border-zinc-300 dark:border-zinc-600 focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-100 text-zinc-900 dark:text-zinc-100"
      />
    ) : (
      <button
        onClick={onEdit}
        className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 truncate text-left w-full"
      >
        {value || <span className="text-zinc-400 italic font-normal">Add…</span>}
      </button>
    )}
  </div>
);

export const Clients: React.FC<{ onNavigate?: (page: PageView, params?: NavParams) => void }> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const isMobile = useIsMobile();
  const {
    clients, loading, error,
    createClient, updateClient, deleteClient,
    getClientMessages, sendMessage,
    getClientTasks, createTask, updateTask,
    getClientHistory, addHistoryEntry
  } = useClients();
  const { incomes, expenses, timeEntries, updateInstallment, createIncome, deleteIncome, refreshIncomes, createExpense, deleteExpense, createTimeEntry, deleteTimeEntry } = useFinance();
  const { createTask: createCalendarTask, updateTask: updateCalendarTask, deleteTask: deleteCalendarTask, tasks: allCalendarTasks } = useCalendar();
  const { members: teamMembers } = useTeam();
  const { refreshProjects } = useProjects();

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
  // detailTab state removed — the simplified detail view no longer uses tabs.
  const [showNewTaskInline, setShowNewTaskInline] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [newTaskData, setNewTaskData] = useState<{ title: string; description: string; priority: string; due_date: string; assignee_id: string; status: string }>({ title: '', description: '', priority: 'medium', due_date: new Date().toISOString().split('T')[0], assignee_id: '', status: 'todo' });
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [creatingClient, setCreatingClient] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});

  const [portalInviteLink, setPortalInviteLink] = useState<string | null>(null);
  const [portalInviteError, setPortalInviteError] = useState<string | null>(null);
  const [isInvitingPortal, setIsInvitingPortal] = useState(false);
  const [pendingInviteAfterEmail, setPendingInviteAfterEmail] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [emailSent, setEmailSent] = useState<boolean | null>(null);
  const [clientInviteStatus, setClientInviteStatus] = useState<'none' | 'pending' | 'accepted'>('none');
  const [availableProjects, setAvailableProjects] = useState<{ id: string; title: string; client_id?: string | null; status?: string; progress?: number; deadline?: string; description?: string; created_at?: string }[]>([]);
  const [assignedProjects, setAssignedProjects] = useState<{ id: string; title: string; status?: string; progress?: number; deadline?: string; description?: string; created_at?: string }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const projectDropdownRef = React.useRef<HTMLDivElement>(null);
  const [taskProjectFilter, setTaskProjectFilter] = useState<string>('all');
  const [projectTasks, setProjectTasks] = useState<{ id: string; title: string; completed: boolean; priority: string; due_date?: string; project_id?: string; client_id?: string; start_date?: string; start_time?: string; status?: string; assignee_id?: string; parent_task_id?: string; description?: string; blocked_by?: string; project_name?: string }[]>([]);

  const [showNewIncomeForm, setShowNewIncomeForm] = useState(false);
  const [newIncomeData, setNewIncomeData] = useState({
    concept: '', total_amount: '', num_installments: '1', due_date: '', project_id: '', currency: 'USD',
    installment_dates: [] as string[],
  });
  const [creatingIncome, setCreatingIncome] = useState(false);
  const [deletingIncomeId, setDeletingIncomeId] = useState<string | null>(null);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseFormData, setExpenseFormData] = useState({ concept: '', amount: '', category: 'Software', date: new Date().toISOString().split('T')[0] });
  const [showTimeForm, setShowTimeForm] = useState(false);
  const [timeFormData, setTimeFormData] = useState({ description: '', hours: '', date: new Date().toISOString().split('T')[0], hourlyRate: '' });
  const [isSubmittingFinance, setIsSubmittingFinance] = useState(false);

  const [newClientData, setNewClientData] = useState<{
    name: string; email: string; company: string; phone: string;
    status: string; notes: string; industry: string; address: string;
    color?: string | null; timezone?: string | null;
  }>({
    name: '', email: '', company: '', phone: '',
    status: 'prospect', notes: '', industry: '', address: '',
    color: null, timezone: null,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  /* ─── Client finance data ─── */
  const clientProjectIds = useMemo(() => assignedProjects.map(p => p.id), [assignedProjects]);

  const clientIncomes = useMemo(() => {
    if (!selectedClient) return [];
    return incomes.filter(i =>
      i.client_id === selectedClient.id ||
      (i.project_id && clientProjectIds.includes(i.project_id))
    );
  }, [selectedClient?.id, incomes, clientProjectIds]);

  const clientExpenses = useMemo(() => {
    if (!selectedClient) return [];
    return expenses.filter(e =>
      e.client_id === selectedClient.id ||
      (e.project_id && clientProjectIds.includes(e.project_id))
    );
  }, [selectedClient?.id, expenses, clientProjectIds]);

  const clientTimeEntries = useMemo(() => {
    if (!selectedClient) return [];
    return timeEntries.filter(t =>
      t.client_id === selectedClient.id ||
      (t.project_id && clientProjectIds.includes(t.project_id))
    );
  }, [selectedClient?.id, timeEntries, clientProjectIds]);

  const clientFinancials = useMemo(() => {
    const totalIncome = clientIncomes.reduce((s, i) => s + i.total_amount, 0);
    const allInstallments = clientIncomes.flatMap(i => i.installments || []);
    const totalCollected = allInstallments.filter(inst => inst.status === 'paid').reduce((s, inst) => s + inst.amount, 0);
    const totalExpenses = clientExpenses.reduce((s, e) => s + e.amount, 0);
    const totalHours = clientTimeEntries.reduce((s, t) => s + Number(t.hours), 0);
    const timeCost = clientTimeEntries.reduce((s, t) => s + (Number(t.hours) * Number(t.hourly_rate || 0)), 0);
    const profit = totalCollected - totalExpenses - timeCost;
    const pendingAmount = totalIncome - totalCollected;
    const paidCount = allInstallments.filter(i => i.status === 'paid').length;
    const totalCount = allInstallments.length || clientIncomes.length;
    const overdue = allInstallments.filter(i => i.status === 'overdue').length;
    return { totalIncome, totalCollected, totalExpenses, totalHours, timeCost, profit, pendingAmount, paidCount, totalCount, overdue };
  }, [clientIncomes, clientExpenses, clientTimeEntries]);

  // Load portal invitation status independently (so it doesn't depend on other data loading)
  const loadInvitationStatus = useCallback(async (clientId: string) => {
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
      setPortalInviteError(null);
    } catch {
      // Non-critical - keep previous state
    }
  }, []);

  /* ─── Data loading ─── */
  useEffect(() => {
    if (selectedClient) {
      loadClientData(selectedClient.id);
      loadInvitationStatus(selectedClient.id);
      setPortalInviteError(null);
      setEditingField(null);
    }
  }, [selectedClient?.id]);

  // Listen for global "+ New" popover requesting a new client.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { name?: string } | undefined;
      setNewClientData(prev => ({ ...prev, name: detail?.name || '' }));
      setShowNewClientPanel(true);
    };
    window.addEventListener('open-new-client', handler);
    return () => window.removeEventListener('open-new-client', handler);
  }, []);

  // Auto-trigger invite after email is saved via "Save & Invite"
  useEffect(() => {
    if (pendingInviteAfterEmail && selectedClient?.email) {
      setPendingInviteAfterEmail(false);
      handleInvitePortal();
    }
  }, [pendingInviteAfterEmail, selectedClient?.email]);

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

  /* ─── Realtime: tasks sync (client_id direct + project-linked) ─── */
  useEffect(() => {
    if (!selectedClient) return;
    const projectIds = assignedProjects.map(p => p.id);
    const channel = supabase
      .channel(`client-tasks-${selectedClient.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        (payload) => {
          const row = (payload.new || payload.old) as Record<string, unknown> | undefined;
          if (!row) return;
          const isClientTask = row.client_id === selectedClient.id;
          const isProjectTask = row.project_id && projectIds.includes(row.project_id as string);
          if (isClientTask || isProjectTask) {
            loadClientData(selectedClient.id);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedClient?.id, assignedProjects]);

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const { data, error: fetchErr } = await supabase
          .from('projects')
          .select('id, title, client_id, status, progress, deadline, description, created_at')
          .order('created_at', { ascending: false });
        if (fetchErr) {
          console.error('[Clients] Error loading projects:', fetchErr.message);
        }
        if (import.meta.env.DEV) console.log('[Clients] Projects loaded:', data?.length || 0);
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
      setAssignedProjects(linked.map(p => ({ id: p.id, title: p.title, status: p.status, progress: p.progress, deadline: p.deadline, description: p.description, created_at: p.created_at })));
      setSelectedProjectId('');
      setTaskProjectFilter('all');
    } else {
      setAssignedProjects([]);
    }
  }, [selectedClient?.id, availableProjects]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Click-outside to close project dropdown
  useEffect(() => {
    if (!showProjectDropdown) return;
    const handleClick = (e: MouseEvent) => {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target as Node)) {
        setShowProjectDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showProjectDropdown]);

  const loadClientData = async (clientId: string) => {
    try {
      // Fetch messages, legacy tasks, history, AND linked projects in parallel from DB
      // (query projects directly — don't rely on stale availableProjects state)
      const [msgs, tsks, hist, projectsResult] = await Promise.all([
        getClientMessages(clientId),
        getClientTasks(clientId),
        getClientHistory(clientId),
        supabase.from('projects').select('id, title, client_id, status, progress, deadline, description, created_at').eq('client_id', clientId),
      ]);
      setMessages(msgs);
      setTasks(tsks);
      setHistory(hist);

      const linkedProjects = projectsResult.data || [];
      const projectIds = linkedProjects.map(p => p.id);

      // Load ALL tasks linked to this client from the unified tasks table
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
      if (clientResult?.error) errorLogger.error('Error loading client tasks', clientResult.error);
      if (projectResult && 'error' in projectResult && projectResult.error) errorLogger.error('Error loading project tasks', projectResult.error);
      const clientDirectTasks = clientResult?.data || [];
      const projectLinkedTasks = projectResult?.data || [];

      // Merge and deduplicate
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
    } catch (err) {
      errorLogger.error('Error loading client data', err);
    }
  };

  const loadMessages = async (clientId: string) => {
    try {
      const msgs = await getClientMessages(clientId);
      setMessages(msgs);
    } catch (err) {
      errorLogger.error('Error loading messages', err);
    }
  };

  /* ─── Handlers ─── */
  const handleCreateClient = async () => {
    if (!newClientData.name.trim() || creatingClient) return;
    setCreatingClient(true);
    try {
      const client = await createClient({ ...newClientData, status: newClientData.status as Client['status'] });
      await addHistoryEntry({
        client_id: client.id,
        user_id: user?.id || '',
        user_name: user?.email?.split('@')[0] || 'User',
        action_type: 'note',
        action_description: `Client created: ${client.name}`,
        action_date: new Date().toISOString(),
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
            sendInviteEmail({ clientName: client.name, clientEmail: client.email, inviteLink, tenantName: currentTenant.name, inviteType: 'client', logoUrl: currentTenant.logo_url || undefined, tenantId: currentTenant.id })
              .catch(err => { if (import.meta.env.DEV) console.warn('[auto-invite] Email failed:', err); });
            await addHistoryEntry({
              client_id: client.id, user_id: user?.id || '', user_name: user?.email?.split('@')[0] || 'User',
              action_type: 'email', action_description: `Portal invitation sent automatically to ${client.email}`,
              action_date: new Date().toISOString(),
            });
          }
        } catch (autoInviteErr) {
          if (import.meta.env.DEV) console.warn('[auto-invite] Failed:', autoInviteErr);
        }
      }

      setNewClientData({ name: '', email: '', company: '', phone: '', status: 'prospect', notes: '', industry: '', address: '', color: null, timezone: null });
      setShowNewClientPanel(false);
      setSelectedClient(client);
    } catch (err: any) {
      errorLogger.error('Error creating client', err);
      alert('Error creating client: ' + (err?.message || 'Unknown error'));
    } finally {
      setCreatingClient(false);
    }
  };

  const [assigningProject, setAssigningProject] = useState(false);
  const handleAssignProject = async (projectId?: string) => {
    const pid = projectId || selectedProjectId;
    if (!selectedClient || !pid || assigningProject) return;
    setAssigningProject(true);
    try {
      // Verify client exists in DB before assigning (FK constraint protection)
      const { data: clientCheck } = await supabase.from('clients').select('id').eq('id', selectedClient.id).maybeSingle();
      if (!clientCheck) {
        alert('This client does not exist in the database. Please re-create it.');
        return;
      }
      let { error: err } = await supabase.from('projects').update({ client_id: selectedClient.id }).eq('id', pid);
      // FK constraint broken — drop and recreate it, then retry
      if (err?.code === '23503' && err.message?.includes('client_id')) {
        errorLogger.warn('FK constraint broken on projects.client_id, attempting repair', { clientId: selectedClient.id, projectId: pid });
        const { error: rpcErr } = await supabase.rpc('exec_sql', { sql: `
          ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_client_id_fkey;
          ALTER TABLE projects ADD CONSTRAINT projects_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL NOT VALID;
          ALTER TABLE projects VALIDATE CONSTRAINT projects_client_id_fkey;
        ` });
        if (rpcErr) errorLogger.warn('exec_sql FK repair failed', rpcErr);
        const retry = await supabase.from('projects').update({ client_id: selectedClient.id }).eq('id', pid);
        err = retry.error;
      }
      if (err) throw err;
      const proj = availableProjects.find(p => p.id === pid);
      setAvailableProjects(prev => prev.map(p => p.id === pid ? { ...p, client_id: selectedClient.id } : p));
      if (proj) setAssignedProjects(prev => [...prev, { id: proj.id, title: proj.title, status: proj.status, progress: proj.progress }]);
      setSelectedProjectId('');
      setShowProjectDropdown(false);
      addHistoryEntry({
        client_id: selectedClient.id,
        user_id: user?.id || '',
        user_name: user?.email?.split('@')[0] || 'User',
        action_type: 'note',
        action_description: `Project assigned: ${proj?.title || ''}`,
        action_date: new Date().toISOString(),
      }).catch(() => {});
      loadClientData(selectedClient.id);
      refreshProjects();
    } catch (err: any) {
      errorLogger.error('Error assigning project', err);
      alert('Error assigning project: ' + (err?.message || 'Unknown error'));
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
      refreshProjects();
    } catch (err) {
      errorLogger.error('Error unassigning project', err);
    }
  };

  const handleUploadLogo = async (file: File) => {
    if (!selectedClient) return;
    if (file.size > 2 * 1024 * 1024) { alert('Max file size is 2MB'); return; }
    if (!currentTenant?.id) { alert('No active tenant'); return; }
    setIsUploadingLogo(true);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `client-logos/${currentTenant.id}/${selectedClient.id}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('tenant-assets')
        .upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('tenant-assets').getPublicUrl(path);
      const avatarUrl = `${urlData.publicUrl}?v=${Date.now()}`;
      await updateClient(selectedClient.id, { avatar_url: avatarUrl });
      setSelectedClient({ ...selectedClient, avatar_url: avatarUrl });
    } catch (err: any) {
      errorLogger.error('Error uploading client logo', err);
      alert('Failed to upload logo: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!selectedClient?.avatar_url) return;
    try {
      await updateClient(selectedClient.id, { avatar_url: null });
      setSelectedClient({ ...selectedClient, avatar_url: undefined });
    } catch (err: any) {
      errorLogger.error('Error removing client logo', err);
    }
  };

  const handleSaveEmailAndInvite = async (email: string) => {
    if (!selectedClient || !email) return;
    try {
      await updateClient(selectedClient.id, { email });
      setSelectedClient({ ...selectedClient, email });
      setPendingInviteAfterEmail(true);
    } catch (err: any) {
      setPortalInviteError(`Error saving email: ${err?.message || 'Unknown error'}`);
    }
  };

  const handleInvitePortal = async () => {
    if (!selectedClient || !selectedClient.email) {
      setPortalInviteError('Client needs an email to be invited to the portal.');
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
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${label} took more than ${ms / 1000}s`)), ms))
        ]);

      let inviteLink: string | null = null;

      let roleId: string | null = null;
      try {
        const { data: roleData, error: roleError } = await withTimeout(
          supabase.from('roles').select('id').eq('name', 'client').maybeSingle(),
          8000, 'search role'
        );
        if (!roleError && roleData) {
          roleId = roleData.id;
        } else if (!roleError && !roleData) {
          const { data: newRole } = await withTimeout(
            supabase.from('roles').insert({ name: 'client', description: 'Portal client access', is_system: true }).select('id').single(),
            8000, 'create role'
          );
          roleId = newRole?.id || null;
        }
      } catch (roleErr) {
        if (import.meta.env.DEV) console.warn('[handleInvitePortal] Roles table issue:', roleErr);
      }

      if (roleId && tenantId) {
        try {
          const { data: existing } = await withTimeout(
            supabase.from('invitations').select('token').eq('email', selectedClient.email!).eq('tenant_id', tenantId).eq('status', 'pending').maybeSingle(),
            8000, 'search existing invitation'
          );
          if (existing?.token) {
            inviteLink = `${window.location.origin}/accept-invite?token=${existing.token}&portal=client`;
          }
        } catch (existErr) {
          if (import.meta.env.DEV) console.warn('[handleInvitePortal] Check existing invite:', existErr);
        }
      }

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
            8000, 'create invitation'
          );
          if (invErr) {
            // Retry without optional columns
            const { data: invite2, error: invErr2 } = await withTimeout(
              supabase.from('invitations').insert(payload).select('token').single(),
              8000, 'create invitation (retry)'
            );
            if (!invErr2 && invite2) inviteLink = `${window.location.origin}/accept-invite?token=${invite2.token}&portal=client`;
          } else if (invite) {
            inviteLink = `${window.location.origin}/accept-invite?token=${invite.token}&portal=client`;
          }
        } catch (createErr) {
          if (import.meta.env.DEV) console.warn('[handleInvitePortal] Create invite:', createErr);
        }
      }

      // Fallback: generate a direct portal link if DB invitation failed
      if (!inviteLink) {
        const fallbackToken = btoa(JSON.stringify({ client_id: selectedClient.id, email: selectedClient.email, tenant_id: tenantId || 'none', ts: Date.now() }));
        inviteLink = `${window.location.origin}/client-portal?token=${encodeURIComponent(fallbackToken)}`;
        if (import.meta.env.DEV) console.log('[handleInvitePortal] Using fallback link (no DB invitation)');
      }

      setPortalInviteLink(inviteLink);
      setClientInviteStatus('pending');

      // Try to send email (non-blocking, with timeout)
      try {
        await withTimeout(
          sendInviteEmail({ clientName: selectedClient.name, clientEmail: selectedClient.email!, inviteLink, tenantName: currentTenant?.name || 'Portal', inviteType: 'client', logoUrl: currentTenant?.logo_url || undefined, tenantId: currentTenant?.id }),
          10000, 'send email'
        );
        setEmailSent(true);
      } catch (emailErr) {
        if (import.meta.env.DEV) console.warn('[handleInvitePortal] Email failed:', emailErr);
        setEmailSent(false);
      }

      // Auto-share projects (fire-and-forget)
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

      // Log to history (fire-and-forget)
      addHistoryEntry({
        client_id: selectedClient.id, user_id: user?.id || '',
        user_name: user?.email?.split('@')[0] || 'User', action_type: 'email',
        action_description: `Portal invitation created for ${selectedClient.email}`,
        action_date: new Date().toISOString(),
      }).catch(() => {});

    } catch (err: any) {
      console.error('[handleInvitePortal]', err);
      setPortalInviteError(err.message || 'Error creating invitation');
    } finally {
      setIsInvitingPortal(false);
      if (selectedClient) loadInvitationStatus(selectedClient.id);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedClient) return;
    const senderName = teamMembers.find(m => m.id === user?.id)?.name || user?.email?.split('@')[0] || 'Team';
    try {
      const msg = await sendMessage({
        client_id: selectedClient.id,
        sender_type: 'user',
        sender_id: user?.id,
        sender_name: senderName,
        message: newMessage,
        message_type: 'text'
      });
      setMessages(prev => [...prev, msg]);
      setNewMessage('');
    } catch (err) {
      errorLogger.error('Error sending message', err);
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
      if (selectedClient) await loadClientData(selectedClient.id);
      try {
        await addHistoryEntry({
          client_id: selectedClient.id,
          user_id: user?.id || '',
          user_name: user?.email?.split('@')[0] || 'User',
          action_type: 'task_created',
          action_description: `Task created: ${newTaskData.title}`,
          action_date: new Date().toISOString(),
        });
      } catch { /* history entry is non-critical */ }
      setNewTaskData({ title: '', description: '', priority: 'medium', due_date: new Date().toISOString().split('T')[0], assignee_id: '', status: 'todo' });
      setShowNewTaskInline(false);
    } catch (err: any) {
      errorLogger.error('Error creating task', err);
      alert('Could not create task: ' + (err?.message || 'Unknown error'));
    } finally {
      setCreatingTask(false);
    }
  };

  const handleToggleTask = async (taskId: string, completed: boolean) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed } : t));
    try {
      await updateTask(taskId, { completed });
      if (selectedClient) {
        const updatedTasks = await getClientTasks(selectedClient.id);
        setTasks(updatedTasks);
      }
    } catch (err: any) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: !completed } : t));
      errorLogger.error('Error updating task', err);
      alert('Error updating task: ' + (err?.message || 'Unknown error'));
    }
  };

  const handleToggleUnifiedTask = async (taskId: string, completed: boolean) => {
    setProjectTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed, status: completed ? 'done' : 'todo' } : t));
    try {
      await updateCalendarTask(taskId, { completed, status: completed ? 'done' : 'todo' });
      if (selectedClient) await loadClientData(selectedClient.id);
    } catch (err: any) {
      setProjectTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: !completed, status: !completed ? 'done' : 'todo' } : t));
      errorLogger.error('Error updating task', err);
      alert('Error updating task: ' + (err?.message || 'Unknown error'));
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
      errorLogger.error('Error creating subtask', err);
    } finally {
      setAddingSubtask(false);
    }
  };

  const handleToggleSubtask = async (subtaskId: string, completed: boolean) => {
    try {
      await updateCalendarTask(subtaskId, { completed, status: completed ? 'done' : 'todo' });
      if (selectedClient) await loadClientData(selectedClient.id);
    } catch (err) {
      errorLogger.error('Error updating subtask', err);
    }
  };

  const handleUpdateClientStatus = async (status: string) => {
    if (!selectedClient) return;
    const typedStatus = status as Client['status'];
    try {
      await updateClient(selectedClient.id, { status: typedStatus });
      await addHistoryEntry({
        client_id: selectedClient.id,
        user_id: user?.id || '',
        user_name: user?.email?.split('@')[0] || 'User',
        action_type: 'status_change',
        action_description: `Status changed to ${statusConfig[status as keyof typeof statusConfig]?.label || status}`,
        metadata: { prevStatus: selectedClient.status, newStatus: status },
        action_date: new Date().toISOString(),
      });
      setSelectedClient({ ...selectedClient, status: typedStatus });
    } catch (err) {
      errorLogger.error('Error updating status', err);
    }
  };

  const handleInlineEdit = async (field: string): Promise<boolean> => {
    if (!selectedClient || !editDraft[field]?.trim()) return false;

    try {
      await updateClient(selectedClient.id, { [field]: editDraft[field].trim() });
      setSelectedClient({ ...selectedClient, [field]: editDraft[field].trim() });
      setEditingField(null);
      return true;
    } catch (err: any) {
      console.error('Error updating field:', err);
      alert(`Error saving: ${err?.message || 'Unknown error'}`);
      return false;
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
      if (isNaN(amount) || amount <= 0) throw new Error('Invalid amount');
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
        action_description: `Income created: ${newIncomeData.concept} — $${amount.toLocaleString()}`,
        action_date: new Date().toISOString(),
      });
      setNewIncomeData({ concept: '', total_amount: '', num_installments: '1', due_date: '', project_id: '', currency: 'USD', installment_dates: [] });
      setShowNewIncomeForm(false);
    } catch (err: any) {
      errorLogger.error('Error creating income', err);
      alert(err.message || 'Error creating income');
    } finally {
      setCreatingIncome(false);
    }
  };

  const handleDeleteIncome = async (incomeId: string) => {
    if (!confirm('Delete this income and all its installments?')) return;
    setDeletingIncomeId(incomeId);
    try {
      await deleteIncome(incomeId);
      if (selectedClient) {
        await addHistoryEntry({
          client_id: selectedClient.id,
          user_id: user?.id || '',
          user_name: user?.email?.split('@')[0] || 'User',
          action_type: 'note',
          action_description: 'Income deleted',
          action_date: new Date().toISOString(),
        });
      }
    } catch (err) {
      errorLogger.error('Error deleting income', err);
    } finally {
      setDeletingIncomeId(null);
    }
  };

  const handleCreateExpense = async () => {
    if (!selectedClient || !expenseFormData.concept.trim() || !expenseFormData.amount || isSubmittingFinance) return;
    setIsSubmittingFinance(true);
    try {
      const amount = parseFloat(expenseFormData.amount);
      if (isNaN(amount) || amount <= 0) throw new Error('Invalid amount');
      await createExpense({
        category: expenseFormData.category,
        concept: expenseFormData.concept,
        amount,
        date: expenseFormData.date,
        client_id: selectedClient.id,
        vendor: '',
      });
      setExpenseFormData({ concept: '', amount: '', category: 'Software', date: new Date().toISOString().split('T')[0] });
      setShowExpenseForm(false);
    } catch (err: any) {
      errorLogger.error('Error creating expense', err);
      alert(err.message || 'Error creating expense');
    } finally {
      setIsSubmittingFinance(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('Delete this expense?')) return;
    try { await deleteExpense(id); } catch (err) { errorLogger.error('Error deleting expense', err); }
  };

  const handleCreateTimeEntry = async () => {
    if (!selectedClient || !timeFormData.hours || isSubmittingFinance) return;
    setIsSubmittingFinance(true);
    try {
      const hours = parseFloat(timeFormData.hours);
      if (isNaN(hours) || hours <= 0) throw new Error('Invalid hours');
      await createTimeEntry({
        description: timeFormData.description || 'Time entry',
        hours,
        date: timeFormData.date,
        hourly_rate: timeFormData.hourlyRate ? parseFloat(timeFormData.hourlyRate) : null,
        client_id: selectedClient.id,
      });
      setTimeFormData({ description: '', hours: '', date: new Date().toISOString().split('T')[0], hourlyRate: '' });
      setShowTimeForm(false);
    } catch (err: any) {
      errorLogger.error('Error creating time entry', err);
      alert(err.message || 'Error creating time entry');
    } finally {
      setIsSubmittingFinance(false);
    }
  };

  const handleDeleteTimeEntry = async (id: string) => {
    if (!confirm('Delete this time entry?')) return;
    try { await deleteTimeEntry(id); } catch (err) { errorLogger.error('Error deleting time entry', err); }
  };

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
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm">Reload</button>
      </div>
    );
  }

  // detailTabs removed — simplified view renders without tabs.

  return (
    <div className="pt-2 pb-6">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Clients</h1>
          <p className="text-xs text-zinc-400 mt-0.5">{clients.length} {clients.length === 1 ? 'client' : 'clients'} total</p>
        </div>
        <button
          onClick={() => setShowNewClientPanel(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all active:scale-[0.97] text-xs font-semibold"
        >
          <Icons.Plus size={15} />
          New Client
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ─── Left: Client List (hidden on mobile when client selected) ─── */}
        {(!isMobile || !selectedClient) && (
          <ClientListSidebar
            clients={clients}
            incomes={incomes}
            selectedClient={selectedClient}
            searchQuery={searchQuery}
            statusFilter={statusFilter}
            onSelectClient={setSelectedClient}
            onSearchChange={setSearchQuery}
            onStatusFilterChange={setStatusFilter}
          />
        )}

        {/* ─── Right: Client Detail (full-width on mobile) ─── */}
        {(!isMobile || selectedClient) && (
        <div className={isMobile ? 'col-span-1' : 'lg:col-span-8 xl:col-span-9'}>
          {selectedClient ? (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 overflow-hidden">
              {/* Mobile back button */}
              {isMobile && (
                <button
                  onClick={() => setSelectedClient(null)}
                  className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors w-full border-b border-zinc-100 dark:border-zinc-800/60"
                >
                  <Icons.ChevronLeft size={18} />
                  Back to clients
                </button>
              )}
              {/* ── Simplified header ── */}
              <ClientSimpleHeader
                client={selectedClient}
                editingField={editingField}
                editDraft={editDraft}
                onEditField={setEditingField}
                onEditDraftChange={setEditDraft}
                onCancelEdit={() => setEditingField(null)}
                onInlineEdit={handleInlineEdit}
                onUpdateStatus={handleUpdateClientStatus}
                onUpdateColor={async (color: string | null) => {
                  try {
                    await updateClient(selectedClient.id, { color });
                    setSelectedClient({ ...selectedClient, color });
                  } catch (err) { errorLogger.error('Error updating client color', err); }
                }}
                onUpdateIcon={async (icon: string | null) => {
                  try {
                    await updateClient(selectedClient.id, { icon });
                    setSelectedClient({ ...selectedClient, icon });
                  } catch (err) { errorLogger.error('Error updating client icon', err); }
                }}
                onUploadLogo={handleUploadLogo}
                onRemoveLogo={handleRemoveLogo}
                isUploadingLogo={isUploadingLogo}
                ownerName={teamMembers.find(m => m.id === selectedClient.owner_id)?.name || null}
              />

              {/* ── 3 inline props ── */}
              <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/60 grid grid-cols-3 gap-4">
                <InlineProp
                  label="Industry"
                  value={selectedClient.industry || ''}
                  editing={editingField === 'industry'}
                  draft={editDraft.industry}
                  onEdit={() => { setEditingField('industry'); setEditDraft({ industry: selectedClient.industry || '' }); }}
                  onDraftChange={(v) => setEditDraft({ ...editDraft, industry: v })}
                  onCancel={() => setEditingField(null)}
                  onSave={() => handleInlineEdit('industry')}
                />
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 mb-1">Owner</p>
                  <p className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 truncate">
                    {teamMembers.find(m => m.id === selectedClient.owner_id)?.name || '—'}
                  </p>
                </div>
                <InlineProp
                  label="Timezone"
                  value={selectedClient.timezone || ''}
                  editing={editingField === 'timezone'}
                  draft={editDraft.timezone}
                  onEdit={() => { setEditingField('timezone'); setEditDraft({ timezone: selectedClient.timezone || '' }); }}
                  onDraftChange={(v) => setEditDraft({ ...editDraft, timezone: v })}
                  onCancel={() => setEditingField(null)}
                  onSave={() => handleInlineEdit('timezone')}
                />
              </div>

              {/* ── Projects list ── */}
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    Projects · {assignedProjects.length}
                  </h3>
                </div>
                {assignedProjects.length === 0 ? (
                  <p className="text-[12px] text-zinc-400 italic py-4 text-center">
                    No projects yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                    {assignedProjects.map(p => (
                      <li key={p.id}>
                        <button
                          onClick={() => onNavigate?.('projects', { projectId: p.id })}
                          className="w-full flex items-center gap-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 -mx-2 px-2 rounded-lg transition-colors text-left"
                        >
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            p.status === 'Completed' ? 'bg-zinc-400'
                            : p.status === 'Pending' ? 'bg-amber-500'
                            : p.status === 'Review' ? 'bg-violet-500'
                            : 'bg-emerald-500'
                          }`} />
                          <span className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200 truncate flex-1">
                            {p.title}
                          </span>
                          {p.deadline && (
                            <span className="text-[11px] text-zinc-400 shrink-0">
                              {new Date(p.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('open-new-project', {
                      detail: { clientId: selectedClient.id, name: '' },
                    }));
                    onNavigate?.('projects', { clientId: selectedClient.id });
                  }}
                  className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl text-[12px] font-medium text-zinc-500 hover:border-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                >
                  <Icons.Plus size={14} />
                  New project
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800 p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
              <div className="w-14 h-14 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
                <Icons.Users size={24} className="text-zinc-400" />
              </div>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Select a client</h3>
              <p className="text-xs text-zinc-400 max-w-xs">
                Choose a client from the list or create a new one to see their details, messages and tasks.
              </p>
            </div>
          )}
        </div>
        )}
      </div>

      {/* ─── New Client SlidePanel ─── */}
      <NewClientPanel
        isOpen={showNewClientPanel}
        newClientData={newClientData}
        creatingClient={creatingClient}
        onClose={() => setShowNewClientPanel(false)}
        onDataChange={setNewClientData}
        onCreate={handleCreateClient}
      />
    </div>
  );
};
