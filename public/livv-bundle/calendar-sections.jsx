// Calendar page — sections
const { useState: useCalS } = React;

const CAL_TASKS = [
  // Overdue
  { id: 'c1', title: 'Terminar primer draft de libro Kru', date: 'May 8', band: 'overdue', workspace: 'Kru Book', owner: 'LU', status: 'todo', priority: 'medium', wsColor: '#F1ADD8' },
  { id: 'c2', title: 'Definir estrategias y cerrar un plan para subir todo el contenido', date: 'May 12', band: 'overdue', workspace: 'Livv Lead Gen', owner: 'LU', status: 'todo', priority: 'high', wsColor: '#769268' },
  { id: 'c3', title: 'Terminar web de Christie', date: 'May 12', band: 'overdue', workspace: 'Christie King', owner: 'EN', status: 'todo', priority: 'medium', wsColor: '#E8BC59' },
  { id: 'c4', title: 'Ads meta y estrategia de contenidos livv', date: 'May 13', band: 'overdue', workspace: 'Livv', owner: 'EN', status: 'in-progress', priority: 'high', wsColor: '#6DBEDC' },
  { id: 'c5', title: 'Upgrade portofio livv', date: 'May 13', band: 'overdue', workspace: 'Livv', owner: 'EN', status: 'todo', priority: 'urgent', wsColor: '#6DBEDC' },
  { id: 'c6', title: 'Phase 1 — Architecture & Setup', date: 'May 14', band: 'overdue', workspace: 'Sunnyside', owner: 'AD', status: 'todo', priority: 'high', wsColor: '#E8BC59' },
  // Today (May 19)
  { id: 'c7', title: 'Art direction and image guidance delivered', date: 'Today', band: 'today', workspace: 'Sunnyside', owner: 'AD', status: 'in-progress', priority: 'medium', wsColor: '#E8BC59', time: '14:00' },
  { id: 'c8', title: 'Sunnyside checkpoint review', date: 'Today', band: 'today', workspace: 'Sunnyside', owner: 'EN', status: 'todo', priority: 'medium', wsColor: '#E8BC59', time: '11:30', isEvent: true },
  { id: 'c9', title: 'Async standup — Livv team', date: 'Today', band: 'today', workspace: 'Livv', owner: 'EN', status: 'todo', priority: 'low', wsColor: '#6DBEDC', time: '09:00', isEvent: true },
  // This week
  { id: 'c10', title: 'Framer project setup: pages, breakpoints, brand tokens', date: 'May 20', band: 'week', workspace: 'Livv', owner: 'EN', status: 'todo', priority: 'medium', wsColor: '#6DBEDC' },
  { id: 'c11', title: 'Lucky sub-brand assets received and reviewed', date: 'May 20', band: 'week', workspace: 'Sunnyside', owner: 'AD', status: 'todo', priority: 'medium', wsColor: '#E8BC59' },
  { id: 'c12', title: 'Content audit: confirm which pages have final copy', date: 'May 21', band: 'week', workspace: 'Livv', owner: 'WW', status: 'todo', priority: 'low', wsColor: '#6DBEDC' },
  { id: 'c13', title: 'CMS architecture: collections, fields, relationships', date: 'May 22', band: 'week', workspace: 'Sunnyside', owner: 'LU', status: 'todo', priority: 'medium', wsColor: '#E8BC59' },
  { id: 'c14', title: 'Strategy: Christie King roadmap', date: 'May 23', band: 'week', workspace: 'Christie King', owner: 'EN', status: 'todo', priority: 'high', wsColor: '#E8BC59', time: '14:00', isEvent: true },
  // Next week
  { id: 'c15', title: 'Pricing call — Ethos Group', date: 'May 27', band: 'next', workspace: 'Ethos Group', owner: 'EN', status: 'todo', priority: 'medium', wsColor: '#769268', time: '16:30', isEvent: true },
  { id: 'c16', title: 'Phase 2 — Design Finalization', date: 'May 28', band: 'next', workspace: 'Sunnyside', owner: 'AD', status: 'todo', priority: 'high', wsColor: '#E8BC59' },
  { id: 'c17', title: 'Mobilita — Discovery workshop', date: 'May 29', band: 'next', workspace: 'Mobilita', owner: 'LU', status: 'todo', priority: 'medium', wsColor: '#F1ADD8', time: '10:00', isEvent: true },
  // Later
  { id: 'c18', title: 'The Bloom — Brand audit kick-off', date: 'Jun 3', band: 'later', workspace: 'The Bloom', owner: 'WW', status: 'todo', priority: 'low', wsColor: '#F1ADD8' },
  { id: 'c19', title: 'Late Bloomer — Repositioning brief', date: 'Jun 5', band: 'later', workspace: 'Late Bloomer', owner: 'EN', status: 'todo', priority: 'medium', wsColor: '#6DBEDC' },
  { id: 'c20', title: 'Frenetic Sports — 6-week sprint proposal', date: 'Jun 9', band: 'later', workspace: 'Frenetic Sports', owner: 'EN', status: 'todo', priority: 'low', wsColor: '#769268' },
];

