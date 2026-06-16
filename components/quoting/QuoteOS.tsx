// @ts-nocheck
// Livv Quote OS — self-contained quoting + onboarding surface.
// Renders full-screen (its own shell). Wired to the live edge functions
// (quoting-generate / onboarding-generate / onboarding-sync) and the
// shared Supabase tables (RLS-scoped). Mounted at ?app=quoting.
import React, { useEffect, useState, useCallback } from 'react';
import './quote-os.css';
import {
  getQuotingSession, listProposals, pricingMemory, listServices, listOnboardings,
  quotingApi,
} from '@/lib/quoting/api';
import { calculatePrice } from '@/lib/quoting/calculator';

const fmt = (n, c = 'USD') =>
  n == null ? '—' : (c === 'USD' ? '$' : '') + Number(n).toLocaleString('en-US');

const num = (v) => {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  return Number(String(v).replace(/[^0-9.]/g, '')) || 0;
};

const STATUS_BADGE = {
  draft: { cls: '', label: 'Draft' }, sent: { cls: 'gold', label: 'Sent' },
  approved: { cls: 'sage', label: 'Approved' }, rejected: { cls: 'missing', label: 'Rejected' },
  synced: { cls: 'sage', label: 'Synced' }, reviewed: { cls: 'gold', label: 'Reviewed' },
  complete: { cls: 'sage', label: 'Complete' }, 'in progress': { cls: 'gold', label: 'In progress' },
};
const Badge = ({ status }) => {
  const k = String(status || 'draft').toLowerCase();
  const b = STATUS_BADGE[k] || { cls: '', label: status || '—' };
  return <span className={`qo-badge ${b.cls}`}>{b.label}</span>;
};

const Eyebrow = ({ label, wdx }) => (
  <div className="qo-eyebrow-row">
    <span className="qo-eyebrow">{label}</span>
    {wdx && <span className="qo-wdx">{wdx}</span>}
  </div>
);

const Spinner = () => <span className="qo-spinner" />;

