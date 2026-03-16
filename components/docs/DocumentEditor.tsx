import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { Icons } from '../ui/Icons';
import { DocumentToolbar } from './DocumentToolbar';
import { useDocuments } from '../../context/DocumentsContext';
import { useClients } from '../../context/ClientsContext';
import { useProjects } from '../../context/ProjectsContext';
import { useCalendar } from '../../context/CalendarContext';
import { useTeam } from '../../context/TeamContext';
import { useAuth } from '../../hooks/useAuth';
import type { Document } from '../../types/documents';

interface DocumentEditorProps {
  documentId: string;
  onClose: () => void;
}

// Extract task item text from Tiptap JSON content
interface DocTaskItem { text: string; checked: boolean }
const extractTaskItems = (content: Record<string, any>): DocTaskItem[] => {
  const items: DocTaskItem[] = [];
  const walk = (node: any) => {
    if (node.type === 'taskItem') {
      const text = (node.content || [])
        .filter((c: any) => c.type === 'paragraph')
        .flatMap((p: any) => (p.content || []).map((t: any) => t.text || ''))
        .join('')
        .trim();
      if (text) items.push({ text, checked: !!node.attrs?.checked });
    }
    if (node.content) node.content.forEach(walk);
  };
  walk(content);
  return items;
};

