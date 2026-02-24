import React, { useState, useEffect } from 'react';
import { Icons } from '../components/ui/Icons';
import { Card } from '../components/ui/Card';
import { useCalendar, CalendarEvent, CalendarTask } from '../hooks/useCalendar';
import { useAuth } from '../hooks/useAuth';
import { errorLogger } from '../lib/errorLogger';
import { useSupabase } from '../hooks/useSupabase';
import { TimeSlotPopover } from '../components/calendar/TimeSlotPopover';
import { GoogleCalendarSettings } from '../components/calendar/GoogleCalendarSettings';
import { useGoogleCalendar } from '../hooks/useGoogleCalendar';

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

  useEffect(() => {
    if (calendarMode === 'content') {
      setSelectedPlatforms(Object.keys(CONTENT_PLATFORMS));
    }
  }, [calendarMode]);

  // Click-to-create popover state
  const [slotPopover, setSlotPopover] = useState<{
    x: number;
    y: number;
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
    project_id: ''
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
        completed: false
      });

      setNewTaskData({
        title: '',
        description: '',
        start_date: '',
        priority: 'medium',
        status: 'todo',
        duration: 60,
        project_id: ''
      });
      setShowNewTaskForm(false);
    } catch (err) {
      errorLogger.error('Error creando tarea', err);
      // Mostrar mensaje de error al usuario
      alert('Error al crear tarea: ' + (err as Error).message);
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
    return calendarMode === 'content' ? [] : getTasksByDate(date);
  };

  // Estadísticas del calendario
  const stats = getCalendarStats();

  // Siempre mostramos el calendario con placeholders cuando no hay datos

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-zinc-900 dark:border-zinc-100 mx-auto mb-4"></div>
            <p className="text-zinc-600 dark:text-zinc-400">Cargando calendario...</p>
          </div>
        </div>
      </div>
    );
  }

  // Nunca mostramos bloque de error: la UI siempre se renderiza con placeholders

  const weekDays = getWeekDays();
  const hours = getHours();

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Calendario</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {calendarMode === 'content'
              ? `${filteredEvents.length} contenidos programados`
              : `${stats.totalEvents} eventos, ${stats.totalTasks} tareas (${stats.completedTasks} completadas)`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
            {(['schedule', 'content'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setCalendarMode(mode)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  calendarMode === mode
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                {mode === 'schedule' ? 'Agenda' : 'Contenido'}
              </button>
            ))}
          </div>
          {calendarMode === 'content' && (
            <div className="flex flex-wrap items-center gap-2">
              {Object.entries(CONTENT_PLATFORMS).map(([key, value]) => (
                <button
                  key={key}
                  onClick={() => {
                    setSelectedPlatforms((prev) =>
                      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
                    )
                  }}
                  className={`px-2 py-1 rounded-full text-[10px] font-semibold border transition-colors ${
                    selectedPlatforms.includes(key)
                      ? 'bg-white border-zinc-200 text-zinc-900'
                      : 'bg-zinc-100 border-transparent text-zinc-400'
                  }`}
                  style={selectedPlatforms.includes(key) ? { borderColor: value.color } : undefined}
                >
                  {value.label}
                </button>
              ))}
            </div>
          )}
          {/* Vista */}
          <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
            {(['week', 'month'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  view === v
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                {v === 'week' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>
          
          {/* Botones de acción */}
          <button
            onClick={() => setShowNewEventForm(true)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              calendarMode === 'content' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            <Icons.Plus size={16} />
            {calendarMode === 'content' ? 'Contenido' : 'Evento'}
          </button>
          {calendarMode === 'schedule' && (
            <button
              onClick={() => setShowNewTaskForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <Icons.Check size={16} />
              Tarea
            </button>
          )}

          {/* Google Calendar sync controls */}
          {googleConnected && (
            <button
              onClick={() => syncGoogle().catch(() => {})}
              disabled={googleSyncing}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 border border-zinc-200 dark:border-zinc-700 rounded-lg transition-colors"
              title="Sincronizar Google Calendar"
            >
              <Icons.RefreshCw size={14} className={googleSyncing ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Sync</span>
            </button>
          )}
          <button
            onClick={() => setShowGoogleSettings(prev => !prev)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 border border-zinc-200 dark:border-zinc-700 rounded-lg transition-colors"
            title="Integraciones de calendario"
          >
            <Icons.Settings size={14} />
          </button>
        </div>
      </div>

      {/* Formularios de creación (MODAL) */}
      {(showNewEventForm || showNewTaskForm) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-900/50">
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        {showNewEventForm ? <Icons.Calendar size={20}/> : <Icons.Check size={20}/>}
                        {showNewEventForm
                          ? (calendarMode === 'content' ? 'Nuevo Contenido' : 'Nuevo Evento')
                          : 'Nueva Tarea'}
                    </h3>
                    <button 
                        onClick={() => { setShowNewEventForm(false); setShowNewTaskForm(false); }}
                        className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                    >
                        <Icons.Close size={20}/>
                    </button>
                </div>
          
                <div className="p-6 space-y-4">
                    {showNewEventForm ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-xs font-medium text-zinc-500 mb-1">Título</label>
                            <input
                                type="text"
                                placeholder={calendarMode === 'content' ? 'Ej: Reel lanzamiento' : 'Ej: Reunión con Cliente'}
                                value={calendarMode === 'content' ? newContentData.title : newEventData.title}
                                onChange={(e) => calendarMode === 'content'
                                  ? setNewContentData({ ...newContentData, title: e.target.value })
                                  : setNewEventData({ ...newEventData, title: e.target.value })
                                }
                                className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-zinc-900 dark:text-zinc-100 transition-all"
                                required
                                autoFocus
                            />
                        </div>
                        {calendarMode === 'content' ? (
                          <>
                            <div>
                              <label className="block text-xs font-medium text-zinc-500 mb-1">Plataforma</label>
                              <select
                                value={newContentData.platform}
                                onChange={(e) => setNewContentData({ ...newContentData, platform: e.target.value })}
                                className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-zinc-900 dark:text-zinc-100 transition-all appearance-none"
                              >
                                {Object.entries(CONTENT_PLATFORMS).map(([key, value]) => (
                                  <option key={key} value={key}>{value.label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-zinc-500 mb-1">Canal</label>
                              <select
                                value={newContentData.channel}
                                onChange={(e) => setNewContentData({ ...newContentData, channel: e.target.value })}
                                className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-zinc-900 dark:text-zinc-100 transition-all appearance-none"
                              >
                                <option value="feed">Feed</option>
                                <option value="stories">Stories</option>
                                <option value="reels">Reels</option>
                                <option value="shorts">Shorts</option>
                                <option value="post">Post</option>
                              </select>
                            </div>
                            <div className="col-span-2">
                              <label className="block text-xs font-medium text-zinc-500 mb-1">Asset</label>
                              <input
                                type="text"
                                placeholder="Ej: Carousel / Video / Copy"
                                value={newContentData.asset_type}
                                onChange={(e) => setNewContentData({ ...newContentData, asset_type: e.target.value })}
                                className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-zinc-900 dark:text-zinc-100 transition-all"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-zinc-500 mb-1">Estado</label>
                              <select
                                value={newContentData.status}
                                onChange={(e) => setNewContentData({ ...newContentData, status: e.target.value })}
                                className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-zinc-900 dark:text-zinc-100 transition-all appearance-none"
                              >
                                {CONTENT_STATUSES.map((status) => (
                                  <option key={status.id} value={status.id}>{status.label}</option>
                                ))}
                              </select>
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <label className="block text-xs font-medium text-zinc-500 mb-1">Tipo</label>
                              <select
                                value={newEventData.type}
                                onChange={(e) => setNewEventData({ ...newEventData, type: e.target.value as any })}
                                className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-zinc-900 dark:text-zinc-100 transition-all appearance-none"
                              >
                                <option value="meeting">Reunión</option>
                                <option value="call">Llamada</option>
                                <option value="deadline">Deadline</option>
                                <option value="work-block">Bloque de trabajo</option>
                                <option value="note">Nota</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-zinc-500 mb-1">Ubicación / Link</label>
                              <input
                                type="text"
                                placeholder="Ej: Zoom / Oficina"
                                value={newEventData.location}
                                onChange={(e) => setNewEventData({ ...newEventData, location: e.target.value })}
                                className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-zinc-900 dark:text-zinc-100 transition-all"
                              />
                            </div>
                          </>
                        )}

                        <div>
                            <label className="block text-xs font-medium text-zinc-500 mb-1">Fecha</label>
                            <input
                                type="date"
                                value={calendarMode === 'content' ? newContentData.start_date : newEventData.start_date}
                                onChange={(e) => calendarMode === 'content'
                                  ? setNewContentData({ ...newContentData, start_date: e.target.value })
                                  : setNewEventData({ ...newEventData, start_date: e.target.value })
                                }
                                className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-zinc-900 dark:text-zinc-100 transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-zinc-500 mb-1">Hora</label>
                            <input
                                type="time"
                                value={calendarMode === 'content' ? newContentData.start_time : newEventData.start_time}
                                onChange={(e) => calendarMode === 'content'
                                  ? setNewContentData({ ...newContentData, start_time: e.target.value })
                                  : setNewEventData({ ...newEventData, start_time: e.target.value })
                                }
                                className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-zinc-900 dark:text-zinc-100 transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-zinc-500 mb-1">Duración (min)</label>
                            <input
                                type="number"
                                value={calendarMode === 'content' ? newContentData.duration : newEventData.duration}
                                onChange={(e) => calendarMode === 'content'
                                  ? setNewContentData({ ...newContentData, duration: parseInt(e.target.value) })
                                  : setNewEventData({ ...newEventData, duration: parseInt(e.target.value) })
                                }
                                className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-zinc-900 dark:text-zinc-100 transition-all"
                                min="15"
                                step="15"
                            />
                        </div>

                        <div className="col-span-2">
                            <label className="block text-xs font-medium text-zinc-500 mb-1">Descripción</label>
                            <textarea
                                placeholder="Detalles adicionales..."
                                value={calendarMode === 'content' ? newContentData.description : newEventData.description}
                                onChange={(e) => calendarMode === 'content'
                                  ? setNewContentData({ ...newContentData, description: e.target.value })
                                  : setNewEventData({ ...newEventData, description: e.target.value })
                                }
                                className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-zinc-900 dark:text-zinc-100 transition-all resize-none"
                                rows={3}
                            />
                        </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-xs font-medium text-zinc-500 mb-1">Título</label>
                            <input
                                type="text"
                                placeholder="Ej: Finalizar reporte"
                                value={newTaskData.title}
                                onChange={(e) => setNewTaskData({ ...newTaskData, title: e.target.value })}
                                className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-zinc-900 dark:text-zinc-100 transition-all"
                                required
                                autoFocus
                            />
                        </div>
                        
                        <div>
                            <label className="block text-xs font-medium text-zinc-500 mb-1">Prioridad</label>
                            <select
                                value={newTaskData.priority}
                                onChange={(e) => setNewTaskData({ ...newTaskData, priority: e.target.value as any })}
                                className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-zinc-900 dark:text-zinc-100 transition-all"
                            >
                                <option value="low">Baja</option>
                                <option value="medium">Media</option>
                                <option value="high">Alta</option>
                                <option value="urgent">Urgente</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-zinc-500 mb-1">Fecha Límite</label>
                            <input
                                type="date"
                                value={newTaskData.start_date}
                                onChange={(e) => setNewTaskData({ ...newTaskData, start_date: e.target.value })}
                                className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-zinc-900 dark:text-zinc-100 transition-all"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-zinc-500 mb-1">Proyecto</label>
                            <select
                                value={newTaskData.project_id}
                                onChange={(e) => setNewTaskData({ ...newTaskData, project_id: e.target.value })}
                                className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-zinc-900 dark:text-zinc-100 transition-all"
                            >
                                <option value="">Sin proyecto</option>
                                {projectOptions.map((project) => (
                                    <option key={project.id} value={project.id}>{project.title}</option>
                                ))}
                            </select>
                        </div>
                        
                        <div className="col-span-2">
                            <label className="block text-xs font-medium text-zinc-500 mb-1">Descripción</label>
                            <textarea
                                placeholder="Detalles..."
                                value={newTaskData.description}
                                onChange={(e) => setNewTaskData({ ...newTaskData, description: e.target.value })}
                                className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-zinc-900 dark:text-zinc-100 transition-all resize-none"
                                rows={3}
                            />
                        </div>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3 bg-zinc-50/50 dark:bg-zinc-900/50">
                    <button
                        onClick={() => {
                            setShowNewEventForm(false);
                            setShowNewTaskForm(false);
                        }}
                        className="px-5 py-2.5 text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={showNewEventForm ? (calendarMode === 'content' ? handleCreateContent : handleCreateEvent) : handleCreateTask}
                        disabled={showNewEventForm ? (calendarMode === 'content' ? !newContentData.title.trim() : !newEventData.title.trim()) : !newTaskData.title.trim()}
                        className="px-6 py-2.5 bg-zinc-900 hover:bg-black dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-900 rounded-xl text-sm font-bold shadow-lg shadow-zinc-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                    >
                        {showNewEventForm ? <Icons.Calendar size={16}/> : <Icons.Check size={16}/>}
                        {showNewEventForm ? (calendarMode === 'content' ? 'Crear Contenido' : 'Crear Evento') : 'Crear Tarea'}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Google Calendar Settings Panel */}
      {showGoogleSettings && (
        <div className="mb-4">
          <GoogleCalendarSettings />
        </div>
      )}

      {/* Popover de click-to-create */}
      {slotPopover && (
        <TimeSlotPopover
          x={slotPopover.x}
          y={slotPopover.y}
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
                  
                  return (
                    <div
                      key={dayIndex}
                      className="p-2 min-h-12 border-r border-zinc-100 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors relative cursor-pointer"
                      onClick={(e) => {
                        if (e.target !== e.currentTarget) return;
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setSlotPopover({
                          x: rect.left + rect.width / 2,
                          y: rect.top,
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
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setSlotPopover({
                      x: rect.left + rect.width / 2,
                      y: rect.top + rect.height / 2,
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
