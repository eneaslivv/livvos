// LIVV OS — Pipeline board + Lead Detail slide-over
const { useState: usePS, useEffect: usePE } = React;

// ── Stats bar ─────────────────────────────────────────────────
const STATS = [
  {
    lbl: 'Pipeline value',
    icon: 'money',
    v: '$890K',
    delta: { dir: 'up', n: '+12%' },
    spark: [3,4,3,5,6,5,7,9].map((h, i, a) => ({h, peak: i === a.length-1})),
  },
  {
    lbl: 'Won this month',
    icon: 'tasks',
    v: '$124K',
    delta: { dir: 'up', n: '+38%' },
    spark: [2,2,3,3,4,3,5,7].map((h, i, a) => ({h, peak: i === a.length-1})),
  },
  {
    lbl: 'Win rate · 30d',
    icon: 'activity',
    v: '24.5%',
    delta: { dir: 'flat', n: '±0' },
    spark: [4,5,4,6,5,5,6,5].map(h => ({h, peak: false})),
  },
  {
    lbl: 'Avg cycle',
    icon: 'clock',
    v: '21 days',
    delta: { dir: 'down', n: '−4d' },
    spark: [7,6,7,6,5,5,4,4].map(h => ({h, peak: false})),
  },
];

const Stats = () => (
  <div className="stats">
    {STATS.map((s, i) => (
      <div className="stat" key={i}>
        <span className="stat-lbl"><span className="ic"><OS_ICON name={s.icon} size={11}/></span>{s.lbl}</span>
        <div className="stat-row">
          <span className="stat-v">{s.v}</span>
          <span className={`stat-delta ${s.delta.dir}`}>
            {s.delta.dir === 'up' && '↑'}
            {s.delta.dir === 'down' && '↓'}
            {s.delta.dir === 'flat' && '→'}
            {s.delta.n}
          </span>
        </div>
        <div className="stat-spark" aria-hidden>
          {s.spark.map((b, j) => (
            <span key={j} className={`bar ${b.peak ? 'peak' : ''}`} style={{height: `${(b.h / 9) * 100}%`}}/>
          ))}
        </div>
      </div>
    ))}
  </div>
);

// ── Lead card ─────────────────────────────────────────────────
const LeadCard = ({ lead, onOpen, selected }) => {
  const icp = ICPS[lead.icp];
  const ageCls = lead.age > 7 ? 'bad' : lead.age > 5 ? 'warn' : '';
  const whenCls = lead.hot ? 'hot' : lead.cold ? 'cold' : '';
  return (
    <div
      className={`lc ${selected ? 'selected' : ''}`}
      style={{'--icp-color': icp.color}}
      onClick={() => onOpen(lead)}
    >
      <span className="lc-icp-bar"/>
      <span className={`lc-age ${ageCls}`}>{lead.age}d</span>
      <div className="lc-top">
        <div style={{minWidth: 0}}>
          <div className="lc-company">{lead.company}</div>
          <div className="lc-contact">{lead.contact}</div>
        </div>
        <span className="lc-icp-pill">{icp.short}</span>
      </div>
      <div className="lc-meta">
        <span className="badge">
          <OS_ICON name="link" size={9} stroke={2}/>
          {lead.source}
        </span>
      </div>
      <div className="lc-deal">
        <span className="impl">${(lead.impl/1000).toFixed(0)}K</span>
        <span className="sep">·</span>
        <span className="mrr">${(lead.mrr/1000).toFixed(1)}K/mo</span>
      </div>
      <div className="lc-foot">
        <span className="action">{lead.action}</span>
        <span className={`when ${whenCls}`}>{lead.when}</span>
        <span className="av-mini" style={{background: lead.owner === 'EN' ? 'var(--accent)' : 'var(--blue)'}}>{lead.owner}</span>
      </div>
    </div>
  );
};

