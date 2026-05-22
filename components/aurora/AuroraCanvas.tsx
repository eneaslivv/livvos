// AuroraCanvas — renders the 4 canvas types inside the dock.

import React, { useEffect, useState } from 'react';
import type { Canvas, CanvasBlock } from '../../types/aurora';

export const AuroraCanvas: React.FC<{ canvas: Canvas; onConfirm?: () => void }> = ({ canvas, onConfirm }) => {
  if (!canvas) return null;
  return (
    <div
      className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 space-y-2"
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider" style={{ color: 'var(--aurora-accent-text)' }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--aurora-accent)' }} />
        <span>{canvas.type} · {canvas.agent}</span>
      </div>
      {canvas.type === 'display'     && <DisplayBlocks blocks={canvas.blocks || []} />}
      {canvas.type === 'workflow'    && <Workflow canvas={canvas} onConfirm={onConfirm} />}
      {canvas.type === 'interactive' && <Interactive canvas={canvas} onConfirm={onConfirm} />}
      {canvas.type === 'route'       && <Route canvas={canvas} />}
    </div>
  );
};

function DisplayBlocks({ blocks }: { blocks: CanvasBlock[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'stat_cards':        return <StatCards key={i} items={b.items} />;
          case 'lead_list':         return <ListBlock key={i} items={b.items} />;
          case 'project_grid':      return <ListBlock key={i} items={b.items as any} />;
          case 'bar_chart':         return <BarChart key={i} title={b.title} data={b.data} />;
          case 'donut_chart':       return <BarChart key={i} title={b.title} data={b.data.map(d => ({ x: d.label, y: d.value }))} />;
          case 'attribution_table': return <AttrTable key={i} rows={b.rows} />;
          case 'markdown_block':    return <div key={i} className="text-xs whitespace-pre-wrap font-mono bg-zinc-50 dark:bg-zinc-900 rounded p-2">{b.body}</div>;
          default: return null;
        }
      })}
    </>
  );
}

function StatCards({ items }: { items: any[] }) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {items.slice(0, 4).map((it, i) => (
        <div key={i} className="bg-zinc-50 dark:bg-zinc-900 rounded-lg px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">{it.label}</div>
          <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">{it.value}</div>
          {it.sublabel && <div className="text-[10px] text-zinc-500 mt-0.5">{it.sublabel}</div>}
          {it.trend && <div className="text-[10px] mt-0.5" style={{ color: 'var(--aurora-accent-text)' }}>{it.trend}</div>}
        </div>
      ))}
    </div>
  );
}

