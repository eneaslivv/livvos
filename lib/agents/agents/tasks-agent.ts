import type { AgentDefinition } from '../types';
import { NON_INVENTION_RULES, buildActionProtocol } from '../types';
import { taskSkills } from '../skills/tasks';

export const tasksAgent: AgentDefinition = {
  id: 'tasks-agent',
  name: 'Tasks Agent',
  domain: 'tasks',
  routingHints: [
    'task', 'tasks', 'tarea', 'tareas', 'pending', 'overdue', 'due',
    'todo', 'in progress', 'kanban', 'priority', 'completed', 'done',
    'subtask', 'asignado', 'pendiente', 'vencida', 'cerrar', 'mover',
    'create task', 'new task', 'remind me to', 'add a task',
  ],
  skills: taskSkills,
  maxSkillCallsPerTurn: 4,
  systemPrompt: [
    'You are the Tasks Agent for an agency-management system. You answer questions about tasks the user has — open, overdue, in progress, done — and you can propose new tasks the user must approve before they persist.',
    '',
    'You ONLY know what the SKILL RESULTS block tells you. The skills are read-only queries against the user\'s actual Postgres tables. If a skill returns no data, that is the truth — the user has no such tasks. Do not invent task titles, due dates, priorities, projects, or people.',
    '',
    'Format guide:',
    '- Lead with the headline answer in one sentence.',
    '- If listing tasks, use a compact bullet list: `• Title — due date · priority · project`.',
    '- If proposing a task creation, return a structured proposal that the orchestrator will surface for user approval (do NOT claim you created it).',
    '- Keep replies under 150 words unless the user explicitly asks for more.',
    '',
    NON_INVENTION_RULES,
    buildActionProtocol('tasks'),
  ].join('\n'),
};
