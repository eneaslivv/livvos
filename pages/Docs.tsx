import React, { useState, useRef } from 'react';
import { Icons } from '../components/ui/Icons';
import { Card } from '../components/ui/Card';
import { useDocuments, File as DocFile } from '../hooks/useDocuments';
import { useClients } from '../hooks/useClients';
import { useProjects } from '../context/ProjectsContext';
import { ProposalsPanel } from '../components/docs/ProposalsPanel';
import { BlogPanel } from '../components/docs/BlogPanel';

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

  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [activeTab, setActiveTab] = useState<'documents' | 'proposals' | 'blog'>('documents');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [linkType, setLinkType] = useState<'none' | 'client' | 'project'>('none');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [showAssignment, setShowAssignment] = useState(false);

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
    setUploadError(null);
    const file = e.target.files[0];

    try {
      await uploadFile(file as any, currentLinkOptions);
    } catch (err: any) {
      console.error('Upload error:', err);
      const msg = err.message || 'Error desconocido al subir archivo';
      setUploadError(msg);
      setTimeout(() => setUploadError(null), 6000);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
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
    if (type.includes('image')) return <Icons.Image className="text-purple-500" size={24} />;
    if (type.includes('pdf')) return <Icons.File className="text-red-500" size={24} />;
    if (type.includes('sheet') || type.includes('excel')) return <Icons.FileSheet className="text-green-500" size={24} />;
    if (type.includes('code') || type.includes('json')) return <Icons.FileCode className="text-blue-500" size={24} />;
    return <Icons.Docs className="text-gray-500" size={24} />;
  };

  if (loading && !folders.length && !files.length && activeTab === 'documents') {
    return (
      <div className="max-w-7xl mx-auto px-4 py-4 sm:p-6 flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900 dark:border-zinc-100"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-4 sm:p-6">
      {/* Header: Row 1 - Title + Tabs */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Documentos</h1>
            {activeTab === 'documents' && (
              <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                <button
                  onClick={() => setCurrentFolderId(null)}
                  className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                >
                  Inicio
                </button>
                {breadcrumbs.map((folder) => (
                  <React.Fragment key={folder.id}>
                    <Icons.ChevronRight size={14} />
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

          <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1 self-start sm:self-auto">
            <button
              onClick={() => setActiveTab('documents')}
              className={`px-3 py-2 rounded-md text-xs font-semibold transition-colors ${activeTab === 'documents'
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
            >
              Documentos
            </button>
            <button
              onClick={() => setActiveTab('proposals')}
              className={`px-3 py-2 rounded-md text-xs font-semibold transition-colors ${activeTab === 'proposals'
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
            >
              Propuestas
            </button>
            <button
              onClick={() => setActiveTab('blog')}
              className={`px-3 py-2 rounded-md text-xs font-semibold transition-colors ${activeTab === 'blog'
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
            >
              Blog
            </button>
          </div>
        </div>

        {/* Row 2 - Document controls (only when documents tab is active) */}
        {activeTab === 'documents' && (
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Grid/List toggle */}
            <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
              <button
                onClick={() => setView('grid')}
                className={`p-2 rounded-md transition-colors ${view === 'grid'
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
              >
                <Icons.Grid size={18} />
              </button>
              <button
                onClick={() => setView('list')}
                className={`p-2 rounded-md transition-colors ${view === 'list'
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
              >
                <Icons.List size={18} />
              </button>
            </div>

            {/* Assignment toggle button - mobile only */}
            <button
              onClick={() => setShowAssignment(!showAssignment)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs border rounded-lg transition-colors sm:hidden ${
                linkType !== 'none'
                  ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                  : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
              }`}
            >
              <Icons.Link size={14} />
              Asignar
            </button>

            {/* Assignment controls - always visible on sm+, toggled on mobile */}
            <div className={`${showAssignment ? 'flex' : 'hidden'} sm:flex items-center gap-2 w-full sm:w-auto`}>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 hidden sm:inline">Asignar a</span>
              <select
                value={linkType}
                onChange={(e) => {
                  const value = e.target.value as 'none' | 'client' | 'project';
                  setLinkType(value);
                  if (value !== 'client') setSelectedClientId('');
                  if (value !== 'project') setSelectedProjectId('');
                }}
                className="px-3 py-2 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 w-full sm:w-auto"
              >
                <option value="none">Sin asignar</option>
                <option value="client">Cliente</option>
                <option value="project">Proyecto</option>
              </select>
              {linkType === 'client' && (
                <select
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="px-3 py-2 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 w-full sm:w-auto"
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
                  className="px-3 py-2 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 w-full sm:w-auto"
                >
                  <option value="">Selecciona proyecto</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.title}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Spacer to push action buttons right on desktop */}
            <div className="hidden sm:block flex-1" />

            {/* New folder button */}
            <button
              onClick={() => setShowNewFolderInput(true)}
              className="flex items-center gap-2 px-3 py-2 sm:px-4 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-zinc-900 dark:text-zinc-100"
            >
              <Icons.Folder size={18} />
              <span className="hidden sm:inline">Nueva Carpeta</span>
            </button>

            {/* Upload button */}
            <label className={`flex items-center gap-2 px-3 py-2 sm:px-4 rounded-lg transition-colors cursor-pointer ${isUploading ? 'bg-zinc-500 text-white cursor-wait' : uploadError ? 'bg-red-600 text-white' : 'bg-zinc-900 text-white hover:bg-zinc-800'}`}>
              {isUploading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              ) : (
                <Icons.Upload size={18} />
              )}
              <span className="hidden sm:inline">
                {isUploading ? 'Subiendo...' : uploadError ? 'Error - Reintentar' : 'Subir Archivo'}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileUpload}
                disabled={isUploading}
              />
            </label>
          </div>
        )}
      </div>

      {uploadError && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3">
          <Icons.Alert size={18} className="text-red-500 flex-shrink-0" />
          <span className="text-sm text-red-700 dark:text-red-300 flex-1">{uploadError}</span>
          <button onClick={() => setUploadError(null)} className="text-red-400 hover:text-red-600">
            <Icons.Close size={16} />
          </button>
        </div>
      )}

      {activeTab === 'documents' && showNewFolderInput && (
        <Card className="mb-6 p-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <Icons.Folder size={24} className="text-blue-500 hidden sm:block" />
            <input
              type="text"
              placeholder="Nombre de la carpeta"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="flex-1 px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreateFolder}
                className="flex-1 sm:flex-none px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Crear
              </button>
              <button
                onClick={() => setShowNewFolderInput(false)}
                className="flex-1 sm:flex-none px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'proposals' ? (
        <ProposalsPanel />
      ) : activeTab === 'blog' ? (
        <BlogPanel />
      ) : folders.length === 0 && files.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Icons.Folder size={32} className="text-zinc-400 dark:text-zinc-500" />
          </div>
          <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 mb-2">Carpeta vacía</h3>
          <p className="text-zinc-500 dark:text-zinc-400 mb-6">No hay archivos ni carpetas en esta ubicación</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Si es la primera vez, asegúrate de haber ejecutado el SQL de migración para las tablas.
          </p>
        </div>
      ) : (
        <div className={view === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4' : 'space-y-2'}>
          {/* Carpetas */}
          {folders.map((folder) => (
            <div
              key={folder.id}
              onClick={() => setCurrentFolderId(folder.id)}
              className={`group cursor-pointer border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 hover:border-blue-500 dark:hover:border-blue-500 transition-all ${view === 'grid' ? 'bg-white dark:bg-zinc-900' : 'flex items-center gap-4 bg-white dark:bg-zinc-900'
                }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className={`flex items-center gap-3 ${view === 'list' && 'flex-1'}`}>
                  <Icons.Folder size={view === 'grid' ? 32 : 24} className="text-blue-500" />
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">{folder.name}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('¿Eliminar carpeta?')) deleteFolder(folder.id);
                  }}
                  className="text-zinc-400 hover:text-red-500 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                >
                  <Icons.Trash size={16} />
                </button>
              </div>
              {view === 'grid' && (
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  Carpeta
                </div>
              )}
            </div>
          ))}

          {/* Archivos */}
          {files.map((file) => (
            <div
              key={file.id}
              className={`group relative border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 hover:border-blue-500 dark:hover:border-blue-500 transition-all ${view === 'grid' ? 'bg-white dark:bg-zinc-900' : 'flex items-center gap-4 bg-white dark:bg-zinc-900'
                }`}
            >
              <div className={`flex items-center justify-between ${view === 'grid' ? 'mb-2' : 'flex-1'}`}>
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {getFileIcon(file.type)}
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate">{file.name}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{formatSize(file.size)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-400 hover:text-blue-500 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                  >
                    <Icons.External size={16} />
                  </a>
                  <button
                    onClick={() => {
                      if (confirm('¿Eliminar archivo?')) deleteFile(file.id, file.url);
                    }}
                    className="text-zinc-400 hover:text-red-500 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                  >
                    <Icons.Trash size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
