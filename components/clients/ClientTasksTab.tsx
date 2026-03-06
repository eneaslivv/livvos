import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Icons } from '../ui/Icons';
import { ClientTask } from '../../hooks/useClients';

const priorityConfig = {
  high:   { label: 'High',   bg: 'bg-rose-50 dark:bg-rose-500/10',  text: 'text-rose-600 dark:text-rose-400' },
  medium: { label: 'Medium', bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400' },
  low:    { label: 'Low',    bg: 'bg-zinc-100 dark:bg-zinc-800',     text: 'text-zinc-500 dark:text-zinc-400' },
} as const;

const fmtShortDate = (d: string | null | undefined) => {
  if (!d) return '—';
  const date = new Date(d + (d.includes('T') ? '' : 'T00:00:00'));
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
};

const inputClass = 'w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:border-zinc-400 dark:focus:border-zinc-500 focus:ring-2 focus:ring-zinc-100 dark:focus:ring-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 transition-all';
const labelClass = 'block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5';

export interface ProjectTask {
  id: string;
  title: string;
  completed: boolean;
  priority: string;
  due_date?: string;
  project_id?: string;
  client_id?: string;
  start_date?: string;
  start_time?: string;
  status?: string;
  assignee_id?: string;
  parent_task_id?: string;
  description?: string;
  blocked_by?: string;
  project_name?: string;
}

interface AssignedProject {
  id: string;
  title: string;
  status?: string;
  progress?: number;
}

interface TeamMember {
  id: string;
  name?: string;
  email: string;
}

interface ClientTasksTabProps {
  tasks: ClientTask[];
  projectTasks: ProjectTask[];
  assignedProjects: AssignedProject[];
  teamMembers: TeamMember[];
  userId?: string;
  taskProjectFilter: string;
  showNewTaskInline: boolean;
  newTaskData: {
    title: string;
    description: string;
    priority: string;
    due_date: string;
    assignee_id: string;
    status: string;
  };
  creatingTask: boolean;
  expandedTaskId: string | null;
  newSubtaskTitle: string;
  addingSubtask: boolean;
  onTaskProjectFilterChange: (filter: string) => void;
  onShowNewTaskInline: (show: boolean) => void;
  onNewTaskDataChange: (data: ClientTasksTabProps['newTaskData']) => void;
  onCreateTask: () => void;
  onToggleTask: (taskId: string, completed: boolean) => void;
  onToggleUnifiedTask: (taskId: string, completed: boolean) => void;
  onExpandTask: (taskId: string | null) => void;
  onNewSubtaskTitleChange: (title: string) => void;
  onAddSubtask: (parentTaskId: string) => void;
  onToggleSubtask: (subtaskId: string, completed: boolean) => void;
}

export const ClientTasksTab: React.FC<ClientTasksTabProps> = ({
  tasks,
  projectTasks,
  assignedProjects,
  teamMembers,
  userId,
  taskProjectFilter,
  showNewTaskInline,
  newTaskData,
  creatingTask,
  expandedTaskId,
  newSubtaskTitle,
  addingSubtask,
  onTaskProjectFilterChange,
  onShowNewTaskInline,
  onNewTaskDataChange,
  onCreateTask,
  onToggleTask,
  onToggleUnifiedTask,
  onExpandTask,
  onNewSubtaskTitleChange,
  onAddSubtask,
  onToggleSubtask,
}) => {
  // Only use unified tasks (from tasks table) — filter out subtasks for main list
  const mainTasks = projectTasks.filter(t => !t.parent_task_id);
  const subtasksByParent = projectTasks.filter(t => t.parent_task_id).reduce<Record<string, ProjectTask[]>>((acc, t) => {
    const pid = t.parent_task_id!;
    if (!acc[pid]) acc[pid] = [];
    acc[pid].push(t);
    return acc;
  }, {});

  // Apply filter
  let filtered = mainTasks;
  if (taskProjectFilter === 'general') filtered = mainTasks.filter(t => !t.project_id);
  else if (taskProjectFilter !== 'all') filtered = mainTasks.filter(t => t.project_id === taskProjectFilter);

  // Also include legacy client_tasks in "all" and "general"
  type UnifiedTask = ProjectTask & { _legacy?: boolean };
  const legacyTasks: UnifiedTask[] = (taskProjectFilter === 'all' || taskProjectFilter === 'general')
    ? tasks.map(t => ({ id: t.id, title: t.title, completed: t.completed, priority: t.priority || 'medium', due_date: t.due_date, _legacy: true } as any))
    : [];
  const allFiltered: UnifiedTask[] = [...legacyTasks, ...filtered];

  const pending = allFiltered.filter(t => !t.completed);
  const completed = allFiltered.filter(t => t.completed);
  const totalCount = allFiltered.length;
  const completedCount = completed.length;

  // Group tasks by project when showing "All"
  const groupedByProject = useMemo(() => {
    if (taskProjectFilter !== 'all') return null;
    const groups: { projectId: string | null; projectName: string; tasks: UnifiedTask[] }[] = [];
    const generalTasks = allFiltered.filter(t => !t.project_id);
    if (generalTasks.length > 0) {
      groups.push({ projectId: null, projectName: 'General', tasks: generalTasks });
    }
    for (const proj of assignedProjects) {
      const projTasks = allFiltered.filter(t => t.project_id === proj.id);
      if (projTasks.length > 0) {
        groups.push({ projectId: proj.id, projectName: proj.title, tasks: projTasks });
      }
    }
    // Tasks from unrecognized projects
    const knownIds = new Set([null, ...assignedProjects.map(p => p.id)]);
    const orphanTasks = allFiltered.filter(t => t.project_id && !knownIds.has(t.project_id));
    if (orphanTasks.length > 0) {
      groups.push({ projectId: 'other', projectName: 'Other', tasks: orphanTasks });
    }
    return groups;
  }, [taskProjectFilter, allFiltered, assignedProjects]);

  // Helper to get member name
  const getMemberName = (id?: string) => {
    if (!id) return null;
    if (id === userId) return 'Me';
    const m = teamMembers.find(m => m.id === id);
    return m?.name || m?.email || null;
  };

  // Status labels
  const statusLabels: Record<string, { label: string; color: string }> = {
    'todo': { label: 'To do', color: 'text-zinc-500 bg-zinc-100 dark:bg-zinc-800' },
    'in-progress': { label: 'In progress', color: 'text-blue-600 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400' },
    'done': { label: 'Done', color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400' },
    'cancelled': { label: 'Cancelled', color: 'text-zinc-400 bg-zinc-100 dark:bg-zinc-800' },
  };

  const renderTask = (task: UnifiedTask, isCompleted: boolean, hideProjectName = false) => {
    const pcfg = priorityConfig[task.priority as keyof typeof priorityConfig] || priorityConfig.medium;
    const isLegacy = (task as any)._legacy;
    const isExpanded = expandedTaskId === task.id;
    const taskSubtasks = subtasksByParent[task.id] || [];
    const subtasksDone = taskSubtasks.filter(s => s.completed).length;
    const stLabel = !isLegacy && task.status ? statusLabels[task.status] || null : null;

    // Dependency check
    const blockerTask = task.blocked_by ? allFiltered.find(t => t.id === task.blocked_by) || projectTasks.find(t => t.id === task.blocked_by) : null;
    const isBlocked = blockerTask ? !blockerTask.completed : false;
    const blockerOwner = blockerTask?.assignee_id ? getMemberName(blockerTask.assignee_id) : null;

    return (
      <div key={task.id} className={`rounded-xl transition-colors ${isCompleted ? 'opacity-60' : ''}`}>
        <div className={`flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors group ${isExpanded && !isCompleted ? 'bg-zinc-50 dark:bg-zinc-800/40' : ''} ${isBlocked && !isCompleted ? 'ring-1 ring-amber-300 dark:ring-amber-500/30 bg-amber-50/30 dark:bg-amber-500/5' : ''}`}>
          {/* Checkbox or lock icon */}
          {isBlocked && !isCompleted ? (
            <div className="w-5 h-5 rounded-md border-2 border-amber-300 dark:border-amber-500/40 flex items-center justify-center shrink-0" title="Blocked by dependency">
              <Icons.Lock size={10} className="text-amber-500" />
            </div>
          ) : (
            <button
              onClick={() => isLegacy ? onToggleTask(task.id, !isCompleted) : onToggleUnifiedTask(task.id, !isCompleted)}
              className={isCompleted
                ? 'w-5 h-5 rounded-md bg-emerald-500 border-2 border-emerald-500 flex items-center justify-center shrink-0'
                : 'w-5 h-5 rounded-md border-2 border-zinc-300 dark:border-zinc-600 hover:border-emerald-400 flex items-center justify-center shrink-0 transition-all group-hover:text-emerald-400'
              }
            >
              {isCompleted
                ? <Icons.Check size={12} className="text-white" />
                : <Icons.Check size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
              }
            </button>
          )}
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => !isLegacy && onExpandTask(isExpanded ? null : task.id)}>
            <p className={`text-sm ${isCompleted ? 'line-through text-zinc-400' : isBlocked ? 'text-amber-700 dark:text-amber-400' : 'text-zinc-900 dark:text-zinc-100'}`}>{task.title}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {isBlocked && !isCompleted && (
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-0.5">
                  <Icons.Lock size={8} />
                  {blockerOwner ? `Waiting for ${blockerOwner}` : `Waiting: ${blockerTask?.title}`}
                </span>
              )}
              {task.project_name && taskProjectFilter === 'all' && !hideProjectName && (
                <span className="text-[10px] text-blue-500 dark:text-blue-400 font-medium">{task.project_name}</span>
              )}
              {task.assignee_id && (
                <span className="text-[10px] text-violet-500 dark:text-violet-400 font-medium flex items-center gap-0.5">
                  <Icons.User size={8} />
                  {getMemberName(task.assignee_id)}
                </span>
              )}
              {(task.due_date || task.start_date) && (
                <span className="text-[10px] text-zinc-400 flex items-center gap-0.5">
                  <Icons.Clock size={9} />
                  {fmtShortDate(task.due_date || task.start_date)}
                </span>
              )}
              {!isLegacy && taskSubtasks.length > 0 && (
                <span className="text-[10px] text-zinc-400 font-medium">{subtasksDone}/{taskSubtasks.length} sub</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {isBlocked && !isCompleted && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400">Blocked</span>
            )}
            {stLabel && !isCompleted && !isBlocked && (
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${stLabel.color}`}>{stLabel.label}</span>
            )}
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${pcfg.bg} ${pcfg.text}`}>
              {pcfg.label}
            </span>
          </div>
        </div>

        {/* Blocked detail card when expanded */}
        {isExpanded && isBlocked && !isCompleted && blockerTask && (
          <div className="mx-3 mb-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-amber-400 flex items-center justify-center flex-shrink-0">
                <Icons.Lock size={10} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 truncate">
                  Depends on: {blockerTask.title}
                </p>
                <p className="text-[10px] text-amber-600/80 dark:text-amber-400/60">
                  {blockerOwner
                    ? `${blockerOwner} needs to complete this task`
                    : 'This task has no assignee — needs to be completed first'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Expanded: subtasks + add subtask */}
        {isExpanded && !isLegacy && !isCompleted && (
          <div className="ml-8 pl-3 border-l-2 border-zinc-200 dark:border-zinc-700 pb-2 space-y-1">
            {taskSubtasks.map(sub => {
              const subBlocker = sub.blocked_by ? projectTasks.find(t => t.id === sub.blocked_by) : null;
              const subBlocked = subBlocker ? !subBlocker.completed : false;
              const subBlockerOwner = subBlocker?.assignee_id ? getMemberName(subBlocker.assignee_id) : null;
              return (
              <div key={sub.id} className={`flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors group/sub ${subBlocked ? 'bg-amber-50/50 dark:bg-amber-500/5' : ''}`}>
                {subBlocked ? (
                  <div className="w-4 h-4 rounded border border-amber-300 dark:border-amber-500/40 flex items-center justify-center shrink-0" title={subBlockerOwner ? `Waiting for ${subBlockerOwner}` : 'Blocked'}>
                    <Icons.Lock size={8} className="text-amber-500" />
                  </div>
                ) : (
                  <button
                    onClick={() => onToggleSubtask(sub.id, !sub.completed)}
                    className={sub.completed
                      ? 'w-4 h-4 rounded bg-emerald-500 border border-emerald-500 flex items-center justify-center shrink-0'
                      : 'w-4 h-4 rounded border border-zinc-300 dark:border-zinc-600 hover:border-emerald-400 flex items-center justify-center shrink-0 transition-all'
                    }
                  >
                    {sub.completed && <Icons.Check size={9} className="text-white" />}
                  </button>
                )}
                <span className={`text-xs flex-1 ${subBlocked ? 'text-amber-600 dark:text-amber-400/70' : sub.completed ? 'line-through text-zinc-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                  {sub.title}
                </span>
                {subBlocked && (
                  <span className="text-[9px] text-amber-500 font-medium flex-shrink-0">
                    {subBlockerOwner ? `wait. ${subBlockerOwner}` : 'blocked'}
                  </span>
                )}
              </div>
              );
            })}
            {/* Add subtask input */}
            <div className="flex items-center gap-2 pt-1">
              <div className="w-4 h-4 rounded border border-dashed border-zinc-300 dark:border-zinc-600 shrink-0" />
              <input
                type="text"
                placeholder="Add subtask..."
                value={newSubtaskTitle}
                onChange={e => onNewSubtaskTitleChange(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && onAddSubtask(task.id)}
                className="flex-1 text-xs bg-transparent outline-none text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400"
              />
              {newSubtaskTitle.trim() && (
                <button
                  onClick={() => onAddSubtask(task.id)}
                  disabled={addingSubtask}
                  className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 disabled:opacity-40"
                >
                  {addingSubtask ? '...' : 'Add'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <motion.div key="tasks" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
      {/* Project filter bar */}
      {assignedProjects.length > 0 && (
        <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1">
          <button
            onClick={() => onTaskProjectFilterChange('all')}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors ${taskProjectFilter === 'all' ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
          >
            All
          </button>
          <button
            onClick={() => onTaskProjectFilterChange('general')}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors ${taskProjectFilter === 'general' ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
          >
            General
          </button>
          {assignedProjects.map(proj => (
            <button
              key={proj.id}
              onClick={() => onTaskProjectFilterChange(proj.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors ${taskProjectFilter === proj.id ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
            >
              {proj.title}
            </button>
          ))}
        </div>
      )}

      {/* New task form */}
      {showNewTaskInline ? (
        <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl mb-4 space-y-3 border border-zinc-200/60 dark:border-zinc-700/60">
          <input
            type="text"
            placeholder="Task title..."
            value={newTaskData.title}
            onChange={(e) => onNewTaskDataChange({ ...newTaskData, title: e.target.value })}
            className={inputClass}
            autoFocus
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && onCreateTask()}
          />
          <textarea
            placeholder="Description (optional)..."
            value={newTaskData.description}
            onChange={(e) => onNewTaskDataChange({ ...newTaskData, description: e.target.value })}
            className={`${inputClass} resize-none`}
            rows={2}
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Priority</label>
              <select
                value={newTaskData.priority}
                onChange={(e) => onNewTaskDataChange({ ...newTaskData, priority: e.target.value })}
                className={inputClass}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Date</label>
              <input
                type="date"
                value={newTaskData.due_date}
                onChange={(e) => onNewTaskDataChange({ ...newTaskData, due_date: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Assign to</label>
              <select
                value={newTaskData.assignee_id}
                onChange={(e) => onNewTaskDataChange({ ...newTaskData, assignee_id: e.target.value })}
                className={inputClass}
              >
                <option value="">Unassigned</option>
                {teamMembers.map(m => (
                  <option key={m.id} value={m.id}>{m.name || m.email}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select
                value={newTaskData.status}
                onChange={(e) => onNewTaskDataChange({ ...newTaskData, status: e.target.value })}
                className={inputClass}
              >
                <option value="todo">To do</option>
                <option value="in-progress">In progress</option>
                <option value="done">Completed</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCreateTask}
              disabled={!newTaskData.title.trim() || creatingTask}
              className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-xs font-semibold disabled:opacity-40 transition-all"
            >
              {creatingTask ? 'Creating...' : 'Create Task'}
            </button>
            <button
              onClick={() => { onShowNewTaskInline(false); onNewTaskDataChange({ title: '', description: '', priority: 'medium', due_date: new Date().toISOString().split('T')[0], assignee_id: '', status: 'todo' }); }}
              className="px-4 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => onShowNewTaskInline(true)}
          className="w-full p-3 border border-dashed border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors mb-4 flex items-center justify-center gap-1.5"
        >
          <Icons.Plus size={13} />
          New task
        </button>
      )}

      {/* Task list */}
      {totalCount === 0 ? (
        <div className="text-center py-8">
          <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-3">
            <Icons.CheckCircle size={18} className="text-zinc-400" />
          </div>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">No tasks</p>
          {taskProjectFilter !== 'all' && (
            <button onClick={() => onTaskProjectFilterChange('all')} className="text-[10px] text-zinc-400 hover:text-zinc-600 mt-1">
              View all
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-0.5">
          {/* Progress summary */}
          <div className="flex items-center gap-3 px-3 pb-2">
            <div className="flex-1 h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${completedCount === totalCount ? 'bg-emerald-500' : 'bg-zinc-900 dark:bg-zinc-200'}`} style={{ width: `${totalCount ? Math.round((completedCount / totalCount) * 100) : 0}%` }} />
            </div>
            <span className="text-[10px] text-zinc-400 font-mono shrink-0">{completedCount}/{totalCount}</span>
          </div>

          {groupedByProject ? (
            /* ─── GROUPED VIEW (All tasks, grouped by project) ─── */
            <div className="space-y-3">
              {groupedByProject.map(group => {
                const groupPending = group.tasks.filter(t => !t.completed);
                const groupCompleted = group.tasks.filter(t => t.completed);
                return (
                  <div key={group.projectId || 'general'} className="border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden">
                    {/* Section header */}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/40">
                      <div className="flex items-center gap-2">
                        {group.projectId ? (
                          <Icons.Briefcase size={13} className="text-blue-500" />
                        ) : (
                          <Icons.Inbox size={13} className="text-zinc-400" />
                        )}
                        <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">{group.projectName}</span>
                      </div>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {groupCompleted.length}/{group.tasks.length}
                      </span>
                    </div>
                    {/* Tasks */}
                    <div>
                      {groupPending.map(task => renderTask(task, false, true))}
                      {groupCompleted.map(task => renderTask(task, true, true))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ─── FLAT VIEW (filtered to specific project) ─── */
            <>
              {pending.map(task => renderTask(task, false))}
              {completed.length > 0 && (
                <div className="mt-3 border-t border-zinc-100 dark:border-zinc-800 pt-3">
                  <div className="flex items-center gap-2 px-3 pb-2">
                    <Icons.CheckCircle size={12} className="text-emerald-500" />
                    <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Completed ({completed.length})</p>
                  </div>
                  {completed.map(task => renderTask(task, true))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </motion.div>
  );
};
