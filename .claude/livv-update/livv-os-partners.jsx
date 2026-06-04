// LIVV OS — Partners (Growth) + Higgsfield connection + Pinterest style replicator
const { useState: usePtS, useEffect: usePtE } = React;

// ─────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────
const PARTNERS = [
  { id: 1, name: 'Iris Tanaka',     company: 'Sable Loft',          type: 'Referrer',  code: 'IRIS-SABLE',  link: 'livvvv.com/r/iris-sable',     leads: 18, conv: 6, rate: '33%', accrued: 18400, pending: 4200,  status: 'active',  initials: 'IT', color: 'var(--accent)', joined: 'Jan 18' },
  { id: 2, name: 'Marc Cohen',      company: 'Beacon Strategy',     type: 'Reseller',  code: 'MARC-BCN',    link: 'livvvv.com/r/marc-bcn',       leads: 12, conv: 4, rate: '33%', accrued: 22800, pending: 8400,  status: 'active',  initials: 'MC', color: 'var(--sky)',    joined: 'Feb 04' },
  { id: 3, name: 'Sofia Lin',       company: 'Northwind SaaS',      type: 'Affiliate', code: 'SOFIA-NW',    link: 'livvvv.com/r/sofia-nw',       leads: 24, conv: 8, rate: '33%', accrued: 16200, pending: 1800,  status: 'active',  initials: 'SL', color: 'var(--sage)',   joined: 'Feb 22' },
  { id: 4, name: 'Camila Ortíz',    company: 'Mulberry Group',      type: 'Referrer',  code: 'CAM-MULB',    link: 'livvvv.com/r/cam-mulb',       leads: 5,  conv: 2, rate: '40%', accrued: 6800,  pending: 2400,  status: 'active',  initials: 'CO', color: 'var(--pink)',   joined: 'Mar 11' },
  { id: 5, name: 'Theo Renard',     company: 'Quill Studio',        type: 'Referrer',  code: 'THEO-Q',      link: 'livvvv.com/r/theo-q',         leads: 7,  conv: 1, rate: '14%', accrued: 2400,  pending: 0,     status: 'active',  initials: 'TR', color: 'var(--purple)', joined: 'Mar 28' },
  { id: 6, name: 'Hugo Vela',       company: 'Ember Consulting',    type: 'Affiliate', code: 'HUGO-EMBR',   link: 'livvvv.com/r/hugo-embr',      leads: 3,  conv: 0, rate: '0%',  accrued: 600,   pending: 600,   status: 'paused',  initials: 'HV', color: 'var(--wine)',   joined: 'Apr 02' },
  { id: 7, name: 'Anika Roy',       company: 'Boreal Beauty',       type: 'Reseller',  code: 'ANIKA-BRL',   link: 'livvvv.com/r/anika-brl',      leads: 0,  conv: 0, rate: '—',   accrued: 0,     pending: 0,     status: 'invited', initials: 'AR', color: '#A855F7',       joined: 'May 14' },
];

const COMMISSION_MODELS = {
  Referrer:  { impl: '12%', mrr: '8%',  flat: null,    period: 60, min: 500  },
  Reseller:  { impl: '20%', mrr: '15%', flat: null,    period: 90, min: 1000 },
  Affiliate: { impl: '8%',  mrr: '5%',  flat: '$200',  period: 30, min: 250  },
};

// Selected partner (Iris) — activity timeline
const PARTNER_ACTIVITY = [
  { date: 'May 18', lead: 'Helios Studio',    status: 'New',          value: null, commission: 0,    cls: 'tl-dm' },
  { date: 'May 12', lead: 'Verdant Hill',     status: 'Contacted',    value: null, commission: 0,    cls: 'tl-email' },
  { date: 'May 02', lead: 'Mulberry Group',   status: 'Call Done',    value: null, commission: 0,    cls: 'tl-call' },
  { date: 'Apr 28', lead: 'Cremona Capital',  status: 'Won',          value: 34800, commission: 4176, cls: 'tl-call' },
  { date: 'Apr 18', lead: 'Sable Loft (own)', status: 'Won',          value: 39800, commission: 4776, cls: 'tl-call' },
  { date: 'Mar 22', lead: 'Iron Path',        status: 'Lost',         value: null, commission: 0,    cls: 'tl-email' },
];

