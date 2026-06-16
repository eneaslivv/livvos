// ============================================================
// Quoting — pricing_snapshot builder (pure).
// Produces the jsonb stored on proposals.pricing_snapshot and
// folds approved custom requests in.
// ============================================================

import { BILLABLE_STATUSES } from './factors';
import { totals } from './calculator';
import type { LineItem, PricingSnapshot, CustomRequestLike } from './types';

export function buildLineItem(input: {
  name: string;
  description?: string;
  livvPrice?: number;
  clientPrice?: number | null;
  complexity?: string;
  timeline?: string;
  source?: LineItem['source'];
  bullets?: string[];
}): LineItem {
  return {
    name: input.name,
    description: input.description ?? '',
    livv: Number(input.livvPrice ?? 0),
    client: input.clientPrice == null ? null : Number(input.clientPrice),
    complexity: input.complexity ?? 'standard',
    timeline: input.timeline ?? '',
    source: input.source ?? 'catalog',
    bullets: input.bullets ?? [],
  };
}

export function buildPricingSnapshot(
  lineItems: LineItem[] = [],
  opts: { currency?: string; options?: unknown } = {}
): PricingSnapshot {
  const t = totals(lineItems.map((i) => ({ livvPrice: i.livv, clientPrice: i.client ?? 0 })));
  const snapshot: PricingSnapshot = {
    items: lineItems,
    totals: { livv: t.livv, client: t.client },
    currency: opts.currency ?? 'USD',
  };
  if (opts.options) snapshot.options = opts.options;
  return snapshot;
}

export function buildTimeline(estimate: string, stages: unknown[] = []) {
  return { estimate, stages };
}

function labelFor(cr: CustomRequestLike): string {
  if (cr.affected_modules?.length) {
    return cr.affected_modules.slice(0, 2).map((m) => m.replace(/_/g, ' ')).join(' + ');
  }
  const src = cr.client_facing_note || cr.original_text || 'Custom request';
  return src.length > 60 ? `${src.slice(0, 57)}…` : src;
}

/** Only included|extra with an approved_price reach the proposal. */
export function mergeCustomRequestsIntoSnapshot(
  snapshot: PricingSnapshot,
  customRequests: CustomRequestLike[] = []
): PricingSnapshot {
  const billable = customRequests.filter(
    (cr) => BILLABLE_STATUSES.includes(cr.status as (typeof BILLABLE_STATUSES)[number]) && cr.approved_price != null
  );
  const extras = billable.map((cr) =>
    buildLineItem({
      name: labelFor(cr),
      description: cr.client_facing_note || '',
      livvPrice: Number(cr.approved_price),
      clientPrice: null,
      complexity: cr.complexity || 'standard',
      source: 'custom_request',
    })
  );
  const items = [...(snapshot.items || []), ...extras];
  return buildPricingSnapshot(items, { currency: snapshot.currency || 'USD', options: snapshot.options });
}
