// Kanban board for tasks — reused by Calendar's board view and the Projects
// detail panel. Five columns matching the existing CalendarTask.status values:
// todo / in-progress / done / cancelled. Drag-and-drop changes status,
// onTaskClick opens the existing TaskDetailPanel via the parent.

import React, { useMemo, useState } from 'react';
import type { CalendarTask } from '../../hooks/useCalendar';
import { Icons } from '../ui/Icons';

type TaskStatus = NonNullable<CalendarTask['status']>;

interface ColumnConfig {
  id: TaskStatus;
  label: string;       // displayed (Spanish, mirrors the design)
  dot: string;         // tailwind bg color for the corner dot
  ring: string;        // tailwind ring on hover
  tint: string;        // tailwind bg tint when drag-over
}

const COLUMNS: ColumnConfig[] = [
  { id: 'todo',         label: 'Pendiente',  dot: 'bg-zinc-400',    ring: 'ring-zinc-400/40',    tint: 'bg-zinc-500/[0.04]' },
  { id: 'in-progress',  label: 'Trabajando', dot: 'bg-amber-500',   ring: 'ring-amber-400/40',   tint: 'bg-amber-500/[0.04]' },
  { id: 'done',         label: 'Completado', dot: 'bg-emerald-500', ring: 'ring-emerald-400/40', tint: 'bg-emerald-500/[0.04]' },
  { id: 'cancelled',    label: 'Cancelado',  dot: 'bg-rose-400',    ring: 'ring-rose-400/40',    tint: 'bg-rose-500/[0.04]' },
];

// Tasks without a status default to 'todo'. We also coerce `completed=true`
// rows to 'done' so legacy tasks still group correctly.
const taskColumn = (task: CalendarTask): TaskStatus => {
  if (task.completed) return 'done';
  return (task.status as TaskStatus) || 'todo';
};

interface Props {
  tasks: CalendarTask[];
  onTaskClick?: (task: CalendarTask) => void;
  /** Called when the user drags a card into a different column. */
  onStatusChange?: (taskId: string, status: TaskStatus) => void | Promise<void>;
  /** Inline "+ Add task" affordance per column. Optional — hidden if absent. */
  onAddTask?: (status: TaskStatus) => void;
  emptyHint?: string;
}