const PARTNER_PAYOUTS = [
  { date: 'May 01', amount: 8200, method: 'Bank transfer',     status: 'paid' },
  { date: 'Apr 01', amount: 6000, method: 'PayPal',            status: 'paid' },
  { date: 'Mar 01', amount: 4200, method: 'Service credit',    status: 'paid' },
];

// ─────────────────────────────────────────────────────────────
// PARTNERS TAB
// ─────────────────────────────────────────────────────────────
const GrowthPartners = ({ onOpenPartner }) => {
  const [filter, setFilter] = usePtS('all');
  const filtered = filter === 'all'
    ? PARTNERS
    : PARTNERS.filter(p => filter === p.status || filter === p.type.toLowerCase());

  const totalLeads = PARTNERS.reduce((s, p) => s + p.leads, 0);
  const totalConv  = PARTNERS.reduce((s, p) => s + p.conv, 0);
  const totalPending = PARTNERS.reduce((s, p) => s + p.pending, 0);

  return (
    <>
      <div className="kpi-row">
        {[
          { lbl: 'Active partners', icon: 'team',     v: PARTNERS.filter(p => p.status === 'active').length, target: `/ ${PARTNERS.length} total`,  delta: { dir: 'up', n: '+2' } },
          { lbl: 'Leads · this mo', icon: 'sales',    v: 14,                                                  target: `/ ${totalLeads} all-time`,    delta: { dir: 'up', n: '+38%' } },
          { lbl: 'Conversions · this mo', icon: 'activity', v: 5,                                            target: `/ ${totalConv} all-time`,     delta: { dir: 'up', n: '+25%' } },
          { lbl: 'Pending payouts', icon: 'money',    v: `$${(totalPending/1000).toFixed(1)}K`, target: 'across 4 partners',                       delta: { dir: 'flat', n: 'ready' } },
        ].map((k, i) => (
          <div className="kpi" key={i}>
            <div className="kpi-head">
              <span className="kpi-lbl"><span className="ic"><OS_ICON name={k.icon} size={11}/></span>{k.lbl}</span>
              <span className={`kpi-delta ${k.delta.dir}`}>
                {k.delta.dir === 'up' && '↑'}{k.delta.dir === 'down' && '↓'}{k.delta.dir === 'flat' && '●'} {k.delta.n}
              </span>
            </div>
            <div className="kpi-row-val"><span className="kpi-v">{k.v}</span><span className="kpi-target">{k.target}</span></div>
          </div>
        ))}
      </div>

      <section className="card" style={{ marginBottom: 18 }}>
        <header className="card-head">
          <span className="card-title"><span className="ic"><OS_ICON name="activity" size={12}/></span>Leads vs conversions · last 3 months</span>
        </header>
        <div className="card-body">
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 160, padding: '12px 0' }}>
            {['Mar','Apr','May'].map((m, mi) => (
              <div key={m} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ height: 130, width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 6 }}>
                  {PARTNERS.slice(0, 5).map(p => (
                    <div key={p.id} style={{ width: 8, display: 'flex', flexDirection: 'column-reverse', gap: 2 }}>
                      <div style={{ height: (10 + mi * 4 + (p.id * 2)), background: p.color, opacity: 0.85, borderRadius: 2 }}/>
                      <div style={{ height: (4 + mi * 2 + p.id), background: p.color, opacity: 0.35, borderRadius: 2 }}/>
                    </div>
                  ))}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--os-fg-2)' }}>{m}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', paddingTop: 8, borderTop: '1px dashed rgba(90,62,62,0.10)', fontSize: 11, color: 'var(--os-fg-2)', fontFamily: 'var(--font-mono)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--os-fg-2)' }}/>Leads (lighter)</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--os-fg-0)' }}/>Conversions (darker)</span>
          </div>
        </div>
      </section>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div className="filter-row">
          {[
            { id: 'all', label: 'All', count: PARTNERS.length },
            { id: 'referrer', label: 'Referrers', count: PARTNERS.filter(p => p.type === 'Referrer').length },
            { id: 'reseller', label: 'Resellers', count: PARTNERS.filter(p => p.type === 'Reseller').length },
            { id: 'affiliate', label: 'Affiliates', count: PARTNERS.filter(p => p.type === 'Affiliate').length },
            { id: 'invited', label: 'Invited', count: PARTNERS.filter(p => p.status === 'invited').length },
          ].map(f => (
            <button key={f.id} className={`fc ${filter === f.id ? 'active' : ''}`} onClick={() => setFilter(f.id)}>
              {f.label}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, padding: '1px 6px', borderRadius: 5, background: filter === f.id ? 'rgba(255,255,255,0.18)' : 'var(--os-surface-2)', color: filter === f.id ? 'var(--livv-cream-50)' : 'var(--os-fg-2)' }}>{f.count}</span>
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="so-action" style={{ flex: 0 }}><OS_ICON name="layout" size={13}/>Widget builder</button>
          <button className="so-action primary" style={{ flex: 0 }}><OS_ICON name="plus" size={13}/>Invite partner</button>
        </div>
      </div>

      <section className="card">
        <div className="pkg-table">
          <div className="pkg-row pkg-head" style={{ gridTemplateColumns: '32px 1.4fr 100px 1fr 70px 70px 90px 90px 22px' }}>
            <span/>
            <span>Partner</span>
            <span>Type</span>
            <span>Code / link</span>
            <span>Leads</span>
            <span>Conv</span>
            <span>Accrued</span>
            <span>Pending</span>
            <span/>
          </div>
          {filtered.map(p => (
            <div key={p.id} className="pkg-row" style={{ gridTemplateColumns: '32px 1.4fr 100px 1fr 70px 70px 90px 90px 22px' }} onClick={() => onOpenPartner(p)}>
              <span className="av" style={{ background: p.color, marginLeft: 0 }}>{p.initials}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--os-fg-0)' }}>{p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--os-fg-2)', marginTop: 2 }}>{p.company}</div>
              </div>
              <span className="conn-perm" style={{ width: 'fit-content' }}>{p.type}</span>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--os-fg-1)' }}>{p.link}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--os-fg-3)', marginTop: 2 }}>{p.code}</div>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--os-fg-0)', fontWeight: 500 }}>{p.leads}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--os-fg-0)', fontWeight: 500 }}>{p.conv} <small style={{ color: 'var(--os-fg-3)', fontSize: 10 }}>· {p.rate}</small></span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--os-fg-1)' }}>${(p.accrued/1000).toFixed(1)}K</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: p.pending > 0 ? 'var(--accent)' : 'var(--os-fg-3)', fontWeight: p.pending > 0 ? 500 : 400 }}>{p.pending > 0 ? `$${(p.pending/1000).toFixed(1)}K` : '—'}</span>
              <OS_ICON name="chev" size={12} style={{ color: 'var(--os-fg-3)' }}/>
            </div>
          ))}
        </div>
      </section>
    </>
  );
};

