/**
 * Prompt-tuner — analyzes one agent's recent performance and proposes
 * concrete tweaks to its routingHints + systemPrompt.
 *
 * Inputs (server-side reads):
 *   • Last 30 days of agent_conversations for THIS agent + tenant
 *   • Same window from agent_metrics (turns, thumbs, approve, re-asks,
 *     skill_no_data_rate, latency)
 *   • Agent's current TS definition (from registry — defaults only)
 *   • Current active override (if any) — so we don't propose the
 *     same thing twice
 *
 * Output: a single PromptTunerProposal — one row's worth of tweaks
 *   ready to insert into agent_overrides with status='proposed'.
 *
 * The model is given a tight, structured prompt and asked for JSON
 * with three fields:
 *   - keywords_to_add: hints that misrouted to OTHER agents in the
 *                      conversation log; rerouting here would help
 *   - keywords_to_remove: hints that caused the agent to be picked
 *                         when it shouldn't have been
 *   - prompt_addition: ≤200 chars of new guidance to append to
 *                      systemPrompt — usually clarifying when to
 *                      use which skill or how to handle a recurring
 *                      ambiguity
 *   - rationale: 1-3 sentences explaining the proposal
 *
 * NEVER auto-applies. The admin reviews + approves via the UI.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { AGENT_BY_ID } from '../registry';
import { sendAdvisorChat } from '../../ai';
import type { AgentDefinition } from '../types';

export interface PromptTunerProposal {
  /** Inserted as new agent_overrides row with status='proposed'. */
  id?: string;
  agent_id: string;
  routing_hints_add: string[];
  routing_hints_remove: string[];
  prompt_suffix: string | null;
  rationale: string;
  evidence: {
    stats: {
      turns: number;
      thumbs_up: number;
      thumbs_down: number;
      re_asks: number;
      actions_confirmed: number;
      actions_skipped: number;
      approve_rate: number | null;
      avg_no_data_rate: number;
      avg_ms_llm: number;
    };
    sample_conversations: Array<{
      id: string;
      query: string;
      reply: string;
      had_re_ask: boolean;
      skill_no_data: boolean;
    }>;
    misroutes: Array<{
      query: string;
      went_to: string;
      should_have_gone_to_this_agent_because: string;
    }>;
  };
}

export interface RunPromptTunerArgs {
  db: SupabaseClient;
  tenantId: string;
  agentId: string;
  /** Days of history to consider. Default 30. */
  sinceDays?: number;
  /** If true, the proposal is written to agent_overrides as 'proposed'
   *  and the inserted id returned. If false, the proposal is just
   *  returned (preview mode). Default true. */
  persist?: boolean;
}

export interface RunPromptTunerResult {
  ok: boolean;
  /** The proposal even if !ok (so the caller can show what we tried). */
  proposal?: PromptTunerProposal;
  /** If we couldn't propose anything actionable — explanation. */
  reason?: string;
  /** Set when persist=true and the insert succeeded. */
  insertedId?: string;
}

