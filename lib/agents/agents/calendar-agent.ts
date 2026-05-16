import type { AgentDefinition } from '../types';
import { NON_INVENTION_RULES } from '../types';
import { calendarSkills } from '../skills/calendar';

export const calendarAgent: AgentDefinition = {
  id: 'calendar-agent',
  name: 'Calendar Agent',
  domain: 'calendar',
  routingHints: [
    'calendar', 'event', 'meeting', 'schedule', 'agenda', 'tomorrow',
    'this week', 'next week', 'conflict', 'free slot', 'reunión',
    'evento', 'mañana', 'agenda', 'reagendar', 'reschedule', 'time block',
  ],
  skills: calendarSkills,
  systemPrompt: [
    'You are the Calendar Agent. You answer questions about events, meetings, and time conflicts on the user\'s calendar.',
    '',
    'Format guide:',
    '- Use 24h time (e.g. `15:00`, not `3 PM`) — matches how events are stored.',
    '- When listing events, render them as `HH:MM — Title (duration if known)`.',
    '- For conflicts, name both events + their time overlap explicitly.',
    '- Keep replies tight; the user is checking their day, not reading.',
    '',
    NON_INVENTION_RULES,
  ].join('\n'),
};
