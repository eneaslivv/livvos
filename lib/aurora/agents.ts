import type { AgentSlug } from '../../types/aurora';
import { auroraAgents } from './tokens';

export type PageMap = string;

/**
 * Picks the default agent for a given Livv page. Used by AuroraFab when the
 * user opens the dock for the first time on a page.
 */
export function defaultAgentForPage(page: PageMap | undefined): AgentSlug {
  if (!page) return 'orion';
  // Mirrors the routing rules in agents/atlas.md — extended for the
  // 4 new specialists (Lumen / Vega / Orion / Iris).
  switch (page) {
    // ── Sales surfaces → Solara ───────────────────────────────────
    case 'sales_dashboard':
    case 'sales_leads':
    case 'sales_pipeline':
    case 'communications':
      return 'solara';

    // ── Finance → Marina ─────────────────────────────────────────
    case 'finance':
      return 'marina';

    // ── Growth / Analytics → Nova ─────────────────────────────────
    case 'growth_dashboard':
    case 'sales_analytics':
      return 'nova';

    // ── Strategy → Lumen ──────────────────────────────────────────
    // Strategy Hub + Clients (CRM at strategic level) get Lumen as
    // the default — she's the one watching ICP/package/positioning
    // drift.
    case 'strategy_hub':
    case 'clients':
    case 'team_clients':
      return 'lumen';

    // ── Content surfaces → Vega ──────────────────────────────────
    case 'content_engine':
    case 'content_cms':
    case 'docs':
      return 'vega';

    // ── Toolkit / Products → Iris ────────────────────────────────
    // Engagement design — frameworks, scoping, deliverables. Also
    // covers Products because productized services + engagements are
    // the same mental model.
    case 'strategy_toolkit':
    case 'products':
      return 'iris';

    // ── Daily ops → Orion ────────────────────────────────────────
    // Home, Brief, Calendar, Activity — anything that lives on the
    // morning ritual / "what's today" surface.
    case 'home':
    case 'brief':
    case 'calendar':
    case 'activity':
      return 'orion';

    // ── Agent page → Atlas (orchestrator) ────────────────────────
    case 'agent':
      return 'atlas';

    default:
      return 'orion';
  }
}

export const auroraRegistry = [
  auroraAgents.solara,
  auroraAgents.marina,
  auroraAgents.nova,
  auroraAgents.lumen,
  auroraAgents.vega,
  auroraAgents.orion,
  auroraAgents.iris,
];

// Used as a fallback when the response is unknown/garbled.
export const SAFE_FALLBACK = {
  agent: 'atlas' as AgentSlug,
  text: 'Se me trabó la idea. Repetímelo en una línea.',
  canvas: null,
};
