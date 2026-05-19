// LIVV OS — Agent module (Ask + Reports + Workflows)
const { useState: useAg, useEffect: useAgE, useRef: useAgR } = React;

const AGENT_RECIPES = [
  { id: 'weekly',  cat: 'Reports',  icon: 'sparkle', title: 'Weekly executive summary', desc: 'KPIs + wins + blockers from this week, formatted for Monday inbox.', tags: ['Growth', 'Sales'] },
  { id: 'pipeline', cat: 'Reports', icon: 'activity', title: 'Pipeline health audit',     desc: 'Flag stuck deals, drop-off stages, and which leads need follow-up today.', tags: ['Sales'] },
  { id: 'cohort',  cat: 'Reports',  icon: 'metrics', title: 'ICP cohort analysis',       desc: 'Which ICP closes fastest? Which gives biggest deals? Last 90 days.', tags: ['Strategy', 'Sales'] },
  { id: 'content', cat: 'Reports',  icon: 'content', title: 'Content performance',       desc: 'Top posts × engagement × repurpose suggestions for next week.', tags: ['Content'] },
  { id: 'team',    cat: 'Reports',  icon: 'team',    title: 'Team capacity report',      desc: 'Who is over capacity? Where are bottlenecks? Hire signals.', tags: ['Scaling'] },

  { id: 'follow',  cat: 'Actions', icon: 'mail',    title: 'Draft 3 follow-ups',        desc: 'Personalize follow-up emails for stale leads using their ICP + last interaction.', tags: ['Sales'] },
  { id: 'casestudy', cat: 'Actions', icon: 'docs', title: 'Generate case study',       desc: 'From the last completed project, draft a long-form case study in brand voice.', tags: ['Content', 'Delivery'] },
  { id: 'proposal', cat: 'Actions', icon: 'tasks',  title: 'Build proposal v2',          desc: 'Tailor a proposal to a specific lead using their ICP playbook + 30/60/90 frame.', tags: ['Sales'] },
  { id: 'plan',     cat: 'Actions', icon: 'calendar', title: 'Plan my next week',       desc: 'Distribute tasks across days based on owner capacity + deadlines + priorities.', tags: ['Scaling'] },

  { id: 'risk',     cat: 'Analyze', icon: 'alert', title: 'Surface project risks',      desc: 'Which projects are slipping? Who needs attention before Friday?', tags: ['Delivery'] },
  { id: 'cash',     cat: 'Analyze', icon: 'money', title: 'Cash flow projection',       desc: '12-week look-ahead. What is collected, what is at risk, what is the runway?', tags: ['Finance'] },
  { id: 'churn',    cat: 'Analyze', icon: 'user',  title: 'Retainer churn signals',     desc: 'Which retainer clients are showing disengagement patterns?', tags: ['Sales', 'Delivery'] },
];

const AGENT_DATASOURCES = [
  { name: 'Growth · Sales pipeline', icon: 'sales',     c: 'var(--accent)' },
  { name: 'Content · Calendar',      icon: 'calendar',  c: 'var(--pink)' },
  { name: 'Scaling · Team KPIs',     icon: 'team',      c: 'var(--sage)' },
  { name: 'Strategy · ICPs',         icon: 'target',    c: 'var(--sky)' },
  { name: 'Toolkit · Connections',   icon: 'link',      c: 'var(--purple)' },
  { name: 'Higgsfield · 12 styles',  icon: 'sparkle',   c: '#7C5CFF' },
];

