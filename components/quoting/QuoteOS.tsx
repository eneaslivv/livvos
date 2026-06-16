// @ts-nocheck
// Livv Quote OS — faithful rebuild of "Livv Quote OS.dc.html".
// Light cream design system, 6-view state machine, wired to the live
// edge functions (quoting-generate / onboarding-generate / onboarding-sync)
// and the shared Supabase tables (RLS-scoped). Mounted at quoting.livv.space / ?app=quoting.
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import './quote-os.css';
import {
  getQuotingSession, listProposals, pricingMemory, listServices, listOnboardings, quotingApi,
} from '@/lib/quoting/api';

// ---------- helpers ----------
const money = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '$0';
  return '$' + Math.round(v).toLocaleString('en-US');
};
const numOf = (v) => {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  return Number(String(v).replace(/[^0-9.]/g, '')) || 0;
};
const Spin = () => <span className="qo-spin" />;

const Eyebrow = ({ children, tone }) => (
  <div className={`qo-eyebrow${tone ? ' ' + tone : ''}`} style={{ marginBottom: 12 }}>© {children}</div>
);

// nav icons (stroke, currentColor) — exact paths from the design
const Icon = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {d.map((p, i) => (p.c ? <circle key={i} {...p.c} /> : <path key={i} d={p} />))}
  </svg>
);
const ICONS = {
  home: ['M3 11l9-7 9 7', 'M5 10v9h14v-9'],
  draft: ['M4 20h4L19 9l-4-4L4 16v4z', 'M14 6l4 4'],
  quotes: ['M6 3h8l5 5v13H6z', 'M14 3v5h5', 'M9 13h6M9 17h6'],
  onboarding: [{ c: { cx: 12, cy: 12, r: 9 } }, 'M9 12h6M13.5 9l3 3-3 3'],
  history: [{ c: { cx: 12, cy: 12, r: 9 } }, 'M12 7v5l3 2'],
};

const STATUS = {
  approved: 'sage', complete: 'sage', paid: 'sage', sent: 'sky', deposit: 'wine',
  draft: '', rejected: 'brick', 'in progress': 'gold', synced: 'sage', planned: '',
};
const Badge = ({ status, label }) => {
  const k = String(status || '').toLowerCase();
  return <span className={`qo-badge ${STATUS[k] || ''}`}>{label || status || '—'}</span>;
};

// ============================================================ HOME
const HOME_CARDS = [
  { glyph: '✦', title: 'New project', desc: 'Quote a fresh build from scratch.', go: 'build' },
  { glyph: '＋', title: 'New quote / add-on', desc: 'Quote work on an existing project.', go: 'build' },
  { glyph: '↻', title: 'Maintenance', desc: 'Retainer or one-off support.', go: 'build' },
  { glyph: '◷', title: 'Review a quote', desc: 'Pipeline, payments & status.', go: 'review' },
  { glyph: '→', title: 'Approved → onboarding', desc: 'Turn a won quote into a live project.', go: 'onboarding' },
];

