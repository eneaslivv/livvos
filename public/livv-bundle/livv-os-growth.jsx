// LIVV OS — Growth page (Dashboard / Sales / Metrics / Phases)
const { useState: useGS } = React;

// ──────────────────────────────────────────────────────────────
// DASHBOARD TAB
// ──────────────────────────────────────────────────────────────
const Dashboard = () => (
  <>
    <div className="kpi-row">
      {KPIS.map((k, i) => (
        <div className="kpi" key={i}>
          <div className="kpi-head">
            <span className="kpi-lbl"><span className="ic"><OS_ICON name={k.icon} size={11}/></span>{k.lbl}</span>
            <span className={`kpi-delta ${k.delta.dir}`}>
              {k.delta.dir === 'up' && '↑'}
              {k.delta.dir === 'down' && '↓'}
              {k.delta.dir === 'flat' && '→'}
              {k.delta.n}
            </span>
          </div>
          <div className="kpi-row-val">
            <span className="kpi-v">{k.v}</span>
            <span className="kpi-target">{k.target}</span>
          </div>
          <div className="kpi-spark" aria-hidden>
            {k.spark.map((h, j, a) => (
              <span
                key={j}
                className={`bar ${j === a.length - 1 ? 'peak' : ''}`}
                style={{ height: `${(h / 9) * 100}%` }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>

    <div className="dash-cols">
      <ThisWeek/>
      <ActivityFeed/>
    </div>

    <WeeklySnapshot/>
  </>
);

const ThisWeek = () => {
  const [done, setDone] = useGS({});
  return (
    <section className="card" data-screen-label="This Week">
      <header className="card-head">
        <span className="card-title">
          <span className="ic"><OS_ICON name="tasks" size={12}/></span>
          This week
          <span className="count">{THIS_WEEK.length}</span>
        </span>
        <span className="card-action">View all →</span>
      </header>
      <div className="card-body">
        {THIS_WEEK.map(t => (
          <div
            key={t.id}
            className="tw-item"
            style={{ '--mod-c': MOD_COLOR[t.mod] }}
            onClick={() => setDone(p => ({ ...p, [t.id]: !p[t.id] }))}
          >
            <span className={`tw-check ${done[t.id] ? 'done' : ''}`} onClick={e => { e.stopPropagation(); setDone(p => ({ ...p, [t.id]: !p[t.id] })); }}>
              {done[t.id] && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-11"/></svg>}
            </span>
            <div className="tw-body">
              <div className={`tw-title ${done[t.id] ? 'done' : ''}`}>{t.title}</div>
              <div className="tw-meta">
                <span className="tw-mod">{t.mod}</span>
                <span className={`tw-when ${t.hot ? 'hot' : ''}`}>{t.when}</span>
              </div>
            </div>
            <span className="tw-arrow"><OS_ICON name="arrow" size={12}/></span>
          </div>
        ))}
      </div>
    </section>
  );
};

const ActivityFeed = () => (
  <section className="card" data-screen-label="Activity Feed">
    <header className="card-head">
      <span className="card-title">
        <span className="ic"><OS_ICON name="activity" size={12}/></span>
        Activity
      </span>
      <span className="card-action">Open feed →</span>
    </header>
    <div className="card-body">
      {ACTIVITY.map((a, i) => (
        <div key={i} className="af-item" style={{ '--mod-c': MOD_COLOR[a.mod] }}>
          <span className="af-icon"><OS_ICON name={a.icon} size={12}/></span>
          <div className="af-body">
            <div className="af-text"><strong>{a.who}</strong> {a.what}</div>
            <div className="af-meta">
              <span className="af-mod">{a.mod}</span>
              <span>·</span>
              <span>{a.when}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  </section>
);

const WeeklySnapshot = () => (
  <section className="snap" data-screen-label="Weekly Snapshot">
    <header className="snap-head">
      <span className="snap-pulse"/>
      <span className="snap-title">Weekly snapshot</span>
      <span className="snap-week">Week 21 · May 19 – 25</span>
      <button className="snap-ai-btn"><OS_ICON name="sparkle" size={11}/>AI summary</button>
    </header>
    <div className="snap-grid">
      <div className="snap-cell">
        <div className="snap-cell-title"><span>Metrics</span><span className="micro">vs last week</span></div>
        {[
          { l: 'MRR closed',         v: '$11.2K', p: '$8.6K',  d: '+30%', dir: 'up' },
          { l: 'Content published',  v: '8',       p: '6',      d: '+33%', dir: 'up' },
          { l: 'Outreach sent',      v: '24',      p: '31',     d: '−22%', dir: 'down' },
          { l: 'Deals closed (won)', v: '2',       p: '1',      d: '+1',  dir: 'up' },
          { l: 'Cycle time avg',     v: '19d',     p: '23d',    d: '−4d', dir: 'up' },
        ].map((m, i) => (
          <div className="snap-metric" key={i}>
            <span className="l">{m.l}</span>
            <span className="v">{m.v}</span>
            <span className="p">{m.p}</span>
            <span className={`d ${m.dir}`}>{m.d}</span>
          </div>
        ))}
      </div>
      <div className="snap-cell">
        <div className="snap-cell-title">Highlights</div>
        <div className="snap-note"><strong>Cremona Capital signed.</strong> Referral via Iris at Sable Loft — case study #4 in 9 months.</div>
        <div className="snap-note"><strong>Content engine compliance hit 80%</strong> for the first time. LinkedIn cadence stable for 3 weeks.</div>
        <div className="snap-note-edit">+ Add highlight</div>
      </div>
      <div className="snap-cell">
        <div className="snap-cell-title">Blockers</div>
        <div className="snap-note"><strong>Founder bandwidth on proposals.</strong> 3 sat for >5 days this week. Need templating + delegate to Lucía.</div>
        <div className="snap-note"><strong>YouTube cadence behind</strong> 4 weeks. Decision: pause or systemize?</div>
        <div className="snap-note-edit">+ Add blocker</div>
      </div>
    </div>
  </section>
);

// ──────────────────────────────────────────────────────────────
// SALES TAB
// ──────────────────────────────────────────────────────────────
const SalesTab = ({ onOpenLead, selectedId }) => (
  <>
    <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
      {[
        { lbl: 'Pipeline value', icon: 'money', v: '$890K', target: '/ goal $1.2M', delta: { dir: 'up', n: '+12%' }, spark: [3,4,3,5,6,5,7,9] },
        { lbl: 'Deals this month', icon: 'sales', v: '$124K', target: '4 won', delta: { dir: 'up', n: '+38%' }, spark: [2,2,3,3,4,3,5,7] },
        { lbl: 'Win rate · 30d',   icon: 'activity', v: '24.5%', target: 'avg cycle 21d', delta: { dir: 'flat', n: '±0' }, spark: [4,5,4,6,5,5,6,5] },
      ].map((k, i) => (
        <div className="kpi" key={i}>
          <div className="kpi-head">
            <span className="kpi-lbl"><span className="ic"><OS_ICON name={k.icon} size={11}/></span>{k.lbl}</span>
            <span className={`kpi-delta ${k.delta.dir}`}>
              {k.delta.dir === 'up' && '↑'}{k.delta.dir === 'down' && '↓'}{k.delta.dir === 'flat' && '→'}{k.delta.n}
            </span>
          </div>
          <div className="kpi-row-val"><span className="kpi-v">{k.v}</span><span className="kpi-target">{k.target}</span></div>
          <div className="kpi-spark">{k.spark.map((h, j, a) => <span key={j} className={`bar ${j === a.length-1 ? 'peak':''}`} style={{height:`${(h/9)*100}%`}}/>)}</div>
        </div>
      ))}
    </div>

    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <div className="people">
        <span className="av" style={{ background: 'var(--accent)' }}>EN</span>
        <span className="av" style={{ background: 'var(--sky)' }}>LU</span>
        <span className="av muted">+2</span>
      </div>
      <div className="filter-row">
        <button className="fc active">All ICPs</button>
        <button className="fc">Source <OS_ICON name="chevdown" size={11}/></button>
        <button className="fc">Owner <OS_ICON name="chevdown" size={11}/></button>
      </div>
    </div>

    <div className="kanban">
      {STAGES.map(stage => {
        const leads = LEADS.filter(l => l.stage === stage.id);
        const total = leads.reduce((s, l) => s + l.impl + (l.mrr || 0) * 6, 0);
        return (
          <section key={stage.id} className={`col col-${stage.marker || ''}`}>
            <header className="col-head">
              <span className="marker"/>
              <span className="col-name">{stage.label}</span>
              <span className="col-count">
                <span className="n">{leads.length}</span>
                <button className="col-add"><OS_ICON name="plus" size={12}/></button>
              </span>
            </header>
            <div className="col-total"><span>VALUE</span><strong>${(total/1000).toFixed(0)}K</strong></div>
            <div className="col-body">
              {leads.map(l => (
                <LeadCard
                  key={l.id}
                  lead={l}
                  onOpen={onOpenLead}
                  selected={l.id === selectedId}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  </>
);

const LeadCard = ({ lead, onOpen, selected }) => {
  const icp = ICPS[lead.icp];
  const ageCls = lead.age > 7 ? 'bad' : lead.age > 5 ? 'warn' : '';
  return (
    <div
      className={`lc ${selected ? 'selected' : ''}`}
      style={{ '--icp-color': icp.color }}
      onClick={() => onOpen(lead)}
    >
      <span className="lc-icp-bar"/>
      <span className={`lc-age ${ageCls}`}>{lead.age}d</span>
      {lead.referredBy && (
        <span className="lc-referral" style={{ '--rc': lead.referredBy.color }} title={`Referred by ${lead.referredBy.name} · ${lead.referredBy.code}`}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>
          </svg>
          {lead.referredBy.name}
        </span>
      )}
      <div className="lc-top">
        <div style={{ minWidth: 0 }}>
          <div className="lc-company">{lead.company}</div>
          <div className="lc-contact">{lead.contact}</div>
        </div>
        <span className="lc-icp-pill">{icp.short}</span>
      </div>
      <div className="lc-meta">
        <span className="badge"><OS_ICON name="link" size={9} stroke={2}/>{lead.source}</span>
      </div>
      <div className="lc-deal">
        <span className="impl">${(lead.impl/1000).toFixed(0)}K</span>
        <span className="sep">·</span>
        <span className="mrr">${(lead.mrr/1000).toFixed(1)}K/mo</span>
      </div>
      <div className="lc-foot">
        <span className="action">{lead.action}</span>
        <span className={`when ${lead.hot ? 'hot' : ''}`}>{lead.when}</span>
        <span className="av-mini" style={{ background: lead.owner === 'EN' ? 'var(--accent)' : 'var(--sky)' }}>{lead.owner}</span>
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────
// PHASES TAB
// ──────────────────────────────────────────────────────────────
const PhasesTab = () => (
  <>
    <div className="phase-track">
      {PHASES.map((p, i) => (
        <article key={i} className={`phase ${p.status}`}>
          <div className="phase-n">{p.n} · {p.range}</div>
          <div className="phase-name">{p.name}</div>
          <div className="phase-bar"><div className="phase-fill" style={{ width: `${p.pct}%` }}/></div>
          <div className="phase-pct">
            <span>Progress</span><strong>{p.pct}%</strong>
          </div>
        </article>
      ))}
    </div>

    <section className="card">
      <header className="card-head">
        <span className="card-title">
          <span className="ic"><OS_ICON name="phases" size={12}/></span>
          Phase 03 — Scaling milestones
          <span className="count">11 / 17</span>
        </span>
        <span className="card-action">Edit phase →</span>
      </header>
      <div className="card-body">
        {[
          { d: true, label: 'Hire Senior Strategist (role defined)' },
          { d: true, label: 'Implement weekly KPI logging across team' },
          { d: true, label: 'Cremona Capital onboarded as retainer #14' },
          { d: false, label: 'Reach $60K MRR (current $58.4K)' },
          { d: false, label: 'Publish first 5 Sunnyside-style case studies' },
          { d: false, label: 'Build content templates library — agency vertical' },
        ].map((m, i) => (
          <div key={i} className="tw-item" style={{ '--mod-c': 'var(--accent)' }}>
            <span className={`tw-check ${m.d ? 'done' : ''}`}>{m.d && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M5 12l5 5 9-11"/></svg>}</span>
            <div className="tw-body">
              <div className={`tw-title ${m.d ? 'done' : ''}`}>{m.label}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  </>
);

const MetricsTab = () => <TabStub icon="metrics" title="Pipeline metrics" blurb="Funnel visualization, conversion rates between stages, deal cycle, revenue forecast and source effectiveness. Filters on top: this month, last 3 months, YTD." tag="Coming next"/>;

Object.assign(window, { Dashboard, SalesTab, LeadCard, PhasesTab, MetricsTab, ThisWeek, ActivityFeed, WeeklySnapshot });