// ============================================================ HOME
function HomeScreen({ onQuoted }) {
  const [brief, setBrief] = useState('');
  const [existing, setExisting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (!brief.trim() || loading) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await quotingApi.generateQuote({ brief, isExistingClient: existing });
      setResult(r); onQuoted && onQuoted(r);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  const renderItems = (items) => (items || []).map((it, i) => (
    <div className="qo-feat" key={i}>
      <span className={`qo-feat-dot ${it.complexity === 'advanced' || it.complexity === 'complex' ? 'gold' : ''}`} />
      <span className="qo-feat-name">{it.name}{it.timeline ? ` · ${it.timeline}` : ''}</span>
      <span className="qo-feat-price">{fmt(num(it.livv))}</span>
    </div>
  ));

  const opt = (title, o) => o && (
    <div className="qo-card qo-card-pad qo-fade" style={{ marginBottom: 16 }}>
      <div className="qo-panel-label">{title}</div>
      {renderItems(o.items)}
      <div className="qo-feat" style={{ borderBottom: 'none', marginTop: 6 }}>
        <span className="qo-feat-name" style={{ fontWeight: 500, color: 'var(--qo-ink)' }}>Total (Livv internal)</span>
        <span className="qo-feat-price" style={{ fontSize: 16 }}>{fmt(o.totals?.livv)}</span>
      </div>
    </div>
  );

  return (
    <div className="qo-fade">
      <Eyebrow label="© START スタート" />
      <h1 className="qo-h1">What are we quoting?</h1>
      <p className="qo-lead">Describe what the client needs in plain words — pages, features, the vibe, the deadline. The AI drafts the quote against Livv's real catalogue, and you edit everything after.</p>

      <div className="qo-composer">
        <div className="qo-composer-eyebrow"><span className="qo-composer-dot">+</span> Quote from a brief</div>
        <textarea className="qo-textarea" placeholder="e.g. A 5-page marketing site for a coffee brand, premium feel, subtle motion, contact form, launch in 3 weeks…" value={brief} onChange={(e) => setBrief(e.target.value)} />
        <div className="qo-composer-foot">
          <button className={`qo-chip ${existing ? '' : ''}`} onClick={() => setExisting((v) => !v)} style={existing ? { borderColor: 'var(--qo-ink)', color: 'var(--qo-ink)' } : {}}>
            {existing ? '✓ Existing client' : 'New client'}
          </button>
          <button className="qo-send" onClick={submit} disabled={loading || !brief.trim()} title="Generate quote">
            {loading ? <Spinner /> : '↑'}
          </button>
        </div>
      </div>

      {error && <p style={{ color: '#c0392b', marginTop: 18 }}>⚠ {error}</p>}

      {result && (
        <div style={{ marginTop: 28 }}>
          <Eyebrow label="© GENERATED QUOTE 見積" />
          {result.quote?.reasoning && <p className="qo-lead" style={{ marginBottom: 20 }}>{result.quote.reasoning}</p>}
          {result.priced?.mode === 'two_option' ? (
            <>{opt('Option 1 — Simple', result.priced.simple)}{opt('Option 2 — Premium', result.priced.premium)}</>
          ) : (
            opt('Quote', result.priced?.single)
          )}
          {result.quote?.excluded?.length > 0 && (
            <div className="qo-card qo-card-pad">
              <div className="qo-panel-label">Excluded</div>
              {result.quote.excluded.map((x, i) => <div className="qo-panel-row" key={i}>— {x}</div>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================ QUOTES
function QuotesScreen({ proposals, onStartOnboarding, busyId }) {
  return (
    <div className="qo-fade">
      <Eyebrow label="© SAVED QUOTES 見積" wdx="(WDX® — 02)" />
      <h1 className="qo-h1">Review a quote</h1>
      <p className="qo-lead">Every quote on record. Approved ones can be turned into a live project onboarding in one click.</p>
      {proposals.length === 0 ? (
        <div className="qo-card qo-empty">No quotes yet — start one from Home.</div>
      ) : proposals.map((p) => (
        <div className="qo-card" style={{ marginBottom: 14 }} key={p.id}>
          <div className="qo-row">
            <div className="qo-row-main">
              <div className="qo-row-title">{p.title} <Badge status={p.status} /></div>
              <div className="qo-row-sub">{p.project_type || p.summary || '—'}</div>
            </div>
            <div>
              <div className="qo-row-price">{fmt(p.pricing_total, p.currency)}</div>
              <div className="qo-row-date">{(p.updated_at || p.created_at || '').slice(0, 10)}</div>
            </div>
            {String(p.status).toLowerCase() === 'approved' ? (
              <button className="qo-btn gold" disabled={busyId === p.id} onClick={() => onStartOnboarding(p)}>
                {busyId === p.id ? <Spinner /> : 'Onboard →'}
              </button>
            ) : (
              <button className="qo-btn ghost">Edit</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================ HISTORY
function HistoryScreen({ memory }) {
  const { projects, proposals } = memory;
  const pipeline = proposals.reduce((s, p) => s + num(p.pricing_total), 0);
  const clientValue = Math.round(pipeline * 1.38);
  const onRecord = proposals.length;

  // consistency: avg livv price per item name across snapshots
  const byName = {};
  proposals.forEach((p) => (p.pricing_snapshot?.items || []).forEach((it) => {
    const k = it.name; if (!k) return; (byName[k] = byName[k] || []).push(num(it.livv));
  }));
  const consistency = Object.entries(byName).slice(0, 5).map(([name, arr]) => ({
    name, avg: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length), n: arr.length,
  }));

  return (
    <div className="qo-fade">
      <Eyebrow label="© PROJECT HISTORY · CONSISTENCY 履歴" wdx="(WDX® — 05)" />
      <h1 className="qo-h1">Pricing memory</h1>
      <div className="qo-grid qo-grid-4" style={{ marginBottom: 26 }}>
        <div className="qo-card qo-stat"><div className="qo-stat-value">{onRecord}</div><div className="qo-stat-label">Quotes on record</div><div className="qo-stat-sub">across clients</div></div>
        <div className="qo-card qo-stat"><div className="qo-stat-value">{fmt(pipeline)}</div><div className="qo-stat-label">Pipeline (Livv internal)</div><div className="qo-stat-sub">sum of quoted cost</div></div>
        <div className="qo-card qo-stat"><div className="qo-stat-value">{fmt(clientValue)}</div><div className="qo-stat-label">Client-facing value</div><div className="qo-stat-sub">after markup</div></div>
        <div className="qo-card qo-stat"><div className="qo-stat-value">{projects.length}</div><div className="qo-stat-label">Active projects</div><div className="qo-stat-sub">in delivery</div></div>
      </div>
      <div className="qo-grid qo-grid-2">
        <div className="qo-card">
          <div className="qo-card-pad" style={{ paddingBottom: 6 }}><div className="qo-panel-label">Projects</div></div>
          {projects.slice(0, 8).map((pr) => (
            <div className="qo-row" key={pr.id}>
              <div className="qo-row-main"><div className="qo-row-title" style={{ fontSize: 15 }}>{pr.title}</div><div className="qo-row-sub">{pr.status}</div></div>
              <div className="qo-row-price" style={{ fontSize: 17 }}>{fmt(pr.budget_total, pr.currency)}</div>
            </div>
          ))}
          {projects.length === 0 && <div className="qo-empty">No projects yet.</div>}
        </div>
        <div className="qo-card qo-card-pad">
          <div className="qo-panel-label">Consistency checks</div>
          {consistency.length === 0 ? <div className="qo-row-sub">Not enough history yet.</div> : consistency.map((c) => (
            <div className="qo-panel-row" key={c.name}>
              <span className="qo-feat-dot gold" />
              <span>{c.name}</span>
              <span className="qo-feat-price" style={{ marginLeft: 'auto' }}>{fmt(c.avg)} avg</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================ ONBOARDING
function OnboardingScreen({ onboardings, reload }) {
  const [active, setActive] = useState(null);
  const [preview, setPreview] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [done, setDone] = useState(null);

  const open = (o) => { setActive(o); setPreview(null); setDone(null); };

  const doPreview = async () => {
    setPreview('loading');
    try { const r = await quotingApi.previewSync({ onboardingId: active.id }); setPreview(r); }
    catch (e) { setPreview({ error: e.message }); }
  };
  const doSync = async () => {
    setSyncing(true);
    try { const r = await quotingApi.syncToLean({ onboardingId: active.id }); setDone(r); reload && reload(); }
    catch (e) { setDone({ error: e.message }); } finally { setSyncing(false); }
  };

  if (!active) {
    return (
      <div className="qo-fade">
        <Eyebrow label="© APPROVED QUOTE → PROJECT 開始" wdx="(WDX® — 03)" />
        <h1 className="qo-h1">Onboarding</h1>
        <p className="qo-lead">Approved quotes converted into project structures — checklists, owners, assets and access, ready to sync with Lean.</p>
        {onboardings.length === 0 ? (
          <div className="qo-card qo-empty">No onboardings yet. Approve a quote, then "Onboard →".</div>
        ) : onboardings.map((o) => (
          <div className="qo-card" style={{ marginBottom: 14 }} key={o.id}>
            <div className="qo-row">
              <div className="qo-row-main">
                <div className="qo-row-title">{o.plan?.project?.title || 'Onboarding'} <Badge status={o.status} /></div>
                <div className="qo-row-sub">{(o.plan?.stages || []).length} stages · {fmt(o.approved_value, o.currency)}</div>
              </div>
              <button className="qo-btn dark" onClick={() => open(o)}>Open</button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const plan = active.plan || {};
  return (
    <div className="qo-fade">
      <button className="qo-btn ghost" style={{ marginBottom: 18 }} onClick={() => setActive(null)}>← All onboardings</button>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
        <div>
          <Eyebrow label="© APPROVED QUOTE → PROJECT 開始" />
          <h1 className="qo-h1" style={{ marginBottom: 8 }}>{plan.project?.title || 'New Project'}</h1>
        </div>
        {active.status !== 'synced' && (
          <button className="qo-btn gold" onClick={doPreview} style={{ marginTop: 40 }}>Sync with Lean ↗</button>
        )}
      </div>
      <p className="qo-lead">Approved quote converted into a project structure — checklist, owners, assets and access, ready to sync with Lean.</p>

      {preview === 'loading' && <div className="qo-card qo-card-pad"><Spinner /> Preparing sync…</div>}
      {preview && preview !== 'loading' && !preview.error && !done && (
        <div className="qo-card qo-card-pad qo-fade" style={{ marginBottom: 22, borderColor: 'var(--qo-gold)' }}>
          <div className="qo-panel-label">Ready to sync with Lean</div>
          <div className="qo-row-sub" style={{ marginBottom: 14 }}>
            {preview.summary?.stages} stages · {preview.summary?.tasks} tasks · {preview.summary?.accesses} accesses · {preview.summary?.assetsPending} assets pending
          </div>
          <button className="qo-btn gold" onClick={doSync} disabled={syncing}>{syncing ? <Spinner /> : 'Confirm — create the project'}</button>
        </div>
      )}
      {preview?.error && <p style={{ color: '#c0392b' }}>⚠ {preview.error}</p>}
      {done && !done.error && <div className="qo-card qo-card-pad qo-fade" style={{ marginBottom: 22, borderColor: 'var(--qo-sage)' }}><div className="qo-panel-label">Synced ✓</div><div className="qo-row-sub">Created {done.tasks} tasks across {done.milestones} stages. Project is live in Lean.</div></div>}
      {done?.error && <p style={{ color: '#c0392b' }}>⚠ {done.error}</p>}

      <div className="qo-grid qo-grid-2">
        <div>
          {(plan.stages || []).map((st, i) => (
            <div className="qo-card qo-stage" key={i}>
              <div className="qo-stage-head"><span className="qo-stage-title">{st.title}</span><span className="qo-stage-week">{st.due_date || `Stage ${i + 1}`}</span></div>
              {(st.tasks || []).map((t, j) => (
                <div className="qo-task" key={j}>
                  <span className="qo-check" />
                  <span className="qo-task-title">{t.title}{t.optional ? ' · optional' : ''}</span>
                  <span className="qo-task-owner">{t.owner_role || '—'}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div>
          <div className="qo-card qo-card-pad" style={{ marginBottom: 18 }}>
            <div className="qo-panel-label">Pending assets</div>
            {(plan.assets_pending || []).map((a, i) => (
              <div className="qo-panel-row" key={i}>{a.name}<span className="qo-badge waiting">{a.status || 'waiting'}</span></div>
            ))}
            {(plan.assets_pending || []).length === 0 && <div className="qo-row-sub">None flagged.</div>}
          </div>
          <div className="qo-card qo-card-pad">
            <div className="qo-panel-label">Access needed</div>
            {(plan.accesses_needed || []).map((a, i) => (
              <div className="qo-panel-row" key={i}><span className="qo-check" />{a.service}</div>
            ))}
            {(plan.accesses_needed || []).length === 0 && <div className="qo-row-sub">None flagged.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================ NEW PROJECT (quote engine)
const PROJECT_TYPES = ['Marketing Website', 'Landing Page', 'E-commerce (Shopify)', 'Web Application', 'Mobile App'];
function NewProjectScreen({ services }) {
  const [ptype, setPtype] = useState(PROJECT_TYPES[0]);
  const [selected, setSelected] = useState({});
  const toggle = (id) => setSelected((s) => ({ ...s, [id]: !s[id] }));

  const chosen = services.filter((s) => selected[s.id]);
  const simple = chosen.reduce((sum, s) => sum + calculatePrice(s, { complexity: 'simple' }).livvPrice, 0);
  const premium = chosen.reduce((sum, s) => sum + calculatePrice(s, { complexity: 'advanced' }).livvPrice, 0);
  const total = chosen.reduce((sum, s) => sum + calculatePrice(s, {}).livvPrice, 0);
  const client = Math.round(total * 1.38);

  return (
    <div className="qo-fade">
      <Eyebrow label="© NEW PROJECT 新規" wdx="(WDX® — 01)" />
      <h1 className="qo-h1">Configure the build</h1>
      <p className="qo-lead">Select scope and the engine prices it against Livv's real catalogue. A leaner Simple and a fuller Premium build below.</p>

      <div className="qo-card qo-card-pad" style={{ maxWidth: 380, marginBottom: 26 }}>
        <div className="qo-panel-label" style={{ marginBottom: 8 }}>Configured · Livv internal</div>
        <div className="qo-stat-value" style={{ fontSize: 44 }}>{fmt(total)}</div>
        <div className="qo-stat-sub">Client price · {fmt(client)} (38% markup) · Simple {fmt(simple)} / Premium {fmt(premium)}</div>
      </div>

      <div className="qo-panel-label">Project type</div>
      <div className="qo-pills">
        {PROJECT_TYPES.map((t) => <button key={t} className={`qo-pill ${t === ptype ? 'is-active' : ''}`} onClick={() => setPtype(t)}>{t}</button>)}
      </div>

      <div className="qo-card" style={{ marginTop: 22 }}>
        <div className="qo-card-pad" style={{ paddingBottom: 4 }}>
          <div className="qo-panel-label" style={{ margin: 0 }}>© Feature catalogue 機能</div>
          <div className="qo-row-sub" style={{ marginTop: 4 }}>Real per-feature pricing. Toggle to build the quote.</div>
        </div>
        <div style={{ padding: '4px 28px 18px' }}>
          {services.map((s) => (
            <div className="qo-feat" key={s.id} onClick={() => toggle(s.id)} style={{ cursor: 'pointer' }}>
              <span className={`qo-check ${selected[s.id] ? 'on' : ''}`}>{selected[s.id] ? '✓' : ''}</span>
              <span className="qo-feat-name">{s.name}</span>
              <span className="qo-feat-price">{fmt(s.fixed_price)}</span>
            </div>
          ))}
          {services.length === 0 && <div className="qo-empty">Catalogue is empty.</div>}
        </div>
      </div>
    </div>
  );
}

// ============================================================ SHELL
const NAV = [
  { id: 'home', num: '01', label: 'Home', jp: '入口' },
  { id: 'new', num: '02', label: 'New Project', jp: '新規' },
  { id: 'quotes', num: '03', label: 'Quotes', jp: '見積' },
  { id: 'onboarding', num: '04', label: 'Onboarding', jp: '開始' },
  { id: 'history', num: '05', label: 'History', jp: '履歴' },
];

export default function QuoteOS({ onExit }) {
  const [screen, setScreen] = useState('home');
  const [session, setSession] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [memory, setMemory] = useState({ projects: [], proposals: [] });
  const [services, setServices] = useState([]);
  const [onboardings, setOnboardings] = useState([]);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    const [s, p, m, sv, ob] = await Promise.all([
      getQuotingSession().catch(() => null),
      listProposals().catch(() => []),
      pricingMemory().catch(() => ({ projects: [], proposals: [] })),
      listServices().catch(() => []),
      listOnboardings().catch(() => []),
    ]);
    setSession(s); setProposals(p); setMemory(m); setServices(sv); setOnboardings(ob);
  }, []);
  useEffect(() => { load(); }, [load]);

  const startOnboarding = async (proposal) => {
    setBusyId(proposal.id);
    try {
      await quotingApi.generateOnboarding({ proposalId: proposal.id });
      const ob = await listOnboardings(); setOnboardings(ob); setScreen('onboarding');
    } catch (e) { alert('Onboarding generation failed: ' + e.message); }
    finally { setBusyId(null); }
  };

  return (
    <div className="quote-os">
      <aside className="qo-side">
        <div className="qo-brand">
          <div className="qo-logo">LV</div>
          <div><div className="qo-brand-name">Livv Studio</div><div className="qo-brand-sub">Quote OS</div></div>
        </div>
        <div className="qo-side-label">© Workspace ワークスペース</div>
        <nav className="qo-nav">
          {NAV.map((n) => (
            <button key={n.id} className={`qo-nav-item ${screen === n.id ? 'is-active' : ''}`} onClick={() => setScreen(n.id)}>
              <span className="qo-nav-num">{n.num}</span>
              <span className="qo-nav-label">{n.label}</span>
              <span className="qo-nav-jp">{n.jp}</span>
            </button>
          ))}
        </nav>
        <div className="qo-side-label">© Quick actions クイック</div>
        <div className="qo-quick">
          <button className="qo-quick-item" onClick={() => setScreen('home')}><span className="qo-quick-dot blue">+</span> New quote</button>
          <button className="qo-quick-item" onClick={() => setScreen('onboarding')}><span className="qo-quick-dot purple">↻</span> Sync to Lean</button>
        </div>
        <div className="qo-side-foot">Where art meets business.<br />Buenos Aires · LATAM + US<br />livvvv.com{session?.name ? ` · ${session.name}` : ''}</div>
      </aside>

      <main className="qo-main">
        {onExit && <button className="qo-exit" onClick={onExit}>Exit ✕</button>}
        {screen === 'home' && <HomeScreen onQuoted={() => listProposals().then(setProposals)} />}
        {screen === 'new' && <NewProjectScreen services={services} />}
        {screen === 'quotes' && <QuotesScreen proposals={proposals} onStartOnboarding={startOnboarding} busyId={busyId} />}
        {screen === 'onboarding' && <OnboardingScreen onboardings={onboardings} reload={load} />}
        {screen === 'history' && <HistoryScreen memory={memory} />}
      </main>
    </div>
  );
}
