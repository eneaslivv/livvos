/**
 * PromptTunerReviewModal — admin reviews a proposal from runPromptTuner
 * and either approves it (becomes the active override) or rejects it
 * (kept in DB for audit).
 *
 * Two modes:
 *   • mode='loading' — modal is open, tuner is running. Shows a
 *     spinner + a one-line status. Modal can be closed; the tuner
 *     keeps running in the background and the result is dropped.
 *   • mode='proposal' — tuner returned a proposal. Shows: rationale,
 *     diff (current → proposed routing hints, prompt suffix), stats
 *     snapshot, and the sample conversations that motivated it.
 *   • mode='no-change' — tuner said the agent looks fine. Shows just
 *     the rationale, no Approve button.
 *   • mode='error' — fatal error from the tuner call.
 *
 * Approve calls approve_agent_override RPC which atomically promotes
 * the proposal and supersedes any prior active override for the same
 * (tenant, agent). After success: cache invalidates + parent re-fetches.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Icons } from '../ui/Icons';
import { supabase } from '../../lib/supabase';
import { invalidateOverridesCache, type PromptTunerProposal } from '../../lib/agents';
import { useTenant } from '../../context/TenantContext';
import { SPRING_ENTER, SPRING_TAP } from '../../lib/ui/motion';
import { errorLogger } from '../../lib/errorLogger';

export type TunerModalState =
  | { mode: 'loading'; agentId: string }
  | { mode: 'proposal'; agentId: string; proposal: PromptTunerProposal; currentHints: string[]; autoApplied?: boolean }
  | { mode: 'no-change'; agentId: string; reason: string }
  | { mode: 'error'; agentId: string; error: string }
  /** View the currently-active override for an agent — shows what's in
   *  effect, before/after metrics around the applied_at date, and a
   *  Rollback button that flips status to 'superseded'. */
  | { mode: 'view-active'; agentId: string; override: ActiveOverrideView };

export interface ActiveOverrideView {
  id: string;
  agent_id: string;
  routing_hints_add: string[];
  routing_hints_remove: string[];
  prompt_suffix: string | null;
  skill_overrides: Record<string, string>;
  rationale: string | null;
  confidence: string | null;
  auto_applied: boolean;
  applied_at: string | null;
  before_metrics?: {
    turns: number; approve_rate: number | null; thumbs_up: number; thumbs_down: number;
    re_asks: number; no_data_rate: number; avg_ms_llm: number;
  };
  after_metrics?: {
    turns: number; approve_rate: number | null; thumbs_up: number; thumbs_down: number;
    re_asks: number; no_data_rate: number; avg_ms_llm: number;
  };
}

interface Props {
  state: TunerModalState | null;
  onClose: () => void;
  /** Called after a successful approve/reject so the parent can
   *  refresh whatever list shows the active override. */
  onChanged?: () => void;
}

