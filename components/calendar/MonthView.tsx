import React from 'react';
import { Icons } from '../ui/Icons';
import { CalendarEvent, CalendarTask } from '../../hooks/useCalendar';

interface TaskColor {
  bg: string;
  border: string;
  text: string;
  dot: string;
}

export interface MonthViewProps {
  currentDate: Date;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  getMonthDays: () => Date[];
  getDayEvents: (date: string) => (CalendarEvent & { content_status?: string })[];
  getDayTasks: (date: string) => CalendarTask[];
  getTaskColor: (task: CalendarTask) => TaskColor;
  getOverdueDays: (task: CalendarTask) => number;
  getElapsedDays: (task: CalendarTask) => number | null;
  getClientLabel: (task: CalendarTask) => string | null;
  // Drag and drop
  draggingTaskId: string | null;
  setDraggingTaskId: (id: string | null) => void;
  onTaskDragStart: (e: React.DragEvent, taskId: string) => void;
  onTaskDrop: (e: React.DragEvent, date: string, hour?: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  // Slot popover
  onSlotDoubleClick: (e: React.MouseEvent, dateStr: string) => void;
  // Task detail
  onOpenTaskDetail: (task: CalendarTask) => void;
}

export const MonthView: React.FC<MonthViewProps> = ({
  currentDate,
  selectedDate,
  setSelectedDate,
  getMonthDays,
  getDayEvents,
  getDayTasks,
  getTaskColor,
  getOverdueDays,
  getElapsedDays,
  getClientLabel,
  draggingTaskId,
  setDraggingTaskId,
  onTaskDragStart,
  onTaskDrop,
  onDragOver,
  onSlotDoubleClick,
  onOpenTaskDetail,
}) => {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-zinc-200 dark:border-zinc-800">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
          <div key={day} className="p-3 text-center text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {getMonthDays().map((day, idx) => {
          const dateStr = day.toISOString().split('T')[0];
          const isCurrentMonth = day.getMonth() === currentDate.getMonth();
          const isToday = dateStr === new Date().toISOString().split('T')[0];
          const isSelected = dateStr === selectedDate;
          const dayEvents = getDayEvents(dateStr);
          const dayTasks = getDayTasks(dateStr);
          const totalItems = dayEvents.length + dayTasks.length;
          const maxVisible = 3;
          return (
            <div
              key={`${dateStr}-${idx}`}
              onClick={() => setSelectedDate(dateStr)}
              onDoubleClick={(e) => onSlotDoubleClick(e, dateStr)}
              onDragOver={onDragOver}
              onDrop={(e) => onTaskDrop(e, dateStr)}
              className={`min-h-[120px] p-2 border-b border-r border-zinc-100 dark:border-zinc-800 cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40 ${
                isSelected
                  ? 'bg-blue-50/50 dark:bg-blue-900/10 ring-1 ring-inset ring-blue-300 dark:ring-blue-700'
                  : isCurrentMonth ? 'bg-white dark:bg-zinc-900' : 'bg-zinc-50 dark:bg-zinc-900/40'
              } ${draggingTaskId ? 'hover:bg-blue-50/40 dark:hover:bg-blue-900/10' : ''}`}
            >
              <div className={`text-xs font-semibold flex items-center gap-1 ${
                isToday
                  ? 'text-white'
                  : isCurrentMonth ? 'text-zinc-600 dark:text-zinc-400' : 'text-zinc-400 dark:text-zinc-600'
              }`}>
                {isToday ? (
                  <span className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-[10px]">
                    {day.getDate()}
                  </span>
                ) : (
                  day.getDate()
                )}
                {dayTasks.length > 0 && (
                  <div className="flex items-center gap-0.5 ml-auto">
                    {dayTasks.slice(0, 4).map(t => (
                      <span key={t.id} className={`w-1 h-1 rounded-full ${getTaskColor(t).dot}`} />
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-1.5 space-y-0.5">
                {dayEvents.slice(0, maxVisible).map((event) => (
                  <div
                    key={event.id}
                    className="text-[10px] px-1.5 py-0.5 rounded truncate flex items-center gap-0.5"
                    style={{ backgroundColor: event.color || '#3b82f6', color: 'white' }}
                  >
                    {event.source === 'google' && <span className="opacity-75">G</span>}
                    {event.title}
                  </div>
                ))}
                {dayTasks.slice(0, Math.max(0, maxVisible - dayEvents.length)).map((task) => {
                  const tc = getTaskColor(task);
                  const overdue = getOverdueDays(task);
                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(e) => onTaskDragStart(e, task.id)}
                      onDragEnd={() => setDraggingTaskId(null)}
                      className={`text-[10px] px-1.5 py-0.5 rounded truncate flex items-center gap-1 border cursor-grab active:cursor-grabbing transition-opacity duration-300 ${tc.bg} ${tc.border}`}
                      onClick={(e) => { e.stopPropagation(); onOpenTaskDetail(task); }}
                    >
                      {task.completed ? (
                        <Icons.CheckCircle size={8} className="text-emerald-500 shrink-0" />
                      ) : (
                        <span className={`w-1 h-1 rounded-full ${tc.dot} shrink-0`} />
                      )}
                      <span className={`${tc.text} truncate ${task.completed ? 'line-through' : ''}`}>{task.title}</span>
                      {overdue > 0 && (
                        <span className="ml-auto text-[8px] font-bold text-red-500 shrink-0">+{overdue}d</span>
                      )}
                      {task.completed && getElapsedDays(task) !== null && (
                        <span className="ml-auto text-[8px] font-semibold text-emerald-600 shrink-0">{getElapsedDays(task)}d</span>
                      )}
                      {!task.completed && !(overdue > 0) && getClientLabel(task) && (
                        <span className="ml-auto text-[8px] font-medium text-violet-500 dark:text-violet-400 shrink-0 truncate max-w-[50px]" title={getClientLabel(task)!}>
                          {getClientLabel(task)}
                        </span>
                      )}
                    </div>
                  );
                })}
                {totalItems > maxVisible && (
                  <div className="text-[10px] text-zinc-400 pl-1">+{totalItems - maxVisible} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
