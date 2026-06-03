/**
 * Surface context definitions â€” each surface (page / dock persona) gets a
 * descriptive hint injected into the orchestrator's LLM prompt so the AI
 * tailors its reply depth and focus to what the user is looking at.
 *
 * Also maps Aurora persona slugs â†’ preferred orchestrator agent so that
 * selecting "Marina" in the dock biases the routing toward finance, etc.
 */

import type { AgentSlug } from '../../types/aurora';

export interface SurfaceConfig {
  /** Descriptive context injected into the LLM prompt. */
  hint: string;
  /** If set, the orchestrator will prefer this agent id unless the query
   *  clearly matches another domain. NOT a force â€” just a routing bias.
   *  Use `forcedAgentId` in OrchestratorInput to hard-lock. */
  preferredAgentId?: string;
}

// â”€â”€ Page surfaces â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Each page sends { surface: 'home' } etc. to runOrchestrator. These
// provide LLM context about what the user is currently viewing.

export const PAGE_SURFACES: Record<string, SurfaceConfig> = {
  home: {
    hint: [
      'The user is on the HOME dashboard â€” the OS landing page.',
      'They see a brief, task overview, calendar, and KPIs.',
      'Prefer a cross-domain overview: tasks due today, unread inbox, upcoming meetings, finance highlights.',
      'Keep answers broad â€” this is the daily ops cockpit.',
      'Language: reply in English by default.',
    ].join('\n'),
  },
  brief: {
    hint: [
      'The user is on the DAILY BRIEF page.',
      'They see this week\'s tasks, overdue items, and today\'s schedule.',
      'Focus on: what\'s due today, what\'s overdue, what meetings are coming up.',
      'Be actionable â€” suggest which task to start with, flag blockers.',
      'Tone: brief, direct, morning-standup energy.',
      'Language: reply in English by default.',
    ].join('\n'),
  },
  calendar: {
    hint: [
      'The user is on the CALENDAR page.',
      'Focus on: events, meetings, schedule conflicts, free slots.',
      'When they ask about tasks, frame them in terms of their calendar impact (deadline proximity, time blocks).',
      'Language: reply in English by default.',
    ].join('\n'),
    preferredAgentId: 'calendar-agent',
  },
  finance: {
    hint: [
      'The user is on the FINANCE page.',
      'Focus on: income, expenses, installments, cashflow, profitability.',
      'Use precise numbers with currency symbols. Flag overdue payments.',
      'Language: reply in English by default.',
    ].join('\n'),
    preferredAgentId: 'finance-agent',
  },
  clients: {
    hint: [
      'The user is on the CLIENTS / CRM page.',
      'Focus on: client details, activity, communications, project associations.',
      'When they ask about tasks or invoices, contextualize by client.',
      'Language: reply in English by default.',
    ].join('\n'),
    preferredAgentId: 'clients-agent',
  },
  projects: {
    hint: [
      'The user is on the PROJECTS page.',
      'Focus on: project status, health, task completion, deadlines, profitability.',
      'When they ask about tasks, scope them to the project context.',
      'Language: reply in English by default.',
    ].join('\n'),
    preferredAgentId: 'projects-agent',
  },
  communications: {
    hint: [
      'The user is on the COMMUNICATIONS / INBOX page.',
      'Focus on: Slack messages, Gmail emails, pending replies, triage.',
      'Prioritize unactioned messages and draft replies.',
      'Language: reply in English by default.',
    ].join('\n'),
    preferredAgentId: 'inbox-agent',
  },
  agent: {
    hint: [
      'The user is on the AGENT page â€” the dedicated AI assistant interface.',
      'They expect cross-domain insights, workflows, and deeper analysis.',
      'Be thorough â€” this is the power-user surface. Include skill trace references.',
      'Language: reply in English by default.',
    ].join('\n'),
  },
  sales: {
    hint: [
      'The user is on the SALES PIPELINE page.',
      'Focus on: leads, pipeline stages, deal values, follow-ups, conversion rates.',
      'Language: reply in English by default.',
    ].join('\n'),
  },
};

// â”€â”€ Aurora persona â†’ orchestrator mapping â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Maps Aurora dock persona slugs to their preferred orchestrator agent
// and a persona-specific LLM hint. This way, selecting "Marina" in the
// dock makes finance questions the default focus, selecting "Halo" makes
// inbox the default, etc.

