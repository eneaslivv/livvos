import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { errorLogger } from '../lib/errorLogger'
import { useAuth } from '../hooks/useAuth'
import { useTenant } from './TenantContext'
import { ResourceLimitError } from '../lib/ResourceLimitError'
import { notifyWithEmail } from '../lib/notifyWithEmail'
import { notifySlackProjectEvent } from '../lib/communications/slack'

export enum ProjectStatus {
  Active = 'Active',
  Pending = 'Pending',
  Review = 'Review',
  Completed = 'Completed',
  Archived = 'Archived'
}

export interface ProjectTask {
  id: string
  title: string
  done: boolean
  assignee: string
  dueDate?: string
  payment?: number
  paymentStatus?: 'pending' | 'paid'
}

export interface ProjectTaskGroup {
  name: string
  startDate?: string
  endDate?: string
  tasks: ProjectTask[]
}

export interface ProjectFile {
  name: string
  type: string
  size: string
  date: string
  url?: string
}

export interface ProjectActivity {
  text: string
  date: string
  user: string
}

export interface Project {
  id: string
  title: string
  description: string
  progress: number
  status: ProjectStatus
  client: string
  client_id?: string | null
  clientName: string
  clientAvatar: string
  deadline: string
  createdAt: string
  updatedAt: string
  nextSteps: string
  tags: string[]
  team: string[]
  tasksGroups: ProjectTaskGroup[]
  files: ProjectFile[]
  activity: ProjectActivity[]
  color: string
  icon?: string | null
  budget: number
  currency: string
  /** When this project lives in another tenant and was shared with the
   *  current tenant via project_agency_shares, these surface the source
   *  for the "🔗 Shared from X" badge in the UI. Null for native
   *  projects. */
  sharedFromTenantId?: string | null
  sharedFromName?: string | null
  sharedFromLogoUrl?: string | null
  sharedAccessLevel?: string | null
}

interface ProjectsContextType {
  projects: Project[]
  loading: boolean
  error: string | null
  isInitialized: boolean
  createProject: (projectData: Partial<Project>) => Promise<Project>
  updateProject: (id: string, updates: Partial<Project>) => Promise<Project>
  deleteProject: (id: string) => Promise<void>
  refreshProjects: () => Promise<void>
}

const ProjectsContext = createContext<ProjectsContextType | undefined>(undefined)

