// Livv Dashboard — Sidebar + Topbar
const { useState } = React;

const Sidebar = ({ active, setActive }) => {
  const [clientsOpen, setClientsOpen] = useState(true);
  const NAV_HREFS = { home: 'index.html', calendar: 'calendar.html' };
  const onClick = (id) => {
    if (NAV_HREFS[id] && NAV_HREFS[id] !== location.pathname.split('/').pop()) {
      window.location.href = NAV_HREFS[id];
    } else {
      setActive(id);
    }
  };
  return (
    <aside className="sidebar" data-screen-label="Sidebar">
      <div className="brand-row">
        <div className="brand-mark">
          <svg viewBox="0 0 32 32" fill="none">
            <path d="M3 6h5v18H3z" fill="#09090B"/>
            <path d="M11 6h6l5 18h-6L11 6z" fill="#09090B"/>
            <circle cx="26" cy="9" r="2" fill="#C4A35A"/>
          </svg>
        </div>
        <span className="brand-name">Livv Studio</span>
      </div>

      <div className="system-card">
        <div className="system-pills">
          <div className="system-pill active"><Icon name="home" size={13}/></div>
          <div className="system-pill"><Icon name="dashboard" size={13}/></div>
          <div className="system-pill"><Icon name="settings" size={13}/></div>
        </div>
        <div className="meta-col">
          <strong>System</strong>
          <span>Switch view</span>
        </div>
      </div>

      <div className="nav-section">
        {NAV_TOP.map(n => (
          <div key={n.id} className={`nav-item ${active === n.id ? 'active' : ''}`} onClick={() => onClick(n.id)}>
            <span className="nav-icon"><Icon name={n.icon} size={15}/></span>
            <span>{n.label}</span>
          </div>
        ))}
      </div>

      <div className="nav-section">
        {NAV_MID.map(n => (
          <div key={n.id} className={`nav-item ${active === n.id ? 'active' : ''}`} onClick={() => onClick(n.id)}>
            <span className="nav-icon"><Icon name={n.icon} size={15}/></span>
            <span>{n.label}</span>
          </div>
        ))}
      </div>

      <div className="nav-section">
        {NAV_BOT.map(n => (
          <div key={n.id} className={`nav-item ${active === n.id ? 'active' : ''}`} onClick={() => onClick(n.id)}>
            <span className="nav-icon"><Icon name={n.icon} size={15}/></span>
            <span>{n.label}</span>
          </div>
        ))}
      </div>

      <div className="nav-section">
        <div className="nav-item" onClick={() => setClientsOpen(!clientsOpen)}>
          <span className="nav-icon"><Icon name="clients" size={15}/></span>
          <span>Clients</span>
          <span className="nav-chevron"><Icon name={clientsOpen ? 'chevronDown' : 'chevron'} size={13}/></span>
        </div>
        {clientsOpen && (
          <div style={{paddingTop: 6}}>
            <div className="client-star">
              <Icon name="star" size={14} style={{color:'#E8BC59', fill:'#E8BC59'}}/>
              <span>Christie King</span>
            </div>
            <div className="client-list">
              {CLIENTS.map(c => (
                <div key={c.name} className="client-item">
                  <span className="client-dot" style={{background: c.color}}/>
                  <span>{c.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{flex: 1}}/>

      <div className="nav-section">
        <div className="nav-item">
          <span className="nav-icon"><Icon name="bookmark" size={15}/></span>
          <span>Platform</span>
        </div>
        <div className="nav-item">
          <span className="nav-icon"><Icon name="theme" size={15}/></span>
          <span>Theme</span>
        </div>
      </div>

      <div style={{display:'flex', justifyContent:'center', paddingTop: 6}}>
        <button className="icon-btn" style={{width: 26, height: 26}}>
          <Icon name="chevron" size={12} style={{transform: 'rotate(180deg)'}}/>
        </button>
      </div>
    </aside>
  );
};

const Topbar = () => (
  <div className="topbar">
    <div className="search-pill">
      <Icon name="search" size={13}/>
      <span>Search</span>
      <span className="kbd">⌘K</span>
    </div>
    <span className="crumb">Dashboard</span>
    <div className="topbar-right">
      <button className="btn-new">
        <Icon name="plus" size={13}/>
        <span>New</span>
        <span className="kbd">⌘N</span>
      </button>
      <button className="icon-btn">
        <Icon name="bell" size={15}/>
        <span className="badge">9</span>
      </button>
      <div className="avatar">
        <div className="av">E</div>
        <span>Eneas</span>
      </div>
    </div>
  </div>
);

Object.assign(window, { Sidebar, Topbar });
