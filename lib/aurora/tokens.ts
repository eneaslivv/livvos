import type { AgentSlug, AgentMeta } from '../../types/aurora';
import type { CSSProperties } from 'react';

export const auroraAgents: Record<AgentSlug, AgentMeta> = {
  atlas: {
    slug: 'atlas',
    display_name: 'Atlas',
    tagline: 'The map that routes the work',
    domain: 'Orchestrator — routes to specialists',
    accent_hex: '#475569',
    accent_soft: '#E2E8F0',
    accent_text: '#0F172A',
    glyph: 'compass',
  },
  solara: {
    slug: 'solara',
    display_name: 'Solara',
    tagline: 'Closes deals like fine art',
    domain: 'Sales — leads, deals, outreach',
    accent_hex: '#E11D74',
    accent_soft: '#FCE7F3',
    accent_text: '#831843',
    glyph: 'spark',
  },
  marina: {
    slug: 'marina',
    display_name: 'Marina',
    tagline: 'Calm waters in the cashflow',
    domain: 'Finance — invoices, expenses, health',
    accent_hex: '#10B981',
    accent_soft: '#D1FAE5',
    accent_text: '#064E3B',
    glyph: 'droplet',
  },
  nova: {
    slug: 'nova',
    display_name: 'Nova',
    tagline: 'The signal in the noise',
    domain: 'Growth — funnel, sources, forecast',
    accent_hex: '#3B82F6',
    accent_soft: '#DBEAFE',
    accent_text: '#1E3A8A',
    glyph: 'pulse',
  },
  // ── Strategy Analyst ──────────────────────────────────────────
  // Watches drift between declared strategy (ICPs / packages /
  // positioning principles) and the leads/content actually flowing
  // through. Feeds the Studio with brand+ICP fusion.
  lumen: {
    slug: 'lumen',
    display_name: 'Lumen',
    tagline: 'The light on what to focus on',
    domain: 'Strategy — ICPs, packages, positioning',
    accent_hex: '#A855F7',
    accent_soft: '#F3E8FF',
    accent_text: '#581C87',
    glyph: 'star',
  },
  // ── Content Producer ─────────────────────────────────────────
  // Turns brand+ICP into V1/V2/V3 drafts across channels. Owns
  // cadence compliance, repurposing, and the Studio's "compose"
  // prompt pipeline.
  vega: {
    slug: 'vega',
    display_name: 'Vega',
    tagline: 'Voice with edge',
    domain: 'Content — channels, calendar, studio',
    accent_hex: '#F1ADD8',
    accent_soft: '#FCE7F3',
    accent_text: '#831843',
    glyph: 'pen',
  },
  // ── Daily Coach (Brief / Home / Calendar) ────────────────────
  // Morning synthesis, focus suggestion, capacity-aware
  // task triage. Lives on the daily-ritual surface.
  orion: {
    slug: 'orion',
    display_name: 'Orion',
    tagline: 'Pole star of the day',
    domain: 'Daily ops — brief, calendar, focus',
    accent_hex: '#0EA5E9',
    accent_soft: '#E0F2FE',
    accent_text: '#0C4A6E',
    glyph: 'pulse',
  },
  // ── Engagement Designer (Toolkit) ────────────────────────────
  // Picks the right framework for a client situation, scopes
  // hours, drafts deliverable shells + invoice drafts.
  iris: {
    slug: 'iris',
    display_name: 'Iris',
    tagline: 'Every angle, designed',
    domain: 'Toolkit — frameworks, engagements, deliverables',
    accent_hex: '#C4A35A',
    accent_soft: '#FEF3C7',
    accent_text: '#78350F',
    glyph: 'compass',
  },
};

export function cssVarsForAgent(slug: AgentSlug): CSSProperties {
  const a = auroraAgents[slug];
  return {
    // Custom CSS properties — cast because React.CSSProperties doesn't type them.
    ['--aurora-accent' as any]: a.accent_hex,
    ['--aurora-accent-soft' as any]: a.accent_soft,
    ['--aurora-accent-text' as any]: a.accent_text,
  };
}
