import React, { useState, useEffect, useRef } from 'react';
import { Icons } from '../components/ui/Icons';
import { Card } from '../components/ui/Card';
import { useDocuments, File as DocFile } from '../hooks/useDocuments';
import { useClients } from '../hooks/useClients';
import { useProjects } from '../context/ProjectsContext';
import { ProposalsPanel } from '../components/docs/ProposalsPanel';
import { BlogPanel } from '../components/docs/BlogPanel';
import { PasswordsPanel } from '../components/docs/PasswordsPanel';

export const Docs: React.FC = () => {
  const {
    folders,
    files,
    breadcrumbs,
    currentFolderId,
    loading,
    error,
    setCurrentFolderId,
    createFolder,
    uploadFile,
    deleteFolder,
    deleteFile
  } = useDocuments();
  const { clients } = useClients();
  const { projects } = useProjects();

  // Loading timeout
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const loadingStartRef = useRef(Date.now());
  useEffect(() => {
    if (loading) {
      const elapsed = Date.now() - loadingStartRef.current;
      const remaining = Math.max(0, 5000 - elapsed);
      const timer = setTimeout(() => setLoadingTimedOut(true), remaining);
      return () => clearTimeout(timer);
    }
    loadingStartRef.current = Date.now();
    setLoadingTimedOut(false);
  }, [loading]);

  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [activeTab, setActiveTab] = useState<'documents' | 'proposals' | 'blog' | 'passwords'>('documents');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [linkType, setLinkType] = useState<'none' | 'client' | 'project'>('none');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');

  const currentLinkOptions = {
    clientId: linkType === 'client' && selectedClientId ? selectedClientId : null,
    projectId: linkType === 'project' && selectedProjectId ? selectedProjectId : null
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await createFolder(newFolderName, '#3b82f6', currentLinkOptions);
      setNewFolderName('');
      setShowNewFolderInput(false);
    } catch (err) {
      alert('Error al crear carpeta');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    setIsUploading(true);
    try {
      const file = e.target.files[0];
      await uploadFile(file as any, currentLinkOptions);
    } catch (err: any) {
      console.error('Full upload error:', err);
      alert(`Error al subir archivo: ${err.message || JSON.stringify(err)}`);
    } finally {
      setIsUploading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileIcon = (type: string) => {
    if (type.includes('image')) return <Icons.Image className="text-violet-500" size={22} />;
    if (type.includes('pdf')) return <Icons.File className="text-rose-500" size={22} />;
    if (type.includes('sheet') || type.includes('excel')) return <Icons.FileSheet className="text-emerald-500" size={22} />;
    if (type.includes('code') || type.includes('json')) return <Icons.FileCode className="text-sky-500" size={22} />;
    return <Icons.Docs className="text-zinc-400" size={22} />;
  };

  const tabs = [
    { id: 'documents' as const, label: 'Documentos', icon: Icons.Folder },
    { id: 'proposals' as const, label: 'Propuestas', icon: Icons.File },
    { id: 'blog' as const, label: 'Blog', icon: Icons.Docs },
    { id: 'passwords' as const, label: 'Contraseñas', icon: Icons.Lock },
  ];

  if (loading && !loadingTimedOut && !folders.length && !files.length && activeTab === 'documents') {
    return (
      <div className="max-w-7xl mx-auto p-4 sm:p-6 flex justify-center items-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-zinc-200 dark:border-zinc-700 border-t-zinc-900 dark:border-t-zinc-100 mx-auto mb-3"></div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Cargando documentos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto pt-4 pb-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Documentos</h1>
            {activeTab === 'documents' && (
              <div className="flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400 mt-1.5">
                <button
                  onClick={() => setCurrentFolderId(null)}
                  className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors font-medium"
                >
                  Inicio
                </button>
                {breadcrumbs.map((folder) => (
                  <React.Fragment key={folder.id}>
                    <Icons.ChevronRight size={12} className="text-zinc-300 dark:text-zinc-600" />
                    <button
                      onClick={() => setCurrentFolderId(folder.id)}
                      className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                    >
                      {folder.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>

          {/* Actions for documents tab */}
          {activeTab === 'documents' && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowNewFolderInput(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium border border-zinc-200 dark:border-zinc-700 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors text-zinc-700 dark:text-zinc-300"
              >
                <Icons.Folder size={15} />
                <span className="hidden sm:inline">Nueva Carpeta</span>
              </button>

              <label className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors cursor-pointer shadow-sm">
                <Icons.Upload size={15} />
                {isUploading ? 'Subiendo...' : 'Subir Archivo'}
                <input
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                />
              </label>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex bg-zinc-100/80 dark:bg-zinc-800/60 rounded-xl p-1 w-fit">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                  }`}
              >
                <tab.icon size={14} />
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'documents' && (
            <div className="flex items-center gap-3 flex-wrap">
              {/* Assign selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400 dark:text-zinc-500 hidden sm:inline">Asignar a</span>
                <select
                  value={linkType}
                  onChange={(e) => {
                    const value = e.target.value as 'none' | 'client' | 'project';
                    setLinkType(value);
                    if (value !== 'client') setSelectedClientId('');
                    if (value !== 'project') setSelectedProjectId('');
                  }}
                  className="px-3 py-1.5 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10"
                >
                  <option value="none">Sin asignar</option>
                  <option value="client">Cliente</option>
                  <option value="project">Proyecto</option>
                </select>
                {linkType === 'client' && (
                  <select
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    className="px-3 py-1.5 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10"
                  >
                    <option value="">Selecciona cliente</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>{client.name}</option>
                    ))}
                  </select>
                )}
                {linkType === 'project' && (
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="px-3 py-1.5 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10"
                  >
                    <option value="">Selecciona proyecto</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.title}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* View toggle */}
              <div className="flex bg-zinc-100/80 dark:bg-zinc-800/60 rounded-lg p-0.5">
                <button
                  onClick={() => setView('grid')}
                  className={`p-1.5 rounded-md transition-all ${view === 'grid'
                      ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                      : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300'
                    }`}
                >
                  <Icons.Grid size={15} />
                </button>
                <button
                  onClick={() => setView('list')}
                  className={`p-1.5 rounded-md transition-all ${view === 'list'
                      ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                      : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300'
                    }`}
                >
                  <Icons.List size={15} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New folder inline form */}
      {activeTab === 'documents' && showNewFolderInput && (
        <div className="mb-5 p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
              <Icons.Folder size={20} className="text-blue-500" />
            </div>
            <input
              type="text"
              placeholder="Nombre de la carpeta..."
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-zinc-400"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
            />
            <button
              onClick={handleCreateFolder}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Crear
            </button>
            <button
              onClick={() => { setShowNewFolderInput(false); setNewFolderName(''); }}
              className="px-4 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Tab content */}
      {activeTab === 'proposals' ? (
        <ProposalsPanel />
      ) : activeTab === 'blog' ? (
        <BlogPanel />
      ) : activeTab === 'passwords' ? (
        <PasswordsPanel />
      ) : folders.length === 0 && files.length === 0 ? (
        /* Empty state */
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Icons.Folder size={28} className="text-zinc-400 dark:text-zinc-500" />
          </div>
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-1.5">Carpeta vacía</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
            No hay archivos ni carpetas en esta ubicación. Sube un archivo o crea una carpeta para empezar.
          </p>
        </div>
      ) : (
        /* Documents grid / list */
        <div className={
          view === 'grid'
            ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3'
            : 'space-y-1.5'
        }>
          {/* Folders */}
          {folders.map((folder) => (
            view === 'grid' ? (
              <div
                key={folder.id}
                onClick={() => setCurrentFolderId(folder.id)}
                className="group cursor-pointer bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl p-4 hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                    <Icons.Folder size={20} className="text-blue-500" />
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('¿Eliminar carpeta?')) deleteFolder(folder.id);
                    }}
                    className="text-zinc-300 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1"
                  >
                    <Icons.Trash size={14} />
                  </button>
                </div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{folder.name}</p>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">Carpeta</p>
              </div>
            ) : (
              <div
                key={folder.id}
                onClick={() => setCurrentFolderId(folder.id)}
                className="group cursor-pointer flex items-center gap-3 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-lg px-4 py-3 hover:border-zinc-300 dark:hover:border-zinc-600 transition-all"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                  <Icons.Folder size={16} className="text-blue-500" />
                </div>
                <span className="flex-1 text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{folder.name}</span>
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500 mr-2">Carpeta</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('¿Eliminar carpeta?')) deleteFolder(folder.id);
                  }}
                  className="text-zinc-300 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1"
                >
                  <Icons.Trash size={14} />
                </button>
              </div>
            )
          ))}

          {/* Files */}
          {files.map((file) => (
            view === 'grid' ? (
              <div
                key={file.id}
                className="group bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl p-4 hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center">
                    {getFileIcon(file.type)}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-zinc-300 dark:text-zinc-600 hover:text-blue-500 dark:hover:text-blue-400 p-1"
                    >
                      <Icons.External size={13} />
                    </a>
                    <button
                      onClick={() => {
                        if (confirm('¿Eliminar archivo?')) deleteFile(file.id, file.url);
                      }}
                      className="text-zinc-300 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 p-1"
                    >
                      <Icons.Trash size={13} />
                    </button>
                  </div>
                </div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{file.name}</p>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">{formatSize(file.size)}</p>
              </div>
            ) : (
              <div
                key={file.id}
                className="group flex items-center gap-3 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-lg px-4 py-3 hover:border-zinc-300 dark:hover:border-zinc-600 transition-all"
              >
                <div className="w-8 h-8 rounded-lg bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
                  {getFileIcon(file.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{file.name}</p>
                </div>
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500 flex-shrink-0">{formatSize(file.size)}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-300 dark:text-zinc-600 hover:text-blue-500 dark:hover:text-blue-400 p-1"
                  >
                    <Icons.External size={13} />
                  </a>
                  <button
                    onClick={() => {
                      if (confirm('¿Eliminar archivo?')) deleteFile(file.id, file.url);
                    }}
                    className="text-zinc-300 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 p-1"
                  >
                    <Icons.Trash size={13} />
                  </button>
                </div>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  );
};
