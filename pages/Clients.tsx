import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../components/ui/Icons';
import { SlidePanel } from '../components/ui/SlidePanel';
import { useClients, Client, ClientMessage, ClientTask, ClientHistory } from '../hooks/useClients';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from '../context/TenantContext';
import { useFinance, IncomeEntry, Installment } from '../context/FinanceContext';
import { errorLogger } from '../lib/errorLogger';
import { supabase } from '../lib/supabase';

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
  note: Icons.FileText || Icons.Activity,
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
  const { incomes, updateInstallment } = useFinance();

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
  const [newTaskData, setNewTaskData] = useState({ title: '', description: '', priority: 'medium' as const, due_date: '' });
  const [creatingClient, setCreatingClient] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});

  const [portalInviteLink, setPortalInviteLink] = useState<string | null>(null);
  const [portalInviteError, setPortalInviteError] = useState<string | null>(null);
  const [isInvitingPortal, setIsInvitingPortal] = useState(false);
  const [availableProjects, setAvailableProjects] = useState<{ id: string; title: string; client_id?: string | null }[]>([]);
  const [assignedProject, setAssignedProject] = useState<{ id: string; title: string } | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

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
          .select('id, title, client_id')
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
      const linked = availableProjects.find(p => p.client_id === selectedClient.id);
      setAssignedProject(linked ? { id: linked.id, title: linked.title } : null);
      setSelectedProjectId('');
    } else {
      setAssignedProject(null);
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
      setNewClientData({ name: '', email: '', company: '', phone: '', status: 'prospect', notes: '', industry: '', address: '' });
      setShowNewClientPanel(false);
      setSelectedClient(client);
    } catch (err) {
      errorLogger.error('Error creando cliente', err);
    } finally {
      setCreatingClient(false);
    }
  };

  const handleAssignProject = async () => {
    if (!selectedClient || !selectedProjectId) return;
    try {
      const { error: err } = await supabase.from('projects').update({ client_id: selectedClient.id }).eq('id', selectedProjectId);
      if (err) throw err;
      setAvailableProjects(prev => prev.map(p => p.id === selectedProjectId ? { ...p, client_id: selectedClient.id } : p));
      const projectTitle = availableProjects.find(p => p.id === selectedProjectId)?.title || '';
      setAssignedProject({ id: selectedProjectId, title: projectTitle });
      setSelectedProjectId('');
      await addHistoryEntry({
        client_id: selectedClient.id,
        user_id: user?.id || '',
        user_name: user?.email?.split('@')[0] || 'User',
        action_type: 'note',
        action_description: `Proyecto asignado: ${projectTitle}`
      });
    } catch (err) {
      errorLogger.error('Error assigning project', err);
    }
  };

  const handleUnassignProject = async () => {
    if (!assignedProject) return;
    try {
      await supabase.from('projects').update({ client_id: null }).eq('id', assignedProject.id);
      setAvailableProjects(prev => prev.map(p => p.id === assignedProject.id ? { ...p, client_id: null } : p));
      setAssignedProject(null);
    } catch (err) {
      errorLogger.error('Error unassigning project', err);
    }
  };

  const handleInvitePortal = async () => {
    if (!selectedClient || !selectedClient.email) return;
    if (!currentTenant?.id) return;
    setIsInvitingPortal(true);
    setPortalInviteError(null);
    try {
      const { data: roleData, error: roleError } = await supabase.from('roles').select('id').eq('name', 'client').single();
      if (roleError || !roleData) throw roleError || new Error('Client role not found');
      const { data: invite, error: inviteError } = await supabase
        .from('invitations')
        .insert({ email: selectedClient.email, role_id: roleData.id, tenant_id: currentTenant.id, client_id: selectedClient.id, created_by: user?.id, type: 'client' })
        .select('token').single();
      if (inviteError) throw inviteError;
      setPortalInviteLink(`${window.location.origin}/accept-invite?token=${invite.token}&portal=client`);
    } catch (err: any) {
      setPortalInviteError(err.message || 'Error creating invitation');
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
    if (!selectedClient || !newTaskData.title.trim()) return;
    try {
      await createTask({
        client_id: selectedClient.id,
        owner_id: user?.id || '',
        title: newTaskData.title,
        description: newTaskData.description,
        priority: newTaskData.priority,
        due_date: newTaskData.due_date || undefined,
        completed: false
      });
      const updatedTasks = await getClientTasks(selectedClient.id);
      setTasks(updatedTasks);
      await addHistoryEntry({
        client_id: selectedClient.id,
        user_id: user?.id || '',
        user_name: user?.email?.split('@')[0] || 'User',
        action_type: 'task_created',
        action_description: `Tarea creada: ${newTaskData.title}`
      });
      setNewTaskData({ title: '', description: '', priority: 'medium', due_date: '' });
      setShowNewTaskInline(false);
    } catch (err) {
      errorLogger.error('Error creando tarea', err);
    }
  };

  const handleToggleTask = async (taskId: string, completed: boolean) => {
    try {
      await updateTask(taskId, { completed });
      if (selectedClient) {
        const updatedTasks = await getClientTasks(selectedClient.id);
        setTasks(updatedTasks);
      }
    } catch (err) {
      errorLogger.error('Error actualizando tarea', err);
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
    { id: 'tasks', label: 'Tareas', icon: Icons.CheckCircle, badge: tasks.filter(t => !t.completed).length },
    { id: 'history', label: 'Historial', icon: Icons.Clock },
  ];

  /* ─── Editable info field ─── */
  const EditableField = ({ field, label, value, type = 'text', placeholder = '' }: { field: string; label: string; value: string | undefined; type?: string; placeholder?: string }) => {
    const isEditing = editingField === field;
    return (
      <div className="group">
        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">{label}</p>
        {isEditing ? (
          <div className="flex gap-1.5">
            <input
              type={type}
              value={editDraft[field] || ''}
              onChange={e => setEditDraft({ ...editDraft, [field]: e.target.value })}
              className="flex-1 px-2.5 py-1.5 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-lg text-sm outline-none focus:border-zinc-500"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleInlineEdit(field)}
            />
            <button onClick={() => handleInlineEdit(field)} className="px-2 py-1 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg text-[10px] font-semibold">OK</button>
            <button onClick={() => setEditingField(null)} className="px-2 py-1 text-zinc-400 hover:text-zinc-600 text-[10px]">X</button>
          </div>
        ) : (
          <p
            onClick={() => { setEditingField(field); setEditDraft({ ...editDraft, [field]: value || '' }); }}
            className="text-sm text-zinc-900 dark:text-zinc-100 truncate cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/60 rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors group-hover:bg-zinc-50 dark:group-hover:bg-zinc-800/40"
          >
            {value || <span className="text-zinc-300 italic">{placeholder || 'Agregar...'}</span>}
          </p>
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
                      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{selectedClient.name}</h2>
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
                      onClick={handleInvitePortal}
                      disabled={!selectedClient.email || isInvitingPortal}
                      className="px-3 py-1.5 text-[11px] font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 transition-all"
                    >
                      {isInvitingPortal ? '...' : 'Invitar al portal'}
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

                {portalInviteError && (
                  <p className="mt-3 text-[11px] text-rose-600 bg-rose-50 dark:bg-rose-500/10 rounded-lg px-3 py-2">{portalInviteError}</p>
                )}
                {portalInviteLink && (
                  <div className="mt-3 text-[11px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg px-3 py-2 flex items-center gap-2">
                    <Icons.CheckCircle size={13} />
                    <span className="truncate">Invitación: <a href={portalInviteLink} target="_blank" rel="noreferrer" className="underline">{portalInviteLink}</a></span>
                  </div>
                )}
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

                      {/* Project assignment */}
                      <div>
                        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">Proyecto vinculado</p>
                        {assignedProject ? (
                          <div className="flex items-center justify-between p-3 bg-emerald-50/80 dark:bg-emerald-500/10 border border-emerald-200/60 dark:border-emerald-800/40 rounded-xl">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
                                <Icons.Briefcase size={14} className="text-emerald-600 dark:text-emerald-400" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{assignedProject.title}</p>
                                <p className="text-[10px] text-emerald-600 dark:text-emerald-400">Vinculado</p>
                              </div>
                            </div>
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => window.open(`/?portal=client&projectId=${assignedProject.id}`, '_blank')}
                                className="px-2.5 py-1.5 text-[10px] font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800"
                              >
                                Ver portal
                              </button>
                              <button
                                onClick={handleUnassignProject}
                                className="px-2.5 py-1.5 text-[10px] font-medium border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-500"
                              >
                                Desvincular
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <select
                              value={selectedProjectId}
                              onChange={(e) => setSelectedProjectId(e.target.value)}
                              className={inputClass + ' flex-1'}
                            >
                              <option value="">Seleccionar proyecto...</option>
                              {availableProjects.filter(p => !p.client_id).map(p => (
                                <option key={p.id} value={p.id}>{p.title}</option>
                              ))}
                            </select>
                            <button
                              onClick={handleAssignProject}
                              disabled={!selectedProjectId}
                              className="px-4 py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl hover:bg-zinc-800 disabled:opacity-40 text-xs font-semibold transition-all"
                            >
                              Asignar
                            </button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* ─── FINANCE TAB ─── */}
                  {detailTab === 'finance' && (
                    <motion.div key="finance" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
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
                            return (
                              <div key={income.id} className="bg-zinc-50 dark:bg-zinc-800/40 rounded-xl overflow-hidden">
                                {/* Income header */}
                                <div className="p-4 flex items-center justify-between">
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
                                  <p className="text-base font-bold text-zinc-900 dark:text-zinc-100 ml-4">{fmtMoney(income.total_amount)}</p>
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
                      ) : (
                        <div className="text-center py-12">
                          <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-3">
                            {Icons.DollarSign ? <Icons.DollarSign size={20} className="text-zinc-400" /> : <Icons.Activity size={20} className="text-zinc-400" />}
                          </div>
                          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Sin registros financieros</p>
                          <p className="text-[10px] text-zinc-400 mt-1 max-w-xs mx-auto">
                            Agrega ingresos vinculados a este cliente desde la sección de Finanzas para verlos aquí.
                          </p>
                        </div>
                      )}
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
                      {showNewTaskInline ? (
                        <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl mb-4 space-y-3">
                          <input
                            type="text"
                            placeholder="Título de la tarea..."
                            value={newTaskData.title}
                            onChange={(e) => setNewTaskData({ ...newTaskData, title: e.target.value })}
                            className={inputClass}
                            autoFocus
                            onKeyDown={e => e.key === 'Enter' && handleCreateTask()}
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <select
                              value={newTaskData.priority}
                              onChange={(e) => setNewTaskData({ ...newTaskData, priority: e.target.value as any })}
                              className={inputClass}
                            >
                              <option value="low">Baja</option>
                              <option value="medium">Media</option>
                              <option value="high">Alta</option>
                            </select>
                            <input
                              type="date"
                              value={newTaskData.due_date}
                              onChange={(e) => setNewTaskData({ ...newTaskData, due_date: e.target.value })}
                              className={inputClass}
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={handleCreateTask}
                              disabled={!newTaskData.title.trim()}
                              className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-xs font-semibold disabled:opacity-40 transition-all"
                            >
                              Crear Tarea
                            </button>
                            <button
                              onClick={() => { setShowNewTaskInline(false); setNewTaskData({ title: '', description: '', priority: 'medium', due_date: '' }); }}
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

                      <div className="space-y-1">
                        {tasks.length > 0 ? (
                          <>
                            {/* Pending tasks first */}
                            {tasks.filter(t => !t.completed).map(task => {
                              const pcfg = priorityConfig[task.priority] || priorityConfig.medium;
                              return (
                                <div key={task.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors group">
                                  <button
                                    onClick={() => handleToggleTask(task.id, true)}
                                    className="w-5 h-5 rounded-md border-2 border-zinc-300 dark:border-zinc-600 hover:border-zinc-400 flex items-center justify-center shrink-0 transition-all"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm text-zinc-900 dark:text-zinc-100">{task.title}</p>
                                    {task.due_date && (
                                      <p className="text-[10px] text-zinc-400 mt-0.5 flex items-center gap-1">
                                        <Icons.Clock size={10} />
                                        {fmtShortDate(task.due_date)}
                                      </p>
                                    )}
                                  </div>
                                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${pcfg.bg} ${pcfg.text}`}>
                                    {pcfg.label}
                                  </span>
                                </div>
                              );
                            })}
                            {/* Completed tasks */}
                            {tasks.filter(t => t.completed).length > 0 && (
                              <>
                                <p className="text-[10px] font-semibold text-zinc-300 dark:text-zinc-600 uppercase tracking-wider pt-3 pb-1 px-3">Completadas</p>
                                {tasks.filter(t => t.completed).map(task => (
                                  <div key={task.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors opacity-60">
                                    <button
                                      onClick={() => handleToggleTask(task.id, false)}
                                      className="w-5 h-5 rounded-md bg-emerald-500 border-2 border-emerald-500 flex items-center justify-center shrink-0"
                                    >
                                      <Icons.Check size={12} className="text-white" />
                                    </button>
                                    <p className="text-sm line-through text-zinc-400 flex-1 truncate">{task.title}</p>
                                  </div>
                                ))}
                              </>
                            )}
                          </>
                        ) : (
                          <div className="text-center py-8">
                            <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-3">
                              <Icons.CheckCircle size={18} className="text-zinc-400" />
                            </div>
                            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Sin tareas</p>
                          </div>
                        )}
                      </div>
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