const BANDS = [
  { id: 'overdue', label: 'Overdue', tone: 'red' },
  { id: 'today', label: 'Today — Tuesday, May 19', tone: 'amber' },
  { id: 'week', label: 'This week', tone: 'default' },
  { id: 'next', label: 'Next week', tone: 'default' },
  { id: 'later', label: 'Later', tone: 'muted' },
];

const PRESETS = [
  { id: 'all', label: 'All work', count: 358 },
  { id: 'mine', label: 'Mine this week', count: 22 },
  { id: 'overdue', label: 'Overdue only', count: 25 },
  { id: 'urgent', label: 'High & urgent', count: 11 },
];

const STATUS_DOT = {
  'todo': { color: '#A8A29A', label: 'To do' },
  'in-progress': { color: '#E8BC59', label: 'In progress' },
  'done': { color: '#769268', label: 'Done' },
};

const PRIORITY_PILL = {
  'urgent': { bg: 'rgba(239,68,68,0.10)', fg: '#ef4444', label: 'Urgent' },
  'high':   { bg: 'rgba(232,188,89,0.18)', fg: '#8b6a17', label: 'High' },
  'medium': { bg: 'rgba(124,92,255,0.10)', fg: '#7c5cff', label: 'Medium' },
  'low':    { bg: 'var(--livv-cream-100)', fg: 'var(--livv-cream-600)', label: 'Low' },
};

const OWNER_COLOR = {
  EN: '#769268', LU: '#6DBEDC', WW: '#F1ADD8', AD: '#E8BC59',
};

// ── View switcher (rich, animated) ────────────────────────────────────
const VIEW_DEFS = [
  { id: 'Day',   tone: '#E8BC59', label: 'Day',   sub: 'Hour by hour',  kbd: '1' },
  { id: 'Week',  tone: '#6DBEDC', label: 'Week',  sub: '7 columns',     kbd: '2' },
  { id: 'Month', tone: '#769268', label: 'Month', sub: 'Full grid',     kbd: '3' },
  { id: 'Board', tone: '#F1ADD8', label: 'Board', sub: 'By status',     kbd: '4' },
  { id: 'List',  tone: '#5c1d18', label: 'List',  sub: 'Linear',        kbd: '5' },
];