const SEED_THREAD = [
  {
    role: 'user',
    text: 'Generate a pipeline health audit for this week.',
    when: '08:42',
  },
  {
    role: 'agent',
    when: '08:42',
    text: 'I looked at your 33 open deals across 7 stages. Three patterns:',
    sources: ['Growth · Sales pipeline', 'Strategy · ICPs'],
    findings: [
      { tone: 'red',   label: 'Halcyon AI sat 6+ days in Call Done',         action: 'Send recap email' },
      { tone: 'amber', label: 'Sable Loft proposal awaiting CFO sign-off',    action: 'Bump email' },
      { tone: 'green', label: 'Atlas Retainer ready to counter on MRR',       action: 'Send counter' },
    ],
    chart: { kind: 'funnel', values: [142, 98, 54, 28, 16, 11] },
    actions: [
      { id: 'send3', label: 'Send 3 follow-ups now',     primary: true,  icon: 'mail' },
      { id: 'doc',   label: 'Save as report',            primary: false, icon: 'docs' },
      { id: 'sched', label: 'Schedule weekly recap',     primary: false, icon: 'calendar' },
    ],
  },
  {
    role: 'user',
    text: 'Yes — send the 3 follow-ups. Use the agency playbook tone for Halcyon and Sable Loft.',
    when: '08:43',
  },
  {
    role: 'agent',
    when: '08:43',
    text: 'Drafted 3 follow-up emails using each lead\'s ICP playbook + your brand voice. They are ready to review. I will not send until you confirm each one.',
    sources: ['Strategy · ICPs', 'Content · Brand voice', 'Sales · Lead history'],
    drafts: [
      { to: 'Halcyon AI · Rune Eriksen', subject: 'Recap + next steps', tone: 'Agency playbook', preview: 'Rune — quick recap of our last call: you flagged internal approval as the gate. I built a 30/60/90 frame…', cta: 'Review & send' },
      { to: 'Sable Loft · Nora Vasquez', subject: 'CFO context for the proposal', tone: 'Agency playbook', preview: 'Nora — to make Marco\'s review faster, I broke the proposal into 3 cost buckets…', cta: 'Review & send' },
      { to: 'Atlas Retainer · Gabriel Müller', subject: 'Counter on MRR', tone: 'Retainer playbook', preview: 'Gabriel — based on what we discussed, here\'s our counter. Same scope, MRR adjusted to $7.4K…', cta: 'Review & send' },
    ],
    actions: [
      { id: 'all',  label: 'Send all 3 now',          primary: true,  icon: 'send' },
      { id: 'one',  label: 'Send one at a time',      primary: false, icon: 'mail' },
      { id: 'edit', label: 'Tighten the tone',         primary: false, icon: 'edit' },
    ],
  },
];

const REPORTS_LIBRARY = [
  { id: 'r1', title: 'Weekly executive summary · W21', author: 'Agent',   when: '8:42', size: '1,184 words', tags: ['Growth','Sales'], cover: ['#C4A35A','#2C0405'] },
  { id: 'r2', title: 'Pipeline health audit · May',     author: 'Agent',   when: 'Today',    size: '6 sections',   tags: ['Sales'],        cover: ['#769268','#1F2D1A'] },
  { id: 'r3', title: 'Agency ICP cohort · Q2',           author: 'Agent',   when: 'May 17',   size: '12 charts',    tags: ['Strategy'],    cover: ['#6DBEDC','#0F1B2D'] },
  { id: 'r4', title: 'Content performance · 8 weeks',    author: 'Agent',   when: 'May 14',   size: '7 charts',     tags: ['Content'],     cover: ['#F1ADD8','#23150E'] },
  { id: 'r5', title: 'Cash flow projection · 12-week',   author: 'Agent',   when: 'May 10',   size: '3 scenarios',  tags: ['Finance'],     cover: ['#E8BC59','#3D1214'] },
  { id: 'r6', title: 'Sunnyside · case study draft',     author: 'Agent',   when: 'May 04',   size: '1,420 words',  tags: ['Content','Delivery'], cover: ['#E8BC59','#1F1611'] },
  { id: 'r7', title: 'Team capacity · M5',                author: 'Agent',   when: 'Apr 28',   size: '6 people',     tags: ['Scaling'],     cover: ['#A855F7','#1A1A1A'] },
  { id: 'r8', title: 'Retainer churn signals',            author: 'Agent',   when: 'Apr 21',   size: '4 flagged',    tags: ['Sales'],        cover: ['#5c1d18','#FBF2EC'] },
];

