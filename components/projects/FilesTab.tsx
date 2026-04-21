import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../ui/Icons';
import { Project } from '../../context/ProjectsContext';
import { useDocuments } from '../../context/DocumentsContext';
import { logActivity } from '../../lib/activity';
import { DocumentCard } from '../docs/DocumentCard';
import { DocumentEditor } from '../docs/DocumentEditor';

export interface FilesTabProps {
  project: Project;
  onUpdateProject: (id: string, updates: Partial<Project>) => Promise<Project>;
}

export const FilesTab: React.FC<FilesTabProps> = ({
  project,
  onUpdateProject,
}) => {
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const { documents, createDocument, deleteDocument } = useDocuments();
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null);
  const [isCreatingDoc, setIsCreatingDoc] = useState(false);

  const projectDocs = useMemo(
    () => documents.filter(d => d.project_id === project.id),
    [documents, project.id]
  );

  const handleNewDoc = async () => {
    if (isCreatingDoc) return;
    setIsCreatingDoc(true);
    try {
      const doc = await createDocument('Untitled Document', {
        projectId: project.id,
        clientId: project.client_id ?? null,
      });
      setEditingDocumentId(doc.id);
      await logActivity({ action: 'created doc', target: doc.title, project_title: project.title, type: 'project_update' });
    } catch (err: any) {
      alert(err.message || 'Error creating document');
    } finally {
      setIsCreatingDoc(false);
    }
  };

  const handleDeleteDoc = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      await deleteDocument(id);
      await logActivity({ action: 'deleted doc', target: title, project_title: project.title, type: 'project_update' });
    } catch (err: any) {
      alert(err.message || 'Error deleting document');
    }
  };

  const handleAddLink = async () => {
    if (!linkUrl.trim()) return;
    const name = linkName.trim() || linkUrl.trim();
    const newFiles = [...project.files, {
      name,
      type: 'link',
      size: '—',
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      url: linkUrl.trim(),
    }];
    await onUpdateProject(project.id, { files: newFiles });
    await logActivity({ action: 'added link', target: name, project_title: project.title, type: 'project_update' });
    setLinkName('');
    setLinkUrl('');
    setShowLinkModal(false);
  };

  const isLink = (file: { url?: string }) => !!file.url;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Project Files</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleNewDoc}
            disabled={isCreatingDoc}
            className="px-4 py-2 text-xs font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Icons.Docs size={14} />
            {isCreatingDoc ? 'Creating...' : 'New Doc'}
          </button>
          <button
            onClick={() => setShowLinkModal(true)}
            className="px-4 py-2 text-xs font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer flex items-center gap-2"
          >
            <Icons.Link size={14} />
            Add Link
          </button>
          <label className="px-4 py-2 text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors cursor-pointer flex items-center gap-2">
            <Icons.Upload size={14} />
            Upload File
            <input type="file" className="hidden" multiple onChange={async (e: React.ChangeEvent<HTMLInputElement>) => {
              const fileList = e.target.files;
              if (!fileList || !project) return;
              const newFiles = [...project.files];
              for (let i = 0; i < fileList.length; i++) {
                const f = fileList[i];
                const sizeStr = f.size < 1024 ? `${f.size} B`
                  : f.size < 1024 * 1024 ? `${(f.size / 1024).toFixed(1)} KB`
                  : `${(f.size / (1024 * 1024)).toFixed(1)} MB`;
                newFiles.push({
                  name: f.name,
                  type: f.type || f.name.split('.').pop() || 'file',
                  size: sizeStr,
                  date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                });
              }
              await onUpdateProject(project.id, { files: newFiles });
              await logActivity({ action: 'uploaded files', target: `${fileList.length} file(s)`, project_title: project.title, type: 'project_update' });
              e.target.value = '';
            }} />
          </label>
        </div>
      </div>

      {projectDocs.length > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {projectDocs.map(doc => (
              <div key={doc.id} className="group relative">
                <DocumentCard
                  document={doc}
                  view="grid"
                  onClick={() => setEditingDocumentId(doc.id)}
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteDoc(doc.id, doc.title);
                  }}
                  className="absolute top-2 right-2 p-1 rounded-md opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
                  title="Delete document"
                >
                  <Icons.Trash size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {project.files.length === 0 && projectDocs.length === 0 ? (
        <div className="text-center py-16 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700">
          <Icons.File size={36} className="mx-auto text-zinc-300 dark:text-zinc-600 mb-3" />
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">No docs, files or links yet</p>
          <p className="text-xs text-zinc-400">Create a doc, upload files, or add links to keep project assets organized.</p>
        </div>
      ) : project.files.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {project.files.map((file, i) => (
            <motion.div
              key={i}
              whileHover={{ y: -2 }}
              onClick={() => {
                if (isLink(file) && file.url) {
                  window.open(file.url, '_blank', 'noopener,noreferrer');
                }
              }}
              className="group relative p-4 bg-zinc-50/50 dark:bg-zinc-950/50 border border-zinc-100 dark:border-zinc-800 rounded-xl hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow-md transition-all cursor-pointer flex flex-col items-center text-center"
            >
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  const updated = project.files.filter((_, idx) => idx !== i);
                  await onUpdateProject(project.id, { files: updated });
                }}
                className="absolute top-2 right-2 p-1 rounded-md opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
                title="Remove"
              >
                <Icons.Trash size={12} />
              </button>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 group-hover:scale-105 transition-transform ${
                isLink(file)
                  ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-500'
                  : 'bg-white dark:bg-zinc-900 text-zinc-400'
              }`}>
                {isLink(file) ? <Icons.Link size={24} /> : <Icons.File size={24} />}
              </div>
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate w-full mb-1">{file.name}</div>
              <div className="text-[10px] text-zinc-400">
                {isLink(file) ? (
                  <span className="text-blue-400">Link</span>
                ) : (
                  <>{file.size}</>
                )}
                {' · '}{file.date}
              </div>
            </motion.div>
          ))}
        </div>
      ) : null}

      {/* Add Link Modal */}
      <AnimatePresence>
        {showLinkModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => setShowLinkModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-700 p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto"
            >
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Add Link</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">URL *</label>
                  <input
                    type="url"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-zinc-900 dark:text-zinc-100"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddLink(); }}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">Name (optional)</label>
                  <input
                    type="text"
                    value={linkName}
                    onChange={(e) => setLinkName(e.target.value)}
                    placeholder="e.g. Design specs, API docs..."
                    className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-zinc-900 dark:text-zinc-100"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddLink(); }}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button
                  onClick={() => setShowLinkModal(false)}
                  className="px-4 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddLink}
                  disabled={!linkUrl.trim()}
                  className="px-4 py-2 text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Add Link
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {editingDocumentId && (
        <DocumentEditor
          documentId={editingDocumentId}
          onClose={() => setEditingDocumentId(null)}
        />
      )}
    </div>
  );
};