// ─────────────────────────────────────────────────────────────
// PARTNER DETAIL SLIDE-OVER
// ─────────────────────────────────────────────────────────────
const PARTNER_SECTIONS = [
  { id: 'link',       label: 'Link & code', icon: 'link' },
  { id: 'commission', label: 'Commission',  icon: 'money' },
  { id: 'activity',   label: 'Activity',    icon: 'activity' },
  { id: 'payouts',    label: 'Payouts',     icon: 'docs' },
  { id: 'materials',  label: 'Materials',   icon: 'palette' },
];

const PartnerDetail = ({ partner, onClose }) => {
  const [sec, setSec] = usePtS('link');
  const commission = COMMISSION_MODELS[partner.type];

  usePtE(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="so-overlay" onClick={onClose}/>
      <aside className="so so-wide" style={{ '--icp-color': partner.color }} data-screen-label="Partner Detail">
        <header className="so-head">
          <div className="av" style={{ background: partner.color, width: 44, height: 44, fontSize: 13, borderRadius: 12, marginLeft: 0 }}>{partner.initials}</div>
          <div className="so-titleline">
            <div className="so-title">
              {partner.name}
              <span className={`brand-status ${partner.status === 'active' ? 'active' : partner.status === 'invited' ? 'draft' : 'archived'}`}>{partner.status}</span>
            </div>
            <div className="so-sub">
              <span>{partner.company}</span>
              <span className="sep">·</span>
              <span><strong style={{ color: 'var(--os-fg-0)', fontWeight: 500 }}>{partner.type}</strong></span>
              <span className="sep">·</span>
              <span>since {partner.joined}</span>
            </div>
          </div>
          <div className="so-actions">
            <button className="so-iconbtn" title="Pause"><OS_ICON name="cog" size={14}/></button>
            <button className="so-iconbtn" onClick={onClose}><OS_ICON name="close" size={14} stroke={2}/></button>
          </div>
        </header>

        <div className="so-value">
          <div className="so-vbox">
            <div className="so-vlbl">Leads</div>
            <div className="so-vval">{partner.leads}</div>
          </div>
          <div className="so-vbox">
            <div className="so-vlbl">Conversions</div>
            <div className="so-vval">{partner.conv} <small>· {partner.rate}</small></div>
          </div>
          <div className="so-vbox">
            <div className="so-vlbl">Pending</div>
            <div className="so-vval">${(partner.pending/1000).toFixed(1)}K</div>
          </div>
        </div>

        <nav className="brand-nav">
          {PARTNER_SECTIONS.map(s => (
            <button key={s.id} className={`brand-nav-item ${sec === s.id ? 'active' : ''}`} onClick={() => setSec(s.id)}>
              <OS_ICON name={s.icon} size={12}/>{s.label}
            </button>
          ))}
        </nav>

        <div className="so-body brand-body">
          {sec === 'link' && <PartnerLink partner={partner}/>}
          {sec === 'commission' && <PartnerCommission partner={partner} commission={commission}/>}
          {sec === 'activity' && <PartnerActivityView partner={partner}/>}
          {sec === 'payouts' && <PartnerPayoutsView partner={partner}/>}
          {sec === 'materials' && <PartnerMaterials partner={partner}/>}
        </div>
      </aside>
    </>
  );
};

