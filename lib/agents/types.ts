/**
 * Agent system types — the contract that lets us add new agents + skills
 * without re-touching every call site.
 *
 * Three layers:
 *   1. Skill   — a single capability the system has. Reads or writes
 *                one specific kind of data. Pure function over the
 *                ExecutionContext. NEVER invents data — returns
 *                { ok: false, reason: 'not_found' } when nothing matches.
 *   2. Agent   — a domain-specific orchestrator (tasks / finance / etc).
 *                Owns a system prompt + a curated list of skills.
 *   3. Orchestrator — routes a user query to one or more agents and
 *                stitches their outputs into a single reply.
 *
 * The hard rule across all three: every fact the LLM cites must trace
 * back to a Skill that actually ran and returned data. The system
 * prompt for every agent explicitly forbids inventing values.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ──────────────────────────────────────────────────────────────────────
//  Execution context — shared by all skills + agents
// ──────────────────────────────────────────────────────────────────────

export interface ExecutionContext {
  /** Authenticated Supabase client (browser). All DB ops go through here
   *  so RLS enforces tenant isolation. */
  db: SupabaseClient;
  /** Current user id — used by skills to scope "my tasks" / "my work". */
  userId: string;
  /** Active tenant id — every query MUST include this filter. */
  tenantId: string;
  /** Date considered "today" for relative-time skills. Override only in tests. */
  now?: Date;
}

// ──────────────────────────────────────────────────────────────────────
//  Skill — one capability
// ──────────────────────────────────────────────────────────────────────

export type SkillKind = 'read' | 'write';

export interface SkillResult<T = unknown> {
  ok: boolean;
  /** What kind of data this is — used by the orchestrator to format. */
  kind: 'task' | 'task[]' | 'event' | 'event[]' | 'income' | 'income[]'
      | 'expense' | 'expense[]' | 'client' | 'client[]' | 'project' | 'project[]'
      | 'message' | 'message[]' | 'count' | 'analysis' | 'none';
  data?: T;
  /** Human-readable explanation when ok=false ("no_match", "permission_denied", etc). */
  reason?: string;
  /** Whose tenant the data came from — for cross-tenant safety auditing. */
  sourceTenant?: string;
  /** Diagnostic timing in ms — surfaced in dev for slow-query hunting. */
  ms?: number;
}

export interface Skill<Params = any, Data = unknown> {
  /** Unique global id like 'tasks.list_open_for_me'. */
  id: string;
  /** What this skill does, one sentence. Shown in agent prompts. */
  description: string;
  /** Read or write — write skills are NEVER auto-executed; they return
   *  a ProposedAction the user must approve. */
  kind: SkillKind;
  /** Lightweight runtime validation for params (we don't pull in zod
   *  here to keep the bundle slim — just hand-rolled checks). */
  validate?: (params: unknown) => Params;
  /** Actual implementation. Receives validated params + execution context. */
  run: (params: Params, ctx: ExecutionContext) => Promise<SkillResult<Data>>;
}

// ──────────────────────────────────────────────────────────────────────
//  Agent — domain orchestrator
// ──────────────────────────────────────────────────────────────────────

export interface AgentDefinition {
  /** Unique id like 'tasks-agent'. */
  id: string;
  /** Display name shown in the UI ("Tasks Agent"). */
  name: string;
  /** Short tag — 'tasks' | 'finance' | 'calendar' | ... — drives routing. */
  domain: string;
  /** System prompt that defines the agent's persona + non-invention rule. */
  systemPrompt: string;
  /** Skills this agent has access to. Order matters for "preferred first" routing. */
  skills: Skill[];
  /** Keywords / phrases that hint this agent should handle the query.
   *  Used by the orchestrator for first-pass routing. */
  routingHints: string[];
  /** Optional: cap on how many skills can run per query (prevents runaways). */
  maxSkillCallsPerTurn?: number;
}

// ──────────────────────────────────────────────────────────────────────
//  Orchestrator — runs a user query end-to-end
// ──────────────────────────────────────────────────────────────────────

export interface OrchestratorInput {
  query: string;
  /** Conversational history — last few turns. */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Override the auto-routed agent. Useful when a page widget wants to
   *  force a specific agent (e.g. Finance page → finance-agent). */
  forcedAgentId?: string;
  ctx: ExecutionContext;
}

export interface OrchestratorOutput {
  /** Plain-text reply to show the user. */
  reply: string;
  /** Which agent handled it. */
  agentId: string;
  /** Skill executions that ran, in order. Surfaces in the UI as
   *  "Pulled tasks ✓", "Analyzed finance ✓" chips. */
  skillTrace: Array<{
    skillId: string;
    ok: boolean;
    summary: string;
    ms?: number;
  }>;
  /** Write actions the agent proposed but did NOT execute (user must
   *  approve). Same shape as AiAdvisor's ProposedAction. */
  proposedActions?: Array<{
    kind: string;
    label: string;
    params: any;
  }>;
}

// ──────────────────────────────────────────────────────────────────────
//  Anti-hallucination instructions — appended to every agent prompt
// ──────────────────────────────────────────────────────────────────────

export const NON_INVENTION_RULES = [
  'STRICT FACT RULE — every concrete value you mention (task title, due date, amount, client name, project, person) MUST come from data in the SKILL RESULTS block. NEVER invent.',
  'If the skills returned no data, say so explicitly: "No matching X found." Do NOT guess or extrapolate.',
  'If the skills returned partial data, work only with what you have. Do NOT fill gaps with assumptions.',
  'When citing a number (count, amount, percentage), reference where it came from when relevant ("based on 12 open tasks").',
  'Never claim to have taken an action you did not take. Write operations require a ProposedAction the user approves separately.',
].join('\n');
