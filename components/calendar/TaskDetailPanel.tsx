import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../ui/Icons';
import { SlidePanel } from '../ui/SlidePanel';
import { MultiAssigneeSelect } from '../ui/MultiAssigneeSelect';
import { CalendarTask } from '../../hooks/useCalendar';
import type { TaskAttachment } from '../../context/CalendarContext';
import { TaskCommentsSection } from './TaskCommentsSection';
import { TaskRichEditor } from './TaskRichEditor';
import { useDocuments } from '../../context/DocumentsContext';
import { DocumentEditor } from '../docs/DocumentEditor';
import { useTenant } from '../../context/TenantContext';
import { useConnectedAgencies } from '../../hooks/useConnectedAgencies';
import { supabase } from '../../lib/supabase';
import { errorLogger } from '../../lib/errorLogger';

interface TeamMember {
  id: string;
  name: string | null;
  email?: string;
  status: string;
  avatar_url?: string | null;
}

interface ProjectOption {
  id: string;
  title: string;
  client_id?: string;
}

interface ClientOption {
  id: string;
  name: string;
}

export interface TaskDetailPanelProps {
  selectedTask: CalendarTask | null;
  editingTask: Partial<CalendarTask>;
  setEditingTask: React.Dispatch<React.SetStateAction<Partial<CalendarTask>>>;
  savingTask: boolean;
  saveError?: string | null;
  onSave: () => void;
  onClose: () => void;
  onDelete: (taskId: string) => void;
  onToggleComplete: (taskId: string, completed: boolean) => void;
  onQuickUpdate?: (taskId: string, updates: Partial<CalendarTask>) => Promise<unknown>;
  // Subtasks
  subtasksForSelected: CalendarTask[];
  newSubtaskTitle: string;
  setNewSubtaskTitle: (v: string) => void;
  addingSubtask: boolean;
  onAddSubtask: () => void;
  onToggleSubtask: (subtaskId: string, completed: boolean) => void;
  onDeleteSubtask: (subtaskId: string) => void;
  // Dependencies
  isTaskBlocked: (task: CalendarTask) => boolean;
  getBlockerTask: (task: CalendarTask | null) => CalendarTask | null;
  getDependentTasks: (taskId: string) => CalendarTask[];
  getElapsedDays: (task: CalendarTask) => number | null;
  // Team, project & client
  tasks: CalendarTask[];
  teamMembers: TeamMember[];
  projectOptions: ProjectOption[];
  clients: ClientOption[];
  userId?: string;
  getMemberName: (id?: string) => string | null;
  getMemberAvatar: (id?: string) => string | null;
  getClientLabel: (task: CalendarTask) => string | null;
  onOpenTaskDetail: (task: CalendarTask) => void;
}

// ── Local UI primitives ───────────────────────────────────────────────
const SectionHeader: React.FC<{ icon: React.ReactNode; title: string; trailing?: React.ReactNode }> = ({ icon, title, trailing }) => (
  <div className="flex items-center justify-between mb-2.5">
    <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
      <span className="opacity-70">{icon}</span>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em]">{title}</h3>
    </div>
    {trailing}
  </div>
);

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label className="block text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">
    {children}
  </label>
);

/**
 * SoftSelect — wraps a native <select> but hides the OS chevron and overlays
 * a clean Lucide one. Gives the property rows that consistent Apple-ish
 * "rounded chip" feel instead of the heavy default form chevrons.
 */
const SoftSelect: React.FC<{
  value: string | number;
  onChange: (v: string) => void;
  children: React.ReactNode;
  className?: string;
  /** When true, the chip stays width-by-content instead of stretching. */
  compact?: boolean;
}> = ({ value, onChange, children, className, compact }) => (
  <div className={`relative inline-flex items-center group ${compact ? '' : 'w-full'}`}>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`appearance-none bg-transparent border-0 outline-none cursor-pointer rounded-full px-2.5 py-1 pr-6 text-[13px] text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100/70 dark:hover:bg-zinc-700/40 focus:bg-zinc-100/70 dark:focus:bg-zinc-700/40 transition-colors ${compact ? '' : 'w-full'} ${className || ''}`}
    >
      {children}
    </select>
    <Icons.ChevronDown
      size={12}
      className="absolute right-2 pointer-events-none text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors"
    />
  </div>
);

/**
 * SoftInput — same vibe as SoftSelect for date/time inputs. Hides the
 * default browser indicator and applies the rounded-pill hover background.
 */
const SoftInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className, ...rest }) => (
  <input
    {...rest}
    className={`bg-transparent border-0 outline-none cursor-pointer rounded-full px-2.5 py-1 text-[13px] text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100/70 dark:hover:bg-zinc-700/40 focus:bg-zinc-100/70 dark:focus:bg-zinc-700/40 transition-colors tabular-nums [&::-webkit-calendar-picker-indicator]:opacity-30 [&::-webkit-calendar-picker-indicator]:hover:opacity-70 [&::-webkit-calendar-picker-indicator]:cursor-pointer ${className || ''}`}
  />
);

