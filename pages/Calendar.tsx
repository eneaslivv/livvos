import React, { useState, useEffect } from 'react';
import { Icons } from '../components/ui/Icons';
import { Card } from '../components/ui/Card';
import { useCalendar, CalendarEvent, CalendarTask } from '../hooks/useCalendar';
import { useAuth } from '../hooks/useAuth';
import { errorLogger } from '../lib/errorLogger';

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

  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'day' | 'week' | 'month'>('week');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [showNewEventForm, setShowNewEventForm] = useState(false);
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);
  
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

  const [newTaskData, setNewTaskData] = useState({
    title: '',
    description: '',
    start_date: '',
    priority: 'medium' as const,
    status: 'todo' as const,
    duration: 60
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

  // Crear tarea
  const handleCreateTask = async () => {
    if (!newTaskData.title.trim()) return;

    try {
      await createTask({
        ...newTaskData,
        owner_id: user?.id || '',
        start_date: newTaskData.start_date || selectedDate,
        completed: false
      });

      setNewTaskData({
        title: '',
        description: '',
        start_date: '',
        priority: 'medium',
        status: 'todo',
        duration: 60
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

  // Obtener eventos y tareas para una fecha específica
  const getDayEvents = (date: string) => {
    return getEventsByDate(date);
  };

  const getDayTasks = (date: string) => {
    return getTasksByDate(date);
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
            {stats.totalEvents} eventos, {stats.totalTasks} tareas ({stats.completedTasks} completadas)
          </p>
        </div>
        <div className="flex items-center gap-3">
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
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Icons.Plus size={16} />
            Evento
          </button>
          <button
            onClick={() => setShowNewTaskForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <Icons.Check size={16} />
            Tarea
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
                        {showNewEventForm ? 'Nuevo Evento' : 'Nueva Tarea'}
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
                                placeholder="Ej: Reunión con Cliente"
                                value={newEventData.title}
                                onChange={(e) => setNewEventData({ ...newEventData, title: e.target.value })}
                                className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-zinc-900 dark:text-zinc-100 transition-all"
                                required
                                autoFocus
                            />
                        </div>
                        
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

                        <div>
                            <label className="block text-xs font-medium text-zinc-500 mb-1">Fecha</label>
                            <input
                                type="date"
                                value={newEventData.start_date}
                                onChange={(e) => setNewEventData({ ...newEventData, start_date: e.target.value })}
                                className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-zinc-900 dark:text-zinc-100 transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-zinc-500 mb-1">Hora</label>
                            <input
                                type="time"
                                value={newEventData.start_time}
                                onChange={(e) => setNewEventData({ ...newEventData, start_time: e.target.value })}
                                className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-zinc-900 dark:text-zinc-100 transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-zinc-500 mb-1">Duración (min)</label>
                            <input
                                type="number"
                                value={newEventData.duration}
                                onChange={(e) => setNewEventData({ ...newEventData, duration: parseInt(e.target.value) })}
                                className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-zinc-900 dark:text-zinc-100 transition-all"
                                min="15"
                                step="15"
                            />
                        </div>

                        <div className="col-span-2">
                            <label className="block text-xs font-medium text-zinc-500 mb-1">Descripción</label>
                            <textarea
                                placeholder="Detalles adicionales..."
                                value={newEventData.description}
                                onChange={(e) => setNewEventData({ ...newEventData, description: e.target.value })}
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
                        onClick={showNewEventForm ? handleCreateEvent : handleCreateTask}
                        disabled={showNewEventForm ? !newEventData.title.trim() : !newTaskData.title.trim()}
                        className="px-6 py-2.5 bg-zinc-900 hover:bg-black dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-900 rounded-xl text-sm font-bold shadow-lg shadow-zinc-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                    >
                        {showNewEventForm ? <Icons.Calendar size={16}/> : <Icons.Check size={16}/>}
                        {showNewEventForm ? 'Crear Evento' : 'Crear Tarea'}
                    </button>
                </div>
            </div>
        </div>
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
                      className="p-2 min-h-12 border-r border-zinc-100 dark:border-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors relative"
                    >
                      {dayEvents.map((event) => (
                        <div
                          key={event.id}
                          className="text-xs p-2 rounded mb-1 truncate cursor-pointer hover:opacity-80 transition-opacity"
                          style={{ backgroundColor: event.color || '#3b82f6', color: 'white' }}
                          title={event.title}
                        >
                          <div className="font-medium">{event.title}</div>
                          {event.location && (
                            <div className="opacity-75">{event.location}</div>
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
                  Eventos ({getDayEvents(selectedDate).length})
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
                          <div className="font-medium text-zinc-900 dark:text-zinc-100">
                            {event.title}
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
                          {event.type}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-zinc-500 dark:text-zinc-400">
                      No hay eventos para este día
                    </div>
                  )}
                </div>
              </div>

              {/* Tareas del día */}
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
            </div>
          </Card>
        </div>

        {/* Panel de estadísticas */}
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Resumen</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Eventos totales</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">{stats.totalEvents}</span>
              </div>
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
            </div>
          </Card>

          {/* Próximas tareas */}
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
                  </div>
                ))}
              {tasks.filter(task => !task.completed && task.start_date).length === 0 && (
                <div className="text-center py-4 text-zinc-500 dark:text-zinc-400 text-sm">
                  No hay tareas pendientes
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
