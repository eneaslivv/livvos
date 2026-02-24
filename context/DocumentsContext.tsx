import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
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
  const ensureLoadedRef = useRef(false)

  // Cargar datos
  const loadDocuments = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      errorLogger.log('Cargando documentos...')

      // Cargar carpetas del nivel actual - scoped to tenant
      let foldersQuery = supabase.from('folders').select('id, owner_id, tenant_id, client_id, project_id, name, parent_id, color, is_favorite, created_at, updated_at').order('name', { ascending: true })
      if (tenantId) {
        foldersQuery = foldersQuery.eq('tenant_id', tenantId)
      }
      if (currentFolderId) {
        foldersQuery = foldersQuery.eq('parent_id', currentFolderId)
      } else {
        foldersQuery = foldersQuery.is('parent_id', null)
      }

      // Cargar archivos del nivel actual - scoped to tenant
      let filesQuery = supabase.from('files').select('id, owner_id, tenant_id, client_id, project_id, folder_id, name, type, size, url, is_favorite, tags, created_at, updated_at').order('name', { ascending: true })
      if (tenantId) {
        filesQuery = filesQuery.eq('tenant_id', tenantId)
      }
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
  }, [currentFolderId, tenantId])

  // Lazy load: only fetch when first consumer mounts
  const _ensureLoaded = useCallback(() => {
    if (ensureLoadedRef.current) return
    ensureLoadedRef.current = true
    loadDocuments()
  }, [loadDocuments])

  // When folder changes, reload (but only after initial load)
  const prevFolderIdRef = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (prevFolderIdRef.current === undefined) {
      prevFolderIdRef.current = currentFolderId
      return
    }
    if (prevFolderIdRef.current !== currentFolderId) {
      prevFolderIdRef.current = currentFolderId
      loadDocuments()
    }
  }, [currentFolderId, loadDocuments])

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

    if (!tenantId) throw new Error('Tenant no disponible. Espera a que el sistema cargue e intenta de nuevo.')

    // Get the user's session token for API auth
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Sesión no disponible. Vuelve a iniciar sesión.')

    // Step 1: Get a signed upload URL from our serverless API (service_role key stays server-side)
    const apiBase = import.meta.env.DEV ? '' : ''
    const signedUrlRes = await fetch(`${apiBase}/api/upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        fileName: file.name,
        contentType: file.type
      })
    })

    if (!signedUrlRes.ok) {
      const errData = await signedUrlRes.json().catch(() => ({ error: 'Error del servidor' }))
      throw new Error(errData.error || `Error obteniendo URL de subida (${signedUrlRes.status})`)
    }

    const { token, path: storagePath, publicUrl } = await signedUrlRes.json()

    // Step 2: Upload directly to Supabase Storage using the signed URL token (bypasses RLS)
    // The token was generated server-side with the service_role key
    const uploadPromise = supabase.storage
      .from('documents')
      .uploadToSignedUrl(storagePath, token, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false
      })

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('La subida tardó demasiado. Verifica tu conexión e intenta de nuevo.')), 120000)
    )

    const uploadResult = await Promise.race([uploadPromise, timeoutPromise])
    if ('error' in uploadResult && uploadResult.error) {
      throw new Error(`Error subiendo archivo: ${uploadResult.error.message}`)
    }

    // Step 3: Save file metadata to database
    const { clientId = null, projectId = null } = options || {}

    const { data: fileData, error: dbError } = await supabase.from('files').insert({
      name: file.name,
      type: file.type,
      size: file.size,
      url: publicUrl,
      folder_id: currentFolderId,
      owner_id: user.id,
      tenant_id: tenantId,
      client_id: clientId,
      project_id: projectId
    }).select().single()

    if (dbError) {
      // Storage succeeded but DB failed - try to clean up the orphaned storage file
      // Use admin API to delete since we can't delete via client RLS either
      errorLogger.error('DB insert failed after storage upload, orphaned file:', storagePath)
      throw new Error(`Error guardando metadatos: ${dbError.message}`)
    }

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
      refresh: async () => loadDocuments(),
      _ensureLoaded
    } as any}>
      {children}
    </DocumentsContext.Provider>
  )
}

export const useDocuments = () => {
  const context = useContext(DocumentsContext)
  if (context === undefined) {
    throw new Error('useDocuments must be used within a DocumentsProvider')
  }
  useEffect(() => { (context as any)._ensureLoaded?.() }, [])
  return context
}
