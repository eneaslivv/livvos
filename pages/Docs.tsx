import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../components/ui/Icons';
import { useDocuments, File as DocFile } from '../hooks/useDocuments';
import { useClients } from '../hooks/useClients';
import { useProjects } from '../context/ProjectsContext';
import { ProposalsPanel } from '../components/docs/ProposalsPanel';
import { BlogPanel } from '../components/docs/BlogPanel';
import { PasswordsPanel } from '../components/docs/PasswordsPanel';
import { DocumentEditor } from '../components/docs/DocumentEditor';
import { DocumentCard } from '../components/docs/DocumentCard';

export const Docs: React.FC = () => {
  const {
    folders,
    files,
    allFolders,
    breadcrumbs,
    currentFolderId,
    loading,
    error,
    setCurrentFolderId,
    createFolder,
    uploadFile,
    updateFile,
    updateFolder,
    deleteFolder,
    deleteFile,
    documents,
    createDocument,
    deleteDocument
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
  const [uploadProgress, setUploadProgress] = useState(0);
  const [linkType, setLinkType] = useState<'none' | 'client' | 'project'>('none');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [folderError, setFolderError] = useState<string | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Action menu state (Move / Assign / Delete)
  const [actionMenu, setActionMenu] = useState<{ type: 'file' | 'folder'; id: string; name: string; url?: string; currentFolderId?: string | null; clientId?: string | null; projectId?: string | null } | null>(null);
  const [actionView, setActionView] = useState<'menu' | 'move' | 'assign'>('menu');
  const [assignType, setAssignType] = useState<'none' | 'client' | 'project'>('none');
  const [assignClientId, setAssignClientId] = useState('');
  const [assignProjectId, setAssignProjectId] = useState('');

  const openActionMenu = (type: 'file' | 'folder', item: any) => {
    setActionMenu({
      type,
      id: item.id,
      name: item.name,
      url: item.url,
      currentFolderId: type === 'file' ? item.folder_id : item.parent_id,
      clientId: item.client_id || null,
      projectId: item.project_id || null,
    });
    setActionView('menu');
    // Pre-fill assign state
    if (item.client_id) { setAssignType('client'); setAssignClientId(item.client_id); setAssignProjectId(''); }
    else if (item.project_id) { setAssignType('project'); setAssignProjectId(item.project_id); setAssignClientId(''); }
    else { setAssignType('none'); setAssignClientId(''); setAssignProjectId(''); }
  };

  const closeActionMenu = () => { setActionMenu(null); setActionView('menu'); };

  const handleMove = async (targetFolderId: string | null) => {
    if (!actionMenu) return;
    try {
      if (actionMenu.type === 'file') {
        await updateFile(actionMenu.id, { folder_id: targetFolderId });
      } else {
        await updateFolder(actionMenu.id, { parent_id: targetFolderId });
      }
      closeActionMenu();
    } catch (err: any) {
      alert(`Error moving: ${err.message}`);
    }
  };

  const handleAssign = async () => {
    if (!actionMenu) return;
    const updates = {
      client_id: assignType === 'client' && assignClientId ? assignClientId : null,
      project_id: assignType === 'project' && assignProjectId ? assignProjectId : null,
    };
    try {
      if (actionMenu.type === 'file') {
        await updateFile(actionMenu.id, updates);
      } else {
        await updateFolder(actionMenu.id, updates);
      }
      closeActionMenu();
    } catch (err: any) {
      alert(`Error assigning: ${err.message}`);
    }
  };

  const currentLinkOptions = {
    clientId: linkType === 'client' && selectedClientId ? selectedClientId : null,
    projectId: linkType === 'project' && selectedProjectId ? selectedProjectId : null
  };

  // Navigate back to parent folder
  const handleBack = useCallback(() => {
    if (breadcrumbs.length >= 2) {
      setCurrentFolderId(breadcrumbs[breadcrumbs.length - 2].id);
    } else {
      setCurrentFolderId(null);
    }
  }, [breadcrumbs, setCurrentFolderId]);

  const currentFolderName = breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1].name : 'Documents';

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setFolderError(null);
    setIsCreatingFolder(true);
    try {
      await createFolder(newFolderName, '#3b82f6', currentLinkOptions);
      setNewFolderName('');
      setShowNewFolderInput(false);
    } catch (err: any) {
      console.error('Error creating folder:', err);
      setFolderError(err?.message || 'Unknown error creating folder');
    } finally {
      setIsCreatingFolder(false);
    }
  };

  // Multi-file upload handler
  const handleFilesUpload = async (fileList: FileList | File[]) => {
    const filesToUpload = Array.from(fileList);
    if (filesToUpload.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);
    let uploaded = 0;

    try {
      for (const file of filesToUpload) {
        await uploadFile(file as any, currentLinkOptions);
        uploaded++;
        setUploadProgress(Math.round((uploaded / filesToUpload.length) * 100));
      }
    } catch (err: any) {
      console.error('Upload error:', err);
      alert(`Error uploading file: ${err.message || JSON.stringify(err)}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesUpload(e.target.files);
      e.target.value = '';
    }
  };

  // Drag & drop
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesUpload(e.dataTransfer.files);
    }
  }, [currentLinkOptions]);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const fmtDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
    catch { return ''; }
  };

  const isImageType = (type: string) => type.includes('image');

  const getFileIcon = (type: string, name: string) => {
    if (type.includes('image')) return <Icons.Image className="text-violet-500" size={22} />;
    if (type.includes('video')) return <Icons.Video className="text-purple-500" size={22} />;
    if (type.includes('audio')) return <Icons.Video className="text-pink-500" size={22} />;
    if (type.includes('pdf')) return <Icons.File className="text-rose-500" size={22} />;
    if (type.includes('sheet') || type.includes('excel') || type.includes('csv')) return <Icons.FileSheet className="text-emerald-500" size={22} />;
    if (type.includes('zip') || type.includes('rar') || type.includes('7z') || type.includes('tar') || type.includes('gz')) return <Icons.Archive className="text-amber-500" size={22} />;
    if (type.includes('code') || type.includes('json') || type.includes('javascript') || type.includes('typescript') || type.includes('html') || type.includes('css')) return <Icons.FileCode className="text-sky-500" size={22} />;
    if (type.includes('word') || type.includes('document')) return <Icons.File className="text-blue-500" size={22} />;
    if (type.includes('presentation') || type.includes('powerpoint')) return <Icons.File className="text-orange-500" size={22} />;
    // Check by extension
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return <Icons.Video className="text-purple-500" size={22} />;
    if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext)) return <Icons.Video className="text-pink-500" size={22} />;
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return <Icons.Archive className="text-amber-500" size={22} />;
    return <Icons.Docs className="text-zinc-400" size={22} />;
  };

  const tabs = [
    { id: 'documents' as const, label: 'Documents', icon: Icons.Folder },
    { id: 'proposals' as const, label: 'Proposals', icon: Icons.File },
    { id: 'blog' as const, label: 'Blog', icon: Icons.Docs },
    { id: 'passwords' as const, label: 'Passwords', icon: Icons.Lock },
  ];

  if (loading && !loadingTimedOut && !folders.length && !files.length && !documents.length && activeTab === 'documents') {
    return (
      <div className="max-w-7xl mx-auto p-4 sm:p-6 flex justify-center items-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-zinc-200 dark:border-zinc-700 border-t-zinc-900 dark:border-t-zinc-100 mx-auto mb-3"></div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading documents...</p>
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
            {/* Back button + Title */}
            <div className="flex items-center gap-3">
              {activeTab === 'documents' && currentFolderId && (
                <button
                  onClick={handleBack}
                  className="flex items-center justify-center w-9 h-9 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 shadow-sm"
                >
                  <Icons.ChevronLeft size={16} />
                </button>
              )}
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {activeTab === 'documents' && currentFolderId ? currentFolderName : 'Documents'}
              </h1>
            </div>

            {/* Breadcrumbs */}
            {activeTab === 'documents' && breadcrumbs.length > 0 && (
              <div className="flex items-center gap-1.5 text-sm mt-2 ml-0.5">
                <button
                  onClick={() => setCurrentFolderId(null)}
                  className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors font-medium"
                >
                  Home
                </button>
                {breadcrumbs.map((folder, i) => (
                  <React.Fragment key={folder.id}>
                    <Icons.ChevronRight size={14} className="text-zinc-300 dark:text-zinc-600" />
                    <button
                      onClick={() => setCurrentFolderId(folder.id)}
                      className={`transition-colors ${
                        i === breadcrumbs.length - 1
                          ? 'text-zinc-900 dark:text-zinc-100 font-semibold'
                          : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                      }`}
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
                <span className="hidden sm:inline">New Folder</span>
              </button>

              <button
                onClick={async () => {
                  try {
                    const doc = await createDocument();
                    setEditingDocumentId(doc.id);
                  } catch (err: any) {
                    alert(err.message);
                  }
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium border border-zinc-200 dark:border-zinc-700 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors text-zinc-700 dark:text-zinc-300"
              >
                <Icons.Docs size={15} />
                <span className="hidden sm:inline">New Doc</span>
              </button>

              <label className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors cursor-pointer shadow-sm">
                <Icons.Upload size={15} />
                {isUploading ? `Uploading${uploadProgress > 0 ? ` ${uploadProgress}%` : '...'}` : 'Upload'}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileInputChange}
                  disabled={isUploading}
                  multiple
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
                className={`relative flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${activeTab === tab.id
                    ? 'text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                  }`}
              >
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="docsActiveTab"
                    className="absolute inset-0 bg-white dark:bg-zinc-700 rounded-lg shadow-sm"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  <tab.icon size={14} />
                  {tab.label}
                </span>
              </button>
            ))}
          </div>

          {activeTab === 'documents' && (
            <div className="flex items-center gap-3 flex-wrap">
              {/* Assign selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400 dark:text-zinc-500 hidden sm:inline">Assign to</span>
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
                  <option value="none">Unassigned</option>
                  <option value="client">Client</option>
                  <option value="project">Project</option>
                </select>
                {linkType === 'client' && (
                  <select
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    className="px-3 py-1.5 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10"
                  >
                    <option value="">Select client</option>
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
                    <option value="">Select project</option>
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
                  className={`relative p-1.5 rounded-md transition-colors duration-200 ${view === 'grid'
                      ? 'text-zinc-900 dark:text-zinc-100'
                      : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300'
                    }`}
                >
                  {view === 'grid' && (
                    <motion.div
                      layoutId="docsViewToggle"
                      className="absolute inset-0 bg-white dark:bg-zinc-700 rounded-md shadow-sm"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <Icons.Grid size={15} className="relative z-10" />
                </button>
                <button
                  onClick={() => setView('list')}
                  className={`relative p-1.5 rounded-md transition-colors duration-200 ${view === 'list'
                      ? 'text-zinc-900 dark:text-zinc-100'
                      : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300'
                    }`}
                >
                  {view === 'list' && (
                    <motion.div
                      layoutId="docsViewToggle"
                      className="absolute inset-0 bg-white dark:bg-zinc-700 rounded-md shadow-sm"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <Icons.List size={15} className="relative z-10" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New folder inline form */}
      <AnimatePresence>
      {activeTab === 'documents' && showNewFolderInput && (
        <motion.div
          initial={{ opacity: 0, height: 0, marginBottom: 0 }}
          animate={{ opacity: 1, height: 'auto', marginBottom: 20 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="overflow-hidden"
        >
        <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
              <Icons.Folder size={20} className="text-blue-500" />
            </div>
            <input
              type="text"
              placeholder="Folder name..."
              value={newFolderName}
              onChange={(e) => { setNewFolderName(e.target.value); setFolderError(null); }}
              className="flex-1 px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-zinc-400"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && !isCreatingFolder && handleCreateFolder()}
              disabled={isCreatingFolder}
            />
            <button
              onClick={handleCreateFolder}
              disabled={isCreatingFolder}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreatingFolder ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={() => { setShowNewFolderInput(false); setNewFolderName(''); setFolderError(null); }}
              disabled={isCreatingFolder}
              className="px-4 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            >
              Cancel
            </button>
          </div>
          {folderError && (
            <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{folderError}</p>
            </div>
          )}
        </div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Tab content */}
      <AnimatePresence mode="wait">
      {activeTab === 'proposals' ? (
        <motion.div
          key="proposals"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <ProposalsPanel />
        </motion.div>
      ) : activeTab === 'blog' ? (
        <motion.div
          key="blog"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <BlogPanel />
        </motion.div>
      ) : activeTab === 'passwords' ? (
        <motion.div
          key="passwords"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <PasswordsPanel />
        </motion.div>
      ) : (
        /* Documents content area — with drag & drop */
        <motion.div
          key={`docs-${currentFolderId || 'root'}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="relative"
        >
          {/* Drag overlay */}
          <AnimatePresence>
          {isDragging && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 z-20 bg-blue-50/90 dark:bg-blue-950/90 border-2 border-dashed border-blue-400 dark:border-blue-500 rounded-2xl flex items-center justify-center pointer-events-none"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ duration: 0.2, delay: 0.05 }}
                className="text-center"
              >
                <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/40 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <Icons.Upload size={28} className="text-blue-500" />
                </div>
                <p className="text-base font-semibold text-blue-700 dark:text-blue-300">Drop files to upload</p>
                <p className="text-sm text-blue-500 dark:text-blue-400 mt-1">
                  {currentFolderId ? `Into "${currentFolderName}"` : 'Into root folder'}
                </p>
              </motion.div>
            </motion.div>
          )}
          </AnimatePresence>

          {/* Upload progress bar */}
          {isUploading && uploadProgress > 0 && (
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Uploading files...</span>
                <span className="text-xs font-bold text-blue-700 dark:text-blue-300">{uploadProgress}%</span>
              </div>
              <div className="w-full h-1.5 bg-blue-100 dark:bg-blue-900 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}

          {folders.length === 0 && files.length === 0 && documents.length === 0 ? (
            /* Empty state with action buttons */
            <div className="text-center py-20 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
              <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <Icons.Folder size={28} className="text-zinc-400 dark:text-zinc-500" />
              </div>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-1.5">
                {currentFolderId ? 'Empty folder' : 'No documents yet'}
              </h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto mb-6">
                {currentFolderId
                  ? 'Upload files or create a subfolder to organize your content.'
                  : 'Start by uploading a file or creating a folder.'}
              </p>
              <div className="flex items-center gap-3 justify-center">
                <label className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors cursor-pointer shadow-sm">
                  <Icons.Upload size={15} />
                  Upload Files
                  <input
                    type="file"
                    className="hidden"
                    onChange={handleFileInputChange}
                    disabled={isUploading}
                    multiple
                  />
                </label>
                <button
                  onClick={() => setShowNewFolderInput(true)}
                  className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border border-zinc-200 dark:border-zinc-700 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors text-zinc-700 dark:text-zinc-300"
                >
                  <Icons.Folder size={15} />
                  New Folder
                </button>
              </div>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-6">or drag and drop files here</p>
            </div>
          ) : (
            /* Documents grid / list */
            <div className={
              view === 'grid'
                ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3'
                : 'space-y-1.5'
            }>
              {/* Folders */}
              {folders.map((folder, i) => (
                view === 'grid' ? (
                  <motion.div
                    key={folder.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.25, delay: i * 0.04, ease: 'easeOut' }}
                    onClick={() => setCurrentFolderId(folder.id)}
                    className="group cursor-pointer bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl p-4 hover:border-blue-200 dark:hover:border-blue-800 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 hover:shadow-sm transition-[border-color,background-color,box-shadow] duration-200"
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                        <Icons.Folder size={24} className="text-blue-500" />
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); openActionMenu('folder', folder); }}
                        className="text-zinc-300 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-all p-1"
                      >
                        <Icons.MoreVert size={16} />
                      </button>
                    </div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{folder.name}</p>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">{fmtDate(folder.created_at)}</p>
                  </motion.div>
                ) : (
                  <motion.div
                    key={folder.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: i * 0.04, ease: 'easeOut' }}
                    onClick={() => setCurrentFolderId(folder.id)}
                    className="group cursor-pointer flex items-center gap-3 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-lg px-4 py-3 hover:border-blue-200 dark:hover:border-blue-800 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 transition-[border-color,background-color] duration-200"
                    whileTap={{ scale: 0.99 }}
                  >
                    <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                      <Icons.Folder size={18} className="text-blue-500" />
                    </div>
                    <span className="flex-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{folder.name}</span>
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-500 mr-2">{fmtDate(folder.created_at)}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); openActionMenu('folder', folder); }}
                      className="text-zinc-300 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-all p-1"
                    >
                      <Icons.MoreVert size={16} />
                    </button>
                    <Icons.ChevronRight size={14} className="text-zinc-300 dark:text-zinc-600 group-hover:text-blue-400 transition-colors" />
                  </motion.div>
                )
              ))}

              {/* Documents (rich-text) */}
              {documents.map((doc, i) => (
                <DocumentCard
                  key={doc.id}
                  document={doc}
                  view={view}
                  onClick={() => setEditingDocumentId(doc.id)}
                />
              ))}

              {/* Files */}
              {files.map((file, i) => (
                view === 'grid' ? (
                  <motion.div
                    key={file.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.25, delay: (folders.length + i) * 0.04, ease: 'easeOut' }}
                    className="group bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow-sm transition-[border-color,box-shadow] duration-200"
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {/* Image thumbnail or icon */}
                    {isImageType(file.type) && file.url ? (
                      <div className="relative w-full h-28 bg-zinc-100 dark:bg-zinc-800">
                        <img
                          src={file.url}
                          alt={file.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-white/90 dark:bg-zinc-800/90 backdrop-blur-sm text-zinc-600 dark:text-zinc-300 hover:text-blue-500 p-1.5 rounded-lg shadow-sm"
                          >
                            <Icons.External size={12} />
                          </a>
                          <button
                            onClick={() => openActionMenu('file', file)}
                            className="bg-white/90 dark:bg-zinc-800/90 backdrop-blur-sm text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 p-1.5 rounded-lg shadow-sm"
                          >
                            <Icons.MoreVert size={12} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 pb-0">
                        <div className="flex items-start justify-between mb-3">
                          <div className="w-12 h-12 rounded-xl bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center">
                            {getFileIcon(file.type, file.name)}
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
                              onClick={() => openActionMenu('file', file)}
                              className="text-zinc-300 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-300 p-1"
                            >
                              <Icons.MoreVert size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="px-4 py-3">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{file.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-zinc-400 dark:text-zinc-500">{formatSize(file.size)}</span>
                        {file.created_at && (
                          <>
                            <span className="text-zinc-200 dark:text-zinc-700 text-[10px]">|</span>
                            <span className="text-[11px] text-zinc-400 dark:text-zinc-500">{fmtDate(file.created_at)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key={file.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: (folders.length + i) * 0.04, ease: 'easeOut' }}
                    className="group flex items-center gap-3 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-lg px-4 py-3 hover:border-zinc-300 dark:hover:border-zinc-600 transition-[border-color] duration-200"
                    whileTap={{ scale: 0.99 }}
                  >
                    {isImageType(file.type) && file.url ? (
                      <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0">
                        <img src={file.url} alt={file.name} className="w-full h-full object-cover" loading="lazy" />
                      </div>
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
                        {getFileIcon(file.type, file.name)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{file.name}</p>
                    </div>
                    {file.created_at && (
                      <span className="text-[11px] text-zinc-400 dark:text-zinc-500 flex-shrink-0 hidden sm:inline">{fmtDate(file.created_at)}</span>
                    )}
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
                        onClick={() => openActionMenu('file', file)}
                        className="text-zinc-300 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-300 p-1"
                      >
                        <Icons.MoreVert size={13} />
                      </button>
                    </div>
                  </motion.div>
                )
              ))}
            </div>
          )}
        </motion.div>
      )}
      </AnimatePresence>

      {/* Action Modal */}
      <AnimatePresence>
      {actionMenu && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={closeActionMenu}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="w-full max-w-sm max-h-[90vh] bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 pt-5 pb-3">
              <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
                {actionMenu.type === 'folder'
                  ? <Icons.Folder size={18} className="text-blue-500" />
                  : <Icons.File size={18} className="text-zinc-400" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{actionMenu.name}</p>
                <p className="text-[11px] text-zinc-400">{actionMenu.type === 'folder' ? 'Folder' : 'File'}</p>
              </div>
              <button onClick={closeActionMenu} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 p-1">
                <Icons.X size={16} />
              </button>
            </div>

            {actionView === 'menu' && (
              <div className="px-3 pb-3 space-y-0.5">
                <button
                  onClick={() => setActionView('move')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  <Icons.Folder size={16} className="text-blue-500" />
                  Move to...
                </button>
                <button
                  onClick={() => setActionView('assign')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  <Icons.Users size={16} className="text-violet-500" />
                  Assign to...
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete ${actionMenu.type === 'folder' ? 'folder' : 'file'} "${actionMenu.name}"?`)) {
                      if (actionMenu.type === 'file') deleteFile(actionMenu.id, actionMenu.url || '');
                      else deleteFolder(actionMenu.id);
                      closeActionMenu();
                    }
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                >
                  <Icons.Trash size={16} />
                  Delete
                </button>
              </div>
            )}

            {actionView === 'move' && (
              <div className="px-3 pb-3">
                <button onClick={() => setActionView('menu')} className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 mb-2 px-1">
                  <Icons.ChevronLeft size={12} /> Back
                </button>
                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 px-1 mb-2">Move to folder</p>
                <div className="max-h-64 overflow-y-auto space-y-0.5">
                  {/* Root option */}
                  <button
                    onClick={() => handleMove(null)}
                    disabled={actionMenu.currentFolderId === null}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-zinc-700 dark:text-zinc-300"
                  >
                    <Icons.Home size={15} className="text-zinc-400" />
                    Root (Home)
                  </button>
                  {allFolders
                    .filter(f => f.id !== actionMenu.id) // Can't move into itself
                    .map(folder => (
                      <button
                        key={folder.id}
                        onClick={() => handleMove(folder.id)}
                        disabled={
                          (actionMenu.type === 'file' && actionMenu.currentFolderId === folder.id) ||
                          (actionMenu.type === 'folder' && actionMenu.currentFolderId === folder.id)
                        }
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-zinc-700 dark:text-zinc-300"
                      >
                        <Icons.Folder size={15} className="text-blue-500" />
                        <span className="truncate">{folder.name}</span>
                      </button>
                    ))
                  }
                  {allFolders.length === 0 && (
                    <p className="text-xs text-zinc-400 text-center py-4">No folders available</p>
                  )}
                </div>
              </div>
            )}

            {actionView === 'assign' && (
              <div className="px-4 pb-4">
                <button onClick={() => setActionView('menu')} className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 mb-3">
                  <Icons.ChevronLeft size={12} /> Back
                </button>
                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-3">Assign to client or project</p>
                <div className="space-y-3">
                  <select
                    value={assignType}
                    onChange={(e) => {
                      const v = e.target.value as 'none' | 'client' | 'project';
                      setAssignType(v);
                      if (v !== 'client') setAssignClientId('');
                      if (v !== 'project') setAssignProjectId('');
                    }}
                    className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="none">Unassigned</option>
                    <option value="client">Client</option>
                    <option value="project">Project</option>
                  </select>
                  {assignType === 'client' && (
                    <select
                      value={assignClientId}
                      onChange={(e) => setAssignClientId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="">Select client...</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                  {assignType === 'project' && (
                    <select
                      value={assignProjectId}
                      onChange={(e) => setAssignProjectId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="">Select project...</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                    </select>
                  )}
                  <button
                    onClick={handleAssign}
                    className="w-full py-2 text-sm font-medium bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Document Editor Overlay */}
      {editingDocumentId && (
        <DocumentEditor
          documentId={editingDocumentId}
          onClose={() => setEditingDocumentId(null)}
        />
      )}
    </div>
  );
};
