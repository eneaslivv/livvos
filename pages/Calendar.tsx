import React, { useState, useEffect, useRef } from 'react';
import { useCalendar, CalendarEvent, CalendarTask } from '../hooks/useCalendar';
import { useAuth } from '../hooks/useAuth';
import { errorLogger } from '../lib/errorLogger';
import { supabase } from '../lib/supabase';
import { useSupabase } from '../hooks/useSupabase';
import { TimeSlotPopover } from '../components/calendar/TimeSlotPopover';
import { GoogleCalendarSettings } from '../components/calendar/GoogleCalendarSettings';
import { useGoogleCalendar } from '../hooks/useGoogleCalendar';
import { useTeam } from '../context/TeamContext';
import { useClients } from '../context/ClientsContext';
import { generateWeeklySummaryFromAI, generatePlanFromAI, PlanAIResult } from '../lib/ai';
import { CalendarHeader } from '../components/calendar/CalendarHeader';
import { AiWeeklySummary } from '../components/calendar/AiWeeklySummary';
import { AiPlanPreview } from '../components/calendar/AiPlanPreview';
import { PlanningPreferences } from '../components/calendar/PlanningPreferences';
import { EventTaskFormPanel } from '../components/calendar/EventTaskFormPanel';
import { TaskDetailPanel } from '../components/calendar/TaskDetailPanel';
import { WeekView } from '../components/calendar/WeekView';
import { MonthView } from '../components/calendar/MonthView';
import { ContentPlannerBoard } from '../components/calendar/ContentPlannerBoard';
import { SelectedDatePanel } from '../components/calendar/SelectedDatePanel';
import { TimezoneBar } from '../components/calendar/TimezoneBar';
import { Icons } from '../components/ui/Icons';

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
    getEventsByDateRange,
    getTasksByDateRange
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

  // 'all' = see all, 'me' = only my tasks, uuid = specific member
  const [taskFilter, setTaskFilter] = useState<'all' | 'me' | string>('all');

  // Timezone state
  const [showTimezones, setShowTimezones] = useState(() => localStorage.getItem('cal-tz-bar') === '1');
  const [activeTimezone, setActiveTimezone] = useState<string | null>(null);
  const hasClientTimezones = clients.some(c => !!c.timezone);

  const clientTimezoneMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of clients) {
      if (c.timezone) map[c.id] = c.timezone;
    }
    return map;
  }, [clients]);

  const toggleTimezones = () => {
    setShowTimezones(prev => {
      const next = !prev;
      localStorage.setItem('cal-tz-bar', next ? '1' : '0');
      if (!next) setActiveTimezone(null);
      return next;
    });
  };

  // Quick member map for resolving names/avatars
  const memberMap = teamMembers.reduce<Record<string, { name: string | null; avatar_url: string | null }>>((acc, m) => {
    acc[m.id] = { name: m.name, avatar_url: m.avatar_url };
    return acc;
  }, {});

  const getMemberName = (id?: string) => {
    if (!id) return null;
    if (id === user?.id) return 'Me';
    return memberMap[id]?.name || 'Member';
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

  // AI Plan state
  const [aiPlan, setAiPlan] = useState<PlanAIResult | null>(null);
  const [aiPlanLoading, setAiPlanLoading] = useState(false);
  const [aiPlanApplying, setAiPlanApplying] = useState(false);
  const [aiPlanError, setAiPlanError] = useState<string | null>(null);
  const [planPreferences, setPlanPreferences] = useState('');
  const [showPlanPrefs, setShowPlanPrefs] = useState(false);

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
    type: 'meeting' as CalendarEvent['type'],
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

  // Helper: color = priority (base color) + status (visual modifier)
  // done → green, cancelled → red/faded, active → priority color
  // in-progress adds left border accent
  const getTaskColor = (task: CalendarTask) => {
    if (task.completed || task.status === 'done') {
      return { bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-700/40', text: 'text-emerald-600/70 dark:text-emerald-400/60', dot: 'bg-emerald-400' };
    }
    if (task.status === 'cancelled') {
      return { bg: 'bg-red-50/50 dark:bg-red-900/10', border: 'border-red-200/50 dark:border-red-800/30', text: 'text-red-400 dark:text-red-500', dot: 'bg-red-300' };
    }
    // Active tasks (todo / in-progress): priority determines color
    switch (task.priority) {
      case 'urgent': return { bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-300 dark:border-red-800', text: 'text-red-700 dark:text-red-300', dot: 'bg-red-500' };
      case 'high': return { bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-300 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' };
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
      client_id: task.client_id || '',
      assignee_id: task.assignee_id || '',
      blocked_by: task.blocked_by || '',
    });
  };

  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSaveTaskEdit = async () => {
    if (!selectedTask || savingTask) return;
    setSavingTask(true);
    setSaveError(null);
    try {
      const updates: Partial<CalendarTask> = { ...editingTask };
      // Sync completed <-> status
      if (updates.status === 'done') updates.completed = true;
      else if (updates.status === 'cancelled') updates.completed = false;
      else if (updates.status) updates.completed = false;
      // Normalize FK fields: empty string -> null for DB
      if ('blocked_by' in updates && !updates.blocked_by) (updates as any).blocked_by = null;
      if ('project_id' in updates && !updates.project_id) (updates as any).project_id = null;
      if ('client_id' in updates && !(updates as any).client_id) (updates as any).client_id = null;
      if ('assignee_id' in updates && !updates.assignee_id) (updates as any).assignee_id = null;
      if (import.meta.env.DEV) console.log('[TaskEdit] saving:', JSON.stringify(updates, null, 2));
      await updateTask(selectedTask.id, updates);
      setSelectedTask(null);
    } catch (err) {
      const msg = (err as Error).message || 'Unknown error';
      errorLogger.error('Error actualizando tarea', err);
      setSaveError(msg);
      if (import.meta.env.DEV) console.error('[TaskEdit] save failed:', msg);
    } finally {
      setSavingTask(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Delete this task?')) return;
    try {
      await deleteTask(taskId);
      setSelectedTask(null);
    } catch (err) {
      errorLogger.error('Error eliminando tarea', err);
    }
  };

  // Subtask CRUD
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

  // Get current week
  const getWeekDays = () => {
    const ref = new Date(currentDate);
    const startOfWeek = new Date(ref);
    const day = ref.getDay();
    const diff = ref.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);

    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      weekDays.push(date);
    }
    return weekDays;
  };

  const navigateCalendar = (direction: -1 | 1) => {
    setCurrentDate(prev => {
      const next = new Date(prev);
      if (view === 'week') next.setDate(next.getDate() + direction * 7);
      else next.setMonth(next.getMonth() + direction);
      return next;
    });
  };

  const goToToday = () => setCurrentDate(new Date());

  const getPeriodLabel = () => {
    if (view === 'week') {
      const days = getWeekDays();
      const first = days[0], last = days[6];
      const sameMonth = first.getMonth() === last.getMonth();
      const opts: Intl.DateTimeFormatOptions = { month: 'short' };
      if (sameMonth) {
        return `${first.getDate()} - ${last.getDate()} ${first.toLocaleDateString('en-US', opts)} ${first.getFullYear()}`;
      }
      return `${first.getDate()} ${first.toLocaleDateString('en-US', opts)} - ${last.getDate()} ${last.toLocaleDateString('en-US', opts)} ${last.getFullYear()}`;
    }
    const label = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
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

  // Get hours of the day
  const getHours = () => {
    const hours = [];
    for (let i = 0; i <= 23; i++) {
      hours.push(i);
    }
    return hours;
  };

  // Create event
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
      alert('Error creating event: ' + (err as Error).message);
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
      alert('Error creating content: ' + (err as Error).message);
    }
  };

  // Create task
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

  // Toggle task complete (sync status <-> completed)
  const toggleTaskComplete = async (taskId: string, completed: boolean) => {
    try {
      const completedAt = completed ? new Date().toISOString() : null;
      await updateTask(taskId, {
        completed,
        status: completed ? 'done' : 'todo',
        completed_at: completedAt,
      } as any);
      // Update selectedTask in place so detail panel reflects change immediately
      if (selectedTask?.id === taskId) {
        setSelectedTask(prev => prev ? { ...prev, completed, status: completed ? 'done' : 'todo', completed_at: completedAt } : prev);
      }
    } catch (err: any) {
      errorLogger.error('Error actualizando tarea', err);
      alert('Error updating task: ' + (err?.message || 'Unknown error'));
    }
  };

  // Handler for click-to-create from time slot
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

  // Generate AI weekly summary
  const handleGenerateAiSummary = async (customExtra?: string) => {
    setAiSummaryLoading(true);
    setAiSummaryError(null);
    try {
      const weekDaysList = getWeekDays();
      const weekEvents: string[] = [];
      const weekTasks: string[] = [];

      weekDaysList.forEach(day => {
        const dayDateStr = day.toISOString().split('T')[0];
        const dayEvents = events.filter(e => e.start_date?.slice(0, 10) === dayDateStr);
        const dayTasks = getTasksByDate(dayDateStr);
        dayEvents.forEach(e => weekEvents.push(`${dayDateStr}: ${e.title} (${e.type})`));
        dayTasks.forEach(t => weekTasks.push(`${dayDateStr}: ${t.title} [${t.priority}] ${t.completed ? '(completed)' : '(pending)'}`));
      });

      const firstDateStr = weekDaysList[0]?.toISOString().split('T')[0] || '';
      const lastDateStr = weekDaysList[6]?.toISOString().split('T')[0] || '';

      const contextParts = [
        `Week from ${firstDateStr} to ${lastDateStr}`,
        weekEvents.length > 0 ? `Events of the week:\n${weekEvents.join('\n')}` : 'No events scheduled this week.',
        weekTasks.length > 0 ? `Tasks of the week:\n${weekTasks.join('\n')}` : 'No tasks assigned this week.',
      ];

      if (customExtra?.trim()) {
        contextParts.push(`Additional user instructions: ${customExtra.trim()}`);
      }

      const result = await generateWeeklySummaryFromAI(contextParts.join('\n\n'));
      setAiSummary(result);
      setAiSummaryExpanded(true);
      setShowAiPromptInput(false);
      setAiCustomPrompt('');
    } catch (err: any) {
      errorLogger.error('Error generating AI summary', err);
      setAiSummaryError(err.message || 'Error generating summary');
    } finally {
      setAiSummaryLoading(false);
    }
  };

  // Load planning preferences on mount
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('planning_preferences')
      .select('preferences')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.preferences) setPlanPreferences(data.preferences);
      });
  }, [user?.id]);

  // Generate AI Plan
  const handleGenerateAiPlan = async () => {
    setAiPlanLoading(true);
    setAiPlanError(null);
    try {
      let startDate: string;
      let endDate: string;
      let periodLabel: string;

      if (view === 'month') {
        const y = currentDate.getFullYear();
        const m = currentDate.getMonth();
        startDate = `${y}-${String(m + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(y, m + 1, 0).getDate();
        endDate = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        periodLabel = 'month';
      } else {
        const days = getWeekDays();
        startDate = days[0].toISOString().split('T')[0];
        endDate = days[6].toISOString().split('T')[0];
        periodLabel = 'week';
      }

      // Get tasks for the period — exclude done/cancelled
      const rangeTasks = getTasksByDateRange(startDate, endDate)
        .filter(t => !t.completed && t.status !== 'done' && t.status !== 'cancelled' && !t.parent_task_id);

      // Also get unscheduled tasks (no date)
      const unscheduledTasks = tasks.filter(t =>
        !t.start_date && !t.completed && t.status !== 'done' && t.status !== 'cancelled' && !t.parent_task_id
      );

      // Cap at 25 tasks to stay within Gemini output token limits
      // Sort: urgent/high priority first, then by date
      const sortedTasks = [...rangeTasks, ...unscheduledTasks].sort((a, b) => {
        const prio: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
        return (prio[a.priority || 'medium'] ?? 2) - (prio[b.priority || 'medium'] ?? 2);
      });
      const allPlanTasks = sortedTasks.slice(0, 25);

      if (allPlanTasks.length === 0) {
        setAiPlan({ changes: [], summary: 'No pending tasks found for this period.' });
        setAiPlanLoading(false);
        return;
      }

      // Build task lines
      const taskLines = allPlanTasks.map(t => {
        const assigneeName = t.assignee_id ? getMemberName(t.assignee_id) || 'Unknown' : 'none';
        const projectName = getProjectLabel(t);
        const parts = [
          `[${t.id}] "${t.title}"`,
          t.start_date ? `date: ${t.start_date.slice(0, 10)}` : 'date: none',
          t.start_time ? `time: ${t.start_time}` : null,
          `assignee: ${assigneeName}`,
          `priority: ${t.priority || 'medium'}`,
          `status: ${t.status || 'todo'}`,
          `project: ${projectName}`,
          t.blocked_by ? `blocked_by: ${t.blocked_by}` : null,
        ].filter(Boolean).join(' | ');
        return `- ${parts}`;
      });

      const scheduled = taskLines.filter(l => !l.includes('date: none'));
      const unscheduled = taskLines.filter(l => l.includes('date: none'));

      // Events for conflict avoidance
      const rangeEvents = getEventsByDateRange(startDate, endDate);
      const eventLines = rangeEvents.map(e => {
        const time = e.start_time ? ` ${e.start_time}` : '';
        const dur = e.duration ? `-${e.duration}min` : '';
        return `- ${e.start_date?.slice(0, 10)}${time}${dur}: ${e.title}`;
      });

      // Team workload
      const workloadLines = teamMembers
        .filter(m => m.status === 'active')
        .map(m => {
          const openCount = tasks.filter(t => t.assignee_id === m.id && !t.completed && t.status !== 'done').length;
          return `- ${m.name || m.email}: ${openCount} open tasks`;
        });

      // Productivity data — last 30 days (for adaptive planning)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const completedRecently = tasks.filter(t =>
        t.completed_at && new Date(t.completed_at) >= thirtyDaysAgo
      );
      const personDays = new Map<string, Set<string>>();
      const personCompleted = new Map<string, number>();
      for (const t of completedRecently) {
        const pid = t.assignee_id || 'unassigned';
        const day = t.completed_at!.slice(0, 10);
        if (!personDays.has(pid)) personDays.set(pid, new Set());
        personDays.get(pid)!.add(day);
        personCompleted.set(pid, (personCompleted.get(pid) || 0) + 1);
      }
      const productivityLines = teamMembers
        .filter(m => m.status === 'active')
        .map(m => {
          const days = personDays.get(m.id)?.size || 1;
          const total = personCompleted.get(m.id) || 0;
          const avg = total > 0 ? (total / days).toFixed(1) : '0';
          return `- ${m.name || m.email}: avg ${avg} tasks/day (${total} completed in ${days} active days)`;
        });

      const today = new Date().toISOString().split('T')[0];

      const inputParts = [
        `Today: ${today}`,
        `Period: ${startDate} to ${endDate} (${periodLabel})`,
        scheduled.length > 0 ? `\nTasks:\n${scheduled.join('\n')}` : '',
        unscheduled.length > 0 ? `\nUnscheduled (no date):\n${unscheduled.join('\n')}` : '',
        eventLines.length > 0 ? `\nEvents (avoid conflicts):\n${eventLines.join('\n')}` : '',
        workloadLines.length > 0 ? `\nTeam workload:\n${workloadLines.join('\n')}` : '',
        productivityLines.length > 0 ? `\nProductivity data (last 30 days):\n${productivityLines.join('\n')}\nUse these averages as daily capacity per person. Do NOT exceed 1.5x their average.` : '',
        planPreferences.trim() ? `\nPlanning preferences:\n${planPreferences.trim()}` : '',
      ].filter(Boolean).join('\n');

      const result = await generatePlanFromAI(inputParts);
      setAiPlan(result);
    } catch (err: any) {
      errorLogger.error('Error generating AI plan', err);
      setAiPlanError(err.message || 'Error generating plan');
    } finally {
      setAiPlanLoading(false);
    }
  };

  // Accept AI Plan — apply all changes
  const handleAcceptAiPlan = async () => {
    if (!aiPlan || aiPlan.changes.length === 0) return;
    setAiPlanApplying(true);
    try {
      const resolveAssignee = (name?: string): string | null => {
        if (!name) return null;
        const lower = name.toLowerCase();
        const match = teamMembers.find(m =>
          m.name?.toLowerCase() === lower ||
          m.email?.toLowerCase().startsWith(lower) ||
          m.name?.toLowerCase().includes(lower)
        );
        return match?.id || null;
      };

      const taskMap = new Map(tasks.map(t => [t.id, t]));

      const results = await Promise.allSettled(
        aiPlan.changes.map(async (change) => {
          const task = taskMap.get(change.taskId);
          if (!task) throw new Error(`Task ${change.taskId} not found`);

          const updates: Record<string, any> = {};
          if (change.newDate) updates.start_date = change.newDate;
          if (change.newTime) updates.start_time = change.newTime;
          if (change.newPriority) updates.priority = change.newPriority;
          if (change.newAssignee) {
            const assigneeId = resolveAssignee(change.newAssignee);
            if (assigneeId) updates.assignee_id = assigneeId;
          }

          if (Object.keys(updates).length > 0) {
            await updateTask(change.taskId, updates as any);
          }
        })
      );

      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      if (import.meta.env.DEV) console.log(`[AiPlan] Applied: ${succeeded} OK, ${failed} failed`);

      setAiPlan(null);
    } catch (err) {
      errorLogger.error('Error applying AI plan', err);
    } finally {
      setAiPlanApplying(false);
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

  // Helper: elapsed days from start/created to completion
  const getElapsedDays = (task: CalendarTask): number | null => {
    if (!task.completed || !task.completed_at) return null;
    const startRef = task.start_date?.slice(0, 10) || task.created_at?.slice(0, 10);
    if (!startRef) return null;
    const diff = Math.max(1, Math.ceil(
      (new Date(task.completed_at.slice(0, 10)).getTime() - new Date(startRef).getTime()) / (1000 * 60 * 60 * 24)
    ));
    return diff;
  };

  // Calendar stats — filtered by current view (week/month/day)
  const viewStats = (() => {
    let startDate: string;
    let endDate: string;
    let label: string;

    if (view === 'week') {
      const days = getWeekDays();
      startDate = days[0].toISOString().split('T')[0];
      endDate = days[6].toISOString().split('T')[0];
      label = 'Weekly';
    } else if (view === 'month') {
      const y = currentDate.getFullYear();
      const m = currentDate.getMonth();
      startDate = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(y, m + 1, 0).getDate();
      endDate = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      label = 'Monthly';
    } else {
      // day view
      const d = currentDate.toISOString().split('T')[0];
      startDate = d;
      endDate = d;
      label = 'Daily';
    }

    const rangeEvents = getEventsByDateRange(startDate, endDate).filter(e => e.source !== 'google');
    const rangeTasks = getTasksByDateRange(startDate, endDate);
    const today = new Date().toISOString().split('T')[0];
    const completed = rangeTasks.filter(t => t.completed).length;
    const pending = rangeTasks.filter(t => !t.completed).length;
    const overdue = rangeTasks.filter(t => t.start_date && t.start_date < today && !t.completed).length;

    return {
      stats: {
        totalEvents: rangeEvents.length,
        totalTasks: rangeTasks.length,
        completedTasks: completed,
        pendingTasks: pending,
        overdueTasks: overdue,
        completionRate: rangeTasks.length > 0 ? Math.round((completed / rangeTasks.length) * 100) : 0,
      },
      periodLabel: label,
    };
  })();

  if (loading && !loadingTimedOut) {
    return (
      <div className="max-w-[1600px] mx-auto pt-4 pb-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-zinc-200 dark:border-zinc-700 border-t-zinc-900 dark:border-t-zinc-100 mx-auto mb-4" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading calendar...</p>
          </div>
        </div>
      </div>
    );
  }

  const weekDays = getWeekDays();
  const hours = getHours();

  return (
    <div className="max-w-[1600px] mx-auto pt-4 pb-6">
      {/* Header */}
      <CalendarHeader
        calendarMode={calendarMode}
        setCalendarMode={setCalendarMode}
        view={view}
        setView={setView}
        stats={viewStats.stats}
        filteredEventsCount={filteredEvents.length}
        navigateCalendar={navigateCalendar}
        goToToday={goToToday}
        periodLabel={getPeriodLabel()}
        onNewEvent={() => setShowNewEventForm(true)}
        onNewTask={() => setShowNewTaskForm(true)}
        contentPlatforms={CONTENT_PLATFORMS}
        selectedPlatforms={selectedPlatforms}
        setSelectedPlatforms={setSelectedPlatforms}
        platformDropdownOpen={platformDropdownOpen}
        setPlatformDropdownOpen={setPlatformDropdownOpen}
        platformDropdownRef={platformDropdownRef}
        googleConnected={googleConnected}
        googleSyncing={googleSyncing}
        syncGoogle={syncGoogle}
        showGoogleSettings={showGoogleSettings}
        setShowGoogleSettings={setShowGoogleSettings}
        showTimezones={showTimezones}
        onToggleTimezones={toggleTimezones}
        hasClientTimezones={hasClientTimezones}
      />

      {/* AI Weekly Summary + AI Plan */}
      <div className="flex items-start gap-3 mb-4">
        <div className="flex-1">
          <AiWeeklySummary
            aiSummary={aiSummary}
            aiSummaryLoading={aiSummaryLoading}
            aiSummaryError={aiSummaryError}
            aiSummaryExpanded={aiSummaryExpanded}
            setAiSummaryExpanded={setAiSummaryExpanded}
            showAiPromptInput={showAiPromptInput}
            setShowAiPromptInput={setShowAiPromptInput}
            aiCustomPrompt={aiCustomPrompt}
            setAiCustomPrompt={setAiCustomPrompt}
            onGenerate={handleGenerateAiSummary}
            onClearError={() => setAiSummaryError(null)}
          />
        </div>
        {!aiPlan && !aiPlanLoading && calendarMode === 'schedule' && (
          <button
            onClick={handleGenerateAiPlan}
            className="group flex items-center gap-2 px-3.5 py-2 rounded-xl border border-dashed border-violet-200 dark:border-violet-700/60 hover:border-violet-400 dark:hover:border-violet-500/50 hover:bg-violet-50/50 dark:hover:bg-violet-950/20 transition-all duration-200 shrink-0"
          >
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Icons.Sparkles size={12} className="text-white" />
            </div>
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
              AI Plan This {view === 'month' ? 'Month' : 'Week'}
            </span>
          </button>
        )}
      </div>

      {/* AI Plan Loading */}
      {aiPlanLoading && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-violet-50/60 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900/40 mb-4">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center animate-pulse">
            <Icons.Sparkles size={12} className="text-white" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-24 bg-violet-200 dark:bg-violet-800 rounded-full overflow-hidden">
              <div className="h-full w-1/2 bg-violet-500 rounded-full" style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
            </div>
            <span className="text-[11px] font-medium text-violet-500 dark:text-violet-400">
              Planning your {view === 'month' ? 'month' : 'week'}...
            </span>
          </div>
        </div>
      )}

      {/* AI Plan Error */}
      {aiPlanError && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40 mb-4">
          <Icons.AlertCircle size={14} className="text-red-500 shrink-0" />
          <span className="text-xs text-red-600 dark:text-red-400">{aiPlanError}</span>
          <button
            onClick={() => { setAiPlanError(null); handleGenerateAiPlan(); }}
            className="ml-auto text-[10px] font-semibold text-red-500 hover:text-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* AI Plan Preview */}
      {aiPlan && (
        <div className="mb-4">
          <AiPlanPreview
            plan={aiPlan}
            onPlanChange={setAiPlan}
            onAccept={handleAcceptAiPlan}
            onDiscard={() => setAiPlan(null)}
            applying={aiPlanApplying}
            teamMembers={teamMembers.filter(m => m.status === 'active').map(m => ({ id: m.id, name: m.name, email: m.email || '' }))}
          />
          <PlanningPreferences
            expanded={showPlanPrefs}
            onToggle={() => setShowPlanPrefs(!showPlanPrefs)}
            preferences={planPreferences}
            onPreferencesChange={setPlanPreferences}
          />
          {!showPlanPrefs && (
            <button
              onClick={() => setShowPlanPrefs(true)}
              className="mt-2 flex items-center gap-1.5 text-[10px] text-zinc-400 hover:text-violet-500 transition-colors"
            >
              <Icons.Settings size={10} />
              Planning preferences
            </button>
          )}
        </div>
      )}

      {/* Team member filter */}
      {calendarMode === 'schedule' && teamMembers.length > 0 && (
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
          <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider shrink-0">Filter:</span>
          {[
            { id: 'all', label: 'All' },
            { id: 'me', label: 'My tasks' },
            ...teamMembers
              .filter(m => m.status === 'active' && m.id !== user?.id)
              .map(m => ({ id: m.id, label: m.name || m.email?.split('@')[0] || 'Member', avatar: m.avatar_url })),
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

      {/* Timezone bar */}
      {calendarMode === 'schedule' && showTimezones && (
        <TimezoneBar
          clients={clients}
          activeTimezone={activeTimezone}
          onSelectTimezone={setActiveTimezone}
        />
      )}

      {/* Event/Task creation panel */}
      <EventTaskFormPanel
        isOpen={showNewEventForm || showNewTaskForm}
        onClose={() => { setShowNewEventForm(false); setShowNewTaskForm(false); }}
        showNewEventForm={showNewEventForm}
        showNewTaskForm={showNewTaskForm}
        calendarMode={calendarMode}
        newEventData={newEventData}
        setNewEventData={setNewEventData}
        newContentData={newContentData}
        setNewContentData={setNewContentData}
        newTaskData={newTaskData}
        setNewTaskData={setNewTaskData}
        onCreateEvent={handleCreateEvent}
        onCreateContent={handleCreateContent}
        onCreateTask={handleCreateTask}
        contentPlatforms={CONTENT_PLATFORMS}
        contentStatuses={CONTENT_STATUSES}
        projectOptions={projectOptions}
        clients={clients}
        teamMembers={teamMembers}
        userId={user?.id}
      />

      {/* Task Detail / Edit Panel */}
      <TaskDetailPanel
        selectedTask={selectedTask}
        editingTask={editingTask}
        setEditingTask={setEditingTask}
        savingTask={savingTask}
        saveError={saveError}
        onSave={handleSaveTaskEdit}
        onClose={() => { setSelectedTask(null); setSaveError(null); }}
        onDelete={handleDeleteTask}
        onToggleComplete={toggleTaskComplete}
        subtasksForSelected={subtasksForSelected}
        newSubtaskTitle={newSubtaskTitle}
        setNewSubtaskTitle={setNewSubtaskTitle}
        addingSubtask={addingSubtask}
        onAddSubtask={handleAddSubtask}
        onToggleSubtask={handleToggleSubtask}
        onDeleteSubtask={handleDeleteSubtask}
        isTaskBlocked={isTaskBlocked}
        getBlockerTask={getBlockerTask}
        getDependentTasks={getDependentTasks}
        getElapsedDays={getElapsedDays}
        tasks={tasks}
        teamMembers={teamMembers}
        projectOptions={projectOptions}
        clients={clients}
        userId={user?.id}
        getMemberName={getMemberName}
        getMemberAvatar={getMemberAvatar}
        getClientLabel={getClientLabel}
        onOpenTaskDetail={handleOpenTaskDetail}
      />

      {/* Google Calendar Settings Panel */}
      {showGoogleSettings && (
        <div className="mb-4">
          <GoogleCalendarSettings />
        </div>
      )}

      {/* Click-to-create popover */}
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

      {/* Week View */}
      {view === 'week' && (
        <WeekView
          weekDays={weekDays}
          hours={hours}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          getDayEvents={getDayEvents}
          getDayTasks={getDayTasks}
          getTaskColor={getTaskColor}
          getOverdueDays={getOverdueDays}
          getElapsedDays={getElapsedDays}
          isTaskBlocked={isTaskBlocked}
          getBlockerTask={getBlockerTask}
          getMemberName={getMemberName}
          getMemberAvatar={getMemberAvatar}
          getClientLabel={getClientLabel}
          contentPlatforms={CONTENT_PLATFORMS}
          draggingTaskId={draggingTaskId}
          setDraggingTaskId={setDraggingTaskId}
          onTaskDragStart={handleTaskDragStart}
          onTaskDrop={handleTaskDrop}
          onDragOver={handleDragOver}
          slotPopover={slotPopover}
          onSlotClick={(e, dateStr, hour) => {
            setSlotPopover({
              clickX: e.clientX,
              clickY: e.clientY,
              date: dateStr,
              hour: hour,
            });
          }}
          onOpenTaskDetail={handleOpenTaskDetail}
          activeTimezone={activeTimezone}
          clientTimezoneMap={clientTimezoneMap}
        />
      )}

      {/* Month View */}
      {view === 'month' && (
        <MonthView
          currentDate={currentDate}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          getMonthDays={getMonthDays}
          getDayEvents={getDayEvents}
          getDayTasks={getDayTasks}
          getTaskColor={getTaskColor}
          getOverdueDays={getOverdueDays}
          getElapsedDays={getElapsedDays}
          getClientLabel={getClientLabel}
          draggingTaskId={draggingTaskId}
          setDraggingTaskId={setDraggingTaskId}
          onTaskDragStart={handleTaskDragStart}
          onTaskDrop={handleTaskDrop}
          onDragOver={handleDragOver}
          onSlotDoubleClick={(e, dateStr) => {
            setSlotPopover({
              clickX: e.clientX,
              clickY: e.clientY,
              date: dateStr,
              hour: 9,
            });
          }}
          onOpenTaskDetail={handleOpenTaskDetail}
        />
      )}

      {/* Content Planner Board */}
      {calendarMode === 'content' && (
        <ContentPlannerBoard
          contentStatuses={CONTENT_STATUSES}
          contentEvents={contentEvents}
          contentPlatforms={CONTENT_PLATFORMS}
          updateEvent={async (id, data) => { await updateEvent(id, data); }}
        />
      )}

      {/* Selected Date Panel + Stats */}
      <SelectedDatePanel
        selectedDate={selectedDate}
        calendarMode={calendarMode}
        getDayEvents={getDayEvents}
        getDayTasks={getDayTasks}
        contentPlatforms={CONTENT_PLATFORMS}
        stats={viewStats.stats}
        filteredEventsCount={filteredEvents.length}
        periodLabel={viewStats.periodLabel}
        toggleTaskComplete={toggleTaskComplete}
        onOpenTaskDetail={handleOpenTaskDetail}
        getMemberName={getMemberName}
        getMemberAvatar={getMemberAvatar}
        getProjectLabel={getProjectLabel}
        getClientLabel={getClientLabel}
        getElapsedDays={getElapsedDays}
        tasks={tasks}
      />
    </div>
  );
};
