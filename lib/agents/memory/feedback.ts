/**
 * Feedback signals — explicit (thumbs up/down + comment) and implicit
 * (action confirmed/skipped, re-asks, rephrasings).
 *
 * The implicit signals are detected here rather than scattered in UI
 * code, so the heuristic stays in one place.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExecutionContext } from '../types';

export type FeedbackSignal =
  | 'thumbs_up'
  | 'thumbs_down'
  | 'action_confirmed'
  | 'action_skipped'
  | 're_asked_same_thing'
  | 'rephrased'
  | 'follow_up_clarification';

export async function recordFeedback(args: {
  ctx: ExecutionContext;
  conversationId: string;
  agentId: string;
  signal: FeedbackSignal;
  comment?: string;
}): Promise<void> {
  try {
    await args.ctx.db.from('agent_feedback').insert({
      conversation_id: args.conversationId,
      user_id: args.ctx.userId,
      signal: args.signal,
      comment: args.comment || null,
    });
    // Bump the per-day rollup metric
    args.ctx.db.rpc('bump_feedback_metric', {
      p_tenant_id: args.ctx.tenantId,
      p_agent_id: args.agentId,
      p_signal: args.signal,
    }).then(() => {}, () => {});
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[agent-feedback] insert failed:', e);
  }
}

/** Detect if the user's new query is semantically the same as the last
 *  one (implicit "re-ask" signal — means the previous answer was bad). */
export const detectReAsk = (currentQuery: string, lastQuery?: string): boolean => {
  if (!lastQuery) return false;
  const norm = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const a = norm(currentQuery);
  const b = norm(lastQuery);
  if (a === b) return true;
  // Token-overlap shortcut: >80% same tokens = re-ask
  const aTokens = new Set(a.split(' ').filter(t => t.length > 2));
  const bTokens = new Set(b.split(' ').filter(t => t.length > 2));
  if (aTokens.size === 0 || bTokens.size === 0) return false;
  const inter = [...aTokens].filter(t => bTokens.has(t)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  return inter / union > 0.7;
};

/** Detect rephrasing — different words, similar intent. Looser heuristic
 *  than re-ask: 40-70% token overlap. */
export const detectRephrase = (currentQuery: string, lastQuery?: string): boolean => {
  if (!lastQuery) return false;
  if (detectReAsk(currentQuery, lastQuery)) return false; // exact = re-ask, not rephrase
  const norm = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const aTokens = new Set(norm(currentQuery).split(' ').filter(t => t.length > 2));
  const bTokens = new Set(norm(lastQuery).split(' ').filter(t => t.length > 2));
  if (aTokens.size === 0 || bTokens.size === 0) return false;
  const inter = [...aTokens].filter(t => bTokens.has(t)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  const ratio = inter / union;
  return ratio > 0.4 && ratio < 0.7;
};

/** Fetch aggregate feedback for a user's recent conversations — used by
 *  the critique agent. */
export async function fetchFeedbackStats(
  db: SupabaseClient,
  args: { userId: string; tenantId: string; sinceDays?: number },
): Promise<Record<string, number>> {
  const since = new Date(Date.now() - (args.sinceDays || 30) * 86400000).toISOString();
  const { data } = await db.from('agent_feedback')
    .select('signal')
    .eq('user_id', args.userId)
    .gte('created_at', since);
  const counts: Record<string, number> = {};
  for (const row of (data || []) as any[]) {
    counts[row.signal] = (counts[row.signal] || 0) + 1;
  }
  return counts;
}
