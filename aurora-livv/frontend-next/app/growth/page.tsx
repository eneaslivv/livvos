'use client';
import { Topbar } from '@/components/Topbar';

const chips = [
  'Mostrame el funnel',
  '¿De dónde vienen los leads?',
  'Forecast del trimestre',
  '¿Dónde estoy perdiendo más leads?',
  'Hacé el WBR',
  'Quiero ajustar las probabilidades por etapa',
];

export default function Growth() {
  return (
    <>
      <Topbar title="Growth" module="growth" />
      <p className="page-intro">Funnel, atribución, forecast. Nova lee la DB y devuelve canvas estructurado.</p>
      <div className="chips">
        {chips.map(c => <button key={c} className="chip" onClick={() => window.dispatchEvent(new CustomEvent('aurora-send', { detail: { text: c, agent: 'nova' }}))}>{c}</button>)}
      </div>

      <div className="stat-grid">
        <div className="stat-card"><div className="label">Leads (30d)</div><div className="value">47</div></div>
        <div className="stat-card"><div className="label">Qualified rate</div><div className="value">28%</div></div>
        <div className="stat-card"><div className="label">Top source</div><div className="value">Web Form</div><div className="sublabel">38% del mix</div></div>
        <div className="stat-card"><div className="label">Forecast (likely)</div><div className="value">$24,800</div></div>
      </div>
    </>
  );
}
