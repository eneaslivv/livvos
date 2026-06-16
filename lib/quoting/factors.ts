// ============================================================
// Quoting — pricing factors & constants (pure, no deps).
// Mirrors the seeded service_pricing.*_factor columns and the
// Livv pricing philosophy. Safe to import from browser or Deno.
// ============================================================

export const BRAND = { gold: '#C9A84C', dark: '#0A0A0A' } as const;

export const COMPLEXITY_FACTOR_KEYS = {
  simple: 'simple_factor',
  standard: 'standard_factor',
  advanced: 'advanced_factor',
  complex: 'complex_factor',
} as const;
export type Complexity = keyof typeof COMPLEXITY_FACTOR_KEYS;

export const MARKET_ADJUSTMENTS = { us: 1.0, latam: 0.55 } as const;
export type Market = keyof typeof MARKET_ADJUSTMENTS;

// Custom code / Shopify carry no premium; CMS platforms add config overhead.
export const CMS_PREMIUM: Record<string, number> = {
  custom: 0,
  shopify: 0,
  wordpress: 500,
  webflow: 500,
  framer: 500,
  squarespace: 500,
  wix: 500,
};

export const ANIMATION_MULTIPLIER = { none: 1.0, basic: 1.1, moderate: 1.2, advanced: 1.4 } as const;
export const DESIGN_MULTIPLIER = { template: 0.9, standard: 1.0, highEnd: 1.2, interactive: 1.4 } as const;

export const PRICING = {
  floor: 1500, // never quote a whole project below this
  defaultClientMarkup: 0.38, // Christie's reseller markup (suggestion; she adjusts per-item)
  consistencyThreshold: 0.2, // flag quotes >20% off historical average
} as const;

export const CUSTOM_REQUEST_STEPS = [
  'project_context',
  'scope_features',
  'design',
  'development',
  'review',
] as const;

export const CUSTOM_REQUEST_STATUSES = [
  'included',
  'extra',
  'needs_review',
  'out_of_scope',
  'technical_review',
  'design_review',
  'client_input',
  'future_phase',
] as const;

// Only these (with an approved price) flow into a proposal / onboarding.
export const BILLABLE_STATUSES = ['included', 'extra'] as const;

export const ONBOARDING_STAGES = [
  'kickoff',
  'assets_access',
  'strategy',
  'design',
  'development',
  'internal_review',
  'client_review',
  'prelaunch_launch',
  'post_launch_support',
] as const;

export const ONBOARDING_OWNER_ROLES = [
  'PM',
  'Design',
  'Development',
  'Content',
  'Client',
  'Technical Review',
  'Sales/Admin',
] as const;
