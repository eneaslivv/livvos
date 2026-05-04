import React from 'react';
import { Icons } from '../ui/Icons';
import { ToggleGroup } from './ToggleGroup';

interface ContentPlatformConfig {
  label: string;
  color: string;
}

export interface CalendarHeaderProps {
  calendarMode: 'schedule' | 'content';
  setCalendarMode: (mode: 'schedule' | 'content') => void;
  view: 'day' | 'week' | 'month' | 'board' | 'list';
  setView: (view: 'day' | 'week' | 'month' | 'board' | 'list') => void;
  stats: { totalEvents: number; totalTasks: number; completedTasks: number };
  filteredEventsCount: number;
  navigateCalendar: (direction: -1 | 1) => void;
  goToToday: () => void;
  periodLabel: string;
  onNewEvent: () => void;
  onNewTask: () => void;
  // Platform filter
  contentPlatforms: Record<string, ContentPlatformConfig>;
  selectedPlatforms: string[];
  setSelectedPlatforms: React.Dispatch<React.SetStateAction<string[]>>;
  platformDropdownOpen: boolean;
  setPlatformDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  platformDropdownRef: React.RefObject<HTMLDivElement>;
  // Google Calendar
  googleConnected: boolean;
  googleSyncing: boolean;
  syncGoogle: () => Promise<void>;
  showGoogleSettings: boolean;
  setShowGoogleSettings: React.Dispatch<React.SetStateAction<boolean>>;
  // Timezones
  showTimezones?: boolean;
  onToggleTimezones?: () => void;
  hasClientTimezones?: boolean;
}

export const CalendarHeader: React.FC<CalendarHeaderProps> = ({
  calendarMode,
  setCalendarMode,
  view,
  setView,
  stats,
  filteredEventsCount,
  navigateCalendar,
  goToToday,
  periodLabel,
  onNewEvent,
  onNewTask,
  contentPlatforms,
  selectedPlatforms,
  setSelectedPlatforms,
  platformDropdownOpen,
  setPlatformDropdownOpen,
  platformDropdownRef,
  googleConnected,
  googleSyncing,
  syncGoogle,
  setShowGoogleSettings,
  showTimezones,
  onToggleTimezones,
  hasClientTimezones,
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
      <div className="shrink-0">
        <h1 className="text-[18px] sm:text-[20px] font-semibold text-zinc-900 dark:text-zinc-50 leading-tight">Calendar</h1>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 tabular-nums">
          {calendarMode === 'content'
            ? `${filteredEventsCount} contents`
            : `${stats.totalEvents} events · ${stats.totalTasks} tasks · ${stats.completedTasks} done`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Mode toggle: Schedule / Content */}
        <ToggleGroup
          options={[
            { id: 'schedule' as const, label: 'Schedule', icon: Icons.Calendar },
            { id: 'content' as const, label: 'Content', icon: Icons.Layers },
          ]}
          value={calendarMode}
          onChange={setCalendarMode}
        />

        {/* Platform filter dropdown (content mode) */}
        {calendarMode === 'content' && (
          <div ref={platformDropdownRef as React.RefObject<HTMLDivElement>} className="relative">
            <button
              onClick={() => setPlatformDropdownOpen(prev => !prev)}
              className="flex items-center gap-1.5 px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <Icons.Filter size={13} />
              Networks
              {selectedPlatforms.length < Object.keys(contentPlatforms).length && (
                <span className="ml-0.5 w-4 h-4 flex items-center justify-center rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[9px] font-bold">
                  {selectedPlatforms.length}
                </span>
              )}
            </button>
            {platformDropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 z-50 w-52 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg py-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                {/* Select all / none */}
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-100 dark:border-zinc-800 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Platforms</span>
                  <button
                    onClick={() => setSelectedPlatforms(prev =>
                      prev.length === Object.keys(contentPlatforms).length ? [] : Object.keys(contentPlatforms)
                    )}
                    className="text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {selectedPlatforms.length === Object.keys(contentPlatforms).length ? 'None' : 'All'}
                  </button>
                </div>
                {Object.entries(contentPlatforms).map(([key, plat]) => {
                  const isSelected = selectedPlatforms.includes(key);
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedPlatforms(prev =>
                        prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
                      )}
                      className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <div
                        className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-colors ${
                          isSelected
                            ? 'border-transparent'
                            : 'border-zinc-300 dark:border-zinc-600'
                        }`}
                        style={isSelected ? { backgroundColor: plat.color } : undefined}
                      >
                        {isSelected && (
                          <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        )}
                      </div>
                      <span className={`font-medium ${isSelected ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400'}`}>
                        {plat.label}
                      </span>
                      <div className="ml-auto w-2 h-2 rounded-full" style={{ backgroundColor: plat.color }} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* View toggle: Day / Week / Month / Board / List — extra modes
            give a Notion/ClickUp-style way to look at the same data. */}
        <ToggleGroup
          options={[
            { id: 'day' as const, label: 'Day' },
            { id: 'week' as const, label: 'Week' },
            { id: 'month' as const, label: 'Month' },
            { id: 'board' as const, label: 'Board' },
            { id: 'list' as const, label: 'List' },
          ]}
          value={view}
          onChange={setView}
        />

        {/* Navigation */}
        <div className="flex items-center gap-0.5">
          <button onClick={() => navigateCalendar(-1)} className="p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors">
            <Icons.ChevronLeft size={14} />
          </button>
          <button onClick={goToToday} className="px-2 py-0.5 text-[11px] font-medium rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors">
            Today
          </button>
          <button onClick={() => navigateCalendar(1)} className="p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors">
            <Icons.ChevronRight size={14} />
          </button>
          <span className="text-[11px] text-zinc-600 dark:text-zinc-300 ml-1.5 min-w-[120px] tabular-nums">{periodLabel}</span>
        </div>

        {/* Action buttons */}
        <button
          onClick={onNewEvent}
          className="flex items-center gap-1 px-2.5 py-1 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md text-[11px] font-medium hover:opacity-90 transition-opacity"
        >
          <Icons.Plus size={11} strokeWidth={2.5} />
          {calendarMode === 'content' ? 'Content' : 'Event'}
        </button>
        {calendarMode === 'schedule' && (
          <button
            onClick={onNewTask}
            className="flex items-center gap-1 px-2.5 py-1 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md text-[11px] font-medium transition-colors"
          >
            <Icons.Check size={11} strokeWidth={2.5} />
            Task
          </button>
        )}

        {/* Google Calendar sync controls */}
        {googleConnected && (
          <button
            onClick={() => syncGoogle().catch(() => {})}
            disabled={googleSyncing}
            className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
            title="Sync Google Calendar"
          >
            <Icons.RefreshCw size={13} className={googleSyncing ? 'animate-spin' : ''} />
          </button>
        )}
        {onToggleTimezones && hasClientTimezones && (
          <button
            onClick={onToggleTimezones}
            className={`p-1 rounded-md transition-colors ${
              showTimezones
                ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'
                : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
            title="Toggle client timezones"
          >
            <Icons.Globe size={13} />
          </button>
        )}
        <button
          onClick={() => setShowGoogleSettings(prev => !prev)}
          className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
          title="Calendar integrations"
        >
          <Icons.Settings size={13} />
        </button>
      </div>
    </div>
  );
};
