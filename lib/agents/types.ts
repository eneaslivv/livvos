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
  /** Surface-level context hint injected into the LLM prompt so replies
   *  are tailored to the section the user is looking at. Each surface
   *  describes: what the user is viewing, which data is most relevant,
   *  and any extra tone/focus instructions.
   *
   *  Examples:
   *    'brief'    → "focus on today's tasks, overdue, schedule"
   *    'finance'  → "focus on income/expenses/cashflow"
   *    'aurora:marina' → "you are Marina, the finance specialist"
   */
  surfaceHint?: string;
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
   *  approve). Parsed out of <action> tags in the LLM reply. */
  proposedActions?: ProposedAction[];
  /** Raw data from skill results — used by the frontend for rich
   *  rendering (e.g. inbox messages as structured cards instead of
   *  plain text). Only populated for skills that produce message arrays. */
  rawData?: {
    inboxMessages?: Array<any>;
  };
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

// ──────────────────────────────────────────────────────────────────────
//  Presentation guide — taught to every agent so their replies render
//  as structured, scannable layouts in the UI (the markdown renderer
//  understands all the directives below natively).
// ──────────────────────────────────────────────────────────────────────
export const PRESENTATION_GUIDE = [
  '',
  '── PRESENTATION GUIDE — your reply RENDERS as rich markdown ──',
  'Make replies scannable, not wall-of-text. The UI parses markdown + the custom directives below.',
  '',
  'Structure rules:',
  '  • Lead with a 1-sentence headline (no heading marker). Then break into sections.',
  '  • Use ## Section Title for the 2-4 main groupings (not "Section X:" in prose).',
  '  • Use ### Sub-label (small uppercase) for tighter subsections.',
  '  • Keep paragraphs short (≤2 sentences). Use bullets for enumerations.',
  '  • Use **bold** for the KEY TERM in each bullet (task title, client name, $ amount).',
  '  • Use *italics* for soft asides; `inline code` for ids or commands.',
  '',
  'Task / priority lists — use these prefixes so the UI renders colored priority dots:',
  '  - [urgent] task description    → rose dot + URGENT tag',
  '  - [high]   task description    → amber dot + HIGH tag',
  '  - [medium] task description    → indigo dot (no tag)',
  '  - [low]    task description    → grey dot + LOW tag',
  '  - [done]   task description    → emerald dot + DONE tag',
  'Any plain `-` bullet that starts with [urgent]/[high]/[medium]/[low]/[done] is auto-upgraded — you do not need :::tasklist:::.',
  '',
  'Custom directives — emit on their own line, ONE per line:',
  '  :::stat label="Revenue" value="$5,000" tone="emerald":::',
  '       → inline pill — use for ≤3 key numbers in flow',
  '  :::kpi label="MRR" value="$2,400" target="$3,000" tone="emerald":::',
  '       → bigger card with a target — use when the number is THE point',
  '  :::row label="Implementation" value="$5,000" tone="zinc":::',
  '       → label-on-left value-on-right row — perfect for breakdowns',
  '  :::callout tone="warning" :: Sunnyside has gone 8 days without contact. :::',
  '       → tinted block for important context. tone = info / warning / success / error',
  '',
  '  :::grid',
  '  Overdue | 25 | rose',
  '  Due today | 1 | amber',
  '  Active retainers | 3 | emerald',
  '  :::end:::',
  '       → grid of stat tiles. Body lines: `label | value | tone` separated by `|`.',
  '',
  '  :::section title="Tareas vencidas" tone="rose"',
  '  ... any markdown body (bullets, tasklists, rows, etc.) ...',
  '  :::end:::',
  '       → titled, color-toned section block. Use for clearly-grouped output.',
  '',
  '',
  '  :::topics',
  '  Channel Name | 6 | #channel-name | violet',
  '  Email Thread | 3 | gmail | blue',
  '  :::end:::',
  '       → row of clickable topic/filter pills. Body lines: `label | count | filter | tone`.',
  '         The user clicks a pill to drill down into that topic. Great for inbox digests,',
  '         project groupings, or any categorized summary the user might want to explore.',
  '',
  '  :::topic label="Urgent Items" count="3" filter="urgent" tone="rose":::',
  '       → single clickable topic pill (use :::topics::: for multiple).',
  '',
  'Tones: rose, amber, emerald, violet, indigo, blue, zinc (defaults to zinc).',
  '',
  'Style discipline:',
  '  • Prefer one :::section::: with 3-5 bullets over a long flat list.',
  '  • At most ONE :::kpi::: per reply (the headline number).',
  '  • Skip the directives if you only have 1-2 items to show — plain markdown is fine.',
  '  • Never restate the same number twice in different blocks.',
  '  • Conclude with a 1-line "next step" question or recommendation. No closing pleasantries.',
].join('\n');

