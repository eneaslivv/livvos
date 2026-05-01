import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { errorLogger } from '../lib/errorLogger'
import { useTenant } from './TenantContext'
import { ResourceLimitError } from '../lib/ResourceLimitError'
import type { Document } from '../types/documents'

const withTimeout = async <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Timeout: ${label} took longer than ${ms / 1000}s`)), ms)
  })
  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

export interface Folder {
  id: string
  owner_id: string
  tenant_id?: string
  client_id?: string | null
  project_id?: string | null
  name: string
  parent_id: string | null
  color: string
  is_favorite: boolean
  created_at: string
  updated_at: string
}

export interface File {
  id: string
  owner_id: string
  tenant_id?: string
  client_id?: string | null
  project_id?: string | null
  folder_id: string | null
  name: string
  type: string
  size: number
  url: string
  is_favorite: boolean
  tags: string[]
  created_at: string
  updated_at: string
}

export interface DocsFilter {
  clientId: string | null
  projectId: string | null
}

interface DocumentsContextType {
  folders: Folder[]
  files: File[]
  documents: Document[]
  allFolders: Folder[]
  breadcrumbs: Folder[]
  currentFolderId: string | null
  filter: DocsFilter
  isFiltering: boolean
  loading: boolean
  error: string | null
  isInitialized: boolean
  setCurrentFolderId: (id: string | null) => void
  setFilter: (filter: DocsFilter) => void
  clearFilter: () => void
  createFolder: (name: string, color?: string, options?: { clientId?: string | null; projectId?: string | null }) => Promise<Folder>
  uploadFile: (file: any, options?: { clientId?: string | null; projectId?: string | null }) => Promise<File>
  updateFile: (id: string, updates: { folder_id?: string | null; client_id?: string | null; project_id?: string | null }) => Promise<void>
  updateFolder: (id: string, updates: { parent_id?: string | null; client_id?: string | null; project_id?: string | null }) => Promise<void>
  deleteFolder: (id: string) => Promise<void>
  deleteFile: (id: string, url: string) => Promise<void>
  createDocument: (title?: string, options?: { clientId?: string | null; projectId?: string | null; taskId?: string | null }) => Promise<Document>
  updateDocument: (id: string, updates: Partial<Pick<Document, 'title' | 'content' | 'content_text' | 'status' | 'client_id' | 'project_id' | 'task_id' | 'is_favorite' | 'share_enabled'>>) => Promise<void>
  deleteDocument: (id: string) => Promise<void>
  getDocumentsByTask: (taskId: string) => Document[]
  refresh: () => Promise<void>
}

const DocumentsContext = createContext<DocumentsContextType | undefined>(undefined)

export const DocumentsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentTenant, isWithinResourceLimit, getResourceUsage, refreshUsage } = useTenant()
  const tenantId = currentTenant?.id
  const [folders, setFolders] = useState<Folder[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [allFolders, setAllFolders] = useState<Folder[]>([])
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<Folder[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [filter, setFilterState] = useState<DocsFilter>({ clientId: null, projectId: null })
  const isFiltering = !!(filter.clientId || filter.projectId)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const hasLoadedDocsRef = useRef(false)

  // Load data
  const loadDocuments = useCallback(async () => {
    if (!hasLoadedDocsRef.current) setLoading(true)
    setError(null)

    try {
      errorLogger.log('Loading documents...')

      // When a client/project filter is active we ignore folder hierarchy and
      // return a flat list of every matching item across the tenant.
      const filterClient = filter.clientId
      const filterProject = filter.projectId
      const filtering = !!(filterClient || filterProject)

      // Load folders for the current level (or matching the filter)
      let foldersQuery = supabase.from('folders').select('*').order('name', { ascending: true })
      if (filtering) {
        if (filterClient) foldersQuery = foldersQuery.eq('client_id', filterClient)
        if (filterProject) foldersQuery = foldersQuery.eq('project_id', filterProject)
      } else if (currentFolderId) {
        foldersQuery = foldersQuery.eq('parent_id', currentFolderId)
      } else {
        foldersQuery = foldersQuery.is('parent_id', null)
      }

      // Load files for the current level (or matching the filter)
      let filesQuery = supabase.from('files').select('*').order('name', { ascending: true })
      if (filtering) {
        if (filterClient) filesQuery = filesQuery.eq('client_id', filterClient)
        if (filterProject) filesQuery = filesQuery.eq('project_id', filterProject)
      } else if (currentFolderId) {
        filesQuery = filesQuery.eq('folder_id', currentFolderId)
      } else {
        filesQuery = filesQuery.is('folder_id', null)
      }

      // Load rich-text documents (already flat) — apply filter when active
      let docsQuery = supabase.from('documents').select('*').order('updated_at', { ascending: false })
      if (filtering) {
        if (filterClient) docsQuery = docsQuery.eq('client_id', filterClient)
        if (filterProject) docsQuery = docsQuery.eq('project_id', filterProject)
      }

      const [foldersRes, filesRes, docsRes] = await withTimeout(
        Promise.all([Promise.resolve(foldersQuery), Promise.resolve(filesQuery), Promise.resolve(docsQuery)]),
        15000,
        'load documents'
      )

      if (foldersRes.error) {
        if (foldersRes.error.code === 'PGRST116') setFolders([])
        else throw foldersRes.error
      } else {
        setFolders(foldersRes.data || [])
      }

      if (filesRes.error) {
        if (filesRes.error.code === 'PGRST116') setFiles([])
        else throw filesRes.error
      } else {
        setFiles(filesRes.data || [])
      }

      if (docsRes.error) {
        if (docsRes.error.code === 'PGRST116') setDocuments([])
        else throw docsRes.error
      } else {
        setDocuments(docsRes.data || [])
      }

      // Build breadcrumbs (skipped while filtering — view is flat)
      if (currentFolderId && !filtering) {
        const buildBreadcrumbs = async (folderId: string, path: Folder[] = []): Promise<Folder[]> => {
          const { data, error } = await supabase.from('folders').select('*').eq('id', folderId).single()
          if (error || !data) return path
          const newPath = [data, ...path]
          if (data.parent_id) return buildBreadcrumbs(data.parent_id, newPath)
          return newPath
        }
        const path = await buildBreadcrumbs(currentFolderId)
        setBreadcrumbs(path)
      } else {
        setBreadcrumbs([])
      }

      setIsInitialized(true)
      hasLoadedDocsRef.current = true
    } catch (err: any) {
      errorLogger.error('Error loading documents', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [currentFolderId, filter.clientId, filter.projectId])

  const setFilter = useCallback((next: DocsFilter) => {
    setFilterState(next)
  }, [])

  const clearFilter = useCallback(() => {
    setFilterState({ clientId: null, projectId: null })
  }, [])

  useEffect(() => {
    loadDocuments()
    const tid = tenantId
    const tf = tid ? { filter: `tenant_id=eq.${tid}` } : {}
    const channel = supabase
      .channel(`documents-rt${tid ? `-${tid}` : ''}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'folders', ...tf }, () => { loadDocuments() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'files', ...tf }, () => { loadDocuments() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents', ...tf }, () => { loadDocuments() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadDocuments])

  const createFolder = async (
    name: string,
    color: string = '#3b82f6',
    options?: { clientId?: string | null; projectId?: string | null }
  ) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('User not authenticated')

    // If tenantId is not yet available, try to fetch it directly
    let effectiveTenantId = tenantId
    if (!effectiveTenantId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single()
      effectiveTenantId = profile?.tenant_id
    }
    if (!effectiveTenantId) throw new Error('Tenant not available. Reload the page.')

    const { clientId = null, projectId = null } = options || {}

    const insertPayload = {
      name,
      parent_id: currentFolderId,
      color,
      owner_id: user.id,
      tenant_id: effectiveTenantId,
      client_id: clientId,
      project_id: projectId
    }
    if (import.meta.env.DEV) console.log('Creating folder with payload:', insertPayload)

    const { data, error: err } = await withTimeout(
      Promise.resolve(supabase.from('folders').insert(insertPayload).select().single()),
      15000,
      'create folder'
    )

    if (err) {
      console.error('Supabase folder insert error:', err)
      throw new Error(`Error creating folder: ${err.message} (code: ${err.code})`)
    }
    if (!data) {
      throw new Error('Folder was not created. Possible permissions issue (RLS). Verify that the folders migration has been run.')
    }
    setFolders(prev => [...prev, data])
    setAllFolders(prev => [...prev, data])
    return data
  }

  const uploadFile = async (file: any, options?: { clientId?: string | null; projectId?: string | null }) => {
    const user = (await supabase.auth.getUser()).data.user
    if (!user) throw new Error('User not authenticated')

    if (import.meta.env.DEV) console.log('Context uploadFile - Tenant ID:', tenantId); // Debug logging
    if (!tenantId) throw new Error('Tenant not available (ID is null/undefined)')

    // Enforce storage limit
    await refreshUsage()
    if (!isWithinResourceLimit('max_storage_mb')) {
      const usage = getResourceUsage('max_storage_mb')
      throw new ResourceLimitError('max_storage_mb', usage.used, usage.limit)
    }

    const fileName = `${user.id}/${Date.now()}_${file.name}`
    if (import.meta.env.DEV) console.log('Attempting storage upload:', fileName);

    const { error: uploadError } = await withTimeout(
      supabase.storage.from('documents').upload(fileName, file),
      30000,
      'upload file to storage'
    )
    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      throw new Error(`Storage Error: ${uploadError.message} (Code: ${uploadError.name})`);
    }

    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(fileName)

    const { clientId = null, projectId = null } = options || {}

    const { data: fileData, error: dbError } = await withTimeout(
      Promise.resolve(supabase.from('files').insert({
        name: file.name,
        type: file.type,
        size: file.size,
        url: urlData.publicUrl,
        folder_id: currentFolderId,
        owner_id: user.id,
        tenant_id: tenantId,
        client_id: clientId,
        project_id: projectId
      }).select().single()),
      15000,
      'insert file in DB'
    )

    if (dbError) {
      console.error('Database insert error:', dbError);
      throw new Error(`Database Error: ${dbError.message} (Code: ${dbError.code})`);
    }

    setFiles(prev => [...prev, fileData])
    return fileData
  }

  // Load all folders for the "Move to" picker
  const loadAllFolders = useCallback(async () => {
    if (!tenantId) return
    const { data } = await supabase.from('folders').select('*').eq('tenant_id', tenantId).order('name')
    setAllFolders(data || [])
  }, [tenantId])

  useEffect(() => { loadAllFolders() }, [loadAllFolders])

  const updateFile = async (id: string, updates: { folder_id?: string | null; client_id?: string | null; project_id?: string | null }) => {
    const { error: err } = await supabase.from('files').update(updates).eq('id', id)
    if (err) throw err
    // If folder changed, remove from current view
    if ('folder_id' in updates && updates.folder_id !== currentFolderId) {
      setFiles(prev => prev.filter(f => f.id !== id))
    } else {
      setFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f))
    }
  }

  const updateFolder = async (id: string, updates: { parent_id?: string | null; client_id?: string | null; project_id?: string | null }) => {
    const { error: err } = await supabase.from('folders').update(updates).eq('id', id)
    if (err) throw err
    // If parent changed, remove from current view
    if ('parent_id' in updates && updates.parent_id !== currentFolderId) {
      setFolders(prev => prev.filter(f => f.id !== id))
      loadAllFolders()
    } else {
      setFolders(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f))
    }
  }

  const deleteFolder = async (id: string) => {
    const { error: err } = await supabase.from('folders').delete().eq('id', id)
    if (err) throw err
    setFolders(prev => prev.filter(f => f.id !== id))
    setAllFolders(prev => prev.filter(f => f.id !== id))
  }

  const createDocument = async (
    title: string = 'Untitled Document',
    options?: { clientId?: string | null; projectId?: string | null; taskId?: string | null }
  ): Promise<Document> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('User not authenticated')

    let effectiveTenantId = tenantId
    if (!effectiveTenantId) {
      const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single()
      effectiveTenantId = profile?.tenant_id
    }
    if (!effectiveTenantId) throw new Error('Tenant not available. Reload the page.')

    const { clientId = null, projectId = null, taskId = null } = options || {}

    const { data, error: err } = await supabase.from('documents').insert({
      title,
      owner_id: user.id,
      tenant_id: effectiveTenantId,
      client_id: clientId,
      project_id: projectId,
      task_id: taskId,
    }).select().single()

    if (err) throw new Error(`Error creating document: ${err.message}`)
    if (!data) throw new Error('Document was not created.')
    setDocuments(prev => [data, ...prev])
    return data
  }

  const updateDocument = async (
    id: string,
    updates: Partial<Pick<Document, 'title' | 'content' | 'content_text' | 'status' | 'client_id' | 'project_id' | 'is_favorite' | 'share_enabled'>>
  ) => {
    const { error: err } = await supabase.from('documents').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
    if (err) throw new Error(`Error updating document: ${err.message}`)
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, ...updates, updated_at: new Date().toISOString() } : d))
  }

  const deleteDocument = async (id: string) => {
    const { error: err } = await supabase.from('documents').delete().eq('id', id)
    if (err) throw new Error(`Error deleting document: ${err.message}`)
    setDocuments(prev => prev.filter(d => d.id !== id))
  }

  const getDocumentsByTask = useCallback(
    (taskId: string): Document[] => documents.filter(d => d.task_id === taskId),
    [documents]
  )

  const deleteFile = async (id: string, url: string) => {
    const { error: dbError } = await supabase.from('files').delete().eq('id', id)
    if (dbError) throw dbError

    const path = url.split('/documents/')[1]
    if (path) await supabase.storage.from('documents').remove([path])

    setFiles(prev => prev.filter(f => f.id !== id))
  }

  return (
    <DocumentsContext.Provider value={{
      folders, files, documents, allFolders, breadcrumbs, currentFolderId,
      filter, isFiltering,
      loading, error, isInitialized,
      setCurrentFolderId, setFilter, clearFilter,
      createFolder, uploadFile, updateFile, updateFolder, deleteFolder, deleteFile,
      createDocument, updateDocument, deleteDocument, getDocumentsByTask,
      refresh: async () => loadDocuments()
    }}>
      {children}
    </DocumentsContext.Provider>
  )
}

export const useDocuments = () => {
  const context = useContext(DocumentsContext)
  if (context === undefined) {
    throw new Error('useDocuments must be used within a DocumentsProvider')
  }
  return context
}