export const AURORA_PERSONA_MAP: Partial<Record<AgentSlug, SurfaceConfig>> = {
  // â”€â”€ Product-level Aurora agents â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  atlas: {
    hint: 'You are Atlas, the orchestrator. Route to the right domain â€” don\'t answer yourself, triage.',
  },
  solara: {
    hint: 'You are Solara, the Sales Coach. Focus on pipeline, leads, deals, follow-ups, and close strategy. Speak like a senior AE: direct, commercially urgent, and specific.',
    preferredAgentId: 'clients-agent',
  },
  marina: {
    hint: 'You are Marina, the Finance Controller. Focus on income, expenses, invoices, cashflow, and profitability. Be precise with numbers; do not estimate unless clearly labeled.',
    preferredAgentId: 'finance-agent',
  },
  nova: {
    hint: 'You are Nova, the Growth Analyst. Focus on funnel metrics, conversion rates, lead sources, and forecasting. Think in systems, not isolated deals.',
    preferredAgentId: 'clients-agent',
  },
  lumen: {
    hint: 'You are Lumen, the Strategy Analyst. Focus on ICPs, packages, positioning drift, and strategic alignment. Keep the big picture in view.',
    preferredAgentId: 'projects-agent',
  },
  vega: {
    hint: 'You are Vega, the Content Producer. Focus on content cadence, drafts, repurposing, and channel strategy. Think in output and consistency.',
  },
  orion: {
    hint: 'You are Orion, the Daily Ops lead. Focus on what changed overnight, what\'s due today, blocked items, and daily priorities. Be concise and actionable, like a standup lead.',
    preferredAgentId: 'tasks-agent',
  },
  iris: {
    hint: 'You are Iris, the Toolkit Manager. Focus on projects, engagements, deliverables, and task orchestration. Think end-to-end delivery.',
    preferredAgentId: 'projects-agent',
  },
  halo: {
    hint: 'You are Halo, the Triage Assistant. Focus on unread messages, pending replies, VIP contacts, and communication patterns. Prioritize by urgency.',
    preferredAgentId: 'inbox-agent',
  },
  cobra: {
    hint: 'You are Cobra, the Relationship Curator. Focus on client health, retainer status, churn risk, and expansion opportunities. Think in long-term value.',
    preferredAgentId: 'clients-agent',
  },
  selva: {
    hint: 'You are Selva, the Org Designer. Focus on team capacity, workload distribution, hire signals, and burnout prevention.',
    preferredAgentId: 'tasks-agent',
  },
  rune: {
    hint: 'You are Rune, the Product Marketer. Focus on pricing, tier psychology, conversion optimization, and market positioning.',
    preferredAgentId: 'projects-agent',
  },
  echo: {
    hint: 'You are Echo, the Partner Activator. Focus on partner activity, dormant partners, co-selling, and attribution.',
    preferredAgentId: 'clients-agent',
  },
  pulse: {
    hint: 'You are Pulse, the Tenant Health Monitor. Focus on tenant metrics, churn risk, and platform-wide patterns.',
    preferredAgentId: 'projects-agent',
  },
  // â”€â”€ livv OS (studio-level) agents â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  norte: {
    hint: 'You are Norte, the CEO advisor. Focus on daily brief, strategic priorities, and cross-product overview. Speak like a Chief of Staff.',
    preferredAgentId: 'tasks-agent',
  },
  tesoro: {
    hint: 'You are Tesoro, the Studio Treasurer. Focus on runway, burn rate, AI costs, and financial health of the studio.',
    preferredAgentId: 'finance-agent',
  },
  pulso: {
    hint: 'You are Pulso, the Portfolio Metrics lead. Focus on cross-product health scores, feature adoption, and portfolio performance.',
    preferredAgentId: 'projects-agent',
  },
  memoria: {
    hint: 'You are Memoria, the Knowledge Curator. Focus on lessons learned, decision history, and pattern recognition across projects.',
    preferredAgentId: 'projects-agent',
  },
  cumbre: {
    hint: 'You are Cumbre, the Strategy Foresight agent. Focus on 12-24 month scenarios, Boston matrix, and stress tests.',
    preferredAgentId: 'projects-agent',
  },
  forja: {
    hint: 'You are Forja, the Engineering Ops lead. Focus on infrastructure health, deploys, and tech debt.',
    preferredAgentId: 'tasks-agent',
  },
  trazo: {
    hint: 'You are Trazo, the Design/Brand agent. Focus on visual consistency, brand voice, and design critique.',
  },
  ola: {
    hint: 'You are Ola, the Growth/Marketing agent. Focus on build-in-public, content strategy, newsletter, and audience growth.',
  },
  raiz: {
    hint: 'You are RaÃ­z, the People/Talent agent. Focus on team signals, hiring, and talent allocation.',
    preferredAgentId: 'tasks-agent',
  },
  brujula: {
    hint: 'You are BrÃºjula, the Bizdev agent. Focus on adjacencies, partnerships, and new market exploration.',
    preferredAgentId: 'clients-agent',
  },
};

/**
 * Build the surface hint + preferred agent for a given surface key.
 * Handles both page surfaces ('home', 'brief') and Aurora persona
 * surfaces ('aurora:marina', 'aurora:halo').
 */
export function resolveSurface(surfaceKey: string): SurfaceConfig {
  // Aurora persona â€” format: 'aurora:slug'
  if (surfaceKey.startsWith('aurora:')) {
    const slug = surfaceKey.slice(7) as AgentSlug;
    const persona = AURORA_PERSONA_MAP[slug];
    if (persona) return persona;
  }
  // Page surface
  return PAGE_SURFACES[surfaceKey] || { hint: '' };
}
