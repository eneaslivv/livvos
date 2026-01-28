import React, { useState } from 'react';
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
      await uploadFile(file as any, currentLinkOptions); // Casting porque el tipo File del navegador es compatible
    } catch (err) {
      alert('Error al subir archivo');
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
    if (type.includes('image')) return <Icons.Image className="text-purple-500" size={24} />;
    if (type.includes('pdf')) return <Icons.File className="text-red-500" size={24} />;
    if (type.includes('sheet') || type.includes('excel')) return <Icons.FileSheet className="text-green-500" size={24} />;
    if (type.includes('code') || type.includes('json')) return <Icons.FileCode className="text-blue-500" size={24} />;
    return <Icons.Docs className="text-gray-500" size={24} />;
  };

  if (loading && !folders.length && !files.length && activeTab === 'documents') {
    return (
      <div className="max-w-7xl mx-auto p-6 flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900 dark:border-zinc-100"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
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

        <div className="flex items-center gap-3">
          <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('documents')}
              className={`px-3 py-2 rounded-md text-xs font-semibold transition-colors ${
                activeTab === 'documents'
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              Documentos
            </button>
            <button
              onClick={() => setActiveTab('proposals')}
              className={`px-3 py-2 rounded-md text-xs font-semibold transition-colors ${
                activeTab === 'proposals'
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              Propuestas
            </button>
            <button
              onClick={() => setActiveTab('blog')}
              className={`px-3 py-2 rounded-md text-xs font-semibold transition-colors ${
                activeTab === 'blog'
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              Blog
            </button>
          </div>

          {activeTab === 'documents' && (
            <>
              <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
                <button
                  onClick={() => setView('grid')}
                  className={`p-2 rounded-md transition-colors ${
                    view === 'grid'
                      ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  <Icons.Grid size={18} />
                </button>
                <button
                  onClick={() => setView('list')}
                  className={`p-2 rounded-md transition-colors ${
                    view === 'list'
                      ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  <Icons.List size={18} />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Asignar a</span>
                <select
                  value={linkType}
                  onChange={(e) => {
                    const value = e.target.value as 'none' | 'client' | 'project';
                    setLinkType(value);
                    if (value !== 'client') setSelectedClientId('');
                    if (value !== 'project') setSelectedProjectId('');
                  }}
                  className="px-3 py-2 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                >
                  <option value="none">Sin asignar</option>
                  <option value="client">Cliente</option>
                  <option value="project">Proyecto</option>
                </select>
                {linkType === 'client' && (
                  <select
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    className="px-3 py-2 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
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
                    className="px-3 py-2 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="">Selecciona proyecto</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.title}</option>
                    ))}
                  </select>
                )}
              </div>

              <button
                onClick={() => setShowNewFolderInput(true)}
                className="flex items-center gap-2 px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-zinc-900 dark:text-zinc-100"
              >
                <Icons.Folder size={18} />
                Nueva Carpeta
              </button>
              
              <label className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer">
                <Icons.Upload size={18} />
                {isUploading ? 'Subiendo...' : 'Subir Archivo'}
                <input 
                  type="file" 
                  className="hidden" 
                  onChange={handleFileUpload}
                  disabled={isUploading}
                />
              </label>
            </>
          )}
        </div>
      </div>

      {activeTab === 'documents' && showNewFolderInput && (
        <Card className="mb-6 p-4">
          <div className="flex items-center gap-3">
            <Icons.Folder size={24} className="text-blue-500" />
            <input
              type="text"
              placeholder="Nombre de la carpeta"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="flex-1 px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
            />
            <button
              onClick={handleCreateFolder}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Crear
            </button>
            <button
              onClick={() => setShowNewFolderInput(false)}
              className="px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancelar
            </button>
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
        <div className={view === 'grid' ? 'grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4' : 'space-y-2'}>
          {/* Carpetas */}
          {folders.map((folder) => (
            <div
              key={folder.id}
              onClick={() => setCurrentFolderId(folder.id)}
              className={`group cursor-pointer border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 hover:border-blue-500 dark:hover:border-blue-500 transition-all ${
                view === 'grid' ? 'bg-white dark:bg-zinc-900' : 'flex items-center gap-4 bg-white dark:bg-zinc-900'
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
                    if(confirm('¿Eliminar carpeta?')) deleteFolder(folder.id);
                  }}
                  className="text-zinc-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
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
              className={`group relative border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 hover:border-blue-500 dark:hover:border-blue-500 transition-all ${
                view === 'grid' ? 'bg-white dark:bg-zinc-900' : 'flex items-center gap-4 bg-white dark:bg-zinc-900'
              }`}
            >
              <div className={`flex items-center justify-between ${view === 'grid' ? 'mb-2' : 'flex-1'}`}>
                <div className="flex items-center gap-3">
                  {getFileIcon(file.type)}
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate">{file.name}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{formatSize(file.size)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-400 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Icons.External size={16} />
                  </a>
                  <button
                    onClick={() => {
                      if(confirm('¿Eliminar archivo?')) deleteFile(file.id, file.url);
                    }}
                    className="text-zinc-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
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
