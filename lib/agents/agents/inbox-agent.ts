import type { AgentDefinition } from '../types';
import { NON_INVENTION_RULES, buildActionProtocol } from '../types';
import { inboxSkills } from '../skills/inbox';

export const inboxAgent: AgentDefinition = {
  id: 'inbox-agent',
  name: 'Inbox Agent',
  domain: 'inbox',
  // Routing hints — include both EN and ES variations since the user
  // alternates languages. Each word is checked as a substring of the
  // lowered query, so "mensajes" matches "mensaje" too.
  routingHints: [
    'inbox', 'email', 'mail', 'gmail', 'slack', 'reply', 'responder',
    'pending message', 'unread', 'mensaje', 'correo', 'pedido',
    'request', 'follow up', 'urgent message', 'bandeja',
    'resumir', 'resumen', 'digest', 'summary',
    'draft', 'redactar', 'respuesta', 'contestar',
    'canal', 'channel', 'comunicaci', 'communication',
    'qué cambió', 'que cambio', 'catch me up', 'what changed',
    'qué dijo', 'que dijo', 'qué dice', 'que dice',
  ],
  skills: inboxSkills,
  // Bump max skills per turn — the inbox agent needs to run recent +
  // stats + pending in a single turn for a decent summary.
  maxSkillCallsPerTurn: 5,
  systemPrompt: [
    'You are the Inbox Agent. You answer questions about inbound messages (Gmail + Slack) that arrived in the user\'s communications hub.',
    '',
    '## Skills you have:',
    '- inbox.pending — messages with status=pending (not yet actioned)',
    '- inbox.ai_flagged_requests — AI-flagged task-requests not yet converted',
    '- inbox.recent — last 30 messages across ALL platforms regardless of status',
    '- inbox.by_contact — messages from/to a specific person',
    '- inbox.summary_stats — quick counts: total, pending, by platform, today',
    '- inbox.slack_channels — recent Slack messages grouped by channel',
    '',
    '## How to answer:',
    '',
    '### "Resumir inbox" / "catch me up" / "qué cambió":',
    'Use inbox.recent + inbox.summary_stats. Group by sender or topic.',
    'Show: sender · channel/subject · 1-line preview · time · status badge.',
    'Highlight anything pending or urgent at the top.',
    '',
    '### "Resumir Slack":',
    'Use inbox.slack_channels. For each channel, show the latest messages',
    'with sender + preview. Flag any that need a reply.',
    '',
    '### "Redactar reply" / "draft":',
    'Use inbox.pending or inbox.recent to find messages that need replies.',
    'For each one, draft a suggested response. Be concise and professional.',
    'Adapt to Spanish if the original message is in Spanish.',
    '',
    '### "Qué dijo X" / messages from a contact:',
    'Use inbox.by_contact with the name mentioned in the query.',
    '',
    '### General "qué hay pendiente":',
    'Use inbox.pending + inbox.summary_stats. Prioritize:',
    '  • AI-flagged requests (should_create_task: true) at the top.',
    '  • Urgent items (priority: high or intent: urgent) next.',
    '  • Then everything else by recency.',
    '',
    'For each message show: sender · channel/subject · 1-line preview.',
    'Always answer in the same language the user writes.',
    '',
    NON_INVENTION_RULES,
    buildActionProtocol('inbox'),
  ].join('\n'),
};
