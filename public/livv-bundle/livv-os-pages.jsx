// LIVV OS — Other pages (Strategy, Content, Scaling, Toolkit) + slide-overs
const { useState: useOS } = React;

// ──────────────────────────────────────────────────────────────
// STRATEGY — ICPs tab
// ──────────────────────────────────────────────────────────────
const StrategyIcps = ({ onOpenICP }) => (
  <div className="icp-grid">
    {Object.entries(ICPS).map(([id, icp]) => {
      const s = ICP_STATS[id];
      return (
        <div
          key={id}
          className="icp-card"
          style={{ '--icp-color': icp.color }}
          onClick={() => onOpenICP({ id, ...icp, ...s })}
        >
          <div className="icp-head">
            <div className="av" style={{ background: 'transparent' }}>{icp.short}</div>
            <h3>{icp.name}</h3>
            <span className={`status ${s.status}`}>{s.status}</span>
          </div>
          <p className="icp-desc">{icp.desc}</p>
          <div className="icp-stats">
            <div className="icp-stat">
              <div className="l">Ticket</div>
              <div className="v" style={{ fontSize: 13 }}>{s.ticket}</div>
            </div>
            <div className="icp-stat">
              <div className="l">Leads</div>
              <div className="v">{s.leads}</div>
            </div>
            <div className="icp-stat">
              <div className="l">Clients</div>
              <div className="v">{s.clients}</div>
            </div>
          </div>
        </div>
      );
    })}
    <button className="icp-add">
      <span className="ic-circle"><OS_ICON name="plus" size={16}/></span>
      <span>New ICP</span>
    </button>
  </div>
);

// ──────────────────────────────────────────────────────────────
// SLIDE-OVERS
// ──────────────────────────────────────────────────────────────
const LeadDetail = ({ lead, onClose }) => {
  const [tab, setTab] = useOS('overview');
  const icp = ICPS[lead.icp];
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="so-overlay" onClick={onClose}/>
      <aside className="so" style={{ '--icp-color': icp.color }} data-screen-label="Lead Detail">
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
            <button className="so-iconbtn" title="Expand"><OS_ICON name="expand" size={14}/></button>
            <button className="so-iconbtn" title="Edit"><OS_ICON name="edit" size={14}/></button>
            <button className="so-iconbtn" title="Close" onClick={onClose}><OS_ICON name="close" size={14} stroke={2}/></button>
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
            <div className="so-vval">${((lead.impl + lead.mrr*12)/1000).toFixed(0)}K</div>
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
          {tab === 'overview' && <LeadOverview lead={lead} icp={icp}/>}
          {tab === 'outreach' && <LeadOutreach/>}
          {tab === 'notes' && <LeadNotes/>}
        </div>
      </aside>
    </>
  );
};

