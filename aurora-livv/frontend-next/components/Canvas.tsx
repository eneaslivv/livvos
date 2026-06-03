'use client';
import { useEffect, useState } from 'react';
import type { Canvas as CanvasShape, CanvasBlock } from '@/lib/mock-backend';

export function Canvas({ canvas, onConfirm }: { canvas: CanvasShape; onConfirm?: () => void }) {
  if (!canvas) return null;

  return (
    <div className="canvas-shell">
      <div className="canvas-head">
        <span className="ribbon" />
        <span>{canvas.type} · {canvas.agent}</span>
      </div>
      {canvas.type === 'display'     && <DisplayBlocks blocks={canvas.blocks || []} />}
      {canvas.type === 'workflow'    && <Workflow canvas={canvas} onConfirm={onConfirm} />}
      {canvas.type === 'interactive' && <Interactive canvas={canvas} onConfirm={onConfirm} />}
      {canvas.type === 'route'       && <Route canvas={canvas} />}
    </div>
  );
}

function DisplayBlocks({ blocks }: { blocks: CanvasBlock[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'stat_cards': return <StatCards key={i} items={b.items} />;
          case 'lead_list':  return <MiniList key={i} items={b.items} subtitle="lead" />;
          case 'project_grid': return <MiniList key={i} items={b.items} subtitle="project" />;
          case 'bar_chart':  return <BarChart key={i} title={b.title} data={b.data} />;
          case 'donut_chart': return <BarChart key={i} title={b.title} data={b.data.map((d: any) => ({ x: d.label, y: d.value }))} />;
          case 'attribution_table': return <AttrTable key={i} rows={b.rows} />;
          case 'markdown_block': return <div key={i} className="diff">{b.body}</div>;
          default: return null;
        }
      })}
    </>
  );
}

function StatCards({ items }: { items: any[] }) {
  return (
    <div className="mini-stats">
      {items.slice(0, 4).map((it, i) => (
        <div className="mini-stat" key={i}>
          <div className="label">{it.label}</div>
          <div className="value">{it.value}</div>
          {it.sublabel && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{it.sublabel}</div>}
        </div>
      ))}
    </div>
  );
}

function MiniList({ items, subtitle }: { items: any[]; subtitle: string }) {
  return (
    <div className="mini-list">
      {items.map((it, i) => (
        <div className="row" key={i}>
          <div className="name">{it.name || it.title}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{it.company || it.client}</div>
          {(it.status || it.health) && <span className="pill">{it.status || it.health}</span>}
        </div>
      ))}
    </div>
  );
}

function BarChart({ title, data }: { title: string; data: any[] }) {
  const max = Math.max(...data.map(d => Number(d.y || 0)), 1);
  return (
    <div className="chart">
      {title && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{title}</div>}
      {data.map((d, i) => (
        <div className="bar-row" key={i}>
          <div className="label">{d.x}</div>
          <div className="bar" style={{ width: `${(Number(d.y || 0) / max) * 100}%` }} />
          <div className="label" style={{ textAlign: 'right' }}>{formatNum(d.y)}</div>
        </div>
      ))}
    </div>
  );
}

function AttrTable({ rows }: { rows: any[] }) {
  return (
    <div className="chart">
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr .8fr .8fr 1fr', gap: 8, fontSize: 11, color: 'var(--text-muted)', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
        <span>source</span><span>leads</span><span>qual</span><span>won</span><span>revenue</span>
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr .8fr .8fr 1fr', gap: 8, fontSize: 12, padding: '4px 0' }}>
          <span>{r.source}</span><span>{r.leads_n}</span><span>{r.qualified_n}</span><span>{r.won_n}</span><span>${(r.revenue||0).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function Workflow({ canvas, onConfirm }: { canvas: CanvasShape; onConfirm?: () => void }) {
  const destructive = !!canvas.cooldown_seconds;
  const [phrase, setPhrase] = useState('');
  const [cooldownLeft, setCooldownLeft] = useState(canvas.cooldown_seconds || 0);

  useEffect(() => {
    if (!destructive) return;
    const t = setInterval(() => setCooldownLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [destructive]);

  const ready = destructive ? (phrase === (canvas.confirm_phrase || 'BORRAR') && cooldownLeft === 0) : true;

  return (
    <>
      {canvas.stepper && (
        <div className="stepper">
          {canvas.stepper.map((s, i) => (
            <span key={i} className={`step ${s.status}`}>{i + 1}. {s.name}</span>
          ))}
        </div>
      )}
      {canvas.diff && canvas.diff.length > 0 && (
        <div className="diff">
          {canvas.diff.map((d: any, i: number) => `${d.table}.${d.field}: ${JSON.stringify(d.from)} → ${JSON.stringify(d.to)}`).join('\n')}
        </div>
      )}
      {destructive && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--err)', marginBottom: 6 }}>⚠ Acción irreversible. Escribí "{canvas.confirm_phrase || 'BORRAR'}" y esperá {cooldownLeft}s.</div>
          <input
            value={phrase}
            onChange={e => setPhrase(e.target.value)}
            placeholder={canvas.confirm_phrase || 'BORRAR'}
            style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
          />
        </div>
      )}
      {canvas.cta && (
        <div className="cta">
          <button onClick={onConfirm}>{canvas.cta.cancel_label}</button>
          <button className="primary" disabled={!ready} onClick={onConfirm}>{canvas.cta.confirm_label}</button>
        </div>
      )}
    </>
  );
}

function Interactive({ canvas, onConfirm }: { canvas: CanvasShape; onConfirm?: () => void }) {
  const [vals, setVals] = useState<Record<string, any>>(() => Object.fromEntries((canvas.controls || []).map((c: any) => [c.id, c.value])));
  return (
    <>
      <div style={{ display: 'grid', gap: 10 }}>
        {(canvas.controls || []).map((c: any) => (
          <div key={c.id}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{c.label}</div>
            {c.kind === 'textarea' && (
              <textarea
                value={vals[c.id] ?? ''}
                onChange={e => setVals({ ...vals, [c.id]: e.target.value })}
                style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)', minHeight: 70, fontSize: 13 }}
              />
            )}
            {c.kind === 'slider' && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="range" min={c.min} max={c.max} step={c.step} value={vals[c.id]} onChange={e => setVals({ ...vals, [c.id]: parseFloat(e.target.value) })} style={{ flex: 1 }} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 40 }}>{vals[c.id]}</span>
              </div>
            )}
            {c.kind === 'toggle' && (
              <label style={{ display: 'flex', gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={!!vals[c.id]} onChange={e => setVals({ ...vals, [c.id]: e.target.checked })} />
                {c.label}
              </label>
            )}
          </div>
        ))}
      </div>
      <div className="cta">
        <button className="primary" onClick={onConfirm}>{canvas.submit?.label || 'Aplicar'}</button>
      </div>
    </>
  );
}

function Route({ canvas }: { canvas: CanvasShape }) {
  return (
    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
      Routing → {canvas.target_agent} <span style={{ fontStyle: 'italic' }}>· {canvas.reason}</span>
    </div>
  );
}

function formatNum(n: any): string {
  const v = Number(n || 0);
  if (Math.abs(v) >= 1000) return v.toLocaleString();
  return String(v);
}
