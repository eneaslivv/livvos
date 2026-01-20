import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { errorLogger } from '../lib/errorLogger'

// Interfaces (copiadas de useClients.ts)
export interface Client {
  id: string
  owner_id: string
  name: string
  email?: string
  company?: string
  phone?: string
  avatar_url?: string
  status: 'active' | 'inactive' | 'prospect'
  notes?: string
  address?: string
  industry?: string
  created_at: string
  updated_at: string
}

export interface ClientMessage {
  id: string
  client_id: string
  sender_type: 'user' | 'client'
  sender_id?: string
  sender_name: string
  message: string
  message_type: 'text' | 'file' | 'image'
  file_url?: string
  file_name?: string
  created_at: string
  read_at?: string
}

export interface ClientTask {
  id: string
  client_id: string
  owner_id: string
  title: string
  description?: string
  completed: boolean
  priority: 'low' | 'medium' | 'high'
  due_date?: string
  created_at: string
  updated_at: string
}

export interface ClientHistory {
  id: string
  client_id: string
  user_id: string
  user_name: string
  action_type: 'call' | 'meeting' | 'email' | 'note' | 'status_change' | 'task_created'
  action_description: string
  action_date: string
  metadata?: any
}

interface ClientsContextType {
  clients: Client[]
  loading: boolean
  error: string | null
  createClient: (clientData: Omit<Client, 'id' | 'owner_id' | 'created_at' | 'updated_at'>) => Promise<Client>
  updateClient: (id: string, updates: Partial<Client>) => Promise<Client>
  deleteClient: (id: string) => Promise<void>
  getClientMessages: (clientId: string) => Promise<ClientMessage[]>
  sendMessage: (messageData: Omit<ClientMessage, 'id' | 'created_at' | 'read_at'>) => Promise<ClientMessage>
  getClientTasks: (clientId: string) => Promise<ClientTask[]>
  createTask: (taskData: Omit<ClientTask, 'id' | 'created_at' | 'updated_at'>) => Promise<ClientTask>
  updateTask: (id: string, updates: Partial<ClientTask>) => Promise<ClientTask>
  getClientHistory: (clientId: string) => Promise<ClientHistory[]>
  addHistoryEntry: (historyData: Omit<ClientHistory, 'id'>) => Promise<ClientHistory>
  refreshClients: () => Promise<void>
}

const ClientsContext = createContext<ClientsContextType | undefined>(undefined)

export const ClientsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  const fetchClients = useCallback(async (force = false) => {
    // Si ya está inicializado y no forzamos, no hacemos nada (cache hit)
    if (isInitialized && !force) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    
    try {
      errorLogger.log('Fetching clients from Supabase...')
      const { data, error: err } = await supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (err) {
        // Ignorar error si la tabla no existe aún (primera carga)
        // 42P01: relation does not exist
        // PGRST116: result contains 0 rows (no es error, pero a veces supabase lo tira así en single())
        if (err.code === 'PGRST116' || err.code === '42P01') {
          errorLogger.warn('Clients table not found or empty, initializing empty')
          setClients([])
        } else {
          errorLogger.error('Error fetching clients', err)
          setError(err.message)
        }
      } else {
        setClients(data || [])
        errorLogger.log(`Clientes cargados: ${data?.length || 0}`)
      }
      setIsInitialized(true)
    } catch (err: any) {
      errorLogger.error('Error en fetchClients', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [isInitialized])

  // Cargar clientes al montar el Provider (una sola vez por sesión de app)
  useEffect(() => {
    fetchClients()

    // Suscribirse a cambios en tiempo real
    const channel = supabase
      .channel('clients-changes-global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, (payload) => {
        errorLogger.log('Cambio en clients (Realtime):', payload.eventType)
        
        if (payload.eventType === 'INSERT') {
          setClients(prev => [payload.new as Client, ...prev])
        } else if (payload.eventType === 'UPDATE') {
          setClients(prev => prev.map(client => 
            client.id === payload.new.id ? payload.new as Client : client
          ))
        } else if (payload.eventType === 'DELETE') {
          setClients(prev => prev.filter(client => client.id !== payload.old.id))
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchClients])

  const createClient = async (clientData: Omit<Client, 'id' | 'owner_id' | 'created_at' | 'updated_at'>) => {
    try {
      const { data, error: err } = await supabase
        .from('clients')
        .insert(clientData)
        .select()
        .single()
      
      if (err) throw err
      // El estado se actualizará vía realtime, pero podemos actualizar optimísticamente si queremos
      return data
    } catch (err) {
      throw err
    }
  }

  const updateClient = async (id: string, updates: Partial<Client>) => {
    try {
      const { data, error: err } = await supabase
        .from('clients')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      
      if (err) throw err
      return data
    } catch (err) {
      throw err
    }
  }

  const deleteClient = async (id: string) => {
    try {
      const { error: err } = await supabase
        .from('clients')
        .delete()
        .eq('id', id)
      
      if (err) throw err
    } catch (err) {
      throw err
    }
  }

  // Funciones auxiliares (no modifican estado global de clients, son bajo demanda)
  const getClientMessages = async (clientId: string) => {
    try {
      const { data, error } = await supabase
        .from('client_messages')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: true })
      
      if (error) {
        if (error.code === '42P01') return [] // Tabla no existe
        throw error
      }
      return data || []
    } catch (e) {
      return []
    }
  }

  const sendMessage = async (messageData: Omit<ClientMessage, 'id' | 'created_at' | 'read_at'>) => {
    const { data, error } = await supabase
      .from('client_messages')
      .insert(messageData)
      .select()
      .single()
    
    if (error) throw error
    return data
  }

  const getClientTasks = async (clientId: string) => {
    try {
      const { data, error } = await supabase
        .from('client_tasks')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
      
      if (error) {
        if (error.code === '42P01') return []
        throw error
      }
      return data || []
    } catch (e) {
      return []
    }
  }

  const createTask = async (taskData: Omit<ClientTask, 'id' | 'created_at' | 'updated_at'>) => {
    const { data, error } = await supabase
      .from('client_tasks')
      .insert(taskData)
      .select()
      .single()
    
    if (error) throw error
    return data
  }

  const updateTask = async (id: string, updates: Partial<ClientTask>) => {
    const { data, error } = await supabase
      .from('client_tasks')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data
  }

  const getClientHistory = async (clientId: string) => {
    try {
      const { data, error } = await supabase
        .from('client_history')
        .select('*')
        .eq('client_id', clientId)
        .order('action_date', { ascending: false })
      
      if (error) {
        if (error.code === '42P01') return []
        throw error
      }
      return data || []
    } catch (e) {
      return []
    }
  }

  const addHistoryEntry = async (historyData: Omit<ClientHistory, 'id'>) => {
    const { data, error } = await supabase
      .from('client_history')
      .insert(historyData)
      .select()
      .single()
    
    if (error) throw error
    return data
  }

  return (
    <ClientsContext.Provider value={{
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
      addHistoryEntry,
      refreshClients: () => fetchClients(true)
    }}>
      {children}
    </ClientsContext.Provider>
  )
}

// Hook personalizado para usar el contexto
export const useClients = () => {
  const context = useContext(ClientsContext)
  if (context === undefined) {
    throw new Error('useClients must be used within a ClientsProvider')
  }
  return context
}