const ViewIcon = ({ id, color, active }) => {
  // Active: icon flips to cream/white for guaranteed contrast against the
  // dark colored thumb (which is a gradient of the tone darkened).
  // Inactive: keeps tone color (CSS filter applies desat + opacity).
  const c = active ? '#FDFBF7' : color;
  const cFaint = active ? 'rgba(253,251,247,0.35)' : `${color}55`;
  const cMid   = active ? 'rgba(253,251,247,0.65)' : `${color}99`;
  switch (id) {
    case 'Day':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="4.5" fill={c}/>
          <circle cx="12" cy="12" r="2.2" fill={active ? '#FFE7A6' : '#FFEAB0'} opacity={active ? 1 : 0.6}/>
          <g stroke={c} strokeWidth="1.8" strokeLinecap="round">
            <path d="M12 2.5v2.5M12 19v2.5M2.5 12h2.5M19 12h2.5M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M5.2 18.8l1.7-1.7M17.1 6.9l1.7-1.7"/>
          </g>
        </svg>
      );
    case 'Week':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <rect x="3"  y="14" width="2.6" height="6"  rx="1" fill={cFaint}/>
          <rect x="7"  y="10" width="2.6" height="10" rx="1" fill={cMid}/>
          <rect x="11" y="5"  width="2.6" height="15" rx="1" fill={c}/>
          <rect x="15" y="9"  width="2.6" height="11" rx="1" fill={cMid}/>
          <rect x="19" y="13" width="2.6" height="7"  rx="1" fill={cFaint}/>
        </svg>
      );
    case 'Month':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="5" width="18" height="16" rx="2.5" fill={cFaint} stroke={c} strokeWidth="1.4"/>
          <path d="M3 10h18" stroke={c} strokeWidth="1.4"/>
          <rect x="6"   y="12.5" width="3" height="2.5" rx="0.6" fill={cMid}/>
          <rect x="10.5" y="12.5" width="3" height="2.5" rx="0.6" fill={c}/>
          <rect x="15"  y="12.5" width="3" height="2.5" rx="0.6" fill={cMid}/>
          <rect x="6"   y="16.5" width="3" height="2.5" rx="0.6" fill={cFaint}/>
          <rect x="10.5" y="16.5" width="3" height="2.5" rx="0.6" fill={cMid}/>
          <rect x="15"  y="16.5" width="3" height="2.5" rx="0.6" fill={cFaint}/>
          <circle cx="7.5" cy="3.5" r="1" fill={c}/>
          <circle cx="16.5" cy="3.5" r="1" fill={c}/>
        </svg>
      );
    case 'Board':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <rect x="3"  y="4" width="5" height="16" rx="1.2" fill={cFaint}/>
          <rect x="3"  y="4" width="5" height="6"  rx="1.2" fill={c}/>
          <rect x="10" y="4" width="5" height="16" rx="1.2" fill={cFaint}/>
          <rect x="10" y="4" width="5" height="10" rx="1.2" fill={cMid}/>
          <rect x="17" y="4" width="4" height="16" rx="1.2" fill={cFaint}/>
          <rect x="17" y="4" width="4" height="3"  rx="1.2" fill={c}/>
        </svg>
      );
    case 'List':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="5" width="18" height="14" rx="2" fill={cFaint}/>
          <circle cx="6.5" cy="9" r="1.4" fill={c}/>
          <circle cx="6.5" cy="14" r="1.4" fill={cMid}/>
          <circle cx="6.5" cy="18.5" r="0.9" fill={cMid} opacity="0.7"/>
          <path d="M10 9h9M10 14h7M10 18.5h5" stroke={c} strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
      );
    default:
      return null;
  }
};

const ViewSwitcher = ({ view, setView }) => {
  const idx = VIEW_DEFS.findIndex(v => v.id === view);
  const active = VIEW_DEFS[idx] || VIEW_DEFS[0];

  // Keyboard 1-5
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const i = parseInt(e.key, 10);
      if (i >= 1 && i <= 5) setView(VIEW_DEFS[i - 1].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setView]);

  return (
    <div className="vsw" role="tablist" aria-label="Calendar view" style={{'--vsw-tone': active.tone}}>
      <div
        className="vsw-thumb"
        style={{
          left: `calc(4px + ${idx} * (100% - 8px) / ${VIEW_DEFS.length})`,
          width: `calc((100% - 8px) / ${VIEW_DEFS.length})`,
          background: `linear-gradient(135deg, ${active.tone}, color-mix(in oklab, ${active.tone} 70%, #2C0405))`,
        }}
      />
      <div className="vsw-thumb-ring" aria-hidden style={{
          left: `calc(4px + ${idx} * (100% - 8px) / ${VIEW_DEFS.length})`,
          width: `calc((100% - 8px) / ${VIEW_DEFS.length})`,
      }}/>
      {VIEW_DEFS.map((v, i) => {
        const isActive = v.id === view;
        return (
          <button
            key={v.id}
            role="tab"
            aria-selected={isActive}
            aria-label={`${v.label} view`}
            className={`vsw-tab ${isActive ? 'active' : ''}`}
            onClick={() => setView(v.id)}
            style={{'--tone': v.tone}}
          >
            <span className="vsw-icon">
              <ViewIcon id={v.id} color={v.tone} active={isActive}/>
            </span>
            <span className="vsw-tooltip" role="tooltip">
              <span className="vsw-tt-label">{v.label}</span>
              <span className="vsw-tt-sub">{v.sub}</span>
              <kbd className="vsw-tt-kbd">{v.kbd}</kbd>
            </span>
          </button>
        );
      })}
    </div>
  );
};

