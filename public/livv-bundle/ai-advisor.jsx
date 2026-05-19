// AI Advisor — chat panel components
const { useState: useAiS, useEffect: useAiE, useRef: useAiR } = React;

const SUGGESTIONS = [
  {
    group: 'Plan',
    items: [
      { id: 'overview', label: 'Strategic overview',    desc: 'Where you are this month',     icon: 'sparkle',   topic: 'projects' },
      { id: 'week',     label: 'Plan my week',           desc: 'Balance load across days',     icon: 'calendar',  topic: 'time' },
      { id: 'focus',    label: 'Where to focus',         desc: 'Highest-impact next moves',    icon: 'bolt',      topic: 'goals' },
      { id: 'quarter',  label: 'Quarterly OKRs',         desc: 'Progress against your goals',  icon: 'star',      topic: 'goals' },
    ],
  },
  {
    group: 'Analyze',
    items: [
      { id: 'finance',  label: 'Financial health',  desc: 'Cash flow, pending, runway',     icon: 'dashboard', topic: 'finance' },
      { id: 'risks',    label: 'Project risks',     desc: 'Blockers across 17 projects',    icon: 'alert',     topic: 'projects' },
      { id: 'load',     label: 'Team workload',     desc: 'Who is over / under-booked',     icon: 'user',      topic: 'team' },
      { id: 'retention', label: 'Client retention', desc: 'At-risk relationships',          icon: 'clients',   topic: 'clients' },
    ],
  },
  {
    group: 'Do',
    items: [
      { id: 'followup', label: 'Follow up on a teammate', desc: 'Auto-drafted nudges',     icon: 'mail',     topic: 'team' },
      { id: 'breakup',  label: 'Break project into tasks', desc: 'From brief → checklist', icon: 'tasks',    topic: 'projects' },
      { id: 'expense',  label: 'Log expense',              desc: 'Parsed + categorized',   icon: 'bookmark', topic: 'finance' },
      { id: 'invoice',  label: 'Draft invoice',            desc: 'From hours + scope',     icon: 'docs',     topic: 'finance' },
    ],
  },
];

// User-configurable topics the AI tracks. Toggle adjusts the empty state.
const TOPICS = [
  { id: 'finance',  label: 'Finance',     desc: '$30.4k pending · 4 invoices',     icon: 'dashboard', color: '#769268', count: '$30.4k' },
  { id: 'projects', label: 'Projects',    desc: '17 active · 6 at risk',           icon: 'briefcase', color: '#6DBEDC', count: '17' },
  { id: 'team',     label: 'Team',        desc: '9 people · 3 over capacity',      icon: 'user',      color: '#E8BC59', count: '9' },
  { id: 'clients',  label: 'Clients',     desc: '12 active · 2 at risk',           icon: 'clients',   color: '#F1ADD8', count: '12' },
  { id: 'time',     label: 'Time',        desc: '24 tasks today · 3 events',       icon: 'calendar',  color: '#5c1d18', count: '24' },
  { id: 'goals',    label: 'Goals & OKR', desc: 'Q2 · 3 of 5 on track',            icon: 'star',      color: '#C4A35A', count: '3/5' },
];

const CONTEXT = [
  { label: '17 active projects', sub: 'across 9 clients', icon: 'clients' },
  { label: '$30,400 pending',    sub: 'in 4 invoices',     icon: 'bookmark' },
  { label: '9 teammates',         sub: '3 over capacity',  icon: 'user' },
];

// ── Panel header ─────────────────────────────────────────────────────
const PanelHeader = ({ onClose, onReset }) => (
  <header className="ai-head">
    <div className="ai-brand">
      <div className="ai-avatar">
        <Icon name="sparkle" size={16}/>
        <span className="ai-pulse" aria-hidden/>
      </div>
      <div>
        <div className="ai-title">
          AI Advisor
          <span className="ai-online">
            <span className="dot"/>
            online
          </span>
        </div>
        <div className="ai-sub">Knows your projects, finances & team</div>
      </div>
    </div>
    <div className="ai-head-actions">
      <button className="ai-iconbtn" title="New conversation" onClick={onReset}>
        <Icon name="plus" size={14}/>
      </button>
      <button className="ai-iconbtn" title="Settings">
        <Icon name="settings" size={14}/>
      </button>
      <button className="ai-iconbtn close" title="Close" onClick={onClose}>
        <Icon name="check" size={14} style={{transform:'rotate(45deg) scale(1.4)', opacity:0.7}}/>
      </button>
    </div>
  </header>
);

