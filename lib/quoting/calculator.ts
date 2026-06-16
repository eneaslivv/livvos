// ============================================================
// Quoting — pricing calculator (pure).
// Reference points, not rigid rules — the quoting agent still
// applies judgment on top. Used by the UI for live recompute.
// ============================================================

import {
  COMPLEXITY_FACTOR_KEYS,
  MARKET_ADJUSTMENTS,
  CMS_PREMIUM,
  ANIMATION_MULTIPLIER,
  DESIGN_MULTIPLIER,
  PRICING,
  type Complexity,
  type Market,
} from './factors';
import type { ServicePricing, PriceResult } from './types';

const round5 = (n: number) => Math.round(n / 5) * 5;

export function complexityFactor(service: ServicePricing, complexity: Complexity = 'standard'): number {
  const key = COMPLEXITY_FACTOR_KEYS[complexity] || COMPLEXITY_FACTOR_KEYS.standard;
  const f = Number((service as unknown as Record<string, unknown>)[key]);
  return Number.isFinite(f) && f > 0 ? f : 1.0;
}

export interface CalcOptions {
  complexity?: Complexity;
  market?: Market;
  cms?: keyof typeof CMS_PREMIUM | string;
  animation?: keyof typeof ANIMATION_MULTIPLIER;
  design?: keyof typeof DESIGN_MULTIPLIER;
  clientMarkup?: number;
  applyFloor?: boolean;
}

export function calculatePrice(service: ServicePricing, opts: CalcOptions = {}): PriceResult {
  const {
    complexity = (service.complexity as Complexity) || 'standard',
    market = 'us',
    cms = 'custom',
    animation = 'none',
    design = 'standard',
    clientMarkup = PRICING.defaultClientMarkup,
    applyFloor = false,
  } = opts;

  const base = Number(service.fixed_price ?? service.hourly_rate ?? 0);
  const factor = complexityFactor(service, complexity);
  const marketAdj = MARKET_ADJUSTMENTS[market] ?? 1.0;
  const cmsPremium = CMS_PREMIUM[cms] ?? 0;
  const animMult = ANIMATION_MULTIPLIER[animation] ?? 1.0;
  const designMult = DESIGN_MULTIPLIER[design] ?? 1.0;

  let livv = (base * factor * animMult * designMult + cmsPremium) * marketAdj;
  livv = round5(livv);
  if (applyFloor) livv = Math.max(livv, PRICING.floor);

  const suggestedClientPrice = round5(livv * (1 + clientMarkup));

  return {
    livvPrice: livv,
    suggestedClientPrice,
    breakdown: { base, factor, complexity, marketAdj, market, cmsPremium, cms, animMult, designMult },
  };
}

/** Simple + Premium options to anchor a new-client conversation. */
export function twoOptions(service: ServicePricing, opts: CalcOptions = {}) {
  return {
    simple: calculatePrice(service, { ...opts, complexity: 'simple', animation: 'basic', design: 'standard', applyFloor: true }),
    premium: calculatePrice(service, { ...opts, complexity: 'advanced', animation: 'advanced', design: 'highEnd', applyFloor: true }),
  };
}

export function totals(lineItems: Array<{ livvPrice?: number; livv?: number; clientPrice?: number; client?: number }> = []) {
  const livv = lineItems.reduce((s, i) => s + Number(i.livvPrice ?? i.livv ?? 0), 0);
  const client = lineItems.reduce((s, i) => s + Number(i.clientPrice ?? i.client ?? 0), 0);
  return { livv: round5(livv), client: round5(client) };
}

/** Loose money parse: "$2,500" | "2500" | 2500 -> 2500. */
export function parseMoney(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}
