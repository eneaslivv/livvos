import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Icons } from './ui/Icons';
import './AiAdvisor.css';
// Shared motion presets — same iOS-feel springs as Brief, so the
// floating advisor and the Brief page belong to one design system.
import { SPRING_TAP, SPRING_ENTER, TAP_SCALE } from '../lib/ui/motion';
// Web Speech API wrapper — drives the mic button in the chat input.
import { useVoiceInput } from '../hooks/useVoiceInput';
import {
  generateAdvisorInsights,
  getCachedAdvisorInsights,
  sendAdvisorChatWithActions,
  clearAICache,
  getOutputId,
  AdvisorInsight,
  type AdvisorAction,
} from '../lib/ai';
import { AIFeedbackBar } from './ai/AIFeedbackBar';
import { EmailDraftPanel } from './ai/EmailDraftPanel';
import { supabase } from '../lib/supabase';
import { useProjects } from '../context/ProjectsContext';
import { useFinance } from '../context/FinanceContext';
import { useTeam } from '../context/TeamContext';
import { useCalendar } from '../context/CalendarContext';
import { useClients } from '../hooks/useClients';
import { useAuth } from '../hooks/useAuth';
import { useRBAC } from '../context/RBACContext';
import { useTenant } from '../context/TenantContext';
import { errorLogger } from '../lib/errorLogger';
import { LinkifiedText } from './ui/LinkifiedText';
// Markdown renderer — same one used in Brief chat. Supports headings,
// **bold**, bullets, [urgent]/[high]/[low]/[done] priority dots, and
// the rich custom directives (:::stat:::, :::callout:::, :::grid:::,
// :::section:::, :::row:::, :::kpi:::, :::tasklist:::) that turn flat
// AI replies into scannable structured cards.
import { Markdown } from '../lib/markdown';
// Memory layer — every AiAdvisor turn lands in agent_conversations so
// the critique loop sees it alongside Brief/orchestrator turns. The
// user profile is injected into context so style/length preferences
// learned elsewhere also apply here.
import {
  getUserProfile,
  formatProfileForPrompt,
  recordFeedback,
  logConversationTurn,
  type UserProfile,
} from '../lib/agents';

