import React from 'react';
import { Icons } from '../ui/Icons';
import type { PlanAIResult, PlanChange } from '../../lib/ai';

interface AiPlanPreviewProps {
  plan: PlanAIResult;
  onPlanChange: (plan: PlanAIResult) => void;
  onAccept: () => void;
  onDiscard: () => void;
  applying: boolean;
  teamMembers: { id: string; name: string | null; email: string }[];
}

const PRIORITY_STYLES: Record<string, string> = {
  urgent: 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400',
  high: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
  medium: 'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
  low: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
};

const formatDate = (d?: string) => {
  if (!d) return '—';
  const date = new Date(d + 'T12:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

export const AiPlanPreview: React.FC<AiPlanPreviewProps> = ({
  plan,
  onPlanChange,
  onAccept,
  onDiscard,
  applying,
  teamMembers,
}) => {
  const removeChange = (idx: number) => {
    onPlanChange({
      ...plan,
      changes: plan.changes.filter((_, i) => i !== idx),
    });
  };

  const updateChange = (idx: number, updates: Partial<PlanChange>) => {
    onPlanChange({
      ...plan,
      changes: plan.changes.map((c, i) => (i === idx ? { ...c, ...updates } : c)),
    });
  };

  if (plan.changes.length === 0) {
    return (
      <div className="mb-4 rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/60 dark:bg-emerald-950/20 p-4">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center">
            <Icons.Check size={14} className="text-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">Your schedule looks great!</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">{plan.summary}</p>
          </div>
          <button onClick={onDiscard} className="text-xs text-emerald-600 hover:text-emerald-800 font-medium">
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-violet-200/60 dark:border-violet-800/40 bg-white dark:bg-zinc-900/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-violet-50/60 dark:bg-violet-950/20 border-b border-violet-100 dark:border-violet-900/30">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Icons.Sparkles size={13} className="text-white" />
          </div>
          <div>
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              AI Plan — {plan.changes.length} change{plan.changes.length !== 1 ? 's' : ''}
            </span>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">{plan.summary}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onDiscard}
            disabled={applying}
            className="px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
          >
            Discard
          </button>
          <button
            onClick={onAccept}
            disabled={applying}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {applying ? (
              <>
                <Icons.Loader size={12} className="animate-spin" />
                Applying...
              </>
            ) : (
              <>
                <Icons.Check size={12} />
                Apply Changes
              </>
            )}
          </button>
        </div>
      </div>

      {/* Changes list */}
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50 max-h-[360px] overflow-y-auto">
        {plan.changes.map((change, idx) => (
          <div key={idx} className="group flex items-start gap-3 px-4 py-3 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/10">
            {/* Task info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                  {change.taskTitle}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                {/* Date change */}
                {(change.currentDate || change.newDate) && (
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <Icons.Calendar size={10} className="text-zinc-400" />
                    {change.currentDate && (
                      <span className="text-zinc-400 line-through">{formatDate(change.currentDate)}</span>
                    )}
                    {change.newDate && (
                      <>
                        <Icons.ChevronRight size={9} className="text-violet-400" />
                        <input
                          type="date"
                          value={change.newDate}
                          onChange={e => updateChange(idx, { newDate: e.target.value })}
                          className="text-[11px] text-violet-600 dark:text-violet-400 bg-transparent border-b border-dashed border-violet-300 dark:border-violet-700 focus:border-violet-500 focus:outline-none px-0.5 py-0 w-28"
                        />
                      </>
                    )}
                  </div>
                )}

                {/* Time change */}
                {(change.currentTime || change.newTime) && (
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <Icons.Clock size={10} className="text-zinc-400" />
                    {change.currentTime && (
                      <span className="text-zinc-400 line-through">{change.currentTime}</span>
                    )}
                    {change.newTime && (
                      <>
                        <Icons.ChevronRight size={9} className="text-violet-400" />
                        <input
                          type="time"
                          value={change.newTime}
                          onChange={e => updateChange(idx, { newTime: e.target.value })}
                          className="text-[11px] text-violet-600 dark:text-violet-400 bg-transparent border-b border-dashed border-violet-300 dark:border-violet-700 focus:border-violet-500 focus:outline-none px-0.5 py-0 w-20"
                        />
                      </>
                    )}
                  </div>
                )}

                {/* Assignee change */}
                {(change.currentAssignee || change.newAssignee) && (
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <Icons.User size={10} className="text-zinc-400" />
                    {change.currentAssignee && (
                      <span className="text-zinc-400 line-through">{change.currentAssignee}</span>
                    )}
                    {change.newAssignee && (
                      <>
                        <Icons.ChevronRight size={9} className="text-violet-400" />
                        <select
                          value={change.newAssignee}
                          onChange={e => updateChange(idx, { newAssignee: e.target.value })}
                          className="text-[11px] text-violet-600 dark:text-violet-400 bg-transparent border-b border-dashed border-violet-300 dark:border-violet-700 focus:border-violet-500 focus:outline-none px-0 py-0 cursor-pointer"
                        >
                          {teamMembers.map(m => (
                            <option key={m.id} value={m.name || m.email}>
                              {m.name || m.email}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>
                )}

                {/* Priority change */}
                {(change.currentPriority || change.newPriority) && (
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <Icons.Flag size={10} className="text-zinc-400" />
                    {change.currentPriority && (
                      <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium line-through opacity-50 ${PRIORITY_STYLES[change.currentPriority] || PRIORITY_STYLES.medium}`}>
                        {change.currentPriority}
                      </span>
                    )}
                    {change.newPriority && (
                      <>
                        <Icons.ChevronRight size={9} className="text-violet-400" />
                        <select
                          value={change.newPriority}
                          onChange={e => updateChange(idx, { newPriority: e.target.value })}
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border-0 cursor-pointer focus:outline-none ${PRIORITY_STYLES[change.newPriority] || PRIORITY_STYLES.medium}`}
                        >
                          <option value="urgent">urgent</option>
                          <option value="high">high</option>
                          <option value="medium">medium</option>
                          <option value="low">low</option>
                        </select>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Reason */}
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1.5 italic">
                {change.reason}
              </p>
            </div>

            {/* Remove button */}
            <button
              onClick={() => removeChange(idx)}
              className="p-1 text-zinc-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0 mt-1"
              title="Remove this change"
            >
              <Icons.X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
