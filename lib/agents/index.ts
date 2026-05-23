/**
 * Public API for the agent system. Anywhere in the app that wants to
 * call the AI through a structured agent goes through these exports.
 *
 *   import { runOrchestrator, SKILL_BY_ID } from '@/lib/agents';
 *
 * Direct skill invocation (when you don't need the LLM — e.g. a Home
 * widget just rendering "open tasks for me"):
 *
 *   const skill = SKILL_BY_ID.get('tasks.list_open_for_me');
 *   const result = await skill.run({}, { db: supabase, tenantId, userId });
 *
 * LLM-mediated (when the user asks something free-form):
 *
 *   const out = await runOrchestrator({
 *     query: 'what should I prioritize today?',
 *     ctx: { db: supabase, tenantId, userId },
 *   });
 *
 * See README.md in this folder for the full architecture.
 */

export {
  runOrchestrator,
  AGENTS,
  AGENT_BY_ID,
  SKILL_BY_ID,
  skillCatalog,
} from './orchestrator';

export type {
  AgentDefinition,
  Skill,
  SkillResult,
  ExecutionContext,
  OrchestratorInput,
  OrchestratorOutput,
  ProposedAction,
} from './types';

// Memory layer — conversation log, feedback signals, user profile
export {
  recordFeedback,
  fetchFeedbackStats,
  detectReAsk,
  detectRephrase,
  getUserProfile,
  saveUserProfile,
  formatProfileForPrompt,
  fetchRecentTurns,
  logConversationTurn,
} from './memory';
export type {
  FeedbackSignal,
  UserProfile,
} from './memory';

// Critique layer — offline analysis of recent conversations
export { runCritique } from './critique/critique-agent';

// Prompt-tuner — proposes per-tenant tweaks to routing hints +
// system prompts based on actual agent performance.
export { runPromptTuner } from './critique/prompt-tuner';
export type { PromptTunerProposal, RunPromptTunerArgs, RunPromptTunerResult } from './critique/prompt-tuner';

// Runtime overrides — applied by the orchestrator on every turn.
export { invalidateOverridesCache } from './overrides';
export type { ActiveOverride } from './overrides';

// Surface context — maps page/persona → LLM hint + preferred agent
export { resolveSurface, PAGE_SURFACES, AURORA_PERSONA_MAP } from './surfaces';
export type { SurfaceConfig } from './surfaces';

// Action executor — single dispatcher for every ProposedAction kind
export { executeProposedAction } from './execute';
export type { ExecuteResult, ExecutorHelpers } from './execute';