export const PromptTunerReviewModal: React.FC<Props> = ({ state, onClose, onChanged }) => {
  const { currentTenant } = useTenant();
  const [acting, setActing] = React.useState<'approve' | 'reject' | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Reset transient state every time the modal opens for a new agent.
  React.useEffect(() => {
    setActing(null);
    setError(null);
  }, [state?.agentId]);

  if (!state) return null;

  const handleApprove = async () => {
    if (state.mode !== 'proposal' || !state.proposal.id) return;
    setActing('approve');
    setError(null);
    try {
      const { error: err } = await supabase.rpc('approve_agent_override', {
        p_override_id: state.proposal.id,
      });
      if (err) throw err;
      if (currentTenant?.id) invalidateOverridesCache(currentTenant.id);
      onChanged?.();
      onClose();
    } catch (e: any) {
      errorLogger.warn('approve_agent_override failed', e);
      setError(e?.message || 'Could not approve.');
    } finally {
      setActing(null);
    }
  };

  const handleReject = async () => {
    if (state.mode !== 'proposal' || !state.proposal.id) return;
    setActing('reject');
    setError(null);
    try {
      const { error: err } = await supabase.rpc('reject_agent_override', {
        p_override_id: state.proposal.id,
      });
      if (err) throw err;
      onChanged?.();
      onClose();
    } catch (e: any) {
      errorLogger.warn('reject_agent_override failed', e);
      setError(e?.message || 'Could not reject.');
    } finally {
      setActing(null);
    }
  };

  const handleRollback = async () => {
    if (state.mode !== 'view-active') return;
    setActing('reject'); // re-use the "reject" busy slot — only one action runs at a time
    setError(null);
    try {
      const { error: err } = await supabase.rpc('rollback_agent_override', {
        p_override_id: state.override.id,
      });
      if (err) throw err;
      if (currentTenant?.id) invalidateOverridesCache(currentTenant.id);
      onChanged?.();
      onClose();
    } catch (e: any) {
      errorLogger.warn('rollback_agent_override failed', e);
      setError(e?.message || 'Could not roll back.');
    } finally {
      setActing(null);
    }
  };

  const agentDisplayName = state.agentId.replace(/-agent$/, '');

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        className="fixed inset-0 z-[80] bg-zinc-900/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <motion.div
          onClick={e => e.stopPropagation()}
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
          transition={SPRING_ENTER}
          className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl shadow-black/20 overflow-hidden"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/60 flex items-center gap-2">
            <Icons.Sparkles size={14} className="text-violet-500" />
            <div className="flex-1">
              <h3 className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 capitalize">
                Tune {agentDisplayName} agent
              </h3>
              <p className="text-[10.5px] text-zinc-400 mt-0.5">
                AI-proposed tweaks to routing + system prompt
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              aria-label="Close"
            >
              <Icons.X size={14} />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
            {state.mode === 'loading' && (
              <div className="py-12 text-center">
                <Icons.Loader size={22} className="animate-spin mx-auto text-zinc-400" />
                <div className="mt-3 text-[12px] text-zinc-500">
                  Analyzing the last 30 days of conversations + metrics…
                </div>
                <div className="mt-1 text-[10.5px] text-zinc-400">
                  This calls the meta-model once. Usually ~5–10 seconds.
                </div>
              </div>
            )}

            {state.mode === 'error' && (
              <div className="py-8 text-center">
                <Icons.AlertCircle size={22} className="mx-auto text-rose-500" />
                <div className="mt-3 text-[12px] text-zinc-700 dark:text-zinc-200 font-medium">
                  Couldn't run the tuner
                </div>
                <div className="mt-1 text-[10.5px] text-zinc-500 max-w-sm mx-auto">
                  {state.error}
                </div>
              </div>
            )}

            {state.mode === 'no-change' && (
              <div className="py-6">
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/60 dark:border-emerald-500/30">
                  <Icons.Check size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[12px] font-medium text-emerald-800 dark:text-emerald-300">
                      No changes recommended
                    </div>
                    <div className="text-[11px] text-emerald-700/80 dark:text-emerald-300/70 mt-1">
                      {state.reason}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {state.mode === 'proposal' && (
              <ProposalView proposal={state.proposal} autoApplied={!!state.autoApplied} error={error} />
            )}

            {state.mode === 'view-active' && (
              <ActiveOverrideViewBody view={state.override} error={error} />
            )}
          </div>

          {/* Footer */}
          {state.mode === 'proposal' && !state.autoApplied && (
            <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-end gap-2">
              <motion.button
                onClick={handleReject}
                disabled={acting !== null}
                whileTap={{ scale: 0.97, transition: SPRING_TAP }}
                className="px-3 py-1.5 text-[11.5px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-40"
              >
                {acting === 'reject' ? 'Rejecting…' : 'Reject'}
              </motion.button>
              <motion.button
                onClick={handleApprove}
                disabled={acting !== null}
                whileTap={{ scale: 0.97, transition: SPRING_TAP }}
                className="px-3 py-1.5 text-[11.5px] font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors"
              >
                {acting === 'approve' ? (
                  <>
                    <Icons.Loader size={12} className="animate-spin" />
                    Approving…
                  </>
                ) : (
                  <>
                    <Icons.Check size={12} />
                    Approve + Activate
                  </>
                )}
              </motion.button>
            </div>
          )}
          {state.mode === 'proposal' && state.autoApplied && (
            <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-end gap-2">
              <span className="mr-auto text-[10.5px] text-zinc-500 dark:text-zinc-400">
                Already live — no action needed.
              </span>
              <motion.button
                onClick={onClose}
                whileTap={{ scale: 0.97, transition: SPRING_TAP }}
                className="px-3 py-1.5 text-[11.5px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              >Close</motion.button>
            </div>
          )}
          {state.mode === 'view-active' && (
            <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-end gap-2">
              <motion.button
                onClick={onClose}
                whileTap={{ scale: 0.97, transition: SPRING_TAP }}
                className="px-3 py-1.5 text-[11.5px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors mr-auto"
              >Close</motion.button>
              <motion.button
                onClick={handleRollback}
                disabled={acting !== null}
                whileTap={{ scale: 0.97, transition: SPRING_TAP }}
                className="px-3 py-1.5 text-[11.5px] font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 border border-rose-200/60 dark:border-rose-500/30 rounded-lg disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors"
                title="Revert this agent to the TypeScript defaults"
              >
                {acting === 'reject' ? (
                  <>
                    <Icons.Loader size={12} className="animate-spin" />
                    Rolling back…
                  </>
                ) : (
                  <>
                    <Icons.X size={12} />
                    Roll back to defaults
                  </>
                )}
              </motion.button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">{title}</div>
    {children}
  </div>
);

const Stat: React.FC<{ label: string; value: string | number; deltaTone?: 'good' | 'bad' | 'neutral' }> = ({ label, value, deltaTone }) => (
  <div className={`px-2 py-1.5 rounded-md border ${
    deltaTone === 'good' ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200/60 dark:border-emerald-500/30' :
    deltaTone === 'bad'  ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-200/60 dark:border-rose-500/30' :
                           'bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200/40 dark:border-zinc-700/40'
  }`}>
    <div className="text-[9px] font-medium uppercase tracking-wider text-zinc-400">{label}</div>
    <div className={`text-[12px] font-semibold tabular-nums mt-0.5 ${
      deltaTone === 'good' ? 'text-emerald-700 dark:text-emerald-300' :
      deltaTone === 'bad'  ? 'text-rose-700 dark:text-rose-300' :
                             'text-zinc-800 dark:text-zinc-200'
    }`}>{value}</div>
  </div>
);

// ── ProposalView ────────────────────────────────────────────────
// Renders a freshly-returned tuner proposal. When autoApplied, leads
// with a "live now" banner so the admin understands they're looking
// at an already-active change for visibility (not approval).
const ProposalView: React.FC<{
  proposal: PromptTunerProposal;
  autoApplied: boolean;
  error: string | null;
}> = ({ proposal, autoApplied, error }) => {
  const skillTweakEntries = Object.entries(proposal.skill_overrides || {});
  return (
    <div className="space-y-4">
      {autoApplied && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-violet-50 dark:bg-violet-500/10 border border-violet-200/60 dark:border-violet-500/30">
          <Icons.Sparkles size={12} className="text-violet-500 shrink-0 mt-0.5" />
          <div className="text-[11px]">
            <div className="font-semibold text-violet-700 dark:text-violet-300">Auto-applied — already live</div>
            <div className="text-violet-600/80 dark:text-violet-300/70 mt-0.5">
              Low-risk additive change. You can roll it back from the agent card if it's not working.
            </div>
          </div>
        </div>
      )}

      <Section title="Why">
        <p className="text-[12px] leading-relaxed text-zinc-700 dark:text-zinc-200">
          {proposal.rationale}
        </p>
        <div className="flex items-center gap-1.5 mt-2">
          <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Confidence</span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
            proposal.confidence === 'high'   ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' :
            proposal.confidence === 'medium' ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300' :
                                               'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
          }`}>{proposal.confidence}</span>
        </div>
      </Section>

      {(proposal.routing_hints_add.length > 0 || proposal.routing_hints_remove.length > 0) && (
        <Section title="Routing keywords">
          {proposal.routing_hints_add.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1.5">
              {proposal.routing_hints_add.map(k => (
                <span key={k} className="text-[10.5px] px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-500/30 inline-flex items-center gap-1">
                  <Icons.Plus size={9} />
                  {k}
                </span>
              ))}
            </div>
          )}
          {proposal.routing_hints_remove.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {proposal.routing_hints_remove.map(k => (
                <span key={k} className="text-[10.5px] px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-500/30 line-through inline-flex items-center gap-1">
                  <Icons.X size={9} />
                  {k}
                </span>
              ))}
            </div>
          )}
        </Section>
      )}

      {proposal.prompt_suffix && (
        <Section title="System prompt addition">
          <div className="text-[11.5px] text-zinc-700 dark:text-zinc-200 italic bg-zinc-50 dark:bg-zinc-800/50 rounded-md p-2.5 border border-zinc-200/60 dark:border-zinc-700/60">
            “{proposal.prompt_suffix}”
          </div>
          <div className="text-[10px] text-zinc-400 mt-1">
            Appended under "TENANT-SPECIFIC GUIDANCE" in the agent's prompt. Does NOT replace the default prompt or action protocol.
          </div>
        </Section>
      )}

      {skillTweakEntries.length > 0 && (
        <Section title="Skill description tweaks">
          <div className="space-y-1.5">
            {skillTweakEntries.map(([skillId, desc]) => (
              <div key={skillId} className="text-[11.5px] bg-zinc-50 dark:bg-zinc-800/50 rounded-md p-2 border border-zinc-200/60 dark:border-zinc-700/60">
                <div className="text-[10px] font-mono text-violet-600 dark:text-violet-400">{skillId}</div>
                <div className="text-zinc-700 dark:text-zinc-200 italic mt-0.5">“{desc}”</div>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-zinc-400 mt-1">
            Replaces these skill descriptions in the agent's prompt block when the LLM is choosing what data to pull.
          </div>
        </Section>
      )}

      <Section title="Stats this was based on">
        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          <Stat label="Turns" value={proposal.evidence.stats.turns} />
          <Stat label="Thumbs" value={`${proposal.evidence.stats.thumbs_up}↑ ${proposal.evidence.stats.thumbs_down}↓`} />
          <Stat label="Re-asks" value={proposal.evidence.stats.re_asks} />
          <Stat label="Approve rate" value={proposal.evidence.stats.approve_rate != null ? `${Math.round(proposal.evidence.stats.approve_rate * 100)}%` : '—'} />
          <Stat label="No-data %" value={`${Math.round(proposal.evidence.stats.avg_no_data_rate * 100)}%`} />
          <Stat label="Avg LLM" value={`${Math.round(proposal.evidence.stats.avg_ms_llm)}ms`} />
        </div>
      </Section>

      {proposal.evidence.sample_conversations.length > 0 && (
        <Section title="Recent conversations">
          <div className="space-y-1.5">
            {proposal.evidence.sample_conversations.slice(0, 4).map(c => (
              <div key={c.id} className="text-[11px] bg-zinc-50 dark:bg-zinc-800/50 rounded-md p-2 border border-zinc-200/40 dark:border-zinc-700/40">
                {c.skill_no_data && (
                  <span className="text-[9px] font-bold uppercase text-rose-500 mr-1.5">No data</span>
                )}
                <div className="text-zinc-700 dark:text-zinc-200 truncate">
                  <span className="text-zinc-400">→</span> {c.query}
                </div>
                <div className="text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                  <span className="text-zinc-400">←</span> {c.reply}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {error && (
        <div className="p-2 rounded-md bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 text-[11px]">
          {error}
        </div>
      )}
    </div>
  );
};

// ── ActiveOverrideViewBody ──────────────────────────────────────
// Shows what's currently in effect for an agent + before/after metrics
// computed around the override's applied_at timestamp. Lets the admin
// answer "is this actually helping?" with a real comparison.
const ActiveOverrideViewBody: React.FC<{
  view: ActiveOverrideView;
  error: string | null;
}> = ({ view, error }) => {
  const skillTweakEntries = Object.entries(view.skill_overrides || {});
  const before = view.before_metrics;
  const after = view.after_metrics;
  // Deltas — for the "is this helping?" read. Higher approve / thumbs
  // = good; higher re-asks / no_data / latency = bad. Color codes the
  // after-cell based on the direction of change.
  const tone = (key: 'approve_rate' | 'thumbs' | 're_asks' | 'no_data' | 'latency'): 'good' | 'bad' | 'neutral' => {
    if (!before || !after) return 'neutral';
    if (key === 'approve_rate') {
      if (before.approve_rate == null || after.approve_rate == null) return 'neutral';
      return after.approve_rate > before.approve_rate + 0.05 ? 'good'
        : after.approve_rate < before.approve_rate - 0.05 ? 'bad' : 'neutral';
    }
    if (key === 'thumbs') {
      const b = before.thumbs_up - before.thumbs_down;
      const a = after.thumbs_up - after.thumbs_down;
      return a > b ? 'good' : a < b ? 'bad' : 'neutral';
    }
    if (key === 're_asks') {
      return after.re_asks < before.re_asks ? 'good' : after.re_asks > before.re_asks ? 'bad' : 'neutral';
    }
    if (key === 'no_data') {
      return after.no_data_rate < before.no_data_rate - 0.05 ? 'good'
        : after.no_data_rate > before.no_data_rate + 0.05 ? 'bad' : 'neutral';
    }
    if (key === 'latency') {
      return after.avg_ms_llm < before.avg_ms_llm - 200 ? 'good'
        : after.avg_ms_llm > before.avg_ms_llm + 200 ? 'bad' : 'neutral';
    }
    return 'neutral';
  };

  return (
    <div className="space-y-4">
      {view.auto_applied && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-violet-50 dark:bg-violet-500/10 border border-violet-200/60 dark:border-violet-500/30">
          <Icons.Sparkles size={12} className="text-violet-500 shrink-0 mt-0.5" />
          <div className="text-[11px]">
            <span className="font-semibold text-violet-700 dark:text-violet-300">Auto-applied</span>
            <span className="text-violet-600/80 dark:text-violet-300/70 ml-1.5">
              {view.applied_at ? `since ${new Date(view.applied_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}` : ''}
            </span>
          </div>
        </div>
      )}

      {view.rationale && (
        <Section title="Why this was suggested">
          <p className="text-[12px] leading-relaxed text-zinc-700 dark:text-zinc-200">{view.rationale}</p>
        </Section>
      )}

      {(view.routing_hints_add.length > 0 || view.routing_hints_remove.length > 0) && (
        <Section title="Active routing changes">
          {view.routing_hints_add.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1.5">
              {view.routing_hints_add.map(k => (
                <span key={k} className="text-[10.5px] px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-500/30 inline-flex items-center gap-1">
                  <Icons.Plus size={9} />
                  {k}
                </span>
              ))}
            </div>
          )}
          {view.routing_hints_remove.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {view.routing_hints_remove.map(k => (
                <span key={k} className="text-[10.5px] px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-500/30 line-through inline-flex items-center gap-1">
                  <Icons.X size={9} />
                  {k}
                </span>
              ))}
            </div>
          )}
        </Section>
      )}

      {view.prompt_suffix && (
        <Section title="Active prompt addition">
          <div className="text-[11.5px] text-zinc-700 dark:text-zinc-200 italic bg-zinc-50 dark:bg-zinc-800/50 rounded-md p-2.5 border border-zinc-200/60 dark:border-zinc-700/60">
            “{view.prompt_suffix}”
          </div>
        </Section>
      )}

      {skillTweakEntries.length > 0 && (
        <Section title="Active skill tweaks">
          <div className="space-y-1.5">
            {skillTweakEntries.map(([skillId, desc]) => (
              <div key={skillId} className="text-[11.5px] bg-zinc-50 dark:bg-zinc-800/50 rounded-md p-2 border border-zinc-200/60 dark:border-zinc-700/60">
                <div className="text-[10px] font-mono text-violet-600 dark:text-violet-400">{skillId}</div>
                <div className="text-zinc-700 dark:text-zinc-200 italic mt-0.5">“{desc}”</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {before && after && (
        <Section title="Before vs. after — is it helping?">
          {(after.turns < 5) ? (
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 italic">
              Only {after.turns} turn{after.turns === 1 ? '' : 's'} since this went live. Give it a few more days for a meaningful comparison.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                <Stat label="Before — turns" value={before.turns} />
                <Stat label="After — turns"  value={after.turns} />
                <Stat label="Approve Δ" deltaTone={tone('approve_rate')}
                  value={(before.approve_rate != null && after.approve_rate != null)
                    ? `${Math.round(before.approve_rate * 100)}% → ${Math.round(after.approve_rate * 100)}%`
                    : '—'} />
                <Stat label="Thumbs Δ" deltaTone={tone('thumbs')}
                  value={`${before.thumbs_up - before.thumbs_down >= 0 ? '+' : ''}${before.thumbs_up - before.thumbs_down} → ${after.thumbs_up - after.thumbs_down >= 0 ? '+' : ''}${after.thumbs_up - after.thumbs_down}`} />
                <Stat label="Re-asks Δ" deltaTone={tone('re_asks')} value={`${before.re_asks} → ${after.re_asks}`} />
                <Stat label="No-data %" deltaTone={tone('no_data')}
                  value={`${Math.round(before.no_data_rate * 100)}% → ${Math.round(after.no_data_rate * 100)}%`} />
                <Stat label="LLM ms" deltaTone={tone('latency')}
                  value={`${Math.round(before.avg_ms_llm)} → ${Math.round(after.avg_ms_llm)}`} />
              </div>
              <div className="text-[10px] text-zinc-400">
                Green = improved since the override went live. Red = worsened. Use the Rollback button below if the deltas are bad.
              </div>
            </div>
          )}
        </Section>
      )}

      {error && (
        <div className="p-2 rounded-md bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 text-[11px]">
          {error}
        </div>
      )}
    </div>
  );
};