const WORKFLOWS = [
  { id: 'w1', title: 'Monday morning brief',      desc: 'Every Mon 7:30 — generate weekly summary, surface 3 priorities, draft Slack post.',    on: true,  runs: 12, lastRun: 'Yesterday', steps: 4 },
  { id: 'w2', title: 'Lead won → case study',     desc: 'When a lead moves to Won, queue a case-study draft using project completion data.',     on: true,  runs: 6,  lastRun: '2d ago',    steps: 5 },
  { id: 'w3', title: 'Stale lead nudge',           desc: 'Every 3 days, find leads stuck >5d in a stage and draft personalized follow-ups.',     on: true,  runs: 47, lastRun: 'Today',     steps: 3 },
  { id: 'w4', title: 'Content cadence guard',     desc: 'When the publish cadence drops below 80% target, ping you + suggest 3 ideas.',          on: true,  runs: 4,  lastRun: '5d ago',    steps: 3 },
  { id: 'w5', title: 'Retainer renewal · 60d',    desc: '60 days before retainer end, draft renewal email + summarize the year\'s wins.',         on: false, runs: 2,  lastRun: 'Mar 12',    steps: 4 },
  { id: 'w6', title: 'Friday close-out',          desc: 'Every Fri 17:00 — log KPIs, generate weekly snapshot, queue Monday\'s priorities.',     on: true,  runs: 18, lastRun: 'Last Fri',  steps: 5 },
];