export const ProjectsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth()
  const { currentTenant, isWithinResourceLimit, getResourceUsage, refreshUsage } = useTenant()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const hasLoadedRef = useRef(false)

  // Resolve tenant_id with profile fallback (same approach as useSupabase)
  const resolveTenantId = useCallback(async (): Promise<string | null> => {
    if (currentTenant?.id) return currentTenant.id
    if (!user?.id) return null
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single()
      return profile?.tenant_id || null
    } catch {
      return null
    }
  }, [currentTenant?.id, user?.id])

  // Function to normalize DB data to the UI format
  const normalizeProject = (p: any): Project => ({
    id: p.id,
    title: p.title ?? 'Untitled Project',
    description: p.description ?? '',
    progress: typeof p.progress === 'number' ? p.progress : 0,
    status: p.status ?? ProjectStatus.Active,
    client: p.client ?? p.client_name ?? 'Client',
    client_id: p.client_id ?? null,
    clientName: p.client_name ?? p.clientName ?? p.client ?? 'Client',
    clientAvatar: p.client_avatar ?? p.clientAvatar ?? 'CL',
    deadline: p.deadline ?? '',
    createdAt: p.created_at ?? p.createdAt ?? new Date().toISOString(),
    updatedAt: p.updated_at ?? p.updatedAt ?? new Date().toISOString(),
    nextSteps: p.next_steps ?? p.nextSteps ?? '',
    tags: Array.isArray(p.tags) ? p.tags : [],
    team: Array.isArray(p.team) ? p.team : [],
    tasksGroups: Array.isArray(p.tasks_groups) ? p.tasks_groups : (Array.isArray(p.tasksGroups) ? p.tasksGroups : []),
    files: Array.isArray(p.files) ? p.files : [],
    activity: Array.isArray(p.activity) ? p.activity : [],
    color: p.color ?? '#3b82f6',
    icon: p.icon ?? null,
    budget: typeof p.budget === 'number' ? p.budget : 0,
    currency: p.currency ?? 'USD',
    // Cross-tenant share metadata. When non-null, this project is owned
    // by another agency that shared it with the current tenant. UI uses
    // these to render a "🔗 Shared from X" badge.
    sharedFromTenantId: p._shared_from_tenant_id ?? null,
    sharedFromName: p._shared_from_name ?? null,
    sharedFromLogoUrl: p._shared_from_logo_url ?? null,
    sharedAccessLevel: p._shared_access_level ?? null,
  });

  // Inverse function to save to DB
  const toDbPayload = (p: Partial<Project>) => {
    const payload: any = {};
    if (p.title !== undefined) payload.title = p.title;
    if (p.description !== undefined) payload.description = p.description;
    if (p.progress !== undefined) payload.progress = p.progress;
    if (p.status !== undefined) payload.status = p.status;
    if (p.client !== undefined) payload.client = p.client;
    if ((p as any).client_id !== undefined) payload.client_id = (p as any).client_id;
    if (p.clientName !== undefined) payload.client_name = p.clientName;
    if (p.clientAvatar !== undefined) payload.client_avatar = p.clientAvatar;
    if (p.deadline !== undefined) payload.deadline = p.deadline || null;
    if (p.nextSteps !== undefined) payload.next_steps = p.nextSteps;
    if (p.tags !== undefined) payload.tags = p.tags;
    if (p.team !== undefined) payload.team = p.team;
    if (p.tasksGroups !== undefined) payload.tasks_groups = p.tasksGroups;
    if (p.files !== undefined) payload.files = p.files;
    if (p.activity !== undefined) payload.activity = p.activity;
    if (p.budget !== undefined) payload.budget = p.budget;
    if (p.currency !== undefined) payload.currency = p.currency;
    if (p.color !== undefined) payload.color = p.color;
    if (p.icon !== undefined) payload.icon = p.icon;
    // updatedAt is handled automatically or by trigger, but we can send it
    payload.updated_at = new Date().toISOString();
    return payload;
  };

  const fetchProjects = useCallback(async (force = false) => {
    if (!user) {
      setProjects([])
      setLoading(false)
      return
    }

    if (hasLoadedRef.current && !force) {
      setLoading(false)
      return
    }

    // Only show loading on first load, not on realtime-triggered refreshes
    if (!hasLoadedRef.current) {
      setLoading(true)
    }
    setError(null)

    try {
      // Resolve tenant with fallback to profile lookup
      const tenantId = await resolveTenantId()
      if (!tenantId) {
        errorLogger.warn('[ProjectsContext] Could not resolve tenant_id, skipping fetch')
        setProjects([])
        setLoading(false)
        return
      }

      errorLogger.log('Fetching projects from Supabase...')
      // Two parallel queries:
      //   (a) projects natively in this tenant
      //   (b) projects shared INTO this tenant from a connected partner
      //       agency (via project_agency_shares). The "shared in" list
      //       is small (per-project opt-in) so this is cheap.
      // Server-side RLS policies allow the receiving tenant to SELECT
      // those projects; we still query them explicitly so they have
      // metadata we need (the source agency name) for the UI badge.
      const [ownedRes, sharedToMeRes] = await Promise.all([
        supabase
          .from('projects')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false }),
        supabase.rpc('list_projects_shared_to_me'),
      ])
      const { data, error: err } = ownedRes
      const sharedMeta = (!sharedToMeRes.error && Array.isArray(sharedToMeRes.data))
        ? sharedToMeRes.data as Array<{ project_id: string; owner_tenant_id: string; owner_tenant_name: string; owner_tenant_logo_url: string | null; access_level: string }>
        : []

      if (err) {
        if (err.code === 'PGRST116') {
          setProjects([])
        } else {
          throw err
        }
      } else {
        // Fetch the actual rows for projects shared INTO this tenant so
        // they appear in the same list with full project data. Each gets
        // tagged with `shared_from_*` fields used by the badge in the
        // sidebar list. The receiving RLS policy allows this SELECT.
        const sharedProjectIds = sharedMeta.map(s => s.project_id)
        let sharedProjectRows: any[] = []
        if (sharedProjectIds.length > 0) {
          const { data: sharedData } = await supabase
            .from('projects')
            .select('*')
            .in('id', sharedProjectIds)
          sharedProjectRows = sharedData || []
        }
        const sharedById = new Map(sharedMeta.map(s => [s.project_id, s]))
        const decoratedShared = sharedProjectRows.map(p => ({
          ...p,
          // Marker fields for the UI — survive normalizeProject by being
          // attached after the merge, see below.
          _shared_from_tenant_id: sharedById.get(p.id)?.owner_tenant_id || null,
          _shared_from_name: sharedById.get(p.id)?.owner_tenant_name || null,
          _shared_from_logo_url: sharedById.get(p.id)?.owner_tenant_logo_url || null,
          _shared_access_level: sharedById.get(p.id)?.access_level || 'view',
        }))
        const dbProjects = ([...(data || []), ...decoratedShared]).map(normalizeProject)

        // If DB is empty but we have local projects, persist them to DB
        if (dbProjects.length === 0 && projects.length > 0) {
          errorLogger.log(`[ProjectsContext] DB empty but ${projects.length} local projects found — syncing to DB`)
          const toSync = projects.map(p => {
            const payload = toDbPayload(p)
            payload.id = p.id
            payload.tenant_id = tenantId
            payload.owner_id = user?.id || payload.owner_id
            if (payload.client_id === undefined) payload.client_id = null
            return payload
          })

          const { data: synced, error: syncErr } = await supabase
            .from('projects')
            .upsert(toSync, { onConflict: 'id' })
            .select()

          if (syncErr) {
            errorLogger.warn('[ProjectsContext] Sync failed, keeping local state:', syncErr.message)
            // Don't wipe local projects if sync fails
          } else {
            const normalized = (synced || []).map(normalizeProject)
            setProjects(normalized.length > 0 ? normalized : projects)
          }
        } else {
          setProjects(dbProjects)
        }
      }
      hasLoadedRef.current = true
      setIsInitialized(true)
    } catch (err: any) {
      errorLogger.error('Error fetching projects', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [user, resolveTenantId]) // removed isInitialized — uses ref instead

  useEffect(() => {
    fetchProjects()

    // Realtime subscription — incremental updates (no full refetch)
    const tenantId = currentTenant?.id
    const filter = tenantId ? `tenant_id=eq.${tenantId}` : undefined
    const channelName = `projects-rt${tenantId ? `-${tenantId}` : ''}`

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'projects', ...(filter && { filter }) }, (payload) => {
        const newProject = normalizeProject(payload.new)
        setProjects(prev => {
          if (prev.some(p => p.id === newProject.id)) return prev
          return [newProject, ...prev]
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'projects', ...(filter && { filter }) }, (payload) => {
        const updated = normalizeProject(payload.new)
        setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'projects', ...(filter && { filter }) }, (payload) => {
        const deletedId = payload.old?.id
        if (deletedId) setProjects(prev => prev.filter(p => p.id !== deletedId))
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchProjects, currentTenant?.id])

  const createProject = async (projectData: Partial<Project>) => {
    if (!user) {
      throw new Error('No user session. Reload the page.')
    }

    const tenantId = await resolveTenantId()
    if (!tenantId) {
      throw new Error('Could not determine tenant. Reload the page.')
    }

    // Enforce resource limit before creating
    await refreshUsage()
    if (!isWithinResourceLimit('max_projects')) {
      const usage = getResourceUsage('max_projects')
      throw new ResourceLimitError('max_projects', usage.used, usage.limit)
    }

    try {
      const payload = toDbPayload(projectData)
      payload.tenant_id = tenantId
      payload.owner_id = user.id
      if (!payload.title) payload.title = 'New Project'

      errorLogger.log('[ProjectsContext] Inserting project:', payload)

      const { data, error: err } = await supabase
        .from('projects')
        .insert(payload)
        .select()
        .single()

      if (err) {
        errorLogger.error('[ProjectsContext] Insert error:', err)
        throw new Error(err.message || 'Error creating project in the database.')
      }
      const newProject = normalizeProject(data)
      setProjects(prev => [newProject, ...prev])

      // Notify project owner (fire-and-forget confirmation)
      if (tenantId && user.id) {
        notifyWithEmail({
          userId: user.id,
          tenantId,
          type: 'project',
          title: `Project created: ${newProject.title}`,
          message: `Your project "${newProject.title}" has been created successfully.`,
          priority: 'low',
          link: '/projects',
          actionText: 'View Project',
        }).catch(() => {})
      }

      return newProject
    } catch (err) {
      throw err
    }
  }

  const updateProject = async (id: string, updates: Partial<Project>) => {
    try {
      const payload = toDbPayload(updates)
      const { data, error: err } = await supabase
        .from('projects')
        .update(payload)
        .eq('id', id)
        .select()
        .single()

      if (err) {
        // Project doesn't exist in DB yet — persist it via upsert
        const localProject = projects.find(p => p.id === id)
        if (localProject) {
          const tenantId = await resolveTenantId()
          const fullPayload = toDbPayload({ ...localProject, ...updates })
          fullPayload.id = id
          fullPayload.tenant_id = tenantId
          fullPayload.owner_id = user?.id
          if (!fullPayload.title) fullPayload.title = localProject.title || 'Untitled'
          if (fullPayload.client_id === undefined) fullPayload.client_id = null

          const { data: upsertData, error: upsertErr } = await supabase
            .from('projects')
            .upsert(fullPayload, { onConflict: 'id' })
            .select()
            .single()

          if (upsertErr) {
            // FK violation on client_id — retry without it
            if (upsertErr.code === '23503' && upsertErr.message?.includes('client_id')) {
              fullPayload.client_id = null
              const { data: retryData, error: retryErr } = await supabase
                .from('projects')
                .upsert(fullPayload, { onConflict: 'id' })
                .select()
                .single()
              if (retryErr) throw retryErr
              const saved = normalizeProject(retryData)
              setProjects(prev => prev.map(p => p.id === id ? saved : p))
              return saved
            }
            throw upsertErr
          }
          const saved = normalizeProject(upsertData)
          setProjects(prev => prev.map(p => p.id === id ? saved : p))
          return saved
        }
        throw err
      }
      const updatedProject = normalizeProject(data)

      // Slack notification on project completion. Best-effort; never
      // throws to the caller. Fires only on the transition into
      // 'Completed' (so re-saving a Completed project doesn't re-spam).
      const wasCompleted = projects.find(p => p.id === id)?.status === ProjectStatus.Completed
      if (updates.status === ProjectStatus.Completed && !wasCompleted) {
        ;(async () => {
          try {
            const tenantId = await resolveTenantId()
            if (!tenantId) return
            let actorName: string | undefined
            try {
              const { data: { user: actor } } = await supabase.auth.getUser()
              if (actor?.id) {
                const { data: prof } = await supabase
                  .from('profiles').select('name, email').eq('id', actor.id).maybeSingle()
                actorName = (prof as any)?.name || (prof as any)?.email
              }
            } catch {}
            await notifySlackProjectEvent({
              tenantId,
              projectId: id,
              event: 'project_completed',
              itemTitle: updatedProject.title,
              projectName: updatedProject.title,
              actorName: actorName || null,
            })
          } catch (e) {
            errorLogger.warn('slack project-completed notify failed', e)
          }
        })()
      }

      setProjects(prev => prev.map(p => p.id === id ? updatedProject : p))
      return updatedProject
    } catch (err) {
      throw err
    }
  }

  const deleteProject = async (id: string) => {
    try {
      const { error: err } = await supabase
        .from('projects')
        .delete()
        .eq('id', id)
      
      if (err) throw err
      setProjects(prev => prev.filter(p => p.id !== id))
    } catch (err) {
      throw err
    }
  }

  const refreshProjects = useCallback(() => fetchProjects(true), [fetchProjects])

  const value = useMemo(() => ({
    projects,
    loading,
    error,
    isInitialized,
    createProject,
    updateProject,
    deleteProject,
    refreshProjects
  }), [projects, loading, error, isInitialized, createProject, updateProject, deleteProject, refreshProjects])

  return (
    <ProjectsContext.Provider value={value}>
      {children}
    </ProjectsContext.Provider>
  )
}

export const useProjects = () => {
  const context = useContext(ProjectsContext)
  if (context === undefined) {
    throw new Error('useProjects must be used within a ProjectsProvider')
  }
  return context
}