const AREA_CONFIG: Record<string, { gradient: string; iconBg: string; border: string }> = {
  projects: { gradient: 'from-blue-500/8 to-transparent', iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', border: 'border-blue-500/10' },
  finance: { gradient: 'from-emerald-500/8 to-transparent', iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/10' },
  marketing: { gradient: 'from-fuchsia-500/8 to-transparent', iconBg: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400', border: 'border-fuchsia-500/10' },
  team: { gradient: 'from-sky-500/8 to-transparent', iconBg: 'bg-sky-500/10 text-sky-600 dark:text-sky-400', border: 'border-sky-500/10' },
  planning: { gradient: 'from-amber-500/8 to-transparent', iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', border: 'border-amber-500/10' },
};

const PRIORITY_LABEL: Record<string, { text: string; color: string }> = {
  high: { text: 'Urgent', color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  medium: { text: 'This week', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  low: { text: 'Info', color: 'bg-zinc-500/10 text-zinc-500 dark:text-zinc-400' },
};

const getIconComponent = (iconName: string) => {
  const map: Record<string, any> = {
    Briefcase: Icons.Briefcase,
    DollarSign: Icons.DollarSign,
    TrendingUp: Icons.TrendingUp,
    Users: Icons.Users,
    Target: Icons.Target,
    Calendar: Icons.Calendar,
    Zap: Icons.Zap,
    Star: Icons.Star,
    Flag: Icons.Flag,
    Sparkles: Icons.Sparkles,
  };
  return map[iconName] || Icons.Sparkles;
};

// Per-prompt tone color drives the suggestion card's left accent bar +
// icon-badge tint (mapped to Livv design system tokens: gold/sage/sky/
// pink/wine/violet). Strictly cosmetic — `color` is not used by logic.
const SUGGESTED_PROMPTS: { label: string; prompt: string; icon: keyof typeof Icons; kind: 'chat' | 'insights'; color: string }[] = [
  { label: 'Strategic overview', prompt: '__INSIGHTS__', icon: 'Sparkles', kind: 'insights', color: '#E8BC59' },
  { label: 'Plan my week', prompt: 'Plan my week: pick 4-6 priority tasks spread Mon-Fri across my active projects. Propose the actions so I can approve them.', icon: 'Calendar', kind: 'chat', color: '#5c1d18' },
  { label: 'Where to focus', prompt: 'What projects and tasks should I focus on this week, considering deadlines and priorities?', icon: 'Target', kind: 'chat', color: '#769268' },
  { label: 'Team workload', prompt: 'Who on the team is most loaded right now and who has bandwidth? Cite open task counts and overdue items per person.', icon: 'Users', kind: 'chat', color: '#E8BC59' },
  { label: 'Follow up on a teammate', prompt: 'Pick one teammate who looks stuck (overdue tasks or no movement this week) and propose a short follow-up task assigned to them so I can approve it.', icon: 'ListChecks', kind: 'chat', color: '#F1ADD8' },
  { label: 'Financial health', prompt: 'Analyze my current financial health: paid vs pending income, expenses, and balance.', icon: 'TrendingUp', kind: 'chat', color: '#769268' },
  { label: 'Project risks', prompt: 'What projects are at risk or behind, and what can I do? If something should be delegated, suggest it.', icon: 'Flag', kind: 'chat', color: '#6DBEDC' },
  { label: 'Break project into tasks', prompt: 'Pick my most urgent project and break it into 5-8 concrete tasks I can approve to create at once.', icon: 'List', kind: 'chat', color: '#6DBEDC' },
  { label: 'Log expense', prompt: 'Log an expense of $X concept Y to category Z. If you are missing info, ask me before proposing the action.', icon: 'DollarSign', kind: 'chat', color: '#769268' },
];

// Each chat message is either a user line, an assistant text reply, an
// assistant insights card, OR an assistant action proposal that the user
// can approve/reject in-line. Action statuses persist with the message
// so the chat history remembers which proposals were applied.
export type ProposedAction = AdvisorAction & {
  /** Local id so React can key + update status on this specific card. */
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'failed';
  errorMsg?: string;
};

// `conversationId` (when present) points at the agent_conversations row
// for this turn — used by the thumbs UI + action-feedback signals to
// feed the same learning loop the orchestrator uses. `thumbs` caches
// the user's vote so the buttons don't re-fire on re-render.
type ChatMsg =
  | { role: 'user'; content: string; ts?: number }
  | { role: 'assistant'; content: string; outputId?: string | null; actions?: ProposedAction[]; ts?: number; conversationId?: string | null; thumbs?: 'up' | 'down' }
  | { role: 'assistant'; kind: 'insights'; greeting: string; insights: AdvisorInsight[]; outputId?: string | null; ts?: number; conversationId?: string | null; thumbs?: 'up' | 'down' };

// localStorage key — one bucket per user per day. Keeps the current day
// available across reopens without polluting older days.
const STORAGE_VERSION = 'v1';
const todayKey = () => new Date().toISOString().split('T')[0];
const storageKey = (userId: string) => `eneas-os:ai-advisor:${STORAGE_VERSION}:${userId}:${todayKey()}`;

const InsightsBlock: React.FC<{ greeting: string; insights: AdvisorInsight[] }> = ({ greeting, insights }) => (
  <div className="space-y-2.5">
    {greeting && (
      <p className="text-[12px] leading-relaxed text-zinc-700 dark:text-zinc-300">{greeting}</p>
    )}
    {insights.map((insight, idx) => {
      const config = AREA_CONFIG[insight.area] || AREA_CONFIG.planning;
      const IconComp = getIconComponent(insight.icon);
      const priority = PRIORITY_LABEL[insight.priority] || PRIORITY_LABEL.low;
      return (
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ ...SPRING_ENTER, delay: idx * 0.05 }}
          whileHover={{ y: -1, transition: SPRING_TAP }}
          className={`p-3 rounded-xl bg-gradient-to-br ${config.gradient} border ${config.border}`}
        >
          <div className="flex items-start gap-2.5">
            <div className={`w-7 h-7 rounded-lg ${config.iconBg} flex items-center justify-center shrink-0`}>
              <IconComp size={13} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-[12px] font-bold text-zinc-900 dark:text-zinc-100">{insight.title}</h4>
                <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${priority.color}`}>
                  {priority.text}
                </span>
              </div>
              <p className="text-[11px] leading-[1.55] text-zinc-600 dark:text-zinc-400">{insight.body}</p>
            </div>
          </div>
        </motion.div>
      );
    })}
  </div>
);

// ── Action proposal card ─────────────────────────────────────────
// Renders below an assistant message when the AI proposes something
// actionable. Approve runs the handler; Reject just dismisses.
const ActionCard: React.FC<{
  action: ProposedAction;
  onApprove: () => void;
  onReject: () => void;
}> = ({ action, onApprove, onReject }) => {
  const kindLabel: Record<string, { icon: keyof typeof Icons; label: string; color: string }> = {
    create_task: { icon: 'Check', label: 'Create task', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
    update_task: { icon: 'Edit', label: 'Edit task', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
    create_project: { icon: 'Briefcase', label: 'Create project', color: 'bg-violet-500/10 text-violet-600 border-violet-500/20' },
    update_project: { icon: 'Edit', label: 'Edit project', color: 'bg-violet-500/10 text-violet-600 border-violet-500/20' },
    create_tasks_batch: { icon: 'List', label: 'Create multiple tasks', color: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20' },
    plan_week: { icon: 'Calendar', label: 'Plan the week', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
    suggest_delegate: { icon: 'Users', label: 'Delegation suggestion', color: 'bg-fuchsia-500/10 text-fuchsia-600 border-fuchsia-500/20' },
    create_expense: { icon: 'TrendingUp', label: 'Log expense', color: 'bg-rose-500/10 text-rose-600 border-rose-500/20' },
    update_expense: { icon: 'Edit', label: 'Edit expense', color: 'bg-rose-500/10 text-rose-600 border-rose-500/20' },
    create_income: { icon: 'TrendingUp', label: 'Log income', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
    update_income: { icon: 'Edit', label: 'Edit income', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
    create_budget: { icon: 'DollarSign', label: 'Create budget', color: 'bg-teal-500/10 text-teal-600 border-teal-500/20' },
    update_budget: { icon: 'DollarSign', label: 'Edit budget', color: 'bg-teal-500/10 text-teal-600 border-teal-500/20' },
    mark_expense_paid: { icon: 'Check', label: 'Mark expense as paid', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
    mark_installment_paid: { icon: 'Check', label: 'Mark installment paid', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  };
  const meta = kindLabel[action.kind] || { icon: 'Sparkles' as const, label: action.kind, color: 'bg-zinc-500/10 text-zinc-600 border-zinc-500/20' };
  const Icon = (Icons as any)[meta.icon] || Icons.Sparkles;

  // Render a small details preview based on action kind
  const renderDetails = () => {
    if (action.kind === 'create_task') {
      const p = action.params;
      return (
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 space-y-0.5">
          <div className="font-medium text-zinc-700 dark:text-zinc-200">{p.title}</div>
          {(p.due_date || p.priority) && (
            <div className="flex gap-2">
              {p.due_date && <span>· due {p.due_date}</span>}
              {p.priority && <span>· {p.priority}</span>}
            </div>
          )}
        </div>
      );
    }
    if (action.kind === 'create_project') {
      const p = action.params;
      return (
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
          <div className="font-medium text-zinc-700 dark:text-zinc-200">{p.title}</div>
          {p.deadline && <div>· deadline {p.deadline}</div>}
        </div>
      );
    }
    if (action.kind === 'create_tasks_batch') {
      const p = action.params;
      return (
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 space-y-0.5">
          <div className="font-medium text-zinc-700 dark:text-zinc-200">{p.tasks.length} tasks:</div>
          <ul className="pl-3 space-y-0.5">
            {p.tasks.slice(0, 6).map((t, i) => (
              <li key={i} className="truncate">— {t.title}{t.priority ? ` · ${t.priority}` : ''}</li>
            ))}
            {p.tasks.length > 6 && <li className="italic">+{p.tasks.length - 6} more…</li>}
          </ul>
        </div>
      );
    }
    if (action.kind === 'plan_week') {
      const p = action.params;
      return (
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 space-y-0.5">
          <div className="font-medium text-zinc-700 dark:text-zinc-200">Semana del {p.week_start}</div>
          {p.goals?.length > 0 && (
            <ul className="pl-3 space-y-0.5">
              {p.goals.map((g, i) => <li key={i}>• {g}</li>)}
            </ul>
          )}
          {p.suggested_tasks && p.suggested_tasks.length > 0 && (
            <div className="mt-1">{p.suggested_tasks.length} proposed tasks</div>
          )}
        </div>
      );
    }
    if (action.kind === 'suggest_delegate') {
      const p = action.params;
      return (
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
          {p.reason}
        </div>
      );
    }
    if (action.kind === 'create_expense' || action.kind === 'create_income') {
      const p = action.params as any;
      const sign = action.kind === 'create_expense' ? '-' : '+';
      const color = action.kind === 'create_expense' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400';
      return (
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 space-y-0.5">
          <div className="font-medium text-zinc-700 dark:text-zinc-200">{p.concept}</div>
          <div className="flex gap-2 items-center">
            <span className={`font-semibold tabular-nums ${color}`}>{sign}${Math.abs(p.amount || 0).toLocaleString()}</span>
            {p.category && <span>· {p.category}</span>}
            {p.date && <span>· {p.date}</span>}
            {p.due_date && <span>· vence {p.due_date}</span>}
            {p.status && <span>· {p.status}</span>}
            {p.recurring && <span>· recurring</span>}
          </div>
        </div>
      );
    }
    if (action.kind === 'create_budget') {
      const p = action.params;
      return (
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
          <div className="font-medium text-zinc-700 dark:text-zinc-200">{p.name}</div>
          <div>· ${p.allocated_amount.toLocaleString()} {p.period || 'monthly'}{p.category ? ` · ${p.category}` : ''}</div>
        </div>
      );
    }
    if (action.kind === 'update_budget') {
      const p = action.params;
      const changes: string[] = [];
      if (p.allocated_amount !== undefined) changes.push(`monto → $${p.allocated_amount.toLocaleString()}`);
      if (p.name !== undefined) changes.push(`nombre → "${p.name}"`);
      if (p.is_active !== undefined) changes.push(p.is_active ? 'activar' : 'desactivar');
      if (p.end_date !== undefined) changes.push(`end_date → ${p.end_date || 'null'}`);
      return (
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">{changes.join(' · ')}</div>
      );
    }
    if (action.kind === 'update_project') {
      const p = action.params as any;
      const changes: string[] = [];
      if (p.title !== undefined)    changes.push(`title → "${p.title}"`);
      if (p.budget !== undefined)   changes.push(`budget → $${p.budget.toLocaleString()}${p.currency ? ' ' + p.currency : ''}`);
      if (p.status !== undefined)   changes.push(`status → ${p.status}`);
      if (p.deadline !== undefined) changes.push(`deadline → ${p.deadline || 'no date'}`);
      if (p.description !== undefined) changes.push('description updated');
      return <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">{changes.join(' · ') || 'no changes'}</div>;
    }
    if (action.kind === 'update_task') {
      const p = action.params as any;
      const changes: string[] = [];
      if (p.title !== undefined)     changes.push(`title → "${p.title}"`);
      if (p.status !== undefined)    changes.push(`status → ${p.status}`);
      if (p.priority !== undefined)  changes.push(`priority → ${p.priority}`);
      if (p.due_date !== undefined)  changes.push(`date → ${p.due_date || 'no date'}`);
      if (p.completed !== undefined) changes.push(p.completed ? 'mark as done' : 'reopen');
      return <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">{changes.join(' · ') || 'no changes'}</div>;
    }
    if (action.kind === 'update_expense') {
      const p = action.params as any;
      const changes: string[] = [];
      if (p.amount !== undefined)   changes.push(`amount → $${p.amount.toLocaleString()}`);
      if (p.concept !== undefined)  changes.push(`concept → "${p.concept}"`);
      if (p.category !== undefined) changes.push(`category → ${p.category}`);
      if (p.date !== undefined)     changes.push(`date → ${p.date}`);
      if (p.status !== undefined)   changes.push(`status → ${p.status}`);
      return <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">{changes.join(' · ') || 'no changes'}</div>;
    }
    if (action.kind === 'update_income') {
      const p = action.params as any;
      const changes: string[] = [];
      if (p.total_amount !== undefined) changes.push(`amount → $${p.total_amount.toLocaleString()}`);
      if (p.concept !== undefined)      changes.push(`concept → "${p.concept}"`);
      if (p.due_date !== undefined)     changes.push(`due → ${p.due_date}`);
      if (p.status !== undefined)       changes.push(`status → ${p.status}`);
      return <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">{changes.join(' · ') || 'no changes'}</div>;
    }
    if (action.kind === 'mark_expense_paid' || action.kind === 'mark_installment_paid') {
      // Summary already says enough; no extra details needed.
      return null;
    }
    return null;
  };

  // Status pills
  if (action.status === 'approved') {
    return (
      <div className={`mt-2 p-2.5 rounded-lg border bg-emerald-50/50 dark:bg-emerald-500/5 border-emerald-300/50 dark:border-emerald-500/20`}>
        <div className="flex items-center gap-2">
          <Icons.CheckCircle size={12} className="text-emerald-600 dark:text-emerald-400" />
          <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">Applied · {meta.label}</span>
        </div>
        <div className="text-[10px] text-emerald-600/80 dark:text-emerald-500/80 mt-0.5 ml-5 truncate">{action.summary}</div>
      </div>
    );
  }
  if (action.status === 'rejected') {
    return (
      <div className="mt-2 p-2 rounded-lg border bg-zinc-50/50 dark:bg-zinc-800/30 border-zinc-200 dark:border-zinc-700/40">
        <div className="flex items-center gap-2 text-[11px] text-zinc-400 dark:text-zinc-500">
          <Icons.X size={11} />
          Rejected · {meta.label}
        </div>
      </div>
    );
  }
  if (action.status === 'failed') {
    return (
      <div className="mt-2 p-2.5 rounded-lg border bg-rose-50/50 dark:bg-rose-500/5 border-rose-300/40 dark:border-rose-500/20">
        <div className="flex items-center gap-2">
          <Icons.AlertCircle size={12} className="text-rose-500" />
          <span className="text-[11px] font-medium text-rose-700 dark:text-rose-400">Error al aplicar</span>
        </div>
        <div className="text-[10px] text-rose-600/80 dark:text-rose-500/80 mt-0.5">{action.errorMsg || 'Retry, or log it manually.'}</div>
      </div>
    );
  }

  // Pending — show approve/reject UI
  return (
    <div className={`mt-2 p-3 rounded-xl border ${meta.color}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={13} />
        <span className="text-[11px] font-bold uppercase tracking-wider">{meta.label}</span>
      </div>
      <div className="text-[12px] font-medium text-zinc-800 dark:text-zinc-100 leading-snug">{action.summary}</div>
      {renderDetails()}
      <div className="flex gap-1.5 mt-2.5">
        <button
          onClick={onApprove}
          className="flex-1 px-2.5 py-1.5 text-[11px] font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
        >
          <Icons.Check size={11} />
          Approve & apply
        </button>
        <button
          onClick={onReject}
          className="px-2.5 py-1.5 text-[11px] font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          Reject
        </button>
      </div>
    </div>
  );
};

// ── AdvisorMicButton ──────────────────────────────────────────────
// Dual-mode mic (tap=toggle, hold≥250ms=press-and-talk-with-auto-send).
// Mirrors the MicButton pattern in pages/Brief.tsx — kept inline here
// rather than shared because the AiAdvisor design uses p-2.5 padding
// vs Brief's p-2 and the file is heavily isolated already.
const AdvisorMicButton: React.FC<{
  voice: ReturnType<typeof useVoiceInput>;
  voiceLang: string;
  busy: boolean;
  reduceMotion: boolean;
}> = ({ voice, voiceLang, busy, reduceMotion }) => {
  const holdTimerRef = useRef<number | null>(null);
  const becameHoldRef = useRef(false);

  const clearTimer = () => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (busy) return;
    if (voice.isListening) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    becameHoldRef.current = false;
    holdTimerRef.current = window.setTimeout(() => {
      becameHoldRef.current = true;
      voice.startHold();
    }, 250);
  };

  const onPointerUp = () => {
    clearTimer();
    if (becameHoldRef.current) {
      voice.stopHold();
      becameHoldRef.current = false;
    } else if (voice.isListening) {
      voice.stop();
    } else {
      voice.start();
    }
  };

  const onPointerLeave = () => {
    if (holdTimerRef.current !== null || becameHoldRef.current) {
      clearTimer();
      if (becameHoldRef.current) {
        voice.stopHold();
        becameHoldRef.current = false;
      }
    }
  };

  return (
    <motion.button
      type="button"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerLeave}
      disabled={busy}
      title={voice.isListening
        ? 'Listening — release to send (hold) or tap to stop'
        : `Tap to dictate · hold to speak + auto-send (${voiceLang})`}
      aria-label={voice.isListening ? 'Stop dictation' : 'Start dictation'}
      whileTap={{ scale: 0.9, transition: SPRING_TAP }}
      animate={voice.isListening
        ? { scale: [1, 1.06, 1], transition: { duration: 1.1, repeat: Infinity, ease: 'easeInOut' } }
        : { scale: 1 }
      }
      className={`p-2.5 rounded-xl border transition-colors relative select-none ${
        voice.isListening
          ? 'bg-rose-500 border-rose-500 text-white shadow-[0_0_0_4px_rgba(244,63,94,0.18)]'
          : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:border-zinc-300 dark:hover:border-zinc-600 disabled:opacity-40'
      }`}
    >
      <Icons.Mic size={13} />
      {voice.isListening && !reduceMotion && (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-xl bg-rose-500/30"
          initial={{ scale: 1, opacity: 0.6 }}
          animate={{ scale: 1.6, opacity: 0 }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
    </motion.button>
  );
};

export const AiAdvisor: React.FC = () => {
  const { user } = useAuth();
  const { user: profile } = useRBAC();
  const { currentTenant } = useTenant();
  const { projects, createProject, updateProject } = useProjects();
  const { incomes, expenses, budgets, createIncome, createExpense, createBudget, updateBudget, updateExpense, updateInstallment, updateIncome } = useFinance();
  const { members } = useTeam();
  const { createTask, updateTask, tasks: allTasks } = useCalendar();
  const { clients } = useClients();

  const reduceMotion = useReducedMotion();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(false);

  // ── Learned user profile (preferred tone/length/manual notes/learned
  // traits from the critique loop). Injected into every context summary
  // so AiAdvisor adapts to the same preferences Brief learns. Lazy: only
  // fetched once the chat opens for the first time so closed-state cost
  // is zero.
  const [aiProfile, setAiProfile] = useState<UserProfile | null>(null);
  useEffect(() => {
    if (!isOpen || !user?.id || !currentTenant?.id || aiProfile) return;
    let cancelled = false;
    getUserProfile(supabase as any, { userId: user.id, tenantId: currentTenant.id })
      .then(p => { if (!cancelled) setAiProfile(p); })
      .catch(() => { /* default profile is fine */ });
    return () => { cancelled = true; };
  }, [isOpen, user?.id, currentTenant?.id, aiProfile]);

  // ── Voice input — mirrors Brief: derive a BCP-47 lang from the
  // user's preferred_language (es-AR / en-US / pt-BR / browser
  // default), pipe partials into the textarea live, don't auto-send.
  const voiceLang = useMemo(() => {
    const lang = aiProfile?.preferred_language || 'auto';
    const map: Record<string, string> = {
      es: 'es-AR',
      en: 'en-US',
      pt: 'pt-BR',
      auto: typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US',
    };
    return map[lang] || 'en-US';
  }, [aiProfile?.preferred_language]);
  const voice = useVoiceInput({
    lang: voiceLang,
    onPartial: (text) => setInput(text),
    // Hold-mode (press-and-hold the mic) → auto-send on release.
    // Same UX as Brief; sendQuestion is defined below so we
    // reference it lazily via a ref to avoid a TDZ.
    onAutoSend: (text) => {
      const trimmed = text.trim();
      if (trimmed) sendQuestionRef.current?.(trimmed);
    },
  });
  // ref bridge for the hold-mode auto-send — sendQuestion is defined
  // far below in this large component and the callback closure here
  // would otherwise capture an undefined reference.
  const sendQuestionRef = useRef<((q: string) => void) | null>(null);

  // ── Daily persistence: load on mount, save on every change ────────
  // Keyed per user + per day. Older days quietly stay in localStorage —
  // we don't read them, but they survive a future migration if we want
  // to add a history view. Keep clear-history for a fresh start.
  const storageKeyForUser = useMemo(() => user?.id ? storageKey(user.id) : null, [user?.id]);

  useEffect(() => {
    if (!storageKeyForUser) return;
    try {
      const raw = localStorage.getItem(storageKeyForUser);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setMessages(parsed);
      }
    } catch (err) { errorLogger.warn('advisor: load failed', err); }
  }, [storageKeyForUser]);

  useEffect(() => {
    if (!storageKeyForUser) return;
    try {
      // Don't bother writing an empty array unless something was previously
      // saved — avoids re-stamping the storage on every cold mount.
      if (messages.length === 0) {
        if (localStorage.getItem(storageKeyForUser)) localStorage.removeItem(storageKeyForUser);
        return;
      }
      localStorage.setItem(storageKeyForUser, JSON.stringify(messages));
    } catch { /* quota / private mode — ignore */ }
  }, [messages, storageKeyForUser]);

  // Hide the floating AI pill when any other modal/slide-panel is open. We
  // detect this by watching document.body's overflow style — every modal in
  // the app locks scroll via `body { overflow: hidden }` when it opens.
  // MutationObserver picks up the change without polling and reverts when
  // the modal closes.
  const [otherModalOpen, setOtherModalOpen] = useState(false);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const update = () => {
      const overflow = document.body.style.overflow;
      // While the AiAdvisor itself is open it also locks scroll; ignore that
      // case so the panel's own animation doesn't trigger our hide.
      setOtherModalOpen(overflow === 'hidden' && !isOpen);
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
    return () => observer.disconnect();
  }, [isOpen]);
  const [sessionExpired, setSessionExpired] = useState(false);
  // Email draft modal state — opens via the "Draft email" shortcut.
  // Holds optional pre-fills derived from the current chat context.
  const [emailDraftOpen, setEmailDraftOpen] = useState(false);
  const [emailDraftBrief, setEmailDraftBrief] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Close on Escape, lock body scroll while open ─────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
    if (isOpen) {
      document.addEventListener('keydown', handler);
      document.body.style.overflow = 'hidden';
      // Focus input on open
      setTimeout(() => inputRef.current?.focus(), 200);
    }
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // ── Auto-scroll on new messages ──────────────────────────────────
  // Long pasted prompts caused the chat to land at the TOP of the new
  // message instead of the bottom of the conversation. Two issues we hit:
  //   1. The first scroll fires before the new message has fully laid
  //      out, so scrollHeight is still the old value.
  //   2. Framer-motion enter animations + markdown / LinkifiedText
  //      reflow keep changing the height for a few hundred ms after
  //      mount.
  // Fix: scroll a sentinel <div> at the very bottom into view on the
  // next two animation frames (post-paint, post-motion). Plus a
  // MutationObserver tracks any DOM growth while sending=true so the
  // assistant reply also anchors. We only auto-anchor when the user is
  // already near the bottom so reading history isn't disrupted.
  const isNearBottomRef = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      isNearBottomRef.current = distanceFromBottom < 80;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToEnd = useCallback((behavior: ScrollBehavior = 'auto') => {
    const sentinel = endRef.current;
    const container = scrollRef.current;
    if (sentinel && typeof sentinel.scrollIntoView === 'function') {
      sentinel.scrollIntoView({ block: 'end', behavior });
    } else if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  useEffect(() => {
    // A new turn always anchors to the bottom — that's what the user
    // expects after sending. Same goes for opening the panel: when
    // isOpen flips false → true the messages array is unchanged but the
    // panel was just remounted/revealed, so we still want the most
    // recent turn in view.
    if (!isOpen) return;
    isNearBottomRef.current = true;
    scrollToEnd('auto');
    const r1 = requestAnimationFrame(() => {
      scrollToEnd('auto');
      const r2 = requestAnimationFrame(() => scrollToEnd('auto'));
      (scrollToEnd as any)._r2 = r2;
    });
    return () => {
      cancelAnimationFrame(r1);
      const r2 = (scrollToEnd as any)._r2;
      if (r2) cancelAnimationFrame(r2);
    };
  }, [messages, sending, insightsLoading, scrollToEnd, isOpen]);

  // MutationObserver — re-anchor when DOM grows after mount (markdown
  // expanding, motion finishing, action cards appearing). Only when the
  // user is still near the bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof MutationObserver === 'undefined') return;
    const mo = new MutationObserver(() => {
      if (isNearBottomRef.current) scrollToEnd('auto');
    });
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => mo.disconnect();
  }, [isOpen, scrollToEnd]);

  // ── Build context summary from app state ─────────────────────────
  // Includes IDs for projects/clients/members so the AI can reference
  // them when proposing actions (action validators reject any id not
  // present in this context).
  const buildContextSummary = useCallback(() => {
    const lines: string[] = [];
    const now = new Date();
    const currentUserId = user?.id || null;
    const currentUserName = profile?.name || user?.email?.split('@')[0] || 'Usuario';

    // ─── ME — current user identity + scoped data ─────────────────────
    // The AI was answering "no tasks assigned to you" because the context
    // never told it WHICH user is asking. Now we pin a TÚ block with the
    // current user's id + their assigned tasks + their owned projects so
    // questions like "qué me recomendás que haga" route to a person-
    // specific answer instead of a tenant-wide one.
    if (currentUserId) {
      lines.push(`TÚ (current user): "${currentUserName}" id=${currentUserId}`);

      // Tasks assigned to me (open) — sorted urgent → high → medium → low,
      // then by due date asc.
      const priorityRank: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      const myOpenTasks = (allTasks || [])
        .filter((t: any) => {
          if (t.completed || t.status === 'cancelled' || t.parent_task_id) return false;
          if (t.completed_by === currentUserId) return false;
          return (Array.isArray(t.assignee_ids) && t.assignee_ids.includes(currentUserId))
              || t.assigned_to === currentUserId
              || t.assignee_id === currentUserId;
        })
        .sort((a: any, b: any) => {
          const pa = priorityRank[a.priority || 'medium'] ?? 2;
          const pb = priorityRank[b.priority || 'medium'] ?? 2;
          if (pa !== pb) return pa - pb;
          return (a.start_date || a.due_date || '9999-12-31').localeCompare(b.start_date || b.due_date || '9999-12-31');
        });

      const myOverdue = myOpenTasks.filter((t: any) => {
        const d = t.start_date || t.due_date;
        return d && new Date(d).getTime() < now.setHours(0, 0, 0, 0);
      });
      // Reset `now` since setHours mutated it above.
      const today = new Date();

      const myCompletedThisWeek = (allTasks || []).filter((t: any) => {
        if (!t.completed || !t.completed_at) return false;
        const isMine = t.completed_by === currentUserId
          || (Array.isArray(t.assignee_ids) && t.assignee_ids.includes(currentUserId))
          || t.assigned_to === currentUserId
          || t.assignee_id === currentUserId;
        if (!isMine) return false;
        const completed = new Date(t.completed_at);
        const weekStart = new Date(today);
        weekStart.setHours(0, 0, 0, 0);
        weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
        return completed >= weekStart;
      });

      lines.push(`MY OPEN TASKS (${myOpenTasks.length} total, ${myOverdue.length} overdue):`);
      myOpenTasks.slice(0, 12).forEach((t: any) => {
        const due = t.start_date || t.due_date;
        const overdueFlag = due && new Date(due).getTime() < new Date(today.toDateString()).getTime() ? ' [OVERDUE]' : '';
        lines.push(`- id=${t.id} | "${t.title}" | ${t.priority || 'medium'} | ${t.status || 'todo'} | due: ${due || 'n/a'}${overdueFlag}${t.project_name ? ` | ${t.project_name}` : ''}`);
      });
      if (myOpenTasks.length > 12) lines.push(`  …+${myOpenTasks.length - 12} more`);

      lines.push(`MY COMPLETED TASKS THIS WEEK: ${myCompletedThisWeek.length}`);

      const myOwnedProjects = projects.filter((p: any) => p.owner_id === currentUserId);
      if (myOwnedProjects.length > 0) {
        lines.push(`MY PROJECTS (owner): ${myOwnedProjects.length} (${myOwnedProjects.map((p: any) => `"${p.title}"`).join(', ')})`);
      }
      lines.push('');
    }

    const activeProjects = projects
      .filter(p => p.status === 'Active' || p.status === 'Pending')
      .sort((a, b) => {
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      })
      .slice(0, 8);
    const overdueCount = projects.filter(p => p.deadline && new Date(p.deadline) < new Date() && p.status !== 'Completed').length;
    lines.push(`PROYECTOS (${projects.length} total, ${activeProjects.length} activos, ${overdueCount} atrasados):`);
    activeProjects.forEach(p => {
      lines.push(`- id=${p.id} | "${p.title}" | ${p.clientName} | ${p.progress}% | deadline: ${p.deadline || 'n/a'}`);
    });

    if (clients && clients.length > 0) {
      lines.push(`\nCLIENTES (${clients.length}):`);
      clients.slice(0, 12).forEach((c: any) => {
        lines.push(`- id=${c.id} | "${c.name || c.company || c.email}"`);
      });
    }

    const totalIncome = (incomes || []).reduce((s: number, i: any) => s + (i.total_amount || 0), 0);
    const paidIncome = (incomes || []).reduce((s: number, i: any) => {
      const paid = (i.installments || []).filter((inst: any) => inst.status === 'paid');
      return s + paid.reduce((sum: number, inst: any) => sum + (inst.amount || 0), 0);
    }, 0);
    const totalExpenses = (expenses || []).reduce((s: number, e: any) => s + (e.amount || 0), 0);
    lines.push(`\nFINANZAS: Ingresos $${totalIncome.toLocaleString()} (cobrado $${paidIncome.toLocaleString()}) | Gastos $${totalExpenses.toLocaleString()} | Balance $${(paidIncome - totalExpenses).toLocaleString()}`);

    // Budgets — required when AI proposes update_budget actions.
    const activeBudgets = (budgets || []).filter((b: any) => b.is_active);
    if (activeBudgets.length > 0) {
      lines.push(`\nBUDGETS activos (${activeBudgets.length}):`);
      activeBudgets.slice(0, 10).forEach((b: any) => {
        lines.push(`- id=${b.id} | "${b.name}" | $${(b.allocated_amount || 0).toLocaleString()} ${b.period || 'monthly'} | category: ${b.category || 'n/a'}`);
      });
    }
    lines.push(`\nEXPENSE_CATEGORIES: Software, Talent, Marketing, Operations, Legal`);

    // Recent expenses — needed for mark_expense_paid references.
    const recentExpenses = (expenses || []).slice(0, 8);
    if (recentExpenses.length > 0) {
      lines.push(`\nGASTOS RECIENTES (${recentExpenses.length} de ${expenses.length}):`);
      recentExpenses.forEach((e: any) => {
        lines.push(`- id=${e.id} | "${e.concept}" | $${(e.amount || 0).toLocaleString()} | ${e.category} | ${e.status} | ${e.date}`);
      });
    }

    // Upcoming unpaid installments — needed for mark_installment_paid.
    const upcomingInstallments: any[] = [];
    (incomes || []).forEach((inc: any) => {
      (inc.installments || [])
        .filter((inst: any) => inst.status !== 'paid')
        .slice(0, 2)
        .forEach((inst: any) => {
          upcomingInstallments.push({ ...inst, client_name: inc.client_name, project_name: inc.project_name });
        });
    });
    if (upcomingInstallments.length > 0) {
      lines.push(`\nCUOTAS PENDIENTES (${upcomingInstallments.length}):`);
      upcomingInstallments.slice(0, 8).forEach((inst: any) => {
        lines.push(`- id=${inst.id} | ${inst.client_name || 'n/a'} | $${(inst.amount || 0).toLocaleString()} | vence ${inst.due_date} | ${inst.status}`);
      });
    }

    // ─── TEAM — per-member breakdown so user-centric queries route ─────
    // ("qué hizo Luis esta semana", "qué le falta a María", "asignale esto
    // a Juan") work without the model defaulting to the whole tenant.
    // For each active member we surface: open count, overdue count,
    // completed-this-week count, plus the 3 most urgent open tasks with
    // title/due/priority/project so the model can reason concretely.
    const activeMembers = members.filter(m => m.status === 'active');
    const totalOpen = activeMembers.reduce((s, m) => s + (m.openTasks || 0), 0);

    // Reusable: priority rank + week-start anchored to Monday.
    const teamPriorityRank: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const teamWeekStart = new Date(todayStart);
    teamWeekStart.setDate(teamWeekStart.getDate() - ((teamWeekStart.getDay() + 6) % 7));

    const isAssignedTo = (t: any, memberId: string) =>
      (Array.isArray(t.assignee_ids) && t.assignee_ids.includes(memberId))
      || t.assigned_to === memberId
      || t.assignee_id === memberId;

    lines.push(`\nEQUIPO (${activeMembers.length} activos, ${totalOpen} tareas abiertas en total):`);
    activeMembers.slice(0, 14).forEach((m: any) => {
      const isCurrentUser = m.id === currentUserId;
      // skip duplicating the TÚ block detail for self — just mark the row.
      if (isCurrentUser) {
        lines.push(`- id=${m.id} | "${m.name || m.email}" | (current user, see TÚ block above)`);
        return;
      }

      const memberOpen = (allTasks || [])
        .filter((t: any) => {
          if (t.completed || t.status === 'cancelled' || t.parent_task_id) return false;
          return isAssignedTo(t, m.id);
        })
        .sort((a: any, b: any) => {
          const pa = teamPriorityRank[a.priority || 'medium'] ?? 2;
          const pb = teamPriorityRank[b.priority || 'medium'] ?? 2;
          if (pa !== pb) return pa - pb;
          return (a.start_date || a.due_date || '9999-12-31').localeCompare(b.start_date || b.due_date || '9999-12-31');
        });

      const memberOverdue = memberOpen.filter((t: any) => {
        const d = t.start_date || t.due_date;
        return d && new Date(d).getTime() < todayStart.getTime();
      });

      const memberCompletedThisWeek = (allTasks || []).filter((t: any) => {
        if (!t.completed || !t.completed_at) return false;
        const wasMine = t.completed_by === m.id || isAssignedTo(t, m.id);
        if (!wasMine) return false;
        return new Date(t.completed_at) >= teamWeekStart;
      });

      lines.push(`- id=${m.id} | "${m.name || m.email}" | role: ${m.role || 'n/a'} | open: ${memberOpen.length} (${memberOverdue.length} vencidas) | done esta semana: ${memberCompletedThisWeek.length}`);

      // Top 3 open tasks — enough to reason ("qué le falta", "qué tiene
      // pendiente"), without exploding context for big teams.
      memberOpen.slice(0, 3).forEach((t: any) => {
        const due = t.start_date || t.due_date;
        const overdueFlag = due && new Date(due).getTime() < todayStart.getTime() ? ' [OVERDUE]' : '';
        lines.push(`    · task_id=${t.id} | "${t.title}" | ${t.priority || 'medium'} | due ${due || 'n/a'}${overdueFlag}${t.project_name ? ` | ${t.project_name}` : ''}`);
      });
      if (memberOpen.length > 3) lines.push(`    · …+${memberOpen.length - 3} more`);
    });
    if (activeMembers.length > 14) lines.push(`  …+${activeMembers.length - 14} more members`);

    // Compute Monday of the current week so plan_week defaults sensibly.
    const monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    lines.push(`\nToday: ${now.toISOString().split('T')[0]} (${now.toLocaleDateString('en-US', { weekday: 'long' })}). Monday of this week: ${monday.toISOString().split('T')[0]}`);

    let result = lines.join('\n');
    // Bumped from 5000 to 7500 to fit the per-member TEAM breakdown.
    // Gemini handles ~30K tokens of context comfortably; this is well under.
    if (result.length > 7500) result = result.slice(0, 7500);

    // Prepend the learned user profile so the model adapts tone, length,
    // language, and follows any style rules the critique loop noticed.
    // Goes at the TOP because Gemini weighs early tokens more for style.
    if (aiProfile) {
      const profileBlock = formatProfileForPrompt(aiProfile);
      if (profileBlock) result = `${profileBlock}\n${result}`;
    }
    return result;
  }, [projects, clients, incomes, expenses, budgets, members, allTasks, user?.id, user?.email, profile?.name, aiProfile]);

  // History formatted for the chat endpoint (only plain user/assistant text).
  const chatHistoryForApi = useMemo(() => {
    const out: { role: 'user' | 'assistant'; content: string }[] = [];
    for (const m of messages) {
      if ('content' in m && typeof m.content === 'string') {
        out.push({ role: m.role, content: m.content });
      }
    }
    return out;
  }, [messages]);

  // ── Send a chat question (now: receives reply + optional actions) ──
  const sendQuestion = useCallback(async (question: string) => {
    if (!question.trim() || sending || !user) return;
    const userMsg: ChatMsg = { role: 'user', content: question.trim(), ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);
    const t0 = Date.now();
    try {
      const context = buildContextSummary();
      const replyResult = await sendAdvisorChatWithActions(context, chatHistoryForApi, question.trim());
      const { reply, actions: rawActions } = replyResult;
      const actions: ProposedAction[] = (rawActions || []).map(a => ({
        ...a,
        id: crypto.randomUUID(),
        status: 'pending' as const,
      }));
      // Persist this turn to agent_conversations so the critique loop
      // and feedback UI can attach to it later. AiAdvisor doesn't route
      // through the orchestrator, so we synthesize the same shape the
      // orchestrator would produce — agentId='advisor', skill trace is
      // empty (no structured skills were called), proposed_actions are
      // the raw advisor actions (different kinds than orchestrator's
      // catalog — that's fine, the table is jsonb).
      let conversationId: string | null = null;
      if (currentTenant?.id) {
        try {
          conversationId = await logConversationTurn({
            ctx: { db: supabase as any, tenantId: currentTenant.id, userId: user.id, now: new Date() },
            surface: 'advisor',
            query: question.trim(),
            output: {
              reply,
              agentId: 'advisor',
              skillTrace: [],
              proposedActions: actions as any,
            } as any,
            msTotal: Date.now() - t0,
            msSkills: 0,
            msLlm: Date.now() - t0,
          });
        } catch { /* best-effort log; never break the chat */ }
      }
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: reply,
        outputId: getOutputId(replyResult),
        actions: actions.length > 0 ? actions : undefined,
        ts: Date.now(),
        conversationId,
      }]);
      setSessionExpired(false);
    } catch (err: any) {
      console.error('AI chat error:', err);
      if (err?.needsReLogin) setSessionExpired(true);
      const fallback = err?.needsReLogin
        ? 'Your session expired. Refresh the page to sign in again.'
        : (err?.message || "Couldn't process the question. Try again.");
      setMessages(prev => [...prev, { role: 'assistant', content: fallback, ts: Date.now() }]);
    } finally {
      setSending(false);
    }
  }, [sending, user, currentTenant?.id, buildContextSummary, chatHistoryForApi]);

  // Bridge sendQuestion → the voice hook's onAutoSend (defined above
  // sendQuestion in component order). Updated on every render so the
  // hook always sees the freshest closure.
  sendQuestionRef.current = sendQuestion;

  // ── Action approval / rejection ────────────────────────────────────
  // Updates the message in-place with the new status. The actual mutation
  // (createTask / createProject / etc) runs via the existing context
  // hooks so all the same validation, optimistic updates, and realtime
  // sync apply. NEVER auto-executes.
  const updateActionStatus = useCallback((msgIdx: number, actionId: string, patch: Partial<ProposedAction>) => {
    setMessages(prev => prev.map((m, i): ChatMsg => {
      if (i !== msgIdx) return m;
      if (!('actions' in m) || !m.actions) return m;
      return { ...m, actions: m.actions.map(a => a.id === actionId ? { ...a, ...patch } as ProposedAction : a) } as ChatMsg;
    }));
  }, []);

  const handleApproveAction = useCallback(async (msgIdx: number, action: ProposedAction) => {
    try {
      if (action.kind === 'create_task') {
        const p = action.params;
        await createTask({
          title: p.title,
          description: p.description || '',
          completed: p.status === 'done',
          priority: p.priority || 'medium',
          status: (p.status || 'todo') as any,
          start_date: p.due_date || undefined,
          project_id: p.project_id || undefined,
          client_id: p.client_id || undefined,
          assignee_ids: p.assignee_id ? [p.assignee_id] : [],
          owner_id: user?.id || '',
        } as any);
      } else if (action.kind === 'create_project') {
        const p = action.params;
        await createProject({
          title: p.title,
          status: 'Active' as any,
          progress: 0,
          deadline: p.deadline || null,
          client_id: p.client_id || null,
          color: p.color,
          description: p.description,
        } as any);
      } else if (action.kind === 'create_tasks_batch') {
        const p = action.params;
        // Sequentially create — keeps optimistic-update + realtime sync
        // in order. Slow on >20 items but the typical case is 3-10.
        for (const t of p.tasks) {
          await createTask({
            title: t.title,
            description: t.description || '',
            completed: t.status === 'done',
            priority: t.priority || 'medium',
            status: (t.status || 'todo') as any,
            start_date: t.due_date || undefined,
            project_id: p.project_id || undefined,
            client_id: p.client_id || undefined,
            assignee_ids: t.assignee_id ? [t.assignee_id] : [],
            owner_id: user?.id || '',
          } as any);
        }
      } else if (action.kind === 'plan_week') {
        const p = action.params;
        // Anchor each suggested task to week_start + day_offset.
        const monday = new Date(p.week_start + 'T12:00:00');
        for (const t of (p.suggested_tasks || [])) {
          const d = new Date(monday);
          d.setDate(monday.getDate() + (t.day_offset ?? 0));
          await createTask({
            title: t.title,
            description: '',
            completed: false,
            priority: 'medium',
            status: 'todo' as any,
            start_date: d.toISOString().split('T')[0],
            project_id: t.project_id || undefined,
            assignee_ids: t.assignee_id ? [t.assignee_id] : [],
            owner_id: user?.id || '',
          } as any);
        }
      } else if (action.kind === 'suggest_delegate') {
        // Pure suggestion — no mutation. Just acknowledged.
      } else if (action.kind === 'create_expense') {
        const p = action.params;
        await createExpense({
          concept: p.concept,
          amount: Math.abs(p.amount),
          category: p.category || 'Operations',
          vendor: p.vendor,
          date: p.date || new Date().toISOString().split('T')[0],
          status: p.status || 'pending',
          recurring: !!p.recurring,
          project_id: p.project_id || undefined,
          client_id: p.client_id || undefined,
          budget_id: p.budget_id || undefined,
        } as any);
      } else if (action.kind === 'create_income') {
        const p = action.params;
        await createIncome({
          concept: p.concept,
          total_amount: Math.abs(p.amount),
          num_installments: p.num_installments || 1,
          due_date: p.due_date || new Date().toISOString().split('T')[0],
          client_id: p.client_id || undefined,
          client_name: p.client_name,
          project_id: p.project_id || undefined,
        } as any);
      } else if (action.kind === 'create_budget') {
        const p = action.params;
        await createBudget({
          name: p.name,
          allocated_amount: Math.abs(p.allocated_amount),
          category: p.category || '',
          color: p.color || '#3b82f6',
          period: p.period || 'monthly',
          start_date: p.start_date || new Date().toISOString().split('T')[0],
          end_date: p.end_date || null,
          description: p.description || '',
        } as any);
      } else if (action.kind === 'update_budget') {
        const p = action.params;
        if (!p.budget_id) throw new Error('Falta budget_id');
        await updateBudget(p.budget_id, {
          ...(p.allocated_amount !== undefined ? { allocated_amount: Math.abs(p.allocated_amount) } : {}),
          ...(p.name !== undefined ? { name: p.name } : {}),
          ...(p.is_active !== undefined ? { is_active: p.is_active } : {}),
          ...(p.end_date !== undefined ? { end_date: p.end_date } : {}),
        } as any);
      } else if (action.kind === 'update_project') {
        const p = action.params;
        if (!p.project_id) throw new Error('Falta project_id');
        // Map AI status names → ProjectStatus enum values used by the
        // ProjectsContext. Same translation layer the project edit panel
        // uses internally.
        const statusMap: Record<string, string> = {
          active: 'Active', paused: 'Paused', completed: 'Completed', cancelled: 'Cancelled',
        };
        await updateProject(p.project_id, {
          ...(p.title !== undefined ? { title: p.title } : {}),
          ...(p.status !== undefined ? { status: statusMap[p.status] || p.status } : {}),
          ...(p.budget !== undefined ? { budget: Math.abs(p.budget) } : {}),
          ...(p.currency !== undefined ? { currency: p.currency } : {}),
          ...(p.deadline !== undefined ? { deadline: p.deadline } : {}),
          ...(p.description !== undefined ? { description: p.description } : {}),
          ...((p as any).client_id !== undefined ? { client_id: (p as any).client_id } : {}),
          ...(p.color !== undefined ? { color: p.color } : {}),
        } as any);
      } else if (action.kind === 'update_task') {
        const p = action.params;
        if (!p.task_id) throw new Error('Falta task_id');
        await updateTask(p.task_id, {
          ...(p.title !== undefined ? { title: p.title } : {}),
          ...(p.description !== undefined ? { description: p.description } : {}),
          ...(p.status !== undefined ? { status: p.status } : {}),
          ...(p.priority !== undefined ? { priority: p.priority } : {}),
          ...(p.due_date !== undefined ? { start_date: p.due_date } : {}),
          ...(p.assignee_id !== undefined ? { assignee_ids: p.assignee_id ? [p.assignee_id] : [] } : {}),
          ...(p.project_id !== undefined ? { project_id: p.project_id } : {}),
          ...(p.completed !== undefined ? { completed: p.completed } : {}),
        } as any);
      } else if (action.kind === 'update_expense') {
        const p = action.params;
        if (!p.expense_id) throw new Error('Falta expense_id');
        await updateExpense(p.expense_id, {
          ...(p.amount !== undefined ? { amount: Math.abs(p.amount) } : {}),
          ...(p.concept !== undefined ? { concept: p.concept } : {}),
          ...(p.category !== undefined ? { category: p.category } : {}),
          ...(p.vendor !== undefined ? { vendor: p.vendor } : {}),
          ...(p.date !== undefined ? { date: p.date } : {}),
          ...(p.project_id !== undefined ? { project_id: p.project_id } : {}),
          ...(p.client_id !== undefined ? { client_id: p.client_id } : {}),
          ...(p.status !== undefined ? { status: p.status } : {}),
          ...(p.recurring !== undefined ? { recurring: p.recurring } : {}),
        } as any);
      } else if (action.kind === 'update_income') {
        const p = action.params;
        if (!p.income_id) throw new Error('Falta income_id');
        await updateIncome(p.income_id, {
          ...(p.total_amount !== undefined ? { total_amount: Math.abs(p.total_amount) } : {}),
          ...(p.concept !== undefined ? { concept: p.concept } : {}),
          ...(p.due_date !== undefined ? { due_date: p.due_date } : {}),
          ...(p.status !== undefined ? { status: p.status } : {}),
          ...(p.client_id !== undefined ? { client_id: p.client_id } : {}),
          ...(p.project_id !== undefined ? { project_id: p.project_id } : {}),
        } as any);
      } else if (action.kind === 'mark_expense_paid') {
        const p = action.params;
        if (!p.expense_id) throw new Error('Falta expense_id');
        await updateExpense(p.expense_id, { status: 'paid' } as any);
      } else if (action.kind === 'mark_installment_paid') {
        const p = action.params;
        if (!p.installment_id) throw new Error('Falta installment_id');
        await updateInstallment(p.installment_id, {
          status: 'paid',
          paid_date: p.paid_date || new Date().toISOString().split('T')[0],
        } as any);
      }
      updateActionStatus(msgIdx, action.id, { status: 'approved' });
      // Approval is a positive feedback signal — feeds the same metrics
      // rollup the orchestrator uses. Best-effort: a failed feedback
      // write must not unwind the action that already succeeded.
      const msg = messages[msgIdx] as any;
      if (msg?.conversationId && currentTenant?.id && user?.id) {
        recordFeedback({
          ctx: { db: supabase as any, tenantId: currentTenant.id, userId: user.id, now: new Date() },
          conversationId: msg.conversationId,
          agentId: 'advisor',
          signal: 'action_confirmed',
        }).catch(() => {});
      }
    } catch (err: any) {
      errorLogger.error('advisor action failed', err);
      updateActionStatus(msgIdx, action.id, { status: 'failed', errorMsg: err?.message || 'No se pudo aplicar.' });
    }
  }, [createTask, updateTask, createProject, updateProject, createExpense, updateExpense, createIncome, updateIncome, createBudget, updateBudget, updateInstallment, user?.id, updateActionStatus, messages, currentTenant?.id]);

  const handleRejectAction = useCallback((msgIdx: number, actionId: string) => {
    updateActionStatus(msgIdx, actionId, { status: 'rejected' });
    // Rejection = negative signal. Same channel as approve so the
    // critique loop can compute approve/reject ratio per agent.
    const msg = messages[msgIdx] as any;
    if (msg?.conversationId && currentTenant?.id && user?.id) {
      recordFeedback({
        ctx: { db: supabase as any, tenantId: currentTenant.id, userId: user.id, now: new Date() },
        conversationId: msg.conversationId,
        agentId: 'advisor',
        signal: 'action_skipped',
      }).catch(() => {});
    }
  }, [updateActionStatus, messages, currentTenant?.id, user?.id]);

  // ── Thumbs feedback on assistant replies ────────────────────────────
  // Mirrors the Brief UI: one click per message, opt-in, never blocks.
  // The conversation_id is the row we logged above; without it we don't
  // render the buttons at all (no place to attach the signal).
  const handleThumbs = useCallback(async (msgIdx: number, value: 'up' | 'down') => {
    const msg = messages[msgIdx] as any;
    if (!msg?.conversationId || msg.thumbs || !currentTenant?.id || !user?.id) return;
    setMessages(prev => prev.map((m, i): ChatMsg => {
      if (i !== msgIdx) return m;
      return { ...m, thumbs: value } as ChatMsg;
    }));
    try {
      await recordFeedback({
        ctx: { db: supabase as any, tenantId: currentTenant.id, userId: user.id, now: new Date() },
        conversationId: msg.conversationId,
        agentId: 'advisor',
        signal: value === 'up' ? 'thumbs_up' : 'thumbs_down',
      });
    } catch { /* best effort — keep the UI marked locally */ }
  }, [messages, currentTenant?.id, user?.id]);

  // ── Generate full insights overview as an assistant message ──────
  const generateInsights = useCallback(async (forceRefresh = false) => {
    if (insightsLoading || !user) return;
    setInsightsLoading(true);
    try {
      const context = buildContextSummary();

      // Try cache first (unless force-refresh)
      if (!forceRefresh) {
        const cached = getCachedAdvisorInsights(context);
        if (cached) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            kind: 'insights',
            greeting: cached.greeting || '',
            insights: cached.insights || [],
          }]);
          return;
        }
      }

      if (forceRefresh) clearAICache('advisor');
      const result = await generateAdvisorInsights(context);
      setMessages(prev => [...prev, {
        role: 'assistant',
        kind: 'insights',
        greeting: result.greeting || '',
        insights: result.insights || [],
        outputId: getOutputId(result),
      }]);
      setSessionExpired(false);
    } catch (err: any) {
      console.error('AI Advisor error:', err);
      if (err?.needsReLogin) setSessionExpired(true);
      const fallback = err?.needsReLogin
        ? 'Your session expired. Refresh the page to sign in again.'
        : (err?.message || "Couldn't generate the analysis. Try again.");
      setMessages(prev => [...prev, { role: 'assistant', content: fallback }]);
    } finally {
      setInsightsLoading(false);
    }
  }, [insightsLoading, user, buildContextSummary]);

  const handlePrompt = (p: typeof SUGGESTED_PROMPTS[number]) => {
    if (p.kind === 'insights') generateInsights();
    else sendQuestion(p.prompt);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    sendQuestion(input);
  };

  // Header stats
  const activeCount = projects.filter(p => p.status === 'Active').length;
  const totalIncome = (incomes || []).reduce((s: number, i: any) => s + (i.total_amount || 0), 0);
  const isEmpty = messages.length === 0;
  const busy = sending || insightsLoading;

  return (
    <>
      {/* ─── Floating Pill Button ─── (hidden while other modals are open) */}
      <AnimatePresence>
      {!otherModalOpen && (
      <motion.button
        onClick={() => setIsOpen(true)}
        initial={reduceMotion ? false : { opacity: 0, scale: 0.85, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.85, y: 8, transition: SPRING_TAP }}
        transition={SPRING_ENTER}
        whileHover={{ scale: 1.04, y: -2, transition: SPRING_TAP }}
        whileTap={{ scale: TAP_SCALE, transition: SPRING_TAP }}
        className="fixed bottom-5 right-5 z-[55] group flex items-center gap-2 pl-2.5 pr-3.5 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-full shadow-lg shadow-black/15 dark:shadow-black/30 hover:shadow-xl transition-shadow duration-300"
      >
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center relative overflow-hidden"
          style={{ background: 'conic-gradient(from 45deg, #3b82f6, #10b981, #f59e0b, #ec4899, #06b6d4, #3b82f6)' }}
        >
          <div className="absolute inset-[1.5px] rounded-full bg-zinc-900 dark:bg-zinc-100" />
          <Icons.Sparkles size={11} className="relative z-10 text-white dark:text-zinc-900" />
        </div>
        <span className="text-[11px] font-semibold tracking-wide">AI</span>
      </motion.button>
      )}
      </AnimatePresence>

      {/* ─── Slide Panel ─── */}
      {createPortal(
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[60] overflow-hidden">
            {/* Backdrop — quick crossfade. Slightly faster than the
                panel slide so the dimming reads as "instant" while the
                panel takes the spotlight. Behind the dim layer, three
                slow-drifting blurred blobs (gold / sage / pink) tint
                the background with the Livv brand palette — adds a
                cinematic warm-glow halo around the panel. */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="absolute inset-0 bg-zinc-900/20 dark:bg-black/40 backdrop-blur-[2px]"
              onClick={() => setIsOpen(false)}
            >
              <div className="aiad-backdrop">
                <div className="aiad-blob a" />
                <div className="aiad-blob b" />
                <div className="aiad-blob c" />
              </div>
            </motion.div>

            {/* Panel — slides in from the right with the shared spring.
                Frosted glass chrome (backdrop-blur 50px + saturate 150%)
                with a dramatic soft-shadow halo, matching the design
                bundle. Width bumped to max-w-lg so the suggestion grid
                + message bubbles breathe a bit more. */}
            <motion.div
              initial={reduceMotion ? false : { x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%', transition: { type: 'spring', stiffness: 360, damping: 32 } }}
              transition={{ type: 'spring', stiffness: 340, damping: 30 }}
              className="aiad-panel absolute inset-y-0 right-0 w-screen sm:w-[60vw] max-w-[960px] min-w-0 sm:min-w-[480px] max-h-screen flex flex-col overflow-hidden"
            >
              {/* ── Header ──
                 Refined per the design bundle: 38px wine-gradient
                 avatar with a slow conic halo + green online dot,
                 title with an ONLINE pulsing pill, subtitle that
                 names the context the advisor knows about, and three
                 icon buttons (new conversation / settings / close)
                 with the cleaner ai-iconbtn style. */}
              <div className="px-5 pt-5 pb-4 border-b border-zinc-200/40 dark:border-zinc-800/60 shrink-0 relative">
                <div className="flex items-center justify-between mb-3 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="aiad-avatar w-[38px] h-[38px] rounded-xl shrink-0">
                      <Icons.Sparkles size={16} />
                      <span className="aiad-online-dot" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-[15.5px] font-medium text-zinc-900 dark:text-zinc-100 leading-tight tracking-[-0.012em] flex items-center gap-2 flex-wrap">
                        AI Advisor
                        <span className="aiad-online-pill">
                          <span />
                          {busy ? 'thinking' : 'online'}
                        </span>
                      </h2>
                      <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400 mt-0.5 tracking-[-0.003em] truncate">
                        Knows your projects, finances &amp; team
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {messages.length > 0 && (
                      <button
                        onClick={() => setMessages([])}
                        className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] text-zinc-500 hover:bg-zinc-900/[0.04] dark:hover:bg-white/[0.06] hover:text-zinc-800 dark:hover:text-zinc-200 active:scale-[0.94]"
                        title="New conversation"
                      >
                        <Icons.Plus size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => setIsOpen(false)}
                      className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] text-zinc-500 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 active:scale-[0.94]"
                      title="Close"
                    >
                      <Icons.X size={14} />
                    </button>
                  </div>
                </div>

                {/* Quick stats bar — kept; restyled as warmer mono pills
                   that read like an at-a-glance context strip. */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/60 dark:bg-zinc-800/40 border border-zinc-200/50 dark:border-zinc-700/40">
                    <Icons.Briefcase size={10} className="text-zinc-400" />
                    <span className="text-[10.5px] font-medium text-zinc-700 dark:text-zinc-300 tabular-nums">{activeCount} active</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/60 dark:bg-zinc-800/40 border border-zinc-200/50 dark:border-zinc-700/40">
                    <Icons.TrendingUp size={10} className="text-zinc-400" />
                    <span className="text-[10.5px] font-medium text-zinc-700 dark:text-zinc-300 tabular-nums">${totalIncome.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/60 dark:bg-zinc-800/40 border border-zinc-200/50 dark:border-zinc-700/40">
                    <Icons.Users size={10} className="text-zinc-400" />
                    <span className="text-[10.5px] font-medium text-zinc-700 dark:text-zinc-300 tabular-nums">{members.length}</span>
                  </div>
                </div>
              </div>

              {/* ── Chat scroll area ── */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-3">
                {/* Empty state: greeting + suggested prompts.
                   Restyled per the design bundle — bot avatar uses the
                   wine-gradient + conic halo, greeting bubble has a
                   subtle frosted bg, and each suggestion card carries
                   its own tone color via --aiad-c (drives a left
                   accent bar + the icon-badge tint). */}
                {isEmpty && (
                  <div className="space-y-5 aiad-empty-in">
                    <div className="flex items-start gap-3">
                      <div className="aiad-avatar w-8 h-8 rounded-[10px] shrink-0">
                        <Icons.Sparkles size={13} />
                      </div>
                      <div className="flex-1 px-3.5 py-2.5 rounded-2xl aiad-bubble-bot-tail bg-white/85 dark:bg-zinc-800/70 border border-zinc-200/60 dark:border-zinc-700/50 text-[13px] leading-[1.55] text-zinc-800 dark:text-zinc-100">
                        Hi — I have context on your <strong className="font-medium">projects</strong>, <strong className="font-medium">finances</strong> and <strong className="font-medium">team</strong>. Ask anything below, or pick a starter.
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {SUGGESTED_PROMPTS.map((p, pi) => {
                        const IconComp = (Icons as any)[p.icon] || Icons.Sparkles;
                        return (
                          <motion.button
                            key={p.label}
                            onClick={() => handlePrompt(p)}
                            disabled={busy}
                            initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ ...SPRING_ENTER, delay: 0.08 + pi * 0.035 }}
                            whileTap={{ scale: 0.98, transition: SPRING_TAP }}
                            whileHover={{ y: -1, transition: SPRING_TAP }}
                            style={{ ['--aiad-c' as any]: p.color }}
                            className="aiad-sugg flex items-center gap-2.5 p-2.5 rounded-[13px] border border-zinc-200/60 dark:border-zinc-700/50 bg-white/75 dark:bg-zinc-800/40 hover:bg-white/95 dark:hover:bg-zinc-800/70 text-left disabled:opacity-50"
                          >
                            <span className="aiad-sugg-icon w-7 h-7 rounded-[9px] flex items-center justify-center shrink-0">
                              <IconComp size={12} />
                            </span>
                            <span className="text-[11.5px] font-medium text-zinc-800 dark:text-zinc-100 leading-tight tracking-[-0.005em] truncate flex-1">
                              {p.label}
                            </span>
                            <span
                              aria-hidden
                              className="w-1.5 h-1.5 rounded-full opacity-70 shrink-0"
                              style={{ background: p.color }}
                            />
                          </motion.button>
                        );
                      })}
                    </div>

                    {/* Quick tools row — shortcuts that don't go through
                        the chat. "Draft email" opens a slim composer with
                        AI body generation + send via the connected Gmail
                        account. Distinct row so it doesn't get lost
                        among conversational prompts. */}
                    <div className="pt-1">
                      <button
                        onClick={() => { setEmailDraftBrief(''); setEmailDraftOpen(true); }}
                        className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-fuchsia-200 dark:border-fuchsia-500/30 bg-gradient-to-r from-fuchsia-50/60 to-indigo-50/40 dark:from-fuchsia-500/10 dark:to-indigo-500/10 hover:from-fuchsia-50 hover:to-indigo-50 dark:hover:from-fuchsia-500/15 dark:hover:to-indigo-500/15 transition-colors text-[11.5px] font-semibold text-fuchsia-700 dark:text-fuchsia-300"
                      >
                        <Icons.Mail size={12} />
                        📧 Draft email with AI
                      </button>
                    </div>
                  </div>
                )}

                {/* Messages — user bubbles right-aligned (dark wine),
                   bot bubbles left with the wine-gradient avatar and
                   the frosted bot-tail bubble from the design. */}
                {messages.map((msg, idx) => {
                  if (msg.role === 'user') {
                    return (
                      <div key={idx} className="flex justify-end aiad-msg-in">
                        <div className="max-w-[85%] px-3.5 py-2 rounded-2xl aiad-bubble-user-tail bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[13px] leading-[1.55] tracking-[-0.003em] shadow-[0_2px_8px_-2px_rgba(9,9,11,0.18)] [&_a]:text-amber-300 dark:[&_a]:text-amber-700 [&_a]:underline">
                          <LinkifiedText text={msg.content} />
                        </div>
                      </div>
                    );
                  }
                  // Assistant
                  const isInsightsMsg = 'kind' in msg && msg.kind === 'insights';
                  const outputId = (msg as any).outputId as string | null | undefined;
                  const conversationId = (msg as any).conversationId as string | null | undefined;
                  const currentThumbs = (msg as any).thumbs as 'up' | 'down' | undefined;
                  const msgActions = (msg as any).actions as ProposedAction[] | undefined;
                  return (
                    <div key={idx} className="flex items-start gap-2.5 aiad-msg-in">
                      <div className="aiad-avatar w-7 h-7 rounded-[9px] shrink-0">
                        <Icons.Sparkles size={12} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`${isInsightsMsg ? '' : 'px-4 py-3 rounded-2xl aiad-bubble-bot-tail bg-white/85 dark:bg-zinc-800/70 border border-zinc-200/60 dark:border-zinc-700/50 tracking-[-0.003em] text-zinc-800 dark:text-zinc-100'}`}>
                          {isInsightsMsg ? (
                            <InsightsBlock greeting={(msg as any).greeting} insights={(msg as any).insights} />
                          ) : (
                            // Markdown render — turns plain `**bold**`, headings, bullets,
                            // and custom directives into rich blocks. Falls back gracefully
                            // for plain-text replies (no markdown = no formatting).
                            <Markdown
                              source={(msg as any).content}
                              className="text-[13px] leading-[1.55]"
                            />
                          )}
                          {outputId && (
                            <AIFeedbackBar outputId={outputId} className="mt-2" compact />
                          )}
                          {/* Thumbs row — appears for any message we
                              successfully logged to agent_conversations.
                              One click, locked after. Sits below the
                              legacy AIFeedbackBar so power-users can
                              also use the existing comment/refine
                              flow. */}
                          {conversationId && (
                            <div className="mt-2 flex items-center gap-2">
                              <button
                                type="button"
                                disabled={!!currentThumbs}
                                onClick={() => handleThumbs(idx, 'up')}
                                aria-label="Helpful"
                                title="Helpful"
                                className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${
                                  currentThumbs === 'up'
                                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                    : 'text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40 disabled:hover:bg-transparent'
                                }`}
                              >
                                <Icons.ThumbsUp size={11} />
                              </button>
                              <button
                                type="button"
                                disabled={!!currentThumbs}
                                onClick={() => handleThumbs(idx, 'down')}
                                aria-label="Not helpful"
                                title="Not helpful"
                                className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${
                                  currentThumbs === 'down'
                                    ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                    : 'text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-40 disabled:hover:bg-transparent'
                                }`}
                              >
                                <Icons.ThumbsDown size={11} />
                              </button>
                              {currentThumbs && (
                                <span className="text-[10px] text-zinc-500 dark:text-zinc-400">Thanks — feedback recorded</span>
                              )}
                            </div>
                          )}
                        </div>
                        {/* Action proposals — rendered as confirm cards
                            below the assistant text. Each remembers its
                            applied/rejected status across reloads via
                            the daily-persistence layer above. */}
                        {msgActions && msgActions.length > 0 && (
                          <div className="space-y-2 mt-2">
                            {msgActions.map(act => (
                              <ActionCard
                                key={act.id}
                                action={act}
                                onApprove={() => handleApproveAction(idx, act)}
                                onReject={() => handleRejectAction(idx, act.id)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Typing indicator — same wine-gradient avatar so the
                   "AI is replying" state looks consistent with sent
                   messages instead of jumping back to a generic look. */}
                {busy && (
                  <div className="flex items-start gap-2.5 aiad-msg-in">
                    <div className="aiad-avatar w-7 h-7 rounded-[9px] shrink-0">
                      <Icons.Sparkles size={12} />
                    </div>
                    <div className="px-3.5 py-2.5 rounded-2xl aiad-bubble-bot-tail bg-white/85 dark:bg-zinc-800/70 border border-zinc-200/60 dark:border-zinc-700/50">
                      <motion.div
                        className="flex items-center gap-1"
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 1.4, repeat: Infinity }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                      </motion.div>
                    </div>
                  </div>
                )}
                {/* Sentinel for auto-scroll. Tiny but present so
                    scrollIntoView({block:'end'}) always anchors here. */}
                <div ref={endRef} aria-hidden="true" style={{ height: 1 }} />
              </div>

              {/* ── Session expired banner ── */}
              {sessionExpired && (
                <div className="px-5 py-2 border-t border-amber-200/60 dark:border-amber-700/30 bg-amber-50/60 dark:bg-amber-500/5 shrink-0">
                  <div className="flex items-center gap-2">
                    <Icons.Alert size={12} className="text-amber-500 shrink-0" />
                    <span className="text-[10px] text-amber-700 dark:text-amber-400 flex-1">Session expired. Please sign in again.</span>
                    <button
                      onClick={async () => {
                        // Clear the dead session and any stray Supabase keys, then
                        // force a hard reload to land on the login screen.
                        try { await supabase.auth.signOut(); } catch { /* ignore */ }
                        try {
                          for (let i = localStorage.length - 1; i >= 0; i--) {
                            const k = localStorage.key(i);
                            if (k && (k.startsWith('sb-') || k.includes('supabase'))) {
                              localStorage.removeItem(k);
                            }
                          }
                        } catch { /* ignore */ }
                        window.location.href = window.location.pathname;
                      }}
                      className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 hover:underline"
                    >
                      Sign in
                    </button>
                  </div>
                </div>
              )}

              {/* ── Chat input ──
                 Single frosted shell wrapping the textarea + actions,
                 with a focus-within glow ring. The send button scales
                 from 0.7→1 with a small spring when the input goes
                 from empty → has-text (aiad-send-ready class). */}
              <form
                onSubmit={handleSubmit}
                className="px-4 py-4 border-t border-zinc-200/40 dark:border-zinc-800/60 shrink-0"
              >
                <div
                  className={`flex items-end gap-2 pl-3.5 pr-1.5 py-1.5 rounded-2xl border transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] focus-within:bg-white dark:focus-within:bg-zinc-900 focus-within:shadow-[0_0_0_4px_rgba(9,9,11,0.03)] ${
                    voice.isListening
                      ? 'bg-rose-50/40 dark:bg-rose-500/5 border-rose-200/60 dark:border-rose-500/30'
                      : 'bg-white/60 dark:bg-zinc-800/40 border-zinc-200/55 dark:border-zinc-700/50 focus-within:border-zinc-300 dark:focus-within:border-zinc-600'
                  }`}
                >
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      // Auto-grow up to 5 lines
                      const ta = e.target as HTMLTextAreaElement;
                      ta.style.height = 'auto';
                      ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
                    }}
                    onKeyDown={(e) => {
                      // Enter sends (no Shift); Shift+Enter or Cmd+Enter
                      // inserts a newline. This matches Slack/Notion.
                      if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                        e.preventDefault();
                        handleSubmit();
                      }
                    }}
                    placeholder={voice.isListening ? 'Listening…' : 'Ask anything, or ask me to create a task, plan the week…'}
                    disabled={busy}
                    rows={1}
                    className="flex-1 bg-transparent border-0 outline-none text-[13.5px] leading-[1.5] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 disabled:opacity-60 resize-none py-1.5 tracking-[-0.003em]"
                  />
                  <div className="flex items-center gap-0.5 shrink-0 self-end pb-0.5">
                    {/* Mic — same UX as Brief: hidden when browser
                        doesn't support SpeechRecognition, red+pulsing
                        while listening, halo radiates out. */}
                    {voice.isSupported && (
                      <AdvisorMicButton voice={voice} voiceLang={voiceLang} busy={busy} reduceMotion={!!reduceMotion} />
                    )}
                    <motion.button
                      type="submit"
                      disabled={busy || !input.trim()}
                      whileTap={{ scale: 0.9, transition: SPRING_TAP }}
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
                        input.trim() && !busy
                          ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-[0_2px_6px_-1px_rgba(9,9,11,0.18)] hover:scale-105 hover:bg-[#5c1d18] dark:hover:bg-[#5c1d18] aiad-send-ready'
                          : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400 cursor-not-allowed'
                      }`}
                      title="Send (Enter)"
                    >
                      <Icons.Send size={13} />
                    </motion.button>
                  </div>
                </div>
                {voice.error && (
                  <div className="mt-2 text-[10.5px] text-rose-600 dark:text-rose-400">
                    {voice.error}
                  </div>
                )}
                <div className="flex items-center justify-between mt-2.5 px-1.5 text-[10px] text-zinc-500 dark:text-zinc-500 font-mono tracking-[0.04em]">
                  <span>
                    <kbd className="px-1 py-px rounded text-[9px] bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/50 dark:border-zinc-700/40">↵</kbd>
                    {' '}send · <kbd className="px-1 py-px rounded text-[9px] bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/50 dark:border-zinc-700/40">⇧↵</kbd>{' '}new line
                  </span>
                  <span>Saved per day</span>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.body)}

      {/* Email draft modal — opened from the "Draft email with AI" shortcut.
          The brief is empty by default; the user types what the email
          should say and the panel calls Gemini to generate the body. */}
      <EmailDraftPanel
        isOpen={emailDraftOpen}
        onClose={() => setEmailDraftOpen(false)}
        initialBrief={emailDraftBrief}
        onSent={() => setEmailDraftOpen(false)}
      />
    </>
  );
};