// ─────────────────────────────────────────────────────────────
// ASK TAB
// ─────────────────────────────────────────────────────────────
const AgentAsk = () => {
  const [thread, setThread] = useAg(SEED_THREAD);
  const [input, setInput] = useAg('');
  const [activeRecipe, setActiveRecipe] = useAg(null);
  const bottomRef = useAgR(null);

  useAgE(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [thread.length]);

  const send = (text) => {
    const t = (text ?? input).trim();
    if (!t) return;
    setThread(prev => [...prev, { role: 'user', text: t, when: 'Now' }]);
    setInput('');
    setTimeout(() => {
      setThread(prev => [...prev, {
        role: 'agent',
        when: 'Now',
        text: 'Got it. I am pulling from your context and assembling the answer…',
        sources: AGENT_DATASOURCES.slice(0,3).map(s => s.name),
      }]);
    }, 600);
  };

  return (
    <div className="agent-page">
      {/* LEFT — Thread */}
      <section className="agent-thread">
        <header className="agent-thread-head">
          <div className="agent-avatar">
            <OS_ICON name="sparkle" size={16}/>
            <span className="agent-pulse"/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong style={{ fontSize: 14, color: 'var(--os-fg-0)' }}>Agent</strong>
              <span className="conn-status on" style={{ padding: '2px 7px' }}><span className="dot"/>Online · 184K tokens left</span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--os-fg-2)', marginTop: 3 }}>
              Connected to <strong style={{ color: 'var(--os-fg-1)', fontWeight: 500 }}>6 modules</strong> · last sync 2m ago
            </div>
          </div>
          <button className="so-iconbtn" title="History"><OS_ICON name="clock" size={14}/></button>
          <button className="so-iconbtn" title="Settings"><OS_ICON name="cog" size={14}/></button>
        </header>

        <div className="agent-msgs">
          {thread.map((m, i) => (
            <AgentMessage key={i} m={m}/>
          ))}
          <div ref={bottomRef}/>
        </div>

        <footer className="agent-input">
          <div className="agent-input-shell">
            <span className="agent-input-ic"><OS_ICON name="sparkle" size={14}/></span>
            <textarea
              rows={1}
              placeholder="Ask anything — generate a report, draft outreach, analyze cohorts, build a plan…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
              }}
            />
            <div className="agent-input-actions">
              <button className="ai-iconbtn" title="Attach"><OS_ICON name="docs" size={13}/></button>
              <button className="ai-iconbtn" title="Voice"><OS_ICON name="mic" size={13}/></button>
              <button className={`agent-send ${input.trim() ? 'ready' : ''}`} disabled={!input.trim()} onClick={() => send()}>
                <OS_ICON name="send" size={13}/>
              </button>
            </div>
          </div>
          <div className="agent-input-meta">
            <span><kbd>↵</kbd> send · <kbd>⇧↵</kbd> new line · <kbd>⌘K</kbd> commands</span>
            <span>Reads from <strong>{AGENT_DATASOURCES.length} sources</strong> · model: claude-3.5</span>
          </div>
        </footer>
      </section>

      {/* RIGHT — Sidebar (recipes + data sources) */}
      <aside className="agent-side">
        <section className="agent-side-section">
          <header className="agent-side-head">
            <span className="agent-side-title">© Recipes</span>
            <span className="agent-side-meta">{AGENT_RECIPES.length}</span>
          </header>
          <div className="agent-side-tabs">
            {['Reports', 'Actions', 'Analyze'].map((c, i) => (
              <button key={c} className={`agent-side-tab ${activeRecipe === c || (!activeRecipe && i === 0) ? 'active' : ''}`} onClick={() => setActiveRecipe(c)}>
                {c}
                <span>{AGENT_RECIPES.filter(r => r.cat === c).length}</span>
              </button>
            ))}
          </div>
          <div className="agent-recipes">
            {AGENT_RECIPES.filter(r => r.cat === (activeRecipe || 'Reports')).map(r => (
              <button key={r.id} className="agent-recipe" onClick={() => send(r.desc)}>
                <span className="agent-recipe-ic"><OS_ICON name={r.icon} size={12}/></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="agent-recipe-title">{r.title}</div>
                  <div className="agent-recipe-desc">{r.desc}</div>
                </div>
                <span className="agent-recipe-go"><OS_ICON name="arrow" size={10}/></span>
              </button>
            ))}
          </div>
        </section>

        <section className="agent-side-section">
          <header className="agent-side-head">
            <span className="agent-side-title">© Data sources</span>
            <span className="agent-side-meta">{AGENT_DATASOURCES.length} live</span>
          </header>
          <div className="agent-sources">
            {AGENT_DATASOURCES.map(s => (
              <div key={s.name} className="agent-source" style={{ '--c': s.c }}>
                <span className="agent-source-ic"><OS_ICON name={s.icon} size={11}/></span>
                <span className="agent-source-name">{s.name}</span>
                <span className="agent-source-dot"/>
              </div>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
};

const AgentMessage = ({ m }) => {
  if (m.role === 'user') {
    return (
      <div className="agent-msg agent-msg-user">
        <div className="agent-msg-bubble user">{m.text}</div>
        <div className="agent-msg-when">{m.when}</div>
      </div>
    );
  }
  return (
    <div className="agent-msg agent-msg-bot">
      <div className="agent-msg-avatar"><OS_ICON name="sparkle" size={12}/></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="agent-msg-bubble bot">
          <p style={{ margin: 0 }}>{m.text}</p>

          {m.sources && (
            <div className="agent-sources-row">
              <span className="agent-sources-label">Sources</span>
              {m.sources.map(s => <span key={s} className="agent-source-chip">{s}</span>)}
            </div>
          )}

          {m.findings && (
            <div className="agent-findings">
              {m.findings.map((f, i) => (
                <div key={i} className={`agent-finding agent-finding-${f.tone}`}>
                  <span className="agent-finding-dot"/>
                  <span className="agent-finding-label">{f.label}</span>
                  <button className="agent-finding-action">{f.action} <OS_ICON name="arrow" size={9}/></button>
                </div>
              ))}
            </div>
          )}

          {m.chart && m.chart.kind === 'funnel' && (
            <div className="agent-chart">
              <div className="agent-chart-eyebrow">Pipeline funnel · last 90 days</div>
              {m.chart.values.map((v, i, a) => (
                <div key={i} className="agent-chart-row">
                  <span className="agent-chart-label">{['New','Contacted','Call done','Proposal','Negotiating','Won'][i]}</span>
                  <div className="agent-chart-bar"><div style={{ width: `${(v / a[0]) * 100}%`, background: `linear-gradient(90deg, color-mix(in oklab, var(--accent) ${30 + i*8}%, var(--os-surface)), color-mix(in oklab, var(--accent) ${15 + i*8}%, var(--os-surface)))` }}/></div>
                  <span className="agent-chart-v">{v}</span>
                </div>
              ))}
            </div>
          )}

          {m.drafts && (
            <div className="agent-drafts">
              {m.drafts.map((d, i) => (
                <div key={i} className="agent-draft">
                  <header className="agent-draft-head">
                    <span className="agent-draft-to">{d.to}</span>
                    <span className="agent-draft-tone">{d.tone}</span>
                  </header>
                  <div className="agent-draft-subject">{d.subject}</div>
                  <p className="agent-draft-preview">{d.preview}</p>
                  <footer className="agent-draft-foot">
                    <button className="agent-draft-cta primary">{d.cta} <OS_ICON name="arrow" size={10}/></button>
                    <button className="agent-draft-cta">Edit</button>
                  </footer>
                </div>
              ))}
            </div>
          )}

          {m.actions && (
            <div className="agent-actions">
              {m.actions.map(a => (
                <button key={a.id} className={`agent-action-btn ${a.primary ? 'primary' : ''}`}>
                  <OS_ICON name={a.icon} size={12}/>{a.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="agent-msg-when">{m.when}</div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// REPORTS TAB
// ─────────────────────────────────────────────────────────────
const AgentReports = () => (
  <>
    <section className="prod-hero">
      <div className="prod-hero-l">
        <div className="pos-hero-eyebrow"><span className="pos-hero-dot"/>© Reports library</div>
        <h2 className="pkg-hero-title">
          <span>{REPORTS_LIBRARY.length} reports</span><br/>
          <span style={{ color: 'var(--os-fg-2)' }}>generated &amp; saved by Agent</span>
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--os-fg-1)', lineHeight: 1.55, maxWidth: 420 }}>
          Every output Agent produces lands here — re-runnable, shareable, exportable. Yesterday's report becomes today's snapshot.
        </p>
      </div>
      <div className="prod-hero-chart">
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--os-fg-2)', display: 'block', marginBottom: 12 }}>By tag</span>
        {[
          { l: 'Growth/Sales', n: 4, c: 'var(--accent)' },
          { l: 'Content',      n: 2, c: 'var(--pink)' },
          { l: 'Strategy',     n: 1, c: 'var(--sky)' },
          { l: 'Finance',      n: 1, c: 'var(--sage)' },
        ].map(t => (
          <div key={t.l} className="tpl-hero-row">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, minWidth: 110 }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: t.c }}/>{t.l}
            </span>
            <div className="phase-bar" style={{ flex: 1 }}><div className="phase-fill" style={{ width: `${(t.n / 4) * 100}%`, background: t.c }}/></div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--os-fg-0)', fontWeight: 500, minWidth: 30, textAlign: 'right' }}>{t.n}</span>
          </div>
        ))}
      </div>
    </section>

    <div className="prod-grid">
      {REPORTS_LIBRARY.map(r => (
        <article key={r.id} className="prod-card">
          <div className="prod-cover" style={{ background: `linear-gradient(135deg, ${r.cover[0]} 0%, ${r.cover[1]} 100%)`, aspectRatio: '5 / 3' }}>
            <span className="prod-type-pill" style={{ background: 'rgba(255,255,255,0.9)', color: 'var(--os-ink)' }}>Report</span>
            <div className="prod-cover-content" style={{ color: '#fff' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', opacity: 0.7, marginBottom: 6 }}>{r.author} · {r.when}</div>
              <div style={{ fontSize: 16, fontWeight: 500, letterSpacing: '-0.015em', lineHeight: 1.2 }}>{r.title}</div>
            </div>
          </div>
          <div className="prod-body">
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {r.tags.map(t => <span key={t} className="conn-perm">{t}</span>)}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--os-fg-2)' }}>{r.size}</div>
            <footer className="prod-foot">
              <button className="ptr-copy-btn" style={{ padding: '4px 10px' }}><OS_ICON name="eye" size={11}/>Open</button>
              <button className="ptr-copy-btn" style={{ padding: '4px 10px', background: 'var(--os-surface)', color: 'var(--os-fg-1)', border: '0.5px solid var(--os-border-2)' }}>Re-run</button>
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--os-fg-3)' }}>PDF · MD · JSON</span>
            </footer>
          </div>
        </article>
      ))}
    </div>
  </>
);

// ─────────────────────────────────────────────────────────────
// WORKFLOWS TAB
// ─────────────────────────────────────────────────────────────
const AgentWorkflows = () => (
  <>
    <section className="prod-hero">
      <div className="prod-hero-l">
        <div className="pos-hero-eyebrow"><span className="pos-hero-dot"/>© Agent workflows</div>
        <h2 className="pkg-hero-title">
          <span>{WORKFLOWS.filter(w => w.on).length} workflows running</span><br/>
          <span style={{ color: 'var(--os-fg-2)' }}>{WORKFLOWS.reduce((s,w) => s + w.runs, 0)} executions this quarter</span>
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--os-fg-1)', lineHeight: 1.55, maxWidth: 420 }}>
          Multi-step recipes Agent runs on a schedule or trigger. Each step can call modules, draft outputs, or pause for your approval.
        </p>
        <button className="so-action primary" style={{ flex: 0, marginTop: 4 }}><OS_ICON name="plus" size={13}/>Build workflow</button>
      </div>
      <div className="agent-workflow-canvas">
        <div className="agent-wf-eyebrow">© Workflow anatomy</div>
        {['Trigger', 'Read context', 'Reason', 'Draft', 'Approve', 'Execute'].map((s, i, a) => (
          <React.Fragment key={s}>
            <div className={`agent-wf-step ${i === 0 ? 'first' : i === a.length-1 ? 'last' : ''}`}>
              <span className="agent-wf-step-n">{String(i+1).padStart(2,'0')}</span>
              <span>{s}</span>
            </div>
            {i < a.length-1 && <div className="agent-wf-arrow">↓</div>}
          </React.Fragment>
        ))}
      </div>
    </section>

    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {WORKFLOWS.map(w => (
        <article key={w.id} className={`agent-wf-card ${w.on ? 'on' : ''}`}>
          <div className="agent-wf-card-l">
            <span className={`agent-wf-status ${w.on ? 'on' : 'off'}`}>
              <span className="dot"/>{w.on ? 'Active' : 'Paused'}
            </span>
            <div>
              <h3 className="agent-wf-title">{w.title}</h3>
              <p className="agent-wf-desc">{w.desc}</p>
            </div>
          </div>
          <div className="agent-wf-card-r">
            <div className="agent-wf-stat">
              <span>Steps</span>
              <strong>{w.steps}</strong>
            </div>
            <div className="agent-wf-stat">
              <span>Runs</span>
              <strong>{w.runs}</strong>
            </div>
            <div className="agent-wf-stat">
              <span>Last run</span>
              <strong>{w.lastRun}</strong>
            </div>
            <button className="agent-wf-toggle">
              <span className="agent-wf-toggle-track" data-on={w.on}>
                <span className="agent-wf-toggle-thumb"/>
              </span>
            </button>
            <button className="so-iconbtn"><OS_ICON name="edit" size={13}/></button>
          </div>
        </article>
      ))}
    </div>
  </>
);

Object.assign(window, { AGENT_RECIPES, AGENT_DATASOURCES, REPORTS_LIBRARY, WORKFLOWS, AgentAsk, AgentReports, AgentWorkflows });
