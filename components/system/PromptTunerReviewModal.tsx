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
  | { mode: 'proposal'; agentId: string; proposal: PromptTunerProposal; currentHints: string[] }
  | { mode: 'no-change'; agentId: string; reason: string }
  | { mode: 'error'; agentId: string; error: string };

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
              <div className="space-y-4">
                {/* Rationale */}
                <Section title="Why">
                  <p className="text-[12px] leading-relaxed text-zinc-700 dark:text-zinc-200">
                    {state.proposal.rationale}
                  </p>
                </Section>

                {/* Routing hints diff */}
                {(state.proposal.routing_hints_add.length > 0 || state.proposal.routing_hints_remove.length > 0) && (
                  <Section title="Routing keywords">
                    {state.proposal.routing_hints_add.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {state.proposal.routing_hints_add.map(k => (
                          <span key={k} className="text-[10.5px] px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-500/30 inline-flex items-center gap-1">
                            <Icons.Plus size={9} />
                            {k}
                          </span>
                        ))}
                      </div>
                    )}
                    {state.proposal.routing_hints_remove.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {state.proposal.routing_hints_remove.map(k => (
                          <span key={k} className="text-[10.5px] px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-500/30 line-through inline-flex items-center gap-1">
                            <Icons.X size={9} />
                            {k}
                          </span>
                        ))}
                      </div>
                    )}
                  </Section>
                )}

                {/* Prompt suffix */}
                {state.proposal.prompt_suffix && (
                  <Section title="System prompt addition">
                    <div className="text-[11.5px] text-zinc-700 dark:text-zinc-200 italic bg-zinc-50 dark:bg-zinc-800/50 rounded-md p-2.5 border border-zinc-200/60 dark:border-zinc-700/60">
                      “{state.proposal.prompt_suffix}”
                    </div>
                    <div className="text-[10px] text-zinc-400 mt-1">
                      Will be appended under "TENANT-SPECIFIC GUIDANCE" in the
                      agent's prompt. Does NOT replace the default prompt or
                      action protocol.
                    </div>
                  </Section>
                )}

                {/* Evidence stats */}
                <Section title="Stats this was based on">
                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    <Stat label="Turns" value={state.proposal.evidence.stats.turns} />
                    <Stat label="Thumbs" value={`${state.proposal.evidence.stats.thumbs_up}↑ ${state.proposal.evidence.stats.thumbs_down}↓`} />
                    <Stat label="Re-asks" value={state.proposal.evidence.stats.re_asks} />
                    <Stat
                      label="Approve rate"
                      value={state.proposal.evidence.stats.approve_rate != null
                        ? `${Math.round(state.proposal.evidence.stats.approve_rate * 100)}%`
                        : '—'}
                    />
                    <Stat label="No-data %" value={`${Math.round(state.proposal.evidence.stats.avg_no_data_rate * 100)}%`} />
                    <Stat label="Avg LLM" value={`${Math.round(state.proposal.evidence.stats.avg_ms_llm)}ms`} />
                  </div>
                </Section>

                {/* Sample conversations */}
                {state.proposal.evidence.sample_conversations.length > 0 && (
                  <Section title="Recent conversations">
                    <div className="space-y-1.5">
                      {state.proposal.evidence.sample_conversations.slice(0, 4).map(c => (
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
            )}
          </div>

          {/* Footer (only for actionable proposals) */}
          {state.mode === 'proposal' && (
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

const Stat: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="px-2 py-1.5 rounded-md bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/40 dark:border-zinc-700/40">
    <div className="text-[9px] font-medium uppercase tracking-wider text-zinc-400">{label}</div>
    <div className="text-[12px] font-semibold tabular-nums text-zinc-800 dark:text-zinc-200 mt-0.5">{value}</div>
  </div>
);
