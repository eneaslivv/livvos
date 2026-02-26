import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { useClients } from '../context/ClientsContext';
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
    moveTask,
    getEventsByDate,
    getTasksByDate,
    getCalendarStats
  } = useCalendar();

  const { members: teamMembers } = useTeam();
  const { clients } = useClients();

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

  const { data: projectOptions } = useSupabase<{ id: string; title: string; client_id?: string }>('projects', {
    enabled: true,
    subscribe: false,
    select: 'id,title,client_id'
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

  // Client name map for showing client on tasks
  const clientMap = clients.reduce<Record<string, string>>((acc, c) => {
    acc[c.id] = c.name;
    return acc;
  }, {});

  const getClientLabel = (task: CalendarTask) => {
    if (!task.client_id) return null;
    return clientMap[task.client_id] || null;
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

  // Drag-and-drop state for tasks
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);

  const handleTaskDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('taskId', taskId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingTaskId(taskId);
  };

  const handleTaskDrop = async (e: React.DragEvent, date: string, hour?: number) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    if (!taskId) return;
    const time = hour !== undefined ? `${hour.toString().padStart(2, '0')}:00` : undefined;
    try {
      await moveTask(taskId, date, time);
    } catch (err) {
      errorLogger.error('Error moviendo tarea', err);
    }
    setDraggingTaskId(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // Click-to-create popover state
  const [slotPopover, setSlotPopover] = useState<{
    clickX: number;
    clickY: number;
    date: string;
    hour: number;
  } | null>(null);

  // Task detail/edit panel
  const [selectedTask, setSelectedTask] = useState<CalendarTask | null>(null);
  const [editingTask, setEditingTask] = useState<Partial<CalendarTask>>({});
  const [savingTask, setSavingTask] = useState(false);

  // Subtask state
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [addingSubtask, setAddingSubtask] = useState(false);

  // Derive subtasks from tasks array (subtasks = tasks with parent_task_id)
  const subtasksForSelected = selectedTask
    ? tasks.filter(t => t.parent_task_id === selectedTask.id)
    : [];

  // Dependency helpers
  const getBlockerTask = (task: CalendarTask | null) => {
    if (!task?.blocked_by) return null;
    return tasks.find(t => t.id === task.blocked_by) || null;
  };
  const getDependentTasks = (taskId: string) => tasks.filter(t => t.blocked_by === taskId);
  const isTaskBlocked = (task: CalendarTask) => {
    if (!task.blocked_by) return false;
    const blocker = tasks.find(t => t.id === task.blocked_by);
    return blocker ? !blocker.completed : false;
  };

  // Helper: get color scheme for a task based on priority + status
  const getTaskColor = (task: CalendarTask) => {
    if (task.completed || task.status === 'done') {
      return { bg: 'bg-zinc-100 dark:bg-zinc-800', border: 'border-zinc-200 dark:border-zinc-700', text: 'text-zinc-400 dark:text-zinc-500', dot: 'bg-zinc-400' };
    }
    if (task.status === 'cancelled') {
      return { bg: 'bg-red-50/50 dark:bg-red-900/10', border: 'border-red-200/50 dark:border-red-800/30', text: 'text-red-400 dark:text-red-500', dot: 'bg-red-400' };
    }
    switch (task.priority) {
      case 'urgent': return { bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-300 dark:border-red-800', text: 'text-red-700 dark:text-red-300', dot: 'bg-red-500' };
      case 'high': return { bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-300 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' };
      case 'medium': return { bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-300 dark:border-blue-800', text: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' };
      case 'low': return { bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-300 dark:border-emerald-800', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' };
      default: return { bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-300 dark:border-blue-800', text: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' };
    }
  };

  const [newTaskData, setNewTaskData] = useState({
    title: '',
    description: '',
    start_date: '',
    start_time: '',
    priority: 'medium' as const,
    status: 'todo' as const,
    duration: 60,
    project_id: '',
    client_id: '',
    assignee_id: ''
  });

  // Open task detail panel
  const handleOpenTaskDetail = (task: CalendarTask) => {
    setSelectedTask(task);
    setEditingTask({
      title: task.title,
      description: task.description || '',
      priority: task.priority,
      status: task.status,
      start_date: task.start_date || '',
      start_time: task.start_time || '',
      duration: task.duration || 60,
      project_id: task.project_id || '',
      assignee_id: task.assignee_id || '',
      blocked_by: task.blocked_by || '',
    });
  };

  const handleSaveTaskEdit = async () => {
    if (!selectedTask || savingTask) return;
    setSavingTask(true);
    try {
      const updates: Partial<CalendarTask> = { ...editingTask };
      // Sync completed ↔ status
      if (updates.status === 'done') updates.completed = true;
      else if (updates.status === 'cancelled') updates.completed = false;
      else if (updates.status) updates.completed = false;
      // Normalize blocked_by: empty string → null for DB
      if ('blocked_by' in updates && !updates.blocked_by) (updates as any).blocked_by = null;
      await updateTask(selectedTask.id, updates);
      setSelectedTask(null);
    } catch (err) {
      errorLogger.error('Error actualizando tarea', err);
    } finally {
      setSavingTask(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('¿Eliminar esta tarea?')) return;
    try {
      await deleteTask(taskId);
      setSelectedTask(null);
    } catch (err) {
      errorLogger.error('Error eliminando tarea', err);
    }
  };

  // ─── Subtask CRUD ───
  const handleAddSubtask = async () => {
    if (!selectedTask || !newSubtaskTitle.trim() || addingSubtask) return;
    setAddingSubtask(true);
    try {
      await createTask({
        title: newSubtaskTitle.trim(),
        owner_id: user?.id || '',
        completed: false,
        priority: selectedTask.priority,
        status: 'todo',
        order_index: subtasksForSelected.length,
        parent_task_id: selectedTask.id,
        project_id: selectedTask.project_id,
      } as any);
      setNewSubtaskTitle('');
    } catch (err) {
      errorLogger.error('Error creando subtarea', err);
    } finally {
      setAddingSubtask(false);
    }
  };

  const handleToggleSubtask = async (subtaskId: string, completed: boolean) => {
    try {
      await updateTask(subtaskId, {
        completed,
        status: completed ? 'done' : 'todo',
      });
    } catch (err) {
      errorLogger.error('Error actualizando subtarea', err);
    }
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    try {
      await deleteTask(subtaskId);
    } catch (err) {
      errorLogger.error('Error eliminando subtarea', err);
    }
  };

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
        start_time: newTaskData.start_time || undefined,
        duration: newTaskData.duration || 60,
        project_id: newTaskData.project_id || undefined,
        client_id: newTaskData.client_id || undefined,
        assignee_id: newTaskData.assignee_id || undefined,
        completed: false,
        order_index: 0,
      } as any);

      setNewTaskData({
        title: '',
        description: '',
        start_date: '',
        start_time: '',
        priority: 'medium',
        status: 'todo',
        duration: 60,
        project_id: '',
        client_id: '',
        assignee_id: ''
      });
      setShowNewTaskForm(false);
    } catch (err) {
      errorLogger.error('Error creando tarea', err);
    }
  };

  // Alternar completado de tarea (sync status ↔ completed)
  const toggleTaskComplete = async (taskId: string, completed: boolean) => {
    try {
      await updateTask(taskId, {
        completed,
        status: completed ? 'done' : 'todo',
      });
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
        start_time: timeStr,
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
        const dayEvents = events.filter(e => e.start_date?.slice(0, 10) === day.dateStr);
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
    return contentEvents.filter(event => event.start_date?.slice(0, 10) === date);
  };

  const todayStr = new Date().toISOString().split('T')[0];

  const getDayTasks = (date: string) => {
    if (calendarMode === 'content') return [];
    // Exclude subtasks from calendar views (they show under their parent)
    let allTasks = getTasksByDate(date).filter(t => !t.parent_task_id);

    // On today: also include overdue tasks from past dates
    if (date === todayStr) {
      const overdue = tasks.filter(t =>
        !t.parent_task_id &&
        !t.completed &&
        t.status !== 'done' &&
        t.status !== 'cancelled' &&
        t.start_date &&
        t.start_date.slice(0, 10) < todayStr
      );
      // Merge without duplicates
      const existingIds = new Set(allTasks.map(t => t.id));
      allTasks = [...allTasks, ...overdue.filter(t => !existingIds.has(t.id))];
    }

    if (taskFilter === 'all') return allTasks;
    if (taskFilter === 'me') return allTasks.filter(t => t.assignee_id === user?.id || (!t.assignee_id && t.owner_id === user?.id));
    return allTasks.filter(t => t.assignee_id === taskFilter);
  };

  // Helper: how many days overdue is a task
  const getOverdueDays = (task: CalendarTask) => {
    if (!task.start_date || task.completed || task.status === 'done' || task.status === 'cancelled') return 0;
    const taskDate = task.start_date.slice(0, 10);
    if (taskDate >= todayStr) return 0;
    const diff = Math.ceil((new Date(todayStr).getTime() - new Date(taskDate).getTime()) / (1000 * 60 * 60 * 24));
    return diff;
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
      >
        <div className="p-5">
          {showNewEventForm ? (
            <div className="space-y-2.5" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { const title = calendarMode === 'content' ? newContentData.title : newEventData.title; if (title.trim()) { e.preventDefault(); calendarMode === 'content' ? handleCreateContent() : handleCreateEvent(); } } }}>
              {/* Title */}
              <input
                type="text"
                placeholder={calendarMode === 'content' ? 'Nombre del contenido...' : 'Nombre del evento...'}
                value={calendarMode === 'content' ? newContentData.title : newEventData.title}
                onChange={(e) => calendarMode === 'content'
                  ? setNewContentData({ ...newContentData, title: e.target.value })
                  : setNewEventData({ ...newEventData, title: e.target.value })
                }
                className="w-full px-3 py-2 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-400/10 text-sm font-medium text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 transition-all"
                autoFocus
              />

              {calendarMode === 'content' ? (
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-medium text-zinc-400 mb-1">Plataforma</label>
                    <select
                      value={newContentData.platform}
                      onChange={(e) => setNewContentData({ ...newContentData, platform: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-900 dark:text-zinc-100 transition-all"
                    >
                      {Object.entries(CONTENT_PLATFORMS).map(([key, value]) => (
                        <option key={key} value={key}>{value.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-zinc-400 mb-1">Canal</label>
                    <select
                      value={newContentData.channel}
                      onChange={(e) => setNewContentData({ ...newContentData, channel: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-900 dark:text-zinc-100 transition-all"
                    >
                      <option value="feed">Feed</option>
                      <option value="stories">Stories</option>
                      <option value="reels">Reels</option>
                      <option value="shorts">Shorts</option>
                      <option value="post">Post</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-zinc-400 mb-1">Estado</label>
                    <select
                      value={newContentData.status}
                      onChange={(e) => setNewContentData({ ...newContentData, status: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-900 dark:text-zinc-100 transition-all"
                    >
                      {CONTENT_STATUSES.map((s) => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-[10px] font-medium text-zinc-400 mb-1.5">Tipo</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {([
                      { value: 'meeting', label: 'Reunión', color: 'bg-blue-500', activeBg: 'bg-blue-50 dark:bg-blue-500/15 border-blue-300 dark:border-blue-500/40 text-blue-700 dark:text-blue-400' },
                      { value: 'call', label: 'Llamada', color: 'bg-emerald-500', activeBg: 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400' },
                      { value: 'deadline', label: 'Deadline', color: 'bg-red-500', activeBg: 'bg-red-50 dark:bg-red-500/15 border-red-300 dark:border-red-500/40 text-red-700 dark:text-red-400' },
                      { value: 'work-block', label: 'Bloque', color: 'bg-purple-500', activeBg: 'bg-purple-50 dark:bg-purple-500/15 border-purple-300 dark:border-purple-500/40 text-purple-700 dark:text-purple-400' },
                      { value: 'note', label: 'Nota', color: 'bg-amber-500', activeBg: 'bg-amber-50 dark:bg-amber-500/15 border-amber-300 dark:border-amber-500/40 text-amber-700 dark:text-amber-400' },
                    ] as const).map(t => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setNewEventData({ ...newEventData, type: t.value })}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all ${
                          newEventData.type === t.value
                            ? t.activeBg
                            : 'border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${t.color}`} />
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {calendarMode !== 'content' && (
                <div>
                  <label className="block text-[10px] font-medium text-zinc-400 mb-1">Ubicación</label>
                  <input
                    type="text"
                    placeholder="Zoom / Oficina / Link"
                    value={newEventData.location}
                    onChange={(e) => setNewEventData({ ...newEventData, location: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 transition-all"
                  />
                </div>
              )}

              {calendarMode === 'content' && (
                <div>
                  <label className="block text-[10px] font-medium text-zinc-400 mb-1">Asset</label>
                  <input
                    type="text"
                    placeholder="Carousel / Video / Copy"
                    value={newContentData.asset_type}
                    onChange={(e) => setNewContentData({ ...newContentData, asset_type: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 transition-all"
                  />
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-medium text-zinc-400 mb-1">Fecha</label>
                  <input
                    type="date"
                    value={calendarMode === 'content' ? newContentData.start_date : newEventData.start_date}
                    onChange={(e) => calendarMode === 'content'
                      ? setNewContentData({ ...newContentData, start_date: e.target.value })
                      : setNewEventData({ ...newEventData, start_date: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-900 dark:text-zinc-100 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-zinc-400 mb-1">Hora</label>
                  <input
                    type="time"
                    value={calendarMode === 'content' ? newContentData.start_time : newEventData.start_time}
                    onChange={(e) => calendarMode === 'content'
                      ? setNewContentData({ ...newContentData, start_time: e.target.value })
                      : setNewEventData({ ...newEventData, start_time: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-900 dark:text-zinc-100 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-zinc-400 mb-1">Duración</label>
                  <input
                    type="number"
                    value={calendarMode === 'content' ? newContentData.duration : newEventData.duration}
                    onChange={(e) => calendarMode === 'content'
                      ? setNewContentData({ ...newContentData, duration: parseInt(e.target.value) })
                      : setNewEventData({ ...newEventData, duration: parseInt(e.target.value) })
                    }
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-900 dark:text-zinc-100 transition-all"
                    min="15"
                    step="15"
                  />
                </div>
              </div>

              <input
                type="text"
                placeholder="Notas opcionales..."
                value={calendarMode === 'content' ? newContentData.description : newEventData.description}
                onChange={(e) => calendarMode === 'content'
                  ? setNewContentData({ ...newContentData, description: e.target.value })
                  : setNewEventData({ ...newEventData, description: e.target.value })
                }
                className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-500 dark:text-zinc-400 placeholder:text-zinc-400 transition-all"
              />

              {/* Actions */}
              <div className="flex items-center justify-between pt-0.5">
                <p className="text-[10px] text-zinc-400">Enter para crear</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowNewEventForm(false); }}
                    className="px-3 py-1.5 text-[11px] font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={calendarMode === 'content' ? handleCreateContent : handleCreateEvent}
                    disabled={calendarMode === 'content' ? !newContentData.title.trim() : !newEventData.title.trim()}
                    className="px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 rounded-lg text-[11px] font-semibold disabled:opacity-40 transition-all active:scale-[0.97] flex items-center gap-1.5"
                  >
                    <Icons.Calendar size={12} />
                    {calendarMode === 'content' ? 'Crear' : 'Crear Evento'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && newTaskData.title.trim()) { e.preventDefault(); handleCreateTask(); } }}>
              {/* Title */}
              <input
                type="text"
                placeholder="¿Qué hay que hacer?"
                value={newTaskData.title}
                onChange={(e) => setNewTaskData({ ...newTaskData, title: e.target.value })}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-400/10 text-sm font-medium text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 transition-all"
                autoFocus
              />

              {/* Priority pills */}
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 mb-1.5">Prioridad</label>
                <div className="flex gap-1.5">
                  {([
                    { value: 'low', label: 'Baja', color: 'bg-emerald-500', activeBg: 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400' },
                    { value: 'medium', label: 'Media', color: 'bg-blue-500', activeBg: 'bg-blue-50 dark:bg-blue-500/15 border-blue-300 dark:border-blue-500/40 text-blue-700 dark:text-blue-400' },
                    { value: 'high', label: 'Alta', color: 'bg-amber-500', activeBg: 'bg-amber-50 dark:bg-amber-500/15 border-amber-300 dark:border-amber-500/40 text-amber-700 dark:text-amber-400' },
                    { value: 'urgent', label: 'Urgente', color: 'bg-red-500', activeBg: 'bg-red-50 dark:bg-red-500/15 border-red-300 dark:border-red-500/40 text-red-700 dark:text-red-400' },
                  ] as const).map(p => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setNewTaskData({ ...newTaskData, priority: p.value })}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all ${
                        newTaskData.priority === p.value
                          ? p.activeBg
                          : 'border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${p.color}`} />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date + Time + Duration row */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-medium text-zinc-400 mb-1">Fecha</label>
                  <input
                    type="date"
                    value={newTaskData.start_date}
                    onChange={(e) => setNewTaskData({ ...newTaskData, start_date: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-900 dark:text-zinc-100 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-zinc-400 mb-1">Hora</label>
                  <input
                    type="time"
                    value={newTaskData.start_time}
                    onChange={(e) => setNewTaskData({ ...newTaskData, start_time: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-900 dark:text-zinc-100 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-zinc-400 mb-1">Duración</label>
                  <select
                    value={newTaskData.duration}
                    onChange={(e) => setNewTaskData({ ...newTaskData, duration: parseInt(e.target.value) })}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-900 dark:text-zinc-100 transition-all"
                  >
                    <option value="15">15 min</option>
                    <option value="30">30 min</option>
                    <option value="45">45 min</option>
                    <option value="60">1h</option>
                    <option value="90">1.5h</option>
                    <option value="120">2h</option>
                    <option value="180">3h</option>
                    <option value="240">4h</option>
                  </select>
                </div>
              </div>

              {/* Estado pills */}
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 mb-1.5">Estado</label>
                <div className="flex gap-1.5">
                  {([
                    { value: 'todo', label: 'Por hacer', color: 'bg-zinc-400', activeBg: 'bg-zinc-100 dark:bg-zinc-700/50 border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300' },
                    { value: 'in-progress', label: 'En progreso', color: 'bg-blue-500', activeBg: 'bg-blue-50 dark:bg-blue-500/15 border-blue-300 dark:border-blue-500/40 text-blue-700 dark:text-blue-400' },
                    { value: 'done', label: 'Hecho', color: 'bg-emerald-500', activeBg: 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400' },
                  ] as const).map(s => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setNewTaskData({ ...newTaskData, status: s.value })}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all ${
                        newTaskData.status === s.value
                          ? s.activeBg
                          : 'border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${s.color}`} />
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Project + Assignee */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-medium text-zinc-400 mb-1">Proyecto</label>
                  <select
                    value={newTaskData.project_id}
                    onChange={(e) => {
                      const pid = e.target.value;
                      const proj = projectOptions.find(p => p.id === pid) as any;
                      setNewTaskData(prev => ({
                        ...prev,
                        project_id: pid,
                        client_id: prev.client_id || proj?.client_id || ''
                      }));
                    }}
                    className={`w-full px-2.5 py-1.5 border rounded-lg outline-none text-xs transition-all ${
                      newTaskData.project_id
                        ? 'bg-violet-50 dark:bg-violet-500/10 border-violet-300 dark:border-violet-500/40 text-violet-700 dark:text-violet-400'
                        : 'bg-white dark:bg-zinc-800/80 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400'
                    }`}
                  >
                    <option value="">Sin proyecto</option>
                    {projectOptions.map((project) => (
                      <option key={project.id} value={project.id}>{project.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-zinc-400 mb-1">Cliente</label>
                  <select
                    value={newTaskData.client_id}
                    onChange={(e) => setNewTaskData({ ...newTaskData, client_id: e.target.value })}
                    className={`w-full px-2.5 py-1.5 border rounded-lg outline-none text-xs transition-all ${
                      newTaskData.client_id
                        ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400'
                        : 'bg-white dark:bg-zinc-800/80 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400'
                    }`}
                  >
                    <option value="">Sin cliente</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Assignee */}
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 mb-1">Asignar a</label>
                <select
                  value={newTaskData.assignee_id}
                  onChange={(e) => setNewTaskData({ ...newTaskData, assignee_id: e.target.value })}
                  className={`w-full px-2.5 py-1.5 border rounded-lg outline-none text-xs transition-all ${
                    newTaskData.assignee_id
                      ? 'bg-sky-50 dark:bg-sky-500/10 border-sky-300 dark:border-sky-500/40 text-sky-700 dark:text-sky-400'
                      : 'bg-white dark:bg-zinc-800/80 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  <option value="">Sin asignar</option>
                  {teamMembers.filter(m => m.status === 'active').map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.id === user?.id ? `${member.name || member.email} (Yo)` : (member.name || member.email)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <input
                type="text"
                placeholder="Notas opcionales..."
                value={newTaskData.description}
                onChange={(e) => setNewTaskData({ ...newTaskData, description: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-500 dark:text-zinc-400 placeholder:text-zinc-400 transition-all"
              />

              {/* Actions */}
              <div className="flex items-center justify-between pt-0.5">
                <p className="text-[10px] text-zinc-400">Enter para crear</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowNewTaskForm(false); }}
                    className="px-3 py-1.5 text-[11px] font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateTask}
                    disabled={!newTaskData.title.trim()}
                    className="px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 rounded-lg text-[11px] font-semibold disabled:opacity-40 transition-all active:scale-[0.97] flex items-center gap-1.5"
                  >
                    <Icons.Check size={12} />
                    Crear Tarea
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </SlidePanel>

      {/* Task Detail / Edit Panel */}
      <SlidePanel
        isOpen={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        title="Detalle de Tarea"
        width="sm"
        footer={
          <div className="flex items-center justify-between">
            <button
              onClick={() => selectedTask && handleDeleteTask(selectedTask.id)}
              className="px-3 py-1.5 text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Icons.Trash size={12} />
              Eliminar
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedTask(null)}
                className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveTaskEdit}
                disabled={savingTask}
                className="px-4 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 transition-all flex items-center gap-1.5"
              >
                {savingTask ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Icons.Check size={13} />}
                {savingTask ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        }
      >
        {selectedTask && (
          <div className="p-5 space-y-3">
            {/* Title */}
            <input
              type="text"
              value={editingTask.title || ''}
              onChange={e => setEditingTask({ ...editingTask, title: e.target.value })}
              className="w-full px-3 py-2 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10 text-sm font-medium text-zinc-900 dark:text-zinc-100 transition-all"
            />

            {/* Blocked banner */}
            {isTaskBlocked(selectedTask) && (() => {
              const blocker = getBlockerTask(selectedTask);
              const blockerOwner = blocker?.assignee_id ? getMemberName(blocker.assignee_id) : null;
              const blockerAvatar = blocker?.assignee_id ? getMemberAvatar(blocker.assignee_id) : null;
              return (
                <div className="px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-amber-400 flex items-center justify-center flex-shrink-0">
                      <Icons.Lock size={14} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Bloqueada</span>
                      {blocker && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400/80 truncate mt-0.5">
                          Esperando: <span className="font-semibold">{blocker.title}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  {blocker && (
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-amber-200 dark:border-amber-500/20">
                      {blockerOwner ? (
                        <>
                          {blockerAvatar ? (
                            <img src={blockerAvatar} alt="" className="w-5 h-5 rounded-full" />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-amber-200 dark:bg-amber-500/20 flex items-center justify-center text-[9px] font-bold text-amber-700 dark:text-amber-300">
                              {(blockerOwner || '?')[0]?.toUpperCase()}
                            </div>
                          )}
                          <span className="text-[10px] text-amber-700 dark:text-amber-400">
                            <span className="font-semibold">{blockerOwner}</span> necesita completar esta tarea primero
                          </span>
                        </>
                      ) : (
                        <span className="text-[10px] text-amber-600/80 dark:text-amber-400/60 italic">
                          La tarea bloqueante no tiene asignado — asignala para destrabar el flujo
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Completed toggle */}
            <button
              onClick={() => toggleTaskComplete(selectedTask.id, !selectedTask.completed)}
              className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg border transition-all ${
                selectedTask.completed
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30'
                  : 'bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-700 hover:border-zinc-300'
              }`}
            >
              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                selectedTask.completed ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-300 dark:border-zinc-600'
              }`}>
                {selectedTask.completed && <Icons.Check size={12} className="text-white" />}
              </div>
              <span className={`text-xs font-medium ${selectedTask.completed ? 'text-emerald-600 dark:text-emerald-400 line-through' : 'text-zinc-600 dark:text-zinc-400'}`}>
                {selectedTask.completed ? 'Completada' : 'Marcar como completada'}
              </span>
            </button>

            {/* Priority pills */}
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 mb-1.5">Prioridad</label>
              <div className="flex gap-1.5">
                {([
                  { value: 'low', label: 'Baja', color: 'bg-emerald-500', activeBg: 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400' },
                  { value: 'medium', label: 'Media', color: 'bg-blue-500', activeBg: 'bg-blue-50 dark:bg-blue-500/15 border-blue-300 dark:border-blue-500/40 text-blue-700 dark:text-blue-400' },
                  { value: 'high', label: 'Alta', color: 'bg-amber-500', activeBg: 'bg-amber-50 dark:bg-amber-500/15 border-amber-300 dark:border-amber-500/40 text-amber-700 dark:text-amber-400' },
                  { value: 'urgent', label: 'Urgente', color: 'bg-red-500', activeBg: 'bg-red-50 dark:bg-red-500/15 border-red-300 dark:border-red-500/40 text-red-700 dark:text-red-400' },
                ] as const).map(p => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setEditingTask({ ...editingTask, priority: p.value })}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all ${
                      editingTask.priority === p.value
                        ? p.activeBg
                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${p.color}`} />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Status pills */}
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 mb-1.5">Estado</label>
              <div className="flex gap-1.5">
                {([
                  { value: 'todo', label: 'Por hacer', color: 'bg-zinc-400', activeBg: 'bg-zinc-100 dark:bg-zinc-700/50 border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300' },
                  { value: 'in-progress', label: 'En progreso', color: 'bg-blue-500', activeBg: 'bg-blue-50 dark:bg-blue-500/15 border-blue-300 dark:border-blue-500/40 text-blue-700 dark:text-blue-400' },
                  { value: 'done', label: 'Hecho', color: 'bg-emerald-500', activeBg: 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400' },
                  { value: 'cancelled', label: 'Cancelado', color: 'bg-red-400', activeBg: 'bg-red-50 dark:bg-red-500/15 border-red-300 dark:border-red-500/40 text-red-600 dark:text-red-400' },
                ] as const).map(s => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setEditingTask({ ...editingTask, status: s.value })}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all ${
                      editingTask.status === s.value
                        ? s.activeBg
                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${s.color}`} />
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date + Time + Duration */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 mb-1">Fecha</label>
                <input
                  type="date"
                  value={editingTask.start_date || ''}
                  onChange={e => setEditingTask({ ...editingTask, start_date: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-900 dark:text-zinc-100 transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 mb-1">Hora</label>
                <input
                  type="time"
                  value={editingTask.start_time || ''}
                  onChange={e => setEditingTask({ ...editingTask, start_time: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-900 dark:text-zinc-100 transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 mb-1">Duración</label>
                <select
                  value={editingTask.duration || 60}
                  onChange={e => setEditingTask({ ...editingTask, duration: parseInt(e.target.value) })}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-900 dark:text-zinc-100 transition-all"
                >
                  <option value="15">15 min</option>
                  <option value="30">30 min</option>
                  <option value="45">45 min</option>
                  <option value="60">1h</option>
                  <option value="90">1.5h</option>
                  <option value="120">2h</option>
                  <option value="180">3h</option>
                  <option value="240">4h</option>
                </select>
              </div>
            </div>

            {/* Project + Assignee */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 mb-1">Proyecto</label>
                <select
                  value={editingTask.project_id || ''}
                  onChange={e => setEditingTask({ ...editingTask, project_id: e.target.value })}
                  className={`w-full px-2.5 py-1.5 border rounded-lg outline-none text-xs transition-all ${
                    editingTask.project_id
                      ? 'bg-violet-50 dark:bg-violet-500/10 border-violet-300 dark:border-violet-500/40 text-violet-700 dark:text-violet-400'
                      : 'bg-white dark:bg-zinc-800/80 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  <option value="">Sin proyecto</option>
                  {projectOptions.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 mb-1">Asignar a</label>
                <select
                  value={editingTask.assignee_id || ''}
                  onChange={e => setEditingTask({ ...editingTask, assignee_id: e.target.value })}
                  className={`w-full px-2.5 py-1.5 border rounded-lg outline-none text-xs transition-all ${
                    editingTask.assignee_id
                      ? 'bg-sky-50 dark:bg-sky-500/10 border-sky-300 dark:border-sky-500/40 text-sky-700 dark:text-sky-400'
                      : 'bg-white dark:bg-zinc-800/80 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  <option value="">Sin asignar</option>
                  {teamMembers.filter(m => m.status === 'active').map(m => (
                    <option key={m.id} value={m.id}>{m.id === user?.id ? `${m.name || m.email} (Yo)` : (m.name || m.email)}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Client indicator */}
            {selectedTask?.client_id && getClientLabel(selectedTask) && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-lg">
                <Icons.User size={12} className="text-emerald-500" />
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  Cliente: {getClientLabel(selectedTask)}
                </span>
              </div>
            )}

            {/* Description */}
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 mb-1">Descripción</label>
              <textarea
                value={editingTask.description || ''}
                onChange={e => setEditingTask({ ...editingTask, description: e.target.value })}
                placeholder="Detalles, notas, contexto..."
                className="w-full px-2.5 py-2 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/10 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 resize-none transition-all"
                rows={2}
              />
            </div>

            {/* Subtasks */}
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 mb-1.5">
                Subtareas ({subtasksForSelected.filter(s => s.completed).length}/{subtasksForSelected.length})
              </label>
              {subtasksForSelected.length > 0 && (
                <div className="mb-2 rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                  <AnimatePresence initial={false}>
                    {subtasksForSelected
                      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
                      .map((sub) => {
                        const subBlocked = isTaskBlocked(sub);
                        return (
                      <motion.div
                        key={sub.id}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className={`flex items-center gap-2 px-2.5 py-1.5 border-b border-zinc-100 dark:border-zinc-800 last:border-b-0 group ${
                          subBlocked ? 'bg-amber-50/50 dark:bg-amber-500/5' : ''
                        }`}
                      >
                        {subBlocked ? (
                          <div className="w-4 h-4 rounded border-2 border-amber-300 dark:border-amber-500/40 flex items-center justify-center flex-shrink-0" title="Bloqueada por dependencia">
                            <Icons.Lock size={8} className="text-amber-500" />
                          </div>
                        ) : (
                        <button
                          onClick={() => handleToggleSubtask(sub.id, !sub.completed)}
                          className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                            sub.completed
                              ? 'bg-emerald-500 border-emerald-500'
                              : 'border-zinc-300 dark:border-zinc-600 hover:border-emerald-400'
                          }`}
                        >
                          {sub.completed && <Icons.Check size={10} className="text-white" />}
                        </button>
                        )}
                        <span className={`flex-1 text-xs truncate ${
                          subBlocked ? 'text-amber-600 dark:text-amber-400/70' :
                          sub.completed ? 'text-zinc-400 line-through' : 'text-zinc-700 dark:text-zinc-300'
                        }`}>
                          {sub.title}
                        </span>
                        {subBlocked && (
                          <span className="text-[9px] text-amber-500 font-medium flex-shrink-0">bloqueada</span>
                        )}
                        <button
                          onClick={() => handleDeleteSubtask(sub.id)}
                          className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 transition-all p-0.5"
                        >
                          <Icons.X size={10} />
                        </button>
                      </motion.div>
                        );
                    })}
                  </AnimatePresence>
                </div>
              )}
              {/* Add subtask inline */}
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="Agregar subtarea..."
                  value={newSubtaskTitle}
                  onChange={e => setNewSubtaskTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddSubtask(); }}
                  className="flex-1 px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:border-blue-400 text-xs text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400 transition-all"
                />
                {newSubtaskTitle.trim() && (
                  <button
                    onClick={handleAddSubtask}
                    disabled={addingSubtask}
                    className="px-2 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg text-[10px] font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-40 transition-all"
                  >
                    {addingSubtask ? '...' : '+'}
                  </button>
                )}
              </div>
              {/* Subtask progress bar */}
              {subtasksForSelected.length > 0 && (
                <div className="mt-1.5 w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-1">
                  <div
                    className="bg-emerald-500 h-1 rounded-full transition-all duration-300"
                    style={{ width: `${Math.round((subtasksForSelected.filter(s => s.completed).length / subtasksForSelected.length) * 100)}%` }}
                  />
                </div>
              )}
            </div>

            {/* Dependency selector */}
            <div className="space-y-2">
              <label className="text-[10px] font-medium text-zinc-400 mb-1 flex items-center gap-1">
                <Icons.Link size={10} />
                Dependencia
              </label>
              <select
                value={editingTask.blocked_by || ''}
                onChange={e => setEditingTask({ ...editingTask, blocked_by: e.target.value || undefined })}
                className={`w-full px-2.5 py-1.5 border rounded-lg outline-none text-xs transition-all ${
                  editingTask.blocked_by
                    ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/40 text-amber-700 dark:text-amber-400'
                    : 'bg-white dark:bg-zinc-800/80 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400'
                }`}
              >
                <option value="">Sin dependencia</option>
                {tasks
                  .filter(t => t.id !== selectedTask.id && !t.parent_task_id)
                  .sort((a, b) => a.title.localeCompare(b.title))
                  .map(t => {
                    const owner = t.assignee_id ? getMemberName(t.assignee_id) : null;
                    return (
                      <option key={t.id} value={t.id}>
                        {t.completed ? '\u2713 ' : '\u25CB '}{t.title}{owner ? ` — ${owner}` : ''}
                      </option>
                    );
                  })}
              </select>

              {/* Active dependency detail card */}
              {editingTask.blocked_by && (() => {
                const blocker = tasks.find(t => t.id === editingTask.blocked_by);
                if (!blocker) return null;
                const blockerOwner = blocker.assignee_id ? getMemberName(blocker.assignee_id) : null;
                const blockerAvatar = blocker.assignee_id ? getMemberAvatar(blocker.assignee_id) : null;
                const isResolved = blocker.completed;
                return (
                  <div className={`p-2.5 rounded-lg border ${
                    isResolved
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30'
                      : 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30'
                  }`}>
                    <div className="flex items-start gap-2">
                      <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        isResolved ? 'bg-emerald-500' : 'bg-amber-400'
                      }`}>
                        {isResolved
                          ? <Icons.Check size={11} className="text-white" />
                          : <Icons.Lock size={10} className="text-white" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-semibold ${
                          isResolved ? 'text-emerald-700 dark:text-emerald-400 line-through' : 'text-amber-700 dark:text-amber-400'
                        }`}>
                          {blocker.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {blockerOwner && (
                            <div className="flex items-center gap-1">
                              {blockerAvatar ? (
                                <img src={blockerAvatar} alt="" className="w-3.5 h-3.5 rounded-full" />
                              ) : (
                                <div className="w-3.5 h-3.5 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-[7px] font-bold text-violet-700 dark:text-violet-300">
                                  {(blockerOwner || '?')[0]?.toUpperCase()}
                                </div>
                              )}
                              <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-400">
                                {blockerOwner}
                              </span>
                            </div>
                          )}
                          {!blockerOwner && (
                            <span className="text-[10px] text-zinc-400 italic">Sin asignar</span>
                          )}
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                            isResolved
                              ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                              : blocker.status === 'in-progress'
                                ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400'
                                : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400'
                          }`}>
                            {isResolved ? 'Completada' : blocker.status === 'in-progress' ? 'En progreso' : 'Pendiente'}
                          </span>
                        </div>
                        {!isResolved && (
                          <p className="text-[10px] text-amber-600/80 dark:text-amber-400/60 mt-1">
                            {blockerOwner
                              ? `${blockerOwner} necesita completar esta tarea primero`
                              : 'Esta tarea debe completarse antes de avanzar'}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Dependent tasks (reverse: tasks blocked by this one) */}
              {(() => {
                const dependents = getDependentTasks(selectedTask.id);
                if (dependents.length === 0) return null;
                return (
                  <div className="p-2.5 bg-zinc-50 dark:bg-zinc-800/40 rounded-lg border border-zinc-200 dark:border-zinc-700">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Icons.ChevronRight size={10} className="text-zinc-400" />
                      <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Bloquea a {dependents.length} tarea{dependents.length > 1 ? 's' : ''}</span>
                    </div>
                    <div className="space-y-1.5">
                      {dependents.map(d => {
                        const depOwner = d.assignee_id ? getMemberName(d.assignee_id) : null;
                        const depAvatar = d.assignee_id ? getMemberAvatar(d.assignee_id) : null;
                        return (
                          <div key={d.id} className="flex items-center gap-2 py-1 px-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700/40 transition-colors cursor-pointer"
                            onClick={() => handleOpenTaskDetail(d)}>
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${d.completed ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'}`} />
                            <span className={`text-[11px] flex-1 truncate ${d.completed ? 'text-zinc-400 line-through' : 'text-zinc-700 dark:text-zinc-300'}`}>
                              {d.title}
                            </span>
                            {depOwner && (
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {depAvatar ? (
                                  <img src={depAvatar} alt="" className="w-3.5 h-3.5 rounded-full" />
                                ) : (
                                  <div className="w-3.5 h-3.5 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-[7px] font-bold text-violet-700 dark:text-violet-300">
                                    {(depOwner || '?')[0]?.toUpperCase()}
                                  </div>
                                )}
                                <span className="text-[10px] text-zinc-500 dark:text-zinc-400">{depOwner}</span>
                              </div>
                            )}
                            {!depOwner && !d.completed && (
                              <span className="text-[9px] text-zinc-400 italic flex-shrink-0">sin asignar</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {!selectedTask.completed && dependents.some(d => !d.completed) && (
                      <p className="text-[10px] text-amber-600/80 dark:text-amber-400/60 mt-2 pt-1.5 border-t border-zinc-200 dark:border-zinc-700">
                        {dependents.filter(d => !d.completed).length} persona{dependents.filter(d => !d.completed).length > 1 ? 's esperan' : ' espera'} que completes esta tarea para avanzar
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Meta info */}
            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center justify-between text-[10px] text-zinc-400">
                <span>Creada: {new Date(selectedTask.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                <span className="font-mono text-zinc-300 dark:text-zinc-600">{selectedTask.id.slice(0, 8)}</span>
              </div>
            </div>
          </div>
        )}
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
              Tareas
            </div>
            {weekDays.map((day, dayIndex) => {
              const dateStr = day.toISOString().split('T')[0];
              const unscheduledTasks = getDayTasks(dateStr).filter(t => !t.start_time);
              return (
                <div
                  key={dayIndex}
                  className={`p-1.5 min-h-[44px] border-r border-zinc-100 dark:border-zinc-700 transition-colors ${
                    draggingTaskId ? 'bg-blue-50/30 dark:bg-blue-900/5' : ''
                  }`}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleTaskDrop(e, dateStr)}
                >
                  {unscheduledTasks.map(task => {
                    const tc = getTaskColor(task);
                    const overdue = getOverdueDays(task);
                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => handleTaskDragStart(e, task.id)}
                        onDragEnd={() => setDraggingTaskId(null)}
                        className={`text-[10px] px-1.5 py-1 rounded mb-0.5 cursor-grab active:cursor-grabbing border ${tc.bg} ${tc.border} ${
                          task.completed ? 'line-through opacity-50' : ''
                        } ${task.status === 'in-progress' ? 'border-l-[3px]' : ''}`}
                        title={`${task.title}${isTaskBlocked(task) ? ' ⚠ BLOQUEADA' : ''} [${task.priority}/${task.status}]${overdue > 0 ? ` — ${overdue}d demorada` : ''}`}
                        onClick={() => handleOpenTaskDetail(task)}
                      >
                        <div className={`font-medium flex items-center gap-1 ${tc.text} truncate`}>
                          {isTaskBlocked(task) ? (
                            <Icons.Lock size={8} className="text-amber-500 shrink-0" />
                          ) : (
                            <span className={`w-1 h-1 rounded-full ${tc.dot} shrink-0`} />
                          )}
                          <span className="truncate">{task.title}</span>
                          {overdue > 0 && (
                            <span className="ml-auto text-[8px] font-bold text-red-500 bg-red-50 dark:bg-red-500/10 px-1 rounded shrink-0">
                              +{overdue}d
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Cuerpo del calendario (horas) */}
          <div className="max-h-[420px] overflow-y-auto">
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
                  const isDragTarget = draggingTaskId !== null;

                  return (
                    <div
                      key={dayIndex}
                      className={`p-2 min-h-12 border-r border-zinc-100 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors relative cursor-pointer ${
                        isSelected ? 'ring-2 ring-inset ring-blue-500 bg-blue-500/10' : ''
                      } ${isDragTarget ? 'hover:bg-blue-50/50 dark:hover:bg-blue-900/10' : ''}`}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleTaskDrop(e, dateStr, hour)}
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
                      {hourTasks.map((task) => {
                        const tc = getTaskColor(task);
                        const overdue = getOverdueDays(task);
                        return (
                          <div
                            key={task.id}
                            draggable
                            onDragStart={(e) => handleTaskDragStart(e, task.id)}
                            onDragEnd={() => setDraggingTaskId(null)}
                            className={`text-xs p-1.5 rounded mb-1 cursor-grab active:cursor-grabbing border ${tc.bg} ${tc.border} ${
                              task.completed || task.status === 'done' ? 'line-through opacity-60' : ''
                            } ${task.status === 'cancelled' ? 'line-through opacity-50' : ''} ${
                              task.status === 'in-progress' ? 'border-l-[3px]' : ''
                            }`}
                            title={`${task.title}${task.assignee_id ? ` — ${getMemberName(task.assignee_id)}` : ''}${getClientLabel(task) ? ` · ${getClientLabel(task)}` : ''}${isTaskBlocked(task) ? ` ⚠ BLOQUEADA — esperando: ${getBlockerTask(task)?.title || '?'}${getBlockerTask(task)?.assignee_id ? ` (${getMemberName(getBlockerTask(task)!.assignee_id)})` : ''}` : ''} [${task.priority}/${task.status}]${overdue > 0 ? ` — ${overdue}d demorada` : ''}`}
                            onClick={(e) => { e.stopPropagation(); handleOpenTaskDetail(task); }}
                          >
                            <div className={`font-medium flex items-center gap-1 ${tc.text} truncate`}>
                              {isTaskBlocked(task) ? (
                                <Icons.Lock size={9} className="text-amber-500 shrink-0" />
                              ) : (
                                <span className={`w-1.5 h-1.5 rounded-full ${tc.dot} shrink-0`} />
                              )}
                              {task.title}
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
                                    {blOwner ? `Esp. ${blOwner}` : `Esp: ${bl?.title?.slice(0, 20) || '?'}`}
                                  </span>
                                );
                              })()}
                              {getClientLabel(task) && (
                                <span className="text-[8px] text-emerald-600 dark:text-emerald-400 font-medium ml-auto truncate">
                                  {getClientLabel(task)}
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
                  onDoubleClick={(e) => {
                    setSlotPopover({
                      clickX: e.clientX,
                      clickY: e.clientY,
                      date: dateStr,
                      hour: 9,
                    });
                  }}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleTaskDrop(e, dateStr)}
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
                          onDragStart={(e) => handleTaskDragStart(e, task.id)}
                          onDragEnd={() => setDraggingTaskId(null)}
                          className={`text-[10px] px-1.5 py-0.5 rounded truncate flex items-center gap-1 border cursor-grab active:cursor-grabbing ${tc.bg} ${tc.border} ${
                            task.completed ? 'line-through opacity-50' : ''
                          }`}
                          onClick={(e) => { e.stopPropagation(); handleOpenTaskDetail(task); }}
                        >
                          <span className={`w-1 h-1 rounded-full ${tc.dot} shrink-0`} />
                          <span className={`${tc.text} truncate`}>{task.title}</span>
                          {overdue > 0 && (
                            <span className="ml-auto text-[8px] font-bold text-red-500 shrink-0">+{overdue}d</span>
                          )}
                        </div>
                      );
                    })}
                    {totalItems > maxVisible && (
                      <div className="text-[10px] text-zinc-400 pl-1">+{totalItems - maxVisible} más</div>
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
                          className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg group cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors"
                          onClick={() => handleOpenTaskDetail(task)}
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
                      {getClientLabel(task) && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5">
                          {getClientLabel(task)}
                        </span>
                      )}
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
