/**
 * MobileTasksView — the Workspace Mobile "Tasks" screen.
 * Week strip (day-by-day with the selected day's tasks) + a By-project
 * grouping. Self-contained: takes tasks + projects + a toggle handler, so
 * it can early-render on mobile without touching the calendar's desktop
 * chrome or modals. Warm editorial style via os tokens (dark-safe).
 */
import React, { useMemo, useState } from 'react';
import { Icons } from '../ui/Icons';
import type { CalendarTask } from '../../hooks/useCalendar';

interface MobileTasksViewProps {
  tasks: CalendarTask[];
  projects: { id: string; title: string }[];
  onToggle: (id: string) => void;
}

const ACCENTS = ['#C4A35A', '#6DBEDC', '#769268', '#F1ADD8', '#b4452f', '#5c1d18'];
const PRIO_COLOR: Record<string, string> = { urgent: '#b4452f', high: '#b4452f', medium: '#C4A35A', med: '#C4A35A', low: '#A8A29A' };
const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const MobileTasksView: React.FC<MobileTasksViewProps> = ({ tasks, projects, onToggle }) => {
  const [taskView, setTaskView] = useState<'week' | 'project'>('week');

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const todayIso = iso(today);

  // Monday-anchored current week.
  const weekDays = useMemo(() => {
    const monday = new Date(today);
    const dow = (monday.getDay() + 6) % 7; // 0 = Monday
    monday.setDate(monday.getDate() - dow);
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d; });
  }, [today]);

  const [selKey, setSelKey] = useState<string>(todayIso);

  const projName = (id?: string | null) => projects.find(p => p.id === id)?.title || 'No project';
  const projAccent = (id?: string | null) => {
    if (!id) return '#A8A29A';
    const idx = projects.findIndex(p => p.id === id);
    return ACCENTS[(idx < 0 ? 0 : idx) % ACCENTS.length];
  };
  const taskDate = (t: CalendarTask) => ((t as any).start_date || (t as any).due_date || '').slice(0, 10);

  const open = tasks.filter(t => !t.completed && t.status !== 'cancelled');
  const overdue = open.filter(t => { const d = taskDate(t); return d && d < todayIso; });
  const projCount = new Set(open.map(t => (t as any).project_id).filter(Boolean)).size;

  const tasksForDay = (dayIso: string) =>
    tasks.filter(t => !t.completed && taskDate(t) === dayIso)
      .sort((a, b) => ((a as any).start_time || '').localeCompare((b as any).start_time || ''));

  const selDate = weekDays.find(d => iso(d) === selKey) || today;
  const selTasks = tasksForDay(selKey);
  const selLabel = `${DAY_NAMES[(selDate.getDay() + 6) % 7]}, ${selDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;

  const Checkbox: React.FC<{ id: string; done: boolean }> = ({ id, done }) => (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(id); }}
      aria-label={done ? 'Mark open' : 'Complete'}
      style={{
        width: 20, height: 20, borderRadius: 999, flexShrink: 0, cursor: 'pointer',
        border: done ? 'none' : '1.75px solid var(--os-border-2)',
        background: done ? 'var(--livv-sage)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {done && <Icons.Check size={11} strokeWidth={3} style={{ color: '#fff' }} />}
    </button>
  );

  const toggleBtn = (active: boolean): React.CSSProperties => ({
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 32,
    border: 'none', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 500,
    background: active ? 'var(--os-ink)' : 'transparent', color: active ? 'var(--livv-cream-50)' : 'var(--os-fg-2)',
  });

  return (
    <div style={{ padding: '4px 0 24px' }}>
      {/* Header */}
      <div className="mb-4 px-0.5">
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', color: 'var(--os-fg-3)', marginBottom: 6 }}>© TASKS タスク</div>
        <h1 style={{ fontSize: 27, fontWeight: 300, letterSpacing: '-0.03em', margin: 0, color: 'var(--os-fg-0)' }}>Tasks</h1>
        <div style={{ fontSize: 12.5, color: 'var(--os-fg-2)', marginTop: 7 }}>
          {open.length} open · <span style={{ color: '#b4452f' }}>{overdue.length} overdue</span> across {projCount || 0} project{projCount === 1 ? '' : 's'}
        </div>
      </div>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 3, padding: 3, background: 'var(--os-surface)', borderRadius: 999, marginBottom: 18 }}>
        <button onClick={() => setTaskView('week')} style={toggleBtn(taskView === 'week')}><Icons.Calendar size={14} />Week</button>
        <button onClick={() => setTaskView('project')} style={toggleBtn(taskView === 'project')}><Icons.Layers size={14} />By project</button>
      </div>

      {taskView === 'week' ? (
        <>
          {/* Week strip */}
          <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ margin: '0 -16px 20px', padding: '0 16px' }}>
            {weekDays.map(d => {
              const k = iso(d);
              const sel = k === selKey;
              const isToday = k === todayIso;
              const dayTasks = tasksForDay(k);
              return (
                <button key={k} onClick={() => setSelKey(k)}
                  style={{
                    flexShrink: 0, width: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                    padding: '10px 0 9px', borderRadius: 15, cursor: 'pointer', border: 'none',
                    background: sel ? 'var(--os-ink)' : (isToday ? 'var(--os-surface)' : 'transparent'),
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em', color: 'var(--os-fg-3)' }}>{DAY_LABELS[(d.getDay() + 6) % 7]}</span>
                  <span style={{ fontSize: 19, fontWeight: 300, letterSpacing: '-0.02em', color: sel ? 'var(--livv-cream-50)' : 'var(--os-fg-0)' }}>{d.getDate()}</span>
                  <div style={{ display: 'flex', gap: 3, alignItems: 'center', height: 6 }}>
                    {dayTasks.length === 0 ? (
                      <span style={{ width: 14, height: 2, borderRadius: 999, background: sel ? 'rgba(255,255,255,0.3)' : 'var(--os-border-2)' }} />
                    ) : dayTasks.slice(0, 3).map((t, i) => (
                      <span key={i} style={{ width: 5, height: 5, borderRadius: 999, background: projAccent((t as any).project_id) }} />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected day */}
          <div className="flex items-center gap-2 mb-3">
            <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--os-ink)' }} />
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--os-fg-0)' }}>{selLabel}</span>
          </div>
          <div className="flex flex-col gap-2.5">
            {selTasks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 20px', background: 'var(--os-panel)', border: '1px dashed var(--os-border-2)', borderRadius: 16 }}>
                <Icons.Sparkles size={22} style={{ color: 'var(--livv-gold)' }} />
                <div style={{ fontSize: 13, color: 'var(--os-fg-3)', marginTop: 10 }}>No tasks — enjoy the breathing room.</div>
              </div>
            ) : selTasks.map(t => (
              <div key={t.id} className="flex items-center gap-3" style={{ background: 'var(--os-panel)', border: '1px solid var(--os-border-2)', borderRadius: 14, padding: '13px 15px', boxShadow: 'var(--shadow-card)' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--os-fg-2)', width: 42, flexShrink: 0 }}>{((t as any).start_time || '').slice(0, 5) || '—'}</div>
                <Checkbox id={t.id} done={!!t.completed} />
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 13.5, color: 'var(--os-fg-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                  <div className="flex items-center gap-1.5" style={{ marginTop: 3 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 2, background: projAccent((t as any).project_id), flexShrink: 0 }} />
                    <span style={{ fontSize: 10.5, color: 'var(--os-fg-3)' }}>{projName((t as any).project_id)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          {projects.map(p => {
            const pTasks = open.filter(t => (t as any).project_id === p.id);
            if (pTasks.length === 0) return null;
            return (
              <div key={p.id} style={{ background: 'var(--os-panel)', border: '1px solid var(--os-border-2)', borderRadius: 18, overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
                <div className="flex items-center gap-2.5" style={{ padding: '13px 16px', background: 'var(--os-surface)', borderBottom: '1px solid var(--os-border-2)' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: projAccent(p.id), flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 500, flex: 1, color: 'var(--os-fg-0)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--os-fg-3)' }}>{pTasks.length} open</span>
                </div>
                <div style={{ padding: '2px 16px 8px' }}>
                  {pTasks.map(t => {
                    const d = taskDate(t);
                    const isOver = d && d < todayIso;
                    return (
                      <div key={t.id} className="flex items-center gap-3" style={{ padding: '12px 0', borderTop: '1px solid var(--os-divider)' }}>
                        <Checkbox id={t.id} done={!!t.completed} />
                        <span style={{ width: 7, height: 7, borderRadius: 999, flexShrink: 0, background: PRIO_COLOR[(t as any).priority] || '#A8A29A' }} />
                        <span style={{ flex: 1, fontSize: 13.5, color: 'var(--os-fg-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, whiteSpace: 'nowrap', color: isOver ? '#b4452f' : 'var(--os-fg-3)' }}>
                          {d ? (isOver ? 'overdue' : new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })) : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {open.length === 0 && (
            <div style={{ textAlign: 'center', padding: '30px 20px', background: 'var(--os-panel)', border: '1px dashed var(--os-border-2)', borderRadius: 16, fontSize: 13, color: 'var(--os-fg-3)' }}>
              No open tasks. All clear.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
