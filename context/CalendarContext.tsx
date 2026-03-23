import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { errorLogger } from '../lib/errorLogger'
import { notifyWithEmail } from '../lib/notifyWithEmail'

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
  assignee_ids: string[]
  client_id?: string
  project_id?: string
  order_index: number
  parent_task_id?: string
  blocked_by?: string
  document_id?: string
  group_name?: string
  created_at: string
  updated_at: string
  completed_at?: string | null
}

export interface CalendarLabel {
  id: string
  owner_id: string
  tenant_id?: string
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
  assignee_id: task.assigned_to ?? task.assignee_id ?? undefined,
  assignee_ids: task.assignee_ids?.length
    ? task.assignee_ids
    : (task.assigned_to || task.assignee_id) ? [task.assigned_to || task.assignee_id] : [],
  client_id: task.client_id ?? undefined,
  project_id: task.project_id ?? undefined,
  order_index: task.order_index ?? 0,
  parent_task_id: task.parent_task_id ?? undefined,
  blocked_by: task.blocked_by ?? undefined,
  document_id: task.document_id ?? undefined,
  group_name: task.group_name || 'General',
  created_at: task.created_at ?? new Date().toISOString(),
  updated_at: task.updated_at ?? new Date().toISOString(),
  completed_at: task.completed_at ?? null,
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

  const hasLoadedCalendarRef = useRef(false)