const LeadOverview = ({ lead, icp }) => (
  <>
    <div className="so-row">
      <span className="k"><OS_ICON name="user" size={12}/>Owner</span>
      <span className="v">
        <span className="pill editable">
          <span className="dot" style={{ background: lead.owner === 'EN' ? 'var(--accent)' : 'var(--sky)' }}/>
          {lead.owner === 'EN' ? 'Eneas' : 'Lucía'}
        </span>
      </span>
    </div>
    <div className="so-row">
      <span className="k"><OS_ICON name="link" size={12}/>Source</span>
      <span className="v">
        <span className="pill">{lead.source}</span>
        <span style={{ color: 'var(--os-fg-2)', fontSize: 11.5 }}>via personal intro · Iris @ Sable Loft</span>
      </span>
    </div>
    <div className="so-row">
      <span className="k"><OS_ICON name="strategy" size={12}/>ICP match</span>
      <span className="v">
        <span className="pill editable" style={{ color: icp.color, borderColor: `color-mix(in oklab, ${icp.color} 30%, transparent)` }}>
          <span className="dot" style={{ background: icp.color }}/>
          {icp.name}
        </span>
        <span style={{ color: 'var(--os-fg-2)', fontSize: 11.5 }}>+ Content Engine retainer</span>
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
      <span className="v" style={{ color: 'var(--os-fg-1)' }}>2 days · entered May 17 after discovery call</span>
    </div>

    <div className="so-ai">
      <div className="so-ai-icon"><OS_ICON name="sparkle" size={13}/></div>
      <div className="so-ai-body">
        <div className="so-ai-eyebrow">© AI advisor</div>
        <div className="so-ai-text">
          Mulberry replied to your last email at <strong>08:42</strong>. Camila mentioned budget approval from CFO is the gate. Two similar agency-ICP deals closed when we showed a <strong>30/60/90 deliverable timeline</strong>. Want me to build proposal v2 with that frame and the Sunnyside case attached?
        </div>
        <div className="so-ai-cta">
          <button className="so-ai-btn"><OS_ICON name="sparkle" size={11}/>Draft proposal v2</button>
          <button className="so-ai-btn ghost">Show similar deals</button>
        </div>
      </div>
    </div>

    <div className="so-action-row">
      <button className="so-action primary"><OS_ICON name="tasks" size={13}/>Convert to Project</button>
      <button className="so-action"><OS_ICON name="docs" size={13}/>Generate Invoice</button>
    </div>
  </>
);

const LeadOutreach = () => (
  <>
    <div className="timeline">
      {OUTREACH.map((o, i) => (
        <div key={i} className="tl-item">
          <span className={`tl-dot ${o.cls}`}><OS_ICON name={o.icon} size={9}/></span>
          <div className="tl-head">
            <span className="tl-channel">{o.channel}</span>
            <span className="tl-kind">{o.kind}</span>
            <span className="tl-when">{o.when}</span>
          </div>
          <div className="tl-msg">{o.msg}</div>
          {o.reply && <div className="tl-reply"><strong>Reply ·</strong> {o.reply}</div>}
        </div>
      ))}
    </div>
    <button className="log-btn"><OS_ICON name="plus" size={13}/>Log outreach</button>
  </>
);

const LeadNotes = () => (
  <textarea
    className="notes"
    defaultValue={`Camila is the founder. Started Mulberry in 2019, 18 people now.\n\nMain pain: she's the bottleneck on content. Tried 2 freelancers, didn't stick — wants a system, not more headcount.\n\nDecision flow: she signs but CFO (Marco) approves anything over $20K/yr.\n\nWarm signal: mentioned Sunnyside three times. Wants the same playbook.`}
  />
);

