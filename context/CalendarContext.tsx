import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { errorLogger } from '../lib/errorLogger'

export interface CalendarEvent {
  id: string
  owner_id: string
  title: string
  description?: string
  start_date: string
  end_date?: string
  start_time?: string
  duration?: number
  type: 'meeting' | 'work-block' | 'deadline' | 'call' | 'note' | 'content'
  color?: string
  all_day?: boolean
  location?: string
  client_id?: string
  project_id?: string
  content_status?: 'draft' | 'ready' | 'published'
  content_channel?: string
  content_asset_type?: string
  // Google Calendar sync fields
  source?: 'local' | 'google'
  external_id?: string
  external_updated_at?: string
  read_only?: boolean
  created_at: string
  updated_at: string
}

export interface CalendarTask {
  id: string
  owner_id: string
  title: string
  description?: string
  completed: boolean
  priority: 'low' | 'medium' | 'high' | 'urgent'
  start_date?: string
  end_date?: string
  start_time?: string
  duration?: number
  status: 'todo' | 'in-progress' | 'done' | 'cancelled'
  assignee_id?: string
  client_id?: string
  project_id?: string
  order_index: number
  parent_task_id?: string
  created_at: string
  updated_at: string
}

export interface CalendarLabel {
  id: string
  owner_id: string
  name: string
  color: string
  created_at: string
}

interface CalendarContextType {
  events: CalendarEvent[]
  tasks: CalendarTask[]
  labels: CalendarLabel[]
  loading: boolean
  error: string | null
  isInitialized: boolean
  createEvent: (eventData: Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at'>) => Promise<CalendarEvent>
  updateEvent: (id: string, updates: Partial<CalendarEvent>) => Promise<CalendarEvent>
  deleteEvent: (id: string) => Promise<void>
  createTask: (taskData: Omit<CalendarTask, 'id' | 'created_at' | 'updated_at'>) => Promise<CalendarTask>
  updateTask: (id: string, updates: Partial<CalendarTask>) => Promise<CalendarTask>
  deleteTask: (id: string) => Promise<void>
  moveTask: (taskId: string, newDate: string, newTime?: string) => Promise<void>
  moveEvent: (eventId: string, newDate: string, newTime?: string) => Promise<void>
  getEventsByDate: (date: string) => CalendarEvent[]
  getTasksByDate: (date: string) => CalendarTask[]
  getEventsByDateRange: (startDate: string, endDate: string) => CalendarEvent[]
  getTasksByDateRange: (startDate: string, endDate: string) => CalendarTask[]
  createLabel: (labelData: Omit<CalendarLabel, 'id' | 'created_at'>) => Promise<CalendarLabel>
  getCalendarStats: () => {
    totalEvents: number
    totalTasks: number
    completedTasks: number
    pendingTasks: number
    overdueTasks: number
    completionRate: number
  }
  refreshData: () => Promise<void>
}

const CalendarContext = createContext<CalendarContextType | undefined>(undefined)

export const CalendarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [tasks, setTasks] = useState<CalendarTask[]>([])
  const [labels, setLabels] = useState<CalendarLabel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  const loadCalendarData = useCallback(async (force = false) => {
    if (isInitialized && !force) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    
    try {
      errorLogger.log('Cargando datos del calendario...')
      
      // Intentar cargar eventos
      try {
        const { data: eventsData } = await supabase
          .from('calendar_events')
          .select('*')
          .order('start_date', { ascending: true })
        setEvents(eventsData || [])
      } catch (e: any) {
        setEvents([])
      }
      
      // Intentar cargar tareas
      try {
        const { data: tasksData } = await supabase
          .from('tasks')
          .select('*')
          .order('created_at', { ascending: false })

        const normalizedTasks = (tasksData || []).map((task: any) => ({
          id: task.id,
          owner_id: task.owner_id ?? task.user_id ?? '',
          title: task.title ?? 'Untitled Task',
          description: task.description ?? task.notes ?? '',
          completed: !!task.completed,
          priority: task.priority ?? 'medium',
          start_date: task.start_date ?? task.due_date ?? undefined,
          end_date: task.end_date ?? undefined,
          start_time: task.start_time ?? undefined,
          duration: task.duration ?? undefined,
          status: task.status ?? 'todo',
          assignee_id: task.assignee_id ?? undefined,
          client_id: task.client_id ?? undefined,
          project_id: task.project_id ?? undefined,
          order_index: task.order_index ?? 0,
          parent_task_id: task.parent_task_id ?? undefined,
          created_at: task.created_at ?? new Date().toISOString(),
          updated_at: task.updated_at ?? new Date().toISOString(),
        }))

        setTasks(normalizedTasks)
      } catch (e: any) {
        setTasks([])
      }
      
      // Intentar cargar etiquetas
      try {
        const { data: labelsData } = await supabase
          .from('calendar_labels')
          .select('*')
          .order('name', { ascending: true })
        setLabels(labelsData || [])
      } catch (e: any) {
        setLabels([])
      }
      
      setIsInitialized(true)
      
    } catch (err: any) {
      errorLogger.error('Error cargando datos del calendario', err)
      setIsInitialized(true)
    } finally {
      setLoading(false)
    }
  }, [isInitialized])

