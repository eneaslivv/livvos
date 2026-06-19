/**
 * Agent + skill registry — single source of truth for which agents
 * exist and what skills they own. Imported by the orchestrator and by
 * any UI surface that wants to render the agent picker.
 */

import type { AgentDefinition, Skill } from './types';

import { tasksAgent }       from './agents/tasks-agent';
import { financeAgent }    from './agents/finance-agent';
import { calendarAgent }   from './agents/calendar-agent';
import { clientsAgent }    from './agents/clients-agent';
import { projectsAgent }   from './agents/projects-agent';
import { inboxAgent }      from './agents/inbox-agent';
import { onboardingAgent } from './agents/onboarding-agent';
import { projectArchitectAgent } from './agents/project-architect-agent';

export const AGENTS: AgentDefinition[] = [
  tasksAgent,
  financeAgent,
  calendarAgent,
  clientsAgent,
  projectsAgent,
  inboxAgent,
  onboardingAgent,
  projectArchitectAgent,
];

export const AGENT_BY_ID = new Map(AGENTS.map(a => [a.id, a]));
export const AGENT_BY_DOMAIN = new Map(AGENTS.map(a => [a.domain, a]));

/** Flat skill lookup — `id → skill`. Useful for direct skill invocation
 *  from non-LLM call sites (e.g. a Home widget that just wants
 *  `tasks.list_open_for_me` without going through an agent). */
export const SKILL_BY_ID = new Map<string, Skill>();
for (const agent of AGENTS) {
  for (const skill of agent.skills) {
    SKILL_BY_ID.set(skill.id, skill);
  }
}

/** Pretty list of every skill in the system — surfaced to the user in
 *  the agents settings page so they can audit what the AI can do. */
export const skillCatalog = (): Array<{
  agentName: string;
  agentDomain: string;
  skillId: string;
  description: string;
  kind: 'read' | 'write';
}> => {
  const out: any[] = [];
  for (const a of AGENTS) {
    for (const s of a.skills) {
      out.push({
        agentName: a.name,
        agentDomain: a.domain,
        skillId: s.id,
        description: s.description,
        kind: s.kind,
      });
    }
  }
  return out;
};
