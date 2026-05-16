/**
 * Orchestrator — the entry point that the UI calls. Given a user query
 * + execution context, it:
 *   1. Picks the right agent (forced or auto-routed by keywords).
 *   2. Runs the agent's read-only skills to gather real data.
 *   3. Bundles {systemPrompt + skill results + query + history} and
 *      calls Gemini for a natural-language reply.
 *   4. Parses out any proposed write actions (e.g. "create task") and
 *      returns them as ProposedAction items for the UI to confirm.
 *   5. Returns the assistant reply + skill trace + proposed actions.
 *
 * Anti-hallucination guarantee: the LLM only sees facts that came back
 * from skill calls. The prompt explicitly forbids invention. If the
 * skills returned no data, the agent is instructed to say so plainly.
 */

import type {
  AgentDefinition,
  ExecutionContext,
  OrchestratorInput,
  OrchestratorOutput,
  ProposedAction,
  Skill,
  SkillResult,
} from './types';
import { AGENTS, AGENT_BY_ID } from './registry';
import { sendAdvisorChat } from '../ai';
import {
  logConversationTurn,
  getUserProfile,
  formatProfileForPrompt,
  recordFeedback,
  detectReAsk,
  detectRephrase,
} from './memory';

// ── Action parser ────────────────────────────────────────────────────
// The LLM emits actions in <action kind="..." param="..." ...>label</action>
// format (see ACTION_PROTOCOL_INSTRUCTIONS in types.ts). Pull them out
// of the reply and return them as structured ProposedAction items the
// UI can render as approval cards. Also strip the raw <action> markup
// from the user-facing reply text so they don't see XML in the chat.
const ACTION_REGEX = /<action\s+([^>]+)>([\s\S]*?)<\/action>/g;
const ATTR_REGEX = /(\w+)="([^"]*)"/g;

const SUPPORTED_KINDS = new Set<ProposedAction['kind']>([
  // Tasks
  'complete_task', 'reopen_task', 'start_task',
  'update_task_priority', 'update_task_due_date', 'create_task',
  // Finance
  'mark_installment_paid', 'mark_installment_pending',
  'create_expense', 'create_income',
  // Calendar
  'reschedule_event', 'cancel_event', 'create_event',
  // Inbox
  'mark_message_done', 'convert_to_task', 'draft_reply',
  // Clients
  'update_client_notes', 'create_client',
  // Projects
  'set_project_status', 'set_project_deadline', 'create_project',
]);

const parseActionsFromReply = (reply: string): { cleanReply: string; actions: ProposedAction[] } => {
  const actions: ProposedAction[] = [];
  const cleanReply = reply.replace(ACTION_REGEX, (_full, attrsRaw, labelRaw) => {
    const attrs: Record<string, string> = {};
    let m: RegExpExecArray | null;
    const re = new RegExp(ATTR_REGEX.source, 'g');
    while ((m = re.exec(attrsRaw)) !== null) {
      attrs[m[1]] = m[2];
    }
    const kind = attrs.kind as ProposedAction['kind'];
    if (!SUPPORTED_KINDS.has(kind)) return ''; // drop unknown actions silently
    const { kind: _, ...params } = attrs;
    actions.push({
      kind,
      label: (labelRaw || '').trim() || kind.replace(/_/g, ' '),
      params,
    });
    return ''; // strip from user-facing text
  }).replace(/\n{3,}/g, '\n\n').trim();
  return { cleanReply, actions };
};

// ── 1. Auto-route a query to an agent by keyword matching ────────────
const routeAgent = (query: string): AgentDefinition => {
  const lowered = query.toLowerCase();
  // Score each agent by how many of its routing hints appear in the
  // query. Tie-break: first registered agent wins (so order in
  // registry.ts matters — put the most "common" agents first).
  let best = AGENTS[0];
  let bestScore = 0;
  for (const a of AGENTS) {
    const score = a.routingHints.filter(h => lowered.includes(h.toLowerCase())).length;
    if (score > bestScore) {
      best = a;
      bestScore = score;
    }
  }
  return best;
};