function HomeView({ go, onGenerated }) {
  const [briefOpen, setBriefOpen] = useState(false);
  const [brief, setBrief] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);

  const submit = async () => {
    if (!brief.trim() || loading) return;
    setLoading(true); setErr(null); setResult(null);
    try { const r = await quotingApi.generateQuote({ brief }); setResult(r); onGenerated && onGenerated(); }
    catch (e) { setErr(e.message); } finally { setLoading(false); }
  };

  const cardStyle = { padding: '20px', textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 14, transition: 'all .2s var(--ease-soft)' };
  const tile = (bg, color) => ({ width: 38, height: 38, borderRadius: 10, background: bg, border: bg === 'var(--livv-cream-100)' ? '1px solid var(--livv-cream-200)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color });

  return (
    <section style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 40px 64px' }}>
      <div style={{ width: '100%', maxWidth: 720 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Eyebrow>Start</Eyebrow>
          <h1 className="qo-h1">What are we quoting?</h1>
          <p className="qo-sub" style={{ marginTop: 12 }}>Pick a path — each one opens a guided flow and the price builds with you.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {HOME_CARDS.map((c) => (
            <button key={c.title} className="qo-card" onClick={() => go(c.go)} style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={tile('var(--livv-cream-100)', 'var(--livv-wine-500)')}>{c.glyph}</span>
                <span style={{ color: 'var(--livv-cream-400)', fontSize: 14 }}>↗</span>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--livv-cream-900)' }}>{c.title}</div>
                <div style={{ fontSize: 12, color: 'var(--livv-cream-500)', marginTop: 4, lineHeight: 1.5 }}>{c.desc}</div>
              </div>
            </button>
          ))}
          <button className="qo-card" onClick={() => setBriefOpen((v) => !v)} style={{ ...cardStyle, borderStyle: 'dashed' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={tile('var(--gradient-gold)', '#F4E9D6')}>✦</span>
              <span style={{ color: 'var(--livv-cream-400)', fontSize: 14 }}>{briefOpen ? '×' : '↗'}</span>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--livv-cream-900)' }}>Quote from a brief</div>
              <div style={{ fontSize: 12, color: 'var(--livv-cream-500)', marginTop: 4, lineHeight: 1.5 }}>Describe it in plain words — the AI drafts a starting point.</div>
            </div>
          </button>
        </div>

        {briefOpen && (
          <div className="qo-card qo-pop" style={{ marginTop: 16, padding: '8px 8px 10px' }}>
            <textarea value={brief} onChange={(e) => setBrief(e.target.value)}
              placeholder="Describe what the client needs — pages, features, the vibe, the deadline."
              style={{ width: '100%', minHeight: 84, padding: 14, border: 'none', borderRadius: 12, fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.55, color: 'var(--livv-cream-900)', background: 'none', outline: 'none', resize: 'none' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 6px 2px' }}>
              <button onClick={submit} disabled={loading || !brief.trim()}
                style={{ width: 40, height: 40, borderRadius: 999, border: 'none', background: 'var(--livv-cream-900)', color: 'var(--livv-cream-50)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {loading ? <Spin /> : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>}
              </button>
            </div>
          </div>
        )}
        {err && <p style={{ color: 'var(--livv-brick)', marginTop: 16, textAlign: 'center' }}>⚠ {err}</p>}
        {result && (
          <div className="qo-pop" style={{ marginTop: 18 }}>
            <Eyebrow tone="gold">Generated quote</Eyebrow>
            {(result.priced?.mode === 'two_option'
              ? [['Simple', result.priced.simple], ['Premium', result.priced.premium]]
              : [['Quote', result.priced?.single]]
            ).map(([title, o]) => o && (
              <div className="qo-card" key={title} style={{ padding: '18px 22px', marginBottom: 12 }}>
                <div className="qo-eyebrow muted" style={{ marginBottom: 10 }}>{title}</div>
                {(o.items || []).map((it, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px dashed var(--livv-cream-200)' }}>
                    <span style={{ fontSize: 13, color: 'var(--livv-wine-500)' }}>{it.name}</span>
                    <span className="qo-money" style={{ fontSize: 12, color: 'var(--livv-cream-600)' }}>{money(numOf(it.livv))}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10 }}>
                  <span style={{ fontWeight: 500 }}>Total · Livv internal</span>
                  <span className="qo-money" style={{ fontSize: 16 }}>{money(o.totals?.livv)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ============================================================ BUILD (wizard)
const PTYPES = ['Marketing site', 'Landing page', 'E-commerce', 'Web app', 'SaaS / platform', 'Automation'];
const PLATFORMS = ['Custom code', 'Shopify', 'Webflow', 'Framer', 'WordPress'];
const GOALS = ['Leads', 'Sales', 'Brand', 'Product launch', 'Content'];
const DESIGN_LEVELS = [
  { k: 'Simple', m: 0.9, note: 'Clean, template-led. Fastest to ship.' },
  { k: 'Custom', m: 1.0, note: 'Bespoke layouts, standard polish.' },
  { k: 'Premium', m: 1.2, note: 'Brand-grade system, refined detail.' },
  { k: 'Animated', m: 1.35, note: 'Motion system across the build.' },
  { k: 'Advanced art direction', m: 1.5, note: 'Experimental, high creative direction.' },
];
const GROUP_OF = {
  'Marketing Website': 'Build', 'Simple Content Page': 'Build', 'Advertise / Landing Page': 'Build', 'Author Archive Pages': 'Build',
  'Shopify Store (50 products)': 'Sell', 'Subscription Platform': 'Sell', 'Event Ticketing System': 'Sell',
  'Newsletter Integration': 'Grow', 'Analytics Reporting Setup': 'Grow', 'MLB Team Stats Pages': 'Grow',
  'CRM Dashboard (Simple)': 'Operate',
  'Enhanced Article Features (bundle)': 'Enhance', 'Article Comments System': 'Enhance', 'Pagination (last 7 days)': 'Enhance',
};
const GROUP_ORDER = ['Build', 'Sell', 'Grow', 'Operate', 'Enhance'];
const GROUP_DESC = { Build: 'Websites, landing pages, content.', Sell: 'Commerce, payments, booking.', Grow: 'Leads, CRM, email, SEO.', Operate: 'Apps, dashboards, automation, backend.', Enhance: 'Motion, AI, branding, support.' };
// Which modules are relevant for each build type — the Scope step adapts to the Context choice.
const KIND_MODULES = {
  'Marketing site': ['Marketing Website', 'Simple Content Page', 'Advertise / Landing Page', 'Author Archive Pages', 'Article Comments System', 'Enhanced Article Features (bundle)', 'Newsletter Integration', 'Analytics Reporting Setup', 'Pagination (last 7 days)'],
  'Landing page': ['Advertise / Landing Page', 'Simple Content Page', 'Newsletter Integration', 'Analytics Reporting Setup'],
  'E-commerce': ['Shopify Store (50 products)', 'Subscription Platform', 'Event Ticketing System', 'Newsletter Integration', 'Analytics Reporting Setup'],
  'Web app': ['CRM Dashboard (Simple)', 'Subscription Platform', 'Event Ticketing System', 'Analytics Reporting Setup'],
  'SaaS / platform': ['Subscription Platform', 'CRM Dashboard (Simple)', 'Analytics Reporting Setup'],
  'Automation': ['CRM Dashboard (Simple)', 'Newsletter Integration', 'Analytics Reporting Setup', 'MLB Team Stats Pages'],
};
const STEPS = ['Context', 'Scope', 'Design', 'Summary'];

function BuildView({ services, onExit, onApprove }) {
  const [step, setStep] = useState(0);
  const [ptype, setPtype] = useState(PTYPES[0]);
  const [platform, setPlatform] = useState(PLATFORMS[0]);
  const [goal, setGoal] = useState(GOALS[0]);
  const [rush, setRush] = useState(false);
  const [sel, setSel] = useState({});
  const [showAll, setShowAll] = useState(false);
  const [design, setDesign] = useState(1);
  const [optCount, setOptCount] = useState(2);
  const dmult = DESIGN_LEVELS[design].m;
  const umult = rush ? 1.2 : 1.0;
  // adapt scope to the build type — clear selections that no longer apply when it changes
  useEffect(() => { setSel({}); }, [ptype]);

  const chosen = services.filter((s) => sel[s.id]);
  const base = chosen.reduce((a, s) => a + numOf(s.fixed_price), 0);
  const total = Math.round((base * dmult * umult) / 5) * 5;
  const client = Math.round((total * 1.38) / 5) * 5;
  const range = chosen.length ? `${money(total * 0.85)}–${money(total * 1.15)}` : '—';

  const groups = useMemo(() => {
    const relevant = KIND_MODULES[ptype] || null;
    return GROUP_ORDER.map((g) => ({
      g, desc: GROUP_DESC[g],
      items: services.filter((s) => (GROUP_OF[s.name] || 'Enhance') === g && (showAll || !relevant || relevant.includes(s.name))),
    })).filter((x) => x.items.length);
  }, [services, ptype, showAll]);

  const seg = (active) => `qo-seg${active ? ' on' : ''}`;

  return (
    <section style={{ display: 'grid', gridTemplateColumns: '1fr 340px', minHeight: '100vh' }}>
      {/* left */}
      <div style={{ padding: '30px 38px 48px', maxWidth: 760 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="qo-cap" onClick={onExit} style={{ color: 'var(--livv-cream-400)' }}>← Exit</button>
            <span style={{ color: 'var(--livv-cream-300)' }}>/</span>
            <span style={{ color: 'var(--livv-wine-500)', fontSize: 13 }}>New quote</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {STEPS.map((s, i) => (
              <button key={s} onClick={() => setStep(i)}
                style={{ padding: '5px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 11.5, fontWeight: 500,
                  background: i === step ? 'var(--livv-cream-900)' : i < step ? 'var(--livv-cream-100)' : 'none',
                  color: i === step ? 'var(--livv-cream-50)' : i < step ? 'var(--livv-wine-500)' : 'var(--livv-cream-400)' }}>{s}</button>
            ))}
          </div>
        </div>

        <div className="qo-step" key={step}>
          <Eyebrow>{`Step 0${step + 1} · ${STEPS[step]}`}</Eyebrow>
          <h2 className="qo-h2" style={{ marginBottom: 8 }}>{['Tell me about the project', 'What does it need?', 'Design & complexity', 'Review & price'][step]}</h2>
          <p className="qo-sub" style={{ maxWidth: 520, marginBottom: 26 }}>{['A few quick choices so the engine knows where to start.', 'Tap the modules. The price builds with you.', 'Set the visual ambition — you see the price impact, transparently.', 'Everything in one place — edit the price and approve.'][step]}</p>

          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              {[['What are you building?', PTYPES, ptype, setPtype], ['Platform', PLATFORMS, platform, setPlatform], ['Primary goal', GOALS, goal, setGoal]].map(([label, opts, val, set]) => (
                <div key={label}>
                  <div className="qo-eyebrow" style={{ marginBottom: 10 }}>{label}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {opts.map((o) => <button key={o} className={seg(val === o)} onClick={() => set(o)}>{o}</button>)}
                  </div>
                </div>
              ))}
              <div>
                <div className="qo-eyebrow" style={{ marginBottom: 10 }}>Urgency</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className={seg(!rush)} onClick={() => setRush(false)}>Standard</button>
                  <button className={seg(rush)} onClick={() => setRush(true)}>Rush (+20%)</button>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div className="qo-sub">Modules suggested for <strong style={{ color: 'var(--livv-cream-900)', fontWeight: 600 }}>{ptype}</strong>.</div>
                <button className="qo-cap" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Suggested only' : 'Show all modules'}</button>
              </div>
              {groups.map(({ g, desc, items }) => (
                <div key={g}>
                  <div style={{ marginBottom: 12 }}>
                    <div className="qo-mono" style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--livv-cream-900)' }}>{g}</div>
                    <div style={{ fontSize: 11, color: 'var(--livv-cream-400)', marginTop: 2 }}>{desc}</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
                    {items.map((s) => (
                      <button key={s.id} className={`qo-modtile${sel[s.id] ? ' on' : ''}`} onClick={() => setSel((p) => ({ ...p, [s.id]: !p[s.id] }))}>
                        <span className={`qo-dot${sel[s.id] ? ' on' : ''}`} style={{ marginTop: 5 }} />
                        <span style={{ flex: 1 }}>
                          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 500, color: 'var(--livv-cream-900)' }}>{s.name}</span>
                          <span style={{ display: 'block', fontSize: 11, color: 'var(--livv-cream-500)', marginTop: 2 }}>{(s.deliverables || []).slice(0, 2).join(' · ')}</span>
                        </span>
                        <span className="qo-money" style={{ fontSize: 11.5, color: 'var(--livv-cream-700)' }}>{money(s.fixed_price)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {DESIGN_LEVELS.map((d, i) => (
                <button key={d.k} className={`qo-rowsel${design === i ? ' on' : ''}`} onClick={() => setDesign(i)}>
                  <span className={`qo-dot${design === i ? ' on' : ''}`} />
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 500 }}>{d.k}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--livv-cream-500)' }}>{d.note}</span>
                  </span>
                  <span className="qo-money" style={{ fontSize: 12, color: 'var(--livv-gold)' }}>×{d.m.toFixed(2)}</span>
                </button>
              ))}
            </div>
          )}

          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              <div className="qo-card" style={{ padding: '18px 20px' }}>
                <div className="qo-eyebrow muted" style={{ marginBottom: 10 }}>Selected scope</div>
                {chosen.length === 0 ? <div className="qo-sub">Nothing selected — go back to Scope.</div> : chosen.map((s) => (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px dashed var(--livv-cream-200)' }}>
                    <span style={{ fontSize: 13, color: 'var(--livv-wine-500)' }}>{s.name}</span>
                    <span className="qo-money" style={{ fontSize: 12, color: 'var(--livv-cream-600)' }}>{money(s.fixed_price)}</span>
                  </div>
                ))}
              </div>

              <div>
                <div className="qo-eyebrow" style={{ marginBottom: 10 }}>Client price options</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  {[1, 2, 3].map((n) => <button key={n} className={seg(optCount === n)} onClick={() => setOptCount(n)}>{n} option{n > 1 ? 's' : ''}</button>)}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${optCount},1fr)`, gap: 12 }}>
                  {[
                    optCount === 3 && { name: 'Essential', mult: 0.72, rec: false },
                    { name: optCount === 1 ? 'Proposal' : 'Standard', mult: 1.0, rec: optCount !== 3 ? false : true },
                    optCount >= 2 && { name: optCount === 3 ? 'Recommended' : 'Premium', mult: optCount === 3 ? 1.0 : 1.35, rec: optCount === 2 },
                    optCount === 3 && { name: 'Premium', mult: 1.35, rec: false },
                  ].filter(Boolean).slice(0, optCount).map((o, i) => (
                    <div key={i} style={{ borderRadius: 16, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 8, position: 'relative',
                      background: o.rec ? 'var(--livv-cream-900)' : 'none', border: o.rec ? 'none' : '1px dashed var(--livv-cream-300)', color: o.rec ? 'var(--livv-cream-50)' : 'inherit' }}>
                      {o.rec && <span className="qo-mono" style={{ position: 'absolute', top: 14, right: 16, fontSize: 8, color: 'var(--livv-gold)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Recommended</span>}
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{o.name}</span>
                      <span className="qo-money" style={{ fontWeight: 300, fontSize: 30, letterSpacing: '-0.03em' }}>{money(client * o.mult)}</span>
                      <span className="qo-mono" style={{ fontSize: 10, color: o.rec ? 'var(--livv-cream-400)' : 'var(--livv-cream-500)' }}>Client investment</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div className="qo-card" style={{ padding: '18px 20px' }}>
                  <div className="qo-eyebrow muted" style={{ marginBottom: 8 }}>Estimated timeline</div>
                  <div style={{ fontSize: 18, fontWeight: 300 }}>{chosen.reduce((a, s) => a + (s.estimated_weeks || 0), 0) || 3}–{(chosen.reduce((a, s) => a + (s.estimated_weeks || 0), 0) || 3) + 2} weeks</div>
                </div>
                <div className="qo-card sel" style={{ padding: '18px 20px', boxShadow: 'var(--shadow-md)' }}>
                  <div className="qo-eyebrow muted" style={{ marginBottom: 8 }}>Editable price · Livv</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ fontSize: 22, color: 'var(--livv-cream-500)' }}>$</span>
                    <span className="qo-stat-val" style={{ fontSize: 28 }}>{total.toLocaleString('en-US')}</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="qo-btn secondary">Share landing ↗</button>
                <button className="qo-btn secondary">Client-ready PDF ↗</button>
                <button className="qo-btn primary" onClick={() => onApprove && onApprove({ ptype, total, client })}>Approve → Onboarding ↗</button>
              </div>
            </div>
          )}
        </div>

        <div className="qo-divider" style={{ marginTop: 30, paddingTop: 18, display: 'flex', justifyContent: 'space-between' }}>
          <button className="qo-btn secondary" style={{ color: 'var(--livv-cream-500)' }} disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>← Back</button>
          <button className="qo-btn primary" onClick={() => setStep((s) => Math.min(3, s + 1))}>{step === 3 ? 'Done' : 'Continue'} ↗</button>
        </div>
      </div>

      {/* right rail */}
      <div style={{ borderLeft: '1px solid var(--livv-cream-200)', background: '#fff', padding: '30px 22px', position: 'sticky', top: 0, alignSelf: 'start', height: '100vh', overflowY: 'auto' }}>
        <Eyebrow>AI Quote Assistant</Eyebrow>
        <div style={{ fontSize: 13, color: 'var(--livv-cream-500)', marginBottom: 18 }}>{chosen.length ? `${chosen.length} module${chosen.length > 1 ? 's' : ''} selected.` : 'Pick modules to build the quote.'}</div>
        <div className="text-gradient-gold" style={{ fontFamily: 'var(--font-sans)', fontWeight: 300, fontSize: 42, lineHeight: 1, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}>{money(total)}</div>
        <div className="qo-mono" style={{ fontSize: 10, color: 'var(--livv-cream-400)', marginTop: 6, textTransform: 'uppercase', letterSpacing: '.08em' }}>Livv · suggested {range}</div>
        <div className="qo-mono" style={{ fontSize: 11, color: 'var(--livv-wine-500)', marginTop: 4 }}>Client · {money(client)}</div>

        <div className="qo-eyebrow" style={{ margin: '22px 0 8px' }}>Selected</div>
        {chosen.length === 0 ? <div style={{ fontSize: 13, color: 'var(--livv-cream-400)' }}>Nothing selected yet.</div> : chosen.map((s) => (
          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--livv-cream-100)', fontSize: 12.5 }}>
            <span style={{ color: 'var(--livv-wine-500)' }}>{s.name}</span>
            <span className="qo-money" style={{ color: 'var(--livv-cream-500)' }}>{money(s.fixed_price)}</span>
          </div>
        ))}
        <div className="qo-card-dark" style={{ marginTop: 22, borderRadius: 12, padding: '13px 15px' }}>
          <div className="qo-mono" style={{ fontSize: 9, color: 'var(--livv-gold)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6 }}>Next step</div>
          <div style={{ fontSize: 12.5, color: 'var(--livv-cream-50)' }}>{step < 3 ? 'Continue through the steps — the price updates live.' : 'Review the options and approve to start onboarding.'}</div>
        </div>
      </div>
    </section>
  );
}

// ============================================================ REVIEW (pipeline)
function ReviewView({ proposals }) {
  const [tab, setTab] = useState('pipeline');
  const [filter, setFilter] = useState('All');
  const [open, setOpen] = useState(null);

  const total = proposals.reduce((a, p) => a + numOf(p.pricing_total), 0);
  const approved = proposals.filter((p) => String(p.status).toLowerCase() === 'approved');
  const stats = [
    ['Total pipeline', money(total), `${proposals.length} quotes`],
    ['Approved', money(approved.reduce((a, p) => a + numOf(p.pricing_total), 0)), `${approved.length} won`],
    ['Client value', money(total * 1.38), 'after markup'],
    ['Avg quote', money(proposals.length ? total / proposals.length : 0), 'per project'],
  ];
  const filters = ['All', 'Draft', 'Sent', 'Approved'];
  const list = proposals.filter((p) => filter === 'All' || String(p.status).toLowerCase() === filter.toLowerCase());

  return (
    <section style={{ padding: '34px 40px 64px', maxWidth: 1080 }}>
      <Eyebrow>Pipeline · quotes & payments</Eyebrow>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 26 }}>
        <h2 className="qo-h2">Manage quotes</h2>
        <div style={{ background: 'var(--livv-cream-100)', borderRadius: 999, padding: 4, display: 'flex' }}>
          {['pipeline', 'insights'].map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '8px 16px', borderRadius: 999, border: 'none', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize', background: tab === t ? 'var(--livv-cream-900)' : 'none', color: tab === t ? 'var(--livv-cream-50)' : 'var(--livv-cream-500)' }}>{t}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, padding: '18px 0', borderTop: '1px dashed var(--livv-cream-300)', borderBottom: '1px dashed var(--livv-cream-300)', marginBottom: 22 }}>
        {stats.map(([v, val, sub]) => (
          <div key={v}><div className="qo-stat-val" style={{ fontSize: 26 }}>{val}</div><div style={{ fontSize: 12, fontWeight: 500, color: 'var(--livv-cream-700)', marginTop: 6 }}>{v}</div><div className="qo-mono" style={{ fontSize: 9.5, color: 'var(--livv-cream-400)', marginTop: 3 }}>{sub}</div></div>
        ))}
      </div>

      {tab === 'pipeline' ? (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
            {filters.map((f) => <button key={f} className={`qo-seg${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>{f}</button>)}
          </div>
          {list.length === 0 ? <div className="qo-sub" style={{ padding: 30 }}>No quotes here yet.</div> : list.map((p) => (
            <div key={p.id} style={{ borderBottom: '1px dashed var(--livv-cream-300)' }}>
              <div onClick={() => setOpen(open === p.id ? null : p.id)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 4px', cursor: 'pointer' }}>
                <span style={{ color: 'var(--livv-cream-400)', fontSize: 17, transform: open === p.id ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}>›</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 10 }}>{p.title} <Badge status={p.status} /></div>
                  <div style={{ fontSize: 12, color: 'var(--livv-cream-500)', marginTop: 3 }}>{p.project_type || p.summary || '—'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="qo-money" style={{ fontSize: 15 }}>{money(p.pricing_total)}</div>
                  <div className="qo-mono" style={{ fontSize: 10, color: 'var(--livv-cream-400)' }}>{(p.updated_at || p.created_at || '').slice(0, 10)}</div>
                </div>
              </div>
              {open === p.id && (
                <div className="qo-pop" style={{ padding: '2px 4px 22px 34px', display: 'flex', gap: 10 }}>
                  <button className="qo-btn secondary sm">Re-quote / edit</button>
                  <button className="qo-btn secondary sm" style={{ color: 'var(--livv-cream-500)' }}>Duplicate</button>
                </div>
              )}
            </div>
          ))}
        </>
      ) : (
        <div className="qo-sub" style={{ padding: 20 }}>Insights — consistency checks live in the Dashboard view.</div>
      )}
    </section>
  );
}

// ============================================================ ONBOARDING
function OnboardingView({ onboardings, reload }) {
  const [active, setActive] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const sync = async () => {
    setBusy(true);
    try { const pv = await quotingApi.previewSync({ onboardingId: active.id }); setPreview(pv); } catch (e) { setPreview({ error: e.message }); } finally { setBusy(false); }
  };
  const confirm = async () => {
    setBusy(true);
    try { const r = await quotingApi.syncToLean({ onboardingId: active.id }); setDone(r); reload && reload(); } catch (e) { setDone({ error: e.message }); } finally { setBusy(false); }
  };

  if (!active) {
    return (
      <section style={{ padding: '34px 40px 64px', maxWidth: 1080 }}>
        <Eyebrow>Approved quotes → onboarding</Eyebrow>
        <h2 className="qo-h2" style={{ marginBottom: 10 }}>Start an onboarding</h2>
        <p className="qo-sub" style={{ maxWidth: 560, marginBottom: 26 }}>Pick an approved quote. The engine turns it into a live project — checklist, owners, assets and access — generated from exactly what was sold.</p>
        {onboardings.length === 0 ? <div className="qo-card" style={{ padding: 30, textAlign: 'center', color: 'var(--livv-cream-400)' }}>No onboardings yet. Approve a quote, then "Onboard".</div> : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {onboardings.map((o) => (
              <button key={o.id} className="qo-card" onClick={() => { setActive(o); setPreview(null); setDone(null); }} style={{ padding: 20, textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ flex: 1, fontSize: 16, fontWeight: 500 }}>{o.plan?.project?.title || 'Onboarding'}</span>
                  <Badge status={o.status} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--livv-cream-300)', paddingTop: 10 }}>
                  <span className="qo-money" style={{ fontSize: 15 }}>{money(o.approved_value)}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--livv-wine-500)' }}>Start onboarding →</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    );
  }

  const plan = active.plan || {};
  return (
    <section style={{ padding: '34px 40px 64px', maxWidth: 1080 }}>
      <button className="qo-cap" style={{ marginBottom: 16 }} onClick={() => setActive(null)}>← All approved quotes</button>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
        <div><Eyebrow>Approved quote → project</Eyebrow><h2 className="qo-h2" style={{ marginBottom: 8 }}>{plan.project?.title || 'New Project'}</h2></div>
        {active.status !== 'synced' && <button className="qo-btn gold" onClick={sync} disabled={busy}>{busy && !preview ? <Spin /> : 'Sync with Lean ↗'}</button>}
      </div>
      <p className="qo-sub" style={{ maxWidth: 600, marginBottom: 22 }}>Approved quote converted into a project structure — checklist, owners, assets and access, ready to sync with Lean.</p>

      {preview && !preview.error && !done && (
        <div className="qo-pop qo-card" style={{ padding: '18px 22px', marginBottom: 22, borderColor: 'var(--livv-gold)' }}>
          <div className="qo-eyebrow gold" style={{ marginBottom: 10 }}>Ready to sync with Lean</div>
          <div className="qo-sub" style={{ marginBottom: 14 }}>{preview.summary?.stages} stages · {preview.summary?.tasks} tasks · {preview.summary?.accesses} accesses · {preview.summary?.assetsPending} assets pending</div>
          <button className="qo-btn gold" onClick={confirm} disabled={busy}>{busy ? <Spin /> : 'Confirm — create the project'}</button>
        </div>
      )}
      {preview?.error && <p style={{ color: 'var(--livv-brick)' }}>⚠ {preview.error}</p>}
      {done && !done.error && <div className="qo-pop qo-card" style={{ padding: '18px 22px', marginBottom: 22, borderColor: 'var(--livv-sage)' }}><div className="qo-eyebrow sage" style={{ marginBottom: 8 }}>Synced ✓</div><div className="qo-sub">Created {done.tasks} tasks across {done.milestones} stages. Project is live in Lean.</div></div>}
      {done?.error && <p style={{ color: 'var(--livv-brick)' }}>⚠ {done.error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 22 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {(plan.stages || []).map((st, i) => (
            <div key={i} className="qo-card" style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{st.title}</span>
                <span className="qo-mono" style={{ fontSize: 11, color: 'var(--livv-cream-400)' }}>{st.due_date || `Stage ${i + 1}`}</span>
              </div>
              {(st.tasks || []).map((t, j) => (
                <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
                  <span className="qo-check" />
                  <span style={{ flex: 1, fontSize: 14, color: 'var(--livv-wine-500)' }}>{t.title}</span>
                  <span className="qo-mono" style={{ fontSize: 10, color: 'var(--livv-cream-400)' }}>{t.owner_role || '—'}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="qo-card" style={{ padding: '18px 20px' }}>
            <div className="qo-eyebrow muted" style={{ marginBottom: 14 }}>Pending assets</div>
            {(plan.assets_pending || []).map((a, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '8px 0', fontSize: 14, color: 'var(--livv-wine-500)' }}>{a.name}<span className="qo-badge gold" style={{ marginLeft: 'auto' }}>{a.status || 'waiting'}</span></div>)}
            {!(plan.assets_pending || []).length && <div className="qo-sub">None flagged.</div>}
          </div>
          <div className="qo-card" style={{ padding: '18px 20px' }}>
            <div className="qo-eyebrow muted" style={{ marginBottom: 14 }}>Access needed</div>
            {(plan.accesses_needed || []).map((a, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', fontSize: 14, color: 'var(--livv-wine-500)' }}><span className="qo-check" />{a.service}</div>)}
            {!(plan.accesses_needed || []).length && <div className="qo-sub">None flagged.</div>}
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================ DASHBOARD
function DashboardView({ memory }) {
  const { projects, proposals } = memory;
  const pipeline = proposals.reduce((a, p) => a + numOf(p.pricing_total), 0);
  const byName = {};
  proposals.forEach((p) => (p.pricing_snapshot?.items || []).forEach((it) => { if (it.name) (byName[it.name] = byName[it.name] || []).push(numOf(it.livv)); }));
  const checks = Object.entries(byName).slice(0, 6).map(([n, a]) => ({ n, avg: Math.round(a.reduce((x, y) => x + y, 0) / a.length) }));
  const stats = [['Quotes on record', proposals.length, 'across clients'], ['Pipeline · Livv', money(pipeline), 'quoted cost'], ['Client-facing', money(pipeline * 1.38), 'after markup'], ['Active projects', projects.length, 'in delivery']];

  return (
    <section style={{ padding: '34px 40px 64px', maxWidth: 1180 }}>
      <Eyebrow>Project history · consistency</Eyebrow>
      <h2 className="qo-h2" style={{ marginBottom: 26 }}>Pricing memory</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 26 }}>
        {stats.map(([l, v, s]) => <div key={l} className="qo-card" style={{ padding: '22px 20px' }}><div className="qo-stat-val" style={{ fontSize: 32 }}>{typeof v === 'number' ? v : v}</div><div style={{ fontSize: 13, color: 'var(--livv-wine-500)', marginTop: 10 }}>{l}</div><div className="qo-mono" style={{ fontSize: 10, color: 'var(--livv-cream-400)', marginTop: 8, textTransform: 'uppercase' }}>{s}</div></div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 24 }}>
        <div className="qo-card" style={{ borderRadius: 20, overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.8fr auto', gap: 8, padding: '13px 22px', background: 'var(--livv-cream-100)', borderBottom: '1px solid var(--livv-cream-300)' }}>
            {['Project', 'Budget', 'Status'].map((h) => <span key={h} className="qo-mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--livv-cream-500)' }}>{h}</span>)}
          </div>
          {projects.slice(0, 10).map((pr) => (
            <div key={pr.id} style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.8fr auto', gap: 8, padding: '13px 22px', borderBottom: '1px solid var(--livv-cream-200)', alignItems: 'center' }}>
              <span style={{ fontSize: 13.5, fontWeight: 500 }}>{pr.title}</span>
              <span className="qo-money" style={{ fontSize: 13, color: 'var(--livv-cream-600)' }}>{money(pr.budget_total)}</span>
              <Badge status={pr.status} />
            </div>
          ))}
          {projects.length === 0 && <div style={{ padding: 30, color: 'var(--livv-cream-400)' }}>No projects yet.</div>}
        </div>
        <div className="qo-card" style={{ padding: '20px 22px' }}>
          <div className="qo-eyebrow" style={{ marginBottom: 16 }}>Consistency checks</div>
          {checks.length === 0 ? <div className="qo-sub">Not enough history yet.</div> : checks.map((c) => (
            <div key={c.n} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', fontSize: 14, color: 'var(--livv-wine-500)' }}>
              <span className="qo-dot on" /><span>{c.n}</span><span className="qo-money" style={{ marginLeft: 'auto', color: 'var(--livv-cream-600)' }}>{money(c.avg)} avg</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================ SHELL
export default function QuoteOS({ onExit }) {
  const [view, setView] = useState('home');
  const [session, setSession] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [memory, setMemory] = useState({ projects: [], proposals: [] });
  const [services, setServices] = useState([]);
  const [onboardings, setOnboardings] = useState([]);

  const load = useCallback(async () => {
    const [s, p, m, sv, ob] = await Promise.all([
      getQuotingSession().catch(() => null), listProposals().catch(() => []),
      pricingMemory().catch(() => ({ projects: [], proposals: [] })), listServices().catch(() => []),
      listOnboardings().catch(() => []),
    ]);
    setSession(s); setProposals(p); setMemory(m); setServices(sv); setOnboardings(ob);
  }, []);
  useEffect(() => { load(); }, [load]);

  const approvedReady = onboardings.filter((o) => o.status !== 'synced').length;
  const hasDraft = false;

  const nav = [
    { kind: 'head', label: 'Workspace' },
    { id: 'home', label: 'Home', icon: 'home' },
    { kind: 'head', label: 'Pipeline' },
    ...(hasDraft ? [{ id: 'build', label: 'Current draft', icon: 'draft', badge: 'live' }] : []),
    { id: 'review', label: 'Quotes', icon: 'quotes', badge: String(proposals.length || '') },
    { kind: 'head', label: 'Delivery' },
    { id: 'onboarding', label: 'Onboarding', icon: 'onboarding', badge: approvedReady ? `${approvedReady} ready` : '' },
    { kind: 'head', label: 'Memory' },
    { id: 'dashboard', label: 'History', icon: 'history' },
  ];

  return (
    <div className="quote-os">
      <aside className="qo-side">
        <div className="qo-logo-wrap" onClick={() => setView('home')}>
          <div className="qo-logo"><span>LV</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="qo-brand-name">Livv Studio</span>
            <span className="qo-brand-sub">Quote OS</span>
          </div>
        </div>
        {nav.map((n, i) => n.kind === 'head' ? (
          <div key={i} className="qo-side-head">{n.label}</div>
        ) : (
          <button key={n.id} className={`qo-nav-item${view === n.id ? ' on' : ''}`} onClick={() => setView(n.id)}>
            <span className="qo-nav-tile"><Icon d={ICONS[n.icon]} /></span>
            <span className="qo-nav-label">{n.label}</span>
            {n.badge ? <span className="qo-nav-badge">{n.badge}</span> : null}
          </button>
        ))}
        <div className="qo-quick-wrap">
          <div className="qo-side-head" style={{ padding: '0 4px 9px' }}>Quick actions</div>
          <div className="qo-quick-row">
            {[['▶', 'New', 'home'], ['⟳', 'Sync', 'onboarding'], ['↓', 'Export', 'review']].map(([g, l, v]) => (
              <button key={l} className="qo-quick" onClick={() => setView(v)}><span className="qo-quick-sphere">{g}</span><span className="qo-quick-label">{l}</span></button>
            ))}
          </div>
          <div className="qo-foot">Where art meets business.<br />Buenos Aires · LATAM + US</div>
        </div>
      </aside>

      <main className="qo-main">
        {onExit && <button className="qo-btn secondary sm qo-exit" onClick={onExit}>Exit ✕</button>}
        {view === 'home' && <HomeView go={setView} onGenerated={() => listProposals().then(setProposals)} />}
        {view === 'build' && <BuildView services={services} onExit={() => setView('home')} onApprove={() => setView('onboarding')} />}
        {view === 'review' && <ReviewView proposals={proposals} />}
        {view === 'onboarding' && <OnboardingView onboardings={onboardings} reload={load} />}
        {view === 'dashboard' && <DashboardView memory={memory} />}
      </main>
    </div>
  );
}