function ListBlock({ items }: { items: any[] }) {
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2 px-3 py-2 bg-zinc-50 dark:bg-zinc-900 rounded-lg text-xs">
          <div className="font-medium text-zinc-900 dark:text-zinc-100 flex-1 truncate">{it.name || it.title}</div>
          {(it.company || it.client) && <div className="text-zinc-500 text-[11px] truncate">{it.company || it.client}</div>}
          {(it.status || it.health) && (
            <span
              className="px-1.5 py-0.5 text-[10px] rounded-full"
              style={{ background: 'var(--aurora-accent-soft)', color: 'var(--aurora-accent-text)' }}
            >{it.status || it.health}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function BarChart({ title, data }: { title?: string; data: { x: string; y: number }[] }) {
  const max = Math.max(...data.map(d => Number(d.y || 0)), 1);
  return (
    <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-2.5">
      {title && <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">{title}</div>}
      <div className="space-y-1">
        {data.map((d, i) => (
          <div key={i} className="grid grid-cols-[80px_1fr_50px] items-center gap-2 text-[11px]">
            <div className="text-zinc-500 truncate">{d.x}</div>
            <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${(Number(d.y) / max) * 100}%`, background: 'var(--aurora-accent)' }} />
            </div>
            <div className="text-right text-zinc-700 dark:text-zinc-300">{formatNum(d.y)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AttrTable({ rows }: { rows: any[] }) {
  return (
    <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-2.5 text-[11px]">
      <div className="grid grid-cols-[1.2fr_.8fr_.8fr_.8fr_1fr] gap-2 pb-1 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500">
        <span>source</span><span>leads</span><span>qual</span><span>won</span><span>rev</span>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1.2fr_.8fr_.8fr_.8fr_1fr] gap-2 py-1 text-zinc-700 dark:text-zinc-300">
          <span className="truncate">{r.source}</span>
          <span>{r.leads_n}</span>
          <span>{r.qualified_n}</span>
          <span>{r.won_n}</span>
          <span>${Number(r.revenue || 0).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function Workflow({ canvas, onConfirm }: { canvas: Canvas; onConfirm?: () => void }) {
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
        <div className="flex flex-wrap gap-1.5">
          {canvas.stepper.map((s, i) => (
            <span
              key={i}
              className={`px-2 py-0.5 text-[10px] rounded-full ${
                s.status === 'done'
                  ? 'text-white'
                  : s.status === 'failed'
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                  : 'border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-500'
              }`}
              style={s.status === 'done' ? { background: 'var(--aurora-accent)' } : undefined}
            >
              {i + 1}. {s.name}
            </span>
          ))}
        </div>
      )}
      {canvas.diff && canvas.diff.length > 0 && (
        <pre className="text-[10px] bg-zinc-50 dark:bg-zinc-900 rounded p-2 whitespace-pre-wrap break-words font-mono text-zinc-700 dark:text-zinc-300">
{canvas.diff.map(d => `${d.table}.${d.field}: ${JSON.stringify(d.from)} → ${JSON.stringify(d.to)}`).join('\n')}
        </pre>
      )}
      {destructive && (
        <div>
          <div className="text-[11px] text-red-600 dark:text-red-400 mb-1">
            ⚠ Irreversible. Escribí "{canvas.confirm_phrase || 'BORRAR'}" y esperá {cooldownLeft}s.
          </div>
          <input
            value={phrase}
            onChange={e => setPhrase(e.target.value)}
            placeholder={canvas.confirm_phrase || 'BORRAR'}
            className="w-full px-2 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
          />
        </div>
      )}
      {canvas.cta && (
        <div className="flex justify-end gap-2">
          <button onClick={onConfirm} className="px-3 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-800 text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-900">
            {canvas.cta.cancel_label}
          </button>
          <button
            onClick={onConfirm}
            disabled={!ready}
            className="px-3 py-1 text-xs rounded text-white disabled:opacity-40"
            style={{ background: 'var(--aurora-accent)' }}
          >
            {canvas.cta.confirm_label}
          </button>
        </div>
      )}
    </>
  );
}

function Interactive({ canvas, onConfirm }: { canvas: Canvas; onConfirm?: () => void }) {
  const [vals, setVals] = useState<Record<string, any>>(() => Object.fromEntries((canvas.controls || []).map(c => [c.id, c.value])));
  return (
    <>
      <div className="space-y-2">
        {(canvas.controls || []).map(c => (
          <div key={c.id}>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">{c.label}</div>
            {c.kind === 'textarea' && (
              <textarea
                value={vals[c.id] ?? ''}
                onChange={e => setVals(v => ({ ...v, [c.id]: e.target.value }))}
                className="w-full p-2 text-xs rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 min-h-[80px]"
              />
            )}
            {c.kind === 'slider' && (
              <div className="flex items-center gap-2">
                <input type="range" min={c.min} max={c.max} step={c.step} value={vals[c.id]} onChange={e => setVals(v => ({ ...v, [c.id]: parseFloat(e.target.value) }))} className="flex-1" />
                <span className="text-[11px] text-zinc-500 min-w-[36px]">{vals[c.id]}</span>
              </div>
            )}
            {c.kind === 'toggle' && (
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={!!vals[c.id]} onChange={e => setVals(v => ({ ...v, [c.id]: e.target.checked }))} />
                {c.label}
              </label>
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-end mt-2">
        <button
          onClick={onConfirm}
          className="px-3 py-1 text-xs rounded text-white"
          style={{ background: 'var(--aurora-accent)' }}
        >
          {canvas.submit?.label || 'Aplicar'}
        </button>
      </div>
    </>
  );
}

function Route({ canvas }: { canvas: Canvas }) {
  return (
    <div className="text-[11px] text-zinc-500">
      Routing → <strong className="text-zinc-700 dark:text-zinc-300">{canvas.target_agent}</strong>
      {canvas.reason && <span className="italic"> · {canvas.reason}</span>}
    </div>
  );
}

function formatNum(n: any): string {
  const v = Number(n || 0);
  if (Math.abs(v) >= 1000) return v.toLocaleString();
  return String(v);
}