// ── 2. Run a curated set of read skills for the chosen agent ─────────
// Without skill calling tools (we don't ship full function-calling
// yet), the heuristic is: run every read skill that has no required
// params + the first few that match obvious patterns. We cap by
// maxSkillCallsPerTurn to keep latency bounded.
const runAgentSkills = async (
  agent: AgentDefinition,
  query: string,
  ctx: ExecutionContext,
): Promise<Array<{ skill: Skill; result: SkillResult }>> => {
  const lowered = query.toLowerCase();
  const max = agent.maxSkillCallsPerTurn || 3;
  const out: Array<{ skill: Skill; result: SkillResult }> = [];

  for (const skill of agent.skills) {
    if (out.length >= max) break;
    if (skill.kind === 'write') continue; // never auto-run writes
    // For skills with required params we'd need argument extraction —
    // skip those in this version. Run only zero-arg or self-defaulted
    // skills, which covers the "summary / list / status" use cases.
    let validated: any;
    try {
      validated = skill.validate ? skill.validate({}) : {};
    } catch {
      // Required params missing — try to opportunistically extract some
      // by looking for project mentions in the query. Cheap heuristic.
      if (skill.id === 'tasks.search') {
        validated = { query: query.slice(0, 60) };
      } else {
        continue;
      }
    }
    // Filter out skills that don't seem relevant to the query (cheap
    // optimization: avoid burning time on "today_events" when the user
    // asked about overdue tasks).
    const relevanceHints = skill.id.split(/[._]/);
    const hitsRelevance = relevanceHints.some(h => lowered.includes(h));
    const isAlwaysOn = skill.id.endsWith('list_open_for_me')
      || skill.id.endsWith('list_overdue')
      || skill.id.endsWith('today_events')
      || skill.id.endsWith('pending');
    if (!hitsRelevance && !isAlwaysOn && out.length > 0) continue;
    try {
      const result = await skill.run(validated, ctx);
      out.push({ skill, result });
    } catch (e: any) {
      out.push({ skill, result: { ok: false, kind: 'none', reason: e?.message || 'skill_error' } });
    }
  }
  return out;
};

// ── 3. Build the LLM prompt from the skill results ───────────────────
const formatSkillResultsForPrompt = (
  trace: Array<{ skill: Skill; result: SkillResult }>,
): string => {
  const lines: string[] = ['── SKILL RESULTS (real data — your ONLY source of truth) ──'];
  if (trace.length === 0) {
    lines.push('No skills ran (intent not matched). Answer based on the conversation only and ask for specifics if needed.');
    return lines.join('\n');
  }
  for (const { skill, result } of trace) {
    lines.push('');
    lines.push(`▸ ${skill.id}  (${skill.description})`);
    if (!result.ok) {
      lines.push(`  → no_data — reason: ${result.reason || 'unknown'}`);
      continue;
    }
    // Pretty-print common shapes
    if (Array.isArray(result.data)) {
      const arr = result.data as any[];
      lines.push(`  → ${arr.length} item${arr.length === 1 ? '' : 's'}`);
      arr.slice(0, 15).forEach((row, i) => {
        lines.push(`     ${i + 1}. ${JSON.stringify(row).slice(0, 300)}`);
      });
      if (arr.length > 15) lines.push(`     …+${arr.length - 15} more`);
    } else {
      lines.push(`  → ${JSON.stringify(result.data).slice(0, 600)}`);
    }
  }
  return lines.join('\n');
};

// ── 4. Main entry ────────────────────────────────────────────────────
export interface OrchestratorRunOptions {
  /** Surface tag for logging — 'brief' | 'advisor' | 'finance' | ... */
  surface?: string;
  /** Optional thread id grouping consecutive turns in the same session. */
  threadId?: string;
  /** Disable conversation logging (rare — used in dry-run / tests). */
  noLog?: boolean;
}