export async function runPromptTuner(args: RunPromptTunerArgs): Promise<RunPromptTunerResult> {
  const sinceDays = args.sinceDays || 30;
  const persist = args.persist !== false;
  const agent = AGENT_BY_ID.get(args.agentId);
  if (!agent) {
    return { ok: false, reason: `Unknown agent: ${args.agentId}` };
  }

  // ── 1. Pull recent conversation rows for this agent + tenant ─────
  const sinceIso = new Date(Date.now() - sinceDays * 86400000).toISOString();
  const { data: convRows } = await args.db
    .from('agent_conversations')
    .select('id, query, reply, agent_id, skill_trace, created_at')
    .eq('tenant_id', args.tenantId)
    .eq('agent_id', args.agentId)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(80);

  // Cross-agent conversations (to find misroutes — queries that fit
  // this agent's domain but went elsewhere). Cap at 60 so the prompt
  // stays under budget.
  const { data: otherAgentRows } = await args.db
    .from('agent_conversations')
    .select('id, query, agent_id, created_at')
    .eq('tenant_id', args.tenantId)
    .neq('agent_id', args.agentId)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(60);

  // ── 2. Stats from agent_metrics ───────────────────────────────────
  const sinceDay = new Date(Date.now() - sinceDays * 86400000).toISOString().slice(0, 10);
  const { data: metricRows } = await args.db
    .from('agent_metrics')
    .select('*')
    .eq('tenant_id', args.tenantId)
    .eq('agent_id', args.agentId)
    .gte('day', sinceDay);

  const conversations = (convRows || []) as any[];
  const others        = (otherAgentRows || []) as any[];
  const metrics       = (metricRows || []) as any[];

  if (conversations.length < 3 && metrics.length === 0) {
    return { ok: false, reason: `Not enough activity for ${agent.id} yet (${conversations.length} turns in last ${sinceDays}d). Try again after a few more conversations.` };
  }

  const sum = metrics.reduce((acc, r) => ({
    turns: acc.turns + (r.turns || 0),
    thumbs_up: acc.thumbs_up + (r.thumbs_up || 0),
    thumbs_down: acc.thumbs_down + (r.thumbs_down || 0),
    re_asks: acc.re_asks + (r.re_asks || 0),
    actions_confirmed: acc.actions_confirmed + (r.actions_confirmed || 0),
    actions_skipped: acc.actions_skipped + (r.actions_skipped || 0),
    ms_llm_sum: acc.ms_llm_sum + Number(r.avg_ms_llm || 0) * (r.turns || 0),
    no_data_sum: acc.no_data_sum + Number(r.skill_no_data_rate || 0) * (r.turns || 0),
    weight: acc.weight + (r.turns || 0),
  }), {
    turns: 0, thumbs_up: 0, thumbs_down: 0, re_asks: 0,
    actions_confirmed: 0, actions_skipped: 0, ms_llm_sum: 0,
    no_data_sum: 0, weight: 0,
  });
  const stats = {
    turns: sum.turns || conversations.length,
    thumbs_up: sum.thumbs_up,
    thumbs_down: sum.thumbs_down,
    re_asks: sum.re_asks,
    actions_confirmed: sum.actions_confirmed,
    actions_skipped: sum.actions_skipped,
    approve_rate: (sum.actions_confirmed + sum.actions_skipped) > 0
      ? sum.actions_confirmed / (sum.actions_confirmed + sum.actions_skipped) : null,
    avg_no_data_rate: sum.weight > 0 ? sum.no_data_sum / sum.weight : 0,
    avg_ms_llm: sum.weight > 0 ? sum.ms_llm_sum / sum.weight : 0,
  };

  // ── 3. Pick a sample of conversations to show the meta-model ─────
  // Prefer the ones where things went poorly so the LLM has signal to
  // work with. Heuristic: re-asks or skill_no_data > 50% of trace.
  const sample = conversations.slice(0, 30).map(c => {
    const trace = (c.skill_trace || []) as any[];
    const noDataAll = trace.length > 0 && trace.every(s => !s.ok);
    return {
      id: c.id,
      query: c.query || '',
      reply: c.reply || '',
      had_re_ask: false, // re-asks live in agent_feedback; expanding the join is heavy
      skill_no_data: noDataAll,
    };
  });
  // Reorder so problem rows surface first.
  sample.sort((a, b) => (b.skill_no_data ? 1 : 0) - (a.skill_no_data ? 1 : 0));

  // ── 4. Build the meta-prompt ─────────────────────────────────────
  // The model is asked for STRICT JSON to make parsing reliable. We
  // also feed the agent's CURRENT routing hints + a one-line summary
  // of what it does so suggestions are concrete vs hand-wavy.
  const currentPromptOneLiner = agent.systemPrompt.split('\n')[0].slice(0, 200);
  const otherAgentsList = Array.from(AGENT_BY_ID.values())
    .filter(a => a.id !== agent.id)
    .map(a => `  - ${a.id}: ${a.domain} — hints: ${a.routingHints.slice(0, 6).join(', ')}`)
    .join('\n');

  const otherConvSample = others.slice(0, 25).map(c =>
    `[${c.agent_id}] "${(c.query || '').slice(0, 120)}"`
  ).join('\n');

  const prompt = [
    `You are a meta-analyzer reviewing how the "${agent.id}" agent is performing for one tenant.`,
    '',
    `AGENT DOMAIN: ${agent.domain}`,
    `AGENT PERSONA (first line): ${currentPromptOneLiner}`,
    `CURRENT ROUTING HINTS (${agent.routingHints.length}): ${agent.routingHints.join(', ')}`,
    '',
    'STATS OVER THE LAST 30 DAYS:',
    `  - Turns: ${stats.turns}`,
    `  - Thumbs: ${stats.thumbs_up}↑ / ${stats.thumbs_down}↓`,
    `  - Re-asks (user repeated): ${stats.re_asks}`,
    `  - Proposed actions: ${stats.actions_confirmed} confirmed / ${stats.actions_skipped} skipped`,
    `  - Approve rate: ${stats.approve_rate != null ? Math.round(stats.approve_rate * 100) + '%' : 'n/a'}`,
    `  - Avg % skill calls returning no_data: ${Math.round(stats.avg_no_data_rate * 100)}%`,
    `  - Avg LLM latency: ${Math.round(stats.avg_ms_llm)}ms`,
    '',
    `SAMPLE CONVERSATIONS WITH THIS AGENT (${sample.length}):`,
    ...sample.slice(0, 15).map((c, i) =>
      `${i + 1}. ${c.skill_no_data ? '[NO_DATA]' : ''} q="${c.query.slice(0, 110)}" → "${c.reply.slice(0, 100)}…"`
    ),
    '',
    `OTHER AGENTS' RECENT QUERIES (might reveal misroutes — should some of these have come to "${agent.id}"?):`,
    otherConvSample,
    '',
    'OTHER AGENTS IN THE SYSTEM (for context — do NOT propose stealing their domains):',
    otherAgentsList,
    '',
    'Your job: propose ONE structured improvement to this agent. Output STRICT JSON with these fields:',
    '{',
    '  "keywords_to_add":    [string],   // routing hints to add (NEW words this agent should match)',
    '  "keywords_to_remove": [string],   // routing hints to remove (words causing wrong matches)',
    '  "prompt_addition":    "string",   // ≤200 chars of new system-prompt guidance, or empty if no change needed',
    '  "rationale":          "string",   // 1-3 sentences explaining WHY, citing the data above',
    '  "confidence":         "low|medium|high"',
    '}',
    '',
    'Rules:',
    '  - Be CONSERVATIVE. If the stats look healthy (low no_data, low re-asks, high approve), output empty arrays + empty prompt_addition.',
    '  - Don\'t propose keywords that already exist in CURRENT ROUTING HINTS.',
    '  - Don\'t propose keywords that obviously belong to another agent\'s domain (e.g. "invoice" for tasks-agent).',
    '  - If you see no actionable signal, set confidence=low and explain why.',
    '  - Output ONLY the JSON object — no preamble, no markdown fence.',
  ].join('\n');

  // ── 5. Call the meta-model ───────────────────────────────────────
  let parsed: any = null;
  let reason: string | undefined;
  try {
    const r = await sendAdvisorChat('', [], prompt);
    let raw = ((r as any)?.reply || '').trim();
    // Salvage the JSON if the model wrapped it in markdown ```json ... ```
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) raw = fenceMatch[1].trim();
    parsed = JSON.parse(raw);
  } catch (e: any) {
    reason = `Meta-model returned unparseable output: ${e?.message}`;
  }

  if (!parsed) {
    return { ok: false, reason: reason || 'Meta-model failed.' };
  }

  // Normalize + safety-clamp the proposal so a malformed model output
  // doesn't poison the override table.
  const proposal: PromptTunerProposal = {
    agent_id: agent.id,
    routing_hints_add: sanitizeKeywords(parsed.keywords_to_add, agent),
    routing_hints_remove: sanitizeKeywords(parsed.keywords_to_remove, agent, /*allowOnly=*/true),
    prompt_suffix: typeof parsed.prompt_addition === 'string' && parsed.prompt_addition.trim()
      ? parsed.prompt_addition.trim().slice(0, 400)
      : null,
    rationale: typeof parsed.rationale === 'string'
      ? parsed.rationale.trim().slice(0, 800)
      : '(no rationale)',
    evidence: {
      stats,
      sample_conversations: sample.slice(0, 6),
      misroutes: [],
    },
  };

  // Skip the insert if the proposal is empty.
  const isEmpty = proposal.routing_hints_add.length === 0
    && proposal.routing_hints_remove.length === 0
    && !proposal.prompt_suffix;
  if (isEmpty) {
    return {
      ok: false,
      proposal,
      reason: parsed.confidence === 'low'
        ? `Tuner says ${agent.id} looks fine: "${proposal.rationale}"`
        : 'Tuner returned no actionable changes.',
    };
  }

  if (!persist) {
    return { ok: true, proposal };
  }

  // ── 6. Persist as 'proposed' ─────────────────────────────────────
  try {
    const { data, error } = await args.db
      .from('agent_overrides')
      .insert({
        tenant_id: args.tenantId,
        agent_id: agent.id,
        status: 'proposed',
        routing_hints_add: proposal.routing_hints_add,
        routing_hints_remove: proposal.routing_hints_remove,
        prompt_suffix: proposal.prompt_suffix,
        rationale: proposal.rationale,
        evidence: proposal.evidence,
      })
      .select('id')
      .single();
    if (error) throw error;
    proposal.id = (data as any).id;
    return { ok: true, proposal, insertedId: proposal.id };
  } catch (e: any) {
    return { ok: false, proposal, reason: `Could not save proposal: ${e?.message}` };
  }
}

/** Defensive cleanup for keyword arrays returned by the model.
 *  Strips empties, lowercases, dedupes, caps length. When
 *  allowOnly=true, only returns keywords that EXIST in the agent's
 *  current routingHints (since we're removing them). */
function sanitizeKeywords(input: unknown, agent: AgentDefinition, allowOnly = false): string[] {
  if (!Array.isArray(input)) return [];
  const cur = new Set(agent.routingHints.map(h => h.toLowerCase()));
  const out = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const k = raw.trim().toLowerCase();
    if (!k || k.length > 40) continue;
    if (allowOnly) {
      if (!cur.has(k)) continue; // can't remove a hint that doesn't exist
      out.add(k);
    } else {
      if (cur.has(k)) continue;  // already there — no-op
      out.add(k);
    }
    if (out.size >= 8) break;    // safety cap
  }
  return Array.from(out);
}
