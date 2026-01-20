import React, { useState, useEffect } from 'react';
import { Icons } from '../components/ui/Icons';
import { Card } from '../components/ui/Card';
import { useClients, Client, ClientMessage, ClientTask, ClientHistory } from '../hooks/useClients';
import { useAuth } from '../hooks/useAuth';
import { errorLogger } from '../lib/errorLogger';
import { supabase } from '../lib/supabase';

export const Clients: React.FC = () => {
  const { user } = useAuth();
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