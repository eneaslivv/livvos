import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle, CheckCircle2, Calendar, Clock, ArrowRight, X,
  Sunrise, Sun, Moon, MessageSquare, Send, Loader2, Plus,
  RefreshCw, ShieldAlert, Check, Sparkles,
} from 'lucide-react';
import type { CalendarTask, CalendarEvent } from '../../hooks/useCalendar';
import { todayLocal } from '../../lib/dateUtils';
import { processStandupFromAI } from '../../lib/ai';
import type { StandupAction, StandupRisk, StandupAIResult } from '../../lib/ai';
import { supabase } from '../../lib/supabase';

interface Props {
  userId: string;
  userName: string;
  overdueTasks: CalendarTask[];
  todayTasks: CalendarTask[];
  todayEvents: CalendarEvent[];
  allTasks: CalendarTask[];
  projects: { id: string; title: string }[];
  onUpdateTask: (id: string, updates: Partial<CalendarTask>) => Promise<any>;
  onCreateTask: (task: Partial<CalendarTask>) => Promise<any>;
  onClose: () => void;
}

type Phase = 'briefing' | 'standup' | 'review' | 'done';

const getGreetingIcon = () => {
  const hour = new Date().getHours();
  if (hour < 12) return <Sunrise size={20} className="text-amber-500" />;
  if (hour < 18) return <Sun size={20} className="text-amber-500" />;
  return <Moon size={20} className="text-indigo-400" />;
};

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

const getDaysOverdue = (dateStr: string) => {
  const today = new Date(todayLocal());
  const due = new Date(dateStr);
  return Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
};

const formatTime = (time?: string) => {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
};

const ACTION_ICONS: Record<StandupAction['type'], React.ReactNode> = {
  complete: <CheckCircle2 size={15} className="text-emerald-500" />,
  create: <Plus size={15} className="text-blue-500" />,
  update_status: <RefreshCw size={15} className="text-amber-500" />,
  flag_blocked: <ShieldAlert size={15} className="text-red-500" />,
};

const ACTION_LABELS: Record<StandupAction['type'], string> = {
  complete: 'Mark as done',
  create: 'Create task',
  update_status: 'Update status',
  flag_blocked: 'Flag as blocked',
};

const ACTION_COLORS: Record<StandupAction['type'], string> = {
  complete: 'bg-emerald-50 border-emerald-100',
  create: 'bg-blue-50 border-blue-100',
  update_status: 'bg-amber-50 border-amber-100',
  flag_blocked: 'bg-red-50 border-red-100',
};

const RISK_COLORS: Record<string, string> = {
  high: 'bg-red-50 border-red-200 text-red-800',
  medium: 'bg-amber-50 border-amber-200 text-amber-800',
  low: 'bg-blue-50 border-blue-200 text-blue-700',
};

