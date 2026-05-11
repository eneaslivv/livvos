import type { ProposalDocumentData, ProposalTier, ProposalAddon, ProposalPhase, ProposalPillar, ProposalTerm, ProposalPaymentMilestone } from './ProposalDocumentView';

/* ──────────────────────────────────────────────────────────────────────
 * buildProposalDocumentData
 *
 * Adapts a DB `proposals` row into the shape the
 * `ProposalDocumentView` design expects.
 *
 * The view supports a much richer document than the current schema
 * carries on dedicated columns. Rather than migrate, we read the
 * structured payload from `pricing_snapshot` (a jsonb column that
 * already exists) under a `document` key.
 *
 * Shape the AI generator should populate (all optional — the adapter
 * derives sensible defaults from the proposal's other fields when a
 * piece is missing):
 *
 *   pricing_snapshot.document = {
 *     proposalNumber: "WDX-2026-014",
 *     heroEyebrow: "...",
 *     contextLead: ["paragraph 1...", "paragraph 2..."],
 *     contextQuote: { text: "...", attribution: "Initial brief" },
 *     pillars: [{ num: "01 — Velocity", title: "...", body: "..." }, ...],
 *     phasesHeading: "Four phases.",
 *     phasesSubheading: "Ten weeks.",
 *     phasesBlurb: "...",
 *     phases: [{ num: "01", name: "Discovery", duration: "2 wks",
 *                deliverables: ["...", "..."] }, ...],
 *     tiers: [{ id: "normal", name: "Normal", amount: 14500,
 *               duration: "6 weeks · 2 phases",
 *               description: "...",
 *               featured: false, recommended: false,
 *               features: [{ label: "...", included: true }, ...] }, ...],
 *     addons: [{ id: "motion", title: "Motion + microinteractions",
 *                subtitle: "Hover states, page transitions, GSAP scroll",
 *                price: 2400 }, ...],
 *     payments: [{ pct: 40, when: "On signing", desc: "..." }, ...],
 *     terms: [{ num: "01 — IP", title: "...", body: "..." }, ...]
 *   }
 *
 * If `document` is absent, we fall back to a single-tier view built
 * from `proposal.title`, `proposal.pricing_total`, `proposal.timeline`
 * etc. — the existing AI flow already populates those.
 * ────────────────────────────────────────────────────────────────────── */

const toTitleCase = (s: string) => s.replace(/(^|\s)\S/g, (c) => c.toUpperCase());

const fmtDateForHero = (iso?: string | null) => {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return null;
  }
};

const proposalNumberFor = (proposal: any): string => {
  const explicit = proposal?.pricing_snapshot?.document?.proposalNumber;
  if (typeof explicit === 'string' && explicit.length > 0) return explicit;
  // Derive from id + created year. Compact and stable.
  const year = proposal?.created_at ? new Date(proposal.created_at).getFullYear() : new Date().getFullYear();
  const seed = (proposal?.id || '').replace(/-/g, '').slice(0, 4).toUpperCase() || 'XXXX';
  return `LV-${year}-${seed}`;
};

const validUntilFor = (proposal: any): { display: string | null; days: number } => {
  const days = Number(proposal?.pricing_snapshot?.document?.validityDays) || 21;
  if (!proposal?.sent_at) {
    // Not yet sent — show validity from today as a preview.
    const d = new Date(); d.setDate(d.getDate() + days);
    return { display: fmtDateForHero(d.toISOString()), days };
  }
  const base = new Date(proposal.sent_at);
  base.setDate(base.getDate() + days);
  return { display: fmtDateForHero(base.toISOString()), days };
};

const fallbackPillars = (): ProposalPillar[] => ([
  { num: '01 — Velocity', title: 'Short sprints, fast decisions.', body: 'One-week cycles with Friday demos. No bloated status meetings.' },
  { num: '02 — Visibility', title: 'Access to board, staging and code.', body: 'Linear, Figma and Git shared from day one. An extension of your team.' },
  { num: '03 — Sovereignty', title: 'Repos and assets are yours.', body: 'No lock-in. Handoff doc so any dev can maintain the product.' },
]);

