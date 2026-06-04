// Livv Dashboard — Brief (AI + stats) + Tasks + Agenda + Projects sections
const { useState: useS } = React;

const BriefSection = () => {
  const stats = [
    { v: 25, l: 'Overdue', tone: 'red' },
    { v: 1, l: 'Due today', tone: 'amber' },
    { v: 0, l: 'Events today', tone: '' },
    { v: 157, l: 'Pending msgs', tone: 'violet' },
  ];
  const chips = [
    { label: 'Plan my week', icon: 'calendar' },
    { label: "What's blocked?", icon: 'alert' },
    { label: 'Follow-ups', icon: 'mail' },
    { label: 'Catch me up', icon: 'bolt' },
    { label: 'Summarize Sunnyside', icon: 'sparkle' },
  ];
  return (
    <section className="brief-section" data-screen-label="Brief">
      <div className="brief-eyebrow-row">
        <span className="eyebrow">© Brief — Tuesday, May 19</span>
        <span className="meetings-status">No meetings ahead</span>
      </div>

      <div className="stat-grid">
        {stats.map((s, i) => (
          <div key={i} className={`stat-tile ${s.tone}`}>
            <div className="v">{s.v}</div>
            <div className="l">{s.l}</div>
          </div>
        ))}
      </div>

      <div className="brief-chat">
        <div className="brief-greeting">
          <div className="brief-avatar">
            <Icon name="sparkle" size={16}/>
          </div>
          <h2 className="brief-greeting-text">
            Morning, Eneas. <span className="accent">What do you want to do first?</span>
          </h2>
        </div>

        <div className="quick-chips">
          {chips.map(c => (
            <button key={c.label} className="chip">
              <Icon name={c.icon} size={12}/>
              {c.label}
            </button>
          ))}
        </div>

        <div className="chat-input">
          <input placeholder="Ask anything…  e.g. show me what's overdue on Sunnyside" />
          <button className="chat-icon-btn"><Icon name="mic" size={14}/></button>
          <button className="chat-icon-btn primary"><Icon name="send" size={14}/></button>
        </div>
      </div>
    </section>
  );
};

const TaskRow = ({ task }) => {
  const [done, setDone] = useS(false);
  return (
    <div className="task-row">
      <div className={`task-check ${done ? 'done' : ''}`} onClick={(e) => { e.stopPropagation(); setDone(!done); }}>
        {done && <Icon name="check" size={11}/>}
      </div>
      <div className="task-body">
        <div className="task-title">
          {task.title}
          {task.workspace && <span className="workspace">{task.workspace}</span>}
        </div>
        <div className="task-meta">
          <span className="overdue"><Icon name="clock" size={11}/> {task.overdue} overdue</span>
          {task.duration && <span className="duration"><Icon name="clock" size={11}/> {task.duration}</span>}
          {task.workspace && <span className="ws">{task.workspace}</span>}
        </div>
      </div>
      {task.priority && (
        <span className={`task-priority ${task.priority}`}>{task.priority.toUpperCase()}</span>
      )}
    </div>
  );
};

