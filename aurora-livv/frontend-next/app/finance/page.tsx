'use client';
import { Topbar } from '@/components/Topbar';

const chips = [
  '¿Cómo va mi mes?',
  '¿Qué proyectos están en pérdida?',
  '¿Por qué está en pérdida el de Bank Corp?',
  'AR aging',
  'Cuánto voy a cobrar las próximas 12 semanas',
  'Cobremos a Lucía Méndez',
];

export default function Finance() {
  return (
    <>
      <Topbar title="Finance" module="finance" />
      <p className="page-intro">Salud financiera por proyecto. Tocá un chip para que Marina lo lea.</p>
      <div className="chips">
        {chips.map(c => <button key={c} className="chip" onClick={() => window.dispatchEvent(new CustomEvent('aurora-send', { detail: { text: c, agent: 'marina' }}))}>{c}</button>)}
      </div>

      <div className="stat-grid">
        <div className="stat-card"><div className="label">Cobrado</div><div className="value">$44,000.00</div></div>
        <div className="stat-card"><div className="label">Comprometido</div><div className="value">$72,000.00</div></div>
        <div className="stat-card"><div className="label">Margen</div><div className="value">31%</div><div className="trend pos">+4% vs mes anterior</div></div>
        <div className="stat-card"><div className="label">Loss</div><div className="value">1</div><div className="trend warn">Fintech Dashboard</div></div>
      </div>

      <div className="list">
        <div className="list-row"><span className="name">Fintech Dashboard</span><span className="meta">Bank Corp</span><span className="pill">loss</span></div>
        <div className="list-row"><span className="name">E-commerce Platform</span><span className="meta">Tech Store</span><span className="pill">profit</span></div>
        <div className="list-row"><span className="name">SaaS Branding</span><span className="meta">Startup.io</span><span className="pill">profit</span></div>
        <div className="list-row"><span className="name">Editorial Site</span><span className="meta">Boutique Co</span><span className="pill">not billed</span></div>
        <div className="list-row"><span className="name">Consulting Retainer</span><span className="meta">GrowthLab</span><span className="pill">profit</span></div>
      </div>
    </>
  );
}