// ── Kanban ────────────────────────────────────────────────────
const PipelineBoard = ({ onOpenLead, selectedId }) => (
  <div className="kanban">
    {STAGES.map(stage => {
      const leads = LEADS.filter(l => l.stage === stage.id);
      const total = leads.reduce((s, l) => s + l.impl + (l.mrr || 0) * 6, 0);
      return (
        <section
          key={stage.id}
          className={`col col-${stage.marker || ''}`}
        >
          <header className="col-head">
            <span className="marker"/>
            <span className="col-name">{stage.label}</span>
            <span className="col-count">
              <span className="n">{leads.length}</span>
              <button className="col-add" title="Add lead"><OS_ICON name="plus" size={12}/></button>
            </span>
          </header>
          <div className="col-total">
            <span>VALUE</span>
            <strong>${(total/1000).toFixed(0)}K</strong>
          </div>
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
);

// ── Lead Detail slide-over ────────────────────────────────────
const LeadDetail = ({ lead, onClose }) => {
  const [tab, setTab] = usePS('overview');
  const icp = ICPS[lead.icp];

  usePE(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="so-overlay" onClick={onClose}/>
      <aside className="so" data-screen-label="Lead Detail" style={{'--icp-color': icp.color}}>
        <header className="so-head">
          <div className="so-icp">{icp.short}</div>
          <div className="so-titleline">
            <div className="so-title">
              {lead.company}
              <span className="so-status"><span className="dot"/>{STAGES.find(s => s.id === lead.stage).label}</span>
            </div>
            <div className="so-sub">
              <span>{lead.contact}</span>
              <span className="sep">·</span>
              <span className="lk">camila@mulberry.co</span>
              <span className="sep">·</span>
              <span className="lk">linkedin.com/in/camilaortiz</span>
            </div>
          </div>
          <div className="so-actions">
            <button className="so-iconbtn" title="Expand to full page"><OS_ICON name="expand" size={14}/></button>
            <button className="so-iconbtn" title="Edit"><OS_ICON name="edit" size={14}/></button>
            <button className="so-iconbtn" title="Close" onClick={onClose}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </header>

        <div className="so-value">
          <div className="so-vbox">
            <div className="so-vlbl">Implementation</div>
            <div className="so-vval">${(lead.impl/1000).toFixed(0)}K <small>one-time</small></div>
          </div>
          <div className="so-vbox">
            <div className="so-vlbl">Retainer</div>
            <div className="so-vval">${(lead.mrr/1000).toFixed(1)}K <small>/ mo</small></div>
          </div>
          <div className="so-vbox">
            <div className="so-vlbl">12-mo ARR</div>
            <div className="so-vval">${((lead.impl + lead.mrr * 12)/1000).toFixed(0)}K</div>
          </div>
        </div>

        <nav className="so-tabs">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'outreach', label: 'Outreach', badge: OUTREACH.length },
            { id: 'notes',    label: 'Notes' },
          ].map(t => (
            <button key={t.id} className={`so-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
              {t.badge && <span className="badge">{t.badge}</span>}
            </button>
          ))}
        </nav>

        <div className="so-body">
          {tab === 'overview' && <OverviewTab lead={lead}/>}
          {tab === 'outreach' && <OutreachTab/>}
          {tab === 'notes' && <NotesTab/>}
        </div>
      </aside>
    </>
  );
};

const OverviewTab = ({ lead }) => {
  const icp = ICPS[lead.icp];
  return (
    <>
      <div className="so-row">
        <span className="k"><OS_ICON name="user" size={12}/>Owner</span>
        <span className="v">
          <span className="pill editable">
            <span className="dot" style={{background: lead.owner === 'EN' ? 'var(--accent)' : 'var(--blue)'}}/>
            {lead.owner === 'EN' ? 'Eneas' : 'Lucía'}
          </span>
        </span>
      </div>
      <div className="so-row">
        <span className="k"><OS_ICON name="link" size={12}/>Source</span>
        <span className="v">
          <span className="pill">{lead.source}</span>
          <span style={{color:'var(--text-2)', fontSize: 11.5}}>via personal intro · Iris @ Sable Loft</span>
        </span>
      </div>
      <div className="so-row">
        <span className="k"><OS_ICON name="strategy" size={12}/>ICP match</span>
        <span className="v">
          <span className="pill editable" style={{color: icp.color, borderColor: `color-mix(in oklab, ${icp.color} 30%, transparent)`}}>
            <span className="dot" style={{background: icp.color}}/>
            {icp.name}
          </span>
          <span style={{color:'var(--text-2)', fontSize: 11.5}}>+ Content Engine retainer</span>
        </span>
      </div>
      <div className="so-row">
        <span className="k"><OS_ICON name="bolt" size={12}/>Next action</span>
        <span className="v">
          <span className="pill editable">Build proposal v2</span>
          <span className="pill editable">due today</span>
        </span>
      </div>
      <div className="so-row">
        <span className="k"><OS_ICON name="clock" size={12}/>In stage</span>
        <span className="v" style={{color: 'var(--text-1)'}}>2 days · entered May 17 after discovery call</span>
      </div>

      <div className="so-ai">
        <div className="so-ai-icon"><OS_ICON name="sparkle" size={13}/></div>
        <div className="so-ai-body">
          <div className="so-ai-eyebrow">© AI advisor</div>
          <div className="so-ai-text">
            Mulberry replied to your last email at <strong>08:42</strong>. Camila mentioned budget approval from their CFO is the gate. Two similar agency-ICP deals closed when we showed a <strong>30/60/90 deliverable timeline</strong>. Want me to build proposal v2 with that frame and the Sunnyside case attached?
          </div>
          <div className="so-ai-cta">
            <button className="so-ai-btn"><OS_ICON name="sparkle" size={11}/>Draft proposal v2</button>
            <button className="so-ai-btn ghost">Show similar deals</button>
          </div>
        </div>
      </div>

      <div className="so-action-row">
        <button className="so-action primary">
          <OS_ICON name="tasks" size={13}/>Convert to Project
        </button>
        <button className="so-action">
          <OS_ICON name="docs" size={13}/>Generate Invoice
        </button>
      </div>
    </>
  );
};

const OutreachTab = () => (
  <>
    <div className="timeline">
      {OUTREACH.map((o, i) => (
        <div key={i} className="tl-item">
          <span className={`tl-dot ${o.cls}`}>
            <OS_ICON name={o.icon} size={9}/>
          </span>
          <div className="tl-head">
            <span className="tl-channel">{o.channel}</span>
            <span className="tl-kind">{o.kind}</span>
            <span className="tl-when">{o.when}</span>
          </div>
          <div className="tl-msg">{o.msg}</div>
          {o.reply && (
            <div className="tl-reply">
              <strong>Reply ·</strong> {o.reply}
            </div>
          )}
        </div>
      ))}
    </div>
    <button className="log-btn">
      <OS_ICON name="plus" size={13}/>
      Log outreach
    </button>
  </>
);

const NotesTab = () => (
  <textarea
    className="notes"
    defaultValue={`Camila is the founder. Started Mulberry in 2019, 18 people now.\n\nMain pain: she's the bottleneck on content. Tried 2 freelancers, didn't stick — wants a system, not more headcount.\n\nDecision flow: she signs but CFO (Marco) approves anything over $20K/yr.\n\nWarm signal: mentioned Sunnyside three times. Wants the same playbook.`}
  />
);

Object.assign(window, { Stats, PipelineBoard, LeadDetail, LeadCard, OverviewTab, OutreachTab, NotesTab });
