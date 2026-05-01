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
    filter: docsFilter,
    isFiltering,
    loading,
    error,
    setCurrentFolderId,
    setFilter: setDocsFilter,
    clearFilter: clearDocsFilter,
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
  // In-app drag state — used to dim the source and highlight the hovered drop target
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dropTargetFolderId, setDropTargetFolderId] = useState<string | null>(null);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Action menu state (Move / Assign / Delete)
  const [actionMenu, setActionMenu] = useState<{ type: 'file' | 'folder'; id: string; name: string; url?: string; currentFolderId?: string | null; clientId?: string | null; projectId?: string | null } | null>(null);
  const [actionView, setActionView] = useState<'menu' | 'move' | 'assign'>('menu');
  const [assignType, setAssignType] = useState<'none' | 'client' | 'project'>('none');
  const [assignClientId, setAssignClientId] = useState('');
  const [assignProjectId, setAssignProjectId] = useState('');

  // Multi-select / bulk actions
  type SelKind = 'file' | 'folder' | 'doc';
  type SelectedItem = { kind: SelKind; id: string; name: string; url?: string };
  const [selected, setSelected] = useState<Map<string, SelectedItem>>(new Map());
  const [showBulkMove, setShowBulkMove] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const isSelected = (id: string) => selected.has(id);
  const toggleSelected = (item: SelectedItem) => {
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, item);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Map());
  const selectAllCurrent = () => {
    const next = new Map<string, SelectedItem>();
    folders.forEach(f => next.set(f.id, { kind: 'folder', id: f.id, name: f.name }));
    documents.forEach(d => next.set(d.id, { kind: 'doc', id: d.id, name: d.title }));
    files.forEach(f => next.set(f.id, { kind: 'file', id: f.id, name: f.name, url: f.url }));
    setSelected(next);
  };

  const totalCurrent = folders.length + documents.length + files.length;
  const allSelected = totalCurrent > 0 && selected.size === totalCurrent;

  const handleBulkDelete = async () => {
    const items = Array.from(selected.values());
    if (items.length === 0) return;
    if (!confirm(`Delete ${items.length} item${items.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    setBulkBusy(true);
    try {
      for (const item of items) {
        try {
          if (item.kind === 'file') await deleteFile(item.id, item.url || '');
          else if (item.kind === 'folder') await deleteFolder(item.id);
          else if (item.kind === 'doc') await deleteDocument(item.id);
        } catch (err: any) {
          console.error('Bulk delete error on', item, err);
        }
      }
      clearSelection();
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkMove = async (targetFolderId: string | null) => {
    const items = Array.from(selected.values());
    if (items.length === 0) return;
    setBulkBusy(true);
    try {
      for (const item of items) {
        try {
          if (item.kind === 'file') {
            await updateFile(item.id, { folder_id: targetFolderId });
          } else if (item.kind === 'folder') {
            if (item.id === targetFolderId) continue; // can't move into itself
            await updateFolder(item.id, { parent_id: targetFolderId });
          }
          // Rich-text documents are flat (no folder_id) — skip silently
        } catch (err: any) {
          console.error('Bulk move error on', item, err);
        }
      }
      clearSelection();
      setShowBulkMove(false);
    } finally {
      setBulkBusy(false);
    }
  };

  // Reset selection when navigating folders or switching tabs
  useEffect(() => { clearSelection(); }, [currentFolderId, activeTab]);

  // Sync the "Assign to" picker with the global Documents filter so the same
  // control both filters the visible items and assigns newly created items.
  useEffect(() => {
    if (linkType === 'client' && selectedClientId) {
      setDocsFilter({ clientId: selectedClientId, projectId: null });
    } else if (linkType === 'project' && selectedProjectId) {
      setDocsFilter({ clientId: null, projectId: selectedProjectId });
    } else {
      clearDocsFilter();
    }
  }, [linkType, selectedClientId, selectedProjectId, setDocsFilter, clearDocsFilter]);

  // Clear the filter on unmount so other surfaces aren't left filtered.
  useEffect(() => () => { clearDocsFilter(); }, [clearDocsFilter]);

  // Lookup helpers for the active-filter chip
  const activeFilterLabel = isFiltering
    ? docsFilter.clientId
      ? clients.find(c => c.id === docsFilter.clientId)?.name || 'Client'
      : projects.find(p => p.id === docsFilter.projectId)?.title || 'Project'
    : null;
  const activeFilterKind: 'client' | 'project' | null = isFiltering
    ? (docsFilter.clientId ? 'client' : 'project')
    : null;
  const handleClearFilter = () => {
    setLinkType('none');
    setSelectedClientId('');
    setSelectedProjectId('');
    clearDocsFilter();
  };

  // Drag-and-drop within the app: move single item onto folder
  const moveItem = useCallback(async (kind: SelKind, id: string, targetFolderId: string | null) => {
    try {
      if (kind === 'file') await updateFile(id, { folder_id: targetFolderId });
      else if (kind === 'folder') {
        if (id === targetFolderId) return;
        await updateFolder(id, { parent_id: targetFolderId });
      }
      // documents skip
    } catch (err: any) {
      alert(`Error moving: ${err.message}`);
    }
  }, [updateFile, updateFolder]);

  const onCardDragStart = (e: React.DragEvent, kind: SelKind, id: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-eneas-doc', JSON.stringify({ kind, id }));
    setDraggedItemId(id);
    // Prevent the page-level OS-file overlay from triggering on internal drags
    e.stopPropagation();
  };

  const onCardDragEnd = () => {
    setDraggedItemId(null);
    setDropTargetFolderId(null);
  };

  const onFolderDropTarget = {
    onDragEnter: (e: React.DragEvent, folderId: string) => {
      if (!e.dataTransfer.types.includes('application/x-eneas-doc')) return;
      e.preventDefault();
      e.stopPropagation();
      setDropTargetFolderId(folderId);
    },
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes('application/x-eneas-doc')) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
      }
    },
    onDragLeave: (e: React.DragEvent, folderId: string) => {
      if (!e.dataTransfer.types.includes('application/x-eneas-doc')) return;
      e.stopPropagation();
      setDropTargetFolderId(prev => (prev === folderId ? null : prev));
    },
    onDrop: (e: React.DragEvent, folderId: string) => {
      const raw = e.dataTransfer.getData('application/x-eneas-doc');
      if (!raw) return;
      e.preventDefault();
      e.stopPropagation();
      setDropTargetFolderId(null);
      setDraggedItemId(null);
      try {
        const { kind, id } = JSON.parse(raw) as { kind: SelKind; id: string };
        moveItem(kind, id, folderId);
      } catch {}
    },
  };

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

  // Drag & drop — only react to OS file drags, not in-app card drags
  const isOsFileDrag = (e: React.DragEvent) => e.dataTransfer.types.includes('Files');

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (!isOsFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!isOsFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!isOsFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    if (!isOsFileDrag(e)) return;
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
              <h1 className="text-[20px] font-semibold text-zinc-900 dark:text-zinc-50 leading-tight">
                {activeTab === 'documents' && currentFolderId ? currentFolderName : 'Documents'}
              </h1>
            </div>

            {/* Active filter chip — visible while a client/project filter is on */}
            <AnimatePresence>
            {activeTab === 'documents' && isFiltering && (
              <motion.button
                key="filter-chip"
                onClick={handleClearFilter}
                initial={{ opacity: 0, y: -4, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.9 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className={`mt-2 ml-0.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                  activeFilterKind === 'client'
                    ? 'bg-violet-50 dark:bg-violet-500/10 border-violet-200 dark:border-violet-500/30 text-violet-700 dark:text-violet-300'
                    : 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                }`}
                title="Clear filter"
              >
                {activeFilterKind === 'client' ? <Icons.Users size={12} /> : <Icons.Briefcase size={12} />}
                <span className="truncate max-w-[200px]">{activeFilterLabel}</span>
                <Icons.X size={12} className="opacity-60" />
              </motion.button>
            )}
            </AnimatePresence>

            {/* Breadcrumbs (hidden while filtering — view is flat) */}
            {activeTab === 'documents' && !isFiltering && breadcrumbs.length > 0 && (
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
              {/* Filter / assign selector — picking a client or project filters the
                  visible items and also becomes the default assignment for new uploads. */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400 dark:text-zinc-500 hidden sm:inline">Filter</span>
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
            <motion.div
              layout
              className={
                view === 'grid'
                  ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3'
                  : 'space-y-1.5'
              }
            >
              <AnimatePresence mode="popLayout" initial={false}>
              {/* Folders */}
              {folders.map((folder, i) => {
                const sel = isSelected(folder.id);
                const selItem: SelectedItem = { kind: 'folder', id: folder.id, name: folder.name };
                const isDragSource = draggedItemId === folder.id;
                const isDropHover = dropTargetFolderId === folder.id && draggedItemId !== folder.id;
                return view === 'grid' ? (
                  <motion.div
                    key={folder.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{
                      opacity: isDragSource ? 0.4 : 1,
                      scale: isDropHover ? 1.04 : isDragSource ? 0.96 : 1,
                    }}
                    exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
                    transition={isDropHover ? { type: 'spring', stiffness: 400, damping: 22 } : { duration: 0.25, delay: i * 0.04, ease: 'easeOut' }}
                    onClick={(e) => { if ((e as any).shiftKey) { toggleSelected(selItem); return; } setCurrentFolderId(folder.id); }}
                    draggable
                    onDragStart={(e: any) => onCardDragStart(e, 'folder', folder.id)}
                    onDragEnd={onCardDragEnd}
                    onDragEnter={(e) => onFolderDropTarget.onDragEnter(e, folder.id)}
                    onDragOver={onFolderDropTarget.onDragOver}
                    onDragLeave={(e) => onFolderDropTarget.onDragLeave(e, folder.id)}
                    onDrop={(e) => onFolderDropTarget.onDrop(e, folder.id)}
                    className={`group cursor-pointer bg-white dark:bg-zinc-900 border rounded-xl p-4 transition-[border-color,background-color,box-shadow] duration-200 ${
                      isDropHover
                        ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-300/60 dark:ring-blue-500/40 bg-blue-50 dark:bg-blue-950/40 shadow-lg shadow-blue-500/20'
                        : sel
                        ? 'border-blue-400 dark:border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900 bg-blue-50/40 dark:bg-blue-950/30'
                        : 'border-zinc-100 dark:border-zinc-800 hover:border-blue-200 dark:hover:border-blue-800 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 hover:shadow-sm'
                    }`}
                    whileHover={isDropHover ? undefined : { y: -2 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                        <Icons.Folder size={24} className="text-blue-500" />
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleSelected(selItem); }}
                          aria-label={sel ? 'Deselect' : 'Select'}
                          className={`flex items-center justify-center w-5 h-5 rounded-md border transition-all ${
                            sel
                              ? 'bg-blue-600 border-blue-600 text-white opacity-100'
                              : 'bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600 text-transparent opacity-0 group-hover:opacity-100 hover:border-blue-400'
                          }`}
                        >
                          {sel && <Icons.Tick size={12} strokeWidth={3} />}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); openActionMenu('folder', folder); }}
                          className="text-zinc-300 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-all p-1"
                        >
                          <Icons.MoreVert size={16} />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{folder.name}</p>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">{fmtDate(folder.created_at)}</p>
                  </motion.div>
                ) : (
                  <motion.div
                    key={folder.id}
                    layout
                    initial={{ opacity: 0, x: -8 }}
                    animate={{
                      opacity: isDragSource ? 0.4 : 1,
                      x: 0,
                      scale: isDropHover ? 1.015 : 1,
                    }}
                    exit={{ opacity: 0, x: -8, transition: { duration: 0.15 } }}
                    transition={isDropHover ? { type: 'spring', stiffness: 400, damping: 22 } : { duration: 0.25, delay: i * 0.04, ease: 'easeOut' }}
                    onClick={(e) => { if ((e as any).shiftKey) { toggleSelected(selItem); return; } setCurrentFolderId(folder.id); }}
                    draggable
                    onDragStart={(e: any) => onCardDragStart(e, 'folder', folder.id)}
                    onDragEnd={onCardDragEnd}
                    onDragEnter={(e) => onFolderDropTarget.onDragEnter(e, folder.id)}
                    onDragOver={onFolderDropTarget.onDragOver}
                    onDragLeave={(e) => onFolderDropTarget.onDragLeave(e, folder.id)}
                    onDrop={(e) => onFolderDropTarget.onDrop(e, folder.id)}
                    className={`group cursor-pointer flex items-center gap-3 bg-white dark:bg-zinc-900 border rounded-lg px-4 py-3 transition-[border-color,background-color] duration-200 ${
                      isDropHover
                        ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-300/60 dark:ring-blue-500/40 bg-blue-50 dark:bg-blue-950/40 shadow-md shadow-blue-500/10'
                        : sel
                        ? 'border-blue-400 dark:border-blue-500 bg-blue-50/40 dark:bg-blue-950/30'
                        : 'border-zinc-100 dark:border-zinc-800 hover:border-blue-200 dark:hover:border-blue-800 hover:bg-blue-50/30 dark:hover:bg-blue-950/20'
                    }`}
                    whileTap={{ scale: 0.99 }}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleSelected(selItem); }}
                      aria-label={sel ? 'Deselect' : 'Select'}
                      className={`flex items-center justify-center w-5 h-5 rounded-md border transition-all flex-shrink-0 ${
                        sel
                          ? 'bg-blue-600 border-blue-600 text-white opacity-100'
                          : 'bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600 text-transparent opacity-0 group-hover:opacity-100 hover:border-blue-400'
                      }`}
                    >
                      {sel && <Icons.Check size={12} />}
                    </button>
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
                );
              })}

              {/* Documents (rich-text) */}
              {documents.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  document={doc}
                  view={view}
                  onClick={() => setEditingDocumentId(doc.id)}
                  selected={isSelected(doc.id)}
                  onToggleSelect={() => toggleSelected({ kind: 'doc', id: doc.id, name: doc.title })}
                  onMore={() => {
                    if (confirm(`Delete document "${doc.title}"?`)) deleteDocument(doc.id);
                  }}
                  onDragStart={(e) => onCardDragStart(e, 'doc' as any, doc.id)}
                />
              ))}

              {/* Files */}
              {files.map((file, i) => {
                const fSel = isSelected(file.id);
                const fSelItem: SelectedItem = { kind: 'file', id: file.id, name: file.name, url: file.url };
                const fIsDragSource = draggedItemId === file.id;
                return view === 'grid' ? (
                  <motion.div
                    key={file.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: fIsDragSource ? 0.4 : 1, scale: fIsDragSource ? 0.96 : 1 }}
                    exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
                    transition={{ duration: 0.25, delay: (folders.length + i) * 0.04, ease: 'easeOut' }}
                    draggable
                    onDragStart={(e: any) => onCardDragStart(e, 'file', file.id)}
                    onDragEnd={onCardDragEnd}
                    onClick={(e) => { if ((e as any).shiftKey) toggleSelected(fSelItem); }}
                    className={`group relative bg-white dark:bg-zinc-900 border rounded-xl overflow-hidden hover:shadow-sm transition-[border-color,box-shadow] duration-200 ${
                      fSel
                        ? 'border-blue-400 dark:border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900'
                        : 'border-zinc-100 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600'
                    }`}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {/* Floating select checkbox (top-left, always reachable) */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleSelected(fSelItem); }}
                      aria-label={fSel ? 'Deselect' : 'Select'}
                      className={`absolute top-2 left-2 z-10 flex items-center justify-center w-5 h-5 rounded-md border transition-all ${
                        fSel
                          ? 'bg-blue-600 border-blue-600 text-white opacity-100'
                          : 'bg-white/90 dark:bg-zinc-800/90 backdrop-blur-sm border-zinc-300 dark:border-zinc-600 text-transparent opacity-0 group-hover:opacity-100 hover:border-blue-400'
                      }`}
                    >
                      {fSel && <Icons.Tick size={12} strokeWidth={3} />}
                    </button>

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
                            onClick={(e) => { e.stopPropagation(); openActionMenu('file', file); }}
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
                              onClick={(e) => { e.stopPropagation(); openActionMenu('file', file); }}
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
                    layout
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: fIsDragSource ? 0.4 : 1, x: 0 }}
                    exit={{ opacity: 0, x: -8, transition: { duration: 0.15 } }}
                    transition={{ duration: 0.25, delay: (folders.length + i) * 0.04, ease: 'easeOut' }}
                    draggable
                    onDragStart={(e: any) => onCardDragStart(e, 'file', file.id)}
                    onDragEnd={onCardDragEnd}
                    onClick={(e) => { if ((e as any).shiftKey) toggleSelected(fSelItem); }}
                    className={`group flex items-center gap-3 bg-white dark:bg-zinc-900 border rounded-lg px-4 py-3 transition-[border-color] duration-200 ${
                      fSel
                        ? 'border-blue-400 dark:border-blue-500 bg-blue-50/40 dark:bg-blue-950/30'
                        : 'border-zinc-100 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600'
                    }`}
                    whileTap={{ scale: 0.99 }}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleSelected(fSelItem); }}
                      aria-label={fSel ? 'Deselect' : 'Select'}
                      className={`flex items-center justify-center w-5 h-5 rounded-md border transition-all flex-shrink-0 ${
                        fSel
                          ? 'bg-blue-600 border-blue-600 text-white opacity-100'
                          : 'bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600 text-transparent opacity-0 group-hover:opacity-100 hover:border-blue-400'
                      }`}
                    >
                      {fSel && <Icons.Tick size={12} strokeWidth={3} />}
                    </button>
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
                        onClick={(e) => { e.stopPropagation(); openActionMenu('file', file); }}
                        className="text-zinc-300 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-300 p-1"
                      >
                        <Icons.MoreVert size={13} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
              </AnimatePresence>
            </motion.div>
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

      {/* Floating bulk action bar */}
      <AnimatePresence>
      {selected.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40"
        >
          <div className="flex items-center gap-1 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-2xl shadow-2xl border border-zinc-800 dark:border-zinc-200 px-2 py-2">
            <div className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium">
              <span className="flex items-center justify-center min-w-6 h-6 px-1.5 rounded-md bg-blue-500 text-white text-xs font-semibold">
                {selected.size}
              </span>
              <span className="hidden sm:inline">selected</span>
            </div>
            <div className="w-px h-6 bg-white/10 dark:bg-zinc-900/10 mx-1" />
            {totalCurrent > 0 && (
              <button
                onClick={allSelected ? clearSelection : selectAllCurrent}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 dark:hover:bg-zinc-900/10 transition-colors"
              >
                <Icons.SquareCheck size={14} />
                {allSelected ? 'Unselect all' : 'Select all'}
              </button>
            )}
            <button
              onClick={() => setShowBulkMove(true)}
              disabled={bulkBusy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 dark:hover:bg-zinc-900/10 transition-colors disabled:opacity-50"
            >
              <Icons.Folder size={14} />
              Move
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={bulkBusy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-red-400 dark:text-red-600 hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
              <Icons.Trash size={14} />
              Delete
            </button>
            <div className="w-px h-6 bg-white/10 dark:bg-zinc-900/10 mx-1" />
            <button
              onClick={clearSelection}
              className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-white/10 dark:hover:bg-zinc-900/10 transition-colors"
              aria-label="Clear selection"
            >
              <Icons.X size={14} />
            </button>
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Bulk Move Modal */}
      <AnimatePresence>
      {showBulkMove && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => !bulkBusy && setShowBulkMove(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="w-full max-w-sm max-h-[90vh] bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-5 pt-5 pb-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <Icons.Folder size={18} className="text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Move {selected.size} item{selected.size === 1 ? '' : 's'}</p>
                <p className="text-[11px] text-zinc-400">Pick a destination folder</p>
              </div>
              <button onClick={() => setShowBulkMove(false)} disabled={bulkBusy} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 p-1 disabled:opacity-50">
                <Icons.X size={16} />
              </button>
            </div>
            <div className="px-3 pb-3">
              <div className="max-h-72 overflow-y-auto space-y-0.5">
                <button
                  onClick={() => handleBulkMove(null)}
                  disabled={bulkBusy}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-zinc-700 dark:text-zinc-300 disabled:opacity-50"
                >
                  <Icons.Home size={15} className="text-zinc-400" />
                  Root (Home)
                </button>
                {allFolders
                  .filter(f => !selected.has(f.id))
                  .map(folder => (
                    <button
                      key={folder.id}
                      onClick={() => handleBulkMove(folder.id)}
                      disabled={bulkBusy}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-zinc-700 dark:text-zinc-300 disabled:opacity-50"
                    >
                      <Icons.Folder size={15} className="text-blue-500" />
                      <span className="truncate">{folder.name}</span>
                    </button>
                  ))}
                {allFolders.length === 0 && (
                  <p className="text-xs text-zinc-400 text-center py-4">No folders yet — create one first.</p>
                )}
              </div>
              {bulkBusy && (
                <p className="text-[11px] text-zinc-400 text-center mt-2">Moving items...</p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
};
