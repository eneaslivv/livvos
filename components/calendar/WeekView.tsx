import React, { useRef, useEffect, useState } from 'react';
import { Icons } from '../ui/Icons';
import { CalendarEvent, CalendarTask } from '../../hooks/useCalendar';
import { convertHourToTz, tzCity, tzNow } from '../../lib/timezone';

interface ContentPlatformConfig {
  label: string;
  color: string;
}

interface TaskColor {
  bg: string;
  border: string;
  text: string;
  dot: string;
}

export interface WeekViewProps {
  weekDays: Date[];
  hours: number[];
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  getDayEvents: (date: string) => (CalendarEvent & { content_status?: string })[];
  getDayTasks: (date: string) => CalendarTask[];
  getTaskColor: (task: CalendarTask) => TaskColor;
  getOverdueDays: (task: CalendarTask) => number;
  getElapsedDays: (task: CalendarTask) => number | null;
  isTaskBlocked: (task: CalendarTask) => boolean;
  getBlockerTask: (task: CalendarTask | null) => CalendarTask | null;
  getMemberName: (id?: string) => string | null;
  getMemberAvatar: (id?: string) => string | null;
  getClientLabel: (task: CalendarTask) => string | null;
  contentPlatforms: Record<string, ContentPlatformConfig>;
  // Drag and drop
  draggingTaskId: string | null;
  setDraggingTaskId: (id: string | null) => void;
  onTaskDragStart: (e: React.DragEvent, taskId: string) => void;
  onTaskDrop: (e: React.DragEvent, date: string, hour?: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  // Slot popover
  slotPopover: { date: string; hour: number } | null;
  onSlotClick: (e: React.MouseEvent, dateStr: string, hour: number) => void;
  // Task detail
  onOpenTaskDetail: (task: CalendarTask) => void;
  // Timezone
  activeTimezone?: string | null;
  clientTimezoneMap?: Record<string, string>;
  // Phase grouping
  groupTasksByPhase?: boolean;
  getDayTaskGroups?: (date: string) => { groupName: string; tasks: CalendarTask[]; completedCount: number; totalCount: number }[];
  getClientInfo?: (clientId: string) => { name: string; avatar: string | null; color: string | null } | null;
}

export const WeekView: React.FC<WeekViewProps> = ({
  weekDays,
  hours,
  selectedDate,
  setSelectedDate,
  getDayEvents,
  getDayTasks,
  getTaskColor,
  getOverdueDays,
  getElapsedDays,
  isTaskBlocked,
  getBlockerTask,
  getMemberName,
  getMemberAvatar,
  getClientLabel,
  contentPlatforms,
  draggingTaskId,
  setDraggingTaskId,
  onTaskDragStart,
  onTaskDrop,
  onDragOver,
  slotPopover,
  onSlotClick,
  onOpenTaskDetail,
  activeTimezone,
  clientTimezoneMap,
  groupTasksByPhase,
  getDayTaskGroups,
  getClientInfo,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const nowRowRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(new Date());
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null); // "date|groupName"

  // Reset expanded phase when week changes
  useEffect(() => {
    setExpandedPhase(null);
  }, [weekDays[0]?.toISOString()]);

  // Auto-scroll to current hour on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      if (nowRowRef.current && scrollRef.current) {
        const container = scrollRef.current;
        const row = nowRowRef.current;
        // Scroll so current hour is near the top with some padding
        container.scrollTop = row.offsetTop - 48;
      }
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  // Update "now" every minute for the indicator line
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const todayStr = now.toISOString().split('T')[0];
  const todayDayIndex = weekDays.findIndex(d => d.toISOString().split('T')[0] === todayStr);

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-x-auto min-w-0">
      <div className="min-w-[700px]">
      {/* Day headers */}
      <div className="grid grid-cols-8 border-b border-zinc-200 dark:border-zinc-800">
        <div className="p-4 border-r border-zinc-200 dark:border-zinc-800"></div>
        {weekDays.map((day, index) => {
          const dateStr = day.toISOString().split('T')[0];
          const isToday = dateStr === new Date().toISOString().split('T')[0];
          const isSelected = dateStr === selectedDate;

          return (
            <div
              key={index}
              onClick={() => setSelectedDate(dateStr)}
              className={`p-4 text-center cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-b-2 border-blue-500'
                  : isToday
                  ? 'bg-zinc-50 dark:bg-zinc-800'
                  : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'
              }`}
            >
              <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                {day.toLocaleDateString('en-US', { weekday: 'short' })}
              </div>
              <div className={`text-lg font-semibold ${
                isToday ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-700 dark:text-zinc-300'
              }`}>
                {day.getDate()}
              </div>
              {getDayTasks(dateStr).length > 0 && (
                <div className="flex items-center justify-center gap-0.5 mt-1">
                  {getDayTasks(dateStr).slice(0, 5).map(t => (
                    <span key={t.id} className={`w-1.5 h-1.5 rounded-full ${getTaskColor(t).dot}`} />
                  ))}
                  {getDayTasks(dateStr).length > 5 && (
                    <span className="text-[8px] text-zinc-400 ml-0.5">+{getDayTasks(dateStr).length - 5}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* All-day / unscheduled tasks row */}
      <div className="grid grid-cols-8 border-b-2 border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-950/30">
        <div className="p-2 text-[10px] text-zinc-400 text-right border-r border-zinc-200 dark:border-zinc-800 flex items-start justify-end pt-3">
          Tasks
        </div>
        {weekDays.map((day, dayIndex) => {
          const dateStr = day.toISOString().split('T')[0];
          const unscheduledTasks = getDayTasks(dateStr).filter(t => !t.start_time);
          const phaseGroups = groupTasksByPhase && getDayTaskGroups ? getDayTaskGroups(dateStr) : null;
          return (
            <div
              key={dayIndex}
              className={`p-1.5 min-h-[44px] border-r border-zinc-100 dark:border-zinc-700 transition-colors ${
                draggingTaskId ? 'bg-blue-50/30 dark:bg-blue-900/5' : ''
              }`}
              onDragOver={onDragOver}
              onDrop={(e) => onTaskDrop(e, dateStr)}
            >
              {/* Grouped by phase */}
              {phaseGroups ? phaseGroups.map(group => {
                const phaseKey = `${dateStr}|${group.groupName}`;
                const isExpanded = expandedPhase === phaseKey;
                const pct = group.totalCount > 0 ? (group.completedCount / group.totalCount) * 100 : 0;
                return (
                  <div key={group.groupName} className="mb-0.5">
                    {/* Phase pill */}
                    <div
                      className="text-[10px] px-2 py-1 rounded-lg cursor-pointer border transition-all bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200/60 dark:border-indigo-700/40 hover:bg-indigo-100 dark:hover:bg-indigo-800/30"
                      onClick={() => setExpandedPhase(isExpanded ? null : phaseKey)}
                    >
                      <div className="font-medium flex items-center gap-1 text-indigo-700 dark:text-indigo-300 truncate">
                        {(() => {
                          const cid = group.tasks.find(t => t.client_id)?.client_id;
                          if (!cid || !getClientInfo) return null;
                          const info = getClientInfo(cid);
                          if (!info) return null;
                          if (info.avatar) {
                            return <img src={info.avatar} alt="" title={info.name} className="w-4 h-4 rounded-full object-contain shrink-0" />;
                          }
                          return (
                            <span
                              className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center text-[6px] font-bold bg-indigo-200 dark:bg-indigo-700 text-indigo-700 dark:text-indigo-200"
                              style={info.color ? { backgroundColor: info.color + '26', color: info.color } : undefined}
                              title={info.name}
                            >
                              {info.name.charAt(0).toUpperCase()}
                            </span>
                          );
                        })()}
                        <Icons.ChevronRight size={8} className={`shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        <span className="truncate">{group.groupName}</span>
                        <span className="ml-auto text-[8px] font-semibold shrink-0 tabular-nums">
                          {group.completedCount}/{group.totalCount}
                        </span>
                        <div className="w-8 h-1.5 bg-indigo-200 dark:bg-indigo-800 rounded-full overflow-hidden shrink-0">
                          <div
                            className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    {/* Expanded tasks */}
                    {isExpanded && (
                      <div className="mt-0.5 ml-1 border-l-2 border-indigo-200 dark:border-indigo-700/50 pl-1">
                        {group.tasks.map(task => {
                          const tc = getTaskColor(task);
                          return (
                            <div
                              key={task.id}
                              draggable
                              onDragStart={(e) => onTaskDragStart(e, task.id)}
                              onDragEnd={() => setDraggingTaskId(null)}
                              className={`text-[9px] px-1.5 py-0.5 rounded mb-px cursor-grab active:cursor-grabbing transition-all hover:bg-zinc-100 dark:hover:bg-zinc-800 ${task.completed ? 'opacity-60' : ''}`}
                              onClick={() => onOpenTaskDetail(task)}
                            >
                              <div className={`flex items-center gap-1 ${tc.text} truncate`}>
                                {task.completed ? (
                                  <Icons.CheckCircle size={7} className="text-emerald-500 shrink-0" />
                                ) : (
                                  <span className={`w-1 h-1 rounded-full ${tc.dot} shrink-0`} />
                                )}
                                <span className={`truncate ${task.completed ? 'line-through' : ''}`}>{task.title}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }) : (
              /* Flat individual tasks */
              unscheduledTasks.map(task => {
                const tc = getTaskColor(task);
                const overdue = getOverdueDays(task);
                return (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => onTaskDragStart(e, task.id)}
                    onDragEnd={() => setDraggingTaskId(null)}
                    className={`text-[10px] px-2 py-1 rounded-full mb-0.5 cursor-grab active:cursor-grabbing border transition-all duration-300 ${tc.bg} ${tc.border} ${task.status === 'in-progress' ? 'border-l-[3px]' : ''}`}
                    title={`${task.title}${isTaskBlocked(task) ? ' \u26A0 BLOCKED' : ''} [${task.priority}/${task.status}]${overdue > 0 ? ` \u2014 ${overdue}d overdue` : ''}`}
                    onClick={() => onOpenTaskDetail(task)}
                  >
                    <div className={`font-medium flex items-center gap-1 ${tc.text} truncate`}>
                      {task.completed ? (
                        <Icons.CheckCircle size={8} className="text-emerald-500 shrink-0" />
                      ) : isTaskBlocked(task) ? (
                        <Icons.Lock size={8} className="text-amber-500 shrink-0" />
                      ) : (
                        <span className={`w-1 h-1 rounded-full ${tc.dot} shrink-0`} />
                      )}
                      <span className={`truncate ${task.completed ? 'line-through' : ''}`}>{task.title}</span>
                      {overdue > 0 && (
                        <span className="ml-auto text-[8px] font-bold text-red-500 bg-red-50 dark:bg-red-500/10 px-1 rounded shrink-0">
                          +{overdue}d
                        </span>
                      )}
                      {task.completed && getElapsedDays(task) !== null && (
                        <span className="ml-auto text-[8px] font-semibold text-emerald-600 shrink-0">{getElapsedDays(task)}d</span>
                      )}
                      {!task.completed && !overdue && getClientLabel(task) && (
                        <span className="ml-auto text-[8px] font-medium text-violet-500 dark:text-violet-400 shrink-0 truncate max-w-[60px]" title={getClientLabel(task)!}>
                          {getClientLabel(task)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              }))}
            </div>
          );
        })}
      </div>

      {/* Calendar body (hours) */}
      <div ref={scrollRef} className="max-h-[420px] overflow-y-auto">
        {hours.map((hour) => (
          <div key={hour} ref={hour === currentHour ? nowRowRef : undefined} className="grid grid-cols-8 border-b border-zinc-100 dark:border-zinc-800 relative">
            <div className="p-2 text-xs text-zinc-500 dark:text-zinc-400 text-right border-r border-zinc-200 dark:border-zinc-800 relative">
              <div>{hour.toString().padStart(2, '0')}:00</div>
              {activeTimezone && (() => {
                const { time, dayOffset } = convertHourToTz(hour, activeTimezone);
                return (
                  <div className="text-[9px] text-blue-500 dark:text-blue-400 font-mono mt-0.5">
                    {time}{dayOffset !== 0 && <span className="text-[8px] text-blue-400/70"> {dayOffset > 0 ? '+' : ''}{dayOffset}d</span>}
                  </div>
                );
              })()}
            </div>
            {weekDays.map((day, dayIndex) => {
              const dateStr = day.toISOString().split('T')[0];
              const dayEvents = getDayEvents(dateStr).filter(e => {
                if (!e.start_time) return false;
                const eventHour = parseInt(e.start_time.split(':')[0]);
                return eventHour === hour;
              });
              const hourTasks = getDayTasks(dateStr).filter(t => {
                if (!t.start_time) return false;
                const taskHour = parseInt(t.start_time.split(':')[0]);
                return taskHour === hour;
              });

              const isSelected = slotPopover?.date === dateStr && slotPopover?.hour === hour;
              const isDragTarget = draggingTaskId !== null;

              return (
                <div
                  key={dayIndex}
                  className={`p-2 min-h-12 border-r border-zinc-100 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors relative cursor-pointer ${
                    isSelected ? 'ring-2 ring-inset ring-blue-500 bg-blue-500/10' : ''
                  } ${isDragTarget ? 'hover:bg-blue-50/50 dark:hover:bg-blue-900/10' : ''}`}
                  onDragOver={onDragOver}
                  onDrop={(e) => onTaskDrop(e, dateStr, hour)}
                  onClick={(e) => {
                    if (e.target !== e.currentTarget) return;
                    onSlotClick(e, dateStr, hour);
                  }}
                >
                  {dayEvents.map((event) => (
                    <div
                      key={event.id}
                      className="text-xs px-3 py-1.5 rounded-full mb-1 truncate cursor-pointer hover:opacity-80 transition-opacity"
                      style={{ backgroundColor: event.color || '#3b82f6', color: 'white' }}
                      title={event.title}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="font-medium flex items-center gap-1">
                        {event.source === 'google' && (
                          <span className="opacity-75 text-[10px] flex-shrink-0">G</span>
                        )}
                        {event.title}
                      </div>
                      {event.location && (
                        <div className="opacity-75">
                          {contentPlatforms[event.location]?.label || event.location}
                        </div>
                      )}
                    </div>
                  ))}
                  {hourTasks.map((task) => {
                    const tc = getTaskColor(task);
                    const overdue = getOverdueDays(task);
                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => onTaskDragStart(e, task.id)}
                        onDragEnd={() => setDraggingTaskId(null)}
                        className={`text-xs px-3 py-1.5 rounded-full mb-1 cursor-grab active:cursor-grabbing border transition-all duration-300 ${tc.bg} ${tc.border} ${
                          task.status === 'cancelled' ? 'opacity-50' : ''
                        } ${task.status === 'in-progress' ? 'border-l-[3px]' : ''}`}
                        title={`${task.title}${task.assignee_id ? ` \u2014 ${getMemberName(task.assignee_id)}` : ''}${getClientLabel(task) ? ` \u00B7 ${getClientLabel(task)}` : ''}${clientTimezoneMap && task.client_id && clientTimezoneMap[task.client_id] ? ` \u00B7 Client tz: ${tzCity(clientTimezoneMap[task.client_id])} (${tzNow(clientTimezoneMap[task.client_id])})` : ''}${isTaskBlocked(task) ? ` \u26A0 BLOCKED \u2014 waiting for: ${getBlockerTask(task)?.title || '?'}${getBlockerTask(task)?.assignee_id ? ` (${getMemberName(getBlockerTask(task)!.assignee_id)})` : ''}` : ''} [${task.priority}/${task.status}]${overdue > 0 ? ` \u2014 ${overdue}d overdue` : ''}`}
                        onClick={(e) => { e.stopPropagation(); onOpenTaskDetail(task); }}
                      >
                        <div className={`font-medium flex items-center gap-1 ${tc.text} truncate`}>
                          {task.completed ? (
                            <Icons.CheckCircle size={9} className="text-emerald-500 shrink-0" />
                          ) : isTaskBlocked(task) ? (
                            <Icons.Lock size={9} className="text-amber-500 shrink-0" />
                          ) : (
                            <span className={`w-1.5 h-1.5 rounded-full ${tc.dot} shrink-0`} />
                          )}
                          <span className={task.completed ? 'line-through' : ''}>{task.title}</span>
                          {overdue > 0 && (
                            <span className="text-[8px] font-bold text-red-500 bg-red-50 dark:bg-red-500/10 px-1 rounded shrink-0">
                              +{overdue}d
                            </span>
                          )}
                          {task.assignee_id && (
                            getMemberAvatar(task.assignee_id) ? (
                              <img src={getMemberAvatar(task.assignee_id)!} alt="" className="w-3.5 h-3.5 rounded-full shrink-0 ml-auto" />
                            ) : (
                              <div className="w-3.5 h-3.5 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-[7px] font-bold text-blue-700 dark:text-blue-300 shrink-0 ml-auto">
                                {(getMemberName(task.assignee_id) || '?')[0]?.toUpperCase()}
                            </div>
                          )
                        )}
                      </div>
                      {/* Blocked line + client tag */}
                      {(isTaskBlocked(task) || getClientLabel(task)) && (
                        <div className="flex items-center gap-1 mt-0.5 truncate">
                          {isTaskBlocked(task) && (() => {
                            const bl = getBlockerTask(task);
                            const blOwner = bl?.assignee_id ? getMemberName(bl.assignee_id) : null;
                            return (
                              <span className="text-[8px] text-amber-600 dark:text-amber-400 font-medium truncate">
                                {blOwner ? `Wait. ${blOwner}` : `Wait: ${bl?.title?.slice(0, 20) || '?'}`}
                              </span>
                            );
                          })()}
                          {getClientLabel(task) && (
                            <span className="text-[8px] text-emerald-600 dark:text-emerald-400 font-medium ml-auto truncate flex items-center gap-0.5">
                              {getClientLabel(task)}
                              {clientTimezoneMap && task.client_id && clientTimezoneMap[task.client_id] && task.start_time && (
                                <span className="text-[7px] text-blue-500 dark:text-blue-400 font-mono">
                                  {convertHourToTz(parseInt(task.start_time.split(':')[0]), clientTimezoneMap[task.client_id]).time}
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              );
            })}
            {/* Current time indicator */}
            {hour === currentHour && todayDayIndex >= 0 && (
              <div
                className="absolute left-0 right-0 pointer-events-none z-10"
                style={{ top: `${(currentMinute / 60) * 100}%` }}
              >
                <div className="flex items-center">
                  <div className="w-[calc(12.5%)] flex justify-end pr-1">
                    <span className="text-[9px] font-bold text-red-500 bg-red-50 dark:bg-red-500/10 px-1 rounded">
                      {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </span>
                  </div>
                  <div className="flex-1 h-[2px] bg-red-500 relative">
                    <div className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-red-500" />
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      </div>
    </div>
  );
};
