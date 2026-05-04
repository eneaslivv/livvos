import React from 'react';
import { Icons } from '../ui/Icons';
import { Card } from '../ui/Card';
import { CalendarEvent, CalendarTask } from '../../hooks/useCalendar';

interface ContentPlatformConfig {
  label: string;
  color: string;
}

export interface SelectedDatePanelProps {
  selectedDate: string;
  calendarMode: 'schedule' | 'content';
  getDayEvents: (date: string) => (CalendarEvent & { content_status?: string })[];
  getDayTasks: (date: string) => CalendarTask[];
  contentPlatforms: Record<string, ContentPlatformConfig>;
  // Stats
  stats: {
    totalEvents: number;
    totalTasks: number;
    completedTasks: number;
    pendingTasks: number;
    overdueTasks: number;
    completionRate: number;
  };
  filteredEventsCount: number;
  periodLabel?: string;
  // Event actions
  onEditEvent?: (event: CalendarEvent) => void;
  onDeleteEvent?: (eventId: string) => void;
  // Task actions
  toggleTaskComplete: (taskId: string, completed: boolean) => void;
  onOpenTaskDetail: (task: CalendarTask) => void;
  // Helpers
  getMemberName: (id?: string) => string | null;
  getMemberAvatar: (id?: string) => string | null;
  getProjectLabel: (task: CalendarTask) => string;
  getClientLabel: (task: CalendarTask) => string | null;
  getElapsedDays: (task: CalendarTask) => number | null;
  // Upcoming tasks
  tasks: CalendarTask[];
}

// ─── Local visual primitives ───────────────────────────────────────
// Tiny dot used as the priority marker in task rows. Replaces noisy
// colored "urgent / high / medium / low" pills with a single 6px dot.
const PriorityDot: React.FC<{ priority?: CalendarTask['priority'] }> = ({ priority }) => {
  const color = priority === 'urgent' ? 'bg-rose-500'
    : priority === 'high' ? 'bg-amber-500'
    : priority === 'medium' ? 'bg-blue-400'
    : 'bg-zinc-300 dark:bg-zinc-600';
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${color} shrink-0`} title={priority || 'low'} />;
};

// Subtle chip used for project / client / status. Single neutral palette so
// the eye reads the title first, badges second.
const Chip: React.FC<{ children: React.ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }> = ({ children, tone = 'neutral' }) => {
  const cls = tone === 'success' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
    : tone === 'warning' ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
    : tone === 'danger' ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400'
    : tone === 'info' ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400'
    : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400';
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium ${cls} max-w-[120px] truncate`}>{children}</span>;
};

const Avatar: React.FC<{ name?: string | null; src?: string | null; size?: number }> = ({ name, src, size = 18 }) => {
  if (src) return <img src={src} alt="" style={{ width: size, height: size }} className="rounded-full object-cover shrink-0" />;
  return (
    <span
      style={{ width: size, height: size, fontSize: Math.max(8, size * 0.45) }}
      className="rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 flex items-center justify-center font-semibold shrink-0"
    >
      {(name || '?')[0]?.toUpperCase()}
    </span>
  );
};

const StatRow: React.FC<{ label: string; value: React.ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' }> = ({ label, value, tone = 'neutral' }) => {
  const colorCls = tone === 'success' ? 'text-emerald-600 dark:text-emerald-400'
    : tone === 'warning' ? 'text-amber-600 dark:text-amber-400'
    : tone === 'danger' ? 'text-rose-600 dark:text-rose-400'
    : 'text-zinc-900 dark:text-zinc-100';
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-zinc-100 dark:border-zinc-800/60 last:border-0">
      <span className="text-[12.5px] text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className={`text-[15px] font-semibold tabular-nums ${colorCls}`}>{value}</span>
    </div>
  );
};