const PartnerLink = ({ partner }) => (
  <div className="brand-stack">
    <div className="brand-section">
      <SectionTitle>Referral link</SectionTitle>
      <div className="ptr-copy-row">
        <span className="ptr-copy-val">https://{partner.link}</span>
        <button className="ptr-copy-btn"><OS_ICON name="docs" size={12}/>Copy</button>
      </div>
    </div>
    <div className="brand-section">
      <SectionTitle>Partner code</SectionTitle>
      <div className="ptr-copy-row">
        <span className="ptr-copy-val" style={{ fontFamily: 'var(--font-mono)', fontSize: 14, letterSpacing: '0.08em', fontWeight: 600 }}>{partner.code}</span>
        <button className="ptr-copy-btn"><OS_ICON name="docs" size={12}/>Copy</button>
      </div>
    </div>
    <div className="brand-section">
      <SectionTitle>QR code · downloadable</SectionTitle>
      <div className="ptr-qr">
        <svg width="120" height="120" viewBox="0 0 25 25">
          {Array.from({ length: 25 }).map((_, y) => Array.from({ length: 25 }).map((__, x) => {
            const corner = (x < 7 && y < 7) || (x >= 18 && y < 7) || (x < 7 && y >= 18);
            const inCorner = (x >= 1 && x <= 5 && y >= 1 && y <= 5) || (x >= 19 && x <= 23 && y >= 1 && y <= 5) || (x >= 1 && x <= 5 && y >= 19 && y <= 23);
            const innerCorner = (x >= 2 && x <= 4 && y >= 2 && y <= 4) || (x >= 20 && x <= 22 && y >= 2 && y <= 4) || (x >= 2 && x <= 4 && y >= 20 && y <= 22);
            const isBlack = corner ? (!inCorner || innerCorner) : ((x * 7 + y * 11 + partner.id * 3) % 5 < 2);
            return isBlack ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="var(--os-fg-0)"/> : null;
          }))}
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button className="so-action"><OS_ICON name="docs" size={12}/>Download PNG</button>
          <button className="so-action"><OS_ICON name="docs" size={12}/>Download SVG</button>
        </div>
      </div>
    </div>
    <div className="brand-section">
      <SectionTitle>UTM parameters</SectionTitle>
      <div className="ptr-utm">
        <div><span>utm_source</span><strong>livv-partners</strong></div>
        <div><span>utm_medium</span><strong>referral</strong></div>
        <div><span>utm_campaign</span><strong>{partner.code.toLowerCase()}</strong></div>
        <div><span>utm_content</span><strong>{partner.type.toLowerCase()}</strong></div>
      </div>
    </div>
    <div className="brand-section">
      <SectionTitle>Multiple links · 0</SectionTitle>
      <button className="log-btn"><OS_ICON name="plus" size={12}/>Create dedicated link per package</button>
    </div>
  </div>
);