export const DocumentEditor: React.FC<DocumentEditorProps> = ({ documentId, onClose }) => {
  const { documents, updateDocument, deleteDocument } = useDocuments();
  const { clients } = useClients();
  const { projects } = useProjects();
  const { tasks, createTask, updateTask } = useCalendar();
  const { members } = useTeam();
  const { user } = useAuth();

  const doc = documents.find(d => d.id === documentId);
  const [title, setTitle] = useState(doc?.title || 'Untitled Document');
  const [clientId, setClientId] = useState(doc?.client_id || '');
  const [projectId, setProjectId] = useState(doc?.project_id || '');
  const [shareEnabled, setShareEnabled] = useState(doc?.share_enabled || false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);

  // Tasks linked to this document
  const linkedTasks = useMemo(() => tasks.filter((t: any) => t.document_id === documentId), [tasks, documentId]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Start writing...' }),
      Underline,
    ],
    content: doc?.content && Object.keys(doc.content).length > 0 ? doc.content : undefined,
    editorProps: {
      attributes: {
        class: 'prose prose-zinc dark:prose-invert max-w-none outline-none min-h-[300px] px-8 py-6',
      },
    },
    onUpdate: ({ editor: e }) => {
      if (!initializedRef.current) return;
      debouncedSave(e.getJSON(), e.getText());
    },
  });

  useEffect(() => {
    // Mark as initialized after first render so we don't trigger save on content load
    const timer = setTimeout(() => { initializedRef.current = true; }, 500);
    return () => clearTimeout(timer);
  }, []);

  const debouncedSave = useCallback((content: Record<string, any>, text: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        await updateDocument(documentId, { content, content_text: text });
      } catch (err) {
        if (import.meta.env.DEV) console.error('Auto-save failed:', err);
      } finally {
        setSaving(false);
      }
    }, 1500);
  }, [documentId, updateDocument]);

  // Save title on blur
  const handleTitleBlur = async () => {
    if (title !== doc?.title) {
      setSaving(true);
      try {
        await updateDocument(documentId, { title });
      } finally {
        setSaving(false);
      }
    }
  };

  // Save assignment changes
  const handleAssign = async (field: 'client_id' | 'project_id', value: string) => {
    const val = value || null;
    if (field === 'client_id') setClientId(value);
    else setProjectId(value);
    await updateDocument(documentId, { [field]: val });
  };

  // Toggle sharing
  const handleToggleShare = async () => {
    const next = !shareEnabled;
    setShareEnabled(next);
    await updateDocument(documentId, { share_enabled: next });
  };

  const handleCopyLink = () => {
    if (!doc?.share_token) return;
    const url = `${window.location.origin}/#shared-doc/${doc.share_token}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = async () => {
    if (!confirm('Delete this document?')) return;
    setDeleting(true);
    try {
      await deleteDocument(documentId);
      onClose();
    } catch {
      setDeleting(false);
    }
  };

  // Sync document checklist items as real tasks
  const handleSyncTasks = async () => {
    if (!editor || !user) return;
    setSyncing(true);
    try {
      const docTasks = extractTaskItems(editor.getJSON());

      for (const item of docTasks) {
        // Check if task already exists (match by title + document_id)
        const existing = linkedTasks.find(t => t.title === item.text);
        if (existing) {
          // Update completion status if changed
          if (existing.completed !== item.checked) {
            await updateTask(existing.id, {
              completed: item.checked,
              status: item.checked ? 'done' : 'todo',
            });
          }
        } else {
          // Create new task linked to this document
          await createTask({
            title: item.text,
            completed: item.checked,
            status: item.checked ? 'done' : 'todo',
            priority: 'medium',
            owner_id: user.id,
            assignee_ids: [],
            order_index: 0,
            document_id: documentId,
            client_id: doc?.client_id || undefined,
            project_id: doc?.project_id || undefined,
          } as any);
        }
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('Task sync failed:', err);
    } finally {
      setSyncing(false);
    }
  };

  // Assign a team member to a linked task
  const handleAssignTask = async (taskId: string, memberId: string) => {
    const ids = memberId ? [memberId] : [];
    await updateTask(taskId, { assignee_ids: ids, assignee_id: memberId || undefined });
  };

  // Cleanup save timer
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  if (!doc) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 bg-white dark:bg-zinc-950 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/60 shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            <Icons.ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Icons.Docs size={18} className="text-blue-500 shrink-0" />
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              className="text-base font-semibold bg-transparent outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-300 dark:placeholder:text-zinc-600 flex-1 min-w-0"
              placeholder="Document title..."
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {saving && (
              <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                <div className="w-2 h-2 border border-zinc-300 border-t-zinc-500 rounded-full animate-spin" />
                Saving
              </span>
            )}
            {!saving && initializedRef.current && (
              <span className="text-[10px] text-zinc-300 dark:text-zinc-600">Saved</span>
            )}
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className={`p-1.5 rounded-lg transition-colors ${showSidebar ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}
              title="Settings"
            >
              <Icons.Settings size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <DocumentToolbar editor={editor} />

      {/* Content area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Editor */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto py-8">
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* Sidebar */}
        {showSidebar && (
          <div className="w-72 border-l border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-900/50 overflow-y-auto shrink-0">
            <div className="p-5 space-y-5">
              {/* Status */}
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-2">Status</label>
                <div className="flex gap-1.5">
                  {(['draft', 'published'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => updateDocument(documentId, { status: s })}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        doc.status === s
                          ? s === 'published'
                            ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                            : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300'
                          : 'border-transparent text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Assign to Project */}
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-1.5">Project</label>
                <select
                  value={projectId}
                  onChange={e => handleAssign('project_id', e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400"
                >
                  <option value="">None</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </div>

              {/* Assign to Client */}
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-1.5">Client</label>
                <select
                  value={clientId}
                  onChange={e => handleAssign('client_id', e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400"
                >
                  <option value="">None</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Sharing */}
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-2">Sharing</label>
                <button
                  onClick={handleToggleShare}
                  className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                    shareEnabled
                      ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-400'
                      : 'bg-white dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-zinc-300'
                  }`}
                >
                  {shareEnabled ? <Icons.Globe size={14} /> : <Icons.Lock size={14} />}
                  {shareEnabled ? 'Public link enabled' : 'Private'}
                </button>
                {shareEnabled && doc.share_token && (
                  <button
                    onClick={handleCopyLink}
                    className="mt-2 flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 transition-colors"
                  >
                    {copied ? <Icons.Check size={13} className="text-emerald-500" /> : <Icons.Copy size={13} />}
                    {copied ? 'Copied!' : 'Copy share link'}
                  </button>
                )}
              </div>

              {/* Tasks sync */}
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-2">Tasks</label>
                <button
                  onClick={handleSyncTasks}
                  disabled={syncing}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/50 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 transition-colors"
                >
                  {syncing ? (
                    <>
                      <div className="w-3 h-3 border border-zinc-300 border-t-zinc-500 rounded-full animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <Icons.RefreshCw size={13} />
                      Sync checklist to tasks
                    </>
                  )}
                </button>
                {linkedTasks.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {linkedTasks.map(t => (
                      <div key={t.id} className="flex items-start gap-2 px-2 py-1.5 rounded-lg bg-white dark:bg-zinc-800/30 border border-zinc-100 dark:border-zinc-800">
                        <div className="mt-0.5">
                          {t.completed
                            ? <Icons.Check size={13} className="text-emerald-500" />
                            : <Icons.Circle size={13} className="text-zinc-300" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[11px] leading-tight truncate ${t.completed ? 'line-through text-zinc-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                            {t.title}
                          </p>
                          <select
                            value={t.assignee_ids?.[0] || ''}
                            onChange={e => handleAssignTask(t.id, e.target.value)}
                            className="mt-1 w-full text-[10px] px-1.5 py-0.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded text-zinc-500 dark:text-zinc-400 outline-none"
                          >
                            <option value="">Unassigned</option>
                            {members.filter(m => m.status === 'active').map(m => (
                              <option key={m.id} value={m.id}>{m.name || m.email}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Delete */}
              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-2 text-xs text-zinc-400 hover:text-red-500 transition-colors"
                >
                  <Icons.Trash size={13} />
                  {deleting ? 'Deleting...' : 'Delete document'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
