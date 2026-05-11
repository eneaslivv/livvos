/**
 * InlineTaskDetailHost — drop-in host for TaskDetailPanel that owns all
 * the heavy state internally (editingTask, savingTask, saveError,
 * subtask CRUD wiring, dependency lookups, member/client/project
 * resolution helpers).
 *
 * Designed so any page can do:
 *
 *   const [openTaskId, setOpenTaskId] = useState<string | null>(null);
 *   ...
 *   <InlineTaskDetailHost taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
 *
 * Before this existed, opening a task inside Projects.tsx routed the
 * user to /calendar?task=<id>, which was jarring — you'd lose your
 * project context. Now the SAME TaskDetailPanel that Calendar uses
 * slides in over the current page, no navigation, no state loss.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { TaskDetailPanel } from './TaskDetailPanel';
import { useCalendar, type CalendarTask } from '../../hooks/useCalendar';
import { useTeam } from '../../context/TeamContext';
import { useProjects } from '../../context/ProjectsContext';
import { useClients } from '../../hooks/useClients';
import { useAuth } from '../../hooks/useAuth';

interface Props {
  /** Which task to open — null = panel closed. */
  taskId: string | null;
  onClose: () => void;
}

export const InlineTaskDetailHost: React.FC<Props> = ({ taskId, onClose }) => {
  const { tasks, updateTask, deleteTask, createTask } = useCalendar();
  const { members } = useTeam();
  const { projects } = useProjects();
  const { clients } = useClients();
  const { user } = useAuth();

  const selectedTask = useMemo(() => tasks.find(t => t.id === taskId) || null, [tasks, taskId]);

  // ── Edit buffer ───────────────────────────────────────────────────
  // Mirrors Calendar.tsx's pattern: we keep a Partial<CalendarTask>
  // copy that the panel mutates, then flush on Save.
  const [editingTask, setEditingTask] = useState<Partial<CalendarTask>>({});
  const [savingTask, setSavingTask] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sync edit buffer whenever the selected task changes.
  useEffect(() => {
    if (selectedTask) {
      setEditingTask({ ...selectedTask });
      setSaveError(null);
    } else {
      setEditingTask({});
    }
  }, [selectedTask?.id]);

  // ── Subtasks ──────────────────────────────────────────────────────
  const subtasksForSelected = useMemo(() => {
    if (!selectedTask) return [];
    return tasks.filter(t => t.parent_task_id === selectedTask.id);
  }, [tasks, selectedTask?.id]);

  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [addingSubtask, setAddingSubtask] = useState(false);

  const handleAddSubtask = useCallback(async () => {
    if (!selectedTask || !newSubtaskTitle.trim()) return;
    setAddingSubtask(true);
    try {
      await createTask({
        title: newSubtaskTitle.trim(),
        completed: false,
        priority: 'medium',
        status: 'todo' as any,
        parent_task_id: selectedTask.id,
        project_id: selectedTask.project_id || undefined,
        client_id: selectedTask.client_id || undefined,
        owner_id: user?.id || '',
      } as any);
      setNewSubtaskTitle('');
    } finally {
      setAddingSubtask(false);
    }
  }, [selectedTask, newSubtaskTitle, createTask, user?.id]);

  const handleToggleSubtask = useCallback(async (subtaskId: string, completed: boolean) => {
    await updateTask(subtaskId, {
      completed,
      status: completed ? 'done' : 'todo',
      completed_at: completed ? new Date().toISOString() : null,
    } as any);
  }, [updateTask]);

  const handleDeleteSubtask = useCallback(async (subtaskId: string) => {
    await deleteTask(subtaskId);
  }, [deleteTask]);

  // ── Save ──────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!selectedTask) return;
    setSavingTask(true);
    setSaveError(null);
    try {
      // Only diff fields actually changed since open.
      const patch: Partial<CalendarTask> = {};
      const keys: (keyof CalendarTask)[] = [
        'title', 'description', 'description_html', 'priority', 'status',
        'start_date', 'end_date', 'start_time', 'duration',
        'project_id', 'client_id', 'assignee_ids', 'assignee_id',
        'completed', 'blocked_by', 'group_name',
      ];
      for (const k of keys) {
        if ((editingTask as any)[k] !== (selectedTask as any)[k]) {
          (patch as any)[k] = (editingTask as any)[k];
        }
      }
      if (Object.keys(patch).length > 0) {
        await updateTask(selectedTask.id, patch);
      }
    } catch (err: any) {
      setSaveError(err?.message || 'No se pudo guardar');
    } finally {
      setSavingTask(false);
    }
  }, [selectedTask, editingTask, updateTask]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Delete this task?')) return;
    await deleteTask(id);
    onClose();
  }, [deleteTask, onClose]);

  const handleToggleComplete = useCallback(async (id: string, completed: boolean) => {
    await updateTask(id, {
      completed,
      status: completed ? 'done' : 'todo',
      completed_at: completed ? new Date().toISOString() : null,
    } as any);
  }, [updateTask]);

  // ── Lookups (delegated to existing hooks) ─────────────────────────
  const projectOptions = useMemo(() => projects.map(p => ({
    id: p.id,
    title: p.title,
    client_id: (p as any).client_id || null,
  })), [projects]);

  const clientOptions = useMemo(() => clients.map(c => ({
    id: c.id,
    name: c.name || c.company || 'Client',
  })), [clients]);

  const getMemberName = useCallback((id?: string) => {
    if (!id) return null;
    const m = members.find(x => x.id === id);
    return m?.name || m?.email || null;
  }, [members]);

  const getMemberAvatar = useCallback((id?: string) => {
    if (!id) return null;
    return members.find(x => x.id === id)?.avatar_url || null;
  }, [members]);

  const getClientLabel = useCallback((task: CalendarTask) => {
    if (!task.client_id) return null;
    const c = clients.find(x => x.id === task.client_id);
    return c?.name || c?.company || null;
  }, [clients]);

  const getElapsedDays = useCallback((task: CalendarTask) => {
    if (!task.created_at) return null;
    const ms = Date.now() - new Date(task.created_at).getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
  }, []);

  // Dependency helpers — minimal no-ops when feature isn't used.
  const isTaskBlocked = useCallback((_: CalendarTask) => false, []);
  const getBlockerTask = useCallback(() => null, []);
  const getDependentTasks = useCallback(() => [], []);

  const handleOpenTaskDetail = useCallback((task: CalendarTask) => {
    // Allow jumping from a subtask/parent reference inside the panel.
    // We just re-set our own selectedTask via the parent.
    // The host's parent owns taskId, so we can't directly mutate it — but
    // since clicking a parent inside the panel is rare, we update the
    // URL hash as a soft signal the parent can listen to. For now, no-op:
    // the user can navigate manually via the breadcrumb.
    // (If this becomes a UX gap, the parent can pass a setTaskId prop.)
    return task;
  }, []);

  if (!selectedTask) return null;

  return (
    <TaskDetailPanel
      selectedTask={selectedTask}
      editingTask={editingTask}
      setEditingTask={setEditingTask}
      savingTask={savingTask}
      saveError={saveError}
      onSave={handleSave}
      onClose={onClose}
      onDelete={handleDelete}
      onToggleComplete={handleToggleComplete}
      onQuickUpdate={(id, updates) => updateTask(id, updates as any)}
      subtasksForSelected={subtasksForSelected as any}
      newSubtaskTitle={newSubtaskTitle}
      setNewSubtaskTitle={setNewSubtaskTitle}
      addingSubtask={addingSubtask}
      onAddSubtask={handleAddSubtask}
      onToggleSubtask={handleToggleSubtask}
      onDeleteSubtask={handleDeleteSubtask}
      isTaskBlocked={isTaskBlocked as any}
      getBlockerTask={getBlockerTask as any}
      getDependentTasks={getDependentTasks as any}
      getElapsedDays={getElapsedDays as any}
      tasks={tasks as any}
      teamMembers={members as any}
      projectOptions={projectOptions}
      clients={clientOptions}
      userId={user?.id}
      getMemberName={getMemberName}
      getMemberAvatar={getMemberAvatar}
      getClientLabel={getClientLabel}
      onOpenTaskDetail={handleOpenTaskDetail as any}
    />
  );
};
