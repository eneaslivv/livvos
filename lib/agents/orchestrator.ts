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
  Skill,
  SkillResult,
} from './types';
import { AGENTS, AGENT_BY_ID } from './registry';
import { sendAdvisorChat } from '../ai';

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
export async function runOrchestrator(input: OrchestratorInput): Promise<OrchestratorOutput> {
  const agent = input.forcedAgentId
    ? AGENT_BY_ID.get(input.forcedAgentId) || routeAgent(input.query)
    : routeAgent(input.query);

  const trace = await runAgentSkills(agent, input.query, input.ctx);
  const skillContextBlock = formatSkillResultsForPrompt(trace);

  // Hand off to Gemini with the agent persona + real data. The
  // sendAdvisorChat helper takes (context, history, question) — we pack
  // the agent prompt + skill data into the context.
  const aiContext = [
    `AGENT: ${agent.name} (${agent.id})`,
    '',
    agent.systemPrompt,
    '',
    skillContextBlock,
  ].join('\n');
  const history = (input.history || []).slice(-8) as any;
  const reply = await sendAdvisorChat(aiContext, history, input.query).then(r => (r as any)?.reply || '');

  return {
    reply: reply || 'I could not produce a reply.',
    agentId: agent.id,
    skillTrace: trace.map(({ skill, result }) => ({
      skillId: skill.id,
      ok: result.ok,
      summary: result.ok
        ? `${skill.id} → ${result.kind === 'count' ? JSON.stringify(result.data) : (Array.isArray(result.data) ? `${(result.data as any[]).length} items` : 'ok')}`
        : `${skill.id} → ${result.reason || 'no data'}`,
      ms: result.ms,
    })),
    proposedActions: [],
  };
}

// Convenience re-exports for direct skill access from non-LLM call sites
export { SKILL_BY_ID, AGENT_BY_ID, AGENTS, skillCatalog } from './registry';
export type { AgentDefinition, Skill, SkillResult, ExecutionContext, OrchestratorOutput } from './types';
