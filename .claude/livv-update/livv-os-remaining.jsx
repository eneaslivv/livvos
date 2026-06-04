// LIVV OS — Remaining tab implementations (replace placeholders with real UI)
const { useState: useRsS } = React;

// ─────────────────────────────────────────────────────────────
// CONTENT → TEMPLATES
// ─────────────────────────────────────────────────────────────
const TEMPLATES = [
  { id: 1, name: 'Founder hot take', channel: 'LinkedIn', cc: 'var(--sky)', type: 'Post', uses: 142, preview: ['Hook: a controversial truth', 'Setup: why most miss it', 'Reveal: what works', 'CTA: reply to this'] },
  { id: 2, name: 'Case study (long-form)', channel: 'LinkedIn', cc: 'var(--sky)', type: 'Article', uses: 38, preview: ['Client + outcome upfront', 'The mess before', '3 system changes', 'Results 90 days later'] },
  { id: 3, name: '5-slide carrusel', channel: 'Instagram', cc: 'var(--pink)', type: 'Carrusel', uses: 87, preview: ['Hook slide', 'Problem statement', 'Insight', 'Framework', 'CTA + brand'] },
  { id: 4, name: 'Reel — 30s scripted', channel: 'Instagram', cc: 'var(--pink)', type: 'Reel', uses: 52, preview: ['0-3s hook', '3-15s setup', '15-25s payoff', '25-30s CTA'] },
  { id: 5, name: 'Long-form how-to', channel: 'YouTube', cc: '#EF4444', type: 'Video', uses: 14, preview: ['Cold open with payoff', 'Intro yourself in 15s', '3 parts framework', 'Recap + subscribe CTA'] },
  { id: 6, name: 'Short — 60s tip', channel: 'YouTube', cc: '#EF4444', type: 'Short', uses: 29, preview: ['One tactical tip', 'Show, don\'t tell', 'Single CTA'] },
  { id: 7, name: 'Weekly newsletter', channel: 'Email', cc: 'var(--sage)', type: 'Newsletter', uses: 32, preview: ['Personal intro', 'One main idea', 'Curated 3 links', 'Soft CTA'] },
  { id: 8, name: 'Meta ad — primary text', channel: 'Ad', cc: 'var(--accent)', type: 'Copy', uses: 21, preview: ['Hook line', 'Problem framing', 'Solution one-liner', 'CTA button text'] },
  { id: 9, name: 'Cold outreach DM', channel: 'LinkedIn', cc: 'var(--sky)', type: 'DM', uses: 184, preview: ['Specific compliment', 'Connect the dots', 'Ask one question', 'No pitch'] },
  { id: 10,name: 'Loom proposal frame', channel: 'Loom', cc: 'var(--purple)', type: 'Video script', uses: 47, preview: ['Greet by name', 'Show their site', '3 wins we\'d ship', 'Next step'] },
  { id: 11,name: 'Story carrusel · 7 slide', channel: 'Instagram', cc: 'var(--pink)', type: 'Carrusel', uses: 23, preview: ['Slide 1: hook', 'Slides 2-5: arc', 'Slide 6: insight', 'Slide 7: ask'] },
  { id: 12,name: 'Behind-the-scenes', channel: 'Instagram', cc: 'var(--pink)', type: 'Single', uses: 41, preview: ['One unfiltered photo', '2 paragraphs', 'No CTA'] },
  { id: 13,name: 'Founder lessons thread', channel: 'X / Twitter', cc: 'var(--os-fg-1)', type: 'Thread', uses: 16, preview: ['1/n hook', '7-12 tweet arc', 'Re-cap pinned'] },
  { id: 14,name: 'Welcome email · onboarding', channel: 'Email', cc: 'var(--sage)', type: 'Lifecycle', uses: 9, preview: ['Personal greeting', 'What to expect', 'Calendar link', 'Slack invite'] },
];

