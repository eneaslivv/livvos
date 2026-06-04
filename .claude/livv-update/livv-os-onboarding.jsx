// LIVV OS — Onboarding (coach) flows per tab
const { useState: useCoS, useEffect: useCoE } = React;

// ─────────────────────────────────────────────────────────────
// Generic visual right-pane — animated stage that varies per step
// ─────────────────────────────────────────────────────────────
const CoachVisual = ({ kind, step, total, data }) => {
  // Each kind has its own animated SVG mockup
  switch (kind) {
    case 'icp':         return <VisualICP step={step} data={data}/>;
    case 'sales':       return <VisualSales step={step} data={data}/>;
    case 'content':     return <VisualContent step={step} data={data}/>;
    case 'team':        return <VisualTeam step={step} data={data}/>;
    case 'automation':  return <VisualAutomation step={step} data={data}/>;
    case 'dashboard':   return <VisualDashboard step={step} data={data}/>;
    case 'partner':     return <VisualPartner step={step} data={data}/>;
    case 'package':     return <VisualPackage step={step} data={data}/>;
    case 'principle':   return <VisualPrinciple step={step} data={data}/>;
    case 'brand':       return <VisualBrand step={step} data={data}/>;
    case 'role':        return <VisualRole step={step} data={data}/>;
    case 'connection':  return <VisualConnection step={step} data={data}/>;
    default:            return null;
  }
};

