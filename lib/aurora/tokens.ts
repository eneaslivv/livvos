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
  // ── Triage Assistant (Communications / Inbox) ────────────────
  // Categorizes inbound across Gmail / Slack / leads inbox, drafts
  // replies in voice, flags VIPs, predicts response priority from
  // sender history + sentiment. Spots clusters ("3 different people
  // asked the same thing this week → content opportunity").
  halo: {
    slug: 'halo',
    display_name: 'Halo',
    tagline: 'Triage with intent',
    domain: 'Communications — inbox, triage, replies',
    accent_hex: '#06B6D4',
    accent_soft: '#CFFAFE',
    accent_text: '#155E75',
    glyph: 'mail',
  },
  // ── Relationship Curator (Clients / CSM) ─────────────────────
  // Watches the health of every retainer client — response time
  // trends, sentiment in messages, NPS prediction, expansion
  // signals. Knows the patterns that precede churn 4-6 weeks out.
  cobra: {
    slug: 'cobra',
    display_name: 'Cobra',
    tagline: 'Reads the room early',
    domain: 'Clients — relationships, health, expansion',
    accent_hex: '#0D9488',
    accent_soft: '#CCFBF1',
    accent_text: '#134E4A',
    glyph: 'heart',
  },
  // ── Org Designer (TeamScaling) ───────────────────────────────
  // Capacity heatmaps, burnout signal detection, comp benchmarking,
  // when-to-hire forecasting based on revenue/cost projection. Knows
  // the founder-bottleneck pattern by heart.
  selva: {
    slug: 'selva',
    display_name: 'Selva',
    tagline: 'Builds teams that breathe',
    domain: 'Scaling — roles, capacity, hiring roadmap',
    accent_hex: '#92400E',
    accent_soft: '#FED7AA',
    accent_text: '#7C2D12',
    glyph: 'tree',
  },
  // ── Product Marketer (Products marketplace) ──────────────────
  // Pricing benchmarks, tier psychology, embed widget conversion,
  // upsell signal detection. Spots when a product is under-priced
  // or when a tier needs splitting/merging.
  rune: {
    slug: 'rune',
    display_name: 'Rune',
    tagline: 'Price like you mean it',
    domain: 'Products — pricing, tiers, conversion',
    accent_hex: '#6366F1',
    accent_soft: '#E0E7FF',
    accent_text: '#3730A3',
    glyph: 'rune',
  },
  // ── Partner Activator (Partners portal) ──────────────────────
  // Surfaces dormant partners, identifies who refers high-LTV
  // leads, drafts re-engagement outreach, tracks attribution decay.
  // Knows that partner-of-the-month is a 6-7x ROI lever.
  echo: {
    slug: 'echo',
    display_name: 'Echo',
    tagline: 'Amplifies the right voice',
    domain: 'Partners — referrals, activation, attribution',
    accent_hex: '#F97316',
    accent_soft: '#FED7AA',
    accent_text: '#9A3412',
    glyph: 'megaphone',
  },
  // ── Tenant Health Monitor (Master mode) ──────────────────────
  // Cross-tenant churn prediction, expansion signals, usage decay
  // patterns. Sees the platform from above — knows that a tenant
  // dropping 60% activity in week 4 has 73% churn probability if
  // not intervened by week 6.
  pulse: {
    slug: 'pulse',
    display_name: 'Pulse',
    tagline: 'Reads the platform',
    domain: 'Master — tenant health, churn, expansion',
    accent_hex: '#64748B',
    accent_soft: '#E2E8F0',
    accent_text: '#1E293B',
    glyph: 'activity',
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
