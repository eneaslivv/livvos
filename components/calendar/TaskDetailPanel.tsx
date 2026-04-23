import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../ui/Icons';
import { SlidePanel } from '../ui/SlidePanel';
import { MultiAssigneeSelect } from '../ui/MultiAssigneeSelect';
import { CalendarTask } from '../../hooks/useCalendar';
import { TaskCommentsSection } from './TaskCommentsSection';
import { useDocuments } from '../../context/DocumentsContext';
import { DocumentEditor } from '../docs/DocumentEditor';

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
  onQuickUpdate?: (taskId: string, updates: Partial<CalendarTask>) => void;
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
            <div className="px-3 py-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg text-xs text-red-600 dark:text-red-400">
              <span className="font-semibold">Save failed:</span> {saveError}
            </div>
          )}
          <div className="flex items-center justify-between">
            <button
              onClick={() => selectedTask && onDelete(selectedTask.id)}
              className="px-3 py-1.5 text-xs text-zinc-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors flex items-center gap-1.5"
            >
              <Icons.Trash size={12} />
              Delete
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onSave}
                disabled={savingTask}
                className="px-5 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 disabled:opacity-40 transition-all flex items-center gap-2"
              >
                {savingTask ? <div className="w-3 h-3 border-2 border-white/30 border-t-white dark:border-zinc-900/30 dark:border-t-zinc-900 rounded-full animate-spin" /> : <Icons.Check size={14} />}
                {savingTask ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      }
    >
      {selectedTask && (
        <div className="px-5 py-4">

          {/* ─── Header: Title + Complete ─── */}
          <div className="mb-3">
            <input
              type="text"
              value={editingTask.title || ''}
              onChange={e => setEditingTask({ ...editingTask, title: e.target.value })}
              className={`w-full text-lg font-semibold bg-transparent outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-600 transition-colors ${
                selectedTask.completed
                  ? 'line-through text-zinc-400 dark:text-zinc-500'
                  : 'text-zinc-900 dark:text-zinc-50'
              }`}
              placeholder="Task title..."
            />

            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={() => onToggleComplete(selectedTask.id, !selectedTask.completed)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  selectedTask.completed
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30'
                    : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 hover:border-emerald-300 hover:text-emerald-600 dark:hover:border-emerald-500/40'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
                  selectedTask.completed ? 'bg-emerald-500 border-emerald-500' : 'border-current'
                }`}>
                  {selectedTask.completed && (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 15 }}>
                      <Icons.Check size={10} className="text-white" />
                    </motion.div>
                  )}
                </div>
                {selectedTask.completed ? 'Completed' : 'Mark complete'}
                {selectedTask.completed && getElapsedDays(selectedTask) !== null && (
                  <span className="text-[10px] font-semibold text-emerald-500 bg-emerald-100 dark:bg-emerald-500/20 px-1.5 py-0.5 rounded-full">
                    {getElapsedDays(selectedTask)}d
                  </span>
                )}
              </button>

              <span className="text-[10px] text-zinc-300 dark:text-zinc-600 font-mono">{selectedTask.id.slice(0, 8)}</span>
            </div>
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

          {/* ─── Priority & Status ─── */}
          <div className="space-y-3 mb-3">
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">Priority</label>
              <div className="flex gap-1.5">
                {([
                  { value: 'low', label: 'Low', dot: 'bg-emerald-500', active: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400' },
                  { value: 'medium', label: 'Medium', dot: 'bg-blue-500', active: 'bg-blue-50 dark:bg-blue-500/10 border-blue-300 dark:border-blue-500/30 text-blue-700 dark:text-blue-400' },
                  { value: 'high', label: 'High', dot: 'bg-amber-500', active: 'bg-amber-50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/30 text-amber-700 dark:text-amber-400' },
                  { value: 'urgent', label: 'Urgent', dot: 'bg-red-500', active: 'bg-red-50 dark:bg-red-500/10 border-red-300 dark:border-red-500/30 text-red-700 dark:text-red-400' },
                ] as const).map(p => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => {
                      const prevPriority = editingTask.priority;
                      setEditingTask({ ...editingTask, priority: p.value });
                      if (selectedTask && onQuickUpdate) {
                        onQuickUpdate(selectedTask.id, { priority: p.value })
                          ?.catch?.(() => setEditingTask(prev => ({ ...prev, priority: prevPriority })));
                      }
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                      editingTask.priority === p.value
                        ? p.active
                        : 'border-transparent text-zinc-400 dark:text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${p.dot}`} />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">Status</label>
              <div className="flex gap-1.5">
                {([
                  { value: 'todo', label: 'To do', dot: 'bg-zinc-400', active: 'bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300' },
                  { value: 'in-progress', label: 'In progress', dot: 'bg-blue-500', active: 'bg-blue-50 dark:bg-blue-500/10 border-blue-300 dark:border-blue-500/30 text-blue-700 dark:text-blue-400' },
                  { value: 'done', label: 'Done', dot: 'bg-emerald-500', active: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400' },
                  { value: 'cancelled', label: 'Cancelled', dot: 'bg-red-400', active: 'bg-red-50 dark:bg-red-500/10 border-red-300 dark:border-red-500/30 text-red-600 dark:text-red-400' },
                ] as const).map(s => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => {
                      const prevStatus = editingTask.status;
                      setEditingTask({ ...editingTask, status: s.value });
                      if (selectedTask && onQuickUpdate) {
                        const completed = s.value === 'done';
                        onQuickUpdate(selectedTask.id, { status: s.value, completed })
                          ?.catch?.(() => setEditingTask(prev => ({ ...prev, status: prevStatus })));
                      }
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                      editingTask.status === s.value
                        ? s.active
                        : 'border-transparent text-zinc-400 dark:text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="h-px bg-zinc-100 dark:bg-zinc-800 mb-3" />

          {/* ─── Details grid ─── */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-3">
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">Date</label>
              <input
                type="date"
                value={editingTask.start_date || ''}
                onChange={e => setEditingTask({ ...editingTask, start_date: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border-0 rounded-lg outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 text-sm text-zinc-900 dark:text-zinc-100 transition-all"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">Time</label>
                <input
                  type="time"
                  value={editingTask.start_time || ''}
                  onChange={e => setEditingTask({ ...editingTask, start_time: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border-0 rounded-lg outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 text-sm text-zinc-900 dark:text-zinc-100 transition-all"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">Duration</label>
                <select
                  value={editingTask.duration || 60}
                  onChange={e => setEditingTask({ ...editingTask, duration: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border-0 rounded-lg outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 text-sm text-zinc-900 dark:text-zinc-100 transition-all"
                >
                  <option value="15">15m</option>
                  <option value="30">30m</option>
                  <option value="45">45m</option>
                  <option value="60">1h</option>
                  <option value="90">1.5h</option>
                  <option value="120">2h</option>
                  <option value="180">3h</option>
                  <option value="240">4h</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">Project</label>
              <select
                value={editingTask.project_id || ''}
                onChange={e => {
                  const pid = e.target.value;
                  const proj = projectOptions.find(p => p.id === pid);
                  setEditingTask({
                    ...editingTask,
                    project_id: pid,
                    client_id: proj?.client_id || editingTask.client_id || '',
                  });
                }}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border-0 rounded-lg outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 text-sm text-zinc-900 dark:text-zinc-100 transition-all"
              >
                <option value="">None</option>
                {projectOptions.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">Client</label>
              <select
                value={editingTask.client_id || ''}
                onChange={e => setEditingTask({ ...editingTask, client_id: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border-0 rounded-lg outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 text-sm text-zinc-900 dark:text-zinc-100 transition-all"
              >
                <option value="">None</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">Assignees</label>
              <MultiAssigneeSelect
                value={editingTask.assignee_ids || (editingTask.assignee_id ? [editingTask.assignee_id] : [])}
                onChange={ids => setEditingTask({ ...editingTask, assignee_ids: ids, assignee_id: ids[0] || undefined })}
                teamMembers={teamMembers}
                currentUserId={userId}
              />
            </div>
          </div>

          <div className="h-px bg-zinc-100 dark:bg-zinc-800 mb-3" />

          {/* ─── Description ─── */}
          <div className="mb-3">
            <label className="block text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">Description</label>
            <textarea
              value={editingTask.description || ''}
              onChange={e => setEditingTask({ ...editingTask, description: e.target.value })}
              placeholder="Add notes, context, or details..."
              className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 border-0 rounded-lg outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-300 dark:placeholder:text-zinc-600 resize-none transition-all"
              rows={3}
            />
          </div>

          {/* ─── Subtasks ─── */}
          <div className="mb-3">
            <button
              type="button"
              onClick={() => toggle('subtasks')}
              className="flex items-center justify-between w-full mb-2 group"
            >
              <div className="flex items-center gap-1.5">
                <Icons.ChevronRight size={12} className={`text-zinc-400 transition-transform ${!collapsed.subtasks ? 'rotate-90' : ''}`} />
                <label className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider cursor-pointer">
                  Subtasks
                </label>
              </div>
              {totalSubtasks > 0 && (
                <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
                  {completedCount}/{totalSubtasks}
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
                className="flex-1 px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border-0 rounded-lg outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 text-sm text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-300 dark:placeholder:text-zinc-600 transition-all"
              />
              {newSubtaskTitle.trim() && (
                <button
                  onClick={onAddSubtask}
                  disabled={addingSubtask}
                  className="px-3 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 disabled:opacity-40 transition-all"
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
          <div className="mb-3">
            <button
              type="button"
              onClick={() => toggle('dependencies')}
              className="flex items-center gap-1.5 mb-2 group"
            >
              <Icons.ChevronRight size={12} className={`text-zinc-400 transition-transform ${!collapsed.dependencies ? 'rotate-90' : ''}`} />
              <label className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider cursor-pointer flex items-center gap-1.5">
                <Icons.Link size={11} />
                Dependency
              </label>
              {editingTask.blocked_by && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
              )}
            </button>
            <AnimatePresence initial={false}>
            {!collapsed.dependencies && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <select
              value={editingTask.blocked_by || ''}
              onChange={e => setEditingTask({ ...editingTask, blocked_by: e.target.value || undefined })}
              className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border-0 rounded-lg outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 text-sm text-zinc-900 dark:text-zinc-100 transition-all mt-1.5"
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

          <div className="h-px bg-zinc-100 dark:bg-zinc-800 mb-3" />

          {/* ─── Documents ─── */}
          <div className="mb-3">
            <button
              type="button"
              onClick={() => toggle('documents')}
              className="flex items-center gap-1.5 mb-2 group w-full"
            >
              <Icons.ChevronRight size={12} className={`text-zinc-400 transition-transform ${!collapsed.documents ? 'rotate-90' : ''}`} />
              <label className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider cursor-pointer flex items-center gap-1.5">
                <Icons.Docs size={11} />
                Documents
              </label>
              {linkedDocs.length > 0 && (
                <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 ml-0.5">
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

          <div className="h-px bg-zinc-100 dark:bg-zinc-800 mb-3" />

          {/* ─── Comments ─── */}
          <div className="mb-3">
            <button
              type="button"
              onClick={() => toggle('comments')}
              className="flex items-center gap-1.5 mb-2 group"
            >
              <Icons.ChevronRight size={12} className={`text-zinc-400 transition-transform ${!collapsed.comments ? 'rotate-90' : ''}`} />
              <label className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider cursor-pointer">
                Comments
              </label>
            </button>
            <AnimatePresence initial={false}>
            {!collapsed.comments && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                <TaskCommentsSection taskId={selectedTask.id} taskTitle={selectedTask.title} taskOwnerId={selectedTask.owner_id} taskAssigneeId={selectedTask.assignee_id} />
              </motion.div>
            )}
            </AnimatePresence>
          </div>

          {/* ─── Meta ─── */}
          <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <span className="text-[10px] text-zinc-300 dark:text-zinc-600">
              Created {new Date(selectedTask.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
        </div>
      )}
      {openDocId && (
        <DocumentEditor documentId={openDocId} onClose={() => setOpenDocId(null)} />
      )}
    </SlidePanel>
  );
};
