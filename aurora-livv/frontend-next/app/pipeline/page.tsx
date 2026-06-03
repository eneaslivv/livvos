'use client';
import { Topbar } from '@/components/Topbar';

const chips = [
  '¿Cómo está mi pipeline?',
  '¿Qué tengo stale esta semana?',
  'Draftéame un follow-up para Martín',
  'Pasá a Sarah a negotiation',
  '¿Estoy listo para mandarle propuesta a Sarah?',
];

export default function Pipeline() {
  return (
    <>
      <Topbar title="Pipeline" module="pipeline" />
      <p className="page-intro">Tu pipeline en vivo. Tocá un chip para ver cómo responde Solara.</p>
      <div className="chips">
        {chips.map(c => <button key={c} className="chip" onClick={() => window.dispatchEvent(new CustomEvent('aurora-send', { detail: { text: c, agent: 'solara' }}))}>{c}</button>)}
      </div>

      <div className="stat-grid">
        <div className="stat-card"><div className="label">Open</div><div className="value">5</div></div>
        <div className="stat-card"><div className="label">Pipeline</div><div className="value">$58,000</div></div>
        <div className="stat-card"><div className="label">Hot</div><div className="value">2</div></div>
        <div className="stat-card"><div className="label">Stale</div><div className="value">3</div></div>
      </div>

      <div className="list">
        <div className="list-row"><span className="name">Martín Gomez</span><span className="meta">Startup.io</span><span className="pill">qualified</span></div>
        <div className="list-row"><span className="name">Sarah Lee</span><span className="meta">Boutique Co</span><span className="pill">proposal</span></div>
        <div className="list-row"><span className="name">Diego López</span><span className="meta">Medium Co</span><span className="pill">negotiation</span></div>
        <div className="list-row"><span className="name">Ana Pérez</span><span className="meta">NewCo</span><span className="pill">new</span></div>
        <div className="list-row"><span className="name">Carlos Rivera</span><span className="meta">Old Co</span><span className="pill">contacted</span></div>
      </div>
    </>
  );
}
