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
      return 'solara';

    // ── Communications inbox → Halo (triage) ─────────────────────
    // Halo owns inbox decisions; Solara takes over once a thread
    // becomes a sales conversation.
    case 'communications':
      return 'halo';

    // ── Finance → Marina ─────────────────────────────────────────
    case 'finance':
      return 'marina';

    // ── Growth / Analytics → Nova ─────────────────────────────────
    case 'growth_dashboard':
    case 'sales_analytics':
      return 'nova';

    // ── Strategy Hub → Lumen ─────────────────────────────────────
    case 'strategy_hub':
      return 'lumen';

    // ── Clients / CSM surfaces → Cobra ───────────────────────────
    // Cobra owns relationship health day-to-day. Lumen takes over
    // when the question is "is this the right ICP for us" (strategic).
    case 'clients':
    case 'team_clients':
      return 'cobra';

    // ── Content surfaces → Vega ──────────────────────────────────
    case 'content_engine':
    case 'content_cms':
    case 'docs':
      return 'vega';

    // ── Toolkit → Iris ───────────────────────────────────────────
    // Engagement design — frameworks, scoping, deliverables.
    case 'strategy_toolkit':
      return 'iris';

    // ── Products → Rune ──────────────────────────────────────────
    // Pricing strategist, tier design, embed conversion. Different
    // mental model from Iris (recurring SaaS vs done-with-you).
    case 'products':
      return 'rune';

    // ── Team scaling → Selva ─────────────────────────────────────
    case 'team_scaling':
    case 'team':
      return 'selva';

    // ── Master mode (platform admin) ─────────────────────────────
    // Pulse = product-side admin (tenant health across Payper customers).
    // Norte = STUDIO-side founder agent (portfolio of products, runway,
    //         lessons). When Eneas is in Master mode, the question is
    //         usually studio-level — default to Norte. Pulse stays
    //         accessible via the chip rail.
    case 'platform_admin':
      return 'norte';
    case 'platform_customers':
    case 'platform_roles':
    case 'platform_features':
    case 'platform_audit':
      return 'pulse';

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
  auroraAgents.orion,   // Daily ops — surfaced first because it's the morning default
  auroraAgents.lumen,   // Strategy
  auroraAgents.vega,    // Content
  auroraAgents.solara,  // Sales
  auroraAgents.halo,    // Communications
  auroraAgents.cobra,   // Clients
  auroraAgents.marina,  // Finance
  auroraAgents.nova,    // Growth
  auroraAgents.iris,    // Toolkit
  auroraAgents.rune,    // Products
  auroraAgents.selva,   // Team / Scaling
  auroraAgents.echo,    // Partners
  auroraAgents.pulse,   // Master / platform (product-side)
];

// livv OS — studio-level agents. Solo se renderean en el chip rail cuando
// el user es is_platform_admin. Server-side los gateía igual via guard.
export const livvStudioRegistry = [
  auroraAgents.norte,   // CEO / Manager del studio
  auroraAgents.tesoro,  // Finance del studio
  auroraAgents.pulso,   // Portfolio metrics
  auroraAgents.memoria, // Lessons / decision archive
];

// Used as a fallback when the response is unknown/garbled.
export const SAFE_FALLBACK = {
  agent: 'atlas' as AgentSlug,
  text: 'Se me trabó la idea. Repetímelo en una línea.',
  canvas: null,
};