const ContentTemplates = () => {
  const [filter, setFilter] = useRsS('all');
  const [openTpl, setOpenTpl] = useRsS(null);
  const channels = [...new Set(TEMPLATES.map(t => t.channel))];
  const filtered = filter === 'all' ? TEMPLATES : TEMPLATES.filter(t => t.channel === filter);
  const totalUses = TEMPLATES.reduce((s, t) => s + t.uses, 0);
  const topByCh = channels.map(c => {
    const cs = TEMPLATES.filter(t => t.channel === c);
    const cu = cs.reduce((s, t) => s + t.uses, 0);
    return { ch: c, uses: cu, count: cs.length, cc: cs[0].cc };
  }).sort((a, b) => b.uses - a.uses);
  return (
    <>
      {/* Hero summary */}
      <section className="tpl-hero">
        <div className="tpl-hero-l">
          <div className="pos-hero-eyebrow">
            <span className="pos-hero-dot"/>
            © Template library
          </div>
          <h2 className="pkg-hero-title">
            <span>{TEMPLATES.length} templates</span><br/>
            <span style={{ color: 'var(--os-fg-2)' }}>used {totalUses.toLocaleString()} times</span>
          </h2>
          <div className="pkg-hero-stats">
            <div className="pkg-hero-stat">
              <div className="pkg-hero-stat-v">{channels.length}</div>
              <div className="pkg-hero-stat-l">Channels</div>
            </div>
            <div className="pkg-hero-stat">
              <div className="pkg-hero-stat-v">{Math.round(totalUses / TEMPLATES.length)}</div>
              <div className="pkg-hero-stat-l">Avg uses</div>
            </div>
            <div className="pkg-hero-stat">
              <div className="pkg-hero-stat-v">{topByCh[0].ch.slice(0,2).toUpperCase()}</div>
              <div className="pkg-hero-stat-l">Top channel</div>
            </div>
          </div>
        </div>
        <div className="tpl-hero-chart">
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--os-fg-2)', display: 'block', marginBottom: 12 }}>Uses by channel</span>
          {topByCh.map(c => (
            <div key={c.ch} className="tpl-hero-row">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, minWidth: 90 }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: c.cc }}/>{c.ch}
              </span>
              <div className="phase-bar" style={{ flex: 1 }}><div className="phase-fill" style={{ width: `${(c.uses / topByCh[0].uses) * 100}%`, background: c.cc }}/></div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--os-fg-0)', fontWeight: 500, minWidth: 40, textAlign: 'right' }}>{c.uses}</span>
            </div>
          ))}
        </div>
      </section>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <div className="filter-row">
          <button className={`fc ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All <span style={{fontFamily:'var(--font-mono)',fontSize:9.5,padding:'1px 6px',borderRadius:5,background:filter==='all'?'rgba(255,255,255,0.18)':'var(--os-surface-2)',color:filter==='all'?'var(--livv-cream-50)':'var(--os-fg-2)'}}>{TEMPLATES.length}</span></button>
          {channels.map(c => (
            <button key={c} className={`fc ${filter === c ? 'active' : ''}`} onClick={() => setFilter(c)}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: TEMPLATES.find(t=>t.channel===c).cc }}/>
              {c}
            </button>
          ))}
        </div>
      </div>
      <div className="tpl-grid">
        {filtered.map(t => (
          <article key={t.id} className="tpl-card" style={{ '--c': t.cc }}>
            <header className="tpl-head">
              <span className="tpl-channel" style={{ background: `color-mix(in oklab, ${t.cc} 14%, var(--os-surface))`, color: t.cc }}>{t.channel}</span>
              <span className="tpl-type">{t.type}</span>
            </header>
            <h3 className="tpl-name">{t.name}</h3>
            <div className="tpl-preview">
              {t.preview.slice(0, 4).map((line, i) => (
                <div key={i} className="tpl-line">
                  <span className="tpl-line-bar" style={{ width: `${85 - i * 12}%` }}/>
                  <span className="tpl-line-text">{line}</span>
                </div>
              ))}
            </div>
            <footer className="tpl-foot">
              <span><strong>{t.uses}</strong> uses</span>
              <button className="tpl-use" onClick={() => setOpenTpl(t)}>Use template <OS_ICON name="arrow" size={10}/></button>
            </footer>
          </article>
        ))}
        <button className="tpl-add">
          <div className="brand-add-ic"><OS_ICON name="plus" size={18}/></div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>New template</div>
          <div style={{ fontSize: 11.5, color: 'var(--os-fg-2)', textAlign: 'center', maxWidth: 180 }}>Save your best-performing structure once. Reuse forever.</div>
        </button>
      </div>
      {openTpl && (
        <CalendarQuickCreate
          ctx={{ date: 'Today', slot: { template: openTpl.name, channel: openTpl.channel, type: openTpl.type } }}
          onClose={() => setOpenTpl(null)}
        />
      )}
    </>
  );
};

// ─────────────────────────────────────────────────────────────
// CONTENT → PIPELINE (kanban)
// ─────────────────────────────────────────────────────────────
const PIPELINE_COLS = [
  { id: 'idea',      label: 'Idea',      marker: '' },
  { id: 'draft',     label: 'Draft',     marker: '' },
  { id: 'review',    label: 'Review',    marker: 'active' },
  { id: 'scheduled', label: 'Scheduled', marker: '' },
  { id: 'published', label: 'Published', marker: 'won' },
];
const PIECES = [
  { id: 1,  col: 'idea',      title: 'Pricing as positioning',                   ch: 'LinkedIn',  cc: 'var(--sky)',  type: 'Post',      brand: 'L', owner: 'EN' },
  { id: 2,  col: 'idea',      title: 'Lessons from $30K loss',                   ch: 'LinkedIn',  cc: 'var(--sky)',  type: 'Post',      brand: 'L', owner: 'EN' },
  { id: 3,  col: 'idea',      title: 'Why agencies miss their cadence',          ch: 'YouTube',   cc: '#EF4444',     type: 'Video',     brand: 'L', owner: 'LU' },
  { id: 4,  col: 'draft',     title: 'Mulberry case study · long-form',           ch: 'LinkedIn',  cc: 'var(--sky)',  type: 'Article',   brand: 'M', owner: 'EN', repurposed: true },
  { id: 5,  col: 'draft',     title: 'Sunnyside content engine breakdown',       ch: 'LinkedIn',  cc: 'var(--sky)',  type: 'Carrusel',  brand: 'S', owner: 'LU' },
  { id: 6,  col: 'draft',     title: 'Cremona — patient capital framework',       ch: 'Email',     cc: 'var(--sage)', type: 'Newsletter',brand: 'C', owner: 'EN' },
  { id: 7,  col: 'draft',     title: 'Behind-the-scenes Sunnyside rebrand',       ch: 'Instagram', cc: 'var(--pink)', type: 'Reel',      brand: 'S', owner: 'LU' },
  { id: 8,  col: 'review',    title: 'Why agencies miss their cadence',          ch: 'LinkedIn',  cc: 'var(--sky)',  type: 'Carrusel',  brand: 'L', owner: 'EN' },
  { id: 9,  col: 'review',    title: 'Newsletter #34 · Cremona case',            ch: 'Email',     cc: 'var(--sage)', type: 'Newsletter',brand: 'L', owner: 'EN' },
  { id: 10, col: 'scheduled', title: 'BTS Sunnyside · reel',                     ch: 'Instagram', cc: 'var(--pink)', type: 'Reel',      brand: 'S', owner: 'LU' },
  { id: 11, col: 'scheduled', title: 'Founder vs system thread',                 ch: 'LinkedIn',  cc: 'var(--sky)',  type: 'Post',      brand: 'L', owner: 'EN' },
  { id: 12, col: 'scheduled', title: 'Content engine setup · 12min',             ch: 'YouTube',   cc: '#EF4444',     type: 'Video',     brand: 'L', owner: 'LU' },
  { id: 13, col: 'published', title: 'Friday reflection carrusel',                ch: 'Instagram', cc: 'var(--pink)', type: 'Carrusel',  brand: 'L', owner: 'EN' },
  { id: 14, col: 'published', title: 'Lifecycle workflow Loom',                  ch: 'LinkedIn',  cc: 'var(--sky)',  type: 'Post',      brand: 'L', owner: 'LU' },
];

const ContentPipeline = () => (
  <div className="kanban">
    {PIPELINE_COLS.map(col => {
      const pieces = PIECES.filter(p => p.col === col.id);
      return (
        <section key={col.id} className={`col col-${col.marker}`}>
          <header className="col-head">
            <span className="marker"/>
            <span className="col-name">{col.label}</span>
            <span className="col-count">
              <span className="n">{pieces.length}</span>
              <button className="col-add"><OS_ICON name="plus" size={12}/></button>
            </span>
          </header>
          <div className="col-body">
            {pieces.map(p => (
              <div key={p.id} className="lc" style={{ '--icp-color': p.cc }}>
                <span className="lc-icp-bar"/>
                <div className="lc-top">
                  <div style={{ minWidth: 0 }}>
                    <div className="lc-company">{p.title}</div>
                    <div className="lc-contact">{p.type}</div>
                  </div>
                  <span className="lc-icp-pill">{p.ch.slice(0,2).toUpperCase()}</span>
                </div>
                <div className="lc-foot" style={{ marginTop: 8 }}>
                  <span className="action">Brand · {p.brand}</span>
                  {p.repurposed && <OS_ICON name="link" size={10}/>}
                  <span className="av-mini" style={{ background: p.owner === 'EN' ? 'var(--accent)' : 'var(--sky)' }}>{p.owner}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      );
    })}
  </div>
);

// ─────────────────────────────────────────────────────────────
// CONTENT → PERFORMANCE
// ─────────────────────────────────────────────────────────────
const PERF = [
  { ch: 'LinkedIn',  cc: 'var(--sky)',  target: 5, actual: 4, rate: '6.2%',  best: 'Founder vs system thread', impressions: '48.2K' },
  { ch: 'Instagram', cc: 'var(--pink)', target: 3, actual: 2, rate: '4.8%',  best: 'BTS Sunnyside rebrand',    impressions: '21.4K' },
  { ch: 'YouTube',   cc: '#EF4444',     target: 1, actual: 0, rate: '12.1%', best: '—',                          impressions: '8.7K' },
  { ch: 'Email',     cc: 'var(--sage)', target: 1, actual: 1, rate: '38.4%', best: 'Newsletter #33',              impressions: '2.1K' },
];

const ContentPerformance = () => (
  <>
    <div className="kpi-row">
      {PERF.map((p, i) => {
        const pct = (p.actual / p.target) * 100;
        const compliance = p.actual >= p.target ? 'on' : p.actual >= p.target * 0.5 ? 'warn' : 'off';
        return (
          <div className="kpi" key={i} style={{ '--c': p.cc }}>
            <div className="kpi-head">
              <span className="kpi-lbl"><span style={{ width: 6, height: 6, borderRadius: 999, background: p.cc, marginRight: 4, display: 'inline-block' }}/>{p.ch}</span>
              <span className={`kpi-delta ${compliance === 'on' ? 'up' : compliance === 'off' ? 'down' : 'flat'}`}>
                {compliance === 'on' ? '● ON TRACK' : compliance === 'warn' ? '◐ WARN' : '○ BEHIND'}
              </span>
            </div>
            <div className="kpi-row-val">
              <span className="kpi-v">{p.actual}<small style={{ fontSize: 16, color: 'var(--os-fg-3)' }}>/{p.target}</small></span>
              <span className="kpi-target">this week</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
              <div className="phase-bar"><div className="phase-fill" style={{ width: `${Math.min(100, pct)}%`, background: p.cc }}/></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--os-fg-2)' }}>
                <span>Engagement</span><strong style={{ color: 'var(--os-fg-0)' }}>{p.rate}</strong>
              </div>
            </div>
          </div>
        );
      })}
    </div>

    <section className="card" style={{ marginBottom: 18 }}>
      <header className="card-head">
        <span className="card-title"><span className="ic"><OS_ICON name="activity" size={12}/></span>Posts per week · last 8 weeks</span>
        <span className="card-action">Last 8 weeks ▾</span>
      </header>
      <div className="card-body">
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, height: 160, padding: '12px 4px 8px' }}>
          {[1,2,3,4,5,6,7,8].map(w => {
            const heights = [
              { ch: 'LinkedIn',  cc: 'var(--sky)',  h: 14 + (w * 2) },
              { ch: 'Instagram', cc: 'var(--pink)', h: 8 + (w * 1.5) },
              { ch: 'YouTube',   cc: '#EF4444',     h: 4 + (w * 0.7) },
              { ch: 'Email',     cc: 'var(--sage)', h: 6 },
            ];
            return (
              <div key={w} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', flexDirection: 'column-reverse', height: 130, gap: 2 }}>
                  {heights.map(h => (
                    <div key={h.ch} style={{ height: h.h, background: h.cc, borderRadius: 3, opacity: 0.85 }}/>
                  ))}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, textAlign: 'center', color: 'var(--os-fg-2)' }}>W{w}</div>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', paddingTop: 6, borderTop: '1px dashed rgba(90,62,62,0.10)' }}>
          {[{l:'LinkedIn',c:'var(--sky)'},{l:'Instagram',c:'var(--pink)'},{l:'YouTube',c:'#EF4444'},{l:'Email',c:'var(--sage)'}].map(l => (
            <span key={l.l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--os-fg-2)', fontFamily: 'var(--font-mono)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: l.c }}/>{l.l}
            </span>
          ))}
        </div>
      </div>
    </section>

    <section className="card">
      <header className="card-head">
        <span className="card-title"><span className="ic"><OS_ICON name="content" size={12}/></span>Top performing · last 20 pieces</span>
      </header>
      <div className="card-body" style={{ padding: 0 }}>
        {[
          { t: 'Founder vs system thread', ch: 'LinkedIn', cc: 'var(--sky)', e: '14.8K impressions · 6.4% eng' },
          { t: 'BTS Sunnyside rebrand',    ch: 'Instagram', cc: 'var(--pink)', e: '8.1K reach · 5.8% eng' },
          { t: 'Newsletter #33 · Cremona', ch: 'Email',    cc: 'var(--sage)', e: '2.1K opens · 38% open rate' },
          { t: 'Lifecycle workflow Loom',  ch: 'LinkedIn', cc: 'var(--sky)', e: '12K impressions · 4.2% eng' },
          { t: 'Pricing carousel',         ch: 'Instagram', cc: 'var(--pink)', e: '6.4K reach · 4.1% eng' },
        ].map((r, i) => (
          <div key={i} style={{ padding: '12px 18px', display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 12, alignItems: 'center', borderBottom: i < 4 ? '1px dashed rgba(90,62,62,0.10)' : '0' }}>
            <span style={{ width: 22, height: 22, borderRadius: 6, background: `color-mix(in oklab, ${r.cc} 14%, var(--os-surface))`, color: r.cc, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600 }}>{r.ch.slice(0,2).toUpperCase()}</span>
            <div>
              <div style={{ fontSize: 13, color: 'var(--os-fg-0)', fontWeight: 500 }}>{r.t}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--os-fg-2)', marginTop: 2 }}>{r.e}</div>
            </div>
            <OS_ICON name="arrow" size={12} style={{ color: 'var(--os-fg-3)' }}/>
          </div>
        ))}
      </div>
    </section>
  </>
);

// ─────────────────────────────────────────────────────────────
// STRATEGY → PACKAGES
// ─────────────────────────────────────────────────────────────
const PACKAGES = [
  { id: 1, name: 'Agency OS · 6-week deploy',     icp: 'Agencies',    mods: ['Sales','Content','Scaling'], weeks: 6, impl: '$24K', mrr: '$5.6K', status: 'active' },
  { id: 2, name: 'Consultant Toolkit',            icp: 'Consultants', mods: ['Sales','Content'],            weeks: 4, impl: '$16K', mrr: '$3.8K', status: 'active' },
  { id: 3, name: 'SaaS Foundations',              icp: 'SaaS',         mods: ['Strategy','Sales','Content'], weeks: 8, impl: '$32K', mrr: '$7.5K', status: 'active' },
  { id: 4, name: 'E-com Growth Stack',            icp: 'E-com',       mods: ['Content','Toolkit'],          weeks: 5, impl: '$22K', mrr: '$4.8K', status: 'testing' },
  { id: 5, name: 'Retainer · Content Engine',      icp: 'Retainer',    mods: ['Content','Toolkit'],         weeks: null, impl: '—', mrr: '$5.5K', status: 'active' },
  { id: 6, name: 'Retainer · Full OS',             icp: 'Retainer',    mods: ['Content','Sales','Scaling'], weeks: null, impl: '—', mrr: '$8.2K', status: 'active' },
  { id: 7, name: 'Strategy Sprint',                icp: 'Agencies',    mods: ['Strategy'],                   weeks: 3, impl: '$12K', mrr: '—', status: 'active' },
  { id: 8, name: 'Brand System · 4-week sprint',  icp: 'E-com',       mods: ['Content','Strategy'],         weeks: 4, impl: '$18K', mrr: '—', status: 'draft' },
];

const StrategyPackages = () => {
  const [open, setOpen] = useRsS(null);

  // Module coverage matrix
  const MODULES_LIST = ['Strategy', 'Sales', 'Content', 'Scaling', 'Toolkit'];
  const totalImpl = PACKAGES.reduce((s, p) => s + (parseFloat(p.impl.replace(/[^0-9.]/g,'')) || 0), 0);
  const totalMrr  = PACKAGES.reduce((s, p) => s + (parseFloat(p.mrr.replace(/[^0-9.]/g,'')) || 0), 0);

  return (
    <>
      {/* Hero summary */}
      <section className="pkg-hero">
        <div className="pkg-hero-l">
          <div className="pos-hero-eyebrow">
            <span className="pos-hero-dot"/>
            © Package matrix
          </div>
          <h2 className="pkg-hero-title">
            <span>{PACKAGES.length} packages</span><br/>
            <span style={{ color: 'var(--os-fg-2)' }}>across {[...new Set(PACKAGES.map(p => p.icp))].length} ICP segments</span>
          </h2>
          <div className="pkg-hero-stats">
            <div className="pkg-hero-stat">
              <div className="pkg-hero-stat-v">${totalImpl.toFixed(0)}K</div>
              <div className="pkg-hero-stat-l">Total impl. value</div>
            </div>
            <div className="pkg-hero-stat">
              <div className="pkg-hero-stat-v">${totalMrr.toFixed(1)}K</div>
              <div className="pkg-hero-stat-l">Total MRR potential</div>
            </div>
            <div className="pkg-hero-stat">
              <div className="pkg-hero-stat-v">{PACKAGES.filter(p => p.status === 'active').length}</div>
              <div className="pkg-hero-stat-l">Active</div>
            </div>
          </div>
        </div>

        <div className="pkg-matrix">
          <div className="pkg-matrix-head">
            <span/>
            {MODULES_LIST.map(m => <span key={m} className="pkg-matrix-mod">{m}</span>)}
          </div>
          {PACKAGES.map(p => (
            <div key={p.id} className="pkg-matrix-row">
              <span className="pkg-matrix-name">{p.name}</span>
              {MODULES_LIST.map(m => {
                const covered = p.mods.includes(m);
                return <span key={m} className={`pkg-matrix-cell ${covered ? 'on' : ''}`} title={covered ? `${p.name} covers ${m}` : ''}/>;
              })}
            </div>
          ))}
        </div>
      </section>

      {/* Package cards grid */}
      <div className="pkg-grid">
        {PACKAGES.map(p => {
          const icpColor = Object.values(ICPS).find(i => i.name === p.icp)?.color || 'var(--os-fg-2)';
          return (
            <article key={p.id} className={`pkg-card ${open === p.id ? 'expanded' : ''}`} style={{ '--c': icpColor }} onClick={() => setOpen(open === p.id ? null : p.id)}>
              <header className="pkg-card-head">
                <span className={`brand-status ${p.status}`}>{p.status}</span>
                <span className="pkg-card-icp" style={{ background: `color-mix(in oklab, ${icpColor} 14%, var(--os-surface))`, color: icpColor }}>
                  <span className="dot" style={{ background: icpColor }}/>
                  {p.icp}
                </span>
              </header>
              <h3 className="pkg-card-title">{p.name}</h3>
              <div className="pkg-card-mods">
                {p.mods.map(m => (
                  <span key={m} className="pkg-card-mod">{m}</span>
                ))}
              </div>
              <div className="pkg-card-prices">
                <div className="pkg-card-price">
                  <span className="pkg-card-price-l">Implementation</span>
                  <span className="pkg-card-price-v">{p.impl}</span>
                </div>
                <div className="pkg-card-price pkg-card-price-mrr">
                  <span className="pkg-card-price-l">Monthly</span>
                  <span className="pkg-card-price-v">{p.mrr}</span>
                </div>
                {p.weeks && (
                  <div className="pkg-card-price">
                    <span className="pkg-card-price-l">Sprint</span>
                    <span className="pkg-card-price-v">{p.weeks}w</span>
                  </div>
                )}
              </div>
              <footer className="pkg-card-foot">
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--os-fg-2)' }}>{open === p.id ? 'Hide details' : 'View deliverables'}</span>
                <OS_ICON name={open === p.id ? 'chevup' : 'chevdown'} size={13} style={{ color: 'var(--os-fg-3)' }}/>
              </footer>
              {open === p.id && (
                <div className="pkg-card-expand" onClick={e => e.stopPropagation()}>
                  <SectionTitle>Deliverables</SectionTitle>
                  <ul style={{ margin: '4px 0 12px', paddingLeft: 18, color: 'var(--os-fg-1)', fontSize: 12.5, lineHeight: 1.7 }}>
                    <li>Discovery + ICP definition workshop</li>
                    <li>{p.mods.join(' + ')} module deployment</li>
                    <li>Weekly 30-min checkpoint calls during sprint</li>
                    <li>Hand-off documentation + team training</li>
                    <li>30-day post-launch retainer included</li>
                  </ul>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="so-action primary" style={{ flex: 0 }}><OS_ICON name="edit" size={12}/>Edit</button>
                    <button className="so-action" style={{ flex: 0 }}><OS_ICON name="docs" size={12}/>Proposal</button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
        <button className="pos-add-card" style={{ minHeight: 0 }}>
          <div className="pos-add-ic"><OS_ICON name="plus" size={18}/></div>
          <span style={{ fontSize: 13, fontWeight: 500 }}>New package</span>
          <span style={{ fontSize: 11.5, color: 'var(--os-fg-2)', textAlign: 'center', maxWidth: 200 }}>Combine modules into a productized offer.</span>
        </button>
      </div>
    </>
  );
};

// ─────────────────────────────────────────────────────────────
// STRATEGY → POSITIONING (visual redesign)
// ─────────────────────────────────────────────────────────────
const POSITIONS = [
  { id: 1, title: 'The system, not the brand',           desc: 'We sell operating systems for service businesses, not visual identity. Brand is a downstream consequence of disciplined operations.', tags: ['Content', 'Sales'],     axis: { x: 0.30, y: 0.85 }, icon: 'system' },
  { id: 2, title: 'Outcome-first, not process-first',     desc: 'Every conversation starts with "what does winning look like in 90 days?". Process is a means to that, never the headline.',           tags: ['Sales', 'Delivery'],    axis: { x: 0.65, y: 0.80 }, icon: 'target' },
  { id: 3, title: 'Built for operators, not vendors',      desc: 'Our buyer runs the company. We talk to them like a peer, not like a service provider waiting for instructions.',                       tags: ['Content', 'Sales'],     axis: { x: 0.20, y: 0.55 }, icon: 'peer' },
  { id: 4, title: 'Repeatability beats heroics',           desc: 'A team that publishes 3x per week for 90 days beats a team that publishes 15 posts in one heroic sprint. We bias toward repeatable systems.', tags: ['Content', 'Delivery'], axis: { x: 0.50, y: 0.40 }, icon: 'loop' },
  { id: 5, title: 'Show the kitchen',                       desc: 'We share the boring parts — the templates, the cadence, the spreadsheets. Founders trust what they can see being built.',             tags: ['Content'],              axis: { x: 0.15, y: 0.20 }, icon: 'window' },
  { id: 6, title: 'Pricing as positioning',                 desc: 'We price to attract operators who value time over savings. Price filters out tire-kickers; positioning attracts the right ones.',     tags: ['Sales'],                axis: { x: 0.75, y: 0.30 }, icon: 'filter' },
];

const TAG_COLORS = {
  'Content':  'var(--pink)',
  'Sales':    'var(--accent)',
  'Delivery': 'var(--sage)',
};

const PrincipleIcon = ({ name, color }) => {
  const c = color || 'currentColor';
  switch (name) {
    case 'system':
      return <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="3" fill={c}/>
        <circle cx="6" cy="6" r="2"  fill={c} opacity="0.5"/>
        <circle cx="26" cy="6" r="2" fill={c} opacity="0.5"/>
        <circle cx="6" cy="26" r="2" fill={c} opacity="0.5"/>
        <circle cx="26" cy="26" r="2" fill={c} opacity="0.5"/>
        <path d="M8 8l5.5 5.5M24 8l-5.5 5.5M8 24l5.5-5.5M24 24l-5.5-5.5" stroke={c} strokeWidth="1.3"/>
      </svg>;
    case 'target':
      return <svg width="28" height="28" viewBox="0 0 32 32" fill="none" stroke={c} strokeWidth="1.5">
        <circle cx="16" cy="16" r="11"/>
        <circle cx="16" cy="16" r="7"/>
        <circle cx="16" cy="16" r="3" fill={c}/>
        <path d="M16 1v6M16 25v6M1 16h6M25 16h6"/>
      </svg>;
    case 'peer':
      return <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
        <circle cx="11" cy="10" r="4" fill={c} opacity="0.85"/>
        <circle cx="21" cy="10" r="4" fill={c}/>
        <path d="M3 26c0-4.5 3.6-8 8-8s8 3.5 8 8M13 26c0-4.5 3.6-8 8-8s8 3.5 8 8" stroke={c} strokeWidth="1.5" fill="none"/>
      </svg>;
    case 'loop':
      return <svg width="28" height="28" viewBox="0 0 32 32" fill="none" stroke={c} strokeWidth="1.5">
        <path d="M5 16a11 11 0 0 1 22 0 11 11 0 0 1-22 0z"/>
        <path d="M22 8l5-2-2 5M22 24l5 2-2-5" fill={c} stroke="none"/>
        <circle cx="16" cy="11" r="1.5" fill={c}/>
        <circle cx="11" cy="20" r="1.5" fill={c}/>
        <circle cx="21" cy="20" r="1.5" fill={c}/>
      </svg>;
    case 'window':
      return <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
        <rect x="4" y="6" width="24" height="20" rx="2" fill={c} opacity="0.12" stroke={c} strokeWidth="1.4"/>
        <path d="M4 11h24M16 11v15" stroke={c} strokeWidth="1.4"/>
        <circle cx="8" cy="8.5" r="0.7" fill={c}/><circle cx="11" cy="8.5" r="0.7" fill={c}/>
      </svg>;
    case 'filter':
      return <svg width="28" height="28" viewBox="0 0 32 32" fill="none" stroke={c} strokeWidth="1.5">
        <path d="M4 6h24l-9 11v9l-6-3v-6L4 6z" fill={c} opacity="0.18"/>
      </svg>;
    default: return null;
  }
};

const StrategyPositioning = () => {
  const [active, setActive] = useRsS(POSITIONS[0].id);

  // Stats summary
  const tagCounts = {};
  POSITIONS.forEach(p => p.tags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));

  return (
    <>
      {/* Hero: compass + summary */}
      <section className="pos-hero">
        <div className="pos-hero-l">
          <div className="pos-hero-eyebrow">
            <span className="pos-hero-dot"/>
            © Principles map
          </div>
          <h2 className="pos-hero-title">
            <span>Six principles</span><br/>
            <span style={{ color: 'var(--os-fg-2)' }}>shape every output of LIVV</span>
          </h2>
          <p className="pos-hero-desc">
            Each principle is referenced when AI drafts content, generates outreach, or coaches you in calls.
            They are the operating beliefs your system stands on.
          </p>
          <div className="pos-hero-stats">
            <div className="pos-hero-stat">
              <div className="pos-hero-stat-v">{POSITIONS.length}</div>
              <div className="pos-hero-stat-l">Principles</div>
            </div>
            <div className="pos-hero-stat">
              <div className="pos-hero-stat-v">{Object.keys(tagCounts).length}</div>
              <div className="pos-hero-stat-l">Domains</div>
            </div>
            <div className="pos-hero-stat">
              <div className="pos-hero-stat-v">412</div>
              <div className="pos-hero-stat-l">AI references / mo</div>
            </div>
          </div>
          <div className="pos-tag-legend">
            {Object.entries(TAG_COLORS).map(([t, c]) => (
              <span key={t} className="pos-tag-legend-item">
                <span className="pos-tag-dot" style={{ background: c }}/>
                <span><strong>{t}</strong> · {tagCounts[t] || 0}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="pos-compass">
          <div className="pos-compass-grid">
            {/* Axes */}
            <span className="pos-compass-axis pos-compass-axis-x"/>
            <span className="pos-compass-axis pos-compass-axis-y"/>
            <span className="pos-compass-label tl">Internal</span>
            <span className="pos-compass-label tr">External</span>
            <span className="pos-compass-label bl">Tactical</span>
            <span className="pos-compass-label br">Strategic</span>
            <span className="pos-compass-axis-name x">Audience</span>
            <span className="pos-compass-axis-name y">Altitude</span>
            {/* Dots */}
            {POSITIONS.map(p => {
              const color = TAG_COLORS[p.tags[0]] || 'var(--os-fg-2)';
              return (
                <button
                  key={p.id}
                  className={`pos-compass-dot ${active === p.id ? 'active' : ''}`}
                  style={{
                    left: `${p.axis.x * 100}%`,
                    bottom: `${p.axis.y * 100}%`,
                    '--c': color,
                  }}
                  onClick={() => setActive(p.id)}
                  title={p.title}
                >
                  <span className="pos-compass-num">{String(p.id).padStart(2,'0')}</span>
                  <span className="pos-compass-label-tip">{p.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Principle cards */}
      <div className="pos-grid-2">
        {POSITIONS.map(p => {
          const isActive = active === p.id;
          const color = TAG_COLORS[p.tags[0]] || 'var(--os-fg-2)';
          return (
            <article
              key={p.id}
              className={`pos-card-v2 ${isActive ? 'active' : ''}`}
              style={{ '--c': color }}
              onMouseEnter={() => setActive(p.id)}
            >
              <header className="pos-card-head">
                <span className="pos-card-num">{String(p.id).padStart(2,'0')}</span>
                <div className="pos-card-icon" style={{ background: `color-mix(in oklab, ${color} 14%, var(--os-surface))`, color }}>
                  <PrincipleIcon name={p.icon} color={color}/>
                </div>
                <button className="pos-card-edit"><OS_ICON name="edit" size={12}/></button>
              </header>
              <h3 className="pos-card-title">{p.title}</h3>
              <p className="pos-card-desc">{p.desc}</p>
              <footer className="pos-card-foot">
                <div className="pos-card-tags">
                  {p.tags.map(t => (
                    <span key={t} className="pos-card-tag" style={{ '--tc': TAG_COLORS[t] }}>
                      <span className="pos-card-tag-dot"/>
                      {t}
                    </span>
                  ))}
                </div>
                <span className="pos-card-handle"><OS_ICON name="move" size={11}/></span>
              </footer>
            </article>
          );
        })}
        <button className="pos-add-card">
          <div className="pos-add-ic"><OS_ICON name="plus" size={18}/></div>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--os-fg-0)' }}>Add principle</span>
          <span style={{ fontSize: 11.5, color: 'var(--os-fg-2)', textAlign: 'center', maxWidth: 200 }}>
            A new operating belief — referenced by AI across modules.
          </span>
        </button>
      </div>
    </>
  );
};

// ─────────────────────────────────────────────────────────────
// SCALING → ROLES
// ─────────────────────────────────────────────────────────────
const ROLES = [
  { id: 1, title: 'Founder',                dept: 'Leadership', type: 'FT', phase: 'M1', status: 'filled',  cost: 0,    person: 'Eneas',  rationale: 'Vision, strategy, and the last call on every direction.', tasks: ['Set quarterly direction', 'Drive sales conversations', 'Hire and onboard'], skills: ['Vision', 'Sales', 'Recruiting'], kpis: [{m: 'Pipeline value', t: '$1.2M', u: 'monthly'},{m: 'Deals closed', t: '6', u: 'monthly'}] },
  { id: 2, title: 'Senior Strategist',      dept: 'Strategy',   type: 'FT', phase: 'M4', status: 'filled',  cost: 5200, person: 'Lucía',  rationale: 'Owns client strategy delivery and quality across all engagements.', tasks: ['Run discovery workshops', 'Define ICP-specific playbooks', 'Quality review of all deliverables'], skills: ['Strategy', 'Facilitation', 'Writing'], kpis: [{m: 'Client NPS', t: '60', u: 'quarterly'},{m: 'Deliverables on time', t: '95%', u: 'monthly'}] },
  { id: 3, title: 'Content Producer',       dept: 'Content',    type: 'FT', phase: 'M5', status: 'filled',  cost: 3800, person: 'Mateo',  rationale: 'Ships the content engine output every week, across channels and brands.', tasks: ['Produce 12 pieces / week', 'Maintain cadence per brand', 'Performance analysis'], skills: ['Writing', 'Editing', 'Multi-channel'], kpis: [{m: 'Cadence compliance', t: '90%', u: 'weekly'},{m: 'Avg engagement', t: '5%', u: 'monthly'}] },
  { id: 4, title: 'Designer',               dept: 'Design',     type: 'CT', phase: 'M6', status: 'filled',  cost: 3400, person: 'Sara',   rationale: 'Visual identity for brand kits and content pieces.', tasks: ['Brand kit assets', 'Carrusel templates', 'Ad creative'], skills: ['Brand design', 'Typography', 'Figma'], kpis: [{m: 'Brand kits delivered', t: '2', u: 'monthly'}] },
  { id: 5, title: 'Ops & Finance',          dept: 'Operations', type: 'PT', phase: 'M7', status: 'filled',  cost: 2200, person: 'Tomás',  rationale: 'Keeps the operation running: invoicing, payments, retainers, contracts.', tasks: ['Monthly invoicing', 'Retainer renewals', 'Finance reporting'], skills: ['Operations', 'Finance', 'Contracts'], kpis: [{m: 'Days to collect', t: '15', u: 'monthly'}] },
  { id: 6, title: 'BD Advisor',             dept: 'Sales',      type: 'CT', phase: 'M8', status: 'filled',  cost: 1800, person: 'Iris',   rationale: 'Senior intros and warm pipeline for high-ticket deals.', tasks: ['Monthly intro batch', 'Industry connector role'], skills: ['Network', 'Senior intros'], kpis: [{m: 'Qualified intros', t: '4', u: 'monthly'}] },
  { id: 7, title: 'Sales Lead',             dept: 'Sales',      type: 'FT', phase: 'M9', status: 'hiring',  cost: 5500, person: null,     rationale: 'Take over founder-led sales. Free Eneas for strategic work.', tasks: ['Run full pipeline', 'Discovery + close', 'Coach junior'], skills: ['Closing', 'Pipeline mgmt', 'Coaching'], kpis: [{m: 'Win rate', t: '30%', u: 'quarterly'}] },
  { id: 8, title: 'Junior Strategist',      dept: 'Strategy',   type: 'FT', phase: 'M10', status: 'planned', cost: 3500, person: null,    rationale: 'Scale strategy capacity for the next 10 clients.', tasks: ['Support senior strategist', 'Discovery prep', 'Documentation'], skills: ['Writing', 'Research'], kpis: [{m: 'Deliverable assists', t: '8', u: 'monthly'}] },
  { id: 9, title: 'Customer Success',       dept: 'Delivery',   type: 'FT', phase: 'M11', status: 'planned', cost: 4200, person: null,    rationale: 'Own retainer renewals and expansion.', tasks: ['Monthly check-ins', 'Renewal management', 'Expansion sales'], skills: ['Account mgmt', 'Empathy', 'Process'], kpis: [{m: 'Retention', t: '95%', u: 'quarterly'}] },
];

// Role-level skill defaults + style references each role should read from
const ROLE_REFS_MAP = {
  1: { skills: ['Vision','Sales','Recruiting','Storytelling'], refs: ['Strategy · Positioning', 'Strategy · ICPs', 'Growth · Pulse'] },
  2: { skills: ['Strategy','Facilitation','Writing','Frameworks'], refs: ['Strategy · Positioning', 'Strategy · ICPs', 'Strategy · Packages'] },
  3: { skills: ['Writing','Editing','Multi-channel','Cadence'], refs: ['Content · Brand voice', 'Content · Templates', 'Strategy · Positioning'] },
  4: { skills: ['Brand design','Typography','Figma','Moodboards'], refs: ['Content · Brands', 'Content · Moodboards', 'Aesthetic library'] },
  5: { skills: ['Operations','Finance','Contracts','Process'], refs: ['Toolkit · Automations', 'Finance · Pricing', 'Operations docs'] },
  6: { skills: ['Network','Senior intros','Sales coaching'], refs: ['Strategy · ICPs', 'Sales · Playbook', 'Partners'] },
  7: { skills: ['Closing','Pipeline mgmt','Coaching'], refs: ['Sales · Playbook', 'Strategy · ICPs', 'Outreach library'] },
  8: { skills: ['Writing','Research','Synthesis'], refs: ['Strategy · Playbooks', 'Content · Templates', 'Positioning'] },
  9: { skills: ['Account mgmt','Empathy','Process'], refs: ['Toolkit · Automations', 'Strategy · ICPs', 'Retention playbook'] },
};

const TeamOptimizer = () => {
  const insights = [
    { tone: 'red',   icon: 'plus',  kind: 'Skill gap',     title: 'No one owns paid ads',          desc: 'Meta + Google ads unassigned. Cremona expansion needs this skill in 4 weeks.',         action: 'Define role' },
    { tone: 'red',   icon: 'team',  kind: 'Capacity',      title: 'Designer at 110% load',          desc: 'Sara has 4 brand kits in flight. Sunnyside onboarding is slipping 1–2 weeks.',          action: 'Hire contractor' },
    { tone: 'amber', icon: 'bolt',  kind: 'Bottleneck',    title: 'Lucía over-capacity 3 weeks',    desc: 'Strategy delivery on Mulberry slipping. Recommend pairing with Junior Strategist.', action: 'Redistribute' },
    { tone: 'green', icon: 'arrow', kind: 'Opportunity',   title: 'Tomás trending up',              desc: 'Days-to-collect dropped 18 → 12 in 6 weeks. Could absorb Ops scope from Eneas.',     action: 'Expand scope' },
  ];
  return (
    <section className="optim-hero">
      <header className="optim-hero-head">
        <div className="optim-eyebrow">
          <span className="optim-eyebrow-dot"/>
          © AI team optimizer
          <span className="optim-eyebrow-live">live</span>
        </div>
        <div className="optim-sub">Reads from <strong>9 roles</strong> · <strong>6 KPI trends</strong> · <strong>Capacity logs</strong> · last sync 2m ago</div>
        <button className="optim-ask">
          <OS_ICON name="sparkle" size={12}/>Ask Agent about the team
        </button>
      </header>
      <div className="optim-grid">
        {insights.map((i, idx) => (
          <article key={idx} className={`optim-card optim-${i.tone}`}>
            <header className="optim-card-head">
              <span className="optim-card-ic"><OS_ICON name={i.icon} size={11}/></span>
              <span className="optim-card-kind">{i.kind}</span>
            </header>
            <h4 className="optim-card-title">{i.title}</h4>
            <p className="optim-card-desc">{i.desc}</p>
            <button className="optim-card-action">{i.action} <OS_ICON name="arrow" size={10}/></button>
          </article>
        ))}
      </div>
    </section>
  );
};

const ScalingRoles = () => {
  const [open, setOpen] = useRsS(null);

  const departments = [...new Set(ROLES.map(r => r.dept))];
  const deptColors = {
    Leadership: 'var(--wine)',
    Strategy:   'var(--sky)',
    Content:    'var(--pink)',
    Design:     'var(--accent)',
    Operations: 'var(--purple)',
    Sales:      'var(--sage)',
    Delivery:   '#5c1d18',
  };
  const statusByDept = {};
  departments.forEach(d => {
    statusByDept[d] = {
      filled:  ROLES.filter(r => r.dept === d && r.status === 'filled').length,
      hiring:  ROLES.filter(r => r.dept === d && r.status === 'hiring').length,
      planned: ROLES.filter(r => r.dept === d && r.status === 'planned').length,
    };
  });

  return (
    <>
      {/* Department org-cluster summary */}
      <section className="roles-hero">
        <div className="roles-hero-head">
          <div className="pos-hero-eyebrow">
            <span className="pos-hero-dot"/>
            © Team structure
          </div>
          <div className="roles-hero-stats">
            <span><strong>{ROLES.length}</strong> roles</span>
            <span className="dot-sep">·</span>
            <span><strong>{ROLES.filter(r => r.status === 'filled').length}</strong> filled</span>
            <span className="dot-sep">·</span>
            <span><strong>{ROLES.filter(r => r.status === 'hiring').length}</strong> hiring</span>
            <span className="dot-sep">·</span>
            <span><strong>{ROLES.filter(r => r.status === 'planned').length}</strong> planned</span>
          </div>
        </div>
        <div className="roles-org">
          {departments.map(d => {
            const dr = ROLES.filter(r => r.dept === d);
            const c = deptColors[d] || 'var(--os-fg-2)';
            const totalCost = dr.reduce((s, r) => s + r.cost, 0);
            return (
              <div key={d} className="roles-dept" style={{ '--c': c }}>
                <header className="roles-dept-head">
                  <span className="roles-dept-marker"/>
                  <span className="roles-dept-name">{d}</span>
                  <span className="roles-dept-count">{dr.length}</span>
                </header>
                <div className="roles-dept-people">
                  {dr.map(r => (
                    <button key={r.id} className={`roles-dept-person ${r.status}`} onClick={() => setOpen(r.id === open ? null : r.id)} title={`${r.title} · ${r.status}`}>
                      <span className="roles-dept-av">{r.person ? r.person[0] : '?'}</span>
                      <span className="roles-dept-info">
                        <span className="roles-dept-role">{r.title}</span>
                        <span className="roles-dept-meta">{r.person || '— planned'} · {r.phase}</span>
                      </span>
                    </button>
                  ))}
                </div>
                <footer className="roles-dept-foot">
                  <span>${totalCost.toLocaleString()}/mo</span>
                  <span className="roles-dept-status">
                    {statusByDept[d].filled > 0 && <span title="Filled" style={{ background: 'var(--ok)' }}/>}
                    {statusByDept[d].hiring > 0 && <span title="Hiring" style={{ background: 'var(--accent)' }}/>}
                    {statusByDept[d].planned > 0 && <span title="Planned" style={{ background: 'var(--os-fg-3)' }}/>}
                  </span>
                </footer>
              </div>
            );
          })}
        </div>
      </section>

      {/* Role cards (grid) */}
      <div className="role-grid">
        {ROLES.map(r => {
          const c = deptColors[r.dept] || 'var(--os-fg-2)';
          const totalKpiAvg = Math.round((Math.random() * 30) + 65); // placeholder visual
          const isOpen = open === r.id;
          return (
            <article key={r.id} className={`role-card ${isOpen ? 'expanded' : ''} ${r.status}`} style={{ '--c': c }} onClick={() => setOpen(isOpen ? null : r.id)}>
              <header className="role-card-head">
                <span className="role-card-av" style={{ background: r.person ? c : 'transparent', color: r.person ? '#fff' : c, borderColor: c }}>
                  {r.person ? r.person[0] : '?'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 className="role-card-title">{r.title}</h3>
                  <div className="role-card-meta">
                    <span>{r.dept}</span><span className="dot-sep">·</span><span>{r.type}</span><span className="dot-sep">·</span><span>{r.phase}</span>
                  </div>
                </div>
                <span className={`brand-status ${r.status === 'filled' ? 'active' : r.status === 'hiring' ? 'draft' : 'archived'}`}>{r.status}</span>
              </header>

              {r.person && (
                <div className="role-card-person">
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--os-fg-2)' }}>Filled by</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--os-fg-0)', marginTop: 2 }}>{r.person}</span>
                  <div className="role-card-kpis">
                    {r.kpis.slice(0, 2).map((k, i) => {
                      const pct = 60 + i * 20;
                      return (
                        <div key={i} className="role-card-kpi">
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--os-fg-2)', marginBottom: 3 }}>
                            <span>{k.m}</span><span style={{ color: 'var(--os-fg-0)' }}>{k.t}</span>
                          </div>
                          <div className="phase-bar"><div className="phase-fill" style={{ width: `${pct}%`, background: pct > 80 ? 'var(--ok)' : pct > 60 ? c : 'var(--err)' }}/></div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {!r.person && (
                <div className="role-card-person empty">
                  <span style={{ fontSize: 12, color: 'var(--os-fg-2)' }}>{r.rationale}</span>
                </div>
              )}

              {/* Skills + Style references — configurable per role */}
              <div className="role-skills">
                <div className="role-skills-row">
                  <span className="role-skills-label">Skills</span>
                  <div className="role-skills-tags">
                    {(ROLE_REFS_MAP[r.id]?.skills || r.skills).slice(0, 4).map(s => (
                      <span key={s} className="role-skill-tag">{s}</span>
                    ))}
                    <button className="role-skill-add" title="Add skill"><OS_ICON name="plus" size={9}/></button>
                  </div>
                </div>
                <div className="role-skills-row">
                  <span className="role-skills-label">References</span>
                  <div className="role-skills-tags">
                    {(ROLE_REFS_MAP[r.id]?.refs || []).map(ref => (
                      <span key={ref} className="role-ref-chip">
                        <span className="role-ref-dot" style={{ background: c }}/>
                        {ref}
                      </span>
                    ))}
                    <button className="role-skill-add" title="Link reference"><OS_ICON name="link" size={9}/></button>
                  </div>
                </div>
              </div>

              <footer className="role-card-foot">
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--os-fg-1)' }}>${r.cost.toLocaleString()}/mo</span>
                <OS_ICON name={isOpen ? 'chevup' : 'chevdown'} size={13} style={{ color: 'var(--os-fg-3)' }}/>
              </footer>

              {isOpen && (
                <div className="role-card-expand" onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div>
                      <SectionTitle>Rationale</SectionTitle>
                      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--os-fg-1)', lineHeight: 1.55 }}>{r.rationale}</p>
                      <SectionTitle>Skills</SectionTitle>
                      <div className="brand-tags">{r.skills.map(s => <span key={s} className="brand-tag sel">{s}</span>)}</div>
                    </div>
                    <div>
                      <SectionTitle>Core tasks</SectionTitle>
                      <ul style={{ margin: '0 0 12px', paddingLeft: 18, color: 'var(--os-fg-1)', fontSize: 12.5, lineHeight: 1.65 }}>
                        {r.tasks.map((t, i) => <li key={i}>{t}</li>)}
                      </ul>
                      <SectionTitle>KPIs</SectionTitle>
                      <div style={{ background: 'var(--os-surface)', borderRadius: 8, padding: '8px 12px' }}>
                        {r.kpis.map((k, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: i < r.kpis.length - 1 ? '1px dashed rgba(90,62,62,0.10)' : '0', fontSize: 11.5 }}>
                            <span style={{ color: 'var(--os-fg-1)' }}>{k.m}</span>
                            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--os-fg-0)', fontWeight: 500 }}>{k.t}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
};

// ─────────────────────────────────────────────────────────────
// SCALING → ROADMAP (Gantt-style)
// ─────────────────────────────────────────────────────────────
const ScalingRoadmap = () => {
  const months = ['M1','M2','M3','M4','M5','M6','M7','M8','M9','M10','M11','M12'];
  const sortedRoles = [...ROLES].map(r => ({ ...r, monthIdx: parseInt(r.phase.replace('M',''), 10) - 1 }));
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, fontSize: 12, color: 'var(--os-fg-2)' }}>
        {[{l:'Filled',c:'var(--ok)'},{l:'Hiring',c:'var(--accent)'},{l:'Planned',c:'var(--os-fg-3)'}].map(l => (
          <span key={l.l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: l.c }}/>{l.l}
          </span>
        ))}
      </div>
      <section className="card">
        <div className="roadmap">
          <div className="roadmap-head">
            <span className="roadmap-cell"/>
            {months.map(m => (
              <span key={m} className="roadmap-month">{m}<small>{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m.replace('M',''),10)-1]}</small></span>
            ))}
          </div>
          {sortedRoles.map(r => (
            <div key={r.id} className="roadmap-row">
              <div className="roadmap-cell">
                <div style={{ fontSize: 12.5, color: 'var(--os-fg-0)', fontWeight: 500 }}>{r.title}</div>
                <div style={{ fontSize: 10.5, color: 'var(--os-fg-2)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{r.dept} · {r.type}</div>
              </div>
              <div className="roadmap-track">
                <div
                  className={`roadmap-bar ${r.status}`}
                  style={{ left: `${(r.monthIdx / 12) * 100}%`, width: `${(((12 - r.monthIdx)) / 12) * 100}%` }}
                  title={`${r.title} · ${r.status}`}
                >
                  <span>{r.title.split(' ')[0]}</span>
                  <span className="roadmap-bar-cost">${r.cost.toLocaleString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="roadmap-foot">
          <span><strong>9</strong> roles defined</span>
          <span className="dot-sep">·</span>
          <span><strong>6</strong> filled</span>
          <span className="dot-sep">·</span>
          <span><strong>1</strong> hiring</span>
          <span className="dot-sep">·</span>
          <span><strong>$24.6K</strong> current monthly · projected <strong>$32.3K</strong> at M12</span>
        </div>
      </section>
    </>
  );
};

// ─────────────────────────────────────────────────────────────
// SCALING → COSTS
// ─────────────────────────────────────────────────────────────
const ScalingCosts = () => {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const revenue = [38,42,45,48,52,55,58,62,65,68,72,76];
  const cost    = [12,12,16,19,22,22,24.6,24.6,28,28,32,32];
  const max = 80;
  return (
    <>
      <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {[
          { lbl: 'Team cost · monthly', v: '$24.6K' },
          { lbl: 'Revenue · monthly',    v: '$58.4K' },
          { lbl: 'Margin',                v: '58%' },
          { lbl: 'Projected M12',         v: '+$7.7K' },
        ].map((k, i) => (
          <div className="kpi" key={i}>
            <div className="kpi-head"><span className="kpi-lbl">{k.lbl}</span></div>
            <div className="kpi-row-val"><span className="kpi-v">{k.v}</span></div>
          </div>
        ))}
      </div>

      <section className="card">
        <header className="card-head">
          <span className="card-title"><span className="ic"><OS_ICON name="activity" size={12}/></span>Cost vs revenue · 12 months</span>
          <span className="card-action">Add next hire +</span>
        </header>
        <div className="card-body">
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 200, padding: '12px 0' }}>
            {months.map((m, i) => (
              <div key={m} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <div style={{ height: 170, width: '100%', display: 'flex', alignItems: 'flex-end', position: 'relative', justifyContent: 'center', gap: 3 }}>
                  <div style={{ width: 10, height: `${(revenue[i] / max) * 100}%`, background: 'var(--accent)', borderRadius: 3, opacity: 0.85 }} title={`Revenue $${revenue[i]}K`}/>
                  <div style={{ width: 10, height: `${(cost[i] / max) * 100}%`, background: 'var(--wine)', borderRadius: 3, opacity: 0.85 }} title={`Cost $${cost[i]}K`}/>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--os-fg-2)' }}>{m}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 18, justifyContent: 'center', paddingTop: 8, borderTop: '1px dashed rgba(90,62,62,0.10)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--os-fg-2)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--accent)' }}/>Revenue
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--os-fg-2)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--wine)' }}/>Team cost
            </span>
          </div>
        </div>
      </section>
    </>
  );
};

// ─────────────────────────────────────────────────────────────
// GROWTH → METRICS (funnel)
// ─────────────────────────────────────────────────────────────
const GrowthMetrics = () => {
  const funnel = [
    { stage: 'New',         n: 142, w: 100, conv: null },
    { stage: 'Contacted',   n: 98,  w: 82,  conv: '69%' },
    { stage: 'Call done',   n: 54,  w: 62,  conv: '55%' },
    { stage: 'Proposal',    n: 28,  w: 44,  conv: '52%' },
    { stage: 'Negotiating', n: 16,  w: 30,  conv: '57%' },
    { stage: 'Won',         n: 11,  w: 20,  conv: '69%' },
  ];
  const sources = [
    { l: 'LinkedIn',   c: 'var(--sky)',    leads: 58, rate: '22%', adv: '$22K' },
    { l: 'Referral',   c: 'var(--accent)', leads: 36, rate: '35%', adv: '$28K' },
    { l: 'Inbound',    c: 'var(--sage)',   leads: 28, rate: '29%', adv: '$26K' },
    { l: 'Outbound',   c: 'var(--pink)',   leads: 20, rate: '15%', adv: '$18K' },
  ];
  const totalSource = sources.reduce((s, x) => s + x.leads, 0);
  return (
    <>
      <section className="card" style={{ marginBottom: 18 }}>
        <header className="card-head">
          <span className="card-title"><span className="ic"><OS_ICON name="metrics" size={12}/></span>Pipeline funnel · last 90 days</span>
          <span className="card-action">Last 90 days ▾</span>
        </header>
        <div className="card-body" style={{ padding: '20px 24px' }}>
          {funnel.map((f, i) => (
            <div key={f.stage} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 90px 70px', gap: 14, alignItems: 'center', padding: '7px 0' }}>
              <span style={{ fontSize: 12, color: 'var(--os-fg-1)' }}>{f.stage}</span>
              <div style={{ height: 32, position: 'relative', display: 'flex', alignItems: 'center' }}>
                <div style={{ width: `${f.w}%`, height: '100%', background: `linear-gradient(90deg, color-mix(in oklab, var(--accent) ${30 + i*8}%, var(--os-surface)), color-mix(in oklab, var(--accent) ${20 + i*8}%, var(--os-surface-2)))`, borderRadius: 6, display: 'flex', alignItems: 'center', paddingLeft: 12, color: 'var(--os-fg-0)', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>{f.n}</div>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--os-fg-2)' }}>{f.conv ? `${f.conv} conv` : 'entered'}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--os-fg-3)' }}>{Math.round((f.n / 142) * 100)}% total</span>
            </div>
          ))}
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <section className="card">
          <header className="card-head">
            <span className="card-title"><span className="ic"><OS_ICON name="sales" size={12}/></span>Source effectiveness</span>
          </header>
          <div className="card-body" style={{ padding: 0 }}>
            {sources.map((s, i) => (
              <div key={s.l} style={{ padding: '12px 18px', display: 'grid', gridTemplateColumns: '90px 1fr 70px 70px', gap: 14, alignItems: 'center', borderBottom: i < sources.length - 1 ? '1px dashed rgba(90,62,62,0.10)' : '0' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: s.c }}/>{s.l}
                </span>
                <div className="phase-bar"><div className="phase-fill" style={{ width: `${(s.leads / totalSource) * 100}%`, background: s.c }}/></div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, textAlign: 'right', color: 'var(--os-fg-1)' }}>{s.leads} leads</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, textAlign: 'right', color: 'var(--os-fg-0)', fontWeight: 500 }}>{s.rate}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <header className="card-head">
            <span className="card-title"><span className="ic"><OS_ICON name="money" size={12}/></span>Revenue forecast · weighted</span>
          </header>
          <div className="card-body">
            {[
              { stage: 'Call done · 30%',   v: 96.5, w: 28.95 },
              { stage: 'Proposal · 55%',     v: 178,  w: 97.9 },
              { stage: 'Negotiating · 75%',  v: 92,   w: 69 },
              { stage: 'Won · 100%',          v: 124,  w: 124 },
            ].map((r, i) => (
              <div key={i} style={{ padding: '8px 0', borderBottom: i < 3 ? '1px dashed rgba(90,62,62,0.10)' : '0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: 'var(--os-fg-1)' }}>{r.stage}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--os-fg-0)', fontWeight: 500 }}>${r.w.toFixed(0)}K weighted</span>
                </div>
                <div className="phase-bar"><div className="phase-fill" style={{ width: `${(r.w / 130) * 100}%`, background: 'var(--accent)' }}/></div>
              </div>
            ))}
            <div style={{ marginTop: 12, padding: '12px 14px', background: 'var(--os-ink)', color: 'var(--livv-cream-50)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.6 }}>Total forecast · 90d</span>
              <span style={{ fontSize: 22, fontWeight: 300, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>$319K</span>
            </div>
          </div>
        </section>
      </div>
    </>
  );
};

// ─────────────────────────────────────────────────────────────
// TOOLKIT → FRAMEWORKS
// ─────────────────────────────────────────────────────────────
const FRAMEWORKS = [
  { id: 1, name: 'Positioning Sprint',      cat: 'Positioning', deliv: 'Report', price: '$8K',  hours: 24, color: 'var(--accent)', desc: 'Define what you sell, to whom, against whom, and why now — in 5 sessions.' },
  { id: 2, name: 'Channel Audit',            cat: 'Channels',    deliv: 'Playbook', price: '$5K', hours: 16, color: 'var(--sky)',    desc: 'Map current channel mix vs ICP behavior. Identify gaps and 90-day priorities.' },
  { id: 3, name: 'Content Engine Blueprint', cat: 'Content',     deliv: 'Playbook', price: '$6K', hours: 20, color: 'var(--pink)',   desc: 'Design a publishing system that runs without the founder. Cadence + roles + templates.' },
  { id: 4, name: 'Pricing Architecture',     cat: 'Growth',      deliv: 'Report', price: '$7K',  hours: 22, color: 'var(--sage)',   desc: 'Restructure offers and price to attract better-fit clients with less negotiation.' },
  { id: 5, name: 'Sales Playbook',           cat: 'Growth',      deliv: 'Playbook', price: '$6.5K', hours: 22, color: 'var(--wine)', desc: 'Document discovery → proposal → close so anyone on the team can run a deal.' },
  { id: 6, name: 'Brand-as-System',           cat: 'Positioning', deliv: 'Presentation', price: '$4K', hours: 14, color: '#A855F7', desc: 'Translate brand strategy into operational decisions across content, sales and delivery.' },
];

const ToolkitFrameworks = () => {
  const [open, setOpen] = useRsS(null);
  return (
    <>
      <div className="brand-grid">
        {FRAMEWORKS.map(f => (
          <article key={f.id} className="brand-card" style={{ borderColor: `color-mix(in oklab, ${f.color} 22%, var(--os-border-2))` }}>
            <header className="brand-card-head">
              <div className="brand-logo" style={{ background: `color-mix(in oklab, ${f.color} 14%, var(--os-surface))`, color: f.color }}>
                <OS_ICON name="spark" size={18}/>
              </div>
              <div className="brand-card-meta">
                <h3>{f.name}</h3>
                <span className="brand-industry">{f.cat} · {f.deliv}</span>
              </div>
              <span className="brand-status active">{f.price}</span>
            </header>
            <p className="brand-tagline" style={{ borderColor: f.color, fontStyle: 'normal' }}>{f.desc}</p>
            <footer className="brand-card-foot">
              <span><strong>{f.hours}h</strong> estimated</span>
              <span className="dot-sep">·</span>
              <span>Used 14 times</span>
              <button className="conn-btn connect" style={{ marginLeft: 'auto' }} onClick={() => setOpen(f)}>Use for client <OS_ICON name="arrow" size={10}/></button>
            </footer>
          </article>
        ))}
      </div>
      {open && <FrameworkLaunch fw={open} onClose={() => setOpen(null)}/>}
    </>
  );
};

const FrameworkLaunch = ({ fw, onClose }) => {
  const [client, setClient] = useRsS('Mulberry Group');
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="so-overlay" onClick={onClose}/>
      <aside className="so" style={{ width: 560, '--icp-color': fw.color }} data-screen-label="Use framework">
        <header className="so-head">
          <div className="brand-logo" style={{ background: `color-mix(in oklab, ${fw.color} 14%, var(--os-surface))`, color: fw.color, width: 44, height: 44, borderRadius: 12 }}>
            <OS_ICON name="spark" size={18}/>
          </div>
          <div className="so-titleline">
            <div className="so-title">{fw.name}</div>
            <div className="so-sub">
              <span>{fw.cat} · {fw.deliv}</span>
              <span className="sep">·</span>
              <span>{fw.price} · {fw.hours}h</span>
            </div>
          </div>
          <div className="so-actions">
            <button className="so-iconbtn" onClick={onClose}><OS_ICON name="close" size={14} stroke={2}/></button>
          </div>
        </header>
        <div className="so-body brand-body">
          <div className="brand-stack">
            <div className="brand-section">
              <SectionTitle>What it is</SectionTitle>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: 'var(--os-fg-1)' }}>{fw.desc}</p>
            </div>
            <div className="brand-section">
              <SectionTitle>Run for client</SectionTitle>
              <div className="coach-field">
                <span className="coach-field-label">Client</span>
                <div className="coach-choices">
                  {['Mulberry Group', 'Cremona Capital', 'Sunnyside', 'Boreal Beauty'].map(c => (
                    <button key={c} className={`coach-choice ${client === c ? 'sel' : ''}`} onClick={() => setClient(c)}>{c}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="brand-section">
              <SectionTitle>What gets created</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {[
                  { l: `Project · ${fw.name} for ${client}`, ic: 'tasks' },
                  { l: `Tasks · ${fw.hours}h scoped + assigned`, ic: 'calendar' },
                  { l: `Deliverable shell · ${fw.deliv}`, ic: 'docs' },
                  { l: `Invoice · ${fw.price} draft`, ic: 'money' },
                ].map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--os-surface)', borderRadius: 9 }}>
                    <span style={{ width: 24, height: 24, borderRadius: 7, background: 'var(--os-panel)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: fw.color, flexShrink: 0 }}>
                      <OS_ICON name={s.ic} size={12}/>
                    </span>
                    <span style={{ fontSize: 12.5, color: 'var(--os-fg-0)' }}>{s.l}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="so-action-row">
              <button className="so-action" onClick={onClose}>Cancel</button>
              <button className="so-action primary"><OS_ICON name="bolt" size={13}/>Create project</button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

// ─────────────────────────────────────────────────────────────
// TOOLKIT → AI CONFIG
// ─────────────────────────────────────────────────────────────
const AI_PROMPTS = [
  { id: 'call', name: 'Call summary',         icon: 'phone',  desc: 'Summarize a discovery / status call into structured notes + action items.',     last: '2d ago', runs: 47 },
  { id: 'outreach', name: 'Outreach generator', icon: 'mail',   desc: 'Generate a personalized cold or warm outreach across LinkedIn, Email, Loom.', last: 'Today',  runs: 184 },
  { id: 'case', name: 'Case study generator', icon: 'docs',   desc: 'Turn a completed project + metrics into a long-form case study draft.',         last: '5d ago', runs: 12 },
  { id: 'weekly', name: 'Weekly summary',      icon: 'sparkle',desc: 'Compose the Sunday weekly snapshot from KPIs, completed tasks, blockers.',     last: '4d ago', runs: 8 },
  { id: 'content', name: 'Content ideation',    icon: 'spark',  desc: 'Suggest 10 content angles for a brand, channel, and ICP combination.',         last: '1d ago', runs: 62 },
];

const ToolkitAI = () => {
  const [active, setActive] = useRsS(AI_PROMPTS[1].id);
  const prompt = AI_PROMPTS.find(p => p.id === active);

  // Flow diagram: trigger module → prompt → output module
  const FLOW = {
    call:     { from: 'Sales · call recorded',      to: 'Projects · action items', fromC: 'var(--accent)', toC: 'var(--sage)' },
    outreach: { from: 'Sales · new lead',           to: 'Outreach drafts',           fromC: 'var(--accent)', toC: 'var(--sky)' },
    case:     { from: 'Projects · completed',        to: 'Content · case study',      fromC: 'var(--sage)',   toC: 'var(--pink)' },
    weekly:   { from: 'Growth · Sunday 18:00',       to: 'Dashboard · weekly snap',   fromC: 'var(--wine)',   toC: 'var(--accent)' },
    content:  { from: 'Studio · ICP + brand',        to: 'Content · 10 angles',       fromC: 'var(--pink)',   toC: 'var(--sky)' },
  };
  const flow = FLOW[active] || FLOW.outreach;

  return (
    <>
      {/* Hero flow */}
      <section className="ai-hero">
        <div className="pos-hero-eyebrow">
          <span className="pos-hero-dot"/>
          © AI prompt flow · live
        </div>
        <div className="ai-flow">
          <div className="ai-flow-node from" style={{ '--c': flow.fromC }}>
            <span className="ai-flow-eyebrow">Trigger</span>
            <span className="ai-flow-label">{flow.from}</span>
          </div>
          <div className="ai-flow-pipe">
            <div className="ai-flow-pulse"/>
            <div className="ai-flow-pulse" style={{ animationDelay: '0.7s' }}/>
            <div className="ai-flow-pulse" style={{ animationDelay: '1.4s' }}/>
          </div>
          <div className="ai-flow-prompt">
            <OS_ICON name="sparkle" size={16}/>
            <div>
              <span className="ai-flow-eyebrow" style={{ color: 'var(--accent-bright)' }}>Prompt</span>
              <span className="ai-flow-label" style={{ color: 'var(--livv-cream-50)' }}>{prompt.name}</span>
            </div>
            <span className="ai-flow-meta">{prompt.runs} runs · {prompt.last}</span>
          </div>
          <div className="ai-flow-pipe">
            <div className="ai-flow-pulse"/>
            <div className="ai-flow-pulse" style={{ animationDelay: '0.7s' }}/>
            <div className="ai-flow-pulse" style={{ animationDelay: '1.4s' }}/>
          </div>
          <div className="ai-flow-node to" style={{ '--c': flow.toC }}>
            <span className="ai-flow-eyebrow">Output</span>
            <span className="ai-flow-label">{flow.to}</span>
          </div>
        </div>
        <div className="ai-stats">
          {[
            { l: 'Active prompts', v: AI_PROMPTS.length },
            { l: 'Runs · this month', v: AI_PROMPTS.reduce((s, p) => s + p.runs, 0) },
            { l: 'Tokens used', v: '184K' },
            { l: 'Avg latency', v: '2.4s' },
          ].map((s, i) => (
            <div key={i} className="ai-stat">
              <span className="ai-stat-v">{s.v}</span>
              <span className="ai-stat-l">{s.l}</span>
            </div>
          ))}
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 14 }}>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {AI_PROMPTS.map(p => (
            <button key={p.id} className={`studio-brand-opt ${active === p.id ? 'sel' : ''}`} onClick={() => setActive(p.id)}>
              <span style={{ width: 30, height: 30, borderRadius: 9, background: active === p.id ? 'rgba(255,255,255,0.10)' : 'var(--os-panel)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: active === p.id ? 'var(--accent-bright)' : 'var(--os-fg-1)' }}>
                <OS_ICON name={p.icon} size={14}/>
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>{p.name}</div>
                <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', marginTop: 2 }}>{p.runs} runs · {p.last}</div>
              </div>
            </button>
          ))}
        </aside>
        <section className="card">
          <header className="card-head">
            <span className="card-title"><span className="ic"><OS_ICON name={prompt.icon} size={12}/></span>{prompt.name}</span>
            <span className="card-action">Test prompt →</span>
          </header>
          <div className="card-body">
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--os-fg-1)', lineHeight: 1.55 }}>{prompt.desc}</p>
            <SectionTitle>Prompt template</SectionTitle>
            <textarea className="notes" style={{ minHeight: 220, fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.65 }} defaultValue={`You are a senior strategist at Livv Studio.

CONTEXT:
- Brand: {{brand.name}} — {{brand.industry}}
- Brand voice: {{brand.voice}}
- Forbidden words: {{brand.forbidden}}
- ICP target: {{icp.name}} — pain points: {{icp.pains}}

INPUT: {{user.briefing}}

TASK:
Write 3 variations of a {{channel}} {{type}} for this brand and ICP.

CONSTRAINTS:
- Hook in the first 50 characters
- No emojis, no em dashes
- Always end with one of the approved CTAs: {{brand.ctas}}

Return as JSON with keys: v1, v2, v3.`}/>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className="so-action primary" style={{ flex: 0 }}><OS_ICON name="sparkle" size={12}/>Test with sample data</button>
              <button className="so-action" style={{ flex: 0 }}>Reset to default</button>
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--os-fg-3)', display: 'flex', alignItems: 'center' }}>Last saved · just now</span>
            </div>
          </div>
        </section>
      </div>
    </>
  );
};

// ─────────────────────────────────────────────────────────────
// TOOLKIT → SETTINGS
// ─────────────────────────────────────────────────────────────
const ToolkitSettings = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
    <section className="card">
      <header className="card-head"><span className="card-title"><span className="ic"><OS_ICON name="dashboard" size={12}/></span>Workspace</span></header>
      <div className="card-body">
        <div className="brand-grid-2">
          <div><FieldLabel>Workspace name</FieldLabel><input className="coach-input" defaultValue="Livv Studio"/></div>
          <div><FieldLabel>Plan</FieldLabel><div className="coach-input" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span>Operator · $89/mo</span><span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ok)' }}>● ACTIVE</span></div></div>
          <div style={{ gridColumn: '1 / -1' }}><FieldLabel>Brand colors (workspace UI)</FieldLabel><div style={{ display: 'flex', gap: 8, marginTop: 6 }}>{['#C4A35A','#2C0405','#769268','#6DBEDC','#F1ADD8'].map(c => <span key={c} style={{ width: 32, height: 32, borderRadius: 8, background: c, border: '0.5px solid var(--os-border-2)', cursor: 'pointer' }}/>)}</div></div>
        </div>
      </div>
    </section>

    <section className="card">
      <header className="card-head"><span className="card-title"><span className="ic"><OS_ICON name="team" size={12}/></span>Team access <span className="count">3</span></span><span className="card-action">+ Invite member</span></header>
      <div className="card-body" style={{ padding: 0 }}>
        {[
          { name: 'Eneas',  email: 'eneas@livv.studio',  role: 'Admin',  color: 'var(--accent)' },
          { name: 'Lucía',  email: 'lucia@livv.studio',  role: 'Editor', color: 'var(--sky)' },
          { name: 'Mateo',  email: 'mateo@livv.studio',  role: 'Editor', color: 'var(--pink)' },
        ].map((m, i, a) => (
          <div key={m.name} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 100px 30px', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: i < a.length - 1 ? '1px dashed rgba(90,62,62,0.10)' : '0' }}>
            <span className="av" style={{ background: m.color, marginLeft: 0 }}>{m.name[0]}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--os-fg-2)', fontFamily: 'var(--font-mono)' }}>{m.email}</div>
            </div>
            <span className="conn-perm" style={{ justifySelf: 'end' }}>{m.role}</span>
            <button className="so-iconbtn"><OS_ICON name="edit" size={12}/></button>
          </div>
        ))}
      </div>
    </section>

    <section className="card">
      <header className="card-head"><span className="card-title"><span className="ic"><OS_ICON name="link" size={12}/></span>Data &amp; export</span></header>
      <div className="card-body">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[
            { l: 'Export all data', d: 'Full backup as JSON', i: 'docs' },
            { l: 'Webhooks', d: 'Connect external tools', i: 'link' },
            { l: 'Delete workspace', d: 'Permanently · 30-day grace', i: 'close' },
          ].map((b, i) => (
            <button key={b.l} className="so-action" style={{ flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', padding: '14px 16px', gap: 4, height: 'auto' }}>
              <OS_ICON name={b.i} size={14} style={{ color: i === 2 ? 'var(--err)' : 'var(--os-fg-1)' }}/>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: i === 2 ? 'var(--err)' : 'var(--os-fg-0)' }}>{b.l}</span>
              <span style={{ fontSize: 11, color: 'var(--os-fg-2)' }}>{b.d}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  </div>
);

// Consolidated views — multiple sections per single tab
const SectionBreak = ({ icon, label, kicker }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '32px 0 18px', paddingBottom: 12, borderBottom: '1px dashed rgba(90,62,62,0.18)' }}>
    <span style={{ width: 28, height: 28, borderRadius: 9, background: 'var(--os-ink)', color: 'var(--accent-bright)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <OS_ICON name={icon} size={14}/>
    </span>
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--os-fg-2)' }}>{kicker}</div>
      <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--os-fg-0)', letterSpacing: '-0.015em' }}>{label}</div>
    </div>
  </div>
);

const GrowthPulse = () => (
  <>
    <Dashboard/>
    <SectionBreak icon="metrics" kicker="© Sub-view" label="Pipeline metrics"/>
    <GrowthMetrics/>
    <SectionBreak icon="phases" kicker="© Sub-view" label="Growth phases"/>
    <PhasesTab/>
  </>
);

const ScalingPlan = () => (
  <>
    <TeamOptimizer/>
    <ScalingRoles/>
    <SectionBreak icon="calendar" kicker="© Sub-view" label="Hiring roadmap"/>
    <ScalingRoadmap/>
    <SectionBreak icon="money" kicker="© Sub-view" label="Cost tracker"/>
    <ScalingCosts/>
  </>
);

const ContentLibrary = () => (
  <>
    <ContentTemplates/>
    <SectionBreak icon="activity" kicker="© Sub-view" label="Channel performance"/>
    <ContentPerformance/>
  </>
);

Object.assign(window, {
  ContentTemplates, ContentPipeline, ContentPerformance,
  StrategyPackages, StrategyPositioning,
  ScalingRoles, ScalingRoadmap, ScalingCosts,
  GrowthMetrics,
  ToolkitFrameworks, ToolkitAI, ToolkitSettings,
  GrowthPulse, ScalingPlan, ContentLibrary, SectionBreak,
});
