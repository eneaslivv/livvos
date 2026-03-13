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

export const SelectedDatePanel: React.FC<SelectedDatePanelProps> = ({
  selectedDate,
  calendarMode,
  getDayEvents,
  getDayTasks,
  contentPlatforms,
  stats,
  filteredEventsCount,
  periodLabel,
  toggleTaskComplete,
  onOpenTaskDetail,
  getMemberName,
  getMemberAvatar,
  getProjectLabel,
  getClientLabel,
  getElapsedDays,
  tasks,
}) => {
  return (
    <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
            {new Date(selectedDate).toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </h3>

          <div className="space-y-6">
            {/* Day events */}
            <div>
              <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
                <Icons.CalendarDays size={16} />
                {calendarMode === 'content' ? `Contents (${getDayEvents(selectedDate).length})` : `Events (${getDayEvents(selectedDate).length})`}
              </h4>
              <div className="space-y-2">
                {getDayEvents(selectedDate).length > 0 ? (
                  getDayEvents(selectedDate).map((event) => (
                    <div
                      key={event.id}
                      className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg"
                    >
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: event.color || '#3b82f6' }}
                      />
                      <div className="flex-1">
                        <div className="font-medium text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                          {event.title}
                          {event.source === 'google' && (
                            <span className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 px-1.5 py-0.5 rounded-full flex-shrink-0">
                              Google
                            </span>
                          )}
                        </div>
                        {event.start_time && (
                          <div className="text-sm text-zinc-500 dark:text-zinc-400">
                            {event.start_time} - {event.duration || 60} min
                          </div>
                        )}
                        {event.location && (
                          <div className="text-sm text-zinc-500 dark:text-zinc-400">
                            {'\uD83D\uDCCD'} {event.location}
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-zinc-400 dark:text-zinc-500 capitalize">
                        {event.type === 'content'
                          ? (contentPlatforms[event.location || '']?.label || event.location || 'content')
                          : event.type}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-zinc-500 dark:text-zinc-400">
                    {calendarMode === 'content' ? 'No contents for this day' : 'No events for this day'}
                  </div>
                )}
              </div>
            </div>

            {/* Day tasks */}
            {calendarMode === 'schedule' && (
              <div>
                <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
                  <Icons.Check size={16} />
                  Tasks ({getDayTasks(selectedDate).length})
                </h4>
                <div className="space-y-2">
                  {getDayTasks(selectedDate).length > 0 ? (
                    getDayTasks(selectedDate).map((task) => (
                      <div
                        key={task.id}
                        className={`flex items-center gap-3 p-3 rounded-lg group cursor-pointer transition-colors ${
                          task.completed || task.status === 'done'
                            ? 'bg-emerald-50/60 dark:bg-emerald-900/10 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/20'
                            : task.status === 'cancelled'
                            ? 'bg-red-50/40 dark:bg-red-900/10 hover:bg-red-50/60 dark:hover:bg-red-900/15 opacity-60'
                            : task.priority === 'urgent'
                            ? 'bg-red-50/50 dark:bg-red-900/10 hover:bg-red-50/70 dark:hover:bg-red-900/15'
                            : task.priority === 'high'
                            ? 'bg-amber-50/50 dark:bg-amber-900/10 hover:bg-amber-50/70 dark:hover:bg-amber-900/15'
                            : task.priority === 'low'
                            ? 'bg-emerald-50/40 dark:bg-emerald-900/10 hover:bg-emerald-50/60 dark:hover:bg-emerald-900/15'
                            : 'bg-blue-50/40 dark:bg-blue-900/10 hover:bg-blue-50/60 dark:hover:bg-blue-900/15'
                        } ${task.status === 'in-progress' ? 'border-l-[3px] border-l-indigo-500' : ''}`}
                        onClick={() => onOpenTaskDetail(task)}
                      >
                        <input
                          type="checkbox"
                          checked={task.completed}
                          onChange={(e) => toggleTaskComplete(task.id, e.target.checked)}
                          className="rounded border-zinc-300"
                        />
                        <div className="flex-1">
                          <div className={`font-medium ${
                            task.completed
                              ? 'text-zinc-500 dark:text-zinc-400 line-through'
                              : 'text-zinc-900 dark:text-zinc-100'
                          }`}>
                            {task.title}
                          </div>
                          {task.description && (
                            <div className="text-sm text-zinc-500 dark:text-zinc-400">
                              {task.description}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {task.assignee_id && (
                            <div className="flex items-center gap-1" title={getMemberName(task.assignee_id) || ''}>
                              {getMemberAvatar(task.assignee_id) ? (
                                <img src={getMemberAvatar(task.assignee_id)!} alt="" className="w-5 h-5 rounded-full" />
                              ) : (
                                <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-[9px] font-bold text-blue-700 dark:text-blue-300">
                                  {(getMemberName(task.assignee_id) || '?')[0]?.toUpperCase()}
                                </div>
                              )}
                              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 hidden sm:inline">
                                {getMemberName(task.assignee_id)}
                              </span>
                            </div>
                          )}
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            task.priority === 'urgent' ? 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400' :
                            task.priority === 'high' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400' :
                            task.priority === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' :
                            'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                          }`}>
                            {task.priority}
                          </span>
                          <span className="text-[10px] text-zinc-500 dark:text-zinc-400 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5">
                            {getProjectLabel(task)}
                          </span>
                          {getClientLabel(task) && (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5">
                              {getClientLabel(task)}
                            </span>
                          )}
                          <span className={`text-[10px] font-medium capitalize px-2 py-0.5 rounded-full ${
                            task.status === 'done' || task.completed ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' :
                            task.status === 'in-progress' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400' :
                            task.status === 'cancelled' ? 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400' :
                            'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                          }`}>
                            {task.completed ? 'done' : task.status}
                          </span>
                          {task.completed && getElapsedDays(task) !== null && (
                            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full">
                              {getElapsedDays(task)}d
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-zinc-500 dark:text-zinc-400">
                      No tasks for this day
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Stats panel */}
      <div className="space-y-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Summary</h3>
            {periodLabel && (
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">{periodLabel}</span>
            )}
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                {calendarMode === 'content' ? 'Total contents' : 'Total events'}
              </span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {calendarMode === 'content' ? filteredEventsCount : stats.totalEvents}
              </span>
            </div>
            {calendarMode === 'schedule' && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">Total tasks</span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">{stats.totalTasks}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">Completed</span>
                  <span className="font-semibold text-green-600 dark:text-green-400">{stats.completedTasks}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">Pending</span>
                  <span className="font-semibold text-orange-600 dark:text-orange-400">{stats.pendingTasks}</span>
                </div>
                {stats.overdueTasks > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">Overdue</span>
                    <span className="font-semibold text-red-600 dark:text-red-400">{stats.overdueTasks}</span>
                  </div>
                )}
                <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">Progress</span>
                    <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{stats.completionRate}%</span>
                  </div>
                  <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${stats.completionRate}%` }}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </Card>

        {/* Upcoming tasks */}
        {calendarMode === 'schedule' && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Upcoming tasks</h3>
            <div className="space-y-3">
              {tasks
                .filter(task => !task.completed && task.start_date)
                .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''))
                .slice(0, 5)
                .map((task) => (
                  <div key={task.id} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={(e) => toggleTaskComplete(task.id, e.target.checked)}
                      className="rounded border-zinc-300"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {task.title}
                      </div>
                      {task.start_date && (
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">
                          {new Date(task.start_date).toLocaleDateString('en-US')}
                        </div>
                      )}
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      task.priority === 'urgent' ? 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400' :
                      task.priority === 'high' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400' :
                      task.priority === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' :
                      'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                    }`}>
                      {task.priority}
                    </span>
                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5">
                      {getProjectLabel(task)}
                    </span>
                    {getClientLabel(task) && (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5">
                        {getClientLabel(task)}
                      </span>
                    )}
                  </div>
                ))}
              {tasks.filter(task => !task.completed && task.start_date).length === 0 && (
                <div className="text-center py-4 text-zinc-500 dark:text-zinc-400 text-sm">
                  No pending tasks
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};
