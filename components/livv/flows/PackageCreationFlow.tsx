import React from 'react';
import type { CoachFlowDef } from '../CoachFlow';
import { Icons } from '../../ui/Icons';

/**
 * Package Creation Flow — 4 steps to build a sellable service package.
 *
 * Source: livv-update / livv-os-onboarding.jsx :: FLOWS['strategy:packages']
 *
 *  Step 1: Name + target ICP + status
 *  Step 2: Modules included (toggle list)
 *  Step 3: Pricing (implementation + monthly + weeks)
 *  Step 4: Deliverables (dynamic add/remove)
 *  Step 5: Summary preview
 */

export interface PackageData {
  name?: string;
  target_icp_id?: string | null;
  status?: 'draft' | 'active' | 'deprecated';
  modules_included?: string[];
  price_implementation?: number | null;
  price_monthly?: number | null;
  implementation_weeks?: number | null;
  deliverables?: string[];
}

interface FlowCtx {
  icps: Array<{ id: string; name: string; color?: string }>;
}

const MODULES = ['Sales', 'Content', 'Finance', 'Scaling', 'Strategy', 'Toolkit', 'Brief', 'Activity'];

const Visual = ({ data, step, ctx }: { data: PackageData; step: number; total: number; ctx?: FlowCtx }) => {
  const icp = ctx?.icps.find(i => i.id === data.target_icp_id);
  const color = icp?.color || '#c4a35a';
  const total12 = (data.price_implementation || 0) + (data.price_monthly || 0) * 12;
  return (
    <div style={{ width: '100%', maxWidth: 340 }}>
      <div
        style={{
          position: 'relative',
          padding: 22,
          background: '#ffffff',
          border: '0.5px solid rgba(214,209,199,0.55)',
          borderRadius: 14,
          boxShadow: '0 1px 0 rgba(255,255,255,0.6) inset, 0 8px 24px -12px rgba(44,4,5,0.06)',
        }}
      >
        <span style={{
          position: 'absolute', left: 0, top: 14, bottom: 14, width: 3,
          background: color, opacity: 0.7, borderRadius: '0 9999px 9999px 0',
        }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
            letterSpacing: '0.18em', textTransform: 'uppercase', color: '#71717a',
          }}>{icp ? `ICP · ${icp.name}` : 'Pick target ICP'}</span>
          <span style={{
            marginLeft: 'auto', padding: '1px 6px',
            background: data.status === 'active' ? 'rgba(118,146,104,0.13)' : 'rgba(82,82,91,0.08)',
            color: data.status === 'active' ? '#4d6b4d' : '#71717a',
            borderRadius: 4, fontFamily: 'JetBrains Mono, monospace', fontSize: 8.5,
            letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600,
          }}>{data.status || 'DRAFT'}</span>
        </div>
        <h3 style={{ fontSize: 18, margin: '0 0 14px', fontWeight: 300, letterSpacing: '-0.02em', color: '#18181b' }}>
          {data.name || 'Your package name'}
        </h3>

        {step >= 1 && data.modules_included && data.modules_included.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{
              fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
              letterSpacing: '0.18em', textTransform: 'uppercase', color: '#71717a', marginBottom: 6,
            }}>Modules · {data.modules_included.length}</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {data.modules_included.map(m => (
                <span key={m} style={{
                  padding: '2px 8px',
                  background: `color-mix(in oklab, ${color} 10%, #fff)`,
                  border: `0.5px solid color-mix(in oklab, ${color} 30%, transparent)`,
                  color: `color-mix(in oklab, ${color} 75%, #18181b)`,
                  borderRadius: 9999, fontSize: 10.5, fontWeight: 500,
                }}>{m}</span>
              ))}
            </div>
          </div>
        )}

        {step >= 2 && (data.price_implementation || data.price_monthly) && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1,
            background: 'rgba(214,209,199,0.5)', borderRadius: 9, overflow: 'hidden',
            border: '0.5px solid rgba(90,62,62,0.1)', marginBottom: 12,
          }}>
            {[
              { l: 'Impl', v: data.price_implementation, suffix: '' },
              { l: 'Monthly', v: data.price_monthly, suffix: '/mo', tone: color },
              { l: 'Weeks', v: data.implementation_weeks, suffix: 'w', mono: true },
            ].map((cell, i) => (
              <div key={i} style={{ background: '#fff', padding: '10px 12px' }}>
                <div style={{
                  fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
                  letterSpacing: '0.16em', textTransform: 'uppercase',
                  color: '#71717a', marginBottom: 3,
                }}>{cell.l}</div>
                <div style={{
                  fontSize: 14, fontWeight: 500,
                  color: (cell as any).tone || '#18181b',
                  fontFamily: cell.mono ? 'JetBrains Mono, monospace' : 'inherit',
                }}>
                  {cell.v != null ? (cell.mono ? `${cell.v}${cell.suffix}` : `$${(cell.v / 1000).toFixed(1)}K${cell.suffix}`) : '—'}
                </div>
              </div>
            ))}
          </div>
        )}

        {step >= 3 && data.deliverables && data.deliverables.filter(Boolean).length > 0 && (
          <div style={{ paddingTop: 12, borderTop: '1px dashed rgba(90,62,62,0.12)' }}>
            <div style={{
              fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
              letterSpacing: '0.18em', textTransform: 'uppercase', color: '#71717a', marginBottom: 6,
            }}>Deliverables · {data.deliverables.filter(Boolean).length}</div>
            {data.deliverables.filter(Boolean).slice(0, 4).map((d, i) => (
              <div key={i} style={{ fontSize: 11.5, color: '#3f3f46', padding: '3px 0', display: 'flex', gap: 6 }}>
                <span style={{ width: 4, height: 4, borderRadius: 9999, background: color, marginTop: 6, flexShrink: 0 }} />
                <span>{d}</span>
              </div>
            ))}
          </div>
        )}

        {step >= 3 && total12 > 0 && (
          <div style={{
            marginTop: 14, padding: '8px 12px',
            background: `color-mix(in oklab, ${color} 8%, #fff)`,
            borderRadius: 9, fontSize: 11.5, color: '#3f3f46',
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase' }}>12-mo total</span>
            <strong style={{ color: '#18181b', fontWeight: 500, fontSize: 16 }}>${(total12 / 1000).toFixed(0)}K</strong>
          </div>
        )}
      </div>
      <div style={{
        marginTop: 14, fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5,
        letterSpacing: '0.04em', color: '#a1a1aa', textAlign: 'center',
      }}>↑ live preview of your package card</div>
    </div>
  );
};