// ICP Detail slide-over
const ICPDetail = ({ icp, onClose }) => {
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="so-overlay" onClick={onClose}/>
      <aside className="so" style={{ '--icp-color': icp.color }} data-screen-label="ICP Detail">
        <header className="so-head">
          <div className="so-icp">{icp.short}</div>
          <div className="so-titleline">
            <div className="so-title">
              {icp.name}
              <span className="so-status"><span className="dot"/>{icp.status}</span>
            </div>
            <div className="so-sub"><span>Entry module · Sales pipeline → Content Engine</span></div>
          </div>
          <div className="so-actions">
            <button className="so-iconbtn"><OS_ICON name="edit" size={14}/></button>
            <button className="so-iconbtn" onClick={onClose}><OS_ICON name="close" size={14} stroke={2}/></button>
          </div>
        </header>
        <div className="so-body" style={{ paddingTop: 12 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--os-fg-2)' }}>Pain points</h4>
          <ul style={{ margin: '0 0 16px', paddingLeft: 18, color: 'var(--os-fg-1)', fontSize: 13, lineHeight: 1.7 }}>
            <li>Founder bandwidth — they sell, deliver, and bookkeep.</li>
            <li>No system for repeatable content output.</li>
            <li>Operate from gut, not metrics — can't see what's working.</li>
            <li>Hires don't stick because there's no playbook to onboard them.</li>
          </ul>

          <h4 style={{ margin: '20px 0 8px', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--os-fg-2)' }}>Expansion path</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12, color: 'var(--os-fg-1)' }}>
            <span className="pill" style={{ background: 'color-mix(in oklab, var(--accent) 12%, #fff)', borderColor: 'var(--accent-strong)', color: 'var(--os-fg-0)', fontWeight: 500 }}>Sales pipeline</span>
            <span style={{ color: 'var(--os-fg-3)' }}>→</span>
            <span className="pill">Content engine</span>
            <span style={{ color: 'var(--os-fg-3)' }}>→</span>
            <span className="pill">Finance</span>
            <span style={{ color: 'var(--os-fg-3)' }}>→</span>
            <span className="pill">Scaling</span>
          </div>

          <h4 style={{ margin: '20px 0 8px', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--os-fg-2)' }}>Pricing</h4>
          <div className="so-value" style={{ margin: 0 }}>
            <div className="so-vbox">
              <div className="so-vlbl">Implementation</div>
              <div className="so-vval">{icp.ticket.split('+')[0].trim()}</div>
            </div>
            <div className="so-vbox">
              <div className="so-vlbl">Retainer</div>
              <div className="so-vval">{icp.ticket.split('+')[1]?.trim() || '—'}</div>
            </div>
            <div className="so-vbox">
              <div className="so-vlbl">Active clients</div>
              <div className="so-vval">{icp.clients}</div>
            </div>
          </div>

          <h4 style={{ margin: '20px 0 8px', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--os-fg-2)' }}>Deployment playbook</h4>
          {[
            'W1 — Discovery + ICP definition for the client',
            'W2 — Positioning workshop + content axis',
            'W3 — Channel setup + 3-month cadence',
            'W4 — First publish + KPI baseline',
            'W5–W8 — Iterate weekly + monthly review',
          ].map((step, i) => (
            <div key={i} className="tw-item" style={{ '--mod-c': icp.color, padding: '9px 6px', margin: 0 }}>
              <span className="tw-check"/>
              <div className="tw-body">
                <div className="tw-title" style={{ fontSize: 12.5 }}>{step}</div>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
};

// ──────────────────────────────────────────────────────────────
// CONTENT — Calendar tab (interactive · click any day or piece to compose)
// ──────────────────────────────────────────────────────────────
const ContentCalendar = () => {
  const [open, setOpen] = useOS(null); // {date, slot}
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const items = {
    Mon: [{ ch: 'li', s: 'published', title: 'Founder vs system thread', t: 'post', brand: 'L' }],
    Tue: [{ ch: 'ig', s: 'scheduled', title: 'Behind-the-scenes Sunnyside', t: 'reel', brand: 'S' }, { ch: 'li', s: 'review', title: 'Why agencies miss their cadence', t: 'carrusel', brand: 'L' }],
    Wed: [{ ch: 'yt', s: 'draft', title: 'Content engine setup — 12min', t: 'video', brand: 'L' }, { ch: 'em', s: 'scheduled', title: 'Newsletter #34: Cremona case', t: 'email', brand: 'L' }],
    Thu: [{ ch: 'li', s: 'idea', title: 'Pricing as positioning', t: 'post', brand: 'L' }],
    Fri: [{ ch: 'ig', s: 'scheduled', title: 'Friday reflection carousel', t: 'carrusel', brand: 'L' }, { ch: 'li', s: 'idea', title: 'Lessons from $30K loss', t: 'post', brand: 'L' }],
    Sat: [],
    Sun: [],
  };
  const CH = { li: 'var(--sky)', ig: 'var(--pink)', yt: '#EF4444', em: 'var(--sage)' };
  const SS = { idea: 'var(--os-fg-3)', draft: 'var(--accent)', review: '#C8862C', scheduled: 'var(--sky)', published: 'var(--ok)' };
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--os-fg-2)' }}>This week</span>
          <strong style={{ fontSize: 13 }}>3 / 5 published</strong>
        </div>
        <div className="filter-row">
          <button className="fc active">All</button>
          <button className="fc"><span style={{ width: 6, height: 6, borderRadius: 999, background: CH.li }}/>LinkedIn</button>
          <button className="fc"><span style={{ width: 6, height: 6, borderRadius: 999, background: CH.ig }}/>Instagram</button>
          <button className="fc"><span style={{ width: 6, height: 6, borderRadius: 999, background: CH.yt }}/>YouTube</button>
          <button className="fc"><span style={{ width: 6, height: 6, borderRadius: 999, background: CH.em }}/>Email</button>
        </div>
        <button className="so-action primary" style={{ marginLeft: 'auto', flex: 0 }} onClick={() => setOpen({ date: 'Today', slot: null })}>
          <OS_ICON name="sparkle" size={13}/>New with AI
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10 }}>
        {days.map((d, i) => (
          <div key={d} style={{ minHeight: 220, background: 'var(--os-panel)', border: '0.5px solid var(--os-border-2)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px dashed rgba(90,62,62,0.14)', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--os-fg-2)' }}>{d}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--os-fg-1)', fontWeight: 500 }}>{19 + i}</span>
            </div>
            <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items[d].map((it, j) => (
                <div key={j} onClick={() => setOpen({ date: `${d} ${19+i}`, slot: it })} style={{
                  borderLeft: `3px solid ${CH[it.ch]}`,
                  background: 'var(--os-surface)',
                  borderRadius: '6px',
                  padding: '8px 9px',
                  cursor: 'pointer',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: SS[it.s] }}/>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--os-fg-2)' }}>{it.t}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--os-fg-0)', lineHeight: 1.35 }}>{it.title}</div>
                </div>
              ))}
              <button onClick={() => setOpen({ date: `${d} ${19+i}`, slot: null })} style={{ padding: 8, background: 'transparent', border: '1px dashed var(--os-border-2)', borderRadius: 6, color: 'var(--os-fg-3)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <OS_ICON name="plus" size={10}/>
              </button>
            </div>
          </div>
        ))}
      </div>
      {open && <CalendarQuickCreate ctx={open} onClose={() => setOpen(null)}/>}
    </>
  );
};

