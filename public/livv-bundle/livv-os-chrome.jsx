// LIVV OS — Shell (Sidebar + Topbar) + Cmd+K
const { useState: useShS, useEffect: useShE } = React;

const Sidebar = () => (
  <aside className="sb" data-screen-label="Sidebar">
    <div className="sb-logo">L</div>
    <nav className="sb-rail">
      {MODULES.map(m => (
        <button key={m.id} className={`sb-item ${m.active ? 'active' : ''}`}>
          <OS_ICON name={m.icon} size={18}/>
          {m.badge > 0 && <span className="sb-badge">{m.badge}</span>}
          <span className="sb-tooltip">{m.label}</span>
        </button>
      ))}
    </nav>
    <div className="sb-avatar" title="Eneas">E</div>
  </aside>
);

const Topbar = ({ onSearch }) => (
  <header className="tb">
    <div className="crumbs">
      <span className="mod-icon"><OS_ICON name="sales" size={13}/></span>
      <span>Sales</span>
      <span className="sep">/</span>
      <span className="seg-active">Pipeline Board</span>
    </div>
    <div className="tb-spacer"/>
    <button className="tb-search" onClick={onSearch}>
      <OS_ICON name="search" size={14}/>
      <span>Search leads, content, projects…</span>
      <span className="kbd">⌘K</span>
    </button>
    <div className="tb-actions">
      <button className="tb-iconbtn" title="Notifications">
        <OS_ICON name="bell" size={16}/>
        <span className="dot">5</span>
      </button>
    </div>
    <button className="tb-new">
      <OS_ICON name="plus" size={14}/>
      New
    </button>
  </header>
);

// Cmd+K modal
const CmdK = ({ onClose }) => {
  const [q, setQ] = useShS('');
  useShE(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="cmdk-back" onClick={onClose}>
      <div className="cmdk" onClick={e => e.stopPropagation()}>
        <div className="cmdk-input">
          <OS_ICON name="search" size={16}/>
          <input autoFocus placeholder="Find anything — leads, content, projects, ICPs…" value={q} onChange={e => setQ(e.target.value)}/>
        </div>
        <div className="cmdk-results">
          <div className="cmdk-group">Leads</div>
          <div className="cmdk-item sel">
            <span className="icon"><OS_ICON name="sales" size={12}/></span>
            <span>Mulberry Group — Call Done</span>
            <span className="mod">Sales</span>
          </div>
          <div className="cmdk-item">
            <span className="icon"><OS_ICON name="sales" size={12}/></span>
            <span>Northwind SaaS — New</span>
            <span className="mod">Sales</span>
          </div>
          <div className="cmdk-group">Content</div>
          <div className="cmdk-item">
            <span className="icon"><OS_ICON name="content" size={12}/></span>
            <span>Case study — Sunnyside</span>
            <span className="mod">Content</span>
          </div>
          <div className="cmdk-group">ICPs</div>
          <div className="cmdk-item">
            <span className="icon"><OS_ICON name="strategy" size={12}/></span>
            <span>Agencies — playbook</span>
            <span className="mod">Strategy</span>
          </div>
        </div>
        <div className="cmdk-foot">
          <span><kbd>↑↓</kbd> navigate <kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { Sidebar, Topbar, CmdK });