// ──────────────────────────────────────────────────────────────────────
//  Action proposal protocol
// ──────────────────────────────────────────────────────────────────────
// When the user asks the agent to DO something (mark done, snooze,
// create, update), the agent emits an <action> tag at the end of its
// reply. The orchestrator parses these out and surfaces them as
// approval cards in the UI. The agent NEVER executes writes itself.

/** Universal action protocol header — shared across all agents. */
const ACTION_PROTOCOL_HEADER = [
  '',
  'ACTION PROTOCOL — when the user asks you to DO something (write to the DB, send a message, change state), do NOT claim to have done it. Instead emit a structured proposal at the END of your reply, on its own line, in this exact format:',
  '',
  '<action kind="ACTION_KIND" param1="value1" param2="value2">Human-readable label</action>',
  '',
  'You may emit MULTIPLE actions (one per line) if the user asked for several things.',
  'All ids (task_id, event_id, installment_id, message_id, project_id, client_id) MUST come from the SKILL RESULTS block above. Never invent. If you cannot find a matching id, ASK the user to clarify instead of guessing.',
  '',
].join('\n');

/** Per-domain action menu — appended to each agent's prompt. Tells the
 *  agent which action kinds it can emit + their param contract.
 *
 *  When adding a destructive action (delete_*, etc.), also add a
 *  matching case to lib/agents/execute.ts and an entry to the
 *  SUPPORTED_KINDS allowlist in lib/agents/orchestrator.ts. The
 *  approval card in the UI is the user's safety net — never wire
 *  auto-execution for delete kinds. */
