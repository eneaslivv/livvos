// Livv Dashboard — Right rail
const { useState: useRailS } = React;

const Rail = () => {
  const [hideProfit, setHideProfit] = useRailS(true);
  return (
    <aside className="rail" data-screen-label="Right Rail">
      <div className="rail-row">
        <div className="rail-stat">
          <div className="label">Pending</div>
          <div className="v">25</div>
          <div className="sub">today</div>
        </div>
        <div className="rail-stat">
          <div className="label">Done</div>
          <div className="v">0</div>
          <div className="sub">0% complete</div>
        </div>
      </div>

      <div className="rail-profit">
        <div className="label">
          <span>Monthly profit</span>
          <span onClick={() => setHideProfit(!hideProfit)}>
            <Icon name={hideProfit ? 'eyeOff' : 'eye'} size={13}/>
          </span>
        </div>
        <div className="dots" style={{filter: hideProfit ? 'blur(0)' : 'none'}}>
          {hideProfit ? '● ● ● ● ●' : '$3,142'}
        </div>
        <div className="row">
          <span className="pos">+{hideProfit ? '$••' : '$4,556'}</span>
          <span className="neg">−{hideProfit ? '$••' : '$1,414'}</span>
        </div>
        <span className="link">View finances <Icon name="arrowUpRight" size={11}/></span>
      </div>

      <div className="rail-insights">
        <div className="header">
          <Icon name="sparkle" size={11}/>
          <span>Insights</span>
        </div>
        <div className="insight-chips">
          {INSIGHT_CHIPS.map((c, i) => (
            <span key={i} className={`insight-chip ${c.tone}`}>{c.label}</span>
          ))}
        </div>
        <div className="insight-list">
          {INSIGHTS.map((t, i) => <div key={i} className="insight-item">{t}</div>)}
        </div>
      </div>

      <div className="rail-actions">
        <button className="rail-action">
          <Icon name="plus" size={16}/>
          New task
        </button>
        <button className="rail-action">
          <Icon name="calendar" size={16}/>
          Calendar
        </button>
        <button className="rail-action">
          <Icon name="docs" size={16}/>
          Docs
        </button>
        <button className="rail-action">
          <Icon name="mail" size={16}/>
          CRM
        </button>
      </div>

      <div className="rail-owner">
        <div className="av"><Icon name="user" size={18}/></div>
        <div className="meta">
          <div className="name">Eneas</div>
          <div className="role">Owner</div>
        </div>
        <div style={{marginLeft:'auto', display:'flex', gap: 5}}>
          <button className="icon-btn" style={{width: 28, height: 28, border: 'none', background:'var(--livv-cream-100)'}}>
            <Icon name="settings" size={13}/>
          </button>
        </div>
      </div>
    </aside>
  );
};

Object.assign(window, { Rail });
