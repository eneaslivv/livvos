import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { errorLogger } from '../lib/errorLogger'
import { useTenantId } from './TenantContext'

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

interface DocumentsContextType {
  folders: Folder[]
  files: File[]
  breadcrumbs: Folder[]
  currentFolderId: string | null
  loading: boolean
  error: string | null
  isInitialized: boolean
  setCurrentFolderId: (id: string | null) => void
  createFolder: (name: string, color?: string, options?: { clientId?: string | null; projectId?: string | null }) => Promise<Folder>
  uploadFile: (file: any, options?: { clientId?: string | null; projectId?: string | null }) => Promise<File>
  deleteFolder: (id: string) => Promise<void>
  deleteFile: (id: string, url: string) => Promise<void>
  refresh: () => Promise<void>
}

const DocumentsContext = createContext<DocumentsContextType | undefined>(undefined)

export const DocumentsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const tenantId = useTenantId()
  const [folders, setFolders] = useState<Folder[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<Folder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  // Cargar datos
  const loadDocuments = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      errorLogger.log('Cargando documentos...')
      
      // Cargar carpetas del nivel actual
      let foldersQuery = supabase.from('folders').select('*').order('name', { ascending: true })
      if (currentFolderId) {
        foldersQuery = foldersQuery.eq('parent_id', currentFolderId)
      } else {
        foldersQuery = foldersQuery.is('parent_id', null)
      }
      
      // Cargar archivos del nivel actual
      let filesQuery = supabase.from('files').select('*').order('name', { ascending: true })
      if (currentFolderId) {
        filesQuery = filesQuery.eq('folder_id', currentFolderId)
      } else {
        filesQuery = filesQuery.is('folder_id', null)
      }

      const [foldersRes, filesRes] = await Promise.all([foldersQuery, filesQuery])
      
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
      
      // Construir breadcrumbs
      if (currentFolderId) {
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
    } catch (err: any) {
      errorLogger.error('Error cargando documentos', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [currentFolderId])

  useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  const createFolder = async (
    name: string,
    color: string = '#3b82f6',
    options?: { clientId?: string | null; projectId?: string | null }
  ) => {
    const user = (await supabase.auth.getUser()).data.user
    if (!user) throw new Error('Usuario no autenticado')
    if (!tenantId) throw new Error('Tenant no disponible')

    const { clientId = null, projectId = null } = options || {}

    const { data, error: err } = await supabase.from('folders').insert({
      name,
      parent_id: currentFolderId,
      color,
      owner_id: user.id,
      tenant_id: tenantId,
      client_id: clientId,
      project_id: projectId
    }).select().single()
    if (err) throw err
    setFolders(prev => [...prev, data])
    return data
  }

  const uploadFile = async (file: any, options?: { clientId?: string | null; projectId?: string | null }) => {
    const user = (await supabase.auth.getUser()).data.user
    if (!user) throw new Error('Usuario no autenticado')
    if (!tenantId) throw new Error('Tenant no disponible')
    const fileName = `${user.id}/${Date.now()}_${file.name}`
    
    const { error: uploadError } = await supabase.storage.from('documents').upload(fileName, file)
    if (uploadError) throw uploadError
    
    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(fileName)
    
    const { clientId = null, projectId = null } = options || {}

    const { data: fileData, error: dbError } = await supabase.from('files').insert({
      name: file.name,
      type: file.type,
      size: file.size,
      url: urlData.publicUrl,
      folder_id: currentFolderId,
      owner_id: user.id,
      tenant_id: tenantId,
      client_id: clientId,
      project_id: projectId
    }).select().single()
    if (dbError) throw dbError
    
    setFiles(prev => [...prev, fileData])
    return fileData
  }

  const deleteFolder = async (id: string) => {
    const { error: err } = await supabase.from('folders').delete().eq('id', id)
    if (err) throw err
    setFolders(prev => prev.filter(f => f.id !== id))
  }

  const deleteFile = async (id: string, url: string) => {
    const { error: dbError } = await supabase.from('files').delete().eq('id', id)
    if (dbError) throw dbError
    
    const path = url.split('/documents/')[1]
    if (path) await supabase.storage.from('documents').remove([path])
    
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  return (
    <DocumentsContext.Provider value={{
      folders, files, breadcrumbs, currentFolderId, loading, error, isInitialized,
      setCurrentFolderId, createFolder, uploadFile, deleteFolder, deleteFile,
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