export const DailyBriefingModal: React.FC<Props> = ({
  userId,
  userName,
  overdueTasks,
  todayTasks,
  todayEvents,
  allTasks,
  projects,
  onUpdateTask,
  onCreateTask,
  onClose,
}) => {
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<Phase>('briefing');
  const [standupInput, setStandupInput] = useState('');
  const [standupResult, setStandupResult] = useState<StandupAIResult | null>(null);
  const [selectedActions, setSelectedActions] = useState<boolean[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const storageKey = `briefing-shown-${userId}-${todayLocal()}`;

  useEffect(() => {
    const alreadyShown = sessionStorage.getItem(storageKey);
    const hasContent = overdueTasks.length > 0 || todayTasks.length > 0 || todayEvents.length > 0 || allTasks.length > 0;
    if (!alreadyShown && hasContent) {
      setVisible(true);
    }
  }, [storageKey, overdueTasks.length, todayTasks.length, todayEvents.length, allTasks.length]);

  const handleClose = () => {
    sessionStorage.setItem(storageKey, '1');
    setVisible(false);
    onClose();
  };

  const pendingTodayTasks = todayTasks.filter(t => !t.completed);
  const completedTodayTasks = todayTasks.filter(t => t.completed);
  const progressPercent = todayTasks.length
    ? Math.round((completedTodayTasks.length / todayTasks.length) * 100)
    : 0;

  const firstName = userName.split(' ')[0];

  // Build project lookup for AI context
  const projectLookup = projects.reduce<Record<string, string>>((acc, p) => {
    acc[p.id] = p.title;
    return acc;
  }, {});

  const buildStandupContext = () => {
    const taskLines = allTasks.slice(0, 30).map(t =>
      `- [${t.id}] "${t.title}" | status:${t.status} | priority:${t.priority} | project:${(t.project_id && projectLookup[t.project_id]) || 'none'} | due:${t.start_date || 'none'}`
    ).join('\n');

    return `Today: ${todayLocal()}\nUser: ${firstName}\n\nStandup update:\n"${standupInput}"\n\nActive tasks:\n${taskLines}\n\nProjects: ${projects.map(p => p.title).join(', ')}`;
  };

  const handleSendStandup = async () => {
    if (!standupInput.trim() || loading) return;
    setLoading(true);
    setError(null);

    try {
      const context = buildStandupContext();
      const result = await processStandupFromAI(context);
      setStandupResult(result);
      setSelectedActions(result.actions.map(() => true));
      setPhase('review');
    } catch (err: any) {
      setError(err.isRateLimit ? 'AI busy — try again in 30s.' : (err.message || 'Failed to process standup'));
    } finally {
      setLoading(false);
    }
  };

  const handleApplyActions = async () => {
    if (!standupResult || applying) return;
    setApplying(true);
    setError(null);

    try {
      for (const [i, action] of standupResult.actions.entries()) {
        if (!selectedActions[i]) continue;

        switch (action.type) {
          case 'complete':
            if (action.taskId) {
              await onUpdateTask(action.taskId, {
                completed: true,
                status: 'done' as any,
                completed_at: new Date().toISOString(),
              } as any);
            }
            break;
          case 'create':
            if (action.newTask) {
              await onCreateTask({
                title: action.newTask.title,
                priority: action.newTask.priority,
                start_date: action.newTask.dueDate || todayLocal(),
                owner_id: userId,
              } as any);
            }
            break;
          case 'update_status':
            if (action.taskId && action.updates) {
              await onUpdateTask(action.taskId, action.updates as any);
            }
            break;
          case 'flag_blocked':
            if (action.taskId) {
              await onUpdateTask(action.taskId, { blocked_by: action.reason } as any);
            }
            break;
        }
      }

      // Save standup log (fire and forget)
      const appliedActions = standupResult.actions.filter((_, i) => selectedActions[i]);
      supabase.from('standup_logs').upsert({
        user_id: userId,
        standup_date: todayLocal(),
        raw_input: standupInput,
        ai_summary: standupResult.summary,
        actions_proposed: standupResult.actions,
        actions_applied: appliedActions,
        risks: standupResult.risks,
      }, { onConflict: 'tenant_id,user_id,standup_date' }).then(() => {});

      setPhase('done');
      setTimeout(handleClose, 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to apply actions');
    } finally {
      setApplying(false);
    }
  };

  const toggleAction = (index: number) => {
    setSelectedActions(prev => prev.map((v, i) => i === index ? !v : v));
  };

  const selectedCount = selectedActions.filter(Boolean).length;

  // ─── Render ───

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={phase === 'briefing' ? handleClose : undefined}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-[520px] bg-white rounded-2xl shadow-2xl overflow-hidden"
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            layout
          >
            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute top-3 right-3 z-10 p-1.5 rounded-full text-[#09090B]/40 hover:text-[#09090B] hover:bg-[#09090B]/5 transition-colors"
            >
              <X size={16} />
            </button>

            {/* Header */}
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-center gap-2 mb-1">
                {phase === 'done' ? <Sparkles size={20} className="text-emerald-500" /> : getGreetingIcon()}
                <span className="text-sm font-medium text-[#78736A]">
                  {phase === 'done' ? 'Standup complete' : phase === 'standup' || phase === 'review' ? 'Daily standup' : getGreeting()}
                </span>
              </div>
              <h2 className="text-xl font-semibold text-[#09090B]">
                {phase === 'done' ? 'All set!' : phase === 'review' ? 'Review actions' : phase === 'standup' ? 'What did you work on?' : firstName}
              </h2>

              {/* Progress bar — only in briefing phase */}
              {phase === 'briefing' && todayTasks.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-[#78736A]">Today's progress</span>
                    <span className="text-xs font-semibold text-[#09090B]">
                      {completedTodayTasks.length}/{todayTasks.length} tasks
                    </span>
                  </div>
                  <div className="h-2 bg-[#F0EDE6] rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPercent}%` }}
                      transition={{ duration: 0.8, delay: 0.3, ease: 'easeOut' }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="h-px bg-gradient-to-r from-transparent via-[#E6E2D8] to-transparent" />

            {/* ═══ PHASE: BRIEFING (original UI) ═══ */}
            {phase === 'briefing' && (
              <>
                <div className="px-6 py-4 space-y-4 max-h-[50vh] overflow-y-auto">
                  {overdueTasks.length > 0 && (
                    <div className="rounded-xl bg-red-50 border border-red-100 p-3.5">
                      <div className="flex items-center gap-2 mb-2.5">
                        <AlertTriangle size={15} className="text-red-500" />
                        <span className="text-xs font-semibold text-red-700 uppercase tracking-wider">
                          {overdueTasks.length} Overdue
                        </span>
                      </div>
                      <div className="space-y-2">
                        {overdueTasks.slice(0, 4).map(task => (
                          <div key={task.id} className="flex items-start gap-2">
                            <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-red-900 truncate">{task.title}</p>
                              <p className="text-[10px] text-red-500">
                                {getDaysOverdue(task.start_date!)} day{getDaysOverdue(task.start_date!) !== 1 ? 's' : ''} overdue
                              </p>
                            </div>
                          </div>
                        ))}
                        {overdueTasks.length > 4 && (
                          <p className="text-[11px] text-red-400 pl-3.5">+{overdueTasks.length - 4} more</p>
                        )}
                      </div>
                    </div>
                  )}

                  {pendingTodayTasks.length > 0 && (
                    <div className="rounded-xl bg-amber-50 border border-amber-100 p-3.5">
                      <div className="flex items-center gap-2 mb-2.5">
                        <CheckCircle2 size={15} className="text-amber-500" />
                        <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
                          {pendingTodayTasks.length} Due Today
                        </span>
                      </div>
                      <div className="space-y-2">
                        {pendingTodayTasks.slice(0, 4).map(task => (
                          <div key={task.id} className="flex items-start gap-2">
                            <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-amber-900 truncate">{task.title}</p>
                              {task.start_time && (
                                <p className="text-[10px] text-amber-500">{formatTime(task.start_time)}</p>
                              )}
                            </div>
                          </div>
                        ))}
                        {pendingTodayTasks.length > 4 && (
                          <p className="text-[11px] text-amber-400 pl-3.5">+{pendingTodayTasks.length - 4} more</p>
                        )}
                      </div>
                    </div>
                  )}

                  {todayEvents.length > 0 && (
                    <div className="rounded-xl bg-blue-50 border border-blue-100 p-3.5">
                      <div className="flex items-center gap-2 mb-2.5">
                        <Calendar size={15} className="text-blue-500" />
                        <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">
                          {todayEvents.length} Event{todayEvents.length !== 1 ? 's' : ''} Today
                        </span>
                      </div>
                      <div className="space-y-2">
                        {todayEvents.slice(0, 5).map(event => (
                          <div key={event.id} className="flex items-start gap-2">
                            <Clock size={12} className="text-blue-400 mt-0.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-blue-900 truncate">{event.title}</p>
                              {event.start_time && (
                                <p className="text-[10px] text-blue-500">
                                  {formatTime(event.start_time)}
                                  {event.end_time ? ` — ${formatTime(event.end_time)}` : ''}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer — two buttons */}
                <div className="px-6 pb-6 pt-2 space-y-2">
                  <button
                    onClick={() => { setPhase('standup'); setTimeout(() => textareaRef.current?.focus(), 100); }}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#09090B] text-white text-sm font-medium hover:bg-[#09090B]/90 transition-colors"
                  >
                    <MessageSquare size={15} />
                    Start Standup
                  </button>
                  <button
                    onClick={handleClose}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-[#78736A] text-sm hover:bg-[#F0EDE6] transition-colors"
                  >
                    Start Your Day
                    <ArrowRight size={14} />
                  </button>
                </div>
              </>
            )}

            {/* ═══ PHASE: STANDUP (textarea input) ═══ */}
            {phase === 'standup' && (
              <>
                <div className="px-6 py-4">
                  <p className="text-sm text-[#78736A] mb-3">
                    Tell me what you worked on, what you're doing next, or if anything is blocking you.
                  </p>
                  <textarea
                    ref={textareaRef}
                    value={standupInput}
                    onChange={e => setStandupInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSendStandup(); }}
                    placeholder="e.g. Finished the homepage redesign, started working on the API integration, blocked on the auth implementation..."
                    className="w-full h-28 p-3 rounded-xl border border-[#E6E2D8] bg-[#FAFAF8] text-sm text-[#09090B] placeholder:text-[#B5B0A5] resize-none focus:outline-none focus:ring-2 focus:ring-[#09090B]/10 focus:border-[#09090B]/20 transition-all"
                  />
                  {error && (
                    <p className="mt-2 text-xs text-red-500">{error}</p>
                  )}
                </div>

                <div className="px-6 pb-6 pt-1 flex gap-2">
                  <button
                    onClick={() => setPhase('briefing')}
                    className="flex items-center justify-center gap-1 py-2.5 px-4 rounded-xl text-[#78736A] text-sm hover:bg-[#F0EDE6] transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleSendStandup}
                    disabled={!standupInput.trim() || loading}
                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#09090B] text-white text-sm font-medium hover:bg-[#09090B]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Send size={14} />
                        Send
                      </>
                    )}
                  </button>
                </div>
              </>
            )}

            {/* ═══ PHASE: REVIEW (AI proposed actions) ═══ */}
            {phase === 'review' && standupResult && (
              <>
                <div className="px-6 py-4 space-y-4 max-h-[55vh] overflow-y-auto">
                  {/* Summary */}
                  <div className="rounded-xl bg-[#F5F3EE] border border-[#E6E2D8] p-3.5">
                    <p className="text-sm text-[#09090B]">{standupResult.summary}</p>
                  </div>

                  {/* Actions */}
                  {standupResult.actions.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-[#78736A] uppercase tracking-wider">
                        Proposed actions ({selectedCount}/{standupResult.actions.length})
                      </span>
                      {standupResult.actions.map((action, i) => (
                        <button
                          key={i}
                          onClick={() => toggleAction(i)}
                          className={`w-full flex items-start gap-3 p-3 rounded-xl border transition-all text-left ${
                            ACTION_COLORS[action.type]
                          } ${selectedActions[i] ? 'opacity-100' : 'opacity-50'}`}
                        >
                          <div className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                            selectedActions[i] ? 'bg-[#09090B] border-[#09090B]' : 'border-[#D4D0C8] bg-white'
                          }`}>
                            {selectedActions[i] && <Check size={12} className="text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              {ACTION_ICONS[action.type]}
                              <span className="text-xs font-medium text-[#78736A]">{ACTION_LABELS[action.type]}</span>
                            </div>
                            <p className="text-sm font-medium text-[#09090B] truncate">{action.taskTitle}</p>
                            <p className="text-xs text-[#78736A] mt-0.5">{action.reason}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Risks */}
                  {standupResult.risks.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-[#78736A] uppercase tracking-wider">
                        Risks detected
                      </span>
                      {standupResult.risks.map((risk, i) => (
                        <div
                          key={i}
                          className={`rounded-xl border p-3 ${RISK_COLORS[risk.severity] || RISK_COLORS.low}`}
                        >
                          <div className="flex items-center gap-2 mb-0.5">
                            <AlertTriangle size={13} />
                            <span className="text-xs font-semibold uppercase">{risk.type.replace(/_/g, ' ')}</span>
                          </div>
                          <p className="text-sm font-medium">{risk.title}</p>
                          <p className="text-xs opacity-80 mt-0.5">{risk.description}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {error && <p className="text-xs text-red-500">{error}</p>}
                </div>

                <div className="px-6 pb-6 pt-2 flex gap-2">
                  <button
                    onClick={() => { setPhase('standup'); setStandupResult(null); }}
                    className="flex items-center justify-center gap-1 py-2.5 px-4 rounded-xl text-[#78736A] text-sm hover:bg-[#F0EDE6] transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={handleApplyActions}
                    disabled={selectedCount === 0 || applying}
                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#09090B] text-white text-sm font-medium hover:bg-[#09090B]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {applying ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        Applying...
                      </>
                    ) : (
                      <>
                        <Check size={15} />
                        Apply {selectedCount} action{selectedCount !== 1 ? 's' : ''}
                      </>
                    )}
                  </button>
                </div>
              </>
            )}

            {/* ═══ PHASE: DONE (confirmation) ═══ */}
            {phase === 'done' && standupResult && (
              <div className="px-6 py-8 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4"
                >
                  <CheckCircle2 size={28} className="text-emerald-500" />
                </motion.div>
                <p className="text-sm text-[#09090B] font-medium mb-1">Standup saved</p>
                <p className="text-xs text-[#78736A] max-w-xs mx-auto">{standupResult.summary}</p>
                <button
                  onClick={handleClose}
                  className="mt-5 px-6 py-2.5 rounded-xl bg-[#09090B] text-white text-sm font-medium hover:bg-[#09090B]/90 transition-colors"
                >
                  Done
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