export const TaskKanbanBoard: React.FC<Props> = ({ tasks, onTaskClick, onStatusChange, onAddTask, emptyHint }) => {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<TaskStatus | null>(null);

  const grouped = useMemo(() => {
    const acc: Record<string, CalendarTask[]> = { todo: [], 'in-progress': [], done: [], cancelled: [] };
    tasks.forEach(t => {
      const col = taskColumn(t);
      (acc[col] = acc[col] || []).push(t);
    });
    Object.keys(acc).forEach(k => acc[k].sort((a, b) => (a.order_index || 0) - (b.order_index || 0)));
    return acc;
  }, [tasks]);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };
  const handleDragOver = (e: React.DragEvent, col: TaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverCol !== col) setDragOverCol(col);
  };
  const handleDrop = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    setDraggedId(null);
    setDragOverCol(null);
    if (!id) return;
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    if (taskColumn(task) === status) return;
    onStatusChange?.(id, status);
  };

  return (
    <div className="h-full overflow-x-auto pb-3 no-scrollbar">
      <div className="flex gap-3 min-w-max h-full">
        {COLUMNS.map(col => {
          const colTasks = grouped[col.id] || [];
          const isOver = dragOverCol === col.id;
          return (
            <div
              key={col.id}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragLeave={(e) => { if (!(e.currentTarget as Node).contains(e.relatedTarget as Node)) setDragOverCol(prev => (prev === col.id ? null : prev)); }}
              onDrop={(e) => handleDrop(e, col.id)}
              className={`w-[280px] flex flex-col h-full rounded-xl transition-all duration-150 ease-out ${
                isOver ? `ring-2 ${col.ring} ${col.tint}` : 'ring-1 ring-transparent'
              }`}
            >
              {/* Column header — colored pill mirrors the reference design */}
              <div className="flex items-center justify-between mb-2 px-2 pt-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.06em] text-white ${
                    col.id === 'todo' ? 'bg-zinc-500'
                    : col.id === 'in-progress' ? 'bg-amber-500'
                    : col.id === 'done' ? 'bg-emerald-500'
                    : 'bg-rose-500'
                  }`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
                    {col.label}
                  </span>
                  <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono tabular-nums">{colTasks.length}</span>
                </div>
                {onAddTask && (
                  <button
                    onClick={() => onAddTask(col.id)}
                    title="Add task"
                    className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors p-1 -mr-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800">
                    <Icons.Plus size={13} />
                  </button>
                )}
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto space-y-2 px-2 pb-2 no-scrollbar">
                {colTasks.map(task => {
                  const isDragging = draggedId === task.id;
                  const priColor = task.priority === 'urgent' ? 'bg-rose-500'
                    : task.priority === 'high' ? 'bg-amber-500'
                    : task.priority === 'medium' ? 'bg-blue-400'
                    : 'bg-zinc-300 dark:bg-zinc-600';
                  const priLabel = task.priority === 'urgent' ? 'Urgent'
                    : task.priority === 'high' ? 'Alta'
                    : task.priority === 'medium' ? 'Normal'
                    : 'Baja';
                  const due = task.start_date || task.end_date;
                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      onDragEnd={() => { setDraggedId(null); setDragOverCol(null); }}
                      onClick={() => { if (draggedId !== task.id) onTaskClick?.(task); }}
                      className={`group bg-white dark:bg-zinc-900 px-3 py-2.5 rounded-lg border border-zinc-200/80 dark:border-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:border-zinc-300 dark:hover:border-zinc-700 hover:-translate-y-px cursor-grab active:cursor-grabbing transition-all duration-150 ease-out ${
                        isDragging ? 'opacity-40 scale-[0.97]' : ''
                      }`}
                    >
                      {task.cover_url && (
                        <img src={task.cover_url} alt="" className="w-full h-20 object-cover rounded-md mb-2 -mt-0.5" />
                      )}
                      <div className="text-[12.5px] font-medium text-zinc-900 dark:text-zinc-100 leading-snug mb-1.5 line-clamp-2">{task.title}</div>
                      <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 dark:text-zinc-500">
                        <Icons.Calendar size={11} className="opacity-60" />
                        <span className="font-mono">{due || '—'}</span>
                        <span className="ml-auto inline-flex items-center gap-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${priColor}`} />
                          <span className="text-zinc-500 dark:text-zinc-400">{priLabel}</span>
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Empty state + inline add */}
                {colTasks.length === 0 && (
                  <button
                    onClick={() => onAddTask?.(col.id)}
                    disabled={!onAddTask}
                    className={`w-full h-16 border border-dashed rounded-lg flex items-center justify-center text-[10px] transition-colors ${
                      isOver
                        ? 'border-zinc-400 dark:border-zinc-600 text-zinc-500 dark:text-zinc-400 bg-white/60 dark:bg-zinc-900/60'
                        : 'border-zinc-200 dark:border-zinc-800 text-zinc-300 dark:text-zinc-700 hover:border-zinc-300 hover:text-zinc-500'
                    } ${!onAddTask ? 'cursor-default' : 'cursor-pointer'}`}
                  >
                    {isOver ? 'Drop here' : (onAddTask ? '+ Añadir tarea' : (emptyHint || 'Empty'))}
                  </button>
                )}

                {colTasks.length > 0 && onAddTask && (
                  <button
                    onClick={() => onAddTask(col.id)}
                    className="w-full text-left px-3 py-2 text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 rounded-lg transition-colors flex items-center gap-1.5">
                    <Icons.Plus size={11} /> Añadir tarea
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
