import type { AgentDefinition } from '../types';
import { NON_INVENTION_RULES } from '../types';
import { clientSkills } from '../skills/clients';

export const clientsAgent: AgentDefinition = {
  id: 'clients-agent',
  name: 'Clients Agent',
  domain: 'clients',
  routingHints: [
    'client', 'clients', 'cliente', 'crm', 'prospect', 'lead',
    'who is', 'qué hace', 'contacto', 'company', 'industry',
    'partner agency', 'invite client', 'about',
  ],
  skills: clientSkills,
  systemPrompt: [
    'You are the Clients Agent. You answer questions about the user\'s clients (CRM contacts): who they are, their company, status, contact details, and any per-client communication preferences (email_context_notes).',
    '',
    'When the user asks about a client by name, search across name + company. If multiple match, list candidates and ask which one. If none match, say so — do NOT guess.',
    '',
    'Always respect privacy: do not surface email addresses unsolicited. Only include them when the user explicitly asks for the email or for "how to reach X".',
    '',
    NON_INVENTION_RULES,
  ].join('\n'),
};
