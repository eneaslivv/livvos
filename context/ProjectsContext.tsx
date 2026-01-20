import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { errorLogger } from '../lib/errorLogger'

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
  tasks: ProjectTask[]
}

export interface ProjectFile {
  name: string
  type: string
  size: string
  date: string
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
  clientName: string
  clientAvatar: string
  deadline: string
  updatedAt: string
  nextSteps: string
  tags: string[]
  team: string[]
  tasksGroups: ProjectTaskGroup[]
  files: ProjectFile[]
  activity: ProjectActivity[]
  color: string
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
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  // Función para normalizar datos de la DB al formato de la UI
  const normalizeProject = (p: any): Project => ({
    id: p.id,
    title: p.title ?? 'Untitled Project',
    description: p.description ?? '',
    progress: typeof p.progress === 'number' ? p.progress : 0,
    status: p.status ?? ProjectStatus.Active,
    client: p.client ?? p.client_name ?? 'Client',
    clientName: p.client_name ?? p.clientName ?? p.client ?? 'Client',
    clientAvatar: p.client_avatar ?? p.clientAvatar ?? 'CL',
    deadline: p.deadline ?? new Date().toISOString().slice(0, 10),
    updatedAt: p.updated_at ?? p.updatedAt ?? new Date().toISOString(),
    nextSteps: p.next_steps ?? p.nextSteps ?? '',
    tags: Array.isArray(p.tags) ? p.tags : [],
    team: Array.isArray(p.team) ? p.team : [],
    tasksGroups: Array.isArray(p.tasks_groups) ? p.tasks_groups : (Array.isArray(p.tasksGroups) ? p.tasksGroups : []),
    files: Array.isArray(p.files) ? p.files : [],
    activity: Array.isArray(p.activity) ? p.activity : [],
    color: p.color ?? '#3b82f6',
  });

  // Función inversa para guardar en DB
  const toDbPayload = (p: Partial<Project>) => {
    const payload: any = {};
    if (p.title !== undefined) payload.title = p.title;
    if (p.description !== undefined) payload.description = p.description;
    if (p.progress !== undefined) payload.progress = p.progress;
    if (p.status !== undefined) payload.status = p.status;
    if (p.client !== undefined) payload.client = p.client;
    if (p.clientName !== undefined) payload.client_name = p.clientName;
    if (p.clientAvatar !== undefined) payload.client_avatar = p.clientAvatar;
    if (p.deadline !== undefined) payload.deadline = p.deadline;
    if (p.nextSteps !== undefined) payload.next_steps = p.nextSteps;
    if (p.tags !== undefined) payload.tags = p.tags;
    if (p.team !== undefined) payload.team = p.team;
    if (p.tasksGroups !== undefined) payload.tasks_groups = p.tasksGroups;
    if (p.files !== undefined) payload.files = p.files;
    if (p.activity !== undefined) payload.activity = p.activity;
    if (p.color !== undefined) payload.color = p.color;
    // updatedAt se maneja automáticamente o por trigger, pero podemos mandarlo
    payload.updated_at = new Date().toISOString();
    return payload;
  };

  const fetchProjects = useCallback(async (force = false) => {
    if (isInitialized && !force) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    
    try {
      errorLogger.log('Fetching projects from Supabase...')
      const { data, error: err } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (err) {
        if (err.code === 'PGRST116') {
          setProjects([])
        } else {
          throw err
        }
      } else {
        const normalized = (data || []).map(normalizeProject)
        setProjects(normalized)
      }
      setIsInitialized(true)
    } catch (err: any) {
      errorLogger.error('Error fetching projects', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [isInitialized])

  useEffect(() => {
    fetchProjects()

    // Realtime subscription
    const channel = supabase
      .channel('projects-global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        fetchProjects(true)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchProjects])

  const createProject = async (projectData: Partial<Project>) => {
    try {
      const payload = toDbPayload(projectData)
      // Asegurar campos obligatorios si faltan
      if (!payload.title) payload.title = 'New Project'
      
      const { data, error: err } = await supabase
        .from('projects')
        .insert(payload)
        .select()
        .single()
      
      if (err) throw err
      const newProject = normalizeProject(data)
      setProjects(prev => [newProject, ...prev])
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
      
      if (err) throw err
      const updatedProject = normalizeProject(data)
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

  return (
    <ProjectsContext.Provider value={{
      projects,
      loading,
      error,
      isInitialized,
      createProject,
      updateProject,
      deleteProject,
      refreshProjects: () => fetchProjects(true)
    }}>
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
