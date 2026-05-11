import React, { useEffect, useMemo, useRef, useState } from 'react';
import './proposal-document.css';

/* ──────────────────────────────────────────────────────────────────────
 * ProposalDocumentView — Livv Studio "Sales Proposal v2" design.
 *
 * Direct port of the HTML/CSS prototype from claude.ai/design (chat
 * "Propuestas Livv", 2026-05-07). All styling is scoped under the
 * `livv-doc` class so it doesn't bleed into the rest of the app.
 *
 * The component reads from a structured `ProposalDocumentData` shape.
 * The sister `buildProposalDocumentData()` adapter normalises whatever
 * shape the DB row has (raw `pricing_snapshot` / `timeline` JSON, or
 * already-typed fields) into this shape, so the AI generator can
 * eventually fill `pricing_snapshot.tiers / addons / context / terms`
 * and the view will pick them up automatically.
 * ────────────────────────────────────────────────────────────────────── */

export interface ProposalTier {
  id: string;
  name: string;
  amount: number;
  duration: string;
  description: string;
  features: { label: string; included: boolean }[];
  featured?: boolean;
  recommended?: boolean;
  /** Optional sub-label printed under the tier name. The Livv quoting
   *  framework uses this for "Custom code" / "CMS" suffixes when 4
   *  variants are shown side-by-side. */
  variantLabel?: string;
  /** Optional platform name ("Webflow", "Next.js", "Shopify", …) shown
   *  in the duration row alongside the timeline. */
  platform?: string;
}

export interface ProposalAddon {
  id: string;
  title: string;
  subtitle?: string;
  price: number;
}

export interface ProposalPhase {
  num: string;        // "01"
  name: string;
  duration: string;   // "2 wks"
  deliverables: string[];
}

export interface ProposalPillar {
  num: string;        // "01 — Velocity"
  title: string;
  body: string;
}

export interface ProposalTerm {
  num: string;        // "01 — IP"
  title: string;
  body: string;
}

export interface ProposalPaymentMilestone {
  pct: number;
  when: string;
  desc: string;
}

export interface ProposalDocumentData {
  /** Reference number, e.g. "WDX-2026-014". */
  proposalNumber: string;
  clientName: string;
  projectName: string;       // = title
  preparedBy: string;
  currency: string;          // "USD" / "ARS" / "EUR"
  validUntil: string | null; // formatted display string

  /** Hero section — short narrative line. */
  heroEyebrow?: string;

  /** Context section. */
  contextLead: string[];     // paragraphs
  contextQuote?: { text: string; attribution: string };

  /** Approach pillars (3). */
  pillars: ProposalPillar[];

  /** Scope phases (any number, 2-col grid). */
  phasesHeading?: string;    // "Four phases."
  phasesSubheading?: string; // "Ten weeks."
  phasesBlurb?: string;
  phases: ProposalPhase[];

  /** Pricing tiers (1-3). The featured one is highlighted. */
  tiers: ProposalTier[];

  /** Optional add-ons (live total). */
  addons: ProposalAddon[];

  /** Payment plan (defaults to 40/30/30). */
  payments: ProposalPaymentMilestone[];

  /** Terms grid. */
  terms: ProposalTerm[];

  /** Validity in days, used in the terms copy. */
  validityDays: number;

  /** Contact e-mail for "prefer to talk it over". */
  contactEmail: string;

  /** Explicit assumptions the AI made when scope was thin. Rendered as
   *  a small preface above the investment section so the client can
   *  flag anything that doesn't match their expectation. From the
   *  Livv quoting framework: "If the brief is missing details, make
   *  logical assumptions and state them explicitly." */
  assumptions?: string[];

  /** Optional spec-by-spec comparison table (Pages / Animations /
   *  Integrations / Timeline / Price …). When the AI emits this, the
   *  view renders it after the tier cards as a single readable matrix.
   *  Rows are arbitrary; first column is the spec name, the rest map
   *  1:1 to the tier list. */
  comparisonTable?: {
    headers: string[]; // typically tier names ("Simple", "Premium")
    rows: { label: string; values: string[] }[];
  };
}