// ── Context strip (filtered by active topics) ───────────────────────
const ContextStrip = ({ activeTopics }) => {
  const visible = TOPICS.filter(t => activeTopics.includes(t.id)).slice(0, 4);
  if (visible.length === 0) return null;
  return (
    <div className="ai-context">
      {visible.map((t) => (
        <button key={t.id} className="ai-ctx-chip" title={`Filter chat by ${t.label}`} style={{'--c': t.color}}>
          <span className="ai-ctx-icon"><Icon name={t.icon} size={11}/></span>
          <div className="ai-ctx-text">
            <strong>{t.label}</strong>
            <small>{t.desc}</small>
          </div>
        </button>
      ))}
    </div>
  );
};

// ── Topics bar — user-configurable focus areas ──────────────────────
const TopicsBar = ({ activeTopics, toggleTopic, onOpenSettings }) => (
  <div className="ai-topics">
    <div className="ai-topics-head">
      <span className="ai-topics-label">
        <Icon name="sliders" size={11}/>
        I watch
      </span>
      <button className="ai-topics-edit" onClick={onOpenSettings}>
        Customize
        <Icon name="arrowUpRight" size={10}/>
      </button>
    </div>
    <div className="ai-topics-row">
      {TOPICS.map(t => {
        const active = activeTopics.includes(t.id);
        return (
          <button
            key={t.id}
            className={`ai-topic ${active ? 'active' : ''}`}
            onClick={() => toggleTopic(t.id)}
            style={{'--c': t.color}}
            title={active ? `Stop watching ${t.label}` : `Watch ${t.label}`}
          >
            <span className="ai-topic-icon"><Icon name={t.icon} size={11}/></span>
            <span className="ai-topic-text">
              <span className="ai-topic-name">{t.label}</span>
              <span className="ai-topic-meta">{t.count}</span>
            </span>
            <span className="ai-topic-state" aria-hidden>
              {active ? <Icon name="check" size={10}/> : <Icon name="plus" size={10}/>}
            </span>
          </button>
        );
      })}
    </div>
  </div>
);

