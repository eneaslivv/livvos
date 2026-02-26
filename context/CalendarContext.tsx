import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
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
  blocked_by?: string
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

// Helper: extract just the YYYY-MM-DD portion from a TIMESTAMPTZ string
const toDateOnly = (v: any): string | undefined =>
  v ? String(v).slice(0, 10) : undefined

// Helper: normalize a raw DB task row into our CalendarTask shape
const normalizeTask = (task: any): CalendarTask => ({
  id: task.id,
  owner_id: task.owner_id ?? task.user_id ?? '',
  title: task.title ?? 'Untitled Task',
  description: task.description ?? task.notes ?? '',
  completed: !!task.completed,
  priority: task.priority ?? 'medium',
  start_date: toDateOnly(task.start_date ?? task.due_date),
  end_date: toDateOnly(task.end_date),
  start_time: task.start_time ?? undefined,
  duration: task.duration ?? undefined,
  status: task.status ?? 'todo',
  assignee_id: task.assignee_id ?? undefined,
  client_id: task.client_id ?? undefined,
  project_id: task.project_id ?? undefined,
  order_index: task.order_index ?? 0,
  parent_task_id: task.parent_task_id ?? undefined,
  blocked_by: task.blocked_by ?? undefined,
  created_at: task.created_at ?? new Date().toISOString(),
  updated_at: task.updated_at ?? new Date().toISOString(),
})