interface Props {
  data: ProposalDocumentData;
  /** Disable the live "select tier" interactivity (e.g. for previews). */
  readOnly?: boolean;
  /** Initial selected tier id; defaults to featured tier or first. */
  initialTierId?: string;
  /** Called when the visitor accepts the proposal. The adapter is
   *  responsible for persisting (calling `submit_proposal_feedback` etc.). */
  onAccept?: (payload: {
    tierId: string;
    addons: string[];
    total: number;
    signerName: string;
    signerRole: string;
  }) => Promise<void> | void;
  /** When true, the component shows a "Proposal accepted" overlay
   *  instead of the form. Used when the proposal already has
   *  `approved_at` set. */
  alreadyAccepted?: boolean;
  /** Hide the accept section entirely (e.g. studio preview mode). */
  hideAccept?: boolean;
}

const formatNum = (n: number) => Number(n).toLocaleString('en-US');

export const ProposalDocumentView: React.FC<Props> = ({
  data,
  readOnly,
  initialTierId,
  onAccept,
  alreadyAccepted,
  hideAccept,
}) => {
  // Default tier = explicit prop > featured > first.
  const defaultTierId = useMemo(() => {
    if (initialTierId && data.tiers.some(t => t.id === initialTierId)) return initialTierId;
    const featured = data.tiers.find(t => t.featured);
    return featured?.id || data.tiers[0]?.id || '';
  }, [data.tiers, initialTierId]);

  const [selectedTierId, setSelectedTierId] = useState(defaultTierId);
  const [activeAddons, setActiveAddons] = useState<Set<string>>(new Set());
  const [signerName, setSignerName] = useState('');
  const [signerRole, setSignerRole] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<null | {
    name: string;
    role: string;
    plan: string;
    total: string;
    when: string;
    ref: string;
  }>(null);
  const [scrollPct, setScrollPct] = useState(0);
  const [flashKey, setFlashKey] = useState(0);

  const selectedTier = data.tiers.find(t => t.id === selectedTierId) || data.tiers[0];

  // Live total — base tier + selected add-ons.
  const addonsTotal = useMemo(() => {
    return data.addons
      .filter(a => activeAddons.has(a.id))
      .reduce((s, a) => s + a.price, 0);
  }, [data.addons, activeAddons]);
  const grandTotal = (selectedTier?.amount || 0) + addonsTotal;
  const addonCount = activeAddons.size;

  // Flash the total when it changes (subtle gold pulse, matches the
  // amount-flash treatment in the prototype).
  useEffect(() => { setFlashKey(k => k + 1); }, [grandTotal]);

  // Scroll progress bar.
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      if (max <= 0) { setScrollPct(0); return; }
      setScrollPct((h.scrollTop / max) * 100);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const toggleAddon = (id: string) => {
    if (readOnly) return;
    setActiveAddons(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canSubmit = !!signerName.trim() && !!signerRole.trim() && agreeTerms && !submitting;

  const handleAccept = async () => {
    if (!canSubmit || !onAccept) return;
    setSubmitting(true);
    try {
      await onAccept({
        tierId: selectedTier.id,
        addons: Array.from(activeAddons),
        total: grandTotal,
        signerName: signerName.trim(),
        signerRole: signerRole.trim(),
      });
      const now = new Date().toLocaleString('en-US', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
      const ref = 'ACK-' + Math.random().toString(36).slice(2, 8).toUpperCase();
      setConfirmation({
        name: signerName.trim(),
        role: signerRole.trim(),
        plan: selectedTier.name,
        total: formatNum(grandTotal),
        when: now,
        ref,
      });
    } catch (err) {
      // The wrapping page surfaces errors; we just unblock the form.
    } finally {
      setSubmitting(false);
    }
  };

  // Hero monogram ("L" in the topnav).
  const monogram = 'L';

  // Breakdown line in the pricing total.
  const breakdownText = useMemo(() => {
    if (addonCount === 0) return `Plan ${selectedTier?.name} · no add-ons`;
    return `Plan ${selectedTier?.name} · +${addonCount} ${addonCount === 1 ? 'module' : 'modules'} (${data.currency} ${formatNum(addonsTotal)})`;
  }, [addonCount, selectedTier?.name, addonsTotal, data.currency]);

  return (
    <div className="livv-doc">
      <div className="scroll-progress" style={{ width: `${scrollPct}%` }} />

      {/* Top nav */}
      <nav className="topnav">
        <span className="brand">
          <span className="brand-monogram">{monogram}</span>
          <span>Livv</span>
        </span>
        <a href="#contexto">Context</a>
        <a href="#alcance">Scope</a>
        <a href="#inversion">Investment</a>
        {!hideAccept && <a href="#aceptar">Accept</a>}
        <span className="ref">{data.proposalNumber}</span>
      </nav>

      {/* Hero */}
      <section className="hero">
        <div className="hero-frame">
          <div className="hero-content">
            <div className="hero-top">
              <span className="eyebrow on-dark">© Livv Studio — Sales Proposal</span>
              <span className="eyebrow on-dark">N° {data.proposalNumber}</span>
            </div>

            <div className="hero-bottom">
              <div>
                <p className="eyebrow on-dark" style={{ margin: '0 0 14px' }}>
                  © For <span style={{ color: '#FDFBF7' }}>{data.clientName}</span> クライアント
                </p>
                <h1 className="h-display">{data.projectName}</h1>
              </div>

              <div className="hero-meta-grid">
                <div className="cell">
                  <div className="lbl">Prepared by</div>
                  <div className="val">{data.preparedBy}</div>
                </div>
                <div className="cell">
                  <div className="lbl">Selected plan</div>
                  <div className="val gold">{selectedTier?.name || '—'}</div>
                </div>
                <div className="cell">
                  <div className="lbl">Investment</div>
                  <div className="val gold">
                    {data.currency}{' '}
                    <span key={`hero-${flashKey}`} className="amount-flash flash">
                      {formatNum(grandTotal)}
                    </span>
                  </div>
                </div>
                <div className="cell">
                  <div className="lbl">Valid until</div>
                  <div className="val">{data.validUntil || '—'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Context */}
      <section className="bleed compact" id="contexto">
        <div className="shell">
          <div className="eyebrow-row">
            <span className="eyebrow">© Understanding 理解</span>
            <span className="wdx">(WDX® — 01)</span>
          </div>

          <h2 className="h-section" style={{ marginBottom: 32 }}>
            What we heard<br /><span className="text-gold">in our conversations.</span>
          </h2>

          <div className="context-inline">
            <div className="lead">
              {(Array.isArray(data.contextLead) ? data.contextLead : []).map((p, i) => (
                <p key={i} dangerouslySetInnerHTML={{ __html: p }} />
              ))}
            </div>
            {data.contextQuote && (
              <blockquote className="quote">
                "{data.contextQuote.text}"
                <footer>— {data.contextQuote.attribution}</footer>
              </blockquote>
            )}
          </div>

          <hr className="dashed-rule" style={{ margin: '48px 0 32px' }} />

          {data.pillars.length > 0 && (
            <div className="compact-pillars">
              {data.pillars.map((p, i) => (
                <div key={i} className="pillar">
                  <div className="num">{p.num}</div>
                  <h3>{p.title}</h3>
                  <p>{p.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Scope */}
      {data.phases.length > 0 && (
        <section className="bleed compact" id="alcance" style={{ background: 'var(--cream-100)' }}>
          <div className="shell">
            <div className="eyebrow-row">
              <span className="eyebrow">© Scope 範囲</span>
              <span className="wdx">(WDX® — 02)</span>
            </div>

            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1.4fr',
              gap: 64, alignItems: 'end', marginBottom: 32,
            }}>
              <h2 className="h-section">
                {data.phasesHeading || 'Phases.'}<br />
                <span className="text-gold">{data.phasesSubheading || 'Engagement.'}</span>
              </h2>
              <p style={{
                fontFamily: 'var(--font-sans)', fontSize: 15, lineHeight: 1.55,
                color: 'var(--fg-body)', margin: 0,
              }}>
                {data.phasesBlurb || 'Each phase closes with a concrete deliverable and a written sign-off. No silent scope creep.'}
              </p>
            </div>

            <div className="phase-grid">
              {data.phases.map((ph, i) => (
                <div key={i} className="phase-item">
                  <div className="ph-head">
                    <span className="ph-num-sm">{ph.num}</span>
                    <span className="ph-name">{ph.name}</span>
                    <span className="ph-wks">{ph.duration}</span>
                  </div>
                  <ul>
                    {(Array.isArray(ph.deliverables) ? ph.deliverables : []).map((d, j) => <li key={j}>{d}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Investment */}
      <section className="bleed compact" id="inversion">
        <div className="shell">
          <div className="eyebrow-row">
            <span className="eyebrow">© Investment 投資</span>
            <span className="wdx">(WDX® — 03)</span>
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1.4fr',
            gap: 64, alignItems: 'end', marginBottom: 32,
          }}>
            <h2 className="h-section">
              {data.tiers.length > 1 ? 'Three paths.' : 'Investment.'}<br />
              <span className="text-gold">
                {data.tiers.length > 1 ? 'Pick yours.' : selectedTier?.duration || 'Engagement.'}
              </span>
            </h2>
            <p style={{
              fontFamily: 'var(--font-sans)', fontSize: 15, lineHeight: 1.55,
              color: 'var(--fg-body)', margin: 0,
            }}>
              {data.tiers.length > 1
                ? 'Same principles, different scope. Click an option to select it — your pick reflects on the hero and the acceptance section.'
                : 'Scope, timeline and pricing for this engagement.'} Prices in {data.currency}, tax not included.
            </p>
          </div>

          {/* Assumptions block — surfaces explicit AI assumptions when
              the brief was thin, per the Livv quoting framework. */}
          {data.assumptions && data.assumptions.length > 0 && (
            <div className="assumptions-block">
              <div className="ass-head">© Assumptions</div>
              <ul>
                {data.assumptions.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>
          )}

          {/* Tier grid. Auto-adapts to 1/2/3/4 columns based on the
              number of tiers the AI produced. */}
          <div
            className={`tier-grid ${data.tiers.length === 4 ? 'four-cols' : ''}`}
            style={data.tiers.length <= 3 ? {
              gridTemplateColumns: data.tiers.length === 1
                ? '1fr'
                : data.tiers.length === 2
                  ? 'repeat(2, 1fr)'
                  : 'repeat(3, 1fr)',
            } : undefined}
          >
            {(Array.isArray(data.tiers) ? data.tiers : []).map(tier => {
              const isSelected = tier.id === selectedTier?.id;
              return (
                <div
                  key={tier.id}
                  className={`tier-card ${tier.featured ? 'featured' : ''} ${isSelected ? 'selected' : ''}`}
                  onClick={() => !readOnly && setSelectedTierId(tier.id)}
                >
                  {tier.recommended && <span className="tier-tag">★ Recommended</span>}
                  <div className="tier-name">{tier.name}</div>
                  {tier.variantLabel && <div className="tier-variant">{tier.variantLabel}</div>}
                  <div className="tier-desc">{tier.description}</div>
                  <div className="tier-price">
                    <span className="currency">{data.currency}</span>{formatNum(tier.amount)}
                  </div>
                  <div className="tier-duration">
                    {tier.duration}
                    {tier.platform && <span className="tier-platform">{tier.platform}</span>}
                  </div>
                  <ul className="tier-features">
                    {(Array.isArray(tier.features) ? tier.features : []).map((f, i) => (
                      <li key={i} className={f.included ? '' : 'muted'}>{f.label}</li>
                    ))}
                  </ul>
                  {!readOnly && (
                    <button
                      type="button"
                      className="tier-pick"
                      onClick={(e) => { e.stopPropagation(); setSelectedTierId(tier.id); }}
                    >
                      {isSelected ? 'Selected' : `Select ${tier.name}`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Comparison summary table — required by the Livv quoting
              framework for serious clients. Only renders when the AI
              emits it (it always should for >=2 tiers). */}
          {data.comparisonTable && data.comparisonTable.rows.length > 0 && (
            <div className="comparison-table">
              <table>
                <thead>
                  <tr>
                    <th>Spec</th>
                    {data.comparisonTable.headers.map((h, i) => <th key={i}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(data.comparisonTable.rows) ? data.comparisonTable.rows : []).map((row, i) => (
                    <tr key={i}>
                      <td>{row.label}</td>
                      {(Array.isArray(row.values) ? row.values : []).map((v, j) => <td key={j}>{v}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Add-ons */}
          {data.addons.length > 0 && (
            <div className="addons-wrap">
              <div className="addons-head">
                <h3 className="ttl">
                  Add optional modules{' '}
                  <span style={{ color: 'rgba(90,62,62,0.4)', fontSize: 13 }}>
                    — total updates live
                  </span>
                </h3>
                <span className="hint">{readOnly ? 'preview' : 'tap to toggle'}</span>
              </div>
              <div className="addons-list">
                {data.addons.map(addon => {
                  const on = activeAddons.has(addon.id);
                  return (
                    <div
                      key={addon.id}
                      className={`addon-pill ${on ? 'on' : ''}`}
                      onClick={() => toggleAddon(addon.id)}
                    >
                      <span className="check" />
                      <span className="body">
                        <div className="ad-title">{addon.title}</div>
                        {addon.subtitle && <div className="ad-sub">{addon.subtitle}</div>}
                      </span>
                      <span className="ad-price">+{data.currency} {formatNum(addon.price)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Selected plan summary */}
          <div className="pricing-total">
            <div>
              <div className="lbl">Selected plan</div>
              <div className="total-name">
                {selectedTier?.name} · for {data.clientName}
              </div>
            </div>
            <div className="total-amount">
              <span className="currency">{data.currency}</span>
              <span key={`total-${flashKey}`} className="amount-flash flash">
                {formatNum(grandTotal)}
              </span>
              <div className="total-breakdown">
                {addonCount === 0 ? (
                  <>Plan {selectedTier?.name} · no add-ons</>
                ) : (
                  <>
                    Plan {selectedTier?.name}{' '}
                    <span className="plus">+ {addonCount} {addonCount === 1 ? 'module' : 'modules'}</span>{' '}
                    ({data.currency} {formatNum(addonsTotal)})
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Payments */}
          {data.payments.length > 0 && (
            <div className="payments">
              {data.payments.map((p, i) => (
                <div key={i} className="pay">
                  <div className="pct">{p.pct}<span style={{ fontSize: 22, color: 'var(--cream-500)' }}>%</span></div>
                  <div className="when">{p.when}</div>
                  <p className="desc">{p.desc}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Terms */}
      {data.terms.length > 0 && (
        <section className="bleed compact" style={{ background: 'var(--cream-100)' }}>
          <div className="shell">
            <div className="eyebrow-row">
              <span className="eyebrow">© Terms 条件</span>
              <span className="wdx">(WDX® — 04)</span>
            </div>

            <h2 className="h-section" style={{ marginBottom: 32 }}>What we sign.</h2>

            <div className="terms-grid">
              {data.terms.map((t, i) => (
                <div key={i}>
                  <div className="term-num">{t.num}</div>
                  <h4>{t.title}</h4>
                  <p>{t.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Acceptance */}
      {!hideAccept && (
        <section className="accept-section" id="aceptar">
          <div className="shell">
            <div className="eyebrow-row on-dark">
              <span className="eyebrow on-dark">© Acceptance 承認</span>
              <span className="wdx on-dark">(WDX® — 05)</span>
            </div>

            <div className="accept-card">
              {confirmation || alreadyAccepted ? (
                <div className="accept-confirmed" style={{ gridColumn: '1 / -1' }}>
                  <div className="seal">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <h2 className="h">Proposal accepted.</h2>
                  {confirmation ? (
                    <>
                      <p>
                        Thank you, <strong style={{ color: 'var(--gold-bright)', fontWeight: 500 }}>{confirmation.name}</strong>.
                        Within the next 24h we'll send the MSA for the{' '}
                        <strong style={{ color: 'var(--gold-bright)', fontWeight: 500 }}>{confirmation.plan}</strong> plan,
                        the first invoice and a link to schedule the kick-off.
                      </p>
                      <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20,
                        paddingTop: 20, borderTop: '1px dashed rgba(237,229,216,0.18)',
                        width: '100%', marginTop: 12,
                      }}>
                        <ConfirmCell label="Signed by" value={
                          <>{confirmation.name}<br /><span style={{ color: 'rgba(237,229,216,0.6)', fontSize: 11 }}>{confirmation.role}</span></>
                        } />
                        <ConfirmCell label="Plan" value={
                          <>{confirmation.plan}<br /><span style={{ color: 'var(--gold-bright)', fontSize: 11 }}>{data.currency} {confirmation.total}</span></>
                        } />
                        <ConfirmCell label="Date" value={confirmation.when} />
                        <ConfirmCell label="Ref" value={
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--gold-bright)' }}>{confirmation.ref}</span>
                        } />
                      </div>
                    </>
                  ) : (
                    <p>
                      This proposal was approved earlier. The Livv team is in motion — check your inbox for the kick-off details.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <div className="left">
                    <h2 className="h">Shall we move forward?</h2>
                    <p>
                      Sign below and within 24h we'll send the MSA, the first 40% invoice and the kick-off invitation.
                    </p>
                    <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                      <span className="chip">
                        <span className="dot" />
                        <span>Plan: <strong style={{ color: 'var(--gold-bright)', fontWeight: 500, marginLeft: 4 }}>{selectedTier?.name}</strong></span>
                      </span>
                      <span className="chip">
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{data.currency} {formatNum(grandTotal)}</span>
                      </span>
                      <span className="chip">
                        <span>Until {data.validUntil || '—'}</span>
                      </span>
                    </div>
                  </div>
                  <div className="right">
                    <div className="field">
                      <label>Your full name</label>
                      <input
                        type="text"
                        value={signerName}
                        onChange={(e) => setSignerName(e.target.value)}
                        placeholder="e.g. María González"
                      />
                    </div>
                    <div className="field">
                      <label>Role</label>
                      <input
                        type="text"
                        value={signerRole}
                        onChange={(e) => setSignerRole(e.target.value)}
                        placeholder="e.g. Founder · CEO"
                      />
                    </div>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={agreeTerms}
                        onChange={(e) => setAgreeTerms(e.target.checked)}
                      />
                      <span>
                        I accept the terms, scope and investment of the selected plan. This acceptance acts as a letter of intent prior to the MSA.
                      </span>
                    </label>
                    <button
                      type="button"
                      className="pill gold"
                      disabled={!canSubmit}
                      onClick={handleAccept}
                    >
                      <span>{submitting ? 'Submitting…' : 'Accept proposal'}</span>
                      <span className="arrow-ring">
                        <span className="halo" />
                        <span className="core">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12h14M13 5l7 7-7 7" />
                          </svg>
                        </span>
                      </span>
                    </button>
                    <p style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.15em',
                      textTransform: 'uppercase', color: 'rgba(237,229,216,0.4)', margin: '4px 0 0',
                    }}>
                      Prefer to talk it over?{' '}
                      <a href={`mailto:${data.contactEmail}`} style={{ color: 'var(--gold-bright)', textDecoration: 'none' }}>
                        {data.contactEmail}
                      </a>
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="proposal-footer">
        <div className="shell">
          <div className="row">
            <div>
              <div className="lockup">livv<span className="text-gold">©</span></div>
              <p style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em',
                textTransform: 'uppercase', color: 'rgba(90,62,62,0.5)', margin: '8px 0 0',
              }}>
                Livv · Buenos Aires · MMXXVI
              </p>
            </div>
            <div className="meta">
              <div>Proposal {data.proposalNumber} · For {data.clientName}</div>
              <div>Valid until {data.validUntil || '—'} · {data.contactEmail}</div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

const ConfirmCell: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div>
    <div style={{
      fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em',
      textTransform: 'uppercase', color: 'rgba(237,229,216,0.5)', marginBottom: 6,
    }}>
      {label}
    </div>
    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--cream-50)' }}>
      {value}
    </div>
  </div>
);