const fallbackTerms = (validityDays: number): ProposalTerm[] => ([
  { num: '01 — IP', title: 'Intellectual property', body: 'Deliverables transfer to the client upon final payment. Livv keeps portfolio rights unless under NDA.' },
  { num: '02 — Reviews', title: 'Consolidated feedback', body: 'Rounds depending on the plan. Extras at USD 120/h. One single point of contact on the client side.' },
  { num: '03 — Scope', title: 'Documented changes', body: 'Major changes go through a written Change Order before being executed. No order, no extra work.' },
  { num: '04 — NDA', title: 'Confidentiality', body: 'All shared info is confidential. We sign a mutual NDA if required, at no extra cost.' },
  { num: '05 — Cancellation', title: 'Clean exit', body: "Cancellable anytime; we bill what's been done plus 15% of the current phase." },
  { num: '06 — Validity', title: 'Term', body: `This proposal is valid for ${validityDays} days. After that it's reconfirmed.` },
]);

const fallbackPayments = (): ProposalPaymentMilestone[] => ([
  { pct: 40, when: 'On signing', desc: "Reserves the team's slot and immediate kickoff." },
  { pct: 30, when: 'Mid-project', desc: 'On signing the design handoff for production.' },
  { pct: 30, when: 'Launch', desc: 'After go-live and technical handoff.' },
]);

// Convert proposal.timeline (already used by the AI generator) into our
// ProposalPhase shape. Timeline format from supabase/functions/gemini:
// { weeks, items: [{ week, title, detail }] }
const phasesFromTimeline = (timeline: any): ProposalPhase[] => {
  if (!timeline || !Array.isArray(timeline.items)) return [];
  return timeline.items.map((it: any, i: number) => ({
    num: String(it.week ?? i + 1).padStart(2, '0'),
    name: it.title || `Phase ${i + 1}`,
    duration: it.duration || `${it.week ? `Week ${it.week}` : '1 wk'}`,
    deliverables: Array.isArray(it.deliverables)
      ? it.deliverables
      : (typeof it.detail === 'string' && it.detail.length > 0 ? [it.detail] : []),
  }));
};

const tiersFromProposal = (proposal: any, doc: any): ProposalTier[] => {
  if (Array.isArray(doc?.tiers) && doc.tiers.length > 0) {
    return doc.tiers.map((t: any, idx: number) => ({
      id: t.id || `tier-${idx}`,
      name: t.name || `Tier ${idx + 1}`,
      amount: Number(t.amount) || 0,
      duration: t.duration || '—',
      description: t.description || '',
      featured: !!t.featured,
      recommended: !!t.recommended,
      variantLabel: t.variantLabel || t.variant_label || undefined,
      platform: t.platform || undefined,
      features: Array.isArray(t.features)
        ? t.features.map((f: any) => typeof f === 'string'
            ? { label: f, included: true }
            : { label: f.label || '', included: f.included !== false })
        : [],
    }));
  }
  // Single-tier fallback derived from the proposal's own pricing.
  const amount = Number(proposal?.pricing_total) || 0;
  const wks = proposal?.timeline?.weeks;
  const duration = wks ? `${wks} weeks` : '—';
  return [{
    id: 'main',
    name: proposal?.complexity ? toTitleCase(proposal.complexity) : 'Engagement',
    amount,
    duration,
    description: proposal?.summary || '',
    featured: true,
    recommended: false,
    features: Array.isArray(proposal?.pricing_snapshot?.deliverables)
      ? proposal.pricing_snapshot.deliverables.map((d: string) => ({ label: d, included: true }))
      : [],
  }];
};

const addonsFromDoc = (doc: any): ProposalAddon[] => {
  if (!Array.isArray(doc?.addons)) return [];
  return doc.addons
    .map((a: any, i: number) => ({
      id: a.id || `addon-${i}`,
      title: a.title || a.name || '',
      subtitle: a.subtitle || a.description || '',
      price: Number(a.price) || 0,
    }))
    .filter((a: ProposalAddon) => a.title.length > 0);
};