const TasksSection = () => {
  const [tab, setTab] = useS('tasks');
  const [open, setOpen] = useS(true);
  const tabs = [
    { id: 'tasks', label: 'Tasks', icon: 'tasks', count: 48 },
    { id: 'calendar', label: 'Calendar', icon: 'calendar', count: 4 },
    { id: 'inbox', label: 'Inbox', icon: 'inbox', count: 157 },
  ];
  return (
    <section className="card tasks-section" data-screen-label="Tasks">
      <div className="tabs-bar">
        {tabs.map(t => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} size={13}/>
            <span>{t.label}</span>
            <span className="pill">{t.count}</span>
          </button>
        ))}
        <div className="tabs-bar-right">
          <span className="open-full">Open full <Icon name="arrowUpRight" size={11}/></span>
        </div>
      </div>

      {tab === 'tasks' && (
        <>
          <div className="section-label">
            <Icon name="alert" size={11}/>
            <span>Overdue</span>
            <span className="count">{OVERDUE_TASKS.length}</span>
            <span className="toggle" onClick={() => setOpen(!open)}>
              <Icon name={open ? 'chevronUp' : 'chevronDown'} size={13}/>
            </span>
          </div>
          {open && OVERDUE_TASKS.map(t => <TaskRow key={t.id} task={t} />)}
        </>
      )}

      {tab === 'calendar' && (
        <div style={{padding: '30px 20px 20px'}}>
          <div className="section-label" style={{padding: 0, marginBottom: 12}}>
            <Icon name="calendar" size={11} style={{color: '#769268'}}/>
            <span>Today — Tuesday, May 19</span>
            <span className="count">4 events</span>
          </div>
          {[
            { time: '09:00', title: 'Async standup — Livv team', tone: 'sage' },
            { time: '11:30', title: 'Sunnyside checkpoint review', tone: 'amber' },
            { time: '14:00', title: 'Strategy: Christie King roadmap', tone: 'pink' },
            { time: '16:30', title: 'Pricing call — Ethos Group', tone: 'sage' },
          ].map((e, i) => (
            <div key={i} className="agenda-future" style={{borderTopStyle: i === 0 ? 'none' : 'dashed', marginTop: 0, padding: '12px 0'}}>
              <div className="time-rail">{e.time}</div>
              <div className="body">
                <Icon name="calendar" size={13}/>
                {e.title}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'inbox' && (
        <div style={{padding: '20px'}}>
          {[
            { from: 'Christie King', subject: 'Re: Homepage hero direction', preview: 'Loving the latest take. One small note about the typography weight…', when: '08:42', unread: true },
            { from: 'Sunnyside · Slack', subject: 'New thread in #design-review', preview: 'Marina shared 3 reference frames for the CMS architecture.', when: '07:30', unread: true },
            { from: 'Stripe', subject: 'Payment received — $1,414', preview: 'Christie King paid invoice INV-0042.', when: 'Yesterday', unread: false },
            { from: 'Ethos Group', subject: 'Scope question — Phase 2', preview: 'Quick question before we kick off Phase 2 next week…', when: 'Yesterday', unread: false },
            { from: 'Livv Lead Gen', subject: 'New inbound — Frenetic Sports', preview: 'Founder reached out about a 6-week sprint.', when: 'Mon', unread: false },
          ].map((m, i) => (
            <div key={i} style={{
              display: 'flex', gap: 12, padding: '12px 0',
              borderBottom: '1px solid var(--livv-cream-100)', cursor: 'pointer'
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10,
                background: 'var(--livv-cream-100)', display:'flex', alignItems:'center', justifyContent:'center',
                fontSize: 11, fontWeight: 500, color: 'var(--livv-cream-700)', flex: '0 0 32px'
              }}>{m.from[0]}</div>
              <div style={{flex: 1, minWidth: 0}}>
                <div style={{display:'flex', alignItems:'center', gap: 8}}>
                  <strong style={{fontSize: 13, color: m.unread ? 'var(--livv-cream-900)' : 'var(--livv-cream-600)', fontWeight: m.unread ? 500 : 400}}>{m.from}</strong>
                  {m.unread && <span style={{width: 6, height: 6, borderRadius: 999, background: '#7c5cff'}}/>}
                  <span style={{marginLeft:'auto', fontSize: 11, fontFamily:'var(--font-mono)', color:'var(--livv-cream-500)'}}>{m.when}</span>
                </div>
                <div style={{fontSize: 12.5, color: m.unread ? 'var(--livv-cream-800)' : 'var(--livv-cream-600)', marginTop: 2}}>{m.subject}</div>
                <div style={{fontSize: 12, color:'var(--livv-cream-500)', marginTop: 2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{m.preview}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

const AgendaSection = () => (
  <section className="card" style={{padding: '18px 20px', marginBottom: 24}} data-screen-label="Today's Agenda">
    <div style={{display:'flex', alignItems:'center', gap: 10, marginBottom: 14}}>
      <Icon name="calendar" size={14} style={{color:'var(--livv-cream-700)'}}/>
      <h3 className="card-title" style={{margin: 0}}>Today's Agenda</h3>
      <span className="card-title-counter">1</span>
      <span className="open-full" style={{marginLeft:'auto'}}>Ver calendario <Icon name="arrowUpRight" size={11}/></span>
    </div>

    <div className="section-label" style={{padding: '0 0 8px', color: 'var(--livv-destructive)'}}>
      <Icon name="alert" size={11}/>
      <span>24 atrasadas</span>
    </div>

    {TODAY_AGENDA.map(a => (
      <div key={a.id} className="agenda-row">
        <div className="icon"><Icon name="alert" size={13}/></div>
        <div className="title">{a.title}</div>
        <div className="time">{a.when}</div>
        <div className="dot"/>
      </div>
    ))}

    <div style={{textAlign:'center', padding: '10px 0', fontSize: 11.5, color:'var(--livv-cream-500)', cursor:'pointer'}}>
      +19 más
    </div>

    <div className="agenda-future">
      <div className="time-rail">14:00</div>
      <div className="body">
        <Icon name="check" size={13}/>
        Art direction and image guidance delivered
      </div>
      <span className="dot" style={{width: 7, height: 7, borderRadius: 999, background:'#6DBEDC'}}/>
    </div>
  </section>
);

// ── Today's Brief — multi-zone digest (load · inbox · what's coming) ──
const TodaysBrief = () => {
  const zones = [
    {
      id: 'load',
      icon: 'clock',
      title: "Today's load",
      tone: '#ef4444',
      pills: [
        { l: 'Overdue', v: 26, hot: true },
        { l: 'Due today', v: 1 },
      ],
      items: [
        { tag: 'checkpoint', label: 'Checkpoint 1 — Architecture approval', sub: '4d overdue', ws: 'Sunnyside', wsC: '#E8BC59' },
        { tag: 'fire',       label: 'Upgrade portofio livv',                  sub: '6d overdue', ws: 'Livv',      wsC: '#6DBEDC' },
        { tag: 'fire',       label: 'Phase 1 — Architecture & Setup',        sub: '5d overdue', ws: 'Sunnyside', wsC: '#E8BC59' },
        { tag: 'fire',       label: 'Phase 2 — Design Finalization',          sub: '3d overdue', ws: 'Sunnyside', wsC: '#E8BC59' },
        { tag: 'plain',      label: 'Framer project setup',                   sub: '4d overdue', ws: 'Livv',      wsC: '#6DBEDC' },
      ],
      more: 21,
    },
    {
      id: 'inbox',
      icon: 'mail',
      title: 'Inbox signals',
      tone: '#E8BC59',
      pills: [
        { l: 'Pending', v: 50 },
        { l: 'Urgent', v: 0, muted: true },
        { l: 'Requests', v: 0, muted: true },
      ],
      items: [
        { tag: 'msg', label: 'Christie — Re: Homepage hero direction', sub: '08:42', ws: 'Christie King', wsC: '#F1ADD8' },
        { tag: 'msg', label: 'Sunnyside · Slack — 3 reference frames', sub: '07:30', ws: 'Sunnyside',     wsC: '#E8BC59' },
        { tag: 'msg', label: 'Stripe — Payment received $1,414',       sub: 'yest.',  ws: 'Finances',      wsC: '#769268' },
      ],
      more: 47,
    },
    {
      id: 'coming',
      icon: 'calendar',
      title: "What's coming",
      tone: '#769268',
      pills: [
        { l: 'Events 7d', v: 0, muted: true },
        { l: 'Deadlines 7d', v: 30 },
      ],
      items: [
        { tag: 'date', d: '05·20', label: 'Finalize remaining page designs', ws: 'Sunnyside', wsC: '#E8BC59' },
        { tag: 'date', d: '05·20', label: 'Lucky sub-brand experience locked', ws: 'Sunnyside', wsC: '#E8BC59' },
        { tag: 'date', d: '05·25', label: 'Create mood boards', ws: 'Christie King', wsC: '#F1ADD8' },
        { tag: 'date', d: '05·26', label: 'Select color palette', ws: 'Christie King', wsC: '#F1ADD8' },
      ],
      more: 26,
    },
  ];

  return (
    <section className="brief-digest" data-screen-label="Today's Brief">
      <header className="bd-head">
        <div className="bd-eyebrow">
          <span className="bd-pulse"/>
          <span>Today's brief</span>
          <span className="bd-date">Tuesday, May 19</span>
        </div>
        <div className="bd-head-actions">
          <button className="bd-iconbtn" title="View signals over time"><Icon name="activity" size={13}/></button>
          <button className="bd-iconbtn" title="Brief settings"><Icon name="settings" size={13}/></button>
        </div>
      </header>

      <p className="bd-aphorism">
        <span className="bd-quote-dot"/>
        La calidad del input determina la calidad del output.
        <em>Cuidá tu dieta de info.</em>
      </p>

      <div className="bd-grid">
        {zones.map(z => <BriefZone key={z.id} zone={z}/>)}
      </div>

      <footer className="bd-foot">
        <span className="bd-foot-arrow" aria-hidden/>
        <span>Open full Brief</span>
        <span className="bd-foot-meta">Tasks · Calendar · Inbox</span>
        <Icon name="arrowUpRight" size={12}/>
      </footer>
    </section>
  );
};

const BriefZone = ({ zone }) => {
  return (
    <article className={`bd-zone bd-zone--${zone.id}`} style={{'--tone': zone.tone}}>
      <header className="bd-zone-head">
        <span className="bd-zone-icon"><Icon name={zone.icon} size={13}/></span>
        <h3 className="bd-zone-title">{zone.title}</h3>
        {zone.id === 'load' && <span className="bd-zone-dot" aria-hidden/>}
      </header>

      <div className="bd-pills">
        {zone.pills.map((p, i) => (
          <span key={i} className={`bd-pill ${p.muted ? 'is-muted' : ''} ${p.hot ? 'is-hot' : ''}`}>
            <span className="bd-pill-label">{p.l}</span>
            <span className="bd-pill-val">{p.v}</span>
          </span>
        ))}
      </div>

      <ul className="bd-list">
        {zone.items.map((it, i) => (
          <li key={i} className="bd-item">
            <BriefItemTag tag={it.tag} d={it.d}/>
            <span className="bd-item-body">
              <span className="bd-item-label">{it.label}</span>
              <span className="bd-item-meta">
                {it.sub && <span className="bd-item-sub">{it.sub}</span>}
                {it.ws && (
                  <span className="bd-item-ws">
                    <span className="bd-ws-dot" style={{background: it.wsC}}/>
                    {it.ws}
                  </span>
                )}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <button className="bd-zone-more">
        +{zone.more} more
        <Icon name="chevron" size={10}/>
      </button>
    </article>
  );
};

const BriefItemTag = ({ tag, d }) => {
  switch (tag) {
    case 'fire':
      return (
        <span className="bd-tag bd-tag-fire" title="Hot / overdue">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M12 2c2 5 6 6 6 11a6 6 0 0 1-12 0c0-3 1-4 2-6 1 2 2 3 3 3 0-3-1-5 1-8z" fill="currentColor"/>
          </svg>
        </span>
      );
    case 'checkpoint':
      return (
        <span className="bd-tag bd-tag-checkpoint" title="Checkpoint">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M8 13l2 2 4-4"/>
          </svg>
        </span>
      );
    case 'msg':
      return (
        <span className="bd-tag bd-tag-msg" title="Message">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 8.4 8.4 0 0 1-4-1L3 21l1-5a8.4 8.4 0 0 1-1-4 8.4 8.4 0 0 1 17 0z"/>
          </svg>
        </span>
      );
    case 'date':
      return (
        <span className="bd-tag bd-tag-date">{d}</span>
      );
    default:
      return <span className="bd-tag bd-tag-plain"/>;
  }
};

const ProjectsSection = () => (
  <section data-screen-label="Active Projects">
    <div style={{display:'flex', alignItems:'baseline', gap: 14, marginBottom: 6}}>
      <h3 style={{margin: 0, fontSize: 18, fontWeight: 300, letterSpacing:'-0.02em'}}>Active projects</h3>
      <span style={{fontFamily:'var(--font-mono)', fontSize: 10, letterSpacing:'0.18em', color:'var(--livv-cream-500)', textTransform:'uppercase'}}>4 of 17</span>
      <span style={{marginLeft:'auto', display:'inline-flex', alignItems:'center', gap: 14, fontSize: 12, color:'var(--livv-cream-500)'}}>
        <span style={{display:'inline-flex', alignItems:'center', gap: 5, cursor:'pointer'}}>
          <Icon name="star" size={12}/> Destacar
        </span>
        <span style={{cursor:'pointer'}}>View all →</span>
      </span>
    </div>

    <div className="projects-grid">
      {ACTIVE_PROJECTS.map(p => (
        <div key={p.id} className="project-card">
          <div className="project-head">
            <div className="project-avatar" style={{background: `${p.color}22`, color: p.color === '#E8BC59' ? '#8b6a17' : 'var(--livv-cream-800)'}}>
              {p.initials}
            </div>
            <div className="project-meta">
              <div className="name">{p.name}</div>
              <div className="status">active</div>
            </div>
            <span style={{marginLeft:'auto', fontFamily:'var(--font-mono)', fontSize: 10, color:'var(--livv-cream-500)', letterSpacing: '0.1em'}}>
              {p.progress}%
            </span>
          </div>
          <div className="project-progress">
            <div className="bar"><div className="fill" style={{width: `${p.progress}%`, background: p.color}}/></div>
          </div>
        </div>
      ))}
    </div>
  </section>
);

Object.assign(window, { BriefSection, TasksSection, AgendaSection, ProjectsSection, TodaysBrief });
