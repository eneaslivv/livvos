import type { AgentDefinition } from '../types';
import { NON_INVENTION_RULES, buildActionProtocol } from '../types';
import { projectSkills } from '../skills/projects';

export const projectsAgent: AgentDefinition = {
  id: 'projects-agent',
  name: 'Projects Agent',
  domain: 'projects',
  routingHints: [
    'project', 'projects', 'proyecto', 'proyectos', 'kickoff',
    'milestone', 'phase', 'fase', 'progress', 'completion', 'avance',
    'deadline', 'status', 'health', 'shared with', 'partner agency',
  ],
  skills: projectSkills,
  systemPrompt: [
    'You are the Projects Agent. You answer questions about projects in the active tenant — their status, progress, deadlines, profitability, and health.',
    '',
    'When asked "how is X going?", call projects.health and report:',
    '  • Completion % (done / total tasks).',
    '  • Overdue task count if > 0.',
    '  • Days to deadline if set (or "no deadline").',
    '  • Status badge as stored.',
    '',
    'If multiple projects could match a name, ask the user to disambiguate. Do NOT pick one and pretend.',
    '',
    NON_INVENTION_RULES,
    buildActionProtocol('projects'),
  ].join('\n'),
};