  useEffect(() => {
    loadCalendarData()

    // Suscribirse a cambios en tiempo real
    const eventsChannel = supabase
      .channel('calendar-events-global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, () => {
        loadCalendarData(true)
      })
      .subscribe()

    const tasksChannel = supabase
      .channel('tasks-global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        loadCalendarData(true)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(eventsChannel)
      supabase.removeChannel(tasksChannel)
    }
  }, [loadCalendarData])

  // ... (Funciones de mutación copiadas y adaptadas)
  const createEvent = async (eventData: Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at'>) => {
    const { data, error: err } = await supabase.from('calendar_events').insert(eventData).select().single()
    if (err) throw err
    // Realtime actualizará el estado, pero optimísticamente:
    setEvents(prev => [...prev, data])
    return data
  }

  const updateEvent = async (id: string, updates: Partial<CalendarEvent>) => {
    const { data, error: err } = await supabase.from('calendar_events').update(updates).eq('id', id).select().single()
    if (err) throw err
    return data
  }

  const deleteEvent = async (id: string) => {
    const { error: err } = await supabase.from('calendar_events').delete().eq('id', id)
    if (err) throw err
  }

  const getMissingColumn = (message: string) => {
    const match = message.match(/column\s+"([^"]+)"\s+does\s+not\s+exist/i)
    return match?.[1] || null
  }

  const createTask = async (taskData: Omit<CalendarTask, 'id' | 'created_at' | 'updated_at'>) => {
    const payload: any = {
      title: taskData.title,
      description: taskData.description,
      completed: taskData.completed,
      priority: taskData.priority,
      status: taskData.status,
      project_id: taskData.project_id,
      assignee_id: taskData.assignee_id,
      due_date: taskData.start_date,
      owner_id: taskData.owner_id,
    }

    const { data, error: err } = await supabase.from('tasks').insert(payload).select().single()
    if (err) {
      const missingColumn = getMissingColumn(err.message || '')
      if (missingColumn && Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
        const { [missingColumn]: _omitted, ...retryPayload } = payload
        const { data: retryData, error: retryError } = await supabase.from('tasks').insert(retryPayload).select().single()
        if (retryError) throw retryError
        setTasks(prev => [...prev, {
          id: retryData.id,
          owner_id: retryData.owner_id ?? taskData.owner_id,
          title: retryData.title ?? taskData.title,
          description: retryData.description ?? taskData.description,
          completed: !!retryData.completed,
          priority: retryData.priority ?? taskData.priority,
          start_date: retryData.start_date ?? retryData.due_date ?? taskData.start_date,
          end_date: retryData.end_date,
          start_time: retryData.start_time,
          duration: retryData.duration,
          status: retryData.status ?? taskData.status,
          assignee_id: retryData.assignee_id ?? taskData.assignee_id,
          client_id: retryData.client_id ?? taskData.client_id,
          project_id: retryData.project_id ?? taskData.project_id,
          order_index: retryData.order_index ?? 0,
          parent_task_id: retryData.parent_task_id,
          created_at: retryData.created_at ?? new Date().toISOString(),
          updated_at: retryData.updated_at ?? new Date().toISOString(),
        } as CalendarTask])
        return retryData as CalendarTask
      }
      throw err
    }
    setTasks(prev => [...prev, {
      id: data.id,
      owner_id: data.owner_id ?? taskData.owner_id,
      title: data.title ?? taskData.title,
      description: data.description ?? taskData.description,
      completed: !!data.completed,
      priority: data.priority ?? taskData.priority,
      start_date: data.start_date ?? data.due_date ?? taskData.start_date,
      end_date: data.end_date,
      start_time: data.start_time,
      duration: data.duration,
      status: data.status ?? taskData.status,
      assignee_id: data.assignee_id ?? taskData.assignee_id,
      client_id: data.client_id ?? taskData.client_id,
      project_id: data.project_id ?? taskData.project_id,
      order_index: data.order_index ?? 0,
      parent_task_id: data.parent_task_id,
      created_at: data.created_at ?? new Date().toISOString(),
      updated_at: data.updated_at ?? new Date().toISOString(),
    } as CalendarTask])
    return data as CalendarTask
  }

  const updateTask = async (id: string, updates: Partial<CalendarTask>) => {
    const payload: any = { ...updates }
    if (payload.start_date) {
      payload.due_date = payload.start_date
      delete payload.start_date
    }

    const { data, error: err } = await supabase.from('tasks').update(payload).eq('id', id).select().single()
    if (err) {
      const missingColumn = getMissingColumn(err.message || '')
      if (missingColumn && Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
        const { [missingColumn]: _omitted, ...retryPayload } = payload
        const { data: retryData, error: retryError } = await supabase.from('tasks').update(retryPayload).eq('id', id).select().single()
        if (retryError) throw retryError
        return retryData as CalendarTask
      }
      throw err
    }
    return data as CalendarTask
  }

  const deleteTask = async (id: string) => {
    const { error: err } = await supabase.from('tasks').delete().eq('id', id)
    if (err) throw err
  }

  const moveTask = async (taskId: string, newDate: string, newTime?: string) => {
    await updateTask(taskId, { start_date: newDate, start_time: newTime, updated_at: new Date().toISOString() })
  }

  const moveEvent = async (eventId: string, newDate: string, newTime?: string) => {
    await updateEvent(eventId, { start_date: newDate, start_time: newTime, updated_at: new Date().toISOString() })
  }

  const createLabel = async (labelData: Omit<CalendarLabel, 'id' | 'created_at'>) => {
    const { data, error: err } = await supabase.from('calendar_labels').insert(labelData).select().single()
    if (err) throw err
    setLabels(prev => [...prev, data])
    return data
  }

  // Getters
  const getEventsByDate = (date: string) => events.filter(event => event.start_date === date)
  const getTasksByDate = (date: string) => tasks.filter(task => task.start_date === date)
  const getEventsByDateRange = (startDate: string, endDate: string) => events.filter(event => event.start_date >= startDate && event.start_date <= endDate)
  const getTasksByDateRange = (startDate: string, endDate: string) => tasks.filter(task => task.start_date && task.start_date >= startDate && task.start_date <= endDate)

  const getCalendarStats = () => {
    // Exclude synced Google events from local stats
    const localEvents = events.filter(e => e.source !== 'google')
    const totalEvents = localEvents.length
    const totalTasks = tasks.length
    const completedTasks = tasks.filter(task => task.completed).length
    const pendingTasks = tasks.filter(task => !task.completed).length
    const today = new Date().toISOString().split('T')[0]
    const overdueTasks = tasks.filter(task => task.start_date && task.start_date < today && !task.completed).length

    return {
      totalEvents,
      totalTasks,
      completedTasks,
      pendingTasks,
      overdueTasks,
      completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
    }
  }

  return (
    <CalendarContext.Provider value={{
      events, tasks, labels, loading, error, isInitialized,
      createEvent, updateEvent, deleteEvent,
      createTask, updateTask, deleteTask,
      moveTask, moveEvent,
      getEventsByDate, getTasksByDate, getEventsByDateRange, getTasksByDateRange,
      createLabel, getCalendarStats, refreshData: () => loadCalendarData(true)
    }}>
      {children}
    </CalendarContext.Provider>
  )
}

export const useCalendar = () => {
  const context = useContext(CalendarContext)
  if (context === undefined) {
    throw new Error('useCalendar must be used within a CalendarProvider')
  }
  return context
}
