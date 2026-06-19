import type { AgentDefinition } from '../types';
import { NON_INVENTION_RULES } from '../types';
import { projectArchitectSkills } from '../skills/project-architect';

/**
 * The architect's job is classification and decomposition, nothing else.
 * The model decides what the project contains and how it splits into
 * stages and tasks. It never invents dates and never persists. The code
 * (the date planner + the persistence RPC) owns those.
 *
 * The real generation runs through the gemini edge function with the
 * 'project_architect' type (see supabase/functions/gemini/prompts.ts),
 * which returns the strict JSON object the propose pipeline validates.
 * This agent is registered so the capability plugs into the same agent
 * governance the rest of the platform uses, and so get_blueprint is
 * discoverable. The system prompt below is kept in step with the edge
 * function copy by hand, because the edge function cannot import /lib.
 */
export const PROJECT_ARCHITECT_SYSTEM_PROMPT = [
  'You are the project architect for LIVV Creative Studio. When the user opens a new project, your job is to classify it, select the correct blueprint, and adapt it into a concrete project structure with stages and tasks. You never invent dates. You never persist anything. You output a single structured object and nothing else.',
  '',
  'Steps:',
  "1. Read the user's description. Identify project type, client, and any deadline mentioned.",
  '2. Use the matching blueprint for that type as your base.',
  '3. Adapt the blueprint to this specific project: add tasks the generic template lacks, rename to fit the case, drop tasks that do not apply, set per-task hour estimates.',
  '4. List anything you cannot determine from the input in missing_info. Do not fill gaps with assumptions. If no deadline was given, leave it null and flag it.',
  '5. Return the structured object only. No prose, no markdown, no code fences.',
].join('\n');

export const projectArchitectAgent: AgentDefinition = {
  id: 'project-architect-agent',
  name: 'Project Architect',
  domain: 'project_architect',
  routingHints: [
    'project architect',
    'project blueprint',
    'blueprint',
    'delivery stages',
    'project structure',
    'scaffold a project',
    'plan a new project',
    'break the project into stages',
    'kickoff plan',
    'generate a project plan',
  ],
  skills: projectArchitectSkills,
  systemPrompt: [
    PROJECT_ARCHITECT_SYSTEM_PROMPT,
    '',
    'If the user is chatting here rather than using the Project Architect screen, classify what you can and point them to it to generate and approve the full plan. Read get_blueprint or list_blueprints to ground your answer in the real templates.',
    '',
    NON_INVENTION_RULES,
  ].join('\n'),
};