export const SelectedDatePanel: React.FC<SelectedDatePanelProps> = ({
  selectedDate,
  calendarMode,
  getDayEvents,
  getDayTasks,
  contentPlatforms,
  stats,
  filteredEventsCount,
  periodLabel,
  onEditEvent,
  onDeleteEvent,
  toggleTaskComplete,
  onOpenTaskDetail,
  getMemberName,
  getMemberAvatar,
  getProjectLabel,
  getClientLabel,
  getElapsedDays,
  tasks,
}) => {
  const dayEvents = getDayEvents(selectedDate);
  const dayTasks = getDayTasks(selectedDate);

  return (
    <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2">
        <Card className="overflow-hidden">
          {/* Day header — subtle, with date as the primary read. */}
          <div className="px-6 pt-5 pb-4 border-b border-zinc-100 dark:border-zinc-800/60">
            <h3 className="text-[18px] font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              {new Date(selectedDate).toLocaleDateString('en-US', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
              })}
            </h3>
            <div className="flex items-center gap-3 mt-1.5 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
              <span className="inline-flex items-center gap-1.5">
                <Icons.Calendar size={11} />
                {(calendarMode === 'content' ? 'Contents' : 'Events')} · {dayEvents.length}
              </span>
              {calendarMode === 'schedule' && (
                <>
                  <span className="text-zinc-300 dark:text-zinc-700">·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <Icons.Check size={11} />
                    Tasks · {dayTasks.length}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="px-2 py-2">

            {/* Events */}
            {dayEvents.length > 0 ? (
              <div className="px-1 py-1">
                <div className="px-3 pt-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400 dark:text-zinc-500">
                  {calendarMode === 'content' ? 'Contents' : 'Events'}
                </div>
                <div className="space-y-0.5">
                  {dayEvents.map((event) => (
                    <div
                      key={event.id}
                      onClick={() => onEditEvent?.(event)}
                      className="group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/40 cursor-pointer transition-colors"
                    >
                      <div className="w-1 h-9 rounded-full shrink-0" style={{ backgroundColor: event.color || '#3b82f6' }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">{event.title}</span>
                          {event.source === 'google' && <Chip tone="info">Google</Chip>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[10.5px] text-zinc-400 font-mono">
                          {event.start_time && <span>{event.start_time} · {event.duration || 60}m</span>}
                          {event.location && <span className="truncate">{event.location}</span>}
                        </div>
                      </div>
                      <span className="text-[10px] text-zinc-400 capitalize shrink-0 hidden sm:inline">
                        {event.type === 'content'
                          ? (contentPlatforms[event.location || '']?.label || 'content')
                          : event.type}
                      </span>
                      {event.source !== 'google' && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={(e) => { e.stopPropagation(); onEditEvent?.(event); }}
                            className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700">
                            <Icons.Edit size={11} />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); onDeleteEvent?.(event.id); }}
                            className="p-1 rounded text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10">
                            <Icons.Trash size={11} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="px-4 py-8 text-center text-[12px] text-zinc-400 dark:text-zinc-500">
                {calendarMode === 'content' ? 'No contents for this day' : 'No events for this day'}
              </div>
            )}

            {/* Day tasks */}
            {calendarMode === 'schedule' && dayTasks.length > 0 && (
              <div className="px-1 py-1 border-t border-zinc-100 dark:border-zinc-800/60 mt-1 pt-2">
                <div className="px-3 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400 dark:text-zinc-500">
                  Tasks
                </div>
                <div className="space-y-0.5">
                  {dayTasks.map((task) => {
                    const isDone = task.completed || task.status === 'done';
                    const isCancelled = task.status === 'cancelled';
                    const memberName = task.assignee_id ? getMemberName(task.assignee_id) : null;
                    const memberAvatar = task.assignee_id ? getMemberAvatar(task.assignee_id) : null;
                    const project = getProjectLabel(task);
                    const client = getClientLabel(task);
                    const elapsed = isDone ? getElapsedDays(task) : null;
                    return (
                      <div
                        key={task.id}
                        onClick={() => onOpenTaskDetail(task)}
                        className={`group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/40 cursor-pointer transition-colors ${
                          isCancelled ? 'opacity-50' : ''
                        }`}
                      >
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleTaskComplete(task.id, !task.completed); }}
                          className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-all ${
                            isDone
                              ? 'bg-emerald-500 border-emerald-500'
                              : 'border-zinc-300 dark:border-zinc-600 hover:border-emerald-400'
                          }`}
                        >
                          {isDone && <Icons.Check size={10} className="text-white" />}
                        </button>

                        <PriorityDot priority={task.priority} />

                        <div className="flex-1 min-w-0">
                          <div className={`text-[13px] truncate ${
                            isDone ? 'text-zinc-400 dark:text-zinc-500 line-through' : 'font-medium text-zinc-800 dark:text-zinc-100'
                          }`}>
                            {task.title}
                          </div>
                          {task.description && (
                            <div className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">
                              {task.description}
                            </div>
                          )}
                        </div>

                        {/* Right-side meta — kept compact, hover reveals more */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {memberName && (
                            <span title={memberName} className="hidden sm:inline-flex">
                              <Avatar name={memberName} src={memberAvatar} size={18} />
                            </span>
                          )}
                          {project && project !== 'No project' && <Chip>{project}</Chip>}
                          {client && <Chip tone="success">{client}</Chip>}
                          {elapsed !== null && (
                            <Chip tone="success">{elapsed}d</Chip>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {calendarMode === 'schedule' && dayTasks.length === 0 && (
              <div className="px-4 py-6 text-center text-[12px] text-zinc-400 dark:text-zinc-500">
                No tasks for this day
              </div>
            )}

          </div>
        </Card>
      </div>

      {/* Right column — Summary + Upcoming */}
      <div className="space-y-5">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-zinc-100 dark:border-zinc-800/60">
            <h3 className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Summary</h3>
            {periodLabel && (
              <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.08em]">{periodLabel}</span>
            )}
          </div>
          <div className="px-5">
            <StatRow label={calendarMode === 'content' ? 'Total contents' : 'Total events'}
              value={calendarMode === 'content' ? filteredEventsCount : stats.totalEvents} />
            {calendarMode === 'schedule' && (
              <>
                <StatRow label="Total tasks" value={stats.totalTasks} />
                <StatRow label="Completed" value={stats.completedTasks} tone="success" />
                <StatRow label="Pending" value={stats.pendingTasks} tone="warning" />
                {stats.overdueTasks > 0 && <StatRow label="Overdue" value={stats.overdueTasks} tone="danger" />}
              </>
            )}
          </div>
          {calendarMode === 'schedule' && (
            <div className="px-5 pt-4 pb-5 mt-1 border-t border-zinc-100 dark:border-zinc-800/60">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400 dark:text-zinc-500">Progress</span>
                <span className="text-[18px] font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">{stats.completionRate}%</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-500"
                  style={{ width: `${stats.completionRate}%` }}
                />
              </div>
            </div>
          )}
        </Card>

        {/* Upcoming tasks */}
        {calendarMode === 'schedule' && (
          <Card className="overflow-hidden">
            <div className="px-5 pt-5 pb-3 border-b border-zinc-100 dark:border-zinc-800/60">
              <h3 className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Upcoming</h3>
            </div>
            <div className="px-2 py-2">
              {(() => {
                const upcoming = tasks
                  .filter(t => !t.completed && t.start_date)
                  .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''))
                  .slice(0, 5);
                if (upcoming.length === 0) {
                  return (
                    <div className="px-3 py-6 text-center text-[12px] text-zinc-400 dark:text-zinc-500">No pending tasks</div>
                  );
                }
                return (
                  <div className="space-y-0.5">
                    {upcoming.map(task => {
                      const project = getProjectLabel(task);
                      return (
                        <div
                          key={task.id}
                          onClick={() => onOpenTaskDetail(task)}
                          className="group flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/40 cursor-pointer transition-colors"
                        >
                          <PriorityDot priority={task.priority} />
                          <div className="flex-1 min-w-0">
                            <div className="text-[12.5px] font-medium text-zinc-800 dark:text-zinc-100 truncate">{task.title}</div>
                            <div className="text-[10px] text-zinc-400 font-mono mt-0.5">
                              {task.start_date && new Date(task.start_date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                              {project && project !== 'No project' && <span> · {project}</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};
