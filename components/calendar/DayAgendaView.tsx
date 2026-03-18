import React, { useMemo, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Icons } from '../ui/Icons'
import type { CalendarEvent, CalendarTask } from '../../context/CalendarContext'

interface TaskColorResult {
  bg: string
  border: string
  text: string
  dot: string
}

interface DayAgendaViewProps {
  selectedDate: string
  setSelectedDate: (date: string) => void
  getDayEvents: (date: string) => CalendarEvent[]
  getDayTasks: (date: string) => CalendarTask[]
  getTaskColor: (task: CalendarTask) => TaskColorResult
  getOverdueDays: (task: CalendarTask) => number
  getClientLabel: (task: CalendarTask | CalendarEvent) => string
  getMemberName: (id: string) => string
  onOpenTaskDetail: (task: CalendarTask) => void
  onSlotClick: (e: React.MouseEvent, dateStr: string, hour: number) => void
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7) // 7am - 8pm

const formatHour = (h: number) => {
  if (h === 0) return '12 AM'
  if (h < 12) return `${h} AM`
  if (h === 12) return '12 PM'
  return `${h - 12} PM`
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-500',
  urgent: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-emerald-500',
}

export const DayAgendaView: React.FC<DayAgendaViewProps> = ({
  selectedDate,
  setSelectedDate,
  getDayEvents,
  getDayTasks,
  getTaskColor,
  getOverdueDays,
  getClientLabel,
  getMemberName,
  onOpenTaskDetail,
  onSlotClick,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const dateStripRef = useRef<HTMLDivElement>(null)

  // Generate 7-day strip centered on selected date
  const dateStrip = useMemo(() => {
    const center = new Date(selectedDate + 'T12:00:00')
    const days: { date: string; dayName: string; dayNum: number; isToday: boolean; isSelected: boolean }[] = []
    for (let i = -3; i <= 3; i++) {
      const d = new Date(center)
      d.setDate(d.getDate() + i)
      const dateStr = d.toISOString().split('T')[0]
      const todayStr = new Date().toISOString().split('T')[0]
      days.push({
        date: dateStr,
        dayName: d.toLocaleDateString('en', { weekday: 'short' }),
        dayNum: d.getDate(),
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDate,
      })
    }
    return days
  }, [selectedDate])

  const events = useMemo(() => getDayEvents(selectedDate), [selectedDate, getDayEvents])
  const tasks = useMemo(() => getDayTasks(selectedDate), [selectedDate, getDayTasks])

  const scheduledTasks = useMemo(() => tasks.filter(t => t.start_time), [tasks])
  const unscheduledTasks = useMemo(() => tasks.filter(t => !t.start_time), [tasks])

  // Scroll to current hour on mount
  useEffect(() => {
    if (scrollRef.current) {
      const now = new Date()
      const hour = now.getHours()
      const offset = Math.max(0, (hour - 7) * 60 - 30)
      scrollRef.current.scrollTop = offset
    }
  }, [selectedDate])

  const navigateDay = (direction: number) => {
    const d = new Date(selectedDate + 'T12:00:00')
    d.setDate(d.getDate() + direction)
    setSelectedDate(d.toISOString().split('T')[0])
  }

  const todayStr = new Date().toISOString().split('T')[0]

  return (
    <div className="flex flex-col h-full">
      {/* Date Strip */}
      <div className="flex items-center gap-1 px-2 py-3 border-b border-zinc-100 dark:border-zinc-800/60">
        <button
          onClick={() => navigateDay(-7)}
          className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <Icons.ChevronLeft size={18} />
        </button>

        <div ref={dateStripRef} className="flex-1 flex justify-around">
          {dateStrip.map(day => (
            <button
              key={day.date}
              onClick={() => setSelectedDate(day.date)}
              className={`flex flex-col items-center gap-0.5 py-1.5 px-2.5 rounded-2xl transition-all min-w-[44px] ${
                day.isSelected
                  ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                  : day.isToday
                  ? 'bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400'
                  : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              <span className="text-[10px] font-medium uppercase">{day.dayName}</span>
              <span className={`text-sm font-bold ${day.isSelected ? '' : ''}`}>{day.dayNum}</span>
            </button>
          ))}
        </div>

        <button
          onClick={() => navigateDay(7)}
          className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <Icons.ChevronRight size={18} />
        </button>
      </div>

      {/* All Day / Unscheduled tasks */}
      {(unscheduledTasks.length > 0 || events.filter(e => e.all_day).length > 0) && (
        <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/60">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">All Day / Unscheduled</p>
          <div className="flex flex-col gap-1.5">
            {events.filter(e => e.all_day).map(event => (
              <div
                key={event.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-800/30"
              >
                <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300 truncate">{event.title}</span>
              </div>
            ))}
            {unscheduledTasks.map(task => {
              const overdue = getOverdueDays(task)
              const client = getClientLabel(task)
              return (
                <motion.button
                  key={task.id}
                  onClick={() => onOpenTaskDetail(task)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-700/60 text-left active:scale-[0.98] transition-transform"
                  whileTap={{ scale: 0.98 }}
                >
                  <div className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_COLORS[task.priority] || 'bg-zinc-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${task.completed ? 'line-through text-zinc-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
                      {task.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {client && <span className="text-[10px] text-zinc-400 truncate">{client}</span>}
                      {overdue > 0 && (
                        <span className="text-[10px] font-semibold text-red-500">+{overdue}d</span>
                      )}
                    </div>
                  </div>
                  {task.completed && <Icons.CheckCircle size={16} className="text-emerald-500 shrink-0" />}
                </motion.button>
              )
            })}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
        <div className="relative">
          {HOURS.map(hour => {
            const hourEvents = events.filter(e => !e.all_day && e.start_time && parseInt(e.start_time.split(':')[0]) === hour)
            const hourTasks = scheduledTasks.filter(t => t.start_time && parseInt(t.start_time.split(':')[0]) === hour)
            const hasItems = hourEvents.length > 0 || hourTasks.length > 0

            return (
              <div
                key={hour}
                className="flex min-h-[60px] border-b border-zinc-100/50 dark:border-zinc-800/30"
                onClick={(e) => {
                  if (!(e.target as HTMLElement).closest('button')) {
                    onSlotClick(e, selectedDate, hour)
                  }
                }}
              >
                {/* Hour label */}
                <div className="w-14 shrink-0 pt-1.5 pr-3 text-right">
                  <span className="text-[10px] font-medium text-zinc-400">{formatHour(hour)}</span>
                </div>

                {/* Slot content */}
                <div className="flex-1 py-1 pr-3">
                  {hourEvents.map(event => (
                    <div
                      key={event.id}
                      className="mb-1 px-3 py-2.5 rounded-xl border-l-[3px] bg-indigo-50 dark:bg-indigo-500/10 border-indigo-500"
                    >
                      <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">{event.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {event.location && (
                          <span className="text-[10px] text-indigo-500/70">{event.location}</span>
                        )}
                        {event.duration && (
                          <span className="text-[10px] text-indigo-500/70">{event.duration}min</span>
                        )}
                      </div>
                    </div>
                  ))}
                  {hourTasks.map(task => {
                    const client = getClientLabel(task)
                    const colors = getTaskColor(task)
                    return (
                      <motion.button
                        key={task.id}
                        onClick={() => onOpenTaskDetail(task)}
                        className={`mb-1 w-full text-left px-3 py-2.5 rounded-xl border-l-[3px] active:scale-[0.98] transition-transform ${
                          task.completed
                            ? 'bg-zinc-50 dark:bg-zinc-800/30 border-zinc-300 dark:border-zinc-600'
                            : `${colors.bg} ${colors.border}`
                        }`}
                        whileTap={{ scale: 0.98 }}
                      >
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-medium flex-1 truncate ${task.completed ? 'line-through text-zinc-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
                            {task.title}
                          </p>
                          {task.completed && <Icons.CheckCircle size={14} className="text-emerald-500 shrink-0" />}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {client && <span className="text-[10px] text-zinc-400">{client}</span>}
                          {task.duration && <span className="text-[10px] text-zinc-400">{task.duration}min</span>}
                          {task.assignee_id && (
                            <span className="text-[10px] text-zinc-400">{getMemberName(task.assignee_id)}</span>
                          )}
                        </div>
                      </motion.button>
                    )
                  })}
                  {!hasItems && (
                    <div className="h-full min-h-[40px]" />
                  )}
                </div>
              </div>
            )
          })}

          {/* Current time indicator */}
          {selectedDate === todayStr && (() => {
            const now = new Date()
            const hour = now.getHours()
            const mins = now.getMinutes()
            if (hour < 7 || hour > 20) return null
            const top = (hour - 7) * 60 + mins
            return (
              <div
                className="absolute left-12 right-0 flex items-center z-10 pointer-events-none"
                style={{ top: `${top}px` }}
              >
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1.5" />
                <div className="flex-1 h-[2px] bg-red-500" />
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