// AI-assisted Quick Create from Calendar
const CalendarQuickCreate = ({ ctx, onClose }) => {
  const [brand, setBrand] = useOS(BRANDS[0]);
  const [channel, setChannel] = useOS('linkedin');
  const [type, setType] = useOS('post');
  const [icp, setIcp] = useOS('agency');
  const [refs, setRefs] = useOS([]);
  const [angle, setAngle] = useOS(null);
  const [briefing, setBriefing] = useOS('');

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const CHANNELS = [
    { id: 'linkedin',  label: 'LinkedIn',  c: '#0A66C2', types: ['Post','Carrusel','Article'] },
    { id: 'instagram', label: 'Instagram', c: '#E1306C', types: ['Reel','Carrusel','Single'] },
    { id: 'youtube',   label: 'YouTube',   c: '#FF0000', types: ['Short','Long-form'] },
    { id: 'email',     label: 'Email',     c: 'var(--sage)', types: ['Newsletter'] },
  ];
  const channelMeta = CHANNELS.find(c => c.id === channel);

  // AI-suggested angles based on brand voice + channel + ICP
  const ANGLES = [
    { id: 'story',    icon: 'chat',    title: 'Tell a client story',         hint: 'Mulberry took 6 misses → 90 days zero-miss. Show the system.' },
    { id: 'hot',      icon: 'bolt',    title: 'Hot take · contrarian',       hint: 'Reframe a common belief in your space. Take a stance.' },
    { id: 'frame',    icon: 'sparkle', title: 'Share a framework',            hint: 'The 3-channel cadence we deploy with every agency.' },
    { id: 'lesson',   icon: 'spark',   title: 'Lesson from a loss',           hint: 'The $30K mistake. What we learned. What we changed.' },
  ];

  const TONE = brand.voice;
  const aestheticPins = [
    { id: 'a1', pal: ['#2C0405','#C4A35A','#FDFBF7'], title: 'Wine + gold', mood: 'editorial' },
    { id: 'a2', pal: ['#1F1611','#C4A35A','#F5EFE8'], title: 'Mulberry warm', mood: 'craft' },
    { id: 'a3', pal: ['#0F1B2D','#6DBEDC','#E8EFF6'], title: 'Cremona clean', mood: 'minimal' },
    { id: 'a4', pal: ['#23150E','#F1ADD8','#FBF2EC'], title: 'Sunnyside playful', mood: 'lifestyle' },
    { id: 'a5', pal: ['#769268','#E8EFE5','#1F2D1A'], title: 'System grid', mood: 'system' },
    { id: 'a6', pal: ['#3D1214','#E8BC59','#F5EFE2'], title: 'Magazine spread', mood: 'editorial' },
  ];
  const togglePin = (p) => setRefs(prev => prev.find(x => x.id === p.id) ? prev.filter(x => x.id !== p.id) : prev.length >= 3 ? [...prev.slice(1), p] : [...prev, p]);

  const consistency = Math.min(100, 30 + refs.length * 15 + (angle ? 20 : 0) + (briefing.length > 20 ? 15 : 0));

  return (
    <>
      <div className="so-overlay" onClick={onClose}/>
      <aside className="so qc" style={{ width: 920, '--icp-color': channelMeta.c }} data-screen-label="Quick create">
        <header className="so-head">
          <div className="so-icp" style={{ background: 'var(--accent)', color: 'var(--os-ink)' }}>
            <OS_ICON name="sparkle" size={16}/>
          </div>
          <div className="so-titleline">
            <div className="so-title">
              New content
              <span className="so-status" style={{ background: 'var(--accent-soft)', color: '#8b6a17' }}>
                <span className="dot"/>{ctx.date}
              </span>
            </div>
            <div className="so-sub">
              <span>AI-assisted with your brand kit, aesthetics &amp; tone</span>
              <span className="sep">·</span>
              <span className="lk">Higgsfield + Pinterest</span>
            </div>
          </div>
          <div className="so-actions">
            <button className="so-iconbtn" onClick={onClose}><OS_ICON name="close" size={14} stroke={2}/></button>
          </div>
        </header>

        {/* Consistency meter */}
        <div className="qc-meter">
          <div className="qc-meter-l">
            <span className="qc-meter-label">© Consistency score</span>
            <span className="qc-meter-desc">how aligned with your brand kit · {consistency}%</span>
          </div>
          <div className="qc-meter-bar">
            <div className="qc-meter-fill" style={{ width: `${consistency}%` }}/>
            <div className="qc-meter-thresholds">
              <span style={{ left: '30%' }}/><span style={{ left: '60%' }}/><span style={{ left: '85%' }}/>
            </div>
          </div>
          <span className="qc-meter-v">{consistency}<small>%</small></span>
        </div>

        <div className="so-body qc-body">
          {/* Brand */}
          <section className="qc-section">
            <span className="qc-label">1. Brand kit</span>
            <div className="qc-brand-row">
              {BRANDS.map(b => (
                <button key={b.id} className={`qc-brand ${brand.id === b.id ? 'sel' : ''}`} onClick={() => setBrand(b)}>
                  <span className="brand-logo" style={{ background: b.logoBg, color: b.palette[2], width: 26, height: 26, borderRadius: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 600 }}>{b.initials}</span>
                  </span>
                  <span className="qc-brand-name">{b.name}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Channel + Type + ICP — visual compact */}
          <section className="qc-section">
            <span className="qc-label">2. Platform</span>
            <div className="qc-platforms">
              {CHANNELS.map(c => (
                <button key={c.id} className={`qc-platform ${channel === c.id ? 'sel' : ''}`} style={{ '--c': c.c }} onClick={() => { setChannel(c.id); setType(c.types[0].toLowerCase().replace(/[^a-z]/g,'')); }}>
                  <span className="qc-platform-dot"/>
                  <span className="qc-platform-name">{c.label}</span>
                  <span className="qc-platform-rules">{brand.fonts.heading.slice(0,8)} · 1200 chars</span>
                </button>
              ))}
            </div>
            <div className="qc-subline">
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--os-fg-3)', marginRight: 8 }}>Type</span>
              {channelMeta.types.map(t => {
                const id = t.toLowerCase().replace(/[^a-z]/g,'');
                return (
                  <button key={t} className={`fc ${type === id ? 'active' : ''}`} onClick={() => setType(id)}>{t}</button>
                );
              })}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--os-fg-3)', marginLeft: 16, marginRight: 8 }}>For</span>
              {Object.entries(ICPS).slice(0,4).map(([id, i]) => (
                <button key={id} className={`fc ${icp === id ? 'active' : ''}`} onClick={() => setIcp(id)}>
                  <span style={{ width: 5, height: 5, borderRadius: 999, background: i.color }}/>
                  {i.name}
                </button>
              ))}
            </div>
          </section>

          {/* Aesthetic refs */}
          <section className="qc-section">
            <span className="qc-label">3. Aesthetic — pick up to 3 references</span>
            <div className="qc-pins">
              {aestheticPins.map(p => {
                const sel = !!refs.find(r => r.id === p.id);
                return (
                  <button key={p.id} className={`qc-pin ${sel ? 'sel' : ''}`} onClick={() => togglePin(p)} style={{ background: `linear-gradient(135deg, ${p.pal[0]} 0%, ${p.pal[1]} 50%, ${p.pal[2] || p.pal[0]} 100%)` }}>
                    <span className="qc-pin-state">
                      {sel ? <OS_ICON name="tasks" size={9}/> : <OS_ICON name="plus" size={9}/>}
                    </span>
                    <span className="qc-pin-title">{p.title}</span>
                    <span className="qc-pin-mood">{p.mood}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Tone — from brand voice */}
          <section className="qc-section">
            <span className="qc-label">4. Tone — inherited from {brand.name}'s voice config</span>
            <div className="qc-tone-grid">
              {[
                { l: 'Formal', r: 'Casual', v: TONE.formal },
                { l: 'Technical', r: 'Accessible', v: TONE.technical },
                { l: 'Serious', r: 'Playful', v: TONE.serious },
                { l: 'Direct', r: 'Storytelling', v: TONE.direct },
              ].map((t, i) => (
                <div key={i} className="qc-tone">
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.06em', color: 'var(--os-fg-2)' }}>{t.l}</span>
                  <div className="qc-tone-track">
                    <span className="qc-tone-thumb" style={{ left: `${t.v * 100}%` }}/>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.06em', color: 'var(--os-fg-2)', textAlign: 'right' }}>{t.r}</span>
                </div>
              ))}
            </div>
          </section>

          {/* AI angle suggestions */}
          <section className="qc-section">
            <span className="qc-label">5. Angle — AI suggested for {channelMeta.label} · {ICPS[icp].name}</span>
            <div className="qc-angles">
              {ANGLES.map(a => (
                <button key={a.id} className={`qc-angle ${angle === a.id ? 'sel' : ''}`} onClick={() => { setAngle(a.id); setBriefing(a.hint); }}>
                  <span className="qc-angle-ic"><OS_ICON name={a.icon} size={13}/></span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--os-fg-0)' }}>{a.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--os-fg-2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.hint}</div>
                  </div>
                </button>
              ))}
            </div>
            <textarea className="notes" style={{ minHeight: 80, marginTop: 10, fontSize: 12.5 }} placeholder="Or write your briefing here…" value={briefing} onChange={e => setBriefing(e.target.value)}/>
          </section>

          {/* AI-composed prompt preview */}
          <section className="qc-section">
            <span className="qc-label">6. Composed prompt — what AI will use</span>
            <pre className="qc-prompt">{`<brand: ${brand.name}>
  voice: ${Object.entries(TONE).map(([k,v]) => v > 0.5 ? k : `not-${k}`).slice(0,2).join(', ')}
  palette: ${brand.palette.join(', ')}
  forbidden: revolucionario, sinergias, em dashes

<aesthetic refs>
${refs.length ? refs.map(r => `  • ${r.title} (${r.mood}) — [${r.pal.join(', ')}]`).join('\n') : '  (none — using brand defaults)'}

<task>
  ${channelMeta.label} · ${channelMeta.types.find(t => t.toLowerCase().replace(/[^a-z]/g,'') === type)} · for ${ICPS[icp].name}
  scheduled: ${ctx.date}
  ${briefing ? '\n  ' + briefing : ''}

→ Generate 3 variations consistent with brand kit + selected aesthetic`}</pre>
          </section>
        </div>

        <footer className="qc-foot">
          <span className="qc-foot-meta">⌘↵ to generate · esc to close</span>
          <button className="so-action" style={{ flex: 0 }}><OS_ICON name="calendar" size={12}/>Save as draft for {ctx.date}</button>
          <button className="so-action primary" style={{ flex: 0 }} disabled={!briefing}>
            <OS_ICON name="sparkle" size={13}/>Generate &amp; schedule
          </button>
        </footer>
      </aside>
    </>
  );
};

// ──────────────────────────────────────────────────────────────
// SCALING — Team tab
// ──────────────────────────────────────────────────────────────
const TEAM = [
  { name: 'Eneas',    role: 'Founder',           type: 'FT', kpi: 92, cost: 0,     color: 'var(--accent)' },
  { name: 'Lucía',    role: 'Sr. Strategist',    type: 'FT', kpi: 86, cost: 5200,  color: 'var(--sky)' },
  { name: 'Mateo',    role: 'Content Producer',  type: 'FT', kpi: 74, cost: 3800,  color: 'var(--pink)' },
  { name: 'Sara',     role: 'Designer',          type: 'CT', kpi: 81, cost: 3400,  color: 'var(--sage)' },
  { name: 'Tomás',    role: 'Ops & Finance',     type: 'PT', kpi: 95, cost: 2200,  color: '#A855F7' },
  { name: 'Iris',     role: 'BD Advisor',        type: 'CT', kpi: 88, cost: 1800,  color: 'var(--wine)' },
];

const ScalingTeam = () => (
  <>
    <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
      {[
        { lbl: 'Team size',     v: '9',     target: '+ 2 planned' },
        { lbl: 'Monthly cost',  v: '$24.6K', target: 'vs $58.4K MRR' },
        { lbl: 'Cost / revenue', v: '42%',  target: 'target 35%' },
        { lbl: 'On-track KPIs', v: '5 / 6', target: '83%' },
      ].map((k, i) => (
        <div className="kpi" key={i}>
          <div className="kpi-head">
            <span className="kpi-lbl">{k.lbl}</span>
          </div>
          <div className="kpi-row-val"><span className="kpi-v">{k.v}</span><span className="kpi-target">{k.target}</span></div>
        </div>
      ))}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
      {TEAM.map(p => (
        <div key={p.name} className="icp-card" style={{ '--icp-color': p.color, padding: 18 }}>
          <div className="icp-head" style={{ marginBottom: 12 }}>
            <div className="av" style={{ background: 'transparent', color: 'inherit' }}>{p.name[0]}</div>
            <div>
              <h3 style={{ fontSize: 14 }}>{p.name}</h3>
              <div style={{ fontSize: 11.5, color: 'var(--os-fg-2)', marginTop: 2 }}>{p.role}</div>
            </div>
            <span className="status">{p.type}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--os-fg-2)', marginBottom: 6 }}>
            <span>KPIs</span>
            <strong style={{ color: 'var(--os-fg-0)', fontWeight: 500, fontFamily: 'var(--font-mono)' }}>{p.kpi}%</strong>
          </div>
          <div className="phase-bar"><div className="phase-fill" style={{ width: `${p.kpi}%`, background: p.kpi > 80 ? 'var(--ok)' : p.kpi > 60 ? 'var(--warn)' : 'var(--err)' }}/></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 11.5 }}>
            <span style={{ color: 'var(--os-fg-2)' }}>Cost / mo</span>
            <strong style={{ color: 'var(--os-fg-0)', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>${p.cost.toLocaleString()}</strong>
          </div>
        </div>
      ))}
    </div>
  </>
);

// ──────────────────────────────────────────────────────────────
// TOOLKIT — Automations
// ──────────────────────────────────────────────────────────────
const ToolkitAutomations = () => {
  const rules = [
    { from: 'Growth · Projects', to: 'Content · Drafts', trig: 'Project completed', act: 'Create case-study draft', on: true, count: 24 },
    { from: 'Growth · Sales',     to: 'Projects + Finance', trig: 'Lead → Won', act: 'Create project + invoice', on: true, count: 18 },
    { from: 'Toolkit · Calls',    to: 'Projects · Tasks', trig: 'Call recorded', act: 'Extract action items', on: true, count: 47 },
    { from: 'Content',            to: 'Content · Metrics', trig: 'Piece published', act: 'Schedule metric pull in 48h', on: true, count: 62 },
    { from: 'Growth · Snapshot',  to: 'Growth', trig: 'Sunday 18:00', act: 'Auto-generate weekly snapshot', on: true, count: 12 },
    { from: 'Content · Video',    to: 'Content · Drafts', trig: 'Long-form video published', act: 'Create 3 derivative drafts', on: false, count: 8 },
  ];
  return (
    <div className="card">
      <header className="card-head">
        <span className="card-title">
          <span className="ic"><OS_ICON name="bolt" size={12}/></span>
          Active automations
          <span className="count">{rules.length}</span>
        </span>
        <span className="card-action">+ New automation</span>
      </header>
      <div className="card-body" style={{ padding: 0 }}>
        {rules.map((r, i) => (
          <div key={i} style={{
            padding: '14px 18px',
            borderBottom: i < rules.length - 1 ? '1px dashed rgba(90,62,62,0.10)' : '0',
            display: 'grid',
            gridTemplateColumns: '1fr auto auto',
            gap: 18,
            alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 13, color: 'var(--os-fg-0)', fontWeight: 500, letterSpacing: '-0.005em' }}>
                {r.trig} <span style={{ color: 'var(--os-fg-3)' }}>→</span> {r.act}
              </div>
              <div style={{ marginTop: 4, fontSize: 11, color: 'var(--os-fg-2)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
                {r.from}  →  {r.to}
              </div>
            </div>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 10.5,
              padding: '3px 10px', borderRadius: 999,
              background: 'var(--os-surface)', color: 'var(--os-fg-1)',
            }}>{r.count} runs</span>
            <span style={{
              width: 32, height: 18, borderRadius: 999,
              background: r.on ? 'var(--ok)' : 'var(--os-surface)',
              position: 'relative', cursor: 'pointer',
              transition: 'background .25s ease',
              border: '0.5px solid var(--os-border-2)',
            }}>
              <span style={{
                position: 'absolute',
                top: 1, left: r.on ? 15 : 1,
                width: 14, height: 14, borderRadius: 999,
                background: '#fff',
                transition: 'left .3s var(--ios-ease)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
              }}/>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

Object.assign(window, { StrategyIcps, LeadDetail, ICPDetail, ContentCalendar, ScalingTeam, ToolkitAutomations, TEAM });