// ── Calendar header ────────────────────────────────────────────────
const CalendarHeader = ({ view, setView, scope, setScope }) => (
  <div className="cal-header" data-screen-label="Calendar header">
    <div>
      <h1 className="cal-title">Calendar</h1>
      <div className="cal-counters">
        <span><strong>3</strong> events</span>
        <span><strong>17</strong> tasks</span>
        <span><strong>2</strong> done</span>
        <span className="muted">May 2026</span>
      </div>
    </div>
    <div className="cal-header-right">
      <div className="seg-tabs">
        {['Schedule', 'Content'].map(s => (
          <button key={s} className={`seg-tab ${scope === s ? 'active' : ''}`} onClick={() => setScope(s)}>
            <Icon name={s === 'Schedule' ? 'calendar' : 'content'} size={12}/>
            {s}
          </button>
        ))}
      </div>
      <ViewSwitcher view={view} setView={setView}/>
      <div className="date-nav">
        <button className="icon-btn-sm"><Icon name="chevron" size={12} style={{transform:'rotate(180deg)'}}/></button>
        <button className="today-btn">Today</button>
        <button className="icon-btn-sm"><Icon name="chevron" size={12}/></button>
      </div>
      <button className="btn-primary"><Icon name="plus" size={13}/>Event</button>
      <button className="btn-ghost"><Icon name="check" size={13}/>Task</button>
    </div>
  </div>
);

// ── Weekly summary (AI) ──────────────────────────────────────────────
const WeeklySummary = () => (
  <div className="weekly-summary" data-screen-label="Weekly summary">
    <div className="ws-left">
      <div className="ws-badge"><Icon name="sparkle" size={14}/></div>
      <div>
        <div className="ws-eyebrow">© Weekly summary  ·  generated 6 min ago</div>
        <div className="ws-body">
          You have <strong>6 overdue</strong> tasks blocking momentum on Livv and Sunnyside.
          <strong> 3 events today</strong>, mostly afternoon. <span className="ws-action">Want me to redistribute the overdue ones across Wed–Fri?</span>
        </div>
      </div>
    </div>
    <div className="ws-actions">
      <button className="chip"><Icon name="bolt" size={11}/>Plan this week</button>
      <button className="chip"><Icon name="check" size={11}/>Snooze overdue</button>
    </div>
  </div>
);

// ── Filter bar (consolidated) ────────────────────────────────────────
const FilterBar = ({ preset, setPreset, group, setGroup }) => (
  <div className="filter-bar" data-screen-label="Filters">
    <div className="presets">
      {PRESETS.map(p => (
        <button key={p.id} className={`preset ${preset === p.id ? 'active' : ''}`} onClick={() => setPreset(p.id)}>
          {p.label} <span className="preset-count">{p.count}</span>
        </button>
      ))}
    </div>
    <div className="filter-right">
      <div className="people-stack">
        {[
          { i: 'EN', sel: true }, { i: 'LU', sel: true }, { i: 'WW', sel: false }, { i: 'AD', sel: false }
        ].map((p, i) => (
          <div key={i} className={`avatar-chip ${p.sel ? 'active' : ''}`} style={{background: OWNER_COLOR[p.i], zIndex: 10 - i}}>
            {p.i}
          </div>
        ))}
        <button className="avatar-chip more">+3</button>
      </div>
      <button className="filter-btn">
        <Icon name="settings" size={12}/>
        <span>Group: <strong>Band</strong></span>
      </button>
      <button className="filter-btn">
        <Icon name="sparkle" size={12}/>
        <span>Sort: <strong>Due</strong></span>
      </button>
    </div>
  </div>
);

// ── Task row (compact) ────────────────────────────────────────────────
const CalTaskRow = ({ t }) => {
  const [done, setDone] = useCalS(t.status === 'done');
  const pri = PRIORITY_PILL[t.priority];
  const stat = STATUS_DOT[done ? 'done' : t.status];
  return (
    <div className={`cal-row ${t.band === 'overdue' ? 'is-overdue' : ''}`}>
      <div className={`task-check ${done ? 'done' : ''}`} onClick={() => setDone(!done)}>
        {done && <Icon name="check" size={11}/>}
      </div>

      <div className="cal-row-body">
        <div className="cal-row-title">
          {t.isEvent && <span className="event-dot" style={{background: t.wsColor}}/>}
          <span className={done ? 'striked' : ''}>{t.title}</span>
        </div>
        <div className="cal-row-meta">
          {t.time && <span className="m-time"><Icon name="clock" size={10}/>{t.time}</span>}
          <span className="m-date">{t.date}</span>
          <span className="m-ws">
            <span className="ws-dot" style={{background: t.wsColor}}/>
            {t.workspace}
          </span>
        </div>
      </div>

      <span className="pri-pill" style={{background: pri.bg, color: pri.fg}}>{pri.label}</span>

      <div className="owner-pill" style={{background: OWNER_COLOR[t.owner]}}>{t.owner}</div>

      <div className="status-dot-wrap" title={stat.label}>
        <span className="status-dot" style={{background: stat.color}}/>
      </div>
    </div>
  );
};

