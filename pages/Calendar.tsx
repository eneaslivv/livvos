import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { motion } from 'framer-motion';
import { Icons } from '../components/ui/Icons';
import { Card } from '../components/ui/Card';
import { SlidePanel } from '../components/ui/SlidePanel';
import { useCalendar, CalendarEvent, CalendarTask } from '../hooks/useCalendar';
import { useAuth } from '../hooks/useAuth';
import { errorLogger } from '../lib/errorLogger';
import { useSupabase } from '../hooks/useSupabase';
import { TimeSlotPopover } from '../components/calendar/TimeSlotPopover';
import { GoogleCalendarSettings } from '../components/calendar/GoogleCalendarSettings';
import { useGoogleCalendar } from '../hooks/useGoogleCalendar';
import { useTeam } from '../context/TeamContext';
import { generateWeeklySummaryFromAI } from '../lib/ai';

/* ─── Animated Toggle Group ─── */
const ToggleGroup = <T extends string>({ options, value, onChange }: {
  options: { id: T; label: string; icon?: React.ElementType }[];
  value: T;
  onChange: (v: T) => void;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const activeBtn = container.querySelector(`[data-toggle="${value}"]`) as HTMLButtonElement;
    if (activeBtn) {
      setIndicator({ left: activeBtn.offsetLeft, width: activeBtn.offsetWidth });
    }
  }, [value]);

  return (
    <div ref={containerRef} className="relative flex items-center gap-0.5 p-1 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl">
      <motion.div
        className="absolute top-1 bottom-1 bg-white dark:bg-zinc-700 rounded-lg shadow-sm"
        initial={false}
        animate={{ left: indicator.left, width: indicator.width }}
        transition={{ type: 'tween', duration: 0.15, ease: 'easeOut' }}
      />
      {options.map(opt => {
        const Icon = opt.icon;
        const isActive = value === opt.id;
        return (
          <button
            key={opt.id}
            data-toggle={opt.id}
            onClick={() => onChange(opt.id)}
            className={`relative z-10 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors duration-200 ${
              isActive
                ? 'text-zinc-900 dark:text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
            }`}
          >
            {Icon && <Icon size={13} />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};

export const Calendar: React.FC = () => {
  const { user } = useAuth();
  const {
    events,
    tasks,
    loading,
    error,
    createEvent,
    updateEvent,
    deleteEvent,
    createTask,
    updateTask,
    deleteTask,
    getEventsByDate,
    getTasksByDate,
    getCalendarStats
  } = useCalendar();

  const { members: teamMembers } = useTeam();

  // Loading timeout
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const loadingStartRef2 = useRef(Date.now());
  useEffect(() => {
    if (loading) {
      const elapsed = Date.now() - loadingStartRef2.current;
      const remaining = Math.max(0, 5000 - elapsed);
      const timer = setTimeout(() => setLoadingTimedOut(true), remaining);
      return () => clearTimeout(timer);
    }
    loadingStartRef2.current = Date.now();
    setLoadingTimedOut(false);
  }, [loading]);

  // 'all' = ver todo, 'me' = solo mis tareas, uuid = miembro específico
  const [taskFilter, setTaskFilter] = useState<'all' | 'me' | string>('all');

  // Mapa rápido de miembros para resolver nombres/avatars
  const memberMap = teamMembers.reduce<Record<string, { name: string | null; avatar_url: string | null }>>((acc, m) => {
    acc[m.id] = { name: m.name, avatar_url: m.avatar_url };
    return acc;
  }, {});

  const getMemberName = (id?: string) => {
    if (!id) return null;
    if (id === user?.id) return 'Yo';
    return memberMap[id]?.name || 'Miembro';
  };

  const getMemberAvatar = (id?: string) => {
    if (!id) return null;
    return memberMap[id]?.avatar_url || null;
  };

  const { data: projectOptions } = useSupabase<{ id: string; title: string }>('projects', {
    enabled: true,
    subscribe: false,
    select: 'id,title'
  });

  const projectMap = projectOptions.reduce<Record<string, string>>((acc, project) => {
    acc[project.id] = project.title;
    return acc;
  }, {});

  const getProjectLabel = (task: CalendarTask) => {
    const projectId = (task as any).project_id || (task as any).projectId;
    if (!projectId) return 'No project';
    return projectMap[projectId] || 'Project';
  };

  // Google Calendar sync
  const {
    isConnected: googleConnected,
    syncing: googleSyncing,
    sync: syncGoogle,
  } = useGoogleCalendar();

  // Auto-sync Google Calendar on mount if connected
  const [googleAutoSynced, setGoogleAutoSynced] = useState(false);
  useEffect(() => {
    if (googleConnected && !googleAutoSynced) {
      setGoogleAutoSynced(true);
      syncGoogle().catch(() => {});
    }
  }, [googleConnected, googleAutoSynced, syncGoogle]);

  const [showGoogleSettings, setShowGoogleSettings] = useState(false);

  // AI Weekly Summary state
  const [aiSummary, setAiSummary] = useState<{ objectives: string[]; focus_tasks: string[]; recommendations: string[] } | null>(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSummaryError, setAiSummaryError] = useState<string | null>(null);
  const [aiSummaryExpanded, setAiSummaryExpanded] = useState(false);
  const [aiCustomPrompt, setAiCustomPrompt] = useState('');
  const [showAiPromptInput, setShowAiPromptInput] = useState(false);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'day' | 'week' | 'month'>('week');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [showNewEventForm, setShowNewEventForm] = useState(false);
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);
  const [calendarMode, setCalendarMode] = useState<'schedule' | 'content'>('schedule');
  
  const [newEventData, setNewEventData] = useState({
    title: '',
    description: '',
    start_date: '',
    start_time: '',
    duration: 60,
    type: 'meeting' as const,
    color: '#3b82f6',
    location: ''
  });

  const [newContentData, setNewContentData] = useState({
    title: '',
    description: '',
    start_date: '',
    start_time: '',
    duration: 60,
    platform: 'instagram',
    channel: 'feed',
    asset_type: 'post',
    status: 'draft'
  });

  const CONTENT_PLATFORMS: Record<string, { label: string; color: string }> = {
    instagram: { label: 'Instagram', color: '#E1306C' },
    tiktok: { label: 'TikTok', color: '#111827' },
    youtube: { label: 'YouTube', color: '#EF4444' },
    linkedin: { label: 'LinkedIn', color: '#0A66C2' },
    twitter: { label: 'X / Twitter', color: '#0F172A' },
    pinterest: { label: 'Pinterest', color: '#BD081C' },
    behance: { label: 'Behance', color: '#1E40AF' }
  };

  const CONTENT_STATUSES: Array<{ id: 'draft' | 'ready' | 'published'; label: string; color: string }> = [
    { id: 'draft', label: 'Draft', color: 'bg-zinc-200 text-zinc-700' },
    { id: 'ready', label: 'Ready', color: 'bg-amber-200 text-amber-800' },
    { id: 'published', label: 'Published', color: 'bg-emerald-200 text-emerald-800' }
  ];

  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(Object.keys(CONTENT_PLATFORMS));
  const [platformDropdownOpen, setPlatformDropdownOpen] = useState(false);
  const platformDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (calendarMode === 'content') {
      setSelectedPlatforms(Object.keys(CONTENT_PLATFORMS));
    }
  }, [calendarMode]);

  // Close platform dropdown on outside click
  useEffect(() => {
    if (!platformDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (platformDropdownRef.current && !platformDropdownRef.current.contains(e.target as Node)) {
        setPlatformDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [platformDropdownOpen]);

  // Click-to-create popover state
  const [slotPopover, setSlotPopover] = useState<{
    clickX: number;
    clickY: number;
    date: string;
    hour: number;
  } | null>(null);

  const [newTaskData, setNewTaskData] = useState({
    title: '',
    description: '',
    start_date: '',
    priority: 'medium' as const,
    status: 'todo' as const,
    duration: 60,
    project_id: '',
    assignee_id: ''
  });

  // Obtener semana actual
  const getWeekDays = () => {
    const today = new Date();
    const startOfWeek = new Date(today);
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Ajustar para que lunes sea el primer día
    startOfWeek.setDate(diff);
    
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      weekDays.push(date);
    }
    return weekDays;
  };

  const getMonthDays = () => {
    const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const startDay = start.getDay() === 0 ? 6 : start.getDay() - 1;
    const gridStart = new Date(start);
    gridStart.setDate(start.getDate() - startDay);

    const days: Date[] = [];
    for (let i = 0; i < 42; i += 1) {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + i);
      days.push(day);
    }
    return days;
  };

  // Formatear fecha para mostrar
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('es-ES', { 
      weekday: 'short', 
      day: 'numeric', 
      month: 'short' 
    });
  };

  // Obtener horas del día
  const getHours = () => {
    const hours = [];
    for (let i = 8; i <= 20; i++) {
      hours.push(i);
    }
    return hours;
  };

  // Crear evento
  const handleCreateEvent = async () => {
    if (!newEventData.title.trim()) return;

    try {
      await createEvent({
        ...newEventData,
        owner_id: user?.id || '',
        start_date: newEventData.start_date || selectedDate,
        all_day: !newEventData.start_time
      });

      setNewEventData({
        title: '',
        description: '',
        start_date: '',
        start_time: '',
        duration: 60,
        type: 'meeting',
        color: '#3b82f6',
        location: ''
      });
      setShowNewEventForm(false);
    } catch (err) {
      errorLogger.error('Error creando evento', err);
      // Mostrar mensaje de error al usuario
      alert('Error al crear evento: ' + (err as Error).message);
    }
  };

  const handleCreateContent = async () => {
    if (!newContentData.title.trim()) return;
    const platformConfig = CONTENT_PLATFORMS[newContentData.platform];
    try {
      await createEvent({
        title: newContentData.title,
        description: `[${platformConfig?.label || newContentData.platform}] ${newContentData.channel.toUpperCase()} · ${newContentData.asset_type}\n${newContentData.description}`,
        start_date: newContentData.start_date || selectedDate,
        start_time: newContentData.start_time || undefined,
        duration: newContentData.duration,
        type: 'content',
        color: platformConfig?.color || '#22c55e',
        location: newContentData.platform,
        content_status: newContentData.status as any,
        content_channel: newContentData.channel,
        content_asset_type: newContentData.asset_type,
        owner_id: user?.id || '',
        all_day: !newContentData.start_time
      });

      setNewContentData({
        title: '',
        description: '',
        start_date: '',
        start_time: '',
        duration: 60,
        platform: 'instagram',
        channel: 'feed',
        asset_type: 'post',
        status: 'draft'
      });
      setShowNewEventForm(false);
    } catch (err) {
      errorLogger.error('Error creando contenido', err);
      alert('Error al crear contenido: ' + (err as Error).message);
    }
  };

  // Crear tarea
  const handleCreateTask = async () => {
    if (!newTaskData.title.trim()) return;

    try {
      await createTask({
        ...newTaskData,
        owner_id: user?.id || '',
        start_date: newTaskData.start_date || selectedDate,
        project_id: newTaskData.project_id || undefined,
        assignee_id: newTaskData.assignee_id || undefined,
        completed: false,
        order_index: 0,
      } as any);

      setNewTaskData({
        title: '',
        description: '',
        start_date: '',
        priority: 'medium',
        status: 'todo',
        duration: 60,
        project_id: '',
        assignee_id: ''
      });
      setShowNewTaskForm(false);
    } catch (err) {
      errorLogger.error('Error creando tarea', err);
    }
  };

  // Alternar completado de tarea
  const toggleTaskComplete = async (taskId: string, completed: boolean) => {
    try {
      await updateTask(taskId, { completed });
    } catch (err) {
      errorLogger.error('Error actualizando tarea', err);
    }
  };

  // Handler para click-to-create desde time slot
  const handleSlotSelect = (type: 'event' | 'task' | 'block' | 'content') => {
    if (!slotPopover) return;
    const timeStr = `${slotPopover.hour.toString().padStart(2, '0')}:00`;
    const dateStr = slotPopover.date;

    if (type === 'content') {
      setNewContentData(prev => ({
        ...prev,
        start_date: dateStr,
        start_time: timeStr,
      }));
      setCalendarMode('content');
      setShowNewEventForm(true);
    } else if (type === 'event') {
      setNewEventData(prev => ({
        ...prev,
        start_date: dateStr,
        start_time: timeStr,
        type: 'meeting',
      }));
      setCalendarMode('schedule');
      setShowNewEventForm(true);
    } else if (type === 'task') {
      setNewTaskData(prev => ({
        ...prev,
        start_date: dateStr,
      }));
      setShowNewTaskForm(true);
    } else if (type === 'block') {
      setNewEventData(prev => ({
        ...prev,
        start_date: dateStr,
        start_time: timeStr,
        type: 'work-block',
        title: '',
        color: '#8b5cf6',
      }));
      setCalendarMode('schedule');
      setShowNewEventForm(true);
    }

    setSlotPopover(null);
  };

  // Obtener eventos y tareas para una fecha específica
  // Generate AI weekly summary
  const handleGenerateAiSummary = async (customExtra?: string) => {
    setAiSummaryLoading(true);
    setAiSummaryError(null);
    try {
      // Build context from current week events and tasks
      const weekDaysList = getWeekDays();
      const weekEvents: string[] = [];
      const weekTasks: string[] = [];

      weekDaysList.forEach(day => {
        const dayEvents = events.filter(e => e.start_date === day.dateStr);
        const dayTasks = getTasksByDate(day.dateStr);
        dayEvents.forEach(e => weekEvents.push(`${day.dateStr}: ${e.title} (${e.type})`));
        dayTasks.forEach(t => weekTasks.push(`${day.dateStr}: ${t.title} [${t.priority}] ${t.completed ? '(completada)' : '(pendiente)'}`));
      });

      const contextParts = [
        `Semana del ${weekDaysList[0]?.dateStr || ''} al ${weekDaysList[6]?.dateStr || ''}`,
        weekEvents.length > 0 ? `Eventos de la semana:\n${weekEvents.join('\n')}` : 'No hay eventos programados esta semana.',
        weekTasks.length > 0 ? `Tareas de la semana:\n${weekTasks.join('\n')}` : 'No hay tareas asignadas esta semana.',
      ];

      if (customExtra?.trim()) {
        contextParts.push(`Instrucciones adicionales del usuario: ${customExtra.trim()}`);
      }

      const result = await generateWeeklySummaryFromAI(contextParts.join('\n\n'));
      setAiSummary(result);
      setAiSummaryExpanded(true);
      setShowAiPromptInput(false);
      setAiCustomPrompt('');
    } catch (err: any) {
      errorLogger.error('Error generating AI summary', err);
      setAiSummaryError(err.message || 'Error al generar resumen');
    } finally {
      setAiSummaryLoading(false);
    }
  };

  const filteredEvents = calendarMode === 'content'
    ? events.filter(event => event.type === 'content')
    : events.filter(event => event.type !== 'content');

  const platformFilteredEvents = calendarMode === 'content'
    ? filteredEvents.filter(event => selectedPlatforms.includes((event.location || '').toLowerCase()))
    : filteredEvents;

  const contentEvents = platformFilteredEvents.map((event) => ({
    ...event,
    content_status: (event as any).content_status || 'draft'
  }));

  const getDayEvents = (date: string) => {
    return contentEvents.filter(event => event.start_date === date);
  };

  const getDayTasks = (date: string) => {
    if (calendarMode === 'content') return [];
    const allTasks = getTasksByDate(date);
    if (taskFilter === 'all') return allTasks;
    if (taskFilter === 'me') return allTasks.filter(t => t.assignee_id === user?.id || (!t.assignee_id && t.owner_id === user?.id));
    return allTasks.filter(t => t.assignee_id === taskFilter);
  };

  // Estadísticas del calendario
  const stats = getCalendarStats();

  // Siempre mostramos el calendario con placeholders cuando no hay datos

  if (loading && !loadingTimedOut) {
    return (
      <div className="max-w-[1600px] mx-auto pt-4 pb-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-zinc-200 dark:border-zinc-700 border-t-zinc-900 dark:border-t-zinc-100 mx-auto mb-4" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Cargando calendario...</p>
          </div>
        </div>
      </div>
    );
  }

  // Nunca mostramos bloque de error: la UI siempre se renderiza con placeholders

  const weekDays = getWeekDays();
  const hours = getHours();

  return (
    <div className="max-w-[1600px] mx-auto pt-4 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">Calendario</h1>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
            {calendarMode === 'content'
              ? `${filteredEvents.length} contenidos programados`
              : `${stats.totalEvents} eventos · ${stats.totalTasks} tareas · ${stats.completedTasks} completadas`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Mode toggle: Agenda / Contenido */}
          <ToggleGroup
            options={[
              { id: 'schedule' as const, label: 'Agenda', icon: Icons.Calendar },
              { id: 'content' as const, label: 'Contenido', icon: Icons.Layers },
            ]}
            value={calendarMode}
            onChange={setCalendarMode}
          />

          {/* Platform filter dropdown (content mode) */}
          {calendarMode === 'content' && (
            <div ref={platformDropdownRef} className="relative">
              <button
                onClick={() => setPlatformDropdownOpen(prev => !prev)}
                className="flex items-center gap-1.5 px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                <Icons.Filter size={13} />
                Redes
                {selectedPlatforms.length < Object.keys(CONTENT_PLATFORMS).length && (
                  <span className="ml-0.5 w-4 h-4 flex items-center justify-center rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[9px] font-bold">
                    {selectedPlatforms.length}
                  </span>
                )}
              </button>
              {platformDropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 z-50 w-52 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg py-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                  {/* Select all / none */}
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-100 dark:border-zinc-800 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Plataformas</span>
                    <button
                      onClick={() => setSelectedPlatforms(prev =>
                        prev.length === Object.keys(CONTENT_PLATFORMS).length ? [] : Object.keys(CONTENT_PLATFORMS)
                      )}
                      className="text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {selectedPlatforms.length === Object.keys(CONTENT_PLATFORMS).length ? 'Ninguna' : 'Todas'}
                    </button>
                  </div>
                  {Object.entries(CONTENT_PLATFORMS).map(([key, plat]) => {
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

          {/* View toggle: Semana / Mes */}
          <ToggleGroup
            options={[
              { id: 'week' as const, label: 'Semana' },
              { id: 'month' as const, label: 'Mes' },
            ]}
            value={view}
            onChange={setView}
          />

          {/* Separator */}
          <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700" />

          {/* Action buttons */}
          <button
            onClick={() => setShowNewEventForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors active:scale-[0.97]"
          >
            <Icons.Plus size={14} />
            {calendarMode === 'content' ? 'Contenido' : 'Evento'}
          </button>
          {calendarMode === 'schedule' && (
            <button
              onClick={() => setShowNewTaskForm(true)}
              className="flex items-center gap-1.5 px-4 py-2 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors active:scale-[0.97]"
            >
              <Icons.Check size={14} />
              Tarea
            </button>
          )}

          {/* Google Calendar sync controls */}
          {googleConnected && (
            <button
              onClick={() => syncGoogle().catch(() => {})}
              disabled={googleSyncing}
              className="flex items-center gap-1.5 px-2.5 py-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-700 rounded-xl transition-colors"
              title="Sincronizar Google Calendar"
            >
              <Icons.RefreshCw size={14} className={googleSyncing ? 'animate-spin' : ''} />
            </button>
          )}
          <button
            onClick={() => setShowGoogleSettings(prev => !prev)}
            className="flex items-center gap-1.5 px-2.5 py-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-700 rounded-xl transition-colors"
            title="Integraciones de calendario"
          >
            <Icons.Settings size={14} />
          </button>
        </div>
      </div>

      {/* AI Weekly Summary */}
      <div className="mb-4">
        {!aiSummary && !aiSummaryLoading && (
          <button
            onClick={() => handleGenerateAiSummary()}
            className="group flex items-center gap-2 px-3.5 py-2 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-700/60 hover:border-indigo-300 dark:hover:border-indigo-600/50 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 transition-all duration-200"
          >
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
              <Icons.Sparkles size={12} className="text-white" />
            </div>
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
              Generar resumen semanal con IA
            </span>
          </button>
        )}

        {aiSummaryLoading && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center animate-pulse">
              <Icons.Sparkles size={12} className="text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-24 bg-indigo-200 dark:bg-indigo-800 rounded-full overflow-hidden">
                  <div className="h-full w-1/2 bg-indigo-500 rounded-full animate-[shimmer_1.5s_ease-in-out_infinite]" style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
                </div>
                <span className="text-[11px] font-medium text-indigo-500 dark:text-indigo-400">Analizando tu semana...</span>
              </div>
            </div>
          </div>
        )}

        {aiSummaryError && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40 mb-2">
            <Icons.AlertCircle size={14} className="text-red-500 shrink-0" />
            <span className="text-xs text-red-600 dark:text-red-400">{aiSummaryError}</span>
            <button onClick={() => { setAiSummaryError(null); handleGenerateAiSummary(); }} className="ml-auto text-[10px] font-semibold text-red-500 hover:text-red-700 transition-colors">
              Reintentar
            </button>
          </div>
        )}

        {aiSummary && !aiSummaryLoading && (
          <div className="rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/50 overflow-hidden">
            {/* Summary header — always visible */}
            <button
              onClick={() => setAiSummaryExpanded(!aiSummaryExpanded)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
            >
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shrink-0">
                <Icons.Sparkles size={12} className="text-white" />
              </div>
              <div className="flex-1 text-left min-w-0">
                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Resumen semanal IA</span>
                <span className="ml-2 text-[10px] text-zinc-400 dark:text-zinc-500">
                  {aiSummary.objectives.length} objetivos · {aiSummary.focus_tasks.length} tareas clave · {aiSummary.recommendations.length} recomendaciones
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowAiPromptInput(!showAiPromptInput); }}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
                  title="Agregar contexto personalizado"
                >
                  <Icons.Message size={13} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleGenerateAiSummary(); }}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
                  title="Regenerar resumen"
                >
                  <Icons.RefreshCw size={13} />
                </button>
                <Icons.ChevronDown size={14} className={`text-zinc-400 transition-transform duration-200 ${aiSummaryExpanded ? 'rotate-180' : ''}`} />
              </div>
            </button>

            {/* Custom prompt input */}
            {showAiPromptInput && (
              <div className="px-4 pb-3 border-t border-zinc-100 dark:border-zinc-800/60">
                <div className="flex items-center gap-2 mt-3">
                  <input
                    type="text"
                    value={aiCustomPrompt}
                    onChange={(e) => setAiCustomPrompt(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && aiCustomPrompt.trim()) handleGenerateAiSummary(aiCustomPrompt); }}
                    placeholder="Ej: Enfocarse en entregas del cliente X, priorizar diseño..."
                    className="flex-1 px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 dark:focus:border-indigo-600 placeholder-zinc-400"
                  />
                  <button
                    onClick={() => handleGenerateAiSummary(aiCustomPrompt)}
                    disabled={!aiCustomPrompt.trim()}
                    className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Generar
                  </button>
                </div>
                <p className="text-[10px] text-zinc-400 mt-1.5">Agrega contexto extra para personalizar el resumen</p>
              </div>
            )}

            {/* Expanded content */}
            {aiSummaryExpanded && (
              <div className="px-4 pb-4 border-t border-zinc-100 dark:border-zinc-800/60">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  {/* Objectives */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-2.5">
                      <div className="w-4 h-4 rounded bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                        <Icons.Target size={10} className="text-blue-600 dark:text-blue-400" />
                      </div>
                      <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Objetivos</span>
                    </div>
                    <ul className="space-y-1.5">
                      {aiSummary.objectives.map((obj, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
                          <span className="w-4 h-4 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0 mt-0.5 text-[9px] font-bold text-blue-500">{i + 1}</span>
                          {obj}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Focus Tasks */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-2.5">
                      <div className="w-4 h-4 rounded bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                        <Icons.Zap size={10} className="text-amber-600 dark:text-amber-400" />
                      </div>
                      <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Tareas Clave</span>
                    </div>
                    <ul className="space-y-1.5">
                      {aiSummary.focus_tasks.map((task, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 dark:bg-amber-500 shrink-0 mt-1.5" />
                          {task}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Recommendations */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-2.5">
                      <div className="w-4 h-4 rounded bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                        <Icons.Lightbulb size={10} className="text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Recomendaciones</span>
                    </div>
                    <ul className="space-y-1.5">
                      {aiSummary.recommendations.map((rec, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 dark:bg-emerald-500 shrink-0 mt-1.5" />
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filtro por miembro del equipo */}
      {calendarMode === 'schedule' && teamMembers.length > 0 && (
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
          <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider shrink-0">Filtrar:</span>
          {[
            { id: 'all', label: 'Todos' },
            { id: 'me', label: 'Mis tareas' },
            ...teamMembers
              .filter(m => m.status === 'active' && m.id !== user?.id)
              .map(m => ({ id: m.id, label: m.name || m.email?.split('@')[0] || 'Miembro', avatar: m.avatar_url })),
          ].map((item: any) => (
            <button
              key={item.id}
              onClick={() => setTaskFilter(item.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-full transition-all duration-200 shrink-0 ${
                taskFilter === item.id
                  ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold shadow-sm'
                  : 'bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-200/60 dark:border-zinc-700/60'
              }`}
            >
              {item.avatar && (
                <img src={item.avatar} alt="" className="w-4 h-4 rounded-full" />
              )}
              {!item.avatar && item.id !== 'all' && item.id !== 'me' && (
                <div className="w-4 h-4 rounded-full bg-zinc-300 dark:bg-zinc-600 flex items-center justify-center text-[7px] font-bold text-white">
                  {item.label?.[0]?.toUpperCase()}
                </div>
              )}
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* Side panel de creación */}
      <SlidePanel
        isOpen={showNewEventForm || showNewTaskForm}
        onClose={() => { setShowNewEventForm(false); setShowNewTaskForm(false); }}
        title={showNewEventForm ? (calendarMode === 'content' ? 'Nuevo Contenido' : 'Nuevo Evento') : 'Nueva Tarea'}
        width="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => { setShowNewEventForm(false); setShowNewTaskForm(false); }}
              className="px-4 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={showNewEventForm ? (calendarMode === 'content' ? handleCreateContent : handleCreateEvent) : handleCreateTask}
              disabled={showNewEventForm ? (calendarMode === 'content' ? !newContentData.title.trim() : !newEventData.title.trim()) : !newTaskData.title.trim()}
              className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 rounded-xl text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.97] flex items-center gap-2"
            >
              {showNewEventForm ? <Icons.Calendar size={14}/> : <Icons.Check size={14}/>}
              {showNewEventForm ? (calendarMode === 'content' ? 'Crear' : 'Crear Evento') : 'Crear Tarea'}
            </button>
          </div>
        }
      >
        <div className="p-5">
          {showNewEventForm ? (
            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">
                  {calendarMode === 'content' ? 'Nombre del contenido' : 'Nombre del evento'}
                </label>
                <input
                  type="text"
                  placeholder={calendarMode === 'content' ? 'Nombre del contenido...' : 'Nombre del evento...'}
                  value={calendarMode === 'content' ? newContentData.title : newEventData.title}
                  onChange={(e) => calendarMode === 'content'
                    ? setNewContentData({ ...newContentData, title: e.target.value })
                    : setNewEventData({ ...newEventData, title: e.target.value })
                  }
                  className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:border-zinc-400 dark:focus:border-zinc-500 focus:ring-2 focus:ring-zinc-100 dark:focus:ring-zinc-800 text-sm font-medium text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 transition-all"
                  autoFocus
                />
              </div>

              {calendarMode === 'content' ? (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">Plataforma</label>
                    <select
                      value={newContentData.platform}
                      onChange={(e) => setNewContentData({ ...newContentData, platform: e.target.value })}
                      className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:border-zinc-400 text-sm text-zinc-900 dark:text-zinc-100"
                    >
                      {Object.entries(CONTENT_PLATFORMS).map(([key, value]) => (
                        <option key={key} value={key}>{value.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">Canal</label>
                    <select
                      value={newContentData.channel}
                      onChange={(e) => setNewContentData({ ...newContentData, channel: e.target.value })}
                      className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:border-zinc-400 text-sm text-zinc-900 dark:text-zinc-100"
                    >
                      <option value="feed">Feed</option>
                      <option value="stories">Stories</option>
                      <option value="reels">Reels</option>
                      <option value="shorts">Shorts</option>
                      <option value="post">Post</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">Estado</label>
                    <select
                      value={newContentData.status}
                      onChange={(e) => setNewContentData({ ...newContentData, status: e.target.value })}
                      className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:border-zinc-400 text-sm text-zinc-900 dark:text-zinc-100"
                    >
                      {CONTENT_STATUSES.map((s) => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">Tipo</label>
                    <select
                      value={newEventData.type}
                      onChange={(e) => setNewEventData({ ...newEventData, type: e.target.value as any })}
                      className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:border-zinc-400 text-sm text-zinc-900 dark:text-zinc-100"
                    >
                      <option value="meeting">Reunión</option>
                      <option value="call">Llamada</option>
                      <option value="deadline">Deadline</option>
                      <option value="work-block">Bloque de trabajo</option>
                      <option value="note">Nota</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">Ubicación</label>
                    <input
                      type="text"
                      placeholder="Zoom / Oficina"
                      value={newEventData.location}
                      onChange={(e) => setNewEventData({ ...newEventData, location: e.target.value })}
                      className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:border-zinc-400 text-sm text-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                </div>
              )}

              {calendarMode === 'content' && (
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">Asset</label>
                  <input
                    type="text"
                    placeholder="Carousel / Video / Copy"
                    value={newContentData.asset_type}
                    onChange={(e) => setNewContentData({ ...newContentData, asset_type: e.target.value })}
                    className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:border-zinc-400 text-sm text-zinc-900 dark:text-zinc-100"
                  />
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">Fecha</label>
                  <input
                    type="date"
                    value={calendarMode === 'content' ? newContentData.start_date : newEventData.start_date}
                    onChange={(e) => calendarMode === 'content'
                      ? setNewContentData({ ...newContentData, start_date: e.target.value })
                      : setNewEventData({ ...newEventData, start_date: e.target.value })
                    }
                    className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:border-zinc-400 text-sm text-zinc-900 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">Hora</label>
                  <input
                    type="time"
                    value={calendarMode === 'content' ? newContentData.start_time : newEventData.start_time}
                    onChange={(e) => calendarMode === 'content'
                      ? setNewContentData({ ...newContentData, start_time: e.target.value })
                      : setNewEventData({ ...newEventData, start_time: e.target.value })
                    }
                    className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:border-zinc-400 text-sm text-zinc-900 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">Min</label>
                  <input
                    type="number"
                    value={calendarMode === 'content' ? newContentData.duration : newEventData.duration}
                    onChange={(e) => calendarMode === 'content'
                      ? setNewContentData({ ...newContentData, duration: parseInt(e.target.value) })
                      : setNewEventData({ ...newEventData, duration: parseInt(e.target.value) })
                    }
                    className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:border-zinc-400 text-sm text-zinc-900 dark:text-zinc-100"
                    min="15"
                    step="15"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">Descripción</label>
                <textarea
                  placeholder="Detalles adicionales..."
                  value={calendarMode === 'content' ? newContentData.description : newEventData.description}
                  onChange={(e) => calendarMode === 'content'
                    ? setNewContentData({ ...newContentData, description: e.target.value })
                    : setNewEventData({ ...newEventData, description: e.target.value })
                  }
                  className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:border-zinc-400 text-sm text-zinc-900 dark:text-zinc-100 resize-none"
                  rows={2}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">Título</label>
                <input
                  type="text"
                  placeholder="¿Qué hay que hacer?"
                  value={newTaskData.title}
                  onChange={(e) => setNewTaskData({ ...newTaskData, title: e.target.value })}
                  className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:border-zinc-400 dark:focus:border-zinc-500 focus:ring-2 focus:ring-zinc-100 dark:focus:ring-zinc-800 text-sm font-medium text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 transition-all"
                  autoFocus
                />
              </div>

              {/* Priority + Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">Prioridad</label>
                  <select
                    value={newTaskData.priority}
                    onChange={(e) => setNewTaskData({ ...newTaskData, priority: e.target.value as any })}
                    className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:border-zinc-400 text-sm text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="low">Baja</option>
                    <option value="medium">Media</option>
                    <option value="high">Alta</option>
                    <option value="urgent">Urgente</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">Fecha límite</label>
                  <input
                    type="date"
                    value={newTaskData.start_date}
                    onChange={(e) => setNewTaskData({ ...newTaskData, start_date: e.target.value })}
                    className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:border-zinc-400 text-sm text-zinc-900 dark:text-zinc-100"
                  />
                </div>
              </div>

              {/* Project + Assignee */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">Proyecto</label>
                  <select
                    value={newTaskData.project_id}
                    onChange={(e) => setNewTaskData({ ...newTaskData, project_id: e.target.value })}
                    className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:border-zinc-400 text-sm text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="">Sin proyecto</option>
                    {projectOptions.map((project) => (
                      <option key={project.id} value={project.id}>{project.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">Asignar a</label>
                  <select
                    value={newTaskData.assignee_id}
                    onChange={(e) => setNewTaskData({ ...newTaskData, assignee_id: e.target.value })}
                    className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:border-zinc-400 text-sm text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="">Sin asignar</option>
                    {teamMembers.filter(m => m.status === 'active').map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.id === user?.id ? `${member.name || member.email} (Yo)` : (member.name || member.email)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">Descripción</label>
                <textarea
                  placeholder="Detalles opcionales..."
                  value={newTaskData.description}
                  onChange={(e) => setNewTaskData({ ...newTaskData, description: e.target.value })}
                  className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:border-zinc-400 dark:focus:border-zinc-500 text-sm text-zinc-900 dark:text-zinc-100 resize-none"
                  rows={2}
                />
              </div>
            </div>
          )}
        </div>
      </SlidePanel>

      {/* Google Calendar Settings Panel */}
      {showGoogleSettings && (
        <div className="mb-4">
          <GoogleCalendarSettings />
        </div>
      )}

      {/* Popover de click-to-create */}
      {slotPopover && (
        <TimeSlotPopover
          clickX={slotPopover.clickX}
          clickY={slotPopover.clickY}
          date={slotPopover.date}
          hour={slotPopover.hour}
          mode={calendarMode}
          onSelect={handleSlotSelect}
          onClose={() => setSlotPopover(null)}
        />
      )}

      {/* Vista de Semana */}
      {view === 'week' && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          {/* Encabezado de días */}
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
                    {day.toLocaleDateString('es-ES', { weekday: 'short' })}
                  </div>
                  <div className={`text-lg font-semibold ${
                    isToday ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-700 dark:text-zinc-300'
                  }`}>
                    {day.getDate()}
                  </div>
                  {getDayTasks(dateStr).length > 0 && (
                    <div className="text-[10px] text-blue-600 dark:text-blue-400 font-medium mt-0.5">
                      {getDayTasks(dateStr).length} tarea{getDayTasks(dateStr).length > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Cuerpo del calendario */}
          <div className="max-h-96 overflow-y-auto">
            {hours.map((hour) => (
              <div key={hour} className="grid grid-cols-8 border-b border-zinc-100 dark:border-zinc-800">
                <div className="p-2 text-xs text-zinc-500 dark:text-zinc-400 text-right border-r border-zinc-200 dark:border-zinc-800">
                  {hour.toString().padStart(2, '0')}:00
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

                  return (
                    <div
                      key={dayIndex}
                      className={`p-2 min-h-12 border-r border-zinc-100 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors relative cursor-pointer ${
                        isSelected ? 'ring-2 ring-inset ring-blue-500 bg-blue-500/10' : ''
                      }`}
                      onClick={(e) => {
                        if (e.target !== e.currentTarget) return;
                        setSlotPopover({
                          clickX: e.clientX,
                          clickY: e.clientY,
                          date: dateStr,
                          hour: hour,
                        });
                      }}
                    >
                      {dayEvents.map((event) => (
                        <div
                          key={event.id}
                          className="text-xs p-2 rounded mb-1 truncate cursor-pointer hover:opacity-80 transition-opacity"
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
                              {CONTENT_PLATFORMS[event.location]?.label || event.location}
                            </div>
                          )}
                        </div>
                      ))}
                      {hourTasks.map((task) => (
                        <div
                          key={task.id}
                          className={`text-xs p-1.5 rounded mb-1 cursor-pointer hover:opacity-80 transition-opacity border ${
                            task.completed
                              ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 line-through opacity-60'
                              : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                          }`}
                          title={`${task.title}${task.assignee_id ? ` — ${getMemberName(task.assignee_id)}` : ''}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="font-medium flex items-center gap-1 text-zinc-800 dark:text-zinc-200 truncate">
                            <Icons.Check size={10} className="shrink-0" />
                            {task.title}
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
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vista de Mes */}
      {view === 'month' && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-zinc-200 dark:border-zinc-800">
            {['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map((day) => (
              <div key={day} className="p-3 text-center text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {getMonthDays().map((day, idx) => {
              const dateStr = day.toISOString().split('T')[0];
              const isCurrentMonth = day.getMonth() === currentDate.getMonth();
              const dayEvents = getDayEvents(dateStr);
              return (
                <div
                  key={`${dateStr}-${idx}`}
                  onClick={(e) => {
                    setSelectedDate(dateStr);
                    // Double-click to create (single click selects date)
                  }}
                  onDoubleClick={(e) => {
                    setSlotPopover({
                      clickX: e.clientX,
                      clickY: e.clientY,
                      date: dateStr,
                      hour: 9, // Default to 9:00 for month view
                    });
                  }}
                  className={`min-h-[120px] p-2 border-b border-r border-zinc-100 dark:border-zinc-800 cursor-pointer transition-colors ${
                    isCurrentMonth ? 'bg-white dark:bg-zinc-900' : 'bg-zinc-50 dark:bg-zinc-900/40'
                  }`}
                >
                  <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                    {day.getDate()}
                  </div>
                  <div className="mt-2 space-y-1">
                    {dayEvents.slice(0, 3).map((event) => (
                      <div
                        key={event.id}
                        className="text-[10px] px-2 py-1 rounded truncate flex items-center gap-0.5"
                        style={{ backgroundColor: event.color || '#3b82f6', color: 'white' }}
                      >
                        {event.source === 'google' && <span className="opacity-75">G</span>}
                        {event.title}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <div className="text-[10px] text-zinc-400">+{dayEvents.length - 3} más</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {calendarMode === 'content' && (
        <div className="mt-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Planner por red social</h3>
              <div className="text-xs text-zinc-500">Arrastrar para cambiar estado</div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {CONTENT_STATUSES.map((status) => (
                <div
                  key={status.id}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const eventId = e.dataTransfer.getData('contentEventId');
                    if (eventId) {
                      updateEvent(eventId, { content_status: status.id as any });
                    }
                  }}
                  className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 min-h-[220px]"
                >
                  <div className={`inline-flex px-2 py-1 rounded-full text-[10px] font-semibold ${status.color}`}>
                    {status.label}
                  </div>
                  <div className="mt-3 space-y-2">
                    {contentEvents
                      .filter((event) => (event as any).content_status === status.id)
                      .map((event) => (
                        <div
                          key={event.id}
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData('contentEventId', event.id)}
                          className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs cursor-grab"
                        >
                          <div className="font-semibold text-zinc-900 dark:text-zinc-100">{event.title}</div>
                          <div className="text-[10px] text-zinc-500 mt-1">
                            {CONTENT_PLATFORMS[event.location || '']?.label || event.location}
                          </div>
                          {event.start_date && (
                            <div className="text-[10px] text-zinc-400 mt-1">{event.start_date}</div>
                          )}
                          <div className="flex gap-1 mt-2">
                            {CONTENT_STATUSES.filter(s => s.id !== status.id).map((target) => (
                              <button
                                key={target.id}
                                onClick={() => updateEvent(event.id, { content_status: target.id as any })}
                                className="text-[10px] px-2 py-0.5 rounded-full border border-zinc-200 text-zinc-500"
                              >
                                {target.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    {contentEvents.filter((event) => (event as any).content_status === status.id).length === 0 && (
                      <div className="text-xs text-zinc-400">Sin contenido</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Panel lateral de fecha seleccionada */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
              {new Date(selectedDate).toLocaleDateString('es-ES', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </h3>
            
            <div className="space-y-6">
              {/* Eventos del día */}
              <div>
                <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
                  <Icons.CalendarDays size={16} />
                  {calendarMode === 'content' ? `Contenidos (${getDayEvents(selectedDate).length})` : `Eventos (${getDayEvents(selectedDate).length})`}
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
                              📍 {event.location}
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-zinc-400 dark:text-zinc-500 capitalize">
                          {event.type === 'content'
                            ? (CONTENT_PLATFORMS[event.location || '']?.label || event.location || 'content')
                            : event.type}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-zinc-500 dark:text-zinc-400">
                      {calendarMode === 'content' ? 'No hay contenidos para este día' : 'No hay eventos para este día'}
                    </div>
                  )}
                </div>
              </div>

              {/* Tareas del día */}
              {calendarMode === 'schedule' && (
                <div>
                  <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
                    <Icons.Check size={16} />
                    Tareas ({getDayTasks(selectedDate).length})
                  </h4>
                  <div className="space-y-2">
                    {getDayTasks(selectedDate).length > 0 ? (
                      getDayTasks(selectedDate).map((task) => (
                        <div
                          key={task.id}
                          className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg group"
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
                            <span className="text-xs text-zinc-400 dark:text-zinc-500 capitalize">
                              {task.status}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-4 text-zinc-500 dark:text-zinc-400">
                        No hay tareas para este día
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Panel de estadísticas */}
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Resumen</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {calendarMode === 'content' ? 'Contenidos totales' : 'Eventos totales'}
                </span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {calendarMode === 'content' ? filteredEvents.length : stats.totalEvents}
                </span>
              </div>
              {calendarMode === 'schedule' && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">Tareas totales</span>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">{stats.totalTasks}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">Completadas</span>
                    <span className="font-semibold text-green-600 dark:text-green-400">{stats.completedTasks}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">Pendientes</span>
                    <span className="font-semibold text-orange-600 dark:text-orange-400">{stats.pendingTasks}</span>
                  </div>
                  {stats.overdueTasks > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">Atrasadas</span>
                      <span className="font-semibold text-red-600 dark:text-red-400">{stats.overdueTasks}</span>
                    </div>
                  )}
                  <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">Progreso</span>
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

          {/* Próximas tareas */}
          {calendarMode === 'schedule' && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Próximas tareas</h3>
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
                            {new Date(task.start_date).toLocaleDateString('es-ES')}
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
                    </div>
                  ))}
                {tasks.filter(task => !task.completed && task.start_date).length === 0 && (
                  <div className="text-center py-4 text-zinc-500 dark:text-zinc-400 text-sm">
                    No hay tareas pendientes
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