export const CalendarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [tasks, setTasks] = useState<CalendarTask[]>([])
  const [labels, setLabels] = useState<CalendarLabel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  // Cache tenant_id so we never re-query it on every mutation
  const cachedTenantIdRef = useRef<string | null>(null)
  const tenantIdResolvedRef = useRef(false)

  // Resolve tenant_id once at startup (non-blocking for UI)
  const resolveTenantId = useCallback(async () => {
    if (tenantIdResolvedRef.current) return cachedTenantIdRef.current
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('tenant_id')
          .eq('id', user.id)
          .single()
        cachedTenantIdRef.current = profile?.tenant_id || null
      }
    } catch {
      // Continue without tenant_id
    }
    tenantIdResolvedRef.current = true
    return cachedTenantIdRef.current
  }, [])

  const loadCalendarData = useCallback(async (force = false) => {
    if (isInitialized && !force) {
      setLoading(false)
      return
    }

    // Only show loading on initial load, not on force-refreshes
    if (!isInitialized) {
      setLoading(true)
    }
    setError(null)

    try {
      // Load events, tasks, and labels in PARALLEL
      const safeQuery = async (query: PromiseLike<{ data: any[] | null }>) => {
        try {
          const result = await query
          return result.data || []
        } catch {
          return [] as any[]
        }
      }

      const [eventsResult, tasksResult, labelsResult] = await Promise.all([
        safeQuery(supabase.from('calendar_events').select('*').order('start_date', { ascending: true })),
        safeQuery(supabase.from('tasks').select('*').order('created_at', { ascending: false })),
        safeQuery(supabase.from('calendar_labels').select('*').order('name', { ascending: true })),
      ])

      setEvents(eventsResult as CalendarEvent[])
      setTasks((tasksResult as any[]).map(normalizeTask))
      setLabels(labelsResult as CalendarLabel[])
      setIsInitialized(true)

    } catch (err: any) {
      errorLogger.error('Error cargando datos del calendario', err)
      setIsInitialized(true)
    } finally {
      setLoading(false)
    }
  }, [isInitialized])

  // Resolve tenant_id in background on mount
  useEffect(() => {
    resolveTenantId()
  }, [resolveTenantId])

  useEffect(() => {
    loadCalendarData()

    // ─── Realtime: targeted state updates instead of full reload ───
    const eventsChannel = supabase
      .channel('calendar-events-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calendar_events' }, (payload) => {
        const newEvent = payload.new as CalendarEvent
        setEvents(prev => {
          if (prev.some(e => e.id === newEvent.id)) return prev
          return [...prev, newEvent]
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calendar_events' }, (payload) => {
        const updated = payload.new as CalendarEvent
        setEvents(prev => prev.map(e => e.id === updated.id ? updated : e))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'calendar_events' }, (payload) => {
        const deletedId = payload.old?.id
        if (deletedId) setEvents(prev => prev.filter(e => e.id !== deletedId))
      })
      .subscribe()

    const tasksChannel = supabase
      .channel('tasks-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks' }, (payload) => {
        const newTask = normalizeTask(payload.new)
        setTasks(prev => {
          if (prev.some(t => t.id === newTask.id)) return prev
          return [...prev, newTask]
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks' }, (payload) => {
        const updated = normalizeTask(payload.new)
        setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tasks' }, (payload) => {
        const deletedId = payload.old?.id
        if (deletedId) setTasks(prev => prev.filter(t => t.id !== deletedId))
      })
      .subscribe()

    return () => {
      supabase.removeChannel(eventsChannel)
      supabase.removeChannel(tasksChannel)
    }
  }, [loadCalendarData])

  const getMissingColumn = (message: string) => {
    const match = message.match(/column\s+"([^"]+)"\s+does\s+not\s+exist/i)
    return match?.[1] || null
  }

  // ─── EVENTS: optimistic create / update / delete ───

  const createEvent = async (eventData: Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at'>) => {
    // Optimistic: show immediately with temp id
    const tempId = `temp-${Date.now()}`
    const now = new Date().toISOString()
    const optimistic: CalendarEvent = {
      ...eventData,
      id: tempId,
      created_at: now,
      updated_at: now,
    }
    setEvents(prev => [...prev, optimistic])

    try {
      const { data, error: err } = await supabase.from('calendar_events').insert(eventData).select().single()
      if (err) throw err
      // Replace temp with real data
      setEvents(prev => prev.map(e => e.id === tempId ? data : e))
      return data
    } catch (err) {
      // Rollback optimistic
      setEvents(prev => prev.filter(e => e.id !== tempId))
      throw err
    }
  }

  const updateEvent = async (id: string, updates: Partial<CalendarEvent>) => {
    // Optimistic update
    const backup = events.find(e => e.id === id)
    setEvents(prev => prev.map(e => e.id === id ? { ...e, ...updates, updated_at: new Date().toISOString() } : e))

    try {
      const { data, error: err } = await supabase.from('calendar_events').update(updates).eq('id', id).select().single()
      if (err) throw err
      setEvents(prev => prev.map(e => e.id === id ? data : e))
      return data
    } catch (err) {
      // Rollback
      if (backup) setEvents(prev => prev.map(e => e.id === id ? backup : e))
      throw err
    }
  }

  const deleteEvent = async (id: string) => {
    // Optimistic remove
    const backup = events.find(e => e.id === id)
    setEvents(prev => prev.filter(e => e.id !== id))

    try {
      const { error: err } = await supabase.from('calendar_events').delete().eq('id', id)
      if (err) throw err
    } catch (err) {
      if (backup) setEvents(prev => [...prev, backup])
      throw err
    }
  }

  // ─── TASKS: optimistic create / update / delete ───

  const createTask = async (taskData: Omit<CalendarTask, 'id' | 'created_at' | 'updated_at'>) => {
    // Optimistic: show the task IMMEDIATELY in the UI
    const tempId = `temp-${Date.now()}`
    const now = new Date().toISOString()
    const optimistic: CalendarTask = {
      ...taskData,
      id: tempId,
      start_date: taskData.start_date,
      start_time: taskData.start_time,
      duration: taskData.duration,
      order_index: taskData.order_index ?? 0,
      created_at: now,
      updated_at: now,
    }
    setTasks(prev => [...prev, optimistic])

    try {
      // Use cached tenant_id (resolved once at startup — zero extra queries)
      const tenantId = cachedTenantIdRef.current

      const payload: any = {
        title: taskData.title,
        description: taskData.description,
        completed: taskData.completed,
        priority: taskData.priority,
        status: taskData.status,
        project_id: taskData.project_id || null,
        client_id: taskData.client_id || null,
        assignee_id: taskData.assignee_id,
        due_date: taskData.start_date,
        start_time: taskData.start_time || null,
        duration: taskData.duration || null,
        owner_id: taskData.owner_id,
        ...(taskData.parent_task_id && { parent_task_id: taskData.parent_task_id }),
        ...(taskData.blocked_by && { blocked_by: taskData.blocked_by }),
        ...(tenantId && { tenant_id: tenantId }),
      }

      const { data, error: err } = await supabase.from('tasks').insert(payload).select().single()
      if (err) {
        const missingColumn = getMissingColumn(err.message || '')
        if (missingColumn && Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
          const { [missingColumn]: _omitted, ...retryPayload } = payload
          const { data: retryData, error: retryError } = await supabase.from('tasks').insert(retryPayload).select().single()
          if (retryError) throw retryError
          const normalized = normalizeTask(retryData)
          setTasks(prev => prev.map(t => t.id === tempId ? normalized : t))
          return normalized
        }
        throw err
      }

      const normalized = normalizeTask(data)
      // Replace temp with real server data
      setTasks(prev => prev.map(t => t.id === tempId ? normalized : t))
      return normalized
    } catch (err) {
      // Rollback optimistic on error
      setTasks(prev => prev.filter(t => t.id !== tempId))
      throw err
    }
  }

  const updateTask = async (id: string, updates: Partial<CalendarTask>) => {
    // Optimistic update — UI changes INSTANTLY
    const backup = tasks.find(t => t.id === id)
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates, updated_at: new Date().toISOString() } : t))

    const payload: any = { ...updates }
    if (payload.start_date) {
      payload.due_date = payload.start_date
      delete payload.start_date
    }

    try {
      const { data, error: err } = await supabase.from('tasks').update(payload).eq('id', id).select().single()
      if (err) {
        const missingColumn = getMissingColumn(err.message || '')
        if (missingColumn && Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
          const { [missingColumn]: _omitted, ...retryPayload } = payload
          const { data: retryData, error: retryError } = await supabase.from('tasks').update(retryPayload).eq('id', id).select().single()
          if (retryError) throw retryError
          const normalized = normalizeTask(retryData)
          setTasks(prev => prev.map(t => t.id === id ? normalized : t))
          return normalized
        }
        throw err
      }
      const normalized = normalizeTask(data)
      setTasks(prev => prev.map(t => t.id === id ? normalized : t))
      return normalized
    } catch (err) {
      // Rollback
      if (backup) setTasks(prev => prev.map(t => t.id === id ? backup : t))
      throw err
    }
  }

  const deleteTask = async (id: string) => {
    // Optimistic remove — disappears INSTANTLY
    const backup = tasks.find(t => t.id === id)
    setTasks(prev => prev.filter(t => t.id !== id))

    try {
      const { error: err } = await supabase.from('tasks').delete().eq('id', id)
      if (err) throw err
    } catch (err) {
      if (backup) setTasks(prev => [...prev, backup])
      throw err
    }
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

  // Getters — always compare date-only portion (TIMESTAMPTZ can include time)
  const getEventsByDate = (date: string) => events.filter(event => event.start_date?.slice(0, 10) === date)
  const getTasksByDate = (date: string) => tasks.filter(task => task.start_date?.slice(0, 10) === date)
  const getEventsByDateRange = (startDate: string, endDate: string) => events.filter(event => {
    const d = event.start_date?.slice(0, 10)
    return d && d >= startDate && d <= endDate
  })
  const getTasksByDateRange = (startDate: string, endDate: string) => tasks.filter(task => {
    const d = task.start_date?.slice(0, 10)
    return d && d >= startDate && d <= endDate
  })

  const getCalendarStats = () => {
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