export function buildPackageFlow(ctx: FlowCtx): CoachFlowDef<PackageData> {
  return {
    tag: 'Build a sellable package',
    initial: { deliverables: ['', '', ''], modules_included: [], status: 'draft' },
    visual: (vctx) => <Visual {...vctx} ctx={ctx} />,
    steps: [
      // STEP 1 — Name + target ICP
      {
        title: <>Anchor it to <span className="accent">one ICP</span></>,
        desc: 'Generic packages convert poorly. Pick the ICP this package was built for — pricing, content, and outreach will all align downstream.',
        why: 'When the package is tagged to an ICP, the AI uses that ICP\'s pain points + voice + pricing logic to draft proposals automatically.',
        fields: ({ data, set }) => (
          <div className="coach-form">
            <div className="coach-field">
              <span className="coach-field-label">Package name</span>
              <input
                className="coach-input"
                placeholder="e.g. Agency OS · 6-week implementation"
                value={data.name || ''}
                onChange={e => set('name', e.target.value)}
              />
            </div>
            <div className="coach-field">
              <span className="coach-field-label">Target ICP</span>
              <div className="coach-choices">
                {ctx.icps.length === 0 ? (
                  <span style={{ color: '#a1a1aa', fontSize: 12.5, fontStyle: 'italic' }}>
                    No ICPs yet — define one first to anchor this package.
                  </span>
                ) : ctx.icps.map(i => (
                  <button
                    key={i.id}
                    type="button"
                    className={`coach-choice ${data.target_icp_id === i.id ? 'sel' : ''}`}
                    onClick={() => set('target_icp_id', i.id)}
                  >
                    <span className="sw" style={{ background: i.color || '#c4a35a' }} />
                    {i.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ),
        canNext: d => !!d.name && !!d.target_icp_id,
      },

      // STEP 2 — Modules
      {
        title: <>What <span className="accent">modules</span> are inside?</>,
        desc: "Pick the modules of LIVV OS this package activates for the client. The first one is the entry point — what they actually pay for first.",
        why: 'Cross-references the ICP\'s expansion_path so we can recommend upsell paths to active clients automatically.',
        fields: ({ data, set }) => {
          const sel = data.modules_included || [];
          const toggle = (m: string) => {
            const next = sel.includes(m) ? sel.filter(x => x !== m) : [...sel, m];
            set('modules_included', next);
          };
          return (
            <div className="coach-form">
              <div className="coach-field">
                <span className="coach-field-label">Included modules</span>
                <div className="coach-choices">
                  {MODULES.map(m => (
                    <button
                      key={m}
                      type="button"
                      className={`coach-choice ${sel.includes(m) ? 'sel' : ''}`}
                      onClick={() => toggle(m)}
                    >
                      {sel.includes(m) && (
                        <span style={{
                          fontFamily: 'JetBrains Mono, monospace', fontSize: 9, fontWeight: 700,
                          minWidth: 10, textAlign: 'center',
                        }}>{sel.indexOf(m) + 1}</span>
                      )}
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        },
        canNext: d => (d.modules_included || []).length >= 1,
      },

      // STEP 3 — Pricing
      {
        title: <>Set the <span className="accent">price tag</span></>,
        desc: 'Implementation is paid once. Retainer is the monthly recurring. Be explicit — vague pricing kills deals at the proposal stage.',
        why: 'These numbers drive every downstream pipeline calc: deal value, MRR projections, ARR per ICP. They also auto-populate proposals.',
        fields: ({ data, set }) => (
          <div className="coach-form">
            <div className="coach-field">
              <span className="coach-field-label">Implementation $ (one-time)</span>
              <input
                className="coach-input"
                type="number"
                placeholder="12000"
                value={data.price_implementation ?? ''}
                onChange={e => set('price_implementation', e.target.value ? Number(e.target.value) : null)}
                style={{ maxWidth: 200 }}
              />
            </div>
            <div className="coach-field">
              <span className="coach-field-label">Monthly retainer $</span>
              <input
                className="coach-input"
                type="number"
                placeholder="2500"
                value={data.price_monthly ?? ''}
                onChange={e => set('price_monthly', e.target.value ? Number(e.target.value) : null)}
                style={{ maxWidth: 200 }}
              />
            </div>
            <div className="coach-field">
              <span className="coach-field-label">Implementation weeks</span>
              <input
                className="coach-input"
                type="number"
                placeholder="6"
                value={data.implementation_weeks ?? ''}
                onChange={e => set('implementation_weeks', e.target.value ? Number(e.target.value) : null)}
                style={{ maxWidth: 200 }}
              />
            </div>
          </div>
        ),
        canNext: d => d.price_implementation != null || d.price_monthly != null,
      },

      // STEP 4 — Deliverables
      {
        title: <>Spell out the <span className="accent">deliverables</span></>,
        desc: 'Exactly what the client receives, in their words. Tangible, specific, scope-bounded. Vague deliverables = scope creep = unprofitable engagements.',
        why: 'When a deal closes, these become the auto-generated project tasks. The proposal PDF also lists them under "What you\'ll get".',
        fields: ({ data, set }) => {
          const items = data.deliverables || ['', '', ''];
          const update = (i: number, v: string) => {
            const next = [...items];
            next[i] = v;
            set('deliverables', next);
          };
          return (
            <div className="coach-bullets">
              {items.map((it, i) => (
                <div key={i} className="coach-bullet">
                  <input
                    placeholder={`Deliverable ${i + 1} — e.g. "Brand kit · 3 pages + style guide"`}
                    value={it}
                    onChange={e => update(i, e.target.value)}
                  />
                  <button
                    type="button"
                    className="rm"
                    onClick={() => set('deliverables', items.filter((_, j) => j !== i))}
                    aria-label="Remove"
                  >
                    <Icons.X size={12} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="coach-add-bullet"
                onClick={() => set('deliverables', [...items, ''])}
              >
                <Icons.Plus size={12} />
                Add deliverable
              </button>
            </div>
          );
        },
        canNext: d => (d.deliverables || []).filter(Boolean).length >= 1,
      },

      // STEP 5 — Confirm + activate
      {
        title: <>Activate the <span className="accent">package</span></>,
        desc: "Draft means it's saved but not yet sellable. Active means it shows up in proposals + AI drafts. You can flip status anytime.",
        why: 'Marking a package active triggers the system to start matching pipeline leads against it and surfacing upsell paths.',
        fields: ({ data, set }) => (
          <div className="coach-form">
            <div className="coach-field">
              <span className="coach-field-label">Initial status</span>
              <div className="coach-choices">
                {(['draft', 'active', 'deprecated'] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    className={`coach-choice ${data.status === s ? 'sel' : ''}`}
                    onClick={() => set('status', s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div style={{
              padding: 14,
              background: 'linear-gradient(110deg, rgba(118,146,104,0.08) 0%, #ffffff 100%)',
              border: '0.5px solid rgba(118,146,104,0.3)',
              borderRadius: 11,
              marginTop: 12,
            }}>
              <div style={{
                fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5,
                letterSpacing: '0.2em', textTransform: 'uppercase', color: '#4d6b4d',
                fontWeight: 600, marginBottom: 8,
              }}>Summary</div>
              <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                <strong style={{ color: '#18181b' }}>{data.name}</strong>
                <span style={{ color: '#71717a' }}>{' · '}{ctx.icps.find(i => i.id === data.target_icp_id)?.name || '—'}</span>
                <br />
                <span style={{ color: '#71717a', fontSize: 12 }}>
                  {(data.modules_included || []).length} modules · {(data.deliverables || []).filter(Boolean).length} deliverables
                  · ${(data.price_implementation || 0).toLocaleString()} + ${(data.price_monthly || 0).toLocaleString()}/mo
                </span>
              </div>
            </div>
          </div>
        ),
        canNext: d => !!d.status,
      },
    ],
  };
}