// ── Empty-state suggestions ──────────────────────────────────────────
const EmptyState = ({ onPick, activeTopics }) => {
  const topicMap = Object.fromEntries(TOPICS.map(t => [t.id, t]));
  const activeTopicLabels = activeTopics
    .map(id => topicMap[id]?.label.toLowerCase())
    .filter(Boolean);
  const greeting = activeTopicLabels.length === 0
    ? 'Pick at least one topic above and I will tailor my suggestions.'
    : `I'm watching ${activeTopicLabels.slice(0, -1).join(', ')}${activeTopicLabels.length > 1 ? ' and ' : ''}${activeTopicLabels.slice(-1)}. Ask anything below, or pick a starter.`;

  return (
    <div className="ai-empty">
      <div className="ai-msg ai-msg-bot">
        <div className="ai-msg-avatar">
          <Icon name="sparkle" size={13}/>
        </div>
        <div className="ai-msg-bubble ai-msg-bot-bubble">
          <p style={{margin:'0 0 4px'}}>
            Hi Eneas — context loaded for <strong>{activeTopics.length} topic{activeTopics.length === 1 ? '' : 's'}</strong>.
          </p>
          <p style={{margin:0, color:'var(--livv-cream-500)', fontSize:13}}>
            {greeting}
          </p>
        </div>
      </div>

      <div className="ai-sugg-groups">
        {SUGGESTIONS.map(g => {
          const items = g.items.filter(it => activeTopics.includes(it.topic));
          if (items.length === 0) return null;
          return (
            <section key={g.group} className="ai-sugg-group">
              <div className="ai-sugg-label">
                <span>{g.group}</span>
                <span className="ai-sugg-count">{items.length}</span>
              </div>
              <div className="ai-sugg-grid">
                {items.map(it => {
                  const topic = topicMap[it.topic];
                  return (
                    <button key={it.id} className="ai-sugg" onClick={() => onPick(it.label)} style={{'--c': topic?.color || '#A8A29A'}}>
                      <span className="ai-sugg-icon"><Icon name={it.icon} size={14}/></span>
                      <span className="ai-sugg-text">
                        <span className="ai-sugg-title">{it.label}</span>
                        <span className="ai-sugg-desc">{it.desc}</span>
                      </span>
                      <span className="ai-sugg-tag" style={{background: topic?.color}} title={topic?.label}/>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}

        {activeTopics.length > 0 && SUGGESTIONS.every(g => g.items.filter(it => activeTopics.includes(it.topic)).length === 0) && (
          <div className="ai-empty-state">
            <p>No prompts for the topics you selected yet.</p>
            <p>Ask anything below — I will still answer.</p>
          </div>
        )}
      </div>

      <button className="ai-primary-cta">
        <span className="ai-primary-glow" aria-hidden/>
        <Icon name="mail" size={14}/>
        Draft an email with AI
        <span className="ai-primary-kbd">⌘E</span>
      </button>
    </div>
  );
};

// ── Inline structured action card (when AI proposes a concrete action) ──
const ExpenseCard = ({ amount, concept, category, onConfirm }) => {
  const [a, setA] = useAiS(amount || '');
  const [c, setC] = useAiS(concept || '');
  const [cat, setCat] = useAiS(category || '');
  return (
    <div className="ai-action-card">
      <header>
        <span className="ai-action-label">
          <Icon name="bookmark" size={11}/>
          Log expense
        </span>
        <span className="ai-action-status">Awaiting your input</span>
      </header>
      <div className="ai-action-fields">
        <label>
          <span>Amount</span>
          <div className="ai-fld">
            <span className="ai-fld-prefix">$</span>
            <input value={a} onChange={e=>setA(e.target.value)} placeholder="0.00" inputMode="decimal"/>
          </div>
        </label>
        <label>
          <span>Concept</span>
          <input className="ai-fld" value={c} onChange={e=>setC(e.target.value)} placeholder="e.g. Figma seat"/>
        </label>
        <label>
          <span>Category</span>
          <select className="ai-fld" value={cat} onChange={e=>setCat(e.target.value)}>
            <option value="">Choose…</option>
            <option>Software</option>
            <option>Travel</option>
            <option>Contractors</option>
            <option>Hardware</option>
            <option>Marketing</option>
          </select>
        </label>
      </div>
      <footer>
        <button className="ai-btn-ghost">Cancel</button>
        <button className="ai-btn-primary" onClick={onConfirm} disabled={!a || !c || !cat}>
          <Icon name="check" size={12}/>
          Log expense
        </button>
      </footer>
    </div>
  );
};

// ── Source/citation chip ─────────────────────────────────────────────
const SourceChip = ({ label, color = '#6DBEDC' }) => (
  <span className="ai-source" style={{'--c': color}}>
    <span className="ai-source-dot" style={{background: color}}/>
    {label}
  </span>
);

// ── Conversation state ───────────────────────────────────────────────
const Conversation = ({ messages }) => {
  const endRef = useAiR(null);
  useAiE(() => { endRef.current?.scrollIntoView({behavior:'smooth', block:'end'}); }, [messages.length]);
  return (
    <div className="ai-thread">
      {messages.map((m, i) => {
        if (m.role === 'user') {
          return (
            <div key={i} className="ai-msg ai-msg-user">
              <div className="ai-msg-bubble ai-msg-user-bubble">{m.text}</div>
            </div>
          );
        }
        return (
          <div key={i} className="ai-msg ai-msg-bot">
            <div className="ai-msg-avatar">
              <Icon name="sparkle" size={13}/>
            </div>
            <div className="ai-msg-stack">
              <div className="ai-msg-bubble ai-msg-bot-bubble">
                {m.text}
                {m.sources && (
                  <div className="ai-sources">
                    {m.sources.map((s, j) => <SourceChip key={j} {...s}/>)}
                  </div>
                )}
              </div>
              {m.action && (
                <ExpenseCard {...m.action}/>
              )}
              {!m.action && (
                <div className="ai-msg-actions">
                  <button className="ai-msg-act" title="Helpful"><Icon name="check" size={11}/></button>
                  <button className="ai-msg-act" title="Not helpful"><Icon name="check" size={11} style={{transform:'rotate(180deg)'}}/></button>
                  <button className="ai-msg-act" title="Copy"><Icon name="docs" size={11}/></button>
                  <button className="ai-msg-act" title="Regenerate"><Icon name="bolt" size={11}/></button>
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div ref={endRef}/>
    </div>
  );
};

// ── Input ────────────────────────────────────────────────────────────
const ChatInput = ({ value, setValue, onSend, busy }) => {
  const taRef = useAiR(null);
  useAiE(() => {
    const ta = taRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; }
  }, [value]);
  return (
    <footer className="ai-input">
      <div className="ai-input-shell">
        <textarea
          ref={taRef}
          rows={1}
          placeholder="Ask anything, or ask me to create a task, plan the week, log an expense…"
          value={value}
          onChange={e=>setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
          }}
        />
        <div className="ai-input-actions">
          <button className="ai-iconbtn" title="Attach"><Icon name="docs" size={13}/></button>
          <button className="ai-iconbtn" title="Voice"><Icon name="mic" size={13}/></button>
          <button className={`ai-send ${value.trim() ? 'ready' : ''}`} onClick={onSend} disabled={!value.trim() || busy} title="Send (Enter)">
            <Icon name="send" size={13}/>
          </button>
        </div>
      </div>
      <div className="ai-input-meta">
        <span><kbd>↵</kbd> send · <kbd>⇧↵</kbd> new line</span>
        <span>Saved locally · ~12 msgs today</span>
      </div>
    </footer>
  );
};

Object.assign(window, {
  SUGGESTIONS, TOPICS, CONTEXT,
  PanelHeader, ContextStrip, TopicsBar, EmptyState, ExpenseCard, SourceChip,
  Conversation, ChatInput,
});
