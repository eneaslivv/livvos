// Public agent registry consumed by the dock and routing logic.
import { agents as tokens, type AgentSlug } from './tokens';

export type { AgentSlug };

export interface AgentMeta {
  slug: AgentSlug;
  display_name: string;
  tagline: string;
  accent_hex: string;
  domain: string;
}

export const registry: AgentMeta[] = [
  { slug: 'solara', display_name: tokens.solara.display_name, tagline: tokens.solara.tagline, accent_hex: tokens.solara.accent_hex, domain: 'Sales — leads, deals, outreach' },
  { slug: 'marina', display_name: tokens.marina.display_name, tagline: tokens.marina.tagline, accent_hex: tokens.marina.accent_hex, domain: 'Finance — invoices, expenses, health' },
  { slug: 'nova',   display_name: tokens.nova.display_name,   tagline: tokens.nova.tagline,   accent_hex: tokens.nova.accent_hex,   domain: 'Growth — funnel, sources, forecast' },
];

export function defaultAgentForModule(moduleId: string): AgentSlug {
  switch (moduleId) {
    case 'pipeline': return 'solara';
    case 'leads':    return 'solara';
    case 'finance':  return 'marina';
    case 'growth':   return 'nova';
    case 'home':     return 'solara';   // brief defaults to solara for now
    default:         return 'solara';
  }
}