  const loadCalendarData = useCallback(async (force = false) => {
    if (hasLoadedCalendarRef.current && !force) {
      setLoading(false)
      return
    }

    // Only show loading on first load, not on background re-fetches
    if (!hasLoadedCalendarRef.current) {
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

      const tenantId = await resolveTenantId()

      const eventsQuery = supabase.from('calendar_events').select('*').order('start_date', { ascending: true })
      const tasksQuery = supabase.from('tasks').select('*').order('created_at', { ascending: false })
      const labelsQuery = supabase.from('calendar_labels').select('*').order('name', { ascending: true })

      if (tenantId) {
        eventsQuery.eq('tenant_id', tenantId)
        tasksQuery.eq('tenant_id', tenantId)
        labelsQuery.eq('tenant_id', tenantId)
      }

      const [eventsResult, tasksResult, labelsResult] = await Promise.all([
        safeQuery(eventsQuery),
        safeQuery(tasksQuery),
        safeQuery(labelsQuery),
      ])

      setEvents(eventsResult as CalendarEvent[])
      setTasks((tasksResult as any[]).map(normalizeTask))
      setLabels(labelsResult as CalendarLabel[])
      hasLoadedCalendarRef.current = true
      setIsInitialized(true)

    } catch (err: any) {
      errorLogger.error('Error cargando datos del calendario', err)
      hasLoadedCalendarRef.current = true
      setIsInitialized(true)
    } finally {
      setLoading(false)
    }
  }, []) // stable — no dependencies, uses ref instead of state

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
    // Match "column X does not exist" errors
    const colMatch = message.match(/column\s+"([^"]+)"\s+does\s+not\s+exist/i)
    if (colMatch?.[1]) return colMatch[1]
    // Match "invalid input" errors for specific columns (e.g. empty string for TIMESTAMPTZ)
    const valMatch = message.match(/invalid input.*for.*column\s+"([^"]+)"/i)
    if (valMatch?.[1]) return valMatch[1]
    // Match PL/pgSQL trigger errors: record "new" has no field "X"
    const triggerMatch = message.match(/has no field\s+"([^"]+)"/i)
    if (triggerMatch?.[1]) return triggerMatch[1]
    // Match "Could not find" or "unknown column" patterns
    const unknownMatch = message.match(/(?:unknown|undefined)\s+column\s+"([^"]+)"/i)
    return unknownMatch?.[1] || null
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
      const tenantId = await resolveTenantId()
      const insertData = { ...eventData, ...(tenantId && { tenant_id: tenantId }) }
      const { data, error: err } = await supabase.from('calendar_events').insert(insertData).select().single()
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
      // Ensure tenant_id is resolved before inserting (awaits once, then cached)
      const tenantId = await resolveTenantId()

      const assigneeIds = taskData.assignee_ids?.length ? taskData.assignee_ids : (taskData.assignee_id ? [taskData.assignee_id] : [])
      const payload: any = {
        title: taskData.title,
        description: taskData.description,
        completed: taskData.completed,
        priority: taskData.priority,
        status: taskData.status,
        project_id: taskData.project_id || null,
        client_id: taskData.client_id || null,
        assigned_to: assigneeIds[0] || null,
        assignee_ids: assigneeIds,
        owner_id: taskData.owner_id || null,
        due_date: taskData.start_date || null,
        start_date: taskData.start_date || null,
        start_time: taskData.start_time || null,
        duration: taskData.duration || null,
        ...(taskData.parent_task_id && { parent_task_id: taskData.parent_task_id }),
        ...(taskData.blocked_by && { blocked_by: taskData.blocked_by }),
        ...(taskData.document_id && { document_id: taskData.document_id }),
        ...(tenantId && { tenant_id: tenantId }),
      }

      let currentPayload = { ...payload }
      for (let attempt = 0; attempt < 8; attempt++) {
        const { data, error: err } = await supabase.from('tasks').insert(currentPayload).select().single()
        if (!err) {
          const normalized = normalizeTask(data)
          setTasks(prev => prev.map(t => t.id === tempId ? normalized : t))

          // Notify all assignees (fire-and-forget)
          const allAssignees: string[] = data.assignee_ids?.length ? data.assignee_ids : (data.assigned_to ? [data.assigned_to] : [])
          const tenantIdForNotify = data.tenant_id || currentPayload.tenant_id
          if (tenantIdForNotify) {
            allAssignees.filter((aid: string) => aid !== taskData.owner_id).forEach((aid: string) => {
              notifyWithEmail({
                userId: aid,
                tenantId: tenantIdForNotify,
                type: 'task',
                title: `New task assigned: ${data.title}`,
                message: data.description || 'You have been assigned a new task.',
                priority: data.priority || 'medium',
                link: '/calendar',
                actionText: 'View Task',
              }).catch(() => {})
            })
          }

          return normalized
        }
        const missingColumn = getMissingColumn(err.message || '')
        if (missingColumn && Object.prototype.hasOwnProperty.call(currentPayload, missingColumn)) {
          const { [missingColumn]: _omitted, ...rest } = currentPayload
          currentPayload = rest
          continue
        }
        throw err
      }
      throw new Error('Too many missing columns in tasks insert')
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
    // Map frontend field names to DB column names
    if ('assignee_ids' in payload) {
      const ids: string[] = payload.assignee_ids || []
      payload.assignee_ids = ids
      payload.assigned_to = ids[0] || null // keep legacy column in sync
    }
    if ('assignee_id' in payload) {
      payload.assigned_to = payload.assignee_id || null
      delete payload.assignee_id
    }
    // Sanitize FK fields: empty string → null for DB
    if ('project_id' in payload) payload.project_id = payload.project_id || null
    if ('client_id' in payload) payload.client_id = payload.client_id || null
    // Sanitize timestamp/nullable fields: empty string → null (prevents DB parse errors)
    if ('start_date' in payload) payload.start_date = payload.start_date || null
    if ('end_date' in payload) payload.end_date = payload.end_date || null
    if ('due_date' in payload) payload.due_date = payload.due_date || null
    if ('start_time' in payload) payload.start_time = payload.start_time || null
    if ('blocked_by' in payload) payload.blocked_by = payload.blocked_by || null
    if (payload.start_date) {
      payload.due_date = payload.start_date
    }
    // Strip read-only / frontend-only fields
    delete payload.id
    delete payload.created_at
    delete payload.updated_at
    delete payload.owner_id

    try {
      let currentPayload = { ...payload }
      if (import.meta.env.DEV) console.log('[updateTask] payload:', JSON.stringify(currentPayload, null, 2))
      for (let attempt = 0; attempt < 8; attempt++) {
        const { data, error: err } = await supabase.from('tasks').update(currentPayload).eq('id', id).select().single()
        if (!err) {
          const normalized = normalizeTask(data)
          setTasks(prev => prev.map(t => t.id === id ? normalized : t))

          // Notify NEW assignees when task assignment changes
          const newIds = normalized.assignee_ids || []
          const oldIds = backup?.assignee_ids || []
          const addedAssignees = newIds.filter((id: string) => !oldIds.includes(id))
          const tenantIdNotif = cachedTenantIdRef.current
          if (tenantIdNotif && addedAssignees.length > 0) {
            addedAssignees.forEach((uid: string) => {
              supabase.from('notifications').insert({
                user_id: uid,
                tenant_id: tenantIdNotif,
                type: 'task',
                title: `Task assigned: ${normalized.title}`,
                message: `You have been assigned a new task`,
                priority: normalized.priority === 'urgent' ? 'urgent' : normalized.priority === 'high' ? 'high' : 'medium',
                read: false,
                action_required: true,
                category: 'task',
                metadata: { task_id: id },
              }).then(({ error: nErr }) => {
                if (nErr && import.meta.env.DEV) console.warn('Failed to create assignment notification:', nErr.message)
              })
            })
          }

          // Notify all assignees when task status changes (completed/cancelled)
          if (updates.status && updates.status !== backup?.status) {
            const statusMsg = updates.status === 'done' ? 'completed' : updates.status === 'cancelled' ? 'cancelled' : null
            if (statusMsg && tenantIdNotif) {
              (backup?.assignee_ids || []).filter((uid: string) => uid !== backup?.owner_id).forEach((uid: string) => {
                supabase.from('notifications').insert({
                  user_id: uid,
                  tenant_id: tenantIdNotif,
                  type: 'task',
                  title: `Task ${statusMsg}: ${normalized.title}`,
                  message: `A task assigned to you has been ${statusMsg}`,
                  priority: 'low',
                  read: false,
                  action_required: false,
                  category: 'task',
                  metadata: { task_id: id, status: updates.status },
                }).then(({ error: nErr }) => {
                  if (nErr && import.meta.env.DEV) console.warn('Failed to create status notification:', nErr.message)
                })
              })
            }
          }

          return normalized
        }
        const missingColumn = getMissingColumn(err.message || '')
        if (import.meta.env.DEV) console.warn(`[updateTask] attempt ${attempt} error:`, err.message, missingColumn ? `→ stripping "${missingColumn}"` : '→ no match, throwing')
        if (missingColumn && Object.prototype.hasOwnProperty.call(currentPayload, missingColumn)) {
          const { [missingColumn]: _omitted, ...rest } = currentPayload
          currentPayload = rest
          continue
        }
        throw err
      }
      throw new Error('Too many missing columns in tasks update')
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
    const task = tasks.find(t => t.id === taskId)
    const updates: Partial<CalendarTask> = { start_date: newDate, start_time: newTime, updated_at: new Date().toISOString() }
    if (task?.completed && task.completed_at) {
      updates.completed_at = newDate + task.completed_at.slice(10)
    }
    await updateTask(taskId, updates)
  }

  const moveEvent = async (eventId: string, newDate: string, newTime?: string) => {
    await updateEvent(eventId, { start_date: newDate, start_time: newTime, updated_at: new Date().toISOString() })
  }

  const createLabel = async (labelData: Omit<CalendarLabel, 'id' | 'created_at'>) => {
    const tenantId = await resolveTenantId()
    const insertData = { ...labelData, ...(tenantId && { tenant_id: tenantId }) }
    const { data, error: err } = await supabase.from('calendar_labels').insert(insertData).select().single()
    if (err) throw err
    setLabels(prev => [...prev, data])
    return data
  }

  // Getters — always compare date-only portion (TIMESTAMPTZ can include time)
  const getEventsByDate = (date: string) => events.filter(event => event.start_date?.slice(0, 10) === date)
  const getTasksByDate = (date: string) => tasks.filter(task => {
    // Completed tasks pin to their completed_at date (or start_date as fallback)
    if (task.completed) {
      if (task.completed_at) return task.completed_at.slice(0, 10) === date
      if (task.start_date) return task.start_date.slice(0, 10) === date
      // Completed with no dates → pin to created_at
      return task.created_at?.slice(0, 10) === date
    }
    // Pending tasks: show on start_date, fall back to created_at
    if (task.start_date) return task.start_date.slice(0, 10) === date
    return task.created_at?.slice(0, 10) === date
  })
  const getEventsByDateRange = (startDate: string, endDate: string) => events.filter(event => {
    const d = event.start_date?.slice(0, 10)
    return d && d >= startDate && d <= endDate
  })
  const getTasksByDateRange = (startDate: string, endDate: string) => tasks.filter(task => {
    // Completed tasks pin to their completed_at date (or start_date/created_at as fallback)
    if (task.completed) {
      const d = (task.completed_at ?? task.start_date ?? task.created_at)?.slice(0, 10)
      return d && d >= startDate && d <= endDate
    }
    const d = (task.start_date ?? task.created_at)?.slice(0, 10)
    return d && d >= startDate && d <= endDate
  })

  const getCalendarStats = () => {
    const localEvents = events.filter(e => e.source !== 'google')
    const totalEvents = localEvents.length
    const totalTasks = tasks.length
    const completedTasks = tasks.filter(task => task.completed).length
    const pendingTasks = tasks.filter(task => !task.completed).length
    const today = new Date().toLocaleDateString('en-CA')
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

  const refreshData = useCallback(() => loadCalendarData(true), [loadCalendarData])

  const value = useMemo(() => ({
    events, tasks, labels, loading, error, isInitialized,
    createEvent, updateEvent, deleteEvent,
    createTask, updateTask, deleteTask,
    moveTask, moveEvent,
    getEventsByDate, getTasksByDate, getEventsByDateRange, getTasksByDateRange,
    createLabel, getCalendarStats, refreshData
  }), [events, tasks, labels, loading, error, isInitialized,
    createEvent, updateEvent, deleteEvent,
    createTask, updateTask, deleteTask,
    moveTask, moveEvent,
    getEventsByDate, getTasksByDate, getEventsByDateRange, getTasksByDateRange,
    createLabel, getCalendarStats, refreshData])

  return (
    <CalendarContext.Provider value={value}>
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
