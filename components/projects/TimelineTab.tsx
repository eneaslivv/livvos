import React from 'react';
import { motion } from 'framer-motion';
import { Icons } from '../ui/Icons';
import { Project } from '../../context/ProjectsContext';
import { TeamMember } from '../../context/TeamContext';

export interface TimelineTabProps {
  project: Project;
  derivedTasksGroups: { name: string; tasks: any[] }[];
  members: TeamMember[];
  // Phase management
  newGroupName: string;
  onNewGroupNameChange: (val: string) => void;
  timelineNewStart: string;
  onTimelineNewStartChange: (val: string) => void;
  timelineNewEnd: string;
  onTimelineNewEndChange: (val: string) => void;
  onAddPhaseWithDates: () => void;
  onUpdatePhaseDate: (phaseName: string, field: 'startDate' | 'endDate', value: string) => void;
  onDeletePhase: (phaseName: string) => void;
  // Task handlers
  onToggleTask: (groupIdx: number, taskId: string) => void;
  onAddTask: (groupIdx: number) => void;
  newTaskTitle: Record<number, string>;
  onNewTaskTitleChange: (val: Record<number, string>) => void;
}

export const TimelineTab: React.FC<TimelineTabProps> = ({
  project,
  derivedTasksGroups,
  members,
  newGroupName,
  onNewGroupNameChange,
  timelineNewStart,
  onTimelineNewStartChange,
  timelineNewEnd,
  onTimelineNewEndChange,
  onAddPhaseWithDates,
  onUpdatePhaseDate,
  onDeletePhase,
  onToggleTask,
  onAddTask,
  newTaskTitle,
  onNewTaskTitleChange,
}) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Collect all dates for chart range
  const allDates: Date[] = [today];
  for (const g of derivedTasksGroups) {
    const grp = project.tasksGroups.find(tg => tg.name === g.name);
    if (grp?.startDate) allDates.push(new Date(grp.startDate));
    if (grp?.endDate) allDates.push(new Date(grp.endDate));
    for (const t of g.tasks) {
      if (t.dueDate) allDates.push(new Date(t.dueDate));
    }
  }
  if (project.deadline) allDates.push(new Date(project.deadline));

  const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
  const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
  minDate.setDate(minDate.getDate() - 7);
  maxDate.setDate(maxDate.getDate() + 14);
  const totalDays = Math.max(1, Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)));
  const dayToPercent = (d: Date) => Math.max(0, Math.min(100, ((d.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24) / totalDays) * 100));

  // Generate month markers
  const months: { label: string; left: number }[] = [];
  const cursor = new Date(minDate);
  cursor.setDate(1);
  if (cursor < minDate) cursor.setMonth(cursor.getMonth() + 1);
  while (cursor <= maxDate) {
    months.push({
      label: cursor.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      left: dayToPercent(cursor),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return (
    <div className="space-y-6">
      {/* Gantt Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Project Timeline</h3>
        <div className="flex items-center gap-3 text-[10px] text-zinc-400">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Completed</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" /> In Progress</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-600" /> Upcoming</span>
        </div>
      </div>

      {/* Gantt Chart */}
      {derivedTasksGroups.length > 0 && (
        <div className="bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
          {/* Month headers */}
          <div className="relative h-8 border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            {months.map((m, i) => (
              <div key={i} className="absolute top-0 h-full flex items-center text-[10px] font-semibold text-zinc-400 uppercase tracking-wider" style={{ left: `${m.left}%` }}>
                <div className="pl-2 border-l border-zinc-200 dark:border-zinc-700 h-full flex items-center">{m.label}</div>
              </div>
            ))}
            {/* Today marker */}
            <div className="absolute top-0 h-full w-px bg-rose-400" style={{ left: `${dayToPercent(today)}%` }}>
              <div className="absolute -top-0 -translate-x-1/2 px-1 py-0 text-[9px] font-bold text-rose-500 bg-rose-50 dark:bg-rose-500/10 rounded-b">TODAY</div>
            </div>
          </div>

          {/* Phase bars */}
          {derivedTasksGroups.map((group: any, gIdx: number) => {
            const grp = project.tasksGroups.find(tg => tg.name === group.name);
            const total = group.tasks.length;
            const done = group.tasks.filter((t: any) => t.done).length;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;

            const phaseStart = grp?.startDate ? new Date(grp.startDate) : null;
            const phaseEnd = grp?.endDate ? new Date(grp.endDate) : null;
            const hasDateRange = phaseStart && phaseEnd;

            const barLeft = hasDateRange ? dayToPercent(phaseStart) : 0;
            const barWidth = hasDateRange ? Math.max(2, dayToPercent(phaseEnd) - barLeft) : 0;
            const barColor = pct === 100 ? 'bg-emerald-400/80 dark:bg-emerald-500/60' : pct > 0 ? 'bg-blue-400/80 dark:bg-blue-500/60' : 'bg-zinc-300/80 dark:bg-zinc-600/60';

            return (
              <div key={gIdx} className="relative h-10 border-b border-zinc-100 dark:border-zinc-800 last:border-b-0 hover:bg-white/60 dark:hover:bg-zinc-900/40 transition-colors group">
                {/* Phase label */}
                <div className="absolute left-2 top-0 h-full flex items-center gap-2 z-10 pointer-events-none">
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 truncate max-w-[140px]">{group.name}</span>
                  <span className="text-[10px] font-mono text-zinc-400 tabular-nums">{done}/{total}</span>
                </div>
                {/* Bar */}
                {hasDateRange && (
                  <div
                    className={`absolute top-2 h-6 rounded-md ${barColor} transition-all`}
                    style={{ left: `${barLeft}%`, width: `${barWidth}%`, minWidth: '24px' }}
                  >
                    <div className={`h-full rounded-md ${pct === 100 ? 'bg-emerald-500' : 'bg-blue-500'} opacity-60`} style={{ width: `${pct}%` }} />
                  </div>
                )}
                {/* Today line extends through rows */}
                <div className="absolute top-0 h-full w-px bg-rose-400/30" style={{ left: `${dayToPercent(today)}%` }} />
              </div>
            );
          })}
        </div>
      )}

      {/* Add Phase */}
      <div className="bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800 p-5">
        <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 mb-3">Add Phase</h4>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Name</label>
            <input
              value={newGroupName}
              onChange={e => onNewGroupNameChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onAddPhaseWithDates()}
              placeholder="e.g. Discovery, Design, Development..."
              className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Start</label>
            <input
              type="date"
              value={timelineNewStart}
              onChange={e => onTimelineNewStartChange(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">End</label>
            <input
              type="date"
              value={timelineNewEnd}
              onChange={e => onTimelineNewEndChange(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600"
            />
          </div>
          <button
            onClick={onAddPhaseWithDates}
            disabled={!newGroupName.trim()}
            className="px-4 py-2 text-sm font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-40"
          >
            Add Phase
          </button>
        </div>
      </div>

      {/* Phase Details */}
      {derivedTasksGroups.map((group: any, gIdx: number) => {
        const grp = project.tasksGroups.find(tg => tg.name === group.name);
        const total = group.tasks.length;
        const done = group.tasks.filter((t: any) => t.done).length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;

        return (
          <div key={gIdx} className="bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${pct === 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-blue-500' : 'bg-zinc-300 dark:bg-zinc-600'}`} />
                <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{group.name}</h4>
                <span className="text-[10px] font-mono text-zinc-400 tabular-nums">{done}/{total}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={grp?.startDate || ''}
                  onChange={e => onUpdatePhaseDate(group.name, 'startDate', e.target.value)}
                  className="px-2 py-1 text-[11px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-300"
                  title="Start date"
                />
                <span className="text-zinc-300 dark:text-zinc-600">{'\u2192'}</span>
                <input
                  type="date"
                  value={grp?.endDate || ''}
                  onChange={e => onUpdatePhaseDate(group.name, 'endDate', e.target.value)}
                  className="px-2 py-1 text-[11px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md focus:outline-none focus:ring-1 focus:ring-zinc-300"
                  title="End date"
                />
                <button
                  onClick={() => onDeletePhase(group.name)}
                  className="ml-2 p-1 text-zinc-300 hover:text-red-500 dark:text-zinc-600 dark:hover:text-red-400 transition-colors"
                  title="Delete phase"
                >
                  <Icons.Trash size={14} />
                </button>
              </div>
            </div>
            {/* Progress bar */}
            <div className="px-5 py-2 border-b border-zinc-100 dark:border-zinc-800">
              <div className="w-full bg-zinc-200/60 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
              </div>
            </div>
            {/* Tasks */}
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {group.tasks.map((task: any) => (
                <div key={task.id} className="px-5 py-2.5 flex items-center justify-between hover:bg-white dark:hover:bg-zinc-900/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={task.done}
                      onChange={() => onToggleTask(gIdx, task.id)}
                      className="rounded border-zinc-300 dark:border-zinc-600 text-zinc-900 dark:text-zinc-100 focus:ring-zinc-400"
                    />
                    <span className={`text-sm ${task.done ? 'line-through text-zinc-400' : 'text-zinc-800 dark:text-zinc-200'}`}>
                      {task.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {task.dueDate && (
                      <span className="text-[10px] text-zinc-400 font-mono bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                        {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                    <div className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-500 overflow-hidden">
                      {(() => {
                        const assignee = members.find(m => m.id === task.assignee);
                        if (assignee?.avatar_url) return <img src={assignee.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />;
                        return (assignee?.name || '?').substring(0, 2).toUpperCase();
                      })()}
                    </div>
                  </div>
                </div>
              ))}
              {/* Add task inline */}
              <div className="px-5 py-2.5 flex items-center gap-2">
                <input
                  value={newTaskTitle[gIdx] ?? ''}
                  onChange={e => onNewTaskTitleChange({ ...newTaskTitle, [gIdx]: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && onAddTask(gIdx)}
                  placeholder="Add task..."
                  className="flex-1 px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600"
                />
                <button onClick={() => onAddTask(gIdx)} className="px-3 py-1.5 text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg">Add</button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Empty state */}
      {derivedTasksGroups.length === 0 && (
        <div className="text-center py-12">
          <div className="text-zinc-300 dark:text-zinc-600 mb-3"><Icons.Clock size={36} className="mx-auto" /></div>
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">No phases defined yet</p>
          <p className="text-xs text-zinc-400">Create your first phase above to start building the project timeline.</p>
        </div>
      )}
    </div>
  );
};