// Package — builds a package card progressively
const VisualPackage = ({ step, data }) => {
  const c = data.icpColor || 'var(--accent)';
  return (
    <div style={{ width: '100%', maxWidth: 320 }}>
      <div className="icp-card" style={{ '--icp-color': c, padding: 22, cursor: 'default' }}>
        <div className="icp-head" style={{ marginBottom: 14 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--os-fg-2)' }}>{data.icp || 'ICP target'}</span>
          <span className="status active" style={{ marginLeft: 'auto' }}>NEW</span>
        </div>
        <h3 style={{ fontSize: 16, margin: '0 0 14px', fontWeight: 500, letterSpacing: '-0.015em' }}>{data.name || 'Your package name'}</h3>
        {step >= 1 && data.mods && (
          <div style={{ marginBottom: 14, animation: 'coach-step-in .4s var(--ios-ease)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--os-fg-2)', marginBottom: 6 }}>Modules</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {data.mods.map(m => <span key={m} className="conn-perm" style={{ fontSize: 10 }}>{m}</span>)}
            </div>
          </div>
        )}
        {step >= 2 && (
          <div className="icp-stats" style={{ animation: 'coach-step-in .4s var(--ios-ease)' }}>
            <div className="icp-stat"><div className="l">Impl</div><div className="v" style={{ fontSize: 14 }}>{data.impl || '—'}</div></div>
            <div className="icp-stat"><div className="l">Monthly</div><div className="v" style={{ fontSize: 14, color: c }}>{data.mrr || '—'}</div></div>
            <div className="icp-stat"><div className="l">Weeks</div><div className="v" style={{ fontSize: 14 }}>{data.weeks || '—'}</div></div>
          </div>
        )}
        {step >= 3 && data.deliverables && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed rgba(90,62,62,0.14)', animation: 'coach-step-in .4s var(--ios-ease)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--os-fg-2)', marginBottom: 6 }}>Deliverables · {data.deliverables.filter(Boolean).length}</div>
            {data.deliverables.filter(Boolean).slice(0, 3).map((d, i) => (
              <div key={i} style={{ fontSize: 11, color: 'var(--os-fg-1)', padding: '3px 0', display: 'flex', gap: 6 }}>
                <span style={{ width: 4, height: 4, borderRadius: 999, background: c, marginTop: 6, flexShrink: 0 }}/>
                {d}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Principle — builds a positioning card with compass position
const VisualPrinciple = ({ step, data }) => {
  const c = data.tagColor || 'var(--accent)';
  return (
    <div style={{ width: '100%', maxWidth: 340 }}>
      {/* Mini compass */}
      <div style={{ position: 'relative', height: 140, background: 'var(--os-surface-2)', border: '0.5px solid var(--os-border-2)', borderRadius: 12, padding: 16, marginBottom: 14 }}>
        <span style={{ position: 'absolute', top: '50%', left: 12, right: 12, height: 1, background: 'rgba(90,62,62,0.18)', backgroundImage: 'linear-gradient(90deg, rgba(90,62,62,0.18) 50%, transparent 50%)', backgroundSize: '6px 1px' }}/>
        <span style={{ position: 'absolute', top: 12, bottom: 12, left: '50%', width: 1, background: 'rgba(90,62,62,0.18)', backgroundImage: 'linear-gradient(180deg, rgba(90,62,62,0.18) 50%, transparent 50%)', backgroundSize: '1px 6px' }}/>
        <span style={{ position: 'absolute', top: 6, left: 8, fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.14em', color: 'var(--os-fg-3)', textTransform: 'uppercase' }}>Internal</span>
        <span style={{ position: 'absolute', top: 6, right: 8, fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.14em', color: 'var(--os-fg-3)', textTransform: 'uppercase' }}>External</span>
        <span style={{ position: 'absolute', bottom: 6, left: 8, fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.14em', color: 'var(--os-fg-3)', textTransform: 'uppercase' }}>Tactical</span>
        <span style={{ position: 'absolute', bottom: 6, right: 8, fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.14em', color: 'var(--os-fg-3)', textTransform: 'uppercase' }}>Strategic</span>
        {step >= 1 && data.axisX != null && (
          <span style={{
            position: 'absolute',
            left: `${data.axisX * 100}%`,
            bottom: `${(data.axisY || 0.5) * 100}%`,
            transform: 'translate(-50%, 50%)',
            width: 24, height: 24, borderRadius: 999,
            background: c, border: '2px solid var(--os-panel)',
            color: '#fff', fontSize: 10, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 0 4px color-mix(in oklab, ${c} 18%, transparent)`,
            animation: 'coach-step-in .4s var(--ios-ease)',
          }}>01</span>
        )}
      </div>

      <div style={{ background: 'var(--os-panel)', border: '0.5px solid var(--os-border-2)', borderRadius: 12, padding: 16, position: 'relative', overflow: 'hidden' }}>
        <span style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, background: c, opacity: 0.6 }}/>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', color: 'var(--os-fg-3)' }}>01</span>
        </div>
        <h3 style={{ fontSize: 15, fontWeight: 500, letterSpacing: '-0.012em', margin: '0 0 6px', color: 'var(--os-fg-0)' }}>{data.title || 'Your principle title'}</h3>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: 'var(--os-fg-1)', minHeight: 38 }}>{data.desc || 'Describe the operating belief in one or two sentences.'}</p>
        {step >= 2 && data.tags && (
          <div style={{ display: 'flex', gap: 5, marginTop: 12, paddingTop: 10, borderTop: '1px dashed rgba(90,62,62,0.10)', animation: 'coach-step-in .35s var(--ios-ease)' }}>
            {data.tags.map(t => (
              <span key={t} style={{ padding: '2px 8px', background: `color-mix(in oklab, ${c} 10%, var(--os-surface))`, color: c, borderRadius: 999, fontSize: 10, fontWeight: 500 }}>{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Brand — builds a brand kit card with palette and voice
const VisualBrand = ({ step, data }) => {
  const palette = data.palette || ['#A8A29A', '#1A1A1A', '#F5F5F5'];
  return (
    <div style={{ width: '100%', maxWidth: 320 }}>
      <div className="icp-card" style={{ '--icp-color': palette[0], padding: 22, cursor: 'default' }}>
        <div className="icp-head" style={{ marginBottom: 14 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: palette[1], color: palette[2], display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 14 }}>
            {(data.name || '?')[0]?.toUpperCase()}
          </div>
          <div>
            <h3 style={{ fontSize: 14 }}>{data.name || 'Your brand'}</h3>
            <div style={{ fontSize: 11.5, color: 'var(--os-fg-2)' }}>{data.industry || 'Industry'}</div>
          </div>
        </div>

        {step >= 1 && data.palette && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, animation: 'coach-step-in .4s var(--ios-ease)' }}>
            {palette.map((c, i) => (
              <div key={i} style={{ flex: 1, height: 38, borderRadius: 8, background: c, border: '0.5px solid var(--os-border-2)' }}/>
            ))}
          </div>
        )}

        {step >= 2 && data.fonts && (
          <div style={{ padding: '10px 12px', background: palette[2] || '#fff', border: `0.5px solid color-mix(in oklab, ${palette[1]} 18%, var(--os-border-2))`, borderRadius: 9, marginBottom: 12, animation: 'coach-step-in .4s var(--ios-ease)' }}>
            <div style={{ fontFamily: data.fonts.heading || 'serif', fontSize: 16, color: palette[1], lineHeight: 1.1, fontWeight: 400, letterSpacing: '-0.02em' }}>Editorial heading</div>
            <div style={{ fontFamily: data.fonts.body || 'sans-serif', fontSize: 11, color: palette[1], opacity: 0.75, marginTop: 4 }}>And body copy below — the way it actually reads.</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--os-fg-3)', marginTop: 6, letterSpacing: '0.06em' }}>{data.fonts.heading} / {data.fonts.body}</div>
          </div>
        )}

        {step >= 3 && data.voice && (
          <div style={{ animation: 'coach-step-in .4s var(--ios-ease)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--os-fg-2)', marginBottom: 8 }}>Voice</div>
            {[
              { l: 'Formal', r: 'Casual', v: data.voice.formal ?? 0.5 },
              { l: 'Technical', r: 'Accessible', v: data.voice.technical ?? 0.5 },
            ].map((s, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 60px', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--os-fg-2)' }}>{s.l}</span>
                <div style={{ position: 'relative', height: 3, background: 'var(--os-divider)', borderRadius: 999 }}>
                  <span style={{ position: 'absolute', top: -4, left: `${s.v * 100}%`, transform: 'translateX(-50%)', width: 11, height: 11, borderRadius: 999, background: 'var(--os-ink)', border: '2px solid var(--os-panel)' }}/>
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--os-fg-2)', textAlign: 'right' }}>{s.r}</span>
              </div>
            ))}
          </div>
        )}

        {step >= 4 && data.forbidden && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed rgba(90,62,62,0.10)', animation: 'coach-step-in .4s var(--ios-ease)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--err)', marginBottom: 6 }}>Never use</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {data.forbidden.filter(Boolean).slice(0,4).map(w => (
                <span key={w} style={{ padding: '2px 8px', background: 'rgba(239,68,68,0.08)', color: 'var(--err)', borderRadius: 999, fontSize: 10, textDecoration: 'line-through' }}>{w}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Role — builds a role card
const VisualRole = ({ step, data }) => {
  const c = data.deptColor || 'var(--accent)';
  return (
    <div style={{ width: '100%', maxWidth: 320 }}>
      <div className="role-card" style={{ '--c': c, cursor: 'default' }}>
        <header className="role-card-head">
          <span className="role-card-av" style={{ background: data.filled ? c : 'transparent', color: data.filled ? '#fff' : c, borderColor: c, borderStyle: data.filled ? 'solid' : 'dashed' }}>
            {data.filled ? (data.person || '?')[0] : '?'}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 className="role-card-title">{data.title || 'Your role'}</h3>
            <div className="role-card-meta">
              <span>{data.dept || 'Department'}</span>
              {data.type && <><span className="dot-sep">·</span><span>{data.type}</span></>}
              {data.phase && <><span className="dot-sep">·</span><span>{data.phase}</span></>}
            </div>
          </div>
          <span className={`brand-status ${data.filled ? 'active' : 'archived'}`}>{data.filled ? 'filled' : 'planned'}</span>
        </header>

        {step >= 2 && data.rationale && (
          <div className="role-card-person" style={{ animation: 'coach-step-in .4s var(--ios-ease)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--os-fg-2)' }}>Why</span>
            <span style={{ fontSize: 12, color: 'var(--os-fg-1)', marginTop: 4, lineHeight: 1.5 }}>{data.rationale}</span>
          </div>
        )}

        {step >= 3 && data.tasks && data.tasks.filter(Boolean).length > 0 && (
          <div style={{ animation: 'coach-step-in .4s var(--ios-ease)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--os-fg-2)', marginBottom: 6 }}>Core tasks</div>
            {data.tasks.filter(Boolean).slice(0,3).map((t, i) => (
              <div key={i} style={{ fontSize: 11.5, color: 'var(--os-fg-1)', padding: '3px 0', display: 'flex', gap: 8 }}>
                <span style={{ width: 4, height: 4, borderRadius: 999, background: c, marginTop: 6, flexShrink: 0 }}/>
                {t}
              </div>
            ))}
          </div>
        )}

        {step >= 4 && data.kpi && (
          <div style={{ padding: '10px 12px', background: `color-mix(in oklab, ${c} 6%, var(--os-surface))`, borderRadius: 8, animation: 'coach-step-in .4s var(--ios-ease)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--os-fg-1)', marginBottom: 5 }}>
              <span>{data.kpi}</span>
              <strong style={{ color: 'var(--os-fg-0)', fontFamily: 'var(--font-mono)' }}>{data.kpiTarget || 'target'}</strong>
            </div>
            <div className="phase-bar"><div className="phase-fill" style={{ width: '0%', background: c }}/></div>
          </div>
        )}

        <footer className="role-card-foot">
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--os-fg-1)' }}>${(data.cost || 0).toLocaleString()}/mo</span>
        </footer>
      </div>
    </div>
  );
};

// Connection — builds a connection card
const VisualConnection = ({ step, data }) => {
  const c = data.color || '#7C5CFF';
  return (
    <div style={{ width: '100%', maxWidth: 320 }}>
      <div className="conn-card connected" style={{ '--c': c, cursor: 'default' }}>
        <header className="conn-card-head">
          <div className="conn-logo" style={{ background: `color-mix(in oklab, ${c} 14%, var(--os-surface))`, color: c }}>
            <strong>{(data.platform || '?')[0]}</strong>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h4 style={{ margin: 0, fontSize: 13.5, fontWeight: 500 }}>{data.platform || 'Platform'}</h4>
            <div className="conn-account">{step >= 1 ? (data.account || 'Connecting…') : 'Not connected'}</div>
          </div>
          <span className={`conn-status ${step >= 1 ? 'on' : 'off'}`}>
            <span className="dot"/>
            {step >= 1 ? 'Connected' : 'Off'}
          </span>
        </header>

        {step >= 2 && data.permissions && (
          <div className="conn-perms" style={{ animation: 'coach-step-in .4s var(--ios-ease)' }}>
            {data.permissions.map(p => <span key={p} className="conn-perm">{p}</span>)}
          </div>
        )}

        {step >= 3 && data.use && (
          <div style={{ padding: '10px 12px', background: `color-mix(in oklab, ${c} 6%, var(--os-surface))`, borderLeft: `2px solid ${c}`, borderRadius: '0 8px 8px 0', animation: 'coach-step-in .4s var(--ios-ease)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: c, fontWeight: 600, marginBottom: 4 }}>Powers</div>
            <div style={{ fontSize: 11.5, color: 'var(--os-fg-1)', lineHeight: 1.45 }}>{data.use}</div>
          </div>
        )}

        <footer className="conn-card-foot">
          {step >= 1 && (
            <span className="conn-sync"><span className="conn-sync-dot"/>Just now</span>
          )}
          <button className="conn-btn manage" style={{ marginLeft: 'auto' }}>Manage <OS_ICON name="arrow" size={11}/></button>
        </footer>
      </div>
    </div>
  );
};

// ICP visual — builds up an ICP card as user fills it
const VisualICP = ({ step, data }) => {
  const color = data.color || '#A8A29A';
  return (
    <div style={{ width: '100%', maxWidth: 320, position: 'relative' }}>
      <div style={{
        position: 'absolute', inset: -8, borderRadius: 24,
        background: `radial-gradient(circle at 50% 0%, color-mix(in oklab, ${color} 16%, transparent), transparent 70%)`,
        filter: 'blur(20px)', opacity: step >= 1 ? 1 : 0,
        transition: 'opacity .6s var(--ios-ease)',
      }}/>
      <div className="icp-card" style={{
        '--icp-color': color, padding: 22, cursor: 'default',
        position: 'relative',
        transform: `scale(${0.92 + step * 0.02})`,
        transition: 'transform .5s var(--spring), border-color .5s var(--ios-ease)',
      }}>
        <div className="icp-head" style={{ marginBottom: 14 }}>
          <div className="av" style={{ background: 'transparent' }}>
            {data.short || '??'}
          </div>
          <h3 style={{ fontSize: 15, opacity: step >= 0 ? 1 : 0.3, transition: 'opacity .4s' }}>
            {data.name || 'Your first ICP'}
          </h3>
          <span className="status active" style={{ opacity: step >= 1 ? 1 : 0, transition: 'opacity .4s' }}>
            {data.status || 'active'}
          </span>
        </div>
        <p className="icp-desc" style={{ minHeight: 38, opacity: step >= 0 ? 0.85 : 0.3, transition: 'opacity .4s' }}>
          {data.desc || 'Describe who they are in one line — the people you sell to best.'}
        </p>
        <div className="icp-stats" style={{ opacity: step >= 4 ? 1 : 0.3, transition: 'opacity .5s', filter: step >= 4 ? 'none' : 'blur(2px)' }}>
          <div className="icp-stat">
            <div className="l">Ticket</div>
            <div className="v" style={{ fontSize: 12.5 }}>{data.ticket || '— + —/mo'}</div>
          </div>
          <div className="icp-stat">
            <div className="l">Leads</div>
            <div className="v">0</div>
          </div>
          <div className="icp-stat">
            <div className="l">Clients</div>
            <div className="v">0</div>
          </div>
        </div>
        {step >= 2 && (
          <div style={{
            marginTop: 14, paddingTop: 12,
            borderTop: '1px dashed rgba(90,62,62,0.16)',
            animation: 'coach-step-in .4s var(--ios-ease)',
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--os-fg-2)', marginBottom: 6 }}>Pain points</div>
            {(data.pains || []).filter(Boolean).slice(0, 3).map((p, i) => (
              <div key={i} style={{ fontSize: 11.5, color: 'var(--os-fg-1)', display: 'flex', gap: 8, padding: '3px 0' }}>
                <span style={{ width: 4, height: 4, borderRadius: 999, background: color, marginTop: 7, flexShrink: 0 }}/>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p}</span>
              </div>
            ))}
            {(!data.pains || data.pains.filter(Boolean).length === 0) && (
              <div style={{ fontSize: 11.5, color: 'var(--os-fg-3)', fontStyle: 'italic' }}>Tell us what hurts them.</div>
            )}
          </div>
        )}
        {step >= 3 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed rgba(90,62,62,0.16)', animation: 'coach-step-in .4s var(--ios-ease)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--os-fg-2)', marginBottom: 6 }}>Expansion path</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', fontSize: 10.5, color: 'var(--os-fg-1)' }}>
              {(data.path || ['Sales', 'Content', 'Finance', 'Scaling']).map((p, i, a) => (
                <React.Fragment key={i}>
                  <span style={{ padding: '2px 7px', background: 'var(--os-surface)', borderRadius: 4, border: '0.5px solid var(--os-border)' }}>{p}</span>
                  {i < a.length - 1 && <span style={{ color: 'var(--os-fg-3)' }}>→</span>}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Sales visual — animates pipeline columns appearing
const VisualSales = ({ step, data }) => {
  const stages = ['New', 'Contacted', 'Call', 'Done', 'Proposal', 'Won'];
  return (
    <div style={{ width: '100%' }}>
      <div style={{
        display: 'flex', gap: 6, padding: 6, overflow: 'hidden',
      }}>
        {stages.map((s, i) => (
          <div key={s} style={{
            flex: 1, minHeight: 280, background: 'var(--os-panel)',
            border: '0.5px solid var(--os-border-2)', borderRadius: 8,
            padding: 8,
            opacity: step >= 0 ? 1 : 0,
            transform: `translateY(${step >= 0 ? 0 : 8}px)`,
            transition: `opacity .4s ${i * 0.05}s var(--ios-ease), transform .4s ${i * 0.05}s var(--ios-ease)`,
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--os-fg-2)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 5, height: 5, borderRadius: 2, background: i === 0 && step >= 2 ? 'var(--accent)' : 'var(--os-fg-3)' }}/>
              {s}
            </div>
            {/* First lead card in 'New' column appears at step >=2 */}
            {i === 0 && step >= 2 && (
              <div style={{
                padding: 8, background: 'var(--os-surface)',
                border: '0.5px solid var(--accent-strong)', borderRadius: 6,
                position: 'relative',
                animation: 'coach-step-in .4s var(--ios-ease)',
              }}>
                <div style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 2, background: data.icp_color || 'var(--accent)', borderRadius: '0 2px 2px 0' }}/>
                <div style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--os-fg-0)', marginBottom: 2 }}>
                  {data.company || 'New company'}
                </div>
                <div style={{ fontSize: 9, color: 'var(--os-fg-2)' }}>
                  {data.contact || 'Contact name'}
                </div>
                {step >= 3 && (
                  <div style={{
                    marginTop: 6, padding: '4px 6px', background: 'var(--os-panel)',
                    borderRadius: 4, fontSize: 9, color: 'var(--os-fg-1)',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    ${data.value || '0'}K
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// Content visual — calendar week
const VisualContent = ({ step, data }) => {
  const days = ['M','T','W','T','F','S','S'];
  const channels = data.channels || [];
  const CH = { LinkedIn: 'var(--sky)', Instagram: 'var(--pink)', YouTube: '#EF4444', Email: 'var(--sage)' };
  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
        {days.map((d, i) => (
          <div key={i} style={{
            minHeight: 140, background: 'var(--os-panel)',
            border: '0.5px solid var(--os-border-2)', borderRadius: 8, padding: 6,
            opacity: step >= 0 ? 1 : 0,
            transition: `opacity .35s ${i * 0.04}s var(--ios-ease)`,
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', color: 'var(--os-fg-2)', marginBottom: 6 }}>{d}</div>
            {/* Show channel pills appearing as user picks them */}
            {step >= 1 && i % 2 === 0 && channels[0] && (
              <div style={{
                borderLeft: `2px solid ${CH[channels[0]]}`, background: 'var(--os-surface)',
                borderRadius: 4, padding: '4px 5px', marginBottom: 3,
                animation: 'coach-step-in .35s var(--ios-ease)',
              }}>
                <span style={{ width: 4, height: 4, borderRadius: 999, background: 'var(--accent)', display: 'inline-block', marginRight: 4 }}/>
                <span style={{ fontSize: 9, color: 'var(--os-fg-1)' }}>{channels[0]}</span>
              </div>
            )}
            {step >= 2 && i === 1 && data.cadence >= 2 && channels[1] && (
              <div style={{ borderLeft: `2px solid ${CH[channels[1]]}`, background: 'var(--os-surface)', borderRadius: 4, padding: '4px 5px', marginBottom: 3, animation: 'coach-step-in .35s var(--ios-ease)' }}>
                <span style={{ width: 4, height: 4, borderRadius: 999, background: 'var(--os-fg-3)', display: 'inline-block', marginRight: 4 }}/>
                <span style={{ fontSize: 9, color: 'var(--os-fg-1)' }}>{channels[1]}</span>
              </div>
            )}
            {step >= 3 && i === 2 && data.firstTitle && (
              <div style={{
                borderLeft: `2px solid var(--accent)`, background: 'color-mix(in oklab, var(--accent) 10%, #fff)',
                borderRadius: 4, padding: '5px 6px',
                animation: 'coach-step-in .35s var(--ios-ease)',
              }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--accent)', marginBottom: 2 }}>DRAFT</div>
                <div style={{ fontSize: 10, color: 'var(--os-fg-0)', lineHeight: 1.25 }}>{data.firstTitle.slice(0, 28)}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// Team visual — team cards
const VisualTeam = ({ step, data }) => (
  <div style={{ width: '100%', display: 'grid', gap: 10 }}>
    <div className="icp-card" style={{ '--icp-color': 'var(--accent)', padding: 14, cursor: 'default' }}>
      <div className="icp-head" style={{ marginBottom: 0 }}>
        <div className="av" style={{ background: 'transparent' }}>{(data.name || 'Y')[0]}</div>
        <div>
          <h3 style={{ fontSize: 13 }}>{data.name || 'You'}</h3>
          <div style={{ fontSize: 11, color: 'var(--os-fg-2)' }}>{data.role || 'Founder'}</div>
        </div>
        <span className="status active">FT</span>
      </div>
    </div>
    {step >= 1 && (data.nextRoles || []).filter(Boolean).slice(0, 2).map((r, i) => (
      <div key={i} className="icp-card" style={{
        '--icp-color': i === 0 ? 'var(--sky)' : 'var(--sage)', padding: 14, cursor: 'default',
        animation: 'coach-step-in .4s var(--ios-ease)',
        opacity: 0.85,
        borderStyle: 'dashed',
      }}>
        <div className="icp-head" style={{ marginBottom: 0 }}>
          <div className="av" style={{ background: 'transparent', borderStyle: 'dashed' }}>?</div>
          <div>
            <h3 style={{ fontSize: 13 }}>{r}</h3>
            <div style={{ fontSize: 11, color: 'var(--os-fg-2)' }}>Planned</div>
          </div>
          <span className="status">PLANNED</span>
        </div>
      </div>
    ))}
    {step >= 2 && data.kpiTarget && (
      <div style={{
        padding: 14,
        background: 'linear-gradient(110deg, color-mix(in oklab, var(--accent) 6%, #fff) 0%, #fff 100%)',
        border: '0.5px solid color-mix(in oklab, var(--accent) 22%, transparent)',
        borderRadius: 12,
        animation: 'coach-step-in .4s var(--ios-ease)',
      }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--accent)', fontWeight: 600, marginBottom: 6 }}>KPI for you</div>
        <div style={{ fontSize: 13, color: 'var(--os-fg-0)' }}>{data.kpiTarget}</div>
      </div>
    )}
  </div>
);

// Automation visual — trigger → action card
const VisualAutomation = ({ step, data }) => (
  <div style={{ width: '100%', maxWidth: 360 }}>
    <div style={{
      padding: 16,
      background: 'var(--os-panel)',
      border: '0.5px solid var(--os-border-2)',
      borderRadius: 14,
      transition: 'all .4s var(--ios-ease)',
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--os-fg-2)', marginBottom: 12 }}>Recipe preview</div>

      {/* Trigger */}
      <div style={{
        padding: '11px 13px',
        background: step >= 1 ? 'color-mix(in oklab, var(--sky) 10%, #fff)' : 'var(--os-surface)',
        border: step >= 1 ? '0.5px solid color-mix(in oklab, var(--sky) 32%, transparent)' : '0.5px dashed var(--os-border-2)',
        borderRadius: 10,
        transition: 'all .35s var(--ios-ease)',
      }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: step >= 1 ? 'var(--sky)' : 'var(--os-fg-3)', marginBottom: 4, fontWeight: 600 }}>When ▾</div>
        <div style={{ fontSize: 13, color: step >= 1 ? 'var(--os-fg-0)' : 'var(--os-fg-2)', fontWeight: step >= 1 ? 500 : 400 }}>
          {data.trigger || 'Pick a trigger event…'}
        </div>
      </div>

      {/* Arrow */}
      <div style={{
        textAlign: 'center', padding: '8px 0', color: 'var(--os-fg-3)', fontSize: 14,
        opacity: step >= 1 ? 1 : 0.4,
      }}>↓</div>

      {/* Action */}
      <div style={{
        padding: '11px 13px',
        background: step >= 2 ? 'color-mix(in oklab, var(--sage) 10%, #fff)' : 'var(--os-surface)',
        border: step >= 2 ? '0.5px solid color-mix(in oklab, var(--sage) 32%, transparent)' : '0.5px dashed var(--os-border-2)',
        borderRadius: 10,
        transition: 'all .35s var(--ios-ease)',
      }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: step >= 2 ? 'var(--sage)' : 'var(--os-fg-3)', marginBottom: 4, fontWeight: 600 }}>Do ▾</div>
        <div style={{ fontSize: 13, color: step >= 2 ? 'var(--os-fg-0)' : 'var(--os-fg-2)', fontWeight: step >= 2 ? 500 : 400 }}>
          {data.action || 'Pick what should happen…'}
        </div>
      </div>

      {step >= 3 && (
        <div style={{
          marginTop: 12, padding: '8px 11px',
          background: 'var(--os-ink)', color: 'var(--livv-cream-50)',
          borderRadius: 8, fontSize: 11,
          display: 'flex', alignItems: 'center', gap: 8,
          animation: 'coach-step-in .4s var(--ios-ease)',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--ok)', boxShadow: '0 0 6px var(--ok)' }}/>
          Active · ready to run
        </div>
      )}
    </div>
  </div>
);

// Partner card — builds up as user picks type, commission, name
const VisualPartner = ({ step, data }) => {
  const color = data.color || 'var(--accent)';
  const initials = (data.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  return (
    <div style={{ width: '100%', maxWidth: 320, position: 'relative' }}>
      <div className="icp-card" style={{ '--icp-color': color, padding: 22, cursor: 'default', transition: 'transform .5s var(--spring)' }}>
        <div className="icp-head" style={{ marginBottom: 14 }}>
          <div className="av" style={{ background: 'transparent', color: 'inherit' }}>{initials}</div>
          <div>
            <h3 style={{ fontSize: 14 }}>{data.name || 'New partner'}</h3>
            <div style={{ fontSize: 11.5, color: 'var(--os-fg-2)', marginTop: 2 }}>{data.company || 'Company'}</div>
          </div>
          <span className="status active" style={{ marginLeft: 'auto', opacity: step >= 0 ? 1 : 0 }}>
            {data.type || 'INVITED'}
          </span>
        </div>
        {step >= 1 && data.type && (
          <div style={{ animation: 'coach-step-in .4s var(--ios-ease)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--os-fg-2)', marginBottom: 8 }}>Commission</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
              <div style={{ padding: 10, background: 'var(--os-surface)', borderRadius: 8, border: '0.5px solid var(--os-border)' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--os-fg-2)' }}>% impl</div>
                <div style={{ fontSize: 17, fontWeight: 300, color: 'var(--os-fg-0)', letterSpacing: '-0.02em', marginTop: 2 }}>{data.impl || '—'}</div>
              </div>
              <div style={{ padding: 10, background: 'var(--os-surface)', borderRadius: 8, border: '0.5px solid var(--os-border)' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--os-fg-2)' }}>% mrr</div>
                <div style={{ fontSize: 17, fontWeight: 300, color: 'var(--os-fg-0)', letterSpacing: '-0.02em', marginTop: 2 }}>{data.mrr || '—'}</div>
              </div>
            </div>
          </div>
        )}
        {step >= 2 && data.code && (
          <div style={{ paddingTop: 12, borderTop: '1px dashed rgba(90,62,62,0.14)', animation: 'coach-step-in .4s var(--ios-ease)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--os-fg-2)', marginBottom: 6 }}>Referral link</div>
            <div style={{ padding: '7px 9px', background: 'var(--os-ink)', color: 'var(--accent-bright)', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.02em' }}>
              livvvv.com/r/{data.code.toLowerCase()}
            </div>
          </div>
        )}
        {step >= 3 && data.widget && (
          <div style={{ paddingTop: 12, marginTop: 12, borderTop: '1px dashed rgba(90,62,62,0.14)', animation: 'coach-step-in .4s var(--ios-ease)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--os-fg-2)', marginBottom: 6 }}>Widget · {data.widget}</div>
            <div style={{
              padding: '14px 12px',
              background: `linear-gradient(135deg, ${color} 0%, var(--os-ink) 100%)`,
              color: '#fff', borderRadius: 8, textAlign: 'center',
              fontSize: 11.5, fontWeight: 500,
            }}>
              Powered by LIVV
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const VisualDashboard = ({ step, data }) => (
  <div style={{ width: '100%' }}>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {[
        { l: 'MRR Total', v: data.mrr || '—', shown: step >= 1 },
        { l: 'Retainer clients', v: data.clients || '—', shown: step >= 2 },
        { l: 'Pipeline value', v: data.pipeline || '—', shown: step >= 3 },
        { l: 'Content / week', v: data.content || '—', shown: step >= 4 },
      ].map((k, i) => (
        <div key={i} style={{
          padding: 14, background: 'var(--os-panel)',
          border: '0.5px solid var(--os-border-2)', borderRadius: 12,
          opacity: k.shown ? 1 : 0.4,
          filter: k.shown ? 'none' : 'blur(1.5px)',
          transition: 'all .35s var(--ios-ease)',
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--os-fg-2)', marginBottom: 8 }}>{k.l}</div>
          <div style={{ fontSize: 22, fontWeight: 300, color: 'var(--os-fg-0)', letterSpacing: '-0.02em' }}>{k.v}</div>
        </div>
      ))}
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// Per-tab flow definitions
// ─────────────────────────────────────────────────────────────
const FLOWS = {
  // STRATEGY → ICPs
  'strategy:icps': {
    visual: 'icp',
    tag: 'Define your first ICP',
    steps: [
      {
        title: <>Start with <span className="accent">who you sell to</span></>,
        desc: <>An ICP is a sharp answer to the question "who do we serve best?". Most teams skip this — and then nothing else lines up. Pick the first one with intention.</>,
        why: 'The ICP is the seed for everything: pricing, content angles, outreach messaging, hiring. Without it, your AI is guessing.',
        fields: ({ data, set }) => (
          <div className="coach-form">
            <div className="coach-field">
              <span className="coach-field-label">ICP name</span>
              <input className="coach-input" placeholder="e.g. Boutique creative agencies" value={data.name || ''} onChange={e => set('name', e.target.value)}/>
            </div>
            <div className="coach-field">
              <span className="coach-field-label">3-letter short code</span>
              <input className="coach-input" maxLength={3} style={{ width: 100, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase' }} placeholder="AGY" value={data.short || ''} onChange={e => set('short', e.target.value.toUpperCase())}/>
            </div>
            <div className="coach-suggest">
              <span className="coach-suggest-chip" onClick={() => { set('name', 'Boutique agencies'); set('short', 'AGY'); }}>Boutique agencies</span>
              <span className="coach-suggest-chip" onClick={() => { set('name', 'Independent consultants'); set('short', 'CON'); }}>Independent consultants</span>
              <span className="coach-suggest-chip" onClick={() => { set('name', 'SaaS founders'); set('short', 'SAS'); }}>SaaS founders</span>
            </div>
          </div>
        ),
        canNext: d => d.name && d.short,
      },
      {
        title: <>Pick a <span className="accent">color</span> and a status</>,
        desc: <>Colors aren't decoration — they let you spot ICP patterns across leads, content and KPIs in seconds. Status tells the system whether this ICP is in production or still in test.</>,
        why: 'The color you pick becomes the accent on every lead card, every content piece and every cohort chart for this ICP across LIVV.',
        fields: ({ data, set }) => (
          <div className="coach-form">
            <div className="coach-field">
              <span className="coach-field-label">Accent color</span>
              <div className="coach-choices">
                {[
                  { v: '#C4A35A', n: 'Gold' },
                  { v: '#6DBEDC', n: 'Sky' },
                  { v: '#769268', n: 'Sage' },
                  { v: '#F1ADD8', n: 'Pink' },
                  { v: '#A855F7', n: 'Lavender' },
                  { v: '#2C0405', n: 'Wine' },
                ].map(c => (
                  <button key={c.v} className={`coach-choice ${data.color === c.v ? 'sel' : ''}`} onClick={() => set('color', c.v)}>
                    <span className="sw" style={{ background: c.v }}/>
                    {c.n}
                  </button>
                ))}
              </div>
            </div>
            <div className="coach-field">
              <span className="coach-field-label">Status</span>
              <div className="coach-choices">
                {['active', 'testing', 'deprecated'].map(s => (
                  <button key={s} className={`coach-choice ${data.status === s ? 'sel' : ''}`} onClick={() => set('status', s)}>{s}</button>
                ))}
              </div>
            </div>
          </div>
        ),
        canNext: d => d.color && d.status,
      },
      {
        title: <>Name <span className="accent">3 pains</span> they wake up with</>,
        desc: <>Write them in the words your prospect uses on a discovery call. Not features, not buzzwords — actual sentences. These will fuel outreach, content angles, and AI summaries downstream.</>,
        why: 'When AI drafts your next cold email or case study, it pulls directly from this list. Vague pains = vague messaging.',
        fields: ({ data, set }) => {
          const pains = data.pains || ['', '', ''];
          const update = (i, v) => { const next = [...pains]; next[i] = v; set('pains', next); };
          return (
            <div className="coach-bullets">
              {pains.map((p, i) => (
                <div key={i} className="coach-bullet">
                  <input placeholder={`Pain ${i + 1} — e.g. "I'm the bottleneck on every proposal"`} value={p} onChange={e => update(i, e.target.value)}/>
                  <button className="rm" onClick={() => set('pains', pains.filter((_, j) => j !== i))}>
                    <OS_ICON name="close" size={12} stroke={2}/>
                  </button>
                </div>
              ))}
              <button className="coach-add-bullet" onClick={() => set('pains', [...pains, ''])}>
                <OS_ICON name="plus" size={12}/>Add pain
              </button>
            </div>
          );
        },
        canNext: d => (d.pains || []).filter(Boolean).length >= 2,
      },
      {
        title: <>Sketch the <span className="accent">expansion path</span></>,
        desc: <>What's the first module you sell? Then where do they grow with you? Most accounts double in revenue once you map this — because every module sale has a clear next.</>,
        why: 'LIVV uses this path to recommend the next package to upsell to every active client in this ICP. The system pings you when an account is ready.',
        fields: ({ data, set }) => {
          const all = ['Sales', 'Content', 'Finance', 'Scaling', 'Strategy', 'Toolkit'];
          const path = data.path || [];
          const toggle = (m) => {
            const next = path.includes(m) ? path.filter(x => x !== m) : [...path, m];
            set('path', next);
          };
          return (
            <div className="coach-form">
              <div className="coach-field">
                <span className="coach-field-label">Pick in order (click to add)</span>
                <div className="coach-choices">
                  {all.map(m => (
                    <button key={m} className={`coach-choice ${path.includes(m) ? 'sel' : ''}`} onClick={() => toggle(m)}>
                      {path.includes(m) && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, opacity: 0.7 }}>{path.indexOf(m) + 1}.</span>}
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        },
        canNext: d => (d.path || []).length >= 2,
      },
      {
        title: <>Set <span className="accent">pricing</span> — implementation + retainer</>,
        desc: <>Two numbers: what you charge to land them, and what you charge monthly to keep them. Don't overthink this — you'll refine after your first 3 deals.</>,
        why: 'These set the deal-value defaults whenever a new lead in this ICP enters the pipeline. They also feed the revenue forecast in Growth → Metrics.',
        fields: ({ data, set }) => (
          <div className="coach-form" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="coach-field">
              <span className="coach-field-label">Implementation</span>
              <input className="coach-input" placeholder="$18,000" value={data.impl || ''} onChange={e => set('impl', e.target.value)}/>
              <div className="coach-suggest" style={{ marginTop: 4 }}>
                <span className="coach-suggest-chip" onClick={() => set('impl', '$12K')}>$12K</span>
                <span className="coach-suggest-chip" onClick={() => set('impl', '$18K')}>$18K</span>
                <span className="coach-suggest-chip" onClick={() => set('impl', '$28K')}>$28K</span>
              </div>
            </div>
            <div className="coach-field">
              <span className="coach-field-label">Monthly retainer</span>
              <input className="coach-input" placeholder="$4,800" value={data.mrr || ''} onChange={e => set('mrr', e.target.value)}/>
              <div className="coach-suggest" style={{ marginTop: 4 }}>
                <span className="coach-suggest-chip" onClick={() => set('mrr', '$3.5K')}>$3.5K</span>
                <span className="coach-suggest-chip" onClick={() => set('mrr', '$5.5K')}>$5.5K</span>
                <span className="coach-suggest-chip" onClick={() => set('mrr', '$7.5K')}>$7.5K</span>
              </div>
            </div>
            <div className="coach-field" style={{ gridColumn: '1 / -1' }}>
              {/* Mirror to ticket for the visual */}
              <span style={{ display: 'none' }}>{(() => { const t = `${data.impl || '—'} + ${data.mrr || '—'}/mo`; if (data.ticket !== t) set('ticket', t); return ''; })()}</span>
            </div>
          </div>
        ),
        canNext: d => d.impl && d.mrr,
      },
    ],
  },

  // GROWTH → Sales
  'growth:sales': {
    visual: 'sales',
    tag: 'Set up your sales pipeline',
    steps: [
      {
        title: <>Confirm your <span className="accent">deal flow</span></>,
        desc: <>The default 7 columns (New → Won/Lost) work for most agencies and SaaS shops. If your sales cycle is different, you can rename columns later, but start here.</>,
        why: 'Every column is a question: "what has to be true to move forward?". When the AI nudges you for follow-ups, it uses these stages as anchors.',
        fields: () => (
          <div className="coach-form">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {['New', 'Contacted', 'Call Scheduled', 'Call Done', 'Proposal', 'Negotiating', 'Won', 'Lost'].map((s, i) => (
                <span key={i} style={{
                  padding: '5px 11px', background: 'var(--os-surface)',
                  border: '0.5px solid var(--os-border)', borderRadius: 999,
                  fontSize: 12, color: 'var(--os-fg-1)',
                  fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
                }}>{i + 1}. {s}</span>
              ))}
            </div>
            <button className="coach-add-bullet">
              <OS_ICON name="cog" size={12}/>Customize stages
            </button>
          </div>
        ),
        canNext: () => true,
      },
      {
        title: <>Who <span className="accent">owns</span> the pipeline?</>,
        desc: <>Pick yourself or a teammate as the default deal owner. If multiple people sell, you'll assign per-lead later — this just sets the fallback.</>,
        why: 'Owner = who gets the notification when a deal stalls past its expected stage age, and whose KPIs roll up the win rate.',
        fields: ({ data, set }) => (
          <div className="coach-form">
            <div className="coach-field">
              <span className="coach-field-label">Default owner</span>
              <div className="coach-choices">
                {['Eneas', 'Lucía', 'Add new'].map(p => (
                  <button key={p} className={`coach-choice ${data.owner === p ? 'sel' : ''}`} onClick={() => set('owner', p)}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ),
        canNext: d => !!d.owner,
      },
      {
        title: <>Add your <span className="accent">first real lead</span></>,
        desc: <>Pick someone you've already talked to or want to. The shape matters more than perfection: company, contact, and which ICP they fit.</>,
        why: 'Once one lead is in, automations kick in: stage age tracking, follow-up reminders, AI outreach drafts, and case-study generation when they win.',
        fields: ({ data, set }) => (
          <div className="coach-form" style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 12 }}>
            <div className="coach-field">
              <span className="coach-field-label">Company</span>
              <input className="coach-input" placeholder="Mulberry Group" value={data.company || ''} onChange={e => set('company', e.target.value)}/>
            </div>
            <div className="coach-field">
              <span className="coach-field-label">Contact</span>
              <input className="coach-input" placeholder="Camila Ortíz" value={data.contact || ''} onChange={e => set('contact', e.target.value)}/>
            </div>
            <div className="coach-field" style={{ gridColumn: '1 / -1' }}>
              <span className="coach-field-label">ICP match</span>
              <div className="coach-choices">
                {[
                  { id: 'agency', label: 'Agencies', c: '#C4A35A' },
                  { id: 'consult', label: 'Consultants', c: '#6DBEDC' },
                  { id: 'product', label: 'SaaS', c: '#769268' },
                  { id: 'ecom', label: 'E-com', c: '#A855F7' },
                ].map(i => (
                  <button key={i.id} className={`coach-choice ${data.icp === i.id ? 'sel' : ''}`} onClick={() => { set('icp', i.id); set('icp_color', i.c); }}>
                    <span className="sw" style={{ background: i.c }}/>
                    {i.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ),
        canNext: d => d.company && d.contact && d.icp,
      },
      {
        title: <>What's the <span className="accent">next move</span>?</>,
        desc: <>One concrete action with a date. "Send Loom" is good. "Follow up sometime" is not. Specificity is what turns pipeline into revenue.</>,
        why: 'This single field powers the "today\'s actions" digest, the Activity Feed nudges, and the AI advisor when it surfaces "what to do next" on the home.',
        fields: ({ data, set }) => (
          <div className="coach-form">
            <div className="coach-field">
              <span className="coach-field-label">Next action</span>
              <input className="coach-input" placeholder="Send intro DM mentioning Aire Aroma rebrand" value={data.next || ''} onChange={e => set('next', e.target.value)}/>
            </div>
            <div className="coach-field">
              <span className="coach-field-label">Estimated deal value</span>
              <input className="coach-input" placeholder="22" style={{ width: 140 }} value={data.value || ''} onChange={e => set('value', e.target.value.replace(/[^0-9.]/g, ''))}/>
              <div style={{ fontSize: 11, color: 'var(--os-fg-2)' }}>Implementation value in $K (you'll add MRR on the lead detail page).</div>
            </div>
          </div>
        ),
        canNext: d => d.next && d.value,
      },
    ],
  },

  // CONTENT → Calendar
  'content:calendar': {
    visual: 'content',
    tag: 'Build your content engine',
    steps: [
      {
        title: <>Pick your <span className="accent">channels</span></>,
        desc: <>Where does your audience actually show up? Pick 2–3 — not 6. Discipline on fewer channels beats sloppy effort on many.</>,
        why: 'Each channel gets its own publishing cadence target, content templates, and compliance tracker. Fewer channels means clearer feedback loops.',
        fields: ({ data, set }) => {
          const channels = data.channels || [];
          const toggle = (c) => set('channels', channels.includes(c) ? channels.filter(x => x !== c) : [...channels, c]);
          return (
            <div className="coach-form">
              <div className="coach-choices">
                {[
                  { v: 'LinkedIn', c: 'var(--sky)' },
                  { v: 'Instagram', c: 'var(--pink)' },
                  { v: 'YouTube', c: '#EF4444' },
                  { v: 'Email', c: 'var(--sage)' },
                  { v: 'X / Twitter', c: 'var(--os-fg-1)' },
                ].map(c => (
                  <button key={c.v} className={`coach-choice ${channels.includes(c.v) ? 'sel' : ''}`} onClick={() => toggle(c.v)}>
                    <span className="sw" style={{ background: c.c }}/>
                    {c.v}
                  </button>
                ))}
              </div>
            </div>
          );
        },
        canNext: d => (d.channels || []).length >= 1,
      },
      {
        title: <>How <span className="accent">often</span> can you commit?</>,
        desc: <>Cadence is the system's promise. Pick a number you'll hit on a bad week, not a heroic one. We track compliance against this.</>,
        why: 'When you miss target, LIVV flags it red on the Performance tab and prompts ideas. When you hit it for 3 weeks running, it auto-suggests doubling.',
        fields: ({ data, set }) => (
          <div className="coach-form">
            <div className="coach-field">
              <span className="coach-field-label">Posts per week</span>
              <div className="coach-choices">
                {[1, 2, 3, 5, 7].map(n => (
                  <button key={n} className={`coach-choice ${data.cadence === n ? 'sel' : ''}`} onClick={() => set('cadence', n)}>
                    {n} / wk
                  </button>
                ))}
              </div>
            </div>
          </div>
        ),
        canNext: d => !!d.cadence,
      },
      {
        title: <>Draft your <span className="accent">first piece</span></>,
        desc: <>Just the title and the angle. Don't write the post yet — we drop you into the editor after. Start with an idea you've already had this week.</>,
        why: 'The moment one piece exists, every downstream automation activates: scheduling, performance pull after 48h, repurpose suggestions.',
        fields: ({ data, set }) => (
          <div className="coach-form">
            <div className="coach-field">
              <span className="coach-field-label">Working title</span>
              <input className="coach-input" placeholder="Why agencies miss their content cadence" value={data.firstTitle || ''} onChange={e => set('firstTitle', e.target.value)}/>
            </div>
            <div className="coach-field">
              <span className="coach-field-label">Angle in one sentence</span>
              <input className="coach-input" placeholder="The bottleneck isn't talent — it's missing systems." value={data.angle || ''} onChange={e => set('angle', e.target.value)}/>
            </div>
          </div>
        ),
        canNext: d => d.firstTitle,
      },
    ],
  },

  // SCALING → Team
  'scaling:team': {
    visual: 'team',
    tag: 'Map your team',
    steps: [
      {
        title: <>Start with <span className="accent">you</span></>,
        desc: <>Even if it's just you today, the founder card is the anchor. Add yourself with the role you actually play right now — not the title on LinkedIn.</>,
        why: 'You\'re the first KPI owner. The system uses this card to track your weekly load and warn when you\'re bottlenecking your own business.',
        fields: ({ data, set }) => (
          <div className="coach-form">
            <div className="coach-field">
              <span className="coach-field-label">Your name</span>
              <input className="coach-input" placeholder="Eneas" value={data.name || ''} onChange={e => set('name', e.target.value)}/>
            </div>
            <div className="coach-field">
              <span className="coach-field-label">Your actual role</span>
              <input className="coach-input" placeholder="Founder · Sales · Strategy" value={data.role || ''} onChange={e => set('role', e.target.value)}/>
            </div>
          </div>
        ),
        canNext: d => d.name && d.role,
      },
      {
        title: <>What's the <span className="accent">next hire</span>?</>,
        desc: <>Pick 1–3 roles you'd love to bring on in the next 12 months. They don't need to be funded — defining them surfaces what's missing in your operation.</>,
        why: 'These become entries in the Roles tab and bars on the hiring Roadmap. The cost projection updates automatically as you draft.',
        fields: ({ data, set }) => {
          const roles = data.nextRoles || ['', ''];
          const update = (i, v) => { const n = [...roles]; n[i] = v; set('nextRoles', n); };
          return (
            <div className="coach-form">
              <div className="coach-bullets">
                {roles.map((r, i) => (
                  <div key={i} className="coach-bullet">
                    <input placeholder={i === 0 ? 'Senior Strategist' : 'Content Producer'} value={r} onChange={e => update(i, e.target.value)}/>
                    <button className="rm" onClick={() => set('nextRoles', roles.filter((_, j) => j !== i))}>
                      <OS_ICON name="close" size={12} stroke={2}/>
                    </button>
                  </div>
                ))}
                <button className="coach-add-bullet" onClick={() => set('nextRoles', [...roles, ''])}>
                  <OS_ICON name="plus" size={12}/>Add role
                </button>
              </div>
              <div className="coach-suggest">
                {['Senior Strategist', 'Content Producer', 'Designer', 'Ops & Finance', 'BD Advisor'].map(r => (
                  <span key={r} className="coach-suggest-chip" onClick={() => set('nextRoles', [...roles.filter(Boolean), r])}>{r}</span>
                ))}
              </div>
            </div>
          );
        },
        canNext: d => (d.nextRoles || []).filter(Boolean).length >= 1,
      },
      {
        title: <>Pick <span className="accent">one KPI</span> to track this week</>,
        desc: <>Don't try to track 15 metrics. Pick one — the one that, if it moves, signals you're winning. Add more after week 2.</>,
        why: 'This becomes your first row in the KPI table. Every Friday LIVV asks you to log the number. Trend lines start forming after 4 weeks.',
        fields: ({ data, set }) => (
          <div className="coach-form">
            <div className="coach-field">
              <span className="coach-field-label">KPI for you</span>
              <input className="coach-input" placeholder="MRR closed this week" value={data.kpiTarget || ''} onChange={e => set('kpiTarget', e.target.value)}/>
              <div className="coach-suggest" style={{ marginTop: 4 }}>
                {['MRR closed', 'Outreach sent', 'Content published', 'Calls held', 'Proposals out'].map(k => (
                  <span key={k} className="coach-suggest-chip" onClick={() => set('kpiTarget', `${k} this week`)}>{k}</span>
                ))}
              </div>
            </div>
          </div>
        ),
        canNext: d => !!d.kpiTarget,
      },
    ],
  },

  // TOOLKIT → Automations
  'toolkit:automations': {
    visual: 'automation',
    tag: 'Configure your first automation',
    steps: [
      {
        title: <>Pick a <span className="accent">recipe</span> to start</>,
        desc: <>Six automations cover ~80% of the moves you do by hand every week. Start with the one that hurts most — usually case-study creation or won-to-project handoff.</>,
        why: 'Automations are LIVV\'s real superpower: they connect modules without you copying-pasting. One toggle replaces 15 minutes of work, repeatedly.',
        fields: ({ data, set }) => (
          <div className="coach-form">
            <div className="coach-choices" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              {[
                { id: 'won', label: 'When a lead is Won → create project + invoice' },
                { id: 'project', label: 'When a project is completed → draft case study' },
                { id: 'call', label: 'When a call is recorded → extract action items' },
                { id: 'published', label: 'When content is published → pull metrics in 48h' },
                { id: 'sunday', label: 'Every Sunday → auto-generate weekly snapshot' },
              ].map(r => (
                <button key={r.id} className={`coach-choice ${data.recipe === r.id ? 'sel' : ''}`} style={{ justifyContent: 'flex-start' }} onClick={() => { set('recipe', r.id); set('trigger', r.label.split(' → ')[0].replace('When ', '')); set('action', r.label.split(' → ')[1]); }}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        ),
        canNext: d => !!d.recipe,
      },
      {
        title: <>Confirm the <span className="accent">trigger</span></>,
        desc: <>The trigger is the event in one module that fires the automation. You can keep the default or tighten it (e.g. only for certain ICPs).</>,
        why: 'A clean trigger means no false positives. If you fire too often, the system stops being a tool and starts being noise.',
        fields: ({ data, set }) => (
          <div className="coach-form">
            <div className="coach-field">
              <span className="coach-field-label">Trigger</span>
              <input className="coach-input" value={data.trigger || ''} onChange={e => set('trigger', e.target.value)}/>
            </div>
            <div className="coach-field">
              <span className="coach-field-label">Filter (optional)</span>
              <div className="coach-choices">
                {['All ICPs', 'Agency only', 'Consultant only', 'Deals > $20K'].map(f => (
                  <button key={f} className={`coach-choice ${data.filter === f ? 'sel' : ''}`} onClick={() => set('filter', f)}>{f}</button>
                ))}
              </div>
            </div>
          </div>
        ),
        canNext: d => !!d.trigger,
      },
      {
        title: <>Confirm the <span className="accent">action</span></>,
        desc: <>What should the system do automatically? You can layer multiple actions later — for now, pick one and watch it run for a week.</>,
        why: 'Most users keep automations on once they confirm they work. The action card on the right tells you when the system is ready to fire.',
        fields: ({ data, set }) => (
          <div className="coach-form">
            <div className="coach-field">
              <span className="coach-field-label">Action</span>
              <input className="coach-input" value={data.action || ''} onChange={e => set('action', e.target.value)}/>
            </div>
            <div className="coach-field">
              <span className="coach-field-label">Notify me when it runs?</span>
              <div className="coach-choices">
                {['Always', 'Only on errors', 'Never'].map(n => (
                  <button key={n} className={`coach-choice ${data.notify === n ? 'sel' : ''}`} onClick={() => set('notify', n)}>{n}</button>
                ))}
              </div>
            </div>
          </div>
        ),
        canNext: d => !!d.action && !!d.notify,
      },
    ],
  },

  // STRATEGY → Packages
  'strategy:packages': {
    visual: 'package',
    tag: 'Productize your first offer',
    steps: [
      {
        title: <>Name a <span className="accent">repeatable offer</span></>,
        desc: <>Stop selling consulting hours. Pick one specific outcome you've delivered before, give it a name, and decide who it's for. That's the seed of every package.</>,
        why: 'A productized package gives buyers permission to skip the "what do you do?" conversation. It also makes your AI advisor smarter — every lead now has a default package to map to.',
        fields: ({ data, set }) => {
          const icps = [
            { id: 'Agencies', c: '#C4A35A' },
            { id: 'Consultants', c: '#6DBEDC' },
            { id: 'SaaS', c: '#769268' },
            { id: 'E-com', c: '#A855F7' },
            { id: 'Retainer', c: '#F1ADD8' },
          ];
          return (
            <div className="coach-form">
              <div className="coach-field">
                <span className="coach-field-label">Package name</span>
                <input className="coach-input" placeholder="Agency OS · 6-week deploy" value={data.name || ''} onChange={e => set('name', e.target.value)}/>
              </div>
              <div className="coach-field">
                <span className="coach-field-label">ICP target</span>
                <div className="coach-choices">
                  {icps.map(i => (
                    <button key={i.id} className={`coach-choice ${data.icp === i.id ? 'sel' : ''}`} onClick={() => { set('icp', i.id); set('icpColor', i.c); }}>
                      <span className="sw" style={{ background: i.c }}/>{i.id}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        },
        canNext: d => d.name && d.icp,
      },
      {
        title: <>Stack the <span className="accent">modules</span> included</>,
        desc: <>Which of your service modules ships inside this package? More isn't better — focused packages convert higher than "everything plus the kitchen sink."</>,
        why: 'The module mix decides what your team has to deliver every time this package sells. Get it right now and you avoid scope creep on the first 10 deals.',
        fields: ({ data, set }) => {
          const all = ['Strategy', 'Sales', 'Content', 'Scaling', 'Toolkit'];
          const mods = data.mods || [];
          const toggle = (m) => set('mods', mods.includes(m) ? mods.filter(x => x !== m) : [...mods, m]);
          return (
            <div className="coach-form">
              <div className="coach-choices">
                {all.map(m => (
                  <button key={m} className={`coach-choice ${mods.includes(m) ? 'sel' : ''}`} onClick={() => toggle(m)}>{m}</button>
                ))}
              </div>
            </div>
          );
        },
        canNext: d => (d.mods || []).length >= 1,
      },
      {
        title: <>Set <span className="accent">pricing</span> + sprint length</>,
        desc: <>Two prices and one duration. Implementation is the one-time fee to land them; monthly is the retainer to keep them. Sprint length is how long the deploy takes.</>,
        why: 'Pricing IS positioning. Underprice and you attract operators who don\'t value time. Overprice with no clear deliverable and they ghost. Pick anchors you can defend in week one.',
        fields: ({ data, set }) => (
          <div className="coach-form" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="coach-field">
              <span className="coach-field-label">Implementation</span>
              <input className="coach-input" placeholder="$24K" value={data.impl || ''} onChange={e => set('impl', e.target.value)}/>
            </div>
            <div className="coach-field">
              <span className="coach-field-label">Monthly</span>
              <input className="coach-input" placeholder="$5.6K" value={data.mrr || ''} onChange={e => set('mrr', e.target.value)}/>
            </div>
            <div className="coach-field">
              <span className="coach-field-label">Weeks</span>
              <input className="coach-input" type="number" placeholder="6" value={data.weeks || ''} onChange={e => set('weeks', e.target.value)}/>
            </div>
          </div>
        ),
        canNext: d => d.impl && d.mrr,
      },
      {
        title: <>List the <span className="accent">deliverables</span></>,
        desc: <>3–5 concrete things you hand over by the end. Not adjectives ("aligned brand") — nouns and verbs ("brand kit Figma file, 90-day content calendar, weekly KPI review").</>,
        why: 'When deals stall mid-sprint, this list is what you and your client both look at to confirm progress. Vague deliverables = endless rework.',
        fields: ({ data, set }) => {
          const dlv = data.deliverables || ['', '', ''];
          const update = (i, v) => { const n = [...dlv]; n[i] = v; set('deliverables', n); };
          return (
            <div className="coach-bullets">
              {dlv.map((d, i) => (
                <div key={i} className="coach-bullet">
                  <input placeholder={i === 0 ? 'Discovery + ICP workshop' : i === 1 ? '90-day content calendar' : 'Weekly KPI review · first 30d'} value={d} onChange={e => update(i, e.target.value)}/>
                  <button className="rm" onClick={() => set('deliverables', dlv.filter((_, j) => j !== i))}><OS_ICON name="close" size={12} stroke={2}/></button>
                </div>
              ))}
              <button className="coach-add-bullet" onClick={() => set('deliverables', [...dlv, ''])}><OS_ICON name="plus" size={12}/>Add deliverable</button>
            </div>
          );
        },
        canNext: d => (d.deliverables || []).filter(Boolean).length >= 2,
      },
    ],
  },

  // STRATEGY → Positioning
  'strategy:positioning': {
    visual: 'principle',
    tag: 'Set your first principle',
    steps: [
      {
        title: <>Name the <span className="accent">belief</span></>,
        desc: <>A principle is a sentence your future self can quote on a discovery call. It guides every output of LIVV — content angles, sales pitches, hire decisions. Start with the one belief you'd defend in a debate.</>,
        why: 'Principles are the layer your AI references when drafting any external-facing output. Get one strong principle in, and every email, post and proposal inherits its voice.',
        fields: ({ data, set }) => (
          <div className="coach-form">
            <div className="coach-field">
              <span className="coach-field-label">Title</span>
              <input className="coach-input" placeholder="The system, not the brand" value={data.title || ''} onChange={e => set('title', e.target.value)}/>
            </div>
            <div className="coach-field">
              <span className="coach-field-label">Description (1–2 sentences)</span>
              <textarea className="notes" style={{ minHeight: 80 }} placeholder="We sell operating systems for service businesses, not visual identity..." value={data.desc || ''} onChange={e => set('desc', e.target.value)}/>
            </div>
            <div className="coach-suggest">
              {['The system, not the brand', 'Outcome-first, not process-first', 'Built for operators, not vendors', 'Repeatability beats heroics'].map(s => (
                <span key={s} className="coach-suggest-chip" onClick={() => set('title', s)}>{s}</span>
              ))}
            </div>
          </div>
        ),
        canNext: d => d.title && d.desc && d.desc.length > 20,
      },
      {
        title: <>Place it on the <span className="accent">map</span></>,
        desc: <>Two axes: Internal–External (who hears it most) and Tactical–Strategic (how high-level it is). Drop the dot where this principle lives — your compass on Positioning will plot it visually.</>,
        why: 'When you have 6+ principles, the map keeps them from clustering. Spread principles across quadrants and you cover both the tactical and the strategic layer of every conversation.',
        fields: ({ data, set }) => (
          <div className="coach-form">
            <div className="coach-field">
              <span className="coach-field-label">Audience (left ←→ right)</span>
              <div className="coach-choices">
                {[
                  { l: 'Internal team', v: 0.15 },
                  { l: 'Mixed', v: 0.5 },
                  { l: 'External buyers', v: 0.85 },
                ].map(c => (
                  <button key={c.l} className={`coach-choice ${data.axisX === c.v ? 'sel' : ''}`} onClick={() => set('axisX', c.v)}>{c.l}</button>
                ))}
              </div>
            </div>
            <div className="coach-field">
              <span className="coach-field-label">Altitude (bottom ↑ top)</span>
              <div className="coach-choices">
                {[
                  { l: 'Tactical / day-to-day', v: 0.15 },
                  { l: 'Operational', v: 0.5 },
                  { l: 'Strategic / quarterly', v: 0.85 },
                ].map(c => (
                  <button key={c.l} className={`coach-choice ${data.axisY === c.v ? 'sel' : ''}`} onClick={() => set('axisY', c.v)}>{c.l}</button>
                ))}
              </div>
            </div>
          </div>
        ),
        canNext: d => d.axisX != null && d.axisY != null,
      },
      {
        title: <>Tag <span className="accent">where it applies</span></>,
        desc: <>Which downstream channels should reference this principle? Tagging is what makes the system actually use it — untagged principles sit in a library nobody reads.</>,
        why: 'When AI drafts content tagged "Content + Sales", this principle gets injected as a constraint. Tagged narrowly = focused output. Tagged broadly = it shapes everything.',
        fields: ({ data, set }) => {
          const all = [
            { id: 'Content', c: '#F1ADD8' },
            { id: 'Sales', c: '#C4A35A' },
            { id: 'Delivery', c: '#769268' },
          ];
          const tags = data.tags || [];
          const toggle = (t) => {
            const next = tags.includes(t) ? tags.filter(x => x !== t) : [...tags, t];
            set('tags', next);
            set('tagColor', all.find(a => a.id === next[0])?.c || 'var(--accent)');
          };
          return (
            <div className="coach-form">
              <div className="coach-choices">
                {all.map(a => (
                  <button key={a.id} className={`coach-choice ${tags.includes(a.id) ? 'sel' : ''}`} onClick={() => toggle(a.id)}>
                    <span className="sw" style={{ background: a.c }}/>{a.id}
                  </button>
                ))}
              </div>
            </div>
          );
        },
        canNext: d => (d.tags || []).length >= 1,
      },
    ],
  },

  // CONTENT → Brands
  'content:brands': {
    visual: 'brand',
    tag: 'Configure your first brand kit',
    steps: [
      {
        title: <>Name the <span className="accent">brand</span> + palette</>,
        desc: <>Start with your own brand or a client's. Pick a name, an industry, and three core colors. These three colors become the default palette every output borrows from.</>,
        why: 'The brand kit is the seed for every Studio generation. Get the palette right and every post, ad and carrusel auto-inherits it — no manual styling forever.',
        fields: ({ data, set }) => (
          <div className="coach-form">
            <div className="coach-field">
              <span className="coach-field-label">Brand name</span>
              <input className="coach-input" placeholder="Mulberry Group" value={data.name || ''} onChange={e => set('name', e.target.value)}/>
            </div>
            <div className="coach-field">
              <span className="coach-field-label">Industry</span>
              <input className="coach-input" placeholder="Creative agency" value={data.industry || ''} onChange={e => set('industry', e.target.value)}/>
            </div>
            <div className="coach-field">
              <span className="coach-field-label">Palette presets · click to apply</span>
              <div className="coach-choices">
                {[
                  { n: 'Wine + gold',  p: ['#C4A35A','#2C0405','#FDFBF7'] },
                  { n: 'Warm earth',    p: ['#8B5A2B','#F5E6D3','#3D2817'] },
                  { n: 'Sage clean',    p: ['#769268','#E8EFE5','#1F2D1A'] },
                  { n: 'Pink playful',  p: ['#F1ADD8','#FBF2EC','#23150E'] },
                ].map(o => (
                  <button key={o.n} className={`coach-choice ${data.palette && data.palette[0] === o.p[0] ? 'sel' : ''}`} onClick={() => set('palette', o.p)}>
                    <span className="sw" style={{ background: `linear-gradient(135deg, ${o.p[0]}, ${o.p[1]}, ${o.p[2]})` }}/>{o.n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ),
        canNext: d => d.name && d.industry && d.palette,
      },
      {
        title: <>Pick your <span className="accent">type system</span></>,
        desc: <>One font for headings, one for body. Editorial pairings work better than two sans-serifs. Don't agonize — you can swap later.</>,
        why: 'Type is half the brand. The AI uses these font names to render previews accurately, and your humans use them as the actual production type.',
        fields: ({ data, set }) => (
          <div className="coach-form">
            <div className="coach-field">
              <span className="coach-field-label">Heading font</span>
              <div className="coach-choices">
                {['Inter', 'PP Editorial', 'Söhne', 'Editorial New', 'serif'].map(f => (
                  <button key={f} className={`coach-choice ${data.fonts?.heading === f ? 'sel' : ''}`} onClick={() => set('fonts', { ...(data.fonts || {}), heading: f })}>{f}</button>
                ))}
              </div>
            </div>
            <div className="coach-field">
              <span className="coach-field-label">Body font</span>
              <div className="coach-choices">
                {['Inter', 'Söhne', 'system-ui', 'sans-serif'].map(f => (
                  <button key={f} className={`coach-choice ${data.fonts?.body === f ? 'sel' : ''}`} onClick={() => set('fonts', { ...(data.fonts || {}), body: f })}>{f}</button>
                ))}
              </div>
            </div>
          </div>
        ),
        canNext: d => d.fonts?.heading && d.fonts?.body,
      },
      {
        title: <>Calibrate the <span className="accent">voice</span></>,
        desc: <>Two sliders set the tone for every AI-generated output. Formal–Casual decides how stiff or relaxed it sounds. Technical–Accessible decides whether it talks to engineers or generalists.</>,
        why: 'These sliders are literally how the AI is steered. Slide them now and every Studio output for this brand starts pre-tuned.',
        fields: ({ data, set }) => {
          const voice = data.voice || { formal: 0.5, technical: 0.5 };
          const setVoice = (k, v) => set('voice', { ...voice, [k]: v });
          return (
            <div className="coach-form">
              <div className="coach-field">
                <span className="coach-field-label">Formal ←→ Casual</span>
                <div className="coach-choices">
                  {[0.15, 0.35, 0.55, 0.75].map((v, i) => (
                    <button key={v} className={`coach-choice ${voice.formal === v ? 'sel' : ''}`} onClick={() => setVoice('formal', v)}>
                      {['Stiff suit', 'Considered', 'Conversational', 'Friend-level'][i]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="coach-field">
                <span className="coach-field-label">Technical ←→ Accessible</span>
                <div className="coach-choices">
                  {[0.15, 0.35, 0.55, 0.75].map((v, i) => (
                    <button key={v} className={`coach-choice ${voice.technical === v ? 'sel' : ''}`} onClick={() => setVoice('technical', v)}>
                      {['Engineer-level', 'Tech-fluent', 'General-purpose', 'Plain language'][i]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        },
        canNext: d => d.voice?.formal != null && d.voice?.technical != null,
      },
      {
        title: <>Block the <span className="accent">words you hate</span></>,
        desc: <>Every brand has them. Buzzwords that make you cringe, jargon you've outgrown, the punctuation marks you forbid. List them now and AI will never produce them.</>,
        why: 'A forbidden-words list is the cheapest brand defense possible. One word slips through and your brand starts sounding like everyone else.',
        fields: ({ data, set }) => {
          const fb = data.forbidden || ['', '', ''];
          const update = (i, v) => { const n = [...fb]; n[i] = v; set('forbidden', n); };
          return (
            <div className="coach-bullets">
              {fb.map((w, i) => (
                <div key={i} className="coach-bullet">
                  <input placeholder={['revolucionario', 'sinergias', 'game-changer'][i] || 'banned word'} value={w} onChange={e => update(i, e.target.value)}/>
                  <button className="rm" onClick={() => set('forbidden', fb.filter((_, j) => j !== i))}><OS_ICON name="close" size={12} stroke={2}/></button>
                </div>
              ))}
              <button className="coach-add-bullet" onClick={() => set('forbidden', [...fb, ''])}><OS_ICON name="plus" size={12}/>Add</button>
              <div className="coach-suggest" style={{ marginTop: 4 }}>
                {['revolucionario','sinergias','game-changer','disrupción','best-in-class','em-dashes'].map(s => (
                  <span key={s} className="coach-suggest-chip" onClick={() => set('forbidden', [...fb.filter(Boolean), s])}>{s}</span>
                ))}
              </div>
            </div>
          );
        },
        canNext: d => (d.forbidden || []).filter(Boolean).length >= 1,
      },
    ],
  },

  // SCALING → Roles
  'scaling:roles': {
    visual: 'role',
    tag: 'Define your first role',
    steps: [
      {
        title: <>Name the <span className="accent">role</span> + department</>,
        desc: <>Even if it's just an idea on paper. The act of naming the role and assigning it to a department makes it real enough to plan around.</>,
        why: 'Each role becomes a card in the org chart, a bar on the roadmap, and a line in the cost projection. Define it once and three views update automatically.',
        fields: ({ data, set }) => {
          const depts = [
            { id: 'Strategy',   c: '#6DBEDC' },
            { id: 'Content',    c: '#F1ADD8' },
            { id: 'Design',     c: '#C4A35A' },
            { id: 'Operations', c: '#A855F7' },
            { id: 'Sales',      c: '#769268' },
            { id: 'Delivery',   c: '#5c1d18' },
          ];
          return (
            <div className="coach-form">
              <div className="coach-field">
                <span className="coach-field-label">Role title</span>
                <input className="coach-input" placeholder="Senior Strategist" value={data.title || ''} onChange={e => set('title', e.target.value)}/>
              </div>
              <div className="coach-field">
                <span className="coach-field-label">Department</span>
                <div className="coach-choices">
                  {depts.map(d => (
                    <button key={d.id} className={`coach-choice ${data.dept === d.id ? 'sel' : ''}`} onClick={() => { set('dept', d.id); set('deptColor', d.c); }}>
                      <span className="sw" style={{ background: d.c }}/>{d.id}
                    </button>
                  ))}
                </div>
              </div>
              <div className="coach-field" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <span className="coach-field-label">Type</span>
                  <div className="coach-choices">
                    {['FT', 'PT', 'CT'].map(t => (
                      <button key={t} className={`coach-choice ${data.type === t ? 'sel' : ''}`} onClick={() => set('type', t)}>{t}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="coach-field-label">Hire phase</span>
                  <div className="coach-choices">
                    {['M3', 'M6', 'M9', 'M12'].map(p => (
                      <button key={p} className={`coach-choice ${data.phase === p ? 'sel' : ''}`} onClick={() => set('phase', p)}>{p}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        },
        canNext: d => d.title && d.dept && d.type && d.phase,
      },
      {
        title: <>Why does this <span className="accent">role exist</span>?</>,
        desc: <>One sentence. The role is a hypothesis about what's broken — describe what changes once it's filled. If you can't, the role isn't ready to define.</>,
        why: 'Rationale shows up on the Role detail card and the cost-tracker proposal. It\'s also what you say in the job ad when you actually hire.',
        fields: ({ data, set }) => (
          <div className="coach-form">
            <div className="coach-field">
              <span className="coach-field-label">Rationale</span>
              <textarea className="notes" style={{ minHeight: 80 }} placeholder="Take over founder-led delivery. Free Eneas for strategic work." value={data.rationale || ''} onChange={e => set('rationale', e.target.value)}/>
            </div>
          </div>
        ),
        canNext: d => d.rationale && d.rationale.length > 15,
      },
      {
        title: <>List the <span className="accent">core tasks</span></>,
        desc: <>3 tasks this role owns end-to-end. Not "supports the team" — concrete actions. If two roles have the same tasks, one of them is wrong.</>,
        why: 'These tasks define the onboarding plan. When someone is hired into this role, week-one is "do these three things."',
        fields: ({ data, set }) => {
          const tasks = data.tasks || ['', '', ''];
          const update = (i, v) => { const n = [...tasks]; n[i] = v; set('tasks', n); };
          return (
            <div className="coach-bullets">
              {tasks.map((t, i) => (
                <div key={i} className="coach-bullet">
                  <input placeholder={['Run discovery workshops', 'Quality-review all deliverables', 'Coach junior strategists'][i] || 'Core task'} value={t} onChange={e => update(i, e.target.value)}/>
                  <button className="rm" onClick={() => set('tasks', tasks.filter((_, j) => j !== i))}><OS_ICON name="close" size={12} stroke={2}/></button>
                </div>
              ))}
              <button className="coach-add-bullet" onClick={() => set('tasks', [...tasks, ''])}><OS_ICON name="plus" size={12}/>Add task</button>
            </div>
          );
        },
        canNext: d => (d.tasks || []).filter(Boolean).length >= 2,
      },
      {
        title: <>One <span className="accent">KPI</span> + monthly cost</>,
        desc: <>Pick the one number that, if it moves, this role is winning. And the rough monthly cost — even a placeholder. You can refine both later.</>,
        why: 'The KPI shows up live on the Person detail page. Monthly cost flows into the cost tracker and the margin projection at M12.',
        fields: ({ data, set }) => (
          <div className="coach-form">
            <div className="coach-field">
              <span className="coach-field-label">Primary KPI</span>
              <input className="coach-input" placeholder="Client NPS" value={data.kpi || ''} onChange={e => set('kpi', e.target.value)}/>
              <div className="coach-suggest" style={{ marginTop: 4 }}>
                {['Client NPS', 'Win rate', 'Deliverables on time', 'Cadence compliance', 'Retention'].map(k => (
                  <span key={k} className="coach-suggest-chip" onClick={() => set('kpi', k)}>{k}</span>
                ))}
              </div>
            </div>
            <div className="coach-field" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <span className="coach-field-label">Target</span>
                <input className="coach-input" placeholder="60" value={data.kpiTarget || ''} onChange={e => set('kpiTarget', e.target.value)}/>
              </div>
              <div>
                <span className="coach-field-label">Monthly cost</span>
                <input className="coach-input" placeholder="5200" type="number" value={data.cost || ''} onChange={e => set('cost', parseInt(e.target.value, 10) || 0)}/>
              </div>
            </div>
          </div>
        ),
        canNext: d => d.kpi && d.kpiTarget && d.cost,
      },
    ],
  },

  // TOOLKIT → Connections
  'toolkit:connections': {
    visual: 'connection',
    tag: 'Connect your first platform',
    steps: [
      {
        title: <>Pick the <span className="accent">platform</span></>,
        desc: <>You'll connect five or six over time, but one is enough to feel the impact. Pick the platform where you already publish or sell — the one that pays you back fastest.</>,
        why: 'A connected platform unlocks: live performance pull, branded publishing from inside Studio, and automation triggers from real events (a published post, a new follower, a closed ad).',
        fields: ({ data, set }) => {
          const platforms = [
            { id: 'LinkedIn',  c: '#0A66C2', use: 'Publish posts, pull analytics, import reference content' },
            { id: 'Instagram', c: '#E1306C', use: 'Schedule reels & carruseles, sync brand moodboard' },
            { id: 'Pinterest', c: '#E60023', use: 'Auto-index pins into brand moodboards, extract style signatures' },
            { id: 'Higgsfield', c: '#7C5CFF', use: 'Train custom style models, generate brand-consistent visuals' },
            { id: 'Figma',     c: '#A259FF', use: 'Import design tokens, sync brand kits' },
          ];
          return (
            <div className="coach-form">
              <div className="coach-choices" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                {platforms.map(p => (
                  <button key={p.id} className={`coach-choice ${data.platform === p.id ? 'sel' : ''}`} style={{ justifyContent: 'flex-start', alignItems: 'flex-start', flexDirection: 'column', padding: '10px 12px', gap: 3 }} onClick={() => { set('platform', p.id); set('color', p.c); set('use', p.use); }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
                      <span className="sw" style={{ background: p.c }}/>{p.id}
                    </span>
                    <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 400 }}>{p.use}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        },
        canNext: d => !!d.platform,
      },
      {
        title: <>Authorize the <span className="accent">account</span></>,
        desc: <>Sign in with the {`{platform}`} account that owns your professional content. Personal accounts work for testing — production publishing needs a business account.</>,
        why: 'The account name shows up next to "Connected" on the Connections grid. It\'s also what every publish/sync action uses, so picking right now saves a re-auth flow later.',
        fields: ({ data, set }) => (
          <div className="coach-form">
            <div className="coach-field">
              <span className="coach-field-label">Account handle on {data.platform}</span>
              <input className="coach-input" placeholder="@livvstudio" value={data.account || ''} onChange={e => set('account', e.target.value)}/>
              <div style={{ fontSize: 11, color: 'var(--os-fg-2)', marginTop: 4 }}>In production this opens OAuth. For setup, type the handle so the integration card has the right label.</div>
            </div>
            <button className="so-action primary" style={{ flex: 0, marginTop: 4 }}>
              <OS_ICON name="link" size={12}/>Authorize with {data.platform || 'platform'}
            </button>
          </div>
        ),
        canNext: d => !!d.account,
      },
      {
        title: <>Grant <span className="accent">permissions</span></>,
        desc: <>Tighten the scope to what you actually need. Read-only is fine for analytics. Publishing needs write access. Less scope = lower risk if the token leaks.</>,
        why: `The permissions you pick here drive what automations can use this connection. "Read" gives metrics; "publish" unlocks the Studio's one-click send.`,
        fields: ({ data, set }) => {
          const ALL_PERMS = {
            LinkedIn:   ['Read posts', 'Publish posts', 'Read analytics', 'Read connections'],
            Instagram:  ['Read posts', 'Publish posts', 'Read insights'],
            Pinterest:  ['Read pins', 'Sync boards', 'Extract style signatures'],
            Higgsfield: ['Image generation', 'Style transfer', 'Train style models'],
            Figma:      ['Read frames', 'Import design tokens', 'Read team library'],
          };
          const perms = ALL_PERMS[data.platform] || ['Read', 'Write'];
          const selected = data.permissions || [];
          const toggle = (p) => set('permissions', selected.includes(p) ? selected.filter(x => x !== p) : [...selected, p]);
          return (
            <div className="coach-form">
              <div className="coach-choices">
                {perms.map(p => (
                  <button key={p} className={`coach-choice ${selected.includes(p) ? 'sel' : ''}`} onClick={() => toggle(p)}>{p}</button>
                ))}
              </div>
            </div>
          );
        },
        canNext: d => (d.permissions || []).length >= 1,
      },
    ],
  },

  // GROWTH → Partners
  'growth:partners': {
    visual: 'partner',
    tag: 'Launch your referral program',
    steps: [
      {
        title: <>Invite your <span className="accent">first partner</span></>,
        desc: <>The first partner is usually someone who already sends you work — a past client, an aligned consultant, or a friend who's introduced you twice. Start with the highest-trust relationship you have.</>,
        why: 'Most agencies leave 20-30% of pipeline on the table because they never formalize who refers them. A defined partner program turns "casual intros" into a tracked, paid channel.',
        fields: ({ data, set }) => (
          <div className="coach-form" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
            <div className="coach-field">
              <span className="coach-field-label">Partner name</span>
              <input className="coach-input" placeholder="Iris Tanaka" value={data.name || ''} onChange={e => set('name', e.target.value)}/>
            </div>
            <div className="coach-field">
              <span className="coach-field-label">Company</span>
              <input className="coach-input" placeholder="Sable Loft" value={data.company || ''} onChange={e => set('company', e.target.value)}/>
            </div>
            <div className="coach-field" style={{ gridColumn: '1 / -1' }}>
              <span className="coach-field-label">Color (helps you spot them across LIVV)</span>
              <div className="coach-choices">
                {[
                  { v: 'var(--accent)', n: 'Gold' },
                  { v: 'var(--sky)',    n: 'Sky' },
                  { v: 'var(--sage)',   n: 'Sage' },
                  { v: 'var(--pink)',   n: 'Pink' },
                  { v: '#A855F7',       n: 'Purple' },
                ].map(c => (
                  <button key={c.v} className={`coach-choice ${data.color === c.v ? 'sel' : ''}`} onClick={() => set('color', c.v)}>
                    <span className="sw" style={{ background: c.v }}/>
                    {c.n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ),
        canNext: d => d.name && d.company && d.color,
      },
      {
        title: <>Pick a <span className="accent">partner type</span></>,
        desc: <>Three flavors. Referrers send leads and step back. Resellers wrap your service in their offer and mark it up. Affiliates promote at scale via links and earn per conversion. Pick the one that fits the relationship — you can always change later.</>,
        why: 'The type defines defaults: commission split, payout cadence, and what materials they get. Setting it now means everything downstream — invoicing, dashboards, payouts — is correct from day one.',
        fields: ({ data, set }) => {
          const presets = {
            Referrer:  { impl: '12%', mrr: '8%' },
            Reseller:  { impl: '20%', mrr: '15%' },
            Affiliate: { impl: '8%',  mrr: '5%' },
          };
          return (
            <div className="coach-form">
              <div className="coach-choices">
                {Object.entries(presets).map(([t, p]) => (
                  <button key={t} className={`coach-choice ${data.type === t ? 'sel' : ''}`} onClick={() => { set('type', t); set('impl', p.impl); set('mrr', p.mrr); }}>
                    {t}
                  </button>
                ))}
              </div>
              {data.type && (
                <div className="coach-field" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <span className="coach-field-label">% on implementation</span>
                    <input className="coach-input" value={data.impl || ''} onChange={e => set('impl', e.target.value)}/>
                  </div>
                  <div>
                    <span className="coach-field-label">% on monthly retainer</span>
                    <input className="coach-input" value={data.mrr || ''} onChange={e => set('mrr', e.target.value)}/>
                  </div>
                </div>
              )}
            </div>
          );
        },
        canNext: d => d.type && d.impl && d.mrr,
      },
      {
        title: <>Set their <span className="accent">unique code</span></>,
        desc: <>Short, memorable, and tied to who they are. They'll share it in conversations, paste it in DMs, and see it in their dashboard. The link auto-generates from it.</>,
        why: 'A unique code is what closes the attribution loop: every lead that uses it gets tagged with this partner, and commissions calculate automatically when those leads close.',
        fields: ({ data, set }) => (
          <div className="coach-form">
            <div className="coach-field">
              <span className="coach-field-label">Partner code</span>
              <input className="coach-input" placeholder="IRIS-SABLE" style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase' }} value={data.code || ''} onChange={e => set('code', e.target.value.toUpperCase().replace(/\s+/g, '-'))}/>
              <div className="coach-suggest" style={{ marginTop: 4 }}>
                {[`${(data.name || 'PARTNER').split(' ')[0]}-${(data.company || 'CO').split(' ')[0]}`.toUpperCase(), 'LIVV-SUMMER25', 'OG-LAUNCH'].map(c => (
                  <span key={c} className="coach-suggest-chip" onClick={() => set('code', c)}>{c}</span>
                ))}
              </div>
            </div>
          </div>
        ),
        canNext: d => d.code && d.code.length >= 3,
      },
      {
        title: <>Give them <span className="accent">one widget</span></>,
        desc: <>Pick the lowest-friction asset to share with them right now. They paste one line into their site, social bio, or email signature — and you start tracking referrals today.</>,
        why: 'Partners with at least one shipped widget refer 4x more leads in the first 30 days than those who only get a link. Lower the activation friction or they ghost.',
        fields: ({ data, set }) => (
          <div className="coach-form">
            <div className="coach-choices" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              {[
                { id: 'Referral button',  desc: '"Powered by LIVV" CTA — for site footers' },
                { id: 'Contact form',     desc: 'Inline form on their site → creates a lead' },
                { id: 'Landing page',     desc: 'livvvv.com/p/their-name · branded with their logo' },
                { id: 'Email signature',  desc: 'One-line link for their email footer' },
              ].map(w => (
                <button key={w.id} className={`coach-choice ${data.widget === w.id ? 'sel' : ''}`} style={{ justifyContent: 'flex-start', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '10px 12px' }} onClick={() => set('widget', w.id)}>
                  <span style={{ fontWeight: 500 }}>{w.id}</span>
                  <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 400 }}>{w.desc}</span>
                </button>
              ))}
            </div>
          </div>
        ),
        canNext: d => !!d.widget,
      },
    ],
  },

  // GROWTH → Dashboard
  'growth:dashboard': {
    visual: 'dashboard',
    tag: 'Pick your North Star metrics',
    steps: [
      {
        title: <>What's your <span className="accent">North Star</span> number?</>,
        desc: <>Pick the single number that, if it grows, your business is healthy. For most agencies and SaaS, it's MRR. For services-only, it's revenue per active month.</>,
        why: 'Every other KPI on this dashboard hangs off the North Star. The system grades your week against this number first.',
        fields: ({ data, set }) => (
          <div className="coach-form">
            <div className="coach-field">
              <span className="coach-field-label">North Star</span>
              <div className="coach-choices">
                {['MRR', 'Revenue', 'Active clients', 'Pipeline value', 'Custom'].map(k => (
                  <button key={k} className={`coach-choice ${data.nsKind === k ? 'sel' : ''}`} onClick={() => set('nsKind', k)}>{k}</button>
                ))}
              </div>
            </div>
            <div className="coach-field">
              <span className="coach-field-label">Current value</span>
              <input className="coach-input" placeholder="$58,400" value={data.mrr || ''} onChange={e => set('mrr', e.target.value)}/>
            </div>
          </div>
        ),
        canNext: d => d.nsKind && d.mrr,
      },
      {
        title: <>How many <span className="accent">retainer clients</span> right now?</>,
        desc: <>Just the count. We'll auto-pull this from your finance integration later, but starting with the truth gets you the dashboard you need today.</>,
        why: 'Retainer count is the leading indicator of MRR stability. The system uses this to project the next 90 days.',
        fields: ({ data, set }) => (
          <div className="coach-form">
            <div className="coach-field">
              <span className="coach-field-label">Active retainer clients</span>
              <input className="coach-input" type="number" placeholder="14" style={{ width: 140 }} value={data.clients || ''} onChange={e => set('clients', e.target.value)}/>
            </div>
          </div>
        ),
        canNext: d => !!d.clients,
      },
      {
        title: <>How much <span className="accent">pipeline value</span> right now?</>,
        desc: <>Rough sum of open deals × probability. Don't agonize over it — even your gut number is more useful than an empty dashboard.</>,
        why: 'Pipeline value plotted against MRR over time is the single best chart for forecasting your next quarter. Start with the number you know.',
        fields: ({ data, set }) => (
          <div className="coach-form">
            <div className="coach-field">
              <span className="coach-field-label">Pipeline value</span>
              <input className="coach-input" placeholder="$890,000" value={data.pipeline || ''} onChange={e => set('pipeline', e.target.value)}/>
            </div>
          </div>
        ),
        canNext: d => !!d.pipeline,
      },
      {
        title: <>What's your <span className="accent">content cadence</span>?</>,
        desc: <>One number: pieces per week, across all channels. We track this against your target and surface compliance on the home.</>,
        why: 'Content cadence is the cheapest leading indicator of pipeline health 3 months out. If it drops, MRR usually drops too.',
        fields: ({ data, set }) => (
          <div className="coach-form">
            <div className="coach-field">
              <span className="coach-field-label">Pieces per week</span>
              <input className="coach-input" placeholder="8 / 12" style={{ width: 160 }} value={data.content || ''} onChange={e => set('content', e.target.value)}/>
            </div>
          </div>
        ),
        canNext: d => !!d.content,
      },
    ],
  },
};

// ─────────────────────────────────────────────────────────────
// Coach flow component
// ─────────────────────────────────────────────────────────────
const CoachFlow = ({ module, tab, onComplete }) => {
  const key = `${module}:${tab}`;
  const flow = FLOWS[key];
  const [idx, setIdx] = useCoS(0);
  const [data, setData] = useCoS({});
  const [out, setOut] = useCoS(false);
  if (!flow) return null;

  const step = flow.steps[idx];
  const total = flow.steps.length;
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));

  const next = () => {
    if (idx + 1 >= total) {
      onComplete?.(data);
      return;
    }
    setOut(true);
    setTimeout(() => { setIdx(idx + 1); setOut(false); }, 220);
  };
  const back = () => {
    if (idx === 0) return;
    setOut(true);
    setTimeout(() => { setIdx(idx - 1); setOut(false); }, 220);
  };

  useCoE(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && step.canNext(data)) { e.preventDefault(); next(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, data]);

  return (
    <div className="coach-shell">
      <div className="coach-progress">
        <span className="coach-prog-label">
          Step <strong>{String(idx + 1).padStart(2, '0')}</strong> of {String(total).padStart(2, '0')}
        </span>
        <div className="coach-prog-dots">
          {flow.steps.map((_, i) => (
            <span key={i} className={`coach-dot ${i < idx ? 'done' : i === idx ? 'current' : ''}`} style={{ '--p': i === idx ? '100%' : '0%' }}/>
          ))}
        </div>
        <button className="coach-skip" onClick={onComplete}>Skip onboarding</button>
      </div>

      <div className="coach">
        <div className="coach-l">
          <div className={`coach-step ${out ? 'out' : ''}`}>
            <span className="coach-step-tag">
              <span className="n">{idx + 1}</span>
              {flow.tag}
              <span className="of">· {idx + 1}/{total}</span>
            </span>
            <h2 className="coach-title">{step.title}</h2>
            <p className="coach-desc">{step.desc}</p>
            <div className="coach-why">
              <span className="coach-why-ic"><OS_ICON name="sparkle" size={13}/></span>
              <div className="coach-why-body">
                <span className="coach-why-eyebrow">© Why this matters</span>
                <span className="coach-why-text">{step.why}</span>
              </div>
            </div>
            {step.fields({ data, set })}
          </div>
          <div className="coach-foot">
            <button className="coach-btn" onClick={back} disabled={idx === 0}>
              <OS_ICON name="chev" size={13} style={{ transform: 'rotate(180deg)' }}/>
              Back
            </button>
            <button
              className="coach-btn primary"
              onClick={next}
              disabled={!step.canNext(data)}
            >
              {idx + 1 === total ? 'Finish & save' : 'Continue'}
              <OS_ICON name="chev" size={13}/>
              <span className="kbd">⌘↵</span>
            </button>
            <span className="coach-foot-meta">Auto-saved · {Math.max(1, total - idx - 1)} {total - idx - 1 === 1 ? 'step' : 'steps'} left</span>
          </div>
        </div>
        <div className="coach-r">
          <CoachVisual kind={flow.visual} step={idx} total={total} data={data}/>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { CoachFlow, FLOWS });
