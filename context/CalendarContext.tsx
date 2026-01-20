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
  type: 'meeting' | 'work-block' | 'deadline' | 'call' | 'note'
  color?: string
  all_day?: boolean
  location?: string
  client_id?: string
  project_id?: string
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
          .from('calendar_tasks')
          .select('*')
          .order('order_index', { ascending: true })
        setTasks(tasksData || [])
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
      .channel('calendar-tasks-global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_tasks' }, () => {
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

  const createTask = async (taskData: Omit<CalendarTask, 'id' | 'created_at' | 'updated_at'>) => {
    const { data, error: err } = await supabase.from('calendar_tasks').insert(taskData).select().single()
    if (err) throw err
    setTasks(prev => [...prev, data])
    return data
  }

  const updateTask = async (id: string, updates: Partial<CalendarTask>) => {
    const { data, error: err } = await supabase.from('calendar_tasks').update(updates).eq('id', id).select().single()
    if (err) throw err
    return data
  }

  const deleteTask = async (id: string) => {
    const { error: err } = await supabase.from('calendar_tasks').delete().eq('id', id)
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
    const totalEvents = events.length
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