export async function runOrchestrator(
  input: OrchestratorInput,
  options: OrchestratorRunOptions = {},
): Promise<OrchestratorOutput & { conversationId?: string | null }> {
  const t0 = Date.now();
  const agent = input.forcedAgentId
    ? AGENT_BY_ID.get(input.forcedAgentId) || routeAgent(input.query)
    : routeAgent(input.query);

  // Run skills (read-only) + record per-skill timing
  const skillT0 = Date.now();
  const trace = await runAgentSkills(agent, input.query, input.ctx);
  const msSkills = Date.now() - skillT0;
  const skillContextBlock = formatSkillResultsForPrompt(trace);

  // Pull the user's learned profile to adapt tone/style to them
  const profile = await getUserProfile(input.ctx.db, {
    userId: input.ctx.userId, tenantId: input.ctx.tenantId,
  });
  const profileBlock = formatProfileForPrompt(profile);

  // Hand off to Gemini with the agent persona + profile + real data
  const aiContext = [
    `AGENT: ${agent.name} (${agent.id})`,
    '',
    agent.systemPrompt,
    '',
    profileBlock,
    skillContextBlock,
  ].filter(Boolean).join('\n');
  const history = (input.history || []).slice(-8) as any;
  const llmT0 = Date.now();
  const rawReply = await sendAdvisorChat(aiContext, history, input.query).then(r => (r as any)?.reply || '');
  const msLlm = Date.now() - llmT0;
  const { cleanReply, actions } = parseActionsFromReply(rawReply);

  const output: OrchestratorOutput = {
    reply: cleanReply || 'I could not produce a reply.',
    agentId: agent.id,
    skillTrace: trace.map(({ skill, result }) => ({
      skillId: skill.id,
      ok: result.ok,
      summary: result.ok
        ? `${skill.id} → ${result.kind === 'count' ? JSON.stringify(result.data) : (Array.isArray(result.data) ? `${(result.data as any[]).length} items` : 'ok')}`
        : `${skill.id} → ${result.reason || 'no data'}`,
      ms: result.ms,
    })),
    proposedActions: actions,
  };

  const msTotal = Date.now() - t0;

  // Log + auto-detect implicit feedback signals (re-ask, rephrase) from
  // the previous turn in the history. Fire-and-forget.
  let conversationId: string | null = null;
  if (!options.noLog) {
    conversationId = await logConversationTurn({
      ctx: input.ctx,
      surface: options.surface || 'unknown',
      query: input.query,
      output,
      msTotal, msSkills, msLlm,
      threadId: options.threadId,
    });
    // Look at the previous user turn in history for re-ask detection.
    // The most recent user turn in history === their PREVIOUS query
    // (since current query isn't in history yet).
    const lastUserTurn = [...(input.history || [])].reverse().find(h => h.role === 'user');
    if (lastUserTurn) {
      if (detectReAsk(input.query, lastUserTurn.content)) {
        // The previous conversation row was bad — but we don't have its
        // id here without an extra fetch. The Brief UI can correlate by
        // recency + record the feedback signal with the previous turn.
        // For now we log against the CURRENT turn as a "re-asked" mark.
        if (conversationId) {
          recordFeedback({
            ctx: input.ctx, conversationId, agentId: agent.id,
            signal: 're_asked_same_thing',
          }).catch(() => {});
        }
      } else if (detectRephrase(input.query, lastUserTurn.content)) {
        if (conversationId) {
          recordFeedback({
            ctx: input.ctx, conversationId, agentId: agent.id,
            signal: 'rephrased',
          }).catch(() => {});
        }
      }
    }
  }

  return { ...output, conversationId };
}

// Convenience re-exports for direct skill access from non-LLM call sites
export { SKILL_BY_ID, AGENT_BY_ID, AGENTS, skillCatalog } from './registry';
export type { AgentDefinition, Skill, SkillResult, ExecutionContext, OrchestratorOutput } from './types';
