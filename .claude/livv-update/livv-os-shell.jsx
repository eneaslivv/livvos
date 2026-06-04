// LIVV OS — Shell (sidebar, topbar, tabs, slide-over)
const { useState: useShS, useEffect: useShE } = React;

const Sidebar = ({ active, setActive }) => (
  <aside className="sb" data-screen-label="Sidebar">
    <div className="sb-logo">L</div>
    <nav className="sb-rail">
      {MODULES.map(m => (
        <button
          key={m.id}
          className={`sb-item ${m.id === active ? 'active' : ''}`}
          onClick={() => setActive(m.id)}
        >
          <OS_ICON name={m.icon} size={18}/>
          {m.badge > 0 && <span className="sb-badge">{m.badge}</span>}
          <span className="sb-tooltip">{m.label}</span>
        </button>
      ))}
    </nav>
    <div className="sb-avatar" title="Eneas">E</div>
  </aside>
);

const Topbar = ({ activeModule, activeTab, onSearch, isCoach, onRestartFlow, hasFlow }) => {
  const mod = MODULES.find(m => m.id === activeModule);
  const tab = TABS[activeModule].find(t => t.id === activeTab);
  return (
    <header className="tb">
      <div className="crumbs">
        <span className="mod-chip">
          <span className="ic"><OS_ICON name={mod.icon} size={11}/></span>
          {mod.label}
        </span>
        <span className="sep">/</span>
        <span className="seg-active">{tab?.label}</span>
        {isCoach && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 8, padding: '3px 9px', background: 'var(--accent-soft)', border: '0.5px solid var(--accent-strong)', borderRadius: 999, fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#8b6a17' }}>
            <span style={{ width: 5, height: 5, borderRadius: 999, background: 'var(--accent)' }}/>
            Setup mode
          </span>
        )}
      </div>
      <div className="tb-spacer"/>
      <button className="tb-search" onClick={onSearch}>
        <OS_ICON name="search" size={14}/>
        <span>Search leads, content, ICPs, people…</span>
        <span className="kbd">⌘K</span>
      </button>
      <div className="tb-actions">
        {!isCoach && hasFlow && (
          <button className="coach-toggle" onClick={onRestartFlow} title="Re-open the setup tour">
            <span className="pulse">?</span>
            Tour
          </button>
        )}
        <button className="tb-iconbtn" title="Notifications">
          <OS_ICON name="bell" size={15}/>
          <span className="dot">5</span>
        </button>
      </div>
      <button className="tb-new">
        <OS_ICON name="plus" size={13}/>
        New
        <span className="kbd">⌘N</span>
      </button>
    </header>
  );
};

const Tabs = ({ items, active, setActive }) => (
  <div className="tabs" role="tablist">
    {items.map(t => (
      <button
        key={t.id}
        className={`tab ${t.id === active ? 'active' : ''}`}
        onClick={() => setActive(t.id)}
        role="tab"
        aria-selected={t.id === active}
      >
        <OS_ICON name={t.icon} size={12}/>
        {t.label}
        {t.count != null && <span className="count">{t.count}</span>}
      </button>
    ))}
  </div>
);

// Generic empty/stub for tabs we won't fully build out
const TabStub = ({ icon, title, blurb, tag }) => (
  <div className="empty-stub">
    <div className="ic"><OS_ICON name={icon} size={20}/></div>
    <h3>{title}</h3>
    <p>{blurb}</p>
    {tag && <span className="tag">{tag}</span>}
  </div>
);

Object.assign(window, { Sidebar, Topbar, Tabs, TabStub });