export const TaskDetailPanel: React.FC<TaskDetailPanelProps> = ({
  selectedTask,
  editingTask,
  setEditingTask,
  savingTask,
  saveError,
  onSave,
  onClose,
  onDelete,
  onToggleComplete,
  subtasksForSelected,
  newSubtaskTitle,
  setNewSubtaskTitle,
  addingSubtask,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  onQuickUpdate,
  isTaskBlocked,
  getBlockerTask,
  getDependentTasks,
  getElapsedDays,
  tasks,
  teamMembers,
  projectOptions,
  clients,
  userId,
  getMemberName,
  getMemberAvatar,
  getClientLabel,
  onOpenTaskDetail,
}) => {
  const completedCount = subtasksForSelected.filter(s => s.completed).length;
  const totalSubtasks = subtasksForSelected.length;
  const progressPct = totalSubtasks > 0 ? Math.round((completedCount / totalSubtasks) * 100) : 0;

  const { currentTenant } = useTenant();
  const { agencies: connectedAgencies, refresh: refreshAgencies } = useConnectedAgencies();
  const mirrorOtherTenantId = (() => {
    if (!selectedTask?.mirror_pair_id) return null;
    if (selectedTask.mirror_origin_tenant_id && selectedTask.mirror_origin_tenant_id !== currentTenant?.id) {
      return selectedTask.mirror_origin_tenant_id;
    }
    return null;
  })();
  const mirrorOtherAgency = mirrorOtherTenantId
    ? connectedAgencies.find(a => a.tenant_id === mirrorOtherTenantId)
    : null;
  const isOriginOfMirror = !!selectedTask?.mirror_pair_id
    && selectedTask?.mirror_origin_tenant_id === currentTenant?.id;
  const sharedWithAgency = isOriginOfMirror
    ? connectedAgencies.find(a => a.tenant_id !== currentTenant?.id) || null
    : null;

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    subtasks: false,
    dependencies: true,
    documents: false,
    comments: true,
  });
  const toggle = (key: string) => setCollapsed(p => ({ ...p, [key]: !p[key] }));

  const { createDocument, getDocumentsByTask, deleteDocument } = useDocuments();
  const [openDocId, setOpenDocId] = useState<string | null>(null);
  const [creatingDoc, setCreatingDoc] = useState(false);
  const linkedDocs = selectedTask ? getDocumentsByTask(selectedTask.id) : [];

  // ─── Attachments (images) — Notion-style ──────────────────────────
  // Lives on tasks.attachments (jsonb array). Uploads go to the public
  // tenant-assets bucket under /task-attachments/{task.id}/{filename}.
  const attachments: TaskAttachment[] = (editingTask.attachments as any) || (selectedTask?.attachments as any) || [];
  const [uploadingImage, setUploadingImage] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dropRef = useRef<HTMLDivElement | null>(null);
  const [dropActive, setDropActive] = useState(false);

  const persistAttachments = useCallback(async (next: TaskAttachment[]) => {
    if (!selectedTask?.id) return;
    setEditingTask(prev => ({ ...prev, attachments: next as any }));
    if (onQuickUpdate) {
      try { await onQuickUpdate(selectedTask.id, { attachments: next as any } as any); } catch (err) { errorLogger.warn('attachments save failed', err); }
    }
  }, [selectedTask?.id, setEditingTask, onQuickUpdate]);

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    if (!selectedTask?.id || !currentTenant?.id) return;
    const list = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (list.length === 0) return;
    setUploadingImage(true);
    try {
      const newOnes: TaskAttachment[] = [];
      for (const file of list) {
        if (file.size > 10 * 1024 * 1024) { errorLogger.warn('skip >10MB attachment', file.name); continue; }
        const ext = file.name.split('.').pop() || 'jpg';
        const id = crypto.randomUUID();
        const path = `task-attachments/${currentTenant.id}/${selectedTask.id}/${id}.${ext}`;
        const { error: upErr } = await supabase.storage.from('tenant-assets').upload(path, file, { upsert: true, contentType: file.type });
        if (upErr) { errorLogger.error('upload', upErr); continue; }
        const { data: urlData } = supabase.storage.from('tenant-assets').getPublicUrl(path);
        newOnes.push({
          id, url: urlData.publicUrl, name: file.name,
          size: file.size, mime: file.type, added_at: new Date().toISOString(),
        });
      }
      if (newOnes.length > 0) await persistAttachments([...attachments, ...newOnes]);
    } finally {
      setUploadingImage(false);
    }
  }, [selectedTask?.id, currentTenant?.id, attachments, persistAttachments]);

  const removeAttachment = async (id: string) => {
    await persistAttachments(attachments.filter(a => a.id !== id));
  };

  // Paste-image handler is now scoped to the rich editor (TaskRichEditor's
  // handlePaste). Window-level paste used to swallow images intended for
  // other UIs, so we let TipTap handle it.

  // Cover image upload — separate from attachments. Lives at
  // task-covers/{tenant}/{task}.jpg in the public bucket.
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const uploadCover = async (file: File) => {
    if (!selectedTask?.id || !currentTenant?.id) return;
    if (!file.type.startsWith('image/')) return;
    setUploadingCover(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `task-covers/${currentTenant.id}/${selectedTask.id}.${ext}`;
      const { error: upErr } = await supabase.storage.from('tenant-assets').upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) { errorLogger.error('cover upload', upErr); return; }
      const { data: urlData } = supabase.storage.from('tenant-assets').getPublicUrl(path);
      const next = `${urlData.publicUrl}?v=${Date.now()}`; // bust the cache after re-upload
      setEditingTask(prev => ({ ...prev, cover_url: next as any }));
      if (onQuickUpdate) await onQuickUpdate(selectedTask.id, { cover_url: next } as any);
    } finally {
      setUploadingCover(false);
    }
  };
  const removeCover = async () => {
    if (!selectedTask?.id) return;
    setEditingTask(prev => ({ ...prev, cover_url: null as any }));
    if (onQuickUpdate) await onQuickUpdate(selectedTask.id, { cover_url: null } as any);
  };

  // Promise-returning image upload for the rich editor — uploads as an
  // attachment AND returns the URL so TipTap can insert <img>. Also persists
  // the description right after the image is inserted, so the URL doesn't
  // get lost if the user closes the panel before clicking Save.
  const uploadEditorImage = async (file: File): Promise<string | null> => {
    if (!selectedTask?.id || !currentTenant?.id) return null;
    const ext = file.name.split('.').pop() || 'jpg';
    const id = crypto.randomUUID();
    const path = `task-attachments/${currentTenant.id}/${selectedTask.id}/${id}.${ext}`;
    const { error: upErr } = await supabase.storage.from('tenant-assets').upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) { errorLogger.error('inline image upload', upErr); return null; }
    const { data: urlData } = supabase.storage.from('tenant-assets').getPublicUrl(path);
    return urlData.publicUrl;
  };

  // ─── Description auto-save ──────────────────────────────────────────
  // The description block now persists on Cmd/Ctrl+Enter, on blur, OR
  // automatically 1.5s after the user stops typing — independent from the
  // footer Save button. This is what gives the "yes it's saved" feeling.
  const [descSaveHint, setDescSaveHint] = useState<string | null>(null);
  const descTimerRef = useRef<number | null>(null);
  const descSavedAtRef = useRef<number | null>(null);
  // Reset hint when switching tasks so it doesn't bleed across panels.
  useEffect(() => { setDescSaveHint(null); descSavedAtRef.current = null; }, [selectedTask?.id]);
  // Tick the "Saved Xs ago" hint so it stays accurate while the panel is open.
  useEffect(() => {
    if (!descSavedAtRef.current) return;
    const interval = window.setInterval(() => {
      if (!descSavedAtRef.current) return;
      const sec = Math.round((Date.now() - descSavedAtRef.current) / 1000);
      setDescSaveHint(sec < 5 ? 'Saved' : sec < 60 ? `Saved ${sec}s ago` : `Saved ${Math.round(sec/60)}m ago`);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [descSaveHint]);

  const commitDescription = useCallback(async ({ html, text }: { html: string; text: string }) => {
    if (!selectedTask?.id || !onQuickUpdate) return;
    // Skip when nothing actually changed — avoids a roundtrip + flash on blur.
    const currentHtml = (editingTask.description_html as any) ?? selectedTask.description_html ?? '';
    if (currentHtml === html) return;
    setDescSaveHint('Saving…');
    try {
      await onQuickUpdate(selectedTask.id, { description_html: html as any, description: text } as any);
      descSavedAtRef.current = Date.now();
      setDescSaveHint('Saved');
    } catch (err) {
      errorLogger.warn('description save failed', err);
      setDescSaveHint('Save failed');
    }
  }, [selectedTask?.id, selectedTask?.description_html, editingTask.description_html, onQuickUpdate]);

  const scheduleDescriptionSave = useCallback((next: { html: string; text: string }) => {
    if (descTimerRef.current) window.clearTimeout(descTimerRef.current);
    descTimerRef.current = window.setTimeout(() => commitDescription(next), 1500);
  }, [commitDescription]);
  useEffect(() => () => { if (descTimerRef.current) window.clearTimeout(descTimerRef.current); }, []);

  // Reorder attachments by drag — uses the same dataTransfer index trick
  // we use elsewhere. Persists the new order via persistAttachments.
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const moveAttachment = (from: number, to: number) => {
    if (from === to) return;
    const next = [...attachments];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    persistAttachments(next);
  };

  const handleCreateDoc = async () => {
    if (!selectedTask || creatingDoc) return;
    setCreatingDoc(true);
    try {
      const doc = await createDocument(selectedTask.title || 'Untitled Document', {
        taskId: selectedTask.id,
        projectId: selectedTask.project_id ?? null,
        clientId: selectedTask.client_id ?? null,
      });
      setOpenDocId(doc.id);
    } catch (err) {
      console.error('Error creating document from task:', err);
    } finally {
      setCreatingDoc(false);
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    try {
      await deleteDocument(docId);
    } catch (err) {
      console.error('Error deleting document:', err);
    }
  };

  return (
    <SlidePanel
      isOpen={!!selectedTask}
      onClose={onClose}
      width="2xl"
      footer={
        <div className="space-y-2">
          {saveError && (
            <div className="flex items-start gap-2 px-3 py-2 bg-red-50 dark:bg-red-500/10 border border-red-200/70 dark:border-red-500/30 rounded-xl text-xs text-red-600 dark:text-red-400">
              <Icons.AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
              <span><span className="font-semibold">Save failed.</span> {saveError}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <button
              onClick={() => selectedTask && onDelete(selectedTask.id)}
              className="px-2.5 py-1.5 text-xs text-zinc-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors flex items-center gap-1.5"
            >
              <Icons.Trash size={12} />
              Delete
            </button>
            <div className="flex items-center gap-1.5">
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onSave}
                disabled={savingTask}
                className="px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-full text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 disabled:opacity-40 transition-all flex items-center gap-2 shadow-sm"
              >
                {savingTask ? <div className="w-3 h-3 border-2 border-white/30 border-t-white dark:border-zinc-900/30 dark:border-t-zinc-900 rounded-full animate-spin" /> : <Icons.Check size={13} />}
                {savingTask ? 'Saving' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      }
    >
      {selectedTask && (
        <div>
          {/* Cover banner removed — images live inline in the description
              now (paste or drop them right into the editor). */}

          <div className="px-6 py-5">

          {/* ─── Header: Complete pill + Title + meta ─── */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => onToggleComplete(selectedTask.id, !selectedTask.completed)}
                className={`group inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  selectedTask.completed
                    ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/25'
                    : 'bg-zinc-100/80 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/80 dark:hover:bg-zinc-700/60'
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                  selectedTask.completed ? 'bg-white/20' : 'bg-white dark:bg-zinc-900 ring-1 ring-zinc-300 dark:ring-zinc-600 group-hover:ring-emerald-500'
                }`}>
                  {selectedTask.completed ? (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 15 }}>
                      <Icons.Check size={11} className="text-white" />
                    </motion.div>
                  ) : (
                    <Icons.Check size={11} className="text-transparent group-hover:text-emerald-500" />
                  )}
                </span>
                {selectedTask.completed ? 'Completed' : 'Mark complete'}
                {selectedTask.completed && getElapsedDays(selectedTask) !== null && (
                  <span className="text-[10px] font-semibold text-white/90 bg-white/20 px-1.5 py-0.5 rounded-full">
                    {getElapsedDays(selectedTask)}d
                  </span>
                )}
              </button>
              <div className="flex-1" />
              <span className="text-[10px] text-zinc-400 dark:text-zinc-600 font-mono tabular-nums select-all">
                {selectedTask.id.slice(0, 8)}
              </span>
            </div>

            <textarea
              value={editingTask.title || ''}
              onChange={e => {
                setEditingTask({ ...editingTask, title: e.target.value });
                // Auto-grow the title textarea — Notion-style multi-line headlines.
                const ta = e.target as HTMLTextAreaElement;
                ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px';
              }}
              ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
              rows={1}
              className={`w-full resize-none text-[34px] leading-[1.15] font-bold bg-transparent outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-600 transition-colors -mx-1 px-1 rounded-md focus:bg-zinc-50/60 dark:focus:bg-zinc-800/30 tracking-tight ${
                selectedTask.completed
                  ? 'line-through text-zinc-400 dark:text-zinc-500'
                  : 'text-zinc-900 dark:text-zinc-50'
              }`}
              placeholder="Untitled"
            />

            <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">
              Created {new Date(selectedTask.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' })}
            </p>

            {selectedTask.mirror_pair_id && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/30">
                <Icons.Link size={12} className="text-violet-600 dark:text-violet-400 flex-shrink-0" />
                <span className="text-[11px] text-violet-700 dark:text-violet-300 flex-1">
                  {mirrorOtherAgency
                    ? <>Mirrored from <strong>{mirrorOtherAgency.tenant_name}</strong> — changes sync both ways</>
                    : isOriginOfMirror && sharedWithAgency
                    ? <>Shared with <strong>{sharedWithAgency.tenant_name}</strong> — changes sync both ways</>
                    : <>Mirrored across connected agencies — changes sync both ways</>
                  }
                </span>
                {isOriginOfMirror && (
                  <button
                    onClick={async () => {
                      if (!selectedTask?.id) return;
                      const { error } = await supabase.rpc('unshare_task', { p_task_id: selectedTask.id });
                      if (error) errorLogger.error('unshare_task failed:', error);
                      else refreshAgencies();
                    }}
                    className="text-[10px] font-medium text-violet-700 dark:text-violet-300 hover:underline"
                  >
                    Stop sharing
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ─── Blocked banner ─── */}
          {isTaskBlocked(selectedTask) && (() => {
            const blocker = getBlockerTask(selectedTask);
            const blockerOwner = blocker?.assignee_id ? getMemberName(blocker.assignee_id) : null;
            const blockerAvatar = blocker?.assignee_id ? getMemberAvatar(blocker.assignee_id) : null;
            return (
              <div className="mb-5 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-500/5 border border-amber-200/80 dark:border-amber-500/20">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                    <Icons.Lock size={14} className="text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Blocked</span>
                    {blocker && (
                      <p className="text-[11px] text-amber-600/80 dark:text-amber-400/70 truncate">
                        Waiting on <span className="font-medium">{blocker.title}</span>
                      </p>
                    )}
                  </div>
                  {blockerOwner && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {blockerAvatar ? (
                        <img src={blockerAvatar} alt="" className="w-5 h-5 rounded-full" />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-amber-200 dark:bg-amber-500/20 flex items-center justify-center text-[9px] font-bold text-amber-700 dark:text-amber-300">
                          {(blockerOwner || '?')[0]?.toUpperCase()}
                        </div>
                      )}
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">{blockerOwner}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ─── Compact properties (Notion-style) ─── */}
          {/* Single grid where each row = [icon + label] [control]. Tightens
              what used to be 3 sections (Track / Schedule / Context) plus
              their headers into ~6 rows of metadata. Inputs are minimal
              (no chrome until hover) so the eye lands on the description
              and the body of the task instead of these meta fields. */}
          <div className="mb-6 -mx-2 rounded-2xl bg-zinc-50/40 dark:bg-zinc-800/20 p-1.5">
            {(() => {
              // Apple-ish properties grid: each row is a perfectly aligned
              // [icon + label] [control] pair. Controls use SoftSelect/SoftInput
              // so the native form chevrons disappear and we render our own.
              const rowCls = 'grid grid-cols-[120px_1fr] items-center gap-2 px-2.5 py-1 rounded-xl hover:bg-white dark:hover:bg-zinc-800/60 transition-colors';
              const labelCls = 'flex items-center gap-1.5 text-[12px] font-medium text-zinc-500 dark:text-zinc-400';
              const statusOpts = [
                { value: 'todo', label: 'To do', color: 'bg-zinc-400' },
                { value: 'in-progress', label: 'In progress', color: 'bg-blue-500' },
                { value: 'done', label: 'Done', color: 'bg-emerald-500' },
                { value: 'cancelled', label: 'Cancelled', color: 'bg-red-400' },
              ] as const;
              const priorityOpts = [
                { value: 'low', label: 'Low', color: 'bg-emerald-500' },
                { value: 'medium', label: 'Medium', color: 'bg-blue-500' },
                { value: 'high', label: 'High', color: 'bg-amber-500' },
                { value: 'urgent', label: 'Urgent', color: 'bg-red-500' },
              ] as const;
              const currentStatus = statusOpts.find(s => s.value === (editingTask.status || 'todo'));
              const currentPriority = priorityOpts.find(p => p.value === (editingTask.priority || 'medium'));
              return <>
                {/* Status */}
                <div className={rowCls}>
                  <span className={labelCls}><Icons.Circle size={12} /> Status</span>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`w-2 h-2 rounded-full ${currentStatus?.color} shadow-sm shrink-0`} />
                    <SoftSelect
                      value={editingTask.status || 'todo'}
                      onChange={(v) => {
                        const prev = editingTask.status;
                        setEditingTask({ ...editingTask, status: v as any });
                        if (selectedTask && onQuickUpdate) onQuickUpdate(selectedTask.id, { status: v as any, completed: v === 'done' })
                          ?.catch?.(() => setEditingTask(p => ({ ...p, status: prev })));
                      }}
                    >
                      {statusOpts.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </SoftSelect>
                  </div>
                </div>

                {/* Priority */}
                <div className={rowCls}>
                  <span className={labelCls}><Icons.Flag size={12} /> Priority</span>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`w-2 h-2 rounded-full ${currentPriority?.color} shadow-sm shrink-0`} />
                    <SoftSelect
                      value={editingTask.priority || 'medium'}
                      onChange={(v) => {
                        const prev = editingTask.priority;
                        setEditingTask({ ...editingTask, priority: v as any });
                        if (selectedTask && onQuickUpdate) onQuickUpdate(selectedTask.id, { priority: v as any })
                          ?.catch?.(() => setEditingTask(p => ({ ...p, priority: prev })));
                      }}
                    >
                      {priorityOpts.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </SoftSelect>
                  </div>
                </div>

                {/* Date + Time + Duration on one row */}
                <div className={rowCls}>
                  <span className={labelCls}><Icons.Calendar size={12} /> Date</span>
                  <div className="flex items-center gap-1 flex-wrap">
                    <SoftInput type="date" value={editingTask.start_date || ''}
                      onChange={e => setEditingTask({ ...editingTask, start_date: e.target.value })} />
                    <SoftInput type="time" value={editingTask.start_time || ''}
                      onChange={e => setEditingTask({ ...editingTask, start_time: e.target.value })} />
                    <SoftSelect
                      compact
                      value={editingTask.duration || 60}
                      onChange={(v) => setEditingTask({ ...editingTask, duration: parseInt(v) })}
                    >
                      <option value="15">15m</option>
                      <option value="30">30m</option>
                      <option value="45">45m</option>
                      <option value="60">1h</option>
                      <option value="90">1.5h</option>
                      <option value="120">2h</option>
                      <option value="180">3h</option>
                      <option value="240">4h</option>
                    </SoftSelect>
                  </div>
                </div>

                {/* Project */}
                <div className={rowCls}>
                  <span className={labelCls}><Icons.Briefcase size={12} /> Project</span>
                  <SoftSelect
                    value={editingTask.project_id || ''}
                    onChange={(pid) => {
                      const proj = projectOptions.find(p => p.id === pid);
                      setEditingTask({ ...editingTask, project_id: pid, client_id: proj?.client_id || editingTask.client_id || '' });
                    }}
                  >
                    <option value="">— No project</option>
                    {projectOptions.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </SoftSelect>
                </div>

                {/* Client */}
                <div className={rowCls}>
                  <span className={labelCls}><Icons.Users size={12} /> Client</span>
                  <SoftSelect
                    value={editingTask.client_id || ''}
                    onChange={(v) => setEditingTask({ ...editingTask, client_id: v })}
                  >
                    <option value="">— No client</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </SoftSelect>
                </div>

                {/* Assignees */}
                <div className={rowCls}>
                  <span className={labelCls}><Icons.User size={12} /> Assigned</span>
                  <MultiAssigneeSelect
                    value={editingTask.assignee_ids || (editingTask.assignee_id ? [editingTask.assignee_id] : [])}
                    onChange={ids => setEditingTask({ ...editingTask, assignee_ids: ids, assignee_id: ids[0] || undefined })}
                    teamMembers={teamMembers}
                    currentUserId={userId}
                  />
                </div>
              </>;
            })()}
          </div>

          {/* ─── Description (Notion-style rich editor) ─── */}
          <div className="mb-6" key={`desc-${selectedTask.id}`}>
            <TaskRichEditor
              html={(editingTask.description_html as any) ?? selectedTask.description_html ?? editingTask.description ?? selectedTask.description ?? ''}
              onChange={({ html, text }) => {
                setEditingTask(prev => ({ ...prev, description_html: html as any, description: text }));
                // Debounced auto-save while typing — gives the user the
                // "Saved" feeling without needing to press anything.
                scheduleDescriptionSave({ html, text });
              }}
              placeholder="Empezá a escribir, o pegá una imagen…  (⌘+Enter para guardar)"
              onUploadImage={uploadEditorImage}
              onCommit={commitDescription}
              saveHint={descSaveHint}
            />
          </div>

          {/* Standalone Images section removed — images now go inline in the
              description editor (paste, drop, or insert via toolbar). */}

          {/* ─── Subtasks ─── */}
          <div className="mb-2">
            <button
              type="button"
              onClick={() => toggle('subtasks')}
              className="flex items-center justify-between w-full py-2 px-2 -mx-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/40 group transition-colors"
            >
              <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                <Icons.ChevronDown size={12} className={`transition-transform duration-200 ${collapsed.subtasks ? '-rotate-90 opacity-50' : 'opacity-80'}`} />
                <Icons.SquareCheck size={12} className="opacity-70" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] cursor-pointer">Subtasks</span>
              </div>
              {totalSubtasks > 0 && (
                <span className="text-[11px] font-medium tabular-nums text-zinc-400 dark:text-zinc-500">
                  {completedCount}<span className="opacity-50"> / </span>{totalSubtasks}
                </span>
              )}
            </button>

            <AnimatePresence initial={false}>
            {!collapsed.subtasks && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">

            {totalSubtasks > 0 && (
              <div className="mb-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-1 overflow-hidden">
                <motion.div
                  className="bg-emerald-500 h-full rounded-full"
                  initial={false}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
              </div>
            )}

            {totalSubtasks > 0 && (
              <div className="mb-2 rounded-xl overflow-hidden">
                <AnimatePresence initial={false}>
                  {subtasksForSelected
                    .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
                    .map((sub) => {
                      const subBlocked = isTaskBlocked(sub);
                      return (
                        <motion.div
                          key={sub.id}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className={`flex items-center gap-2.5 px-3 py-2 group transition-colors ${
                            subBlocked ? 'bg-amber-50/50 dark:bg-amber-500/5' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                          }`}
                        >
                          {subBlocked ? (
                            <div className="w-4 h-4 rounded-full border-2 border-amber-300 dark:border-amber-500/40 flex items-center justify-center flex-shrink-0" title="Blocked">
                              <Icons.Lock size={8} className="text-amber-500" />
                            </div>
                          ) : (
                            <button
                              onClick={() => onToggleSubtask(sub.id, !sub.completed)}
                              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                sub.completed
                                  ? 'bg-emerald-500 border-emerald-500'
                                  : 'border-zinc-300 dark:border-zinc-600 hover:border-emerald-400'
                              }`}
                            >
                              {sub.completed && <Icons.Check size={9} className="text-white" />}
                            </button>
                          )}
                          <span className={`flex-1 text-sm truncate ${
                            subBlocked ? 'text-amber-600 dark:text-amber-400/70' :
                            sub.completed ? 'text-zinc-400 dark:text-zinc-500 line-through' : 'text-zinc-700 dark:text-zinc-300'
                          }`}>
                            {sub.title}
                          </span>
                          {subBlocked && (
                            <span className="text-[9px] text-amber-500 font-medium flex-shrink-0">blocked</span>
                          )}
                          <button
                            onClick={() => onDeleteSubtask(sub.id)}
                            className="opacity-0 group-hover:opacity-100 text-zinc-300 dark:text-zinc-600 hover:text-red-500 transition-all p-0.5"
                          >
                            <Icons.X size={12} />
                          </button>
                        </motion.div>
                      );
                    })}
                </AnimatePresence>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Add subtask..."
                value={newSubtaskTitle}
                onChange={e => setNewSubtaskTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') onAddSubtask(); }}
                className="flex-1 px-4 py-2 bg-zinc-50 dark:bg-zinc-800/50 border-0 rounded-full outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 text-sm text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-300 dark:placeholder:text-zinc-600 transition-all"
              />
              {newSubtaskTitle.trim() && (
                <button
                  onClick={onAddSubtask}
                  disabled={addingSubtask}
                  className="px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-full text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 disabled:opacity-40 transition-all"
                >
                  {addingSubtask ? '...' : 'Add'}
                </button>
              )}
            </div>

              </motion.div>
            )}
            </AnimatePresence>
          </div>

          {/* ─── Dependency ─── */}
          <div className="mb-2">
            <button
              type="button"
              onClick={() => toggle('dependencies')}
              className="flex items-center justify-between w-full py-2 px-2 -mx-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/40 group transition-colors"
            >
              <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                <Icons.ChevronDown size={12} className={`transition-transform duration-200 ${collapsed.dependencies ? '-rotate-90 opacity-50' : 'opacity-80'}`} />
                <Icons.Link size={12} className="opacity-70" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] cursor-pointer">Dependency</span>
              </div>
              {editingTask.blocked_by && (
                <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Blocked
                </span>
              )}
            </button>
            <AnimatePresence initial={false}>
            {!collapsed.dependencies && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <select
              value={editingTask.blocked_by || ''}
              onChange={e => setEditingTask({ ...editingTask, blocked_by: e.target.value || undefined })}
              className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800/50 border-0 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 text-sm text-zinc-900 dark:text-zinc-100 transition-all mt-1.5 appearance-none bg-no-repeat bg-[right_0.75rem_center] bg-[length:14px] bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2371717a%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] pr-10"
            >
              <option value="">No dependency</option>
              {(() => {
                const eligible = tasks.filter(t => t.id !== selectedTask.id && !t.parent_task_id);
                const groups = new Map<string, CalendarTask[]>();
                eligible.forEach(t => {
                  const key = t.assignee_id || '__unassigned__';
                  if (!groups.has(key)) groups.set(key, []);
                  groups.get(key)!.push(t);
                });
                const sortedKeys = [...groups.keys()].sort((a, b) => {
                  if (a === '__unassigned__') return 1;
                  if (b === '__unassigned__') return -1;
                  if (a === userId) return -1;
                  if (b === userId) return 1;
                  return (getMemberName(a) || '').localeCompare(getMemberName(b) || '');
                });
                return sortedKeys.map(key => {
                  const label = key === '__unassigned__' ? 'Unassigned' : (getMemberName(key) || 'Member');
                  const groupTasks = groups.get(key)!.sort((a, b) => a.title.localeCompare(b.title));
                  return (
                    <optgroup key={key} label={label}>
                      {groupTasks.map(t => {
                        const client = getClientLabel(t);
                        return (
                          <option key={t.id} value={t.id}>
                            {t.completed ? '\u2713 ' : '\u25CB '}{t.title}{client ? ` [${client}]` : ''}
                          </option>
                        );
                      })}
                    </optgroup>
                  );
                });
              })()}
            </select>

            {/* Active dependency detail */}
            {editingTask.blocked_by && (() => {
              const blocker = tasks.find(t => t.id === editingTask.blocked_by);
              if (!blocker) return null;
              const blockerOwner = blocker.assignee_id ? getMemberName(blocker.assignee_id) : null;
              const blockerAvatar = blocker.assignee_id ? getMemberAvatar(blocker.assignee_id) : null;
              const isResolved = blocker.completed;
              return (
                <div className={`mt-2 p-3 rounded-xl ${
                  isResolved
                    ? 'bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-200/60 dark:border-emerald-500/20'
                    : 'bg-amber-50 dark:bg-amber-500/5 border border-amber-200/60 dark:border-amber-500/20'
                }`}>
                  <div className="flex items-center gap-2.5">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isResolved ? 'bg-emerald-100 dark:bg-emerald-500/15' : 'bg-amber-100 dark:bg-amber-500/15'
                    }`}>
                      {isResolved
                        ? <Icons.Check size={12} className="text-emerald-600 dark:text-emerald-400" />
                        : <Icons.Lock size={11} className="text-amber-600 dark:text-amber-400" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium ${
                        isResolved ? 'text-emerald-700 dark:text-emerald-400 line-through' : 'text-amber-700 dark:text-amber-400'
                      }`}>
                        {blocker.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {blockerOwner ? (
                          <div className="flex items-center gap-1">
                            {blockerAvatar ? (
                              <img src={blockerAvatar} alt="" className="w-3.5 h-3.5 rounded-full" />
                            ) : (
                              <div className="w-3.5 h-3.5 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-[7px] font-bold text-zinc-600 dark:text-zinc-400">
                                {(blockerOwner || '?')[0]?.toUpperCase()}
                              </div>
                            )}
                            <span className="text-[10px] text-zinc-500 dark:text-zinc-400">{blockerOwner}</span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-zinc-400 italic">Unassigned</span>
                        )}
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                          isResolved
                            ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                            : blocker.status === 'in-progress'
                              ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400'
                              : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400'
                        }`}>
                          {isResolved ? 'Done' : blocker.status === 'in-progress' ? 'In progress' : 'Pending'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Dependent tasks */}
            {(() => {
              const dependents = getDependentTasks(selectedTask.id);
              if (dependents.length === 0) return null;
              return (
                <div className="mt-2 p-3 bg-zinc-50 dark:bg-zinc-800/30 rounded-xl">
                  <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                    Blocks {dependents.length} task{dependents.length > 1 ? 's' : ''}
                  </span>
                  <div className="mt-2 space-y-1">
                    {dependents.map(d => {
                      const depOwner = d.assignee_id ? getMemberName(d.assignee_id) : null;
                      const depAvatar = d.assignee_id ? getMemberAvatar(d.assignee_id) : null;
                      return (
                        <div key={d.id}
                          className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700/40 transition-colors cursor-pointer"
                          onClick={() => onOpenTaskDetail(d)}>
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${d.completed ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                          <span className={`text-xs flex-1 truncate ${d.completed ? 'text-zinc-400 line-through' : 'text-zinc-700 dark:text-zinc-300'}`}>
                            {d.title}
                          </span>
                          {depOwner && (
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {depAvatar ? (
                                <img src={depAvatar} alt="" className="w-3.5 h-3.5 rounded-full" />
                              ) : (
                                <div className="w-3.5 h-3.5 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-[7px] font-bold text-zinc-600 dark:text-zinc-400">
                                  {(depOwner || '?')[0]?.toUpperCase()}
                                </div>
                              )}
                              <span className="text-[10px] text-zinc-400">{depOwner}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
              </motion.div>
            )}
            </AnimatePresence>
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-zinc-200 dark:via-zinc-800 to-transparent my-3" />

          {/* ─── Documents ─── */}
          <div className="mb-2">
            <button
              type="button"
              onClick={() => toggle('documents')}
              className="flex items-center justify-between w-full py-2 px-2 -mx-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/40 group transition-colors"
            >
              <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                <Icons.ChevronDown size={12} className={`transition-transform duration-200 ${collapsed.documents ? '-rotate-90 opacity-50' : 'opacity-80'}`} />
                <Icons.Docs size={12} className="opacity-70" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] cursor-pointer">Documents</span>
              </div>
              {linkedDocs.length > 0 && (
                <span className="text-[11px] font-medium tabular-nums text-zinc-400 dark:text-zinc-500">
                  {linkedDocs.length}
                </span>
              )}
            </button>
            <AnimatePresence initial={false}>
            {!collapsed.documents && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                <div className="space-y-1.5 pt-1">
                  {linkedDocs.map(doc => (
                    <div
                      key={doc.id}
                      className="group/doc flex items-center gap-2.5 px-3 py-2 bg-zinc-50 dark:bg-zinc-800/40 hover:bg-zinc-100 dark:hover:bg-zinc-800/70 rounded-lg cursor-pointer transition-colors"
                      onClick={() => setOpenDocId(doc.id)}
                    >
                      <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
                        <Icons.Docs size={13} className="text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-zinc-800 dark:text-zinc-100 truncate">
                          {doc.title || 'Untitled Document'}
                        </p>
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                          Updated {new Date(doc.updated_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                          {doc.share_enabled && <span className="ml-1.5 text-emerald-500">· shared</span>}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDeleteDoc(doc.id); }}
                        className="opacity-0 group-hover/doc:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-500/15 transition-all"
                        title="Delete document"
                      >
                        <Icons.Trash size={11} className="text-red-500" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={handleCreateDoc}
                    disabled={creatingDoc}
                    className="w-full flex items-center gap-2 px-3 py-2 border border-dashed border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 rounded-lg text-xs text-zinc-500 dark:text-zinc-400 transition-all disabled:opacity-50"
                  >
                    <Icons.Plus size={12} />
                    {creatingDoc ? 'Creating...' : 'New document'}
                  </button>
                </div>
              </motion.div>
            )}
            </AnimatePresence>
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-zinc-200 dark:via-zinc-800 to-transparent my-3" />

          {/* ─── Comments ─── */}
          <div className="mb-2">
            <button
              type="button"
              onClick={() => toggle('comments')}
              className="flex items-center justify-between w-full py-2 px-2 -mx-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/40 group transition-colors"
            >
              <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                <Icons.ChevronDown size={12} className={`transition-transform duration-200 ${collapsed.comments ? '-rotate-90 opacity-50' : 'opacity-80'}`} />
                <Icons.Message size={12} className="opacity-70" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] cursor-pointer">Comments</span>
              </div>
            </button>
            <AnimatePresence initial={false}>
            {!collapsed.comments && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                <TaskCommentsSection taskId={selectedTask.id} taskTitle={selectedTask.title} taskOwnerId={selectedTask.owner_id} taskAssigneeId={selectedTask.assignee_id} />
              </motion.div>
            )}
            </AnimatePresence>
          </div>

          </div>
        </div>
      )}
      {openDocId && (
        <DocumentEditor documentId={openDocId} onClose={() => setOpenDocId(null)} />
      )}
      {/* Image lightbox — covers the whole viewport so big images get
          breathing room. Click anywhere or hit Esc to close. */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setLightboxUrl(null); }}
          tabIndex={-1}
          className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-8 cursor-zoom-out animate-in fade-in"
        >
          <img src={lightboxUrl} alt="" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
          <button onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white">
            <Icons.Close size={16} />
          </button>
        </div>
      )}
    </SlidePanel>
  );
};