const contextLeadFrom = (proposal: any, doc: any): string[] => {
  if (Array.isArray(doc?.contextLead) && doc.contextLead.length > 0) return doc.contextLead;
  const summary = proposal?.summary || '';
  const brief = proposal?.brief_text || '';
  const out: string[] = [];
  if (summary) out.push(summary);
  if (brief && brief !== summary) out.push(brief);
  if (out.length === 0) {
    out.push("We're putting together a clear path to deliver what we discussed — scope, timeline, and a price that reflects the work.");
  }
  return out;
};

export interface BuildOptions {
  preparedBy?: string;
  contactEmail?: string;
  /** Override the client display name (e.g. when joining the proposal
   *  to a clients/leads row in the caller). */
  clientName?: string;
}

export function buildProposalDocumentData(proposal: any, opts: BuildOptions = {}): ProposalDocumentData {
  const doc = proposal?.pricing_snapshot?.document || {};
  const validity = validUntilFor(proposal);
  const tiers = tiersFromProposal(proposal, doc);

  return {
    proposalNumber: proposalNumberFor(proposal),
    clientName: opts.clientName
      || doc.clientName
      || proposal?.client_name
      || proposal?.lead_name
      || 'New client',
    projectName: proposal?.title || 'Proposal',
    preparedBy: opts.preparedBy || doc.preparedBy || 'Eneas Aldabe · Livv Studio',
    currency: proposal?.currency || 'USD',
    validUntil: validity.display,
    validityDays: validity.days,

    heroEyebrow: doc.heroEyebrow,
    contextLead: contextLeadFrom(proposal, doc),
    contextQuote: doc.contextQuote
      ? { text: doc.contextQuote.text || '', attribution: doc.contextQuote.attribution || 'Initial brief' }
      : (proposal?.brief_text
          ? { text: String(proposal.brief_text).slice(0, 280), attribution: 'Initial brief' }
          : undefined),

    pillars: Array.isArray(doc.pillars) && doc.pillars.length > 0
      ? doc.pillars
      : fallbackPillars(),

    phasesHeading: doc.phasesHeading,
    phasesSubheading: doc.phasesSubheading,
    phasesBlurb: doc.phasesBlurb,
    // Always normalize so EVERY phase has the array fields the view
    // expects. The AI sometimes omits 'deliverables' entirely, which
    // used to crash <ProposalDocumentView> with "Cannot read properties
    // of undefined (reading 'map')" and nuke the whole Docs page.
    phases: ((): ProposalPhase[] => {
      const src = Array.isArray(doc.phases) && doc.phases.length > 0
        ? doc.phases
        : phasesFromTimeline(proposal?.timeline);
      return src.map((p: any, i: number) => ({
        num: p.num || String(i + 1).padStart(2, '0'),
        name: p.name || `Phase ${i + 1}`,
        duration: p.duration || '—',
        deliverables: Array.isArray(p.deliverables) ? p.deliverables : [],
      }));
    })(),

    tiers,
    addons: addonsFromDoc(doc),

    payments: Array.isArray(doc.payments) && doc.payments.length > 0
      ? doc.payments
      : fallbackPayments(),

    terms: Array.isArray(doc.terms) && doc.terms.length > 0
      ? doc.terms
      : fallbackTerms(validity.days),

    contactEmail: opts.contactEmail || doc.contactEmail || 'hola@livv.systems',

    // Pass-through for the Livv quoting framework's optional sections.
    assumptions: Array.isArray(doc.assumptions) && doc.assumptions.length > 0
      ? doc.assumptions
      : undefined,
    comparisonTable: doc.comparisonTable && Array.isArray(doc.comparisonTable.headers) && Array.isArray(doc.comparisonTable.rows)
      ? doc.comparisonTable
      : undefined,
  };
}
