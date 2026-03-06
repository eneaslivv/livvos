import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../ui/Icons';
import { SlidePanel } from '../ui/SlidePanel';
import { CalendarTask } from '../../hooks/useCalendar';

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
  onSave: () => void;
  onClose: () => void;
  onDelete: (taskId: string) => void;
  onToggleComplete: (taskId: string, completed: boolean) => void;
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
  return (
    <SlidePanel
      isOpen={!!selectedTask}
      onClose={onClose}
      title="Task Details"
      width="sm"
      footer={
        <div className="flex items-center justify-between">
          <button
            onClick={() => selectedTask && onDelete(selectedTask.id)}
            className="px-3 py-1.5 text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Icons.Trash size={12} />
            Delete
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={savingTask}
              className="px-4 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 transition-all flex items-center gap-1.5"
            >
              {savingTask ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Icons.Check size={13} />}
              {savingTask ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      }
    >
      {selectedTask && (
        <div className="p-5 space-y-3">
          {/* Title */}
          <input
            type="text"
            value={editingTask.title || ''}
            onChange={e => setEditingTask({ ...editingTask, title: e.target.value })}
            className={`w-full px-3 py-2 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10 text-sm font-medium transition-all ${
              selectedTask.completed
                ? 'line-through text-zinc-400 dark:text-zinc-500'
                : 'text-zinc-900 dark:text-zinc-100'
            }`}
          />

          {/* Blocked banner */}
          {isTaskBlocked(selectedTask) && (() => {
            const blocker = getBlockerTask(selectedTask);
            const blockerOwner = blocker?.assignee_id ? getMemberName(blocker.assignee_id) : null;
            const blockerAvatar = blocker?.assignee_id ? getMemberAvatar(blocker.assignee_id) : null;
            return (
              <div className="px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-amber-400 flex items-center justify-center flex-shrink-0">
                    <Icons.Lock size={14} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Blocked</span>
                    {blocker && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400/80 truncate mt-0.5">
                        Waiting for: <span className="font-semibold">{blocker.title}</span>
                      </p>
                    )}
                  </div>
                </div>
                {blocker && (
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-amber-200 dark:border-amber-500/20">
                    {blockerOwner ? (
                      <>
                        {blockerAvatar ? (
                          <img src={blockerAvatar} alt="" className="w-5 h-5 rounded-full" />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-amber-200 dark:bg-amber-500/20 flex items-center justify-center text-[9px] font-bold text-amber-700 dark:text-amber-300">
                            {(blockerOwner || '?')[0]?.toUpperCase()}
                          </div>
                        )}
                        <span className="text-[10px] text-amber-700 dark:text-amber-400">
                          <span className="font-semibold">{blockerOwner}</span> needs to complete this task first
                        </span>
                      </>
                    ) : (
                      <span className="text-[10px] text-amber-600/80 dark:text-amber-400/60 italic">
                        The blocking task has no assignee — assign it to unblock the flow
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Completed toggle */}
          <button
            onClick={() => onToggleComplete(selectedTask.id, !selectedTask.completed)}
            className={`flex items-center gap-2.5 w-full px-3.5 py-2.5 rounded-xl border transition-all duration-300 ${
              selectedTask.completed
                ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30'
                : 'bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-700 hover:border-emerald-300 hover:bg-emerald-50/50 dark:hover:bg-emerald-500/5'
            }`}
          >
            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-300 ${
              selectedTask.completed ? 'bg-emerald-500 border-emerald-500 scale-110' : 'border-zinc-300 dark:border-zinc-600'
            }`}>
              {selectedTask.completed && (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 15 }}>
                  <Icons.Check size={12} className="text-white" />
                </motion.div>
              )}
            </div>
            <span className={`text-xs font-medium transition-all duration-300 ${selectedTask.completed ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-600 dark:text-zinc-400'}`}>
              {selectedTask.completed ? (
                <span className="flex items-center gap-1.5">
                  <span className="line-through">Completed</span>
                  <Icons.CheckCircle size={12} className="text-emerald-500" />
                  {getElapsedDays(selectedTask) !== null && (
                    <span className="no-underline text-[10px] font-semibold text-emerald-500 bg-emerald-100 dark:bg-emerald-500/20 px-1.5 py-0.5 rounded-full">
                      {getElapsedDays(selectedTask)}d
                    </span>
                  )}
                </span>
              ) : 'Mark as completed'}
            </span>
          </button>

          {/* Priority pills */}
          <div>
            <label className="block text-[10px] font-medium text-zinc-400 mb-1.5">Priority</label>
            <div className="flex gap-1.5">
              {([
                { value: 'low', label: 'Low', color: 'bg-emerald-500', activeBg: 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400' },
                { value: 'medium', label: 'Medium', color: 'bg-blue-500', activeBg: 'bg-blue-50 dark:bg-blue-500/15 border-blue-300 dark:border-blue-500/40 text-blue-700 dark:text-blue-400' },
                { value: 'high', label: 'High', color: 'bg-amber-500', activeBg: 'bg-amber-50 dark:bg-amber-500/15 border-amber-300 dark:border-amber-500/40 text-amber-700 dark:text-amber-400' },
                { value: 'urgent', label: 'Urgent', color: 'bg-red-500', activeBg: 'bg-red-50 dark:bg-red-500/15 border-red-300 dark:border-red-500/40 text-red-700 dark:text-red-400' },
              ] as const).map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setEditingTask({ ...editingTask, priority: p.value })}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all ${
                    editingTask.priority === p.value
                      ? p.activeBg
                      : 'border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${p.color}`} />
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Status pills */}
          <div>
            <label className="block text-[10px] font-medium text-zinc-400 mb-1.5">Status</label>
            <div className="flex gap-1.5">
              {([
                { value: 'todo', label: 'To do', color: 'bg-zinc-400', activeBg: 'bg-zinc-100 dark:bg-zinc-700/50 border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300' },
                { value: 'in-progress', label: 'In progress', color: 'bg-blue-500', activeBg: 'bg-blue-50 dark:bg-blue-500/15 border-blue-300 dark:border-blue-500/40 text-blue-700 dark:text-blue-400' },
                { value: 'done', label: 'Done', color: 'bg-emerald-500', activeBg: 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400' },
                { value: 'cancelled', label: 'Cancelled', color: 'bg-red-400', activeBg: 'bg-red-50 dark:bg-red-500/15 border-red-300 dark:border-red-500/40 text-red-600 dark:text-red-400' },
              ] as const).map(s => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setEditingTask({ ...editingTask, status: s.value })}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all ${
                    editingTask.status === s.value
                      ? s.activeBg
                      : 'border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${s.color}`} />
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date + Time + Duration */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 mb-1">Date</label>
              <input
                type="date"
                value={editingTask.start_date || ''}
                onChange={e => setEditingTask({ ...editingTask, start_date: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-900 dark:text-zinc-100 transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 mb-1">Time</label>
              <input
                type="time"
                value={editingTask.start_time || ''}
                onChange={e => setEditingTask({ ...editingTask, start_time: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-900 dark:text-zinc-100 transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 mb-1">Duration</label>
              <select
                value={editingTask.duration || 60}
                onChange={e => setEditingTask({ ...editingTask, duration: parseInt(e.target.value) })}
                className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-900 dark:text-zinc-100 transition-all"
              >
                <option value="15">15 min</option>
                <option value="30">30 min</option>
                <option value="45">45 min</option>
                <option value="60">1h</option>
                <option value="90">1.5h</option>
                <option value="120">2h</option>
                <option value="180">3h</option>
                <option value="240">4h</option>
              </select>
            </div>
          </div>

          {/* Project + Client */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 mb-1">Project</label>
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
                className={`w-full px-2.5 py-1.5 border rounded-lg outline-none text-xs transition-all ${
                  editingTask.project_id
                    ? 'bg-violet-50 dark:bg-violet-500/10 border-violet-300 dark:border-violet-500/40 text-violet-700 dark:text-violet-400'
                    : 'bg-white dark:bg-zinc-800/80 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400'
                }`}
              >
                <option value="">No project</option>
                {projectOptions.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 mb-1">Client</label>
              <select
                value={editingTask.client_id || ''}
                onChange={e => setEditingTask({ ...editingTask, client_id: e.target.value })}
                className={`w-full px-2.5 py-1.5 border rounded-lg outline-none text-xs transition-all ${
                  editingTask.client_id
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400'
                    : 'bg-white dark:bg-zinc-800/80 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400'
                }`}
              >
                <option value="">No client</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          {/* Assign to */}
          <div>
            <label className="block text-[10px] font-medium text-zinc-400 mb-1">Assign to</label>
            <select
              value={editingTask.assignee_id || ''}
              onChange={e => setEditingTask({ ...editingTask, assignee_id: e.target.value })}
              className={`w-full px-2.5 py-1.5 border rounded-lg outline-none text-xs transition-all ${
                editingTask.assignee_id
                  ? 'bg-sky-50 dark:bg-sky-500/10 border-sky-300 dark:border-sky-500/40 text-sky-700 dark:text-sky-400'
                  : 'bg-white dark:bg-zinc-800/80 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400'
              }`}
            >
              <option value="">Unassigned</option>
              {teamMembers.filter(m => m.status === 'active').map(m => (
                <option key={m.id} value={m.id}>{m.id === userId ? `${m.name || m.email} (Me)` : (m.name || m.email)}</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[10px] font-medium text-zinc-400 mb-1">Description</label>
            <textarea
              value={editingTask.description || ''}
              onChange={e => setEditingTask({ ...editingTask, description: e.target.value })}
              placeholder="Details, notes, context..."
              className="w-full px-2.5 py-2 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 resize-none transition-all"
              rows={2}
            />
          </div>

          {/* Subtasks */}
          <div>
            <label className="block text-[10px] font-medium text-zinc-400 mb-1.5">
              Subtasks ({subtasksForSelected.filter(s => s.completed).length}/{subtasksForSelected.length})
            </label>
            {subtasksForSelected.length > 0 && (
              <div className="mb-2 rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
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
                      className={`flex items-center gap-2 px-2.5 py-1.5 border-b border-zinc-100 dark:border-zinc-800 last:border-b-0 group ${
                        subBlocked ? 'bg-amber-50/50 dark:bg-amber-500/5' : ''
                      }`}
                    >
                      {subBlocked ? (
                        <div className="w-4 h-4 rounded border-2 border-amber-300 dark:border-amber-500/40 flex items-center justify-center flex-shrink-0" title="Blocked by dependency">
                          <Icons.Lock size={8} className="text-amber-500" />
                        </div>
                      ) : (
                      <button
                        onClick={() => onToggleSubtask(sub.id, !sub.completed)}
                        className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                          sub.completed
                            ? 'bg-emerald-500 border-emerald-500'
                            : 'border-zinc-300 dark:border-zinc-600 hover:border-emerald-400'
                        }`}
                      >
                        {sub.completed && <Icons.Check size={10} className="text-white" />}
                      </button>
                      )}
                      <span className={`flex-1 text-xs truncate ${
                        subBlocked ? 'text-amber-600 dark:text-amber-400/70' :
                        sub.completed ? 'text-zinc-400 line-through' : 'text-zinc-700 dark:text-zinc-300'
                      }`}>
                        {sub.title}
                      </span>
                      {subBlocked && (
                        <span className="text-[9px] text-amber-500 font-medium flex-shrink-0">blocked</span>
                      )}
                      <button
                        onClick={() => onDeleteSubtask(sub.id)}
                        className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 transition-all p-0.5"
                      >
                        <Icons.X size={10} />
                      </button>
                    </motion.div>
                      );
                  })}
                </AnimatePresence>
              </div>
            )}
            {/* Add subtask inline */}
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                placeholder="Add subtask..."
                value={newSubtaskTitle}
                onChange={e => setNewSubtaskTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') onAddSubtask(); }}
                className="flex-1 px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400 transition-all"
              />
              {newSubtaskTitle.trim() && (
                <button
                  onClick={onAddSubtask}
                  disabled={addingSubtask}
                  className="px-2 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg text-[10px] font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 transition-all"
                >
                  {addingSubtask ? '...' : '+'}
                </button>
              )}
            </div>
            {/* Subtask progress bar */}
            {subtasksForSelected.length > 0 && (
              <div className="mt-1.5 w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-1">
                <div
                  className="bg-emerald-500 h-1 rounded-full transition-all duration-300"
                  style={{ width: `${Math.round((subtasksForSelected.filter(s => s.completed).length / subtasksForSelected.length) * 100)}%` }}
                />
              </div>
            )}
          </div>

          {/* Dependency selector */}
          <div className="space-y-2">
            <label className="text-[10px] font-medium text-zinc-400 mb-1 flex items-center gap-1">
              <Icons.Link size={10} />
              Dependency
            </label>
            <select
              value={editingTask.blocked_by || ''}
              onChange={e => setEditingTask({ ...editingTask, blocked_by: e.target.value || undefined })}
              className={`w-full px-2.5 py-1.5 border rounded-lg outline-none text-xs transition-all ${
                editingTask.blocked_by
                  ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/40 text-amber-700 dark:text-amber-400'
                  : 'bg-white dark:bg-zinc-800/80 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400'
              }`}
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

            {/* Active dependency detail card */}
            {editingTask.blocked_by && (() => {
              const blocker = tasks.find(t => t.id === editingTask.blocked_by);
              if (!blocker) return null;
              const blockerOwner = blocker.assignee_id ? getMemberName(blocker.assignee_id) : null;
              const blockerAvatar = blocker.assignee_id ? getMemberAvatar(blocker.assignee_id) : null;
              const isResolved = blocker.completed;
              return (
                <div className={`p-2.5 rounded-lg border ${
                  isResolved
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30'
                    : 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30'
                }`}>
                  <div className="flex items-start gap-2">
                    <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      isResolved ? 'bg-emerald-500' : 'bg-amber-400'
                    }`}>
                      {isResolved
                        ? <Icons.Check size={11} className="text-white" />
                        : <Icons.Lock size={10} className="text-white" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold ${
                        isResolved ? 'text-emerald-700 dark:text-emerald-400 line-through' : 'text-amber-700 dark:text-amber-400'
                      }`}>
                        {blocker.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {blockerOwner && (
                          <div className="flex items-center gap-1">
                            {blockerAvatar ? (
                              <img src={blockerAvatar} alt="" className="w-3.5 h-3.5 rounded-full" />
                            ) : (
                              <div className="w-3.5 h-3.5 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-[7px] font-bold text-violet-700 dark:text-violet-300">
                                {(blockerOwner || '?')[0]?.toUpperCase()}
                              </div>
                            )}
                            <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-400">
                              {blockerOwner}
                            </span>
                          </div>
                        )}
                        {!blockerOwner && (
                          <span className="text-[10px] text-zinc-400 italic">Unassigned</span>
                        )}
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                          isResolved
                            ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                            : blocker.status === 'in-progress'
                              ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400'
                              : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400'
                        }`}>
                          {isResolved ? 'Completed' : blocker.status === 'in-progress' ? 'In progress' : 'Pending'}
                        </span>
                      </div>
                      {!isResolved && (
                        <p className="text-[10px] text-amber-600/80 dark:text-amber-400/60 mt-1">
                          {blockerOwner
                            ? `${blockerOwner} needs to complete this task first`
                            : 'This task must be completed before proceeding'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Dependent tasks (reverse: tasks blocked by this one) */}
            {(() => {
              const dependents = getDependentTasks(selectedTask.id);
              if (dependents.length === 0) return null;
              return (
                <div className="p-2.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-lg border border-zinc-200 dark:border-zinc-700">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Icons.ChevronRight size={10} className="text-zinc-400" />
                    <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Blocks {dependents.length} task{dependents.length > 1 ? 's' : ''}</span>
                  </div>
                  <div className="space-y-1.5">
                    {dependents.map(d => {
                      const depOwner = d.assignee_id ? getMemberName(d.assignee_id) : null;
                      const depAvatar = d.assignee_id ? getMemberAvatar(d.assignee_id) : null;
                      return (
                        <div key={d.id} className="flex items-center gap-2 py-1 px-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700/40 transition-colors cursor-pointer"
                          onClick={() => onOpenTaskDetail(d)}>
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${d.completed ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'}`} />
                          <span className={`text-[11px] flex-1 truncate ${d.completed ? 'text-zinc-400 line-through' : 'text-zinc-700 dark:text-zinc-300'}`}>
                            {d.title}
                          </span>
                          {depOwner && (
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {depAvatar ? (
                                <img src={depAvatar} alt="" className="w-3.5 h-3.5 rounded-full" />
                              ) : (
                                <div className="w-3.5 h-3.5 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-[7px] font-bold text-violet-700 dark:text-violet-300">
                                  {(depOwner || '?')[0]?.toUpperCase()}
                                </div>
                              )}
                              <span className="text-[10px] text-zinc-500 dark:text-zinc-400">{depOwner}</span>
                            </div>
                          )}
                          {!depOwner && !d.completed && (
                            <span className="text-[9px] text-zinc-400 italic flex-shrink-0">unassigned</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {!selectedTask.completed && dependents.some(d => !d.completed) && (
                    <p className="text-[10px] text-amber-600/80 dark:text-amber-400/60 mt-2 pt-1.5 border-t border-zinc-200 dark:border-zinc-700">
                      {dependents.filter(d => !d.completed).length} task{dependents.filter(d => !d.completed).length > 1 ? 's are waiting' : ' is waiting'} for you to complete this task to proceed
                    </p>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Meta info */}
          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center justify-between text-[10px] text-zinc-400">
              <span>Created: {new Date(selectedTask.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              <span className="font-mono text-zinc-300 dark:text-zinc-600">{selectedTask.id.slice(0, 8)}</span>
            </div>
          </div>
        </div>
      )}
    </SlidePanel>
  );
};
