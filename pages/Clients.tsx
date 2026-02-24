import React, { useState, useEffect, useRef } from 'react';
import { Icons } from '../components/ui/Icons';
import { Card } from '../components/ui/Card';
import { useClients, Client, ClientMessage, ClientTask, ClientHistory } from '../hooks/useClients';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from '../context/TenantContext';
import { errorLogger } from '../lib/errorLogger';
import { supabase } from '../lib/supabase';

export const Clients: React.FC = () => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const { 
    clients, 
    loading, 
    error, 
    createClient, 
    updateClient, 
    deleteClient,
    getClientMessages,
    sendMessage,
    getClientTasks,
    createTask,
    updateTask,
    getClientHistory,
    addHistoryEntry
  } = useClients();

  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [tasks, setTasks] = useState<ClientTask[]>([]);
  const [history, setHistory] = useState<ClientHistory[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [portalInviteLink, setPortalInviteLink] = useState<string | null>(null);
  const [portalInviteError, setPortalInviteError] = useState<string | null>(null);
  const [isInvitingPortal, setIsInvitingPortal] = useState(false);
  const [newClientData, setNewClientData] = useState({
    name: '',
    email: '',
    company: '',
    phone: '',
    status: 'prospect' as const,
    notes: '',
    industry: '',
    address: ''
  });

  // Documents state
  const [clientDocs, setClientDocs] = useState<any[]>([]);
  const [clientDocsLoading, setClientDocsLoading] = useState(false);
  const [isUploadingClientDoc, setIsUploadingClientDoc] = useState(false);
  const clientFileInputRef = useRef<HTMLInputElement>(null);
  const [clientDocCounts, setClientDocCounts] = useState<Record<string, number>>({});

  // Load document counts for all clients
  useEffect(() => {
    const loadDocCounts = async () => {
      if (clients.length === 0) return;
      try {
        const { data, error: countErr } = await supabase
          .from('files')
          .select('client_id')
          .not('client_id', 'is', null);
        if (countErr) throw countErr;
        const counts: Record<string, number> = {};
        data?.forEach((f: any) => {
          if (f.client_id) {
            counts[f.client_id] = (counts[f.client_id] || 0) + 1;
          }
        });
        setClientDocCounts(counts);
      } catch (err) {
        errorLogger.error('Error loading doc counts', err);
      }
    };
    loadDocCounts();
  }, [clients]);

  // Cargar datos del cliente seleccionado
  useEffect(() => {
    if (selectedClient) {
      loadClientData(selectedClient.id);
    }
  }, [selectedClient]);

  // Suscribirse a mensajes en tiempo real
  useEffect(() => {
    if (!selectedClient) return;

    const channel = supabase
      .channel(`client-messages-${selectedClient.id}`)
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'client_messages', filter: `client_id=eq.${selectedClient.id}` },
        (payload) => {
          errorLogger.log('Mensaje actualizado:', payload.eventType);
          loadMessages(selectedClient.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedClient]);

  const loadClientData = async (clientId: string) => {
    try {
      setClientDocsLoading(true);
      const [msgs, tsks, hist, docsRes] = await Promise.all([
        getClientMessages(clientId),
        getClientTasks(clientId),
        getClientHistory(clientId),
        supabase.from('files').select('id,name,type,size,url,created_at').eq('client_id', clientId).order('created_at', { ascending: false })
      ]);
      setMessages(msgs);
      setTasks(tsks);
      setHistory(hist);
      setClientDocs(docsRes.data || []);
    } catch (err) {
      errorLogger.error('Error cargando datos del cliente', err);
    } finally {
      setClientDocsLoading(false);
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

  const handleCreateClient = async () => {
    if (!newClientData.name.trim()) return;

    try {
      errorLogger.log('Creando cliente:', newClientData);
      const client = await createClient(newClientData);
      
      // Registrar actividad
      await addHistoryEntry({
        client_id: client.id,
        user_id: user?.id || '',
        user_name: user?.email?.split('@')[0] || 'User',
        action_type: 'note',
        action_description: `Cliente creado: ${client.name}`
      });

      setNewClientData({
        name: '',
        email: '',
        company: '',
        phone: '',
        status: 'prospect',
        notes: '',
        industry: '',
        address: ''
      });
      setShowNewClientForm(false);
      
      // Seleccionar el nuevo cliente
      setSelectedClient(client);
      
      errorLogger.log('Cliente creado exitosamente:', client.id);
    } catch (err) {
      errorLogger.error('Error creando cliente', err);
      alert('Error al crear cliente. Por favor intenta de nuevo.');
    }
  };

  const handleInvitePortal = async () => {
    if (!selectedClient || !selectedClient.email) return;
    if (!currentTenant?.id) {
      alert('Tenant not ready yet.');
      return;
    }
    setIsInvitingPortal(true);
    setPortalInviteError(null);
    try {
      const { data: roleData, error: roleError } = await supabase
        .from('roles')
        .select('id')
        .eq('name', 'client')
        .single();
      if (roleError || !roleData) throw roleError || new Error('Client role not found');

      const { data: invite, error: inviteError } = await supabase
        .from('invitations')
        .insert({
          email: selectedClient.email,
          role_id: roleData.id,
          tenant_id: currentTenant.id,
          client_id: selectedClient.id,
          created_by: user?.id,
          type: 'client'
        })
        .select('token')
        .single();
      if (inviteError) throw inviteError;

      const link = `${window.location.origin}/accept-invite?token=${invite.token}&portal=client`;
      setPortalInviteLink(link);
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
      
      // Registrar actividad
      await addHistoryEntry({
        client_id: selectedClient.id,
        user_id: user?.id || '',
        user_name: user?.email?.split('@')[0] || 'User',
        action_type: 'note',
        action_description: `Mensaje enviado: ${newMessage.substring(0, 50)}...`
      });
    } catch (err) {
      errorLogger.error('Error enviando mensaje', err);
    }
  };

  const handleCreateTask = async (title: string, description: string, priority: string, dueDate?: string) => {
    if (!selectedClient) return;

    try {
      await createTask({
        client_id: selectedClient.id,
        owner_id: user?.id || '',
        title,
        description,
        priority: priority as 'low' | 'medium' | 'high',
        due_date: dueDate,
        completed: false
      });

      // Recargar tareas
      const updatedTasks = await getClientTasks(selectedClient.id);
      setTasks(updatedTasks);
      
      // Registrar actividad
      await addHistoryEntry({
        client_id: selectedClient.id,
        user_id: user?.id || '',
        user_name: user?.email?.split('@')[0] || 'User',
        action_type: 'task_created',
        action_description: `Tarea creada: ${title}`
      });
    } catch (err) {
      errorLogger.error('Error creando tarea', err);
    }
  };

  const handleToggleTask = async (taskId: string, completed: boolean) => {
    try {
      await updateTask(taskId, { completed });
      
      // Recargar tareas
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
      
      // Registrar actividad
      await addHistoryEntry({
        client_id: selectedClient.id,
        user_id: user?.id || '',
        user_name: user?.email?.split('@')[0] || 'User',
        action_type: 'status_change',
        action_description: `Estado cambiado a ${status}`,
        metadata: { prevStatus: selectedClient.status, newStatus: status }
      });
      
      // Actualizar cliente seleccionado
      setSelectedClient({ ...selectedClient, status });
    } catch (err) {
      errorLogger.error('Error actualizando estado', err);
    }
  };

  // Helper: Format file size
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Helper: Get icon by file type
  const getFileIcon = (type: string) => {
    if (type?.startsWith('image/')) return Icons.FileImage;
    if (type?.includes('spreadsheet') || type?.includes('excel') || type?.includes('csv')) return Icons.FileSheet;
    if (type?.includes('code') || type?.includes('javascript') || type?.includes('json') || type?.includes('html')) return Icons.FileCode;
    if (type?.includes('pdf') || type?.includes('document') || type?.includes('text')) return Icons.Docs;
    return Icons.File;
  };

  // Upload document for current client
  const handleClientDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedClient) return;

    setIsUploadingClientDoc(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sesión no disponible');

      // Get signed upload URL
      const res = await fetch('/api/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ fileName: file.name, contentType: file.type })
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: 'Error del servidor' }));
        throw new Error(errBody.error || `Error ${res.status}`);
      }
      const { token, path: storagePath, publicUrl } = await res.json();

      // Upload file
      const { error: uploadError } = await supabase.storage.from('documents')
        .uploadToSignedUrl(storagePath, token, file, { contentType: file.type || 'application/octet-stream', upsert: false });
      if (uploadError) throw new Error(uploadError.message);

      // Save metadata
      const { data: fileData, error: dbError } = await supabase.from('files').insert({
        name: file.name,
        type: file.type,
        size: file.size,
        url: publicUrl,
        folder_id: null,
        owner_id: user?.id || '',
        tenant_id: currentTenant?.id || '',
        client_id: selectedClient.id,
        project_id: null
      }).select().single();
      if (dbError) throw new Error(dbError.message);

      // Update local state
      setClientDocs(prev => [fileData, ...prev]);
      setClientDocCounts(prev => ({
        ...prev,
        [selectedClient.id]: (prev[selectedClient.id] || 0) + 1
      }));

      // Log in history
      await addHistoryEntry({
        client_id: selectedClient.id,
        user_id: user?.id || '',
        user_name: user?.email?.split('@')[0] || 'User',
        action_type: 'note',
        action_description: `Documento subido: ${file.name}`
      });

      // Refresh history
      const hist = await getClientHistory(selectedClient.id);
      setHistory(hist);
    } catch (err: any) {
      errorLogger.error('Error uploading client doc', err);
      alert(`Error al subir archivo: ${err.message}`);
    } finally {
      setIsUploadingClientDoc(false);
      if (clientFileInputRef.current) clientFileInputRef.current.value = '';
    }
  };

  // Delete a client document
  const handleDeleteClientDoc = async (doc: any) => {
    if (!selectedClient || !confirm(`¿Eliminar "${doc.name}"?`)) return;
    try {
      const { error: delErr } = await supabase.from('files').delete().eq('id', doc.id);
      if (delErr) throw delErr;
      setClientDocs(prev => prev.filter(d => d.id !== doc.id));
      setClientDocCounts(prev => ({
        ...prev,
        [selectedClient.id]: Math.max(0, (prev[selectedClient.id] || 1) - 1)
      }));
    } catch (err: any) {
      errorLogger.error('Error deleting client doc', err);
      alert(`Error al eliminar: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-zinc-900 dark:border-zinc-100 mx-auto mb-4"></div>
            <p className="text-zinc-600 dark:text-zinc-400">Cargando clientes...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error && clients.length === 0) {
    // Si es error de tabla no encontrada, permitimos que se renderice la UI vacía
    if (!error.includes('Could not find the table') && !error.includes('relation "public.clients" does not exist')) {
      return (
        <div className="max-w-7xl mx-auto p-6">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-2">Error al cargar clientes</h2>
            <p className="text-red-700 dark:text-red-400 mb-4">{error}</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
            >
              Recargar
            </button>
          </div>
        </div>
      );
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Clientes</h1>
        <button
          onClick={() => setShowNewClientForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors"
        >
          <Icons.Plus size={16} />
          Nuevo Cliente
        </button>
      </div>

      {/* Formulario de nuevo cliente */}
      {showNewClientForm && (
        <Card className="mb-6 p-6">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Crear Nuevo Cliente</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Nombre *"
              value={newClientData.name}
              onChange={(e) => setNewClientData({ ...newClientData, name: e.target.value })}
              className="px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400"
              required
            />
            <input
              type="email"
              placeholder="Email"
              value={newClientData.email}
              onChange={(e) => setNewClientData({ ...newClientData, email: e.target.value })}
              className="px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
            <input
              type="text"
              placeholder="Empresa"
              value={newClientData.company}
              onChange={(e) => setNewClientData({ ...newClientData, company: e.target.value })}
              className="px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
            <input
              type="text"
              placeholder="Teléfono"
              value={newClientData.phone}
              onChange={(e) => setNewClientData({ ...newClientData, phone: e.target.value })}
              className="px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
            <select
              value={newClientData.status}
              onChange={(e) => setNewClientData({ ...newClientData, status: e.target.value as any })}
              className="px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            >
              <option value="prospect">Prospecto</option>
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
            </select>
            <input
              type="text"
              placeholder="Industria"
              value={newClientData.industry}
              onChange={(e) => setNewClientData({ ...newClientData, industry: e.target.value })}
              className="px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
            <textarea
              placeholder="Notas"
              value={newClientData.notes}
              onChange={(e) => setNewClientData({ ...newClientData, notes: e.target.value })}
              className="px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400 md:col-span-2"
              rows={3}
            />
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleCreateClient}
              disabled={!newClientData.name.trim()}
              className="px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Crear Cliente
            </button>
            <button
              onClick={() => setShowNewClientForm(false)}
              className="px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de clientes */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Clientes ({clients.length})</h2>
            <div className="space-y-3">
              {clients.map((client) => (
                <div
                  key={client.id}
                  onClick={() => setSelectedClient(client)}
                  className={`p-4 rounded-lg border cursor-pointer transition-all ${
                    selectedClient?.id === client.id
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                      : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-zinc-900 dark:text-zinc-100">{client.name}</h3>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      client.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' :
                      client.status === 'prospect' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' :
                      'bg-gray-100 text-gray-700 dark:bg-gray-900/20 dark:text-gray-400'
                    }`}>
                      {client.status === 'prospect' ? 'Prospecto' : client.status === 'active' ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  {client.company && (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">{client.company}</p>
                  )}
                  {client.email && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-500">{client.email}</p>
                  )}
                  {client.notes && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-2 line-clamp-2">{client.notes}</p>
                  )}
                  {clientDocCounts[client.id] > 0 && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                      <Icons.Paperclip size={12} />
                      <span>{clientDocCounts[client.id]} doc{clientDocCounts[client.id] !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                </div>
              ))}
              {clients.length === 0 && (
                <div className="text-center py-8">
                  <Icons.Users size={32} className="mx-auto text-zinc-400 mb-2" />
                  <p className="text-zinc-500 dark:text-zinc-400">No hay clientes aún</p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">Crea tu primer cliente para empezar</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Detalles del cliente seleccionado */}
        <div className="lg:col-span-2">
          {selectedClient ? (
            <div className="space-y-6">
              {/* Información del cliente */}
              <Card className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{selectedClient.name}</h2>
                    {selectedClient.company && (
                      <p className="text-zinc-600 dark:text-zinc-400">{selectedClient.company}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => window.open(`/?portal=client&clientId=${selectedClient.id}`, '_blank')}
                      className="px-3 py-1 rounded text-sm font-medium border border-zinc-200 dark:border-zinc-700"
                    >
                      Ver portal
                    </button>
                    <button
                      onClick={handleInvitePortal}
                      disabled={!selectedClient.email || isInvitingPortal}
                      className="px-3 py-1 rounded text-sm font-medium bg-zinc-900 text-white disabled:opacity-60"
                    >
                      {isInvitingPortal ? 'Invitando...' : 'Invitar'}
                    </button>
                    <button
                      onClick={() => handleUpdateClientStatus(selectedClient.status === 'active' ? 'inactive' : 'active')}
                      className={`px-3 py-1 rounded text-sm font-medium ${
                        selectedClient.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' :
                        selectedClient.status === 'prospect' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' :
                        'bg-gray-100 text-gray-700 dark:bg-gray-900/20 dark:text-gray-400'
                      }`}
                    >
                      {selectedClient.status === 'prospect' ? 'Prospecto' : selectedClient.status === 'active' ? 'Activo' : 'Inactivo'}
                    </button>
                  </div>
                </div>

                {portalInviteError && (
                  <div className="mb-3 text-xs text-rose-600">{portalInviteError}</div>
                )}
                {portalInviteLink && (
                  <div className="mb-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                    Invitación creada: <a href={portalInviteLink} target="_blank" rel="noreferrer" className="underline">{portalInviteLink}</a>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  {selectedClient.email && (
                    <div>
                      <label className="text-xs text-zinc-500 dark:text-zinc-400">Email</label>
                      <p className="text-sm text-zinc-900 dark:text-zinc-100">{selectedClient.email}</p>
                    </div>
                  )}
                  {selectedClient.phone && (
                    <div>
                      <label className="text-xs text-zinc-500 dark:text-zinc-400">Teléfono</label>
                      <p className="text-sm text-zinc-900 dark:text-zinc-100">{selectedClient.phone}</p>
                    </div>
                  )}
                  {selectedClient.industry && (
                    <div>
                      <label className="text-xs text-zinc-500 dark:text-zinc-400">Industria</label>
                      <p className="text-sm text-zinc-900 dark:text-zinc-100">{selectedClient.industry}</p>
                    </div>
                  )}
                  {selectedClient.address && (
                    <div>
                      <label className="text-xs text-zinc-500 dark:text-zinc-400">Dirección</label>
                      <p className="text-sm text-zinc-900 dark:text-zinc-100">{selectedClient.address}</p>
                    </div>
                  )}
                </div>

                {selectedClient.notes && (
                  <div className="mt-4">
                    <label className="text-xs text-zinc-500 dark:text-zinc-400">Notas</label>
                    <p className="text-sm text-zinc-900 dark:text-zinc-100">{selectedClient.notes}</p>
                  </div>
                )}
              </Card>

              {/* Chat/Mensajes */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Conversación</h3>
                <div className="h-64 overflow-y-auto mb-4 p-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg">
                  {messages.length > 0 ? (
                    <div className="space-y-3">
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex ${message.sender_type === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div className={`max-w-xs px-4 py-2 rounded-lg ${
                            message.sender_type === 'user'
                              ? 'bg-zinc-900 text-white'
                              : 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700'
                          }`}>
                            <p className="text-sm">{message.message}</p>
                            <p className="text-xs opacity-70 mt-1">
                              {new Date(message.created_at).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Icons.Message size={24} className="mx-auto text-zinc-400 mb-2" />
                      <p className="text-zinc-500 dark:text-zinc-400">No hay mensajes aún</p>
                      <p className="text-xs text-zinc-400 dark:text-zinc-500">Empieza la conversación</p>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Escribe un mensaje..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    className="flex-1 px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!newMessage.trim()}
                    className="px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Icons.Send size={16} />
                  </button>
                </div>
              </Card>

              {/* Tareas */}
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Tareas</h3>
                  <button
                    onClick={() => {
                      const title = prompt('Título de la tarea:');
                      if (title) {
                        const description = prompt('Descripción (opcional):') || '';
                        const priority = prompt('Prioridad (low/medium/high):') || 'medium';
                        handleCreateTask(title, description, priority);
                      }
                    }}
                    className="px-3 py-1 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors text-sm"
                  >
                    <Icons.Plus size={14} />
                  </button>
                </div>
                <div className="space-y-2">
                  {tasks.length > 0 ? (
                    tasks.map((task) => (
                      <div key={task.id} className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg">
                        <input
                          type="checkbox"
                          checked={task.completed}
                          onChange={(e) => handleToggleTask(task.id, e.target.checked)}
                          className="rounded border-zinc-300"
                        />
                        <div className="flex-1">
                          <p className={`text-sm ${task.completed ? 'line-through text-zinc-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
                            {task.title}
                          </p>
                          {task.description && (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">{task.description}</p>
                          )}
                          {task.due_date && (
                            <p className="text-xs text-zinc-400 dark:text-zinc-500">
                              Vence: {new Date(task.due_date).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          task.priority === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400' :
                          task.priority === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' :
                          'bg-gray-100 text-gray-700 dark:bg-gray-900/20 dark:text-gray-400'
                        }`}>
                          {task.priority}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4">
                      <Icons.CheckCircle size={24} className="mx-auto text-zinc-400 mb-2" />
                      <p className="text-zinc-500 dark:text-zinc-400">No hay tareas</p>
                      <p className="text-xs text-zinc-400 dark:text-zinc-500">Crea tu primera tarea</p>
                    </div>
                  )}
                </div>
              </Card>

              {/* Documentos del cliente */}
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Documentos</h3>
                    {clientDocs.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                        {clientDocs.length}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={clientFileInputRef}
                      onChange={handleClientDocUpload}
                      className="hidden"
                    />
                    <button
                      onClick={() => clientFileInputRef.current?.click()}
                      disabled={isUploadingClientDoc}
                      className="flex items-center gap-1.5 px-3 py-1 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-50 transition-colors text-sm"
                    >
                      {isUploadingClientDoc ? (
                        <Icons.Loader size={14} className="animate-spin" />
                      ) : (
                        <Icons.Upload size={14} />
                      )}
                      <span className="hidden sm:inline">{isUploadingClientDoc ? 'Subiendo...' : 'Subir'}</span>
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {clientDocsLoading ? (
                    <div className="text-center py-6">
                      <Icons.Loader size={24} className="mx-auto text-zinc-400 mb-2 animate-spin" />
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">Cargando documentos...</p>
                    </div>
                  ) : clientDocs.length > 0 ? (
                    clientDocs.map((doc) => {
                      const FileIcon = getFileIcon(doc.type);
                      return (
                        <div key={doc.id} className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg group">
                          <div className="w-8 h-8 rounded bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center flex-shrink-0">
                            <FileIcon size={16} className="text-zinc-600 dark:text-zinc-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-zinc-900 dark:text-zinc-100 truncate">{doc.name}</p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">{formatSize(doc.size)}</p>
                          </div>
                          <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => window.open(doc.url, '_blank')}
                              className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                              title="Abrir"
                            >
                              <Icons.External size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteClientDoc(doc)}
                              className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/20 text-zinc-500 hover:text-red-600 dark:hover:text-red-400"
                              title="Eliminar"
                            >
                              <Icons.Trash size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-6">
                      <Icons.Docs size={24} className="mx-auto text-zinc-400 mb-2" />
                      <p className="text-zinc-500 dark:text-zinc-400">No hay documentos</p>
                      <p className="text-xs text-zinc-400 dark:text-zinc-500">Sube archivos para este cliente</p>
                    </div>
                  )}
                </div>
              </Card>

              {/* Historial */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Historial</h3>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {history.length > 0 ? (
                    history.map((entry) => (
                      <div key={entry.id} className="flex items-start gap-3 p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg">
                        <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center">
                          <Icons.History size={14} className="text-zinc-600 dark:text-zinc-400" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm text-zinc-900 dark:text-zinc-100">
                            <span className="font-medium">{entry.user_name}</span> {entry.action_description}
                          </p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            {new Date(entry.action_date).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4">
                      <Icons.History size={24} className="mx-auto text-zinc-400 mb-2" />
                      <p className="text-zinc-500 dark:text-zinc-400">No hay historial</p>
                      <p className="text-xs text-zinc-400 dark:text-zinc-500">Las acciones aparecerán aquí</p>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          ) : (
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-12 text-center">
              <Icons.Users size={48} className="mx-auto text-zinc-400 mb-4" />
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Selecciona un cliente</h3>
              <p className="text-zinc-500 dark:text-zinc-400">Elige un cliente de la lista para ver sus detalles</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