// ── Band ──────────────────────────────────────────────────────────────
const Band = ({ band, tasks, defaultOpen = true }) => {
  const [open, setOpen] = useCalS(defaultOpen);
  return (
    <section className={`band band-${band.tone}`} data-screen-label={`Band — ${band.label}`}>
      <header className="band-head" onClick={() => setOpen(!open)}>
        <span className={`band-pulse band-${band.tone}-bg`}/>
        <h2 className="band-label">{band.label}</h2>
        <span className="band-count">{tasks.length}</span>
        {band.tone === 'red' && tasks.length > 0 && (
          <span className="band-cta"><Icon name="bolt" size={11}/>Redistribute</span>
        )}
        <span className="band-chev"><Icon name={open ? 'chevronUp' : 'chevronDown'} size={13}/></span>
      </header>
      {open && (
        <div className="band-list">
          {tasks.map(t => <CalTaskRow key={t.id} t={t}/>)}
          {tasks.length === 0 && (
            <div className="band-empty">Nothing here. <span>You're clear.</span></div>
          )}
        </div>
      )}
    </section>
  );
};

// ── Mini month ────────────────────────────────────────────────────────
const MiniMonth = () => {
  const days = Array.from({length: 35}, (_, i) => i - 3); // May 2026: starts Friday
  const today = 19;
  const heat = { 8: 1, 12: 2, 13: 2, 14: 1, 19: 3, 20: 2, 21: 1, 22: 1, 23: 1, 27: 1, 28: 1, 29: 1 };
  return (
    <div className="mini-month">
      <div className="mini-head">
        <span>May 2026</span>
        <span className="mini-nav">
          <Icon name="chevron" size={11} style={{transform:'rotate(180deg)'}}/>
          <Icon name="chevron" size={11}/>
        </span>
      </div>
      <div className="mini-grid">
        {['M','T','W','T','F','S','S'].map((d, i) => <div key={i} className="mini-dow">{d}</div>)}
        {days.map((d, i) => {
          const valid = d >= 1 && d <= 31;
          const isToday = d === today;
          const load = heat[d] || 0;
          return (
            <div key={i} className={`mini-day ${!valid ? 'muted' : ''} ${isToday ? 'today' : ''} load-${load}`}>
              {valid ? d : ''}
              {load > 0 && valid && <span className="mini-dot"/>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Workload week strip ───────────────────────────────────────────────
const WorkloadStrip = () => {
  const days = [
    { d: 'M', n: 18, c: 0, past: true },
    { d: 'T', n: 19, c: 3, today: true },
    { d: 'W', n: 20, c: 2 },
    { d: 'T', n: 21, c: 1 },
    { d: 'F', n: 22, c: 1 },
    { d: 'S', n: 23, c: 1, weekend: true },
    { d: 'S', n: 24, c: 0, weekend: true },
  ];
  const max = 4;
  return (
    <div className="workload">
      <div className="workload-head">
        <span className="lbl">This week</span>
        <span className="sub">8 tasks · 3 events</span>
      </div>
      <div className="workload-grid">
        {days.map((d, i) => (
          <div key={i} className={`wl-col ${d.today ? 'today' : ''} ${d.weekend ? 'we' : ''} ${d.past ? 'past' : ''}`}>
            <div className="wl-bar"><div className="wl-fill" style={{height: `${(d.c / max) * 100}%`}}/></div>
            <div className="wl-label">{d.d}<small>{d.n}</small></div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Quick filters ─────────────────────────────────────────────────────
const QuickFilters = () => (
  <div className="quick-filters">
    <div className="qf-head">Filter quickly</div>
    {[
      { label: 'Mine', count: 22, dot: '#769268' },
      { label: 'Urgent', count: 4, dot: '#ef4444' },
      { label: 'High', count: 7, dot: '#E8BC59' },
      { label: 'Sunnyside', count: 11, dot: '#E8BC59' },
      { label: 'Christie King', count: 6, dot: '#F1ADD8' },
      { label: 'Without owner', count: 3, dot: '#A8A29A' },
    ].map((f, i) => (
      <button key={i} className="qf-row">
        <span className="qf-dot" style={{background: f.dot}}/>
        <span className="qf-label">{f.label}</span>
        <span className="qf-count">{f.count}</span>
      </button>
    ))}
  </div>
);

Object.assign(window, {
  CAL_TASKS, BANDS,
  CalendarHeader, WeeklySummary, FilterBar, CalTaskRow, Band,
  MiniMonth, WorkloadStrip, QuickFilters,
});
