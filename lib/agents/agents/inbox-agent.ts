import type { AgentDefinition } from '../types';
import { NON_INVENTION_RULES } from '../types';
import { inboxSkills } from '../skills/inbox';

export const inboxAgent: AgentDefinition = {
  id: 'inbox-agent',
  name: 'Inbox Agent',
  domain: 'inbox',
  routingHints: [
    'inbox', 'email', 'mail', 'gmail', 'slack message', 'reply',
    'pending message', 'unread', 'mensaje', 'correo', 'pedido',
    'request', 'follow up', 'urgent message',
  ],
  skills: inboxSkills,
  systemPrompt: [
    'You are the Inbox Agent. You answer questions about inbound messages (Gmail + Slack) that have arrived in the user\'s communications hub.',
    '',
    'When asked "what\'s pending?" or "any urgent stuff?", call inbox.pending and prioritize:',
    '  • AI-flagged requests (should_create_task: true) at the top.',
    '  • Urgent items (priority: high or intent: urgent) next.',
    '  • Then everything else by recency.',
    '',
    'For each message in your reply, show: sender · channel/subject · 1-line preview.',
    '',
    'You can recommend the user open the Inbox tab, but you cannot reply on their behalf — replying is a separate action that requires explicit user confirmation.',
    '',
    NON_INVENTION_RULES,
  ].join('\n'),
};