const PartnerCommission = ({ partner, commission }) => (
  <div className="brand-stack">
    <div className="brand-section">
      <SectionTitle>Commission model · editable</SectionTitle>
      <div className="ptr-commission-grid">
        <div className="ptr-comm-card">
          <span className="ptr-comm-label">% on implementation</span>
          <span className="ptr-comm-val">{commission.impl}</span>
          <span className="ptr-comm-meta">one-time fee per closed deal</span>
        </div>
        <div className="ptr-comm-card">
          <span className="ptr-comm-label">% on retainer</span>
          <span className="ptr-comm-val">{commission.mrr}</span>
          <span className="ptr-comm-meta">recurring while client active</span>
        </div>
        {commission.flat && (
          <div className="ptr-comm-card">
            <span className="ptr-comm-label">Flat per conversion</span>
            <span className="ptr-comm-val">{commission.flat}</span>
            <span className="ptr-comm-meta">independent of deal size</span>
          </div>
        )}
      </div>
    </div>
    <div className="brand-section">
      <SectionTitle>Attribution rules</SectionTitle>
      <div className="ptr-utm">
        <div><span>Attribution window</span><strong>{commission.period} days</strong></div>
        <div><span>Minimum payout</span><strong>${commission.min}</strong></div>
        <div><span>Payout cadence</span><strong>Monthly · 1st of month</strong></div>
        <div><span>Currency</span><strong>USD</strong></div>
      </div>
    </div>
    <div className="brand-section">
      <SectionTitle>Lifetime accrued</SectionTitle>
      <div style={{ padding: '16px 18px', background: 'linear-gradient(135deg, var(--accent-soft) 0%, transparent 100%)', borderRadius: 12, border: '0.5px solid var(--accent-strong)', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#8b6a17', fontWeight: 600 }}>Total earned</div>
          <div style={{ fontSize: 30, fontWeight: 300, color: 'var(--os-fg-0)', letterSpacing: '-0.02em', marginTop: 6 }}>${partner.accrued.toLocaleString()}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--os-fg-2)' }}>Pending</div>
          <div style={{ fontSize: 18, fontWeight: 500, color: partner.pending > 0 ? 'var(--accent)' : 'var(--os-fg-3)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>${partner.pending.toLocaleString()}</div>
          {partner.pending > 0 && <button className="ptr-payout-btn" style={{ marginTop: 8 }}>Process payout</button>}
        </div>
      </div>
    </div>
  </div>
);

const PartnerActivityView = ({ partner }) => (
  <div className="brand-stack">
    <div className="brand-section">
      <SectionTitle>Referred leads · {PARTNER_ACTIVITY.length}</SectionTitle>
      <div className="timeline">
        {PARTNER_ACTIVITY.map((a, i) => (
          <div key={i} className="tl-item">
            <span className={`tl-dot ${a.status === 'Won' ? 'tl-call' : a.status === 'Lost' ? 'tl-email' : 'tl-dm'}`}>
              <OS_ICON name={a.status === 'Won' ? 'tasks' : a.status === 'Lost' ? 'close' : 'sales'} size={9}/>
            </span>
            <div className="tl-head">
              <span className="tl-channel">{a.lead}</span>
              <span className="tl-kind">{a.status}</span>
              <span className="tl-when">{a.date}</span>
            </div>
            <div className="tl-msg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>
                {a.value ? <>Deal value <strong style={{ color: 'var(--os-fg-0)', fontFamily: 'var(--font-mono)' }}>${a.value.toLocaleString()}</strong></> : 'In motion'}
              </span>
              {a.commission > 0 && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--accent)', fontWeight: 500 }}>
                  + ${a.commission.toLocaleString()} commission
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const PartnerPayoutsView = ({ partner }) => (
  <div className="brand-stack">
    <div className="brand-section">
      <SectionTitle>Payout history · {PARTNER_PAYOUTS.length} payments</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {PARTNER_PAYOUTS.map((p, i) => (
          <div key={i} className="ptr-payout-row">
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--os-fg-2)' }}>{p.date}</div>
              <div style={{ fontSize: 13, color: 'var(--os-fg-0)', marginTop: 3, fontWeight: 500 }}>${p.amount.toLocaleString()}</div>
            </div>
            <span className="conn-perm">{p.method}</span>
            <span className={`conn-status on`}><span className="dot"/>Paid</span>
          </div>
        ))}
      </div>
    </div>
    {partner.pending > 0 && (
      <div className="brand-section">
        <SectionTitle>Ready to process · ${partner.pending.toLocaleString()}</SectionTitle>
        <button className="so-action primary" style={{ width: '100%' }}>
          <OS_ICON name="bolt" size={13}/>Process payout now
        </button>
      </div>
    )}
  </div>
);

const PartnerMaterials = ({ partner }) => (
  <div className="brand-stack">
    <div className="brand-section">
      <SectionTitle>Landing page</SectionTitle>
      <div className="ptr-asset">
        <div className="ptr-asset-preview" style={{ background: `linear-gradient(135deg, ${partner.color} 0%, var(--os-ink) 100%)` }}>
          <span className="ptr-asset-tag">livvvv.com/p/{partner.code.toLowerCase()}</span>
        </div>
        <div className="ptr-asset-meta">
          <div style={{ fontSize: 13, fontWeight: 500 }}>Branded landing</div>
          <div style={{ fontSize: 11.5, color: 'var(--os-fg-2)' }}>Configurable with partner logo + LIVV services</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button className="so-action" style={{ flex: 0, padding: '6px 12px' }}><OS_ICON name="edit" size={11}/>Customize</button>
            <button className="so-action" style={{ flex: 0, padding: '6px 12px' }}><OS_ICON name="link" size={11}/>Preview</button>
          </div>
        </div>
      </div>
    </div>
    <div className="brand-section">
      <SectionTitle>Embeddable widgets</SectionTitle>
      <div className="ptr-widget-grid">
        {[
          { name: 'Referral button',  icon: 'link',    desc: '"Powered by LIVV" CTA button' },
          { name: 'Service card',     icon: 'docs',    desc: 'Package highlight with CTA' },
          { name: 'Contact form',     icon: 'mail',    desc: 'Inline form → creates lead' },
          { name: 'Pricing strip',    icon: 'money',   desc: '3-package comparison' },
        ].map(w => (
          <article key={w.name} className="ptr-widget">
            <div className="ptr-widget-ic"><OS_ICON name={w.icon} size={14}/></div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--os-fg-0)' }}>{w.name}</div>
              <div style={{ fontSize: 11, color: 'var(--os-fg-2)' }}>{w.desc}</div>
            </div>
            <button className="ptr-copy-btn" style={{ marginLeft: 'auto', padding: '4px 9px' }}>Embed</button>
          </article>
        ))}
      </div>
    </div>
    <div className="brand-section">
      <SectionTitle>Assets · ready to share</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {[
          { name: 'Capabilities deck', size: '4.2 MB · PDF',  icon: 'docs' },
          { name: 'Short pitch copy', size: 'Plain text · 80 words',  icon: 'chat' },
          { name: 'Pricing reference', size: 'Plain text · approved tiers', icon: 'money' },
          { name: 'Logo + brand kit', size: 'ZIP · SVG/PNG variants', icon: 'palette' },
        ].map(a => (
          <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--os-surface)', borderRadius: 9 }}>
            <span style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--os-panel)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--os-fg-1)' }}>
              <OS_ICON name={a.icon} size={12}/>
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, color: 'var(--os-fg-0)', fontWeight: 500 }}>{a.name}</div>
              <div style={{ fontSize: 10.5, color: 'var(--os-fg-2)', fontFamily: 'var(--font-mono)' }}>{a.size}</div>
            </div>
            <button className="ptr-copy-btn"><OS_ICON name="docs" size={11}/>Download</button>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// HIGGSFIELD + PINTEREST STYLE REPLICATOR
// Adds to Connections list + a banner inside Studio
// ─────────────────────────────────────────────────────────────
const AI_VISION_CONNECTIONS = [
  {
    id: 'higgsfield',
    name: 'Higgsfield',
    cat: 'AI Vision · Style Replication',
    status: 'on',
    account: '@livvstudio · 12 styles trained',
    permissions: ['Image generation', 'Style transfer', 'Storyboard synthesis'],
    sync: '15m ago',
    color: '#7C5CFF',
    capabilities: [
      'Replicate visual style from any image or pin',
      'Generate storyboard frames for video / carrusel scripts',
      'Train custom style models per brand kit',
      'Compose prompts using brand + reference fusion',
    ],
  },
  {
    id: 'pinterest-pro',
    name: 'Pinterest · style sync',
    cat: 'AI Vision · Style Replication',
    status: 'on',
    account: '6 boards · 482 pins indexed',
    permissions: ['Read pins', 'Vector index', 'Style extraction'],
    sync: '3m ago',
    color: '#E60023',
    capabilities: [
      'Auto-index every new pin into your brand moodboard',
      'Extract color + texture + composition signatures',
      'Surface "this pin → use this style" prompts in Studio',
      'Build storyboard scenes from pin sequences',
    ],
  },
];

// Renders a section inside Toolkit > Connections (called from there)
const AIVisionSection = () => (
  <section className="conn-cat" style={{ marginBottom: 22 }}>
    <h3 className="conn-cat-title">
      <span className="conn-cat-dot" style={{ background: '#7C5CFF' }}/>
      AI Vision · Style replication
      <span style={{ marginLeft: 8, padding: '2px 8px', background: 'rgba(124,92,255,0.10)', color: '#7C5CFF', borderRadius: 999, fontSize: 9.5, letterSpacing: '0.14em' }}>NEW</span>
    </h3>
    <div className="conn-grid">
      {AI_VISION_CONNECTIONS.map(c => (
        <article key={c.id} className="conn-card connected ai-vision">
          <header className="conn-card-head">
            <div className="conn-logo" style={{ background: `color-mix(in oklab, ${c.color} 14%, var(--os-surface))`, color: c.color }}>
              {c.id === 'higgsfield' ? <OS_ICON name="spark" size={16}/> : <strong>P</strong>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h4>{c.name}</h4>
              <div className="conn-account">{c.account}</div>
            </div>
            <span className="conn-status on"><span className="dot"/>Connected</span>
          </header>

          <div className="conn-perms">
            {c.permissions.map(p => <span key={p} className="conn-perm">{p}</span>)}
          </div>

          <div className="ai-vision-caps">
            <span className="ai-vision-eyebrow">What it powers</span>
            <ul>
              {c.capabilities.map(cap => <li key={cap}>{cap}</li>)}
            </ul>
          </div>

          <footer className="conn-card-foot">
            <span className="conn-sync"><span className="conn-sync-dot"/>Last sync: {c.sync}</span>
            <button className="conn-btn manage">Manage <OS_ICON name="arrow" size={11}/></button>
          </footer>
        </article>
      ))}
    </div>
  </section>
);

// Drop-in for Studio — shows "use style from reference" picker
const StudioStyleReplicator = () => (
  <div className="repl">
    <header className="repl-head">
      <div className="repl-eyebrow">
        <span style={{ width: 6, height: 6, borderRadius: 999, background: '#7C5CFF', boxShadow: '0 0 6px rgba(124,92,255,0.5)' }}/>
        © Style replicator
      </div>
      <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--os-fg-2)' }}>Higgsfield + Pinterest connected</span>
    </header>

    <div className="repl-tabs">
      <button className="repl-tab active">From Pinterest</button>
      <button className="repl-tab">From upload</button>
      <button className="repl-tab">Trained styles · 12</button>
    </div>

    <div className="repl-grid">
      {[
        { board: 'Editorial layouts',     pal: ['#2C0405', '#C4A35A', '#FDFBF7'] },
        { board: 'Warm photography',      pal: ['#8B5A2B', '#F5E6D3', '#3D2817'] },
        { board: 'Type specimens',        pal: ['#0A0A0B', '#FAFAFA', '#E6E2D8'] },
        { board: 'Brand systems',         pal: ['#769268', '#E8EFE5', '#1F2D1A'] },
        { board: 'Motion frames',         pal: ['#F1ADD8', '#FBF2EC', '#23150E'] },
        { board: 'Product photography',   pal: ['#6DBEDC', '#0F1B2D', '#E8EFF6'] },
      ].map((s, i) => (
        <article key={i} className="repl-pin">
          <div className="repl-pin-img" style={{
            background: `linear-gradient(${135 + i * 25}deg, ${s.pal[0]} 0%, ${s.pal[1]} 50%, ${s.pal[2] || s.pal[0]} 100%)`,
          }}>
            <span className="repl-pin-board">{s.board}</span>
            <button className="repl-pin-use">
              <OS_ICON name="sparkle" size={11}/>Use style
            </button>
          </div>
          <div className="repl-pin-pal">
            {s.pal.map((c, j) => <span key={j} style={{ background: c }}/>)}
          </div>
        </article>
      ))}
    </div>

    <div className="repl-fusion">
      <div className="repl-fusion-eyebrow">© Composed prompt · live preview</div>
      <pre className="repl-prompt">
{`<brand kit: Livv Studio>
  voice: direct, technical, no buzzwords
  palette: ${'#C4A35A'}, ${'#2C0405'}, ${'#FDFBF7'}
  fonts: Inter / PP Playground

<visual reference: Pinterest · "Editorial layouts">
  composition: asymmetric, generous negative space
  texture: matte paper, soft shadows
  mood: editorial, calm, considered

<task: ${'{user briefing from Studio}'}>
  channel: ${'{Studio channel}'}, type: ${'{Studio type}'}
  output: 3 variations, with image storyboard frames
`}
      </pre>
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button className="so-action primary" style={{ flex: 0 }}><OS_ICON name="sparkle" size={12}/>Generate with this fusion</button>
        <button className="so-action" style={{ flex: 0 }}><OS_ICON name="docs" size={12}/>Copy prompt</button>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--os-fg-3)', display: 'flex', alignItems: 'center' }}>Powered by Higgsfield</span>
      </div>
    </div>
  </div>
);

Object.assign(window, {
  PARTNERS, COMMISSION_MODELS, PARTNER_ACTIVITY, PARTNER_PAYOUTS,
  GrowthPartners, PartnerDetail,
  AIVisionSection, StudioStyleReplicator, AI_VISION_CONNECTIONS,
});
