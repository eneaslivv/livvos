/**
 * Conversation logging — persists every chat turn to agent_conversations.
 *
 * Fire-and-forget from the orchestrator: returns the inserted id so the
 * UI can attach feedback signals to it later. Never throws — a failed
 * log shouldn't break the user's chat.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrchestratorOutput, ExecutionContext } from '../types';

export interface LogTurnArgs {
  ctx: ExecutionContext;
  surface: string;             // 'brief' | 'advisor' | 'finance' | ...
  query: string;
  output: OrchestratorOutput;
  msTotal: number;
  msSkills: number;
  msLlm: number;
  threadId?: string;           // groups consecutive turns
}

export async function logConversationTurn(args: LogTurnArgs): Promise<string | null> {
  try {
    const skillTotal = args.output.skillTrace.length;
    const skillNoData = args.output.skillTrace.filter(s => !s.ok).length;
    const { data, error } = await args.ctx.db
      .from('agent_conversations')
      .insert({
        tenant_id: args.ctx.tenantId,
        user_id: args.ctx.userId,
        surface: args.surface,
        agent_id: args.output.agentId,
        query: args.query,
        reply: args.output.reply,
        skill_trace: args.output.skillTrace,
        proposed_actions: args.output.proposedActions || [],
        ms_total: args.msTotal,
        ms_skills: args.msSkills,
        ms_llm: args.msLlm,
        thread_id: args.threadId || null,
      })
      .select('id')
      .single();
    if (error) {
      if (typeof console !== 'undefined') console.warn('[agent-memory] log insert failed:', error.message);
      return null;
    }
    // Bump rollup metric in the background. Even if it fails, the log
    // row is already persisted.
    args.ctx.db.rpc('increment_agent_metric', {
      p_tenant_id: args.ctx.tenantId,
      p_agent_id: args.output.agentId,
      p_ms_total: args.msTotal,
      p_ms_skills: args.msSkills,
      p_ms_llm: args.msLlm,
      p_skill_no_data: skillNoData,
      p_skill_total: skillTotal,
    }).then(() => {}, () => {});
    return (data as any)?.id || null;
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[agent-memory] log failed:', e);
    return null;
  }
}

/** Fetch the last N turns for a given thread or user — used by the
 *  critique loop to spot patterns. */
export async function fetchRecentTurns(
  db: SupabaseClient,
  args: { userId: string; tenantId: string; limit?: number; agentId?: string },
): Promise<any[]> {
  let q = db.from('agent_conversations')
    .select('*')
    .eq('tenant_id', args.tenantId)
    .eq('user_id', args.userId)
    .order('created_at', { ascending: false })
    .limit(args.limit || 30);
  if (args.agentId) q = q.eq('agent_id', args.agentId);
  const { data } = await q;
  return data || [];
}
