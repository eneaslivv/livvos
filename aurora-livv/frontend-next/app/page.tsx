'use client';
import { Topbar } from '@/components/Topbar';

export default function Home() {
  return (
    <>
      <Topbar title="Inicio" module="home" />
      <p className="page-intro">
        Bienvenido. Esta es la shell de aurora-livv corriendo en modo mock — todo el dock funciona sin Claude.
        Probá los chips de cada sección o tocá el FAB abajo a la derecha. Cambiá de agente desde el switcher dentro del dock.
      </p>

      <div className="stat-grid">
        <div className="stat-card"><div className="label">Open deals</div><div className="value">5</div><div className="sublabel">via Solara</div></div>
        <div className="stat-card"><div className="label">Cobrado en el mes</div><div className="value">$44,000</div><div className="sublabel">via Marina</div></div>
        <div className="stat-card"><div className="label">Leads esta semana</div><div className="value">12</div><div className="sublabel">via Nova</div></div>
        <div className="stat-card"><div className="label">Forecast Q</div><div className="value">$24,800</div><div className="sublabel">likely scenario</div></div>
      </div>

      <p className="page-intro" style={{ marginTop: 16 }}>
        Quick links: <a href="/pipeline">Pipeline</a> · <a href="/finance">Finance</a> · <a href="/growth">Growth</a>
      </p>
    </>
  );
}