const ACTION_MENU_BY_DOMAIN: Record<string, string> = {
  tasks: [
    'Supported actions for this agent:',
    '  complete_task          task_id="<uuid>"',
    '  reopen_task            task_id="<uuid>"',
    '  start_task             task_id="<uuid>"',
    '  update_task_priority   task_id="<uuid>" priority="urgent|high|medium|low"',
    '  update_task_due_date   task_id="<uuid>" due_date="YYYY-MM-DD"',
    '  assign_task            task_id="<uuid>" assignee_id="<uuid>"',
    '  create_task            title="..." project_id="<uuid>?" client_id="<uuid>?" assignee_id="<uuid>?" due_date="YYYY-MM-DD?" priority="..."',
    '  create_task_group      title="<parent>" project_id="<uuid>?" client_id="<uuid>?" assignee_id="<uuid>?" due_date="YYYY-MM-DD?" priority="..." subtasks="Subtarea 1 | Subtarea 2 | Subtarea 3"',
    '    ↳ PREFER create_task_group whenever a request/plan/conversation implies SEVERAL related to-dos: emit ONE parent task with the rest as pipe-separated subtasks. NEVER spray many flat create_task — it clutters the board. Distribute work with assignee_id (a subtask may carry its own owner as "Título @<uuid>").',
    '  delete_task            task_id="<uuid>"   (DESTRUCTIVE — only emit when the user explicitly asked to delete)',
  ].join('\n'),
  finance: [
    'Supported actions for this agent:',
    '  mark_installment_paid    installment_id="<uuid>" paid_date="YYYY-MM-DD?"',
    '  mark_installment_pending installment_id="<uuid>"',
    '  create_expense           concept="..." amount="123.45" date="YYYY-MM-DD" category="..." status="paid|pending"',
    '  create_income            concept="..." total_amount="123.45" due_date="YYYY-MM-DD" client_id="<uuid>?" project_id="<uuid>?"',
    '  delete_expense           expense_id="<uuid>"   (DESTRUCTIVE)',
    '  delete_income            income_id="<uuid>"    (DESTRUCTIVE)',
  ].join('\n'),
  calendar: [
    'Supported actions for this agent:',
    '  reschedule_event       event_id="<uuid>" new_date="YYYY-MM-DD" new_time="HH:MM?"',
    '  cancel_event           event_id="<uuid>"',
    '  create_event           title="..." start_date="YYYY-MM-DD" start_time="HH:MM?" duration="60" type="meeting|call|work-block|deadline|note"',
    '  delete_event           event_id="<uuid>"   (DESTRUCTIVE — equivalent to cancel_event, prefer cancel)',
  ].join('\n'),
  inbox: [
    'Supported actions for this agent:',
    '  mark_message_done      message_id="<uuid>"',
    '  convert_to_task        message_id="<uuid>" task_title="..."',
    '  draft_reply            message_id="<uuid>" reply_body="..."',
  ].join('\n'),
  clients: [
    'Supported actions for this agent:',
    '  update_client_notes    client_id="<uuid>" notes="..."',
    '  create_client          name="..." email="..." company="..."',
    '  delete_client          client_id="<uuid>"   (DESTRUCTIVE — fails if the client has projects)',
  ].join('\n'),
  projects: [
    'Supported actions for this agent:',
    '  set_project_status     project_id="<uuid>" status="Active|Pending|Review|Completed|Archived"',
    '  set_project_deadline   project_id="<uuid>" deadline="YYYY-MM-DD"',
    '  create_project         title="..." client_id="<uuid>?" deadline="YYYY-MM-DD?"',
    '  delete_project         project_id="<uuid>"   (DESTRUCTIVE — fails if the project has open tasks)',
  ].join('\n'),
};

/** Compose the action protocol prompt for a specific agent. Returns the
 *  shared header + the per-domain menu. Agents include this at the end
 *  of their systemPrompt via:
 *      buildActionProtocol('tasks')
 */
export function buildActionProtocol(domain: string): string {
  const menu = ACTION_MENU_BY_DOMAIN[domain] || '';
  // Even agents without any write actions get the presentation guide —
  // it shapes how their READ-only replies look. Keeping the two
  // concerns in one function means every agent file picks up the
  // upgrade just by calling buildActionProtocol(domain).
  const action = menu ? `${ACTION_PROTOCOL_HEADER}${menu}` : '';
  return `${PRESENTATION_GUIDE}\n${action}`.trim();
}

/** Legacy export for back-compat with tasks-agent.ts. New agents should
 *  use buildActionProtocol(domain) so they get the right menu. */
export const ACTION_PROTOCOL_INSTRUCTIONS = buildActionProtocol('tasks');

/** Concrete action shape the orchestrator returns to the UI. */
export type ActionKind =
  // Tasks
  | 'complete_task' | 'reopen_task' | 'start_task'
  | 'update_task_priority' | 'update_task_due_date' | 'create_task'
  | 'create_task_group'
  | 'assign_task' | 'delete_task'
  // Finance
  | 'mark_installment_paid' | 'mark_installment_pending'
  | 'create_expense' | 'create_income'
  | 'delete_expense' | 'delete_income'
  // Calendar
  | 'reschedule_event' | 'cancel_event' | 'create_event'
  | 'delete_event'
  // Inbox
  | 'mark_message_done' | 'convert_to_task' | 'draft_reply'
  // Clients
  | 'update_client_notes' | 'create_client' | 'delete_client'
  // Projects
  | 'set_project_status' | 'set_project_deadline' | 'create_project'
  | 'delete_project';

export interface ProposedAction {
  kind: ActionKind;
  label: string;
  params: Record<string, string>;
}
