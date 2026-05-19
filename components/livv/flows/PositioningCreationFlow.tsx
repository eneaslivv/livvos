import React from 'react';
import type { CoachFlowDef } from '../CoachFlow';
import { Icons } from '../../ui/Icons';

/**
 * Positioning Creation Flow — 4 steps to define a brand-positioning principle.
 *
 * Source: livv-update / livv-os-onboarding.jsx :: FLOWS['strategy:positioning']
 *
 *  Step 1: Principle + description
 *  Step 2: Compass position (axis X/Y on a 2x2 internal/external × tactical/strategic)
 *  Step 3: Tags + examples
 *  Step 4: Applies-to surfaces
 *  Step 5: Confirm
 */

export interface PositioningData {
  principle?: string;
  description?: string;
  // Compass — values are 0..1 on each axis
  axis_x?: number; // 0 = internal, 1 = external
  axis_y?: number; // 0 = tactical, 1 = strategic
  tag_color?: string;
  tags?: string[];
  examples?: string[];
  applies_to?: string[];
}

const TAG_COLORS = [
  { v: '#C4A35A', n: 'Gold' },
  { v: '#6DBEDC', n: 'Sky' },
  { v: '#769268', n: 'Sage' },
  { v: '#F1ADD8', n: 'Pink' },
  { v: '#A855F7', n: 'Lavender' },
];

const SURFACES = ['Sales pitch', 'Website', 'Content', 'Brand voice', 'Hiring', 'Pricing'];

const Visual = ({ data, step }: { data: PositioningData; step: number; total: number }) => {
  const c = data.tag_color || '#C4A35A';
  const ax = data.axis_x ?? 0.5;
  const ay = data.axis_y ?? 0.5;
  return (
    <div style={{ width: '100%', maxWidth: 340 }}>
      {/* Mini compass — 2x2 grid */}
      <div style={{
        position: 'relative', height: 160,
        background: 'rgba(82,82,91,0.04)',
        border: '0.5px solid rgba(214,209,199,0.55)',
        borderRadius: 12, padding: 16, marginBottom: 14,
      }}>
        <span style={{
          position: 'absolute', top: '50%', left: 12, right: 12, height: 1,
          background: 'rgba(90,62,62,0.18)',
          backgroundImage: 'linear-gradient(90deg, rgba(90,62,62,0.18) 50%, transparent 50%)',
          backgroundSize: '6px 1px',
        }} />
        <span style={{
          position: 'absolute', top: 12, bottom: 12, left: '50%', width: 1,
          background: 'rgba(90,62,62,0.18)',
          backgroundImage: 'linear-gradient(180deg, rgba(90,62,62,0.18) 50%, transparent 50%)',
          backgroundSize: '1px 6px',
        }} />
        {/* Axis labels */}
        <span style={{
          position: 'absolute', top: 8, left: 10,
          fontFamily: 'JetBrains Mono, monospace', fontSize: 8,
          letterSpacing: '0.14em', color: '#a1a1aa', textTransform: 'uppercase',
        }}>Internal</span>
        <span style={{
          position: 'absolute', top: 8, right: 10,
          fontFamily: 'JetBrains Mono, monospace', fontSize: 8,
          letterSpacing: '0.14em', color: '#a1a1aa', textTransform: 'uppercase',
        }}>External</span>
        <span style={{
          position: 'absolute', bottom: 8, left: 10,
          fontFamily: 'JetBrains Mono, monospace', fontSize: 8,
          letterSpacing: '0.14em', color: '#a1a1aa', textTransform: 'uppercase',
        }}>Tactical</span>
        <span style={{
          position: 'absolute', bottom: 8, right: 10,
          fontFamily: 'JetBrains Mono, monospace', fontSize: 8,
          letterSpacing: '0.14em', color: '#a1a1aa', textTransform: 'uppercase',
        }}>Strategic</span>
        {step >= 1 && (
          <span style={{
            position: 'absolute',
            left: `${ax * 100}%`,
            bottom: `${ay * 100}%`,
            transform: 'translate(-50%, 50%)',
            width: 26, height: 26, borderRadius: 9999,
            background: c, border: '2px solid #fff',
            color: '#fff', fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 0 4px color-mix(in oklab, ${c} 18%, transparent)`,
            fontFamily: 'JetBrains Mono, monospace',
          }}>01</span>
        )}
      </div>

      {/* Principle card */}
      <div style={{
        background: '#fff', border: '0.5px solid rgba(214,209,199,0.55)',
        borderRadius: 12, padding: 16, position: 'relative', overflow: 'hidden',
      }}>
        <span style={{
          position: 'absolute', top: 0, left: 0, bottom: 0,
          width: 3, background: c, opacity: 0.7,
        }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
            letterSpacing: '0.14em', color: '#a1a1aa',
          }}>01</span>
        </div>
        <h3 style={{
          fontSize: 15, fontWeight: 500, letterSpacing: '-0.012em',
          margin: '0 0 6px', color: '#18181b',
        }}>{data.principle || 'Your principle'}</h3>
        <p style={{
          margin: 0, fontSize: 12, lineHeight: 1.55, color: '#3f3f46',
          minHeight: 38,
        }}>{data.description || 'Describe the operating belief in one or two sentences.'}</p>

        {step >= 2 && data.tags && data.tags.length > 0 && (
          <div style={{
            display: 'flex', gap: 5, marginTop: 12,
            paddingTop: 10, borderTop: '1px dashed rgba(90,62,62,0.1)',
          }}>
            {data.tags.map(t => (
              <span key={t} style={{
                padding: '2px 8px',
                background: `color-mix(in oklab, ${c} 10%, rgba(82,82,91,0.05))`,
                color: c,
                borderRadius: 9999, fontSize: 10, fontWeight: 500,
              }}>{t}</span>
            ))}
          </div>
        )}
      </div>

      <div style={{
        marginTop: 14, fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10.5, letterSpacing: '0.04em', color: '#a1a1aa', textAlign: 'center',
      }}>↑ compass placement + principle card</div>
    </div>
  );
};

export const POSITIONING_CREATION_FLOW: CoachFlowDef<PositioningData> = {
  tag: 'Define a positioning principle',
  initial: { tags: [], examples: ['', ''], applies_to: [], axis_x: 0.5, axis_y: 0.5 },
  visual: Visual,
  steps: [
    // STEP 1 — Principle + description
    {
      title: <>Name the <span className="accent">operating belief</span></>,
      desc: 'Positioning principles are operating beliefs that show up everywhere — sales pitch, content, hiring, pricing. State the principle in 5-8 words. Then explain it in 1-2 sentences.',
      why: 'These principles become the foundation of every AI draft. If they\'re vague, every output sounds generic.',
      fields: ({ data, set }) => (
        <div className="coach-form">
          <div className="coach-field">
            <span className="coach-field-label">Principle title (short)</span>
            <input
              className="coach-input"
              placeholder={`e.g. "Show, don't tell"`}
              value={data.principle || ''}
              onChange={e => set('principle', e.target.value)}
            />
          </div>
          <div className="coach-field">
            <span className="coach-field-label">Description (1–2 sentences)</span>
            <textarea
              className="coach-input"
              rows={3}
              placeholder="We never describe quality. We render it. Every artifact ships in its finished form so the work proves itself."
              value={data.description || ''}
              onChange={e => set('description', e.target.value)}
              style={{ resize: 'vertical', minHeight: 80, fontFamily: 'inherit' }}
            />
          </div>
        </div>
      ),
      canNext: d => !!d.principle && !!d.description,
    },

    // STEP 2 — Compass + tag color
    {
      title: <>Plot it on the <span className="accent">compass</span></>,
      desc: "Drag the dot to where this principle sits — internal/external (who lives by it) × tactical/strategic (how deep the change goes).",
      why: 'Plotting compresses your positioning so you can see clusters. Most teams have everything in one corner — and that\'s a warning.',
      fields: ({ data, set }) => (
        <div className="coach-form">
          <div className="coach-field">
            <span className="coach-field-label">Internal ↔ External</span>
            <input
              type="range" min={0} max={100} step={1}
              value={Math.round((data.axis_x ?? 0.5) * 100)}
              onChange={e => set('axis_x', Number(e.target.value) / 100)}
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#71717a', fontFamily: 'JetBrains Mono, monospace' }}>
              <span>Internal</span>
              <span>{Math.round((data.axis_x ?? 0.5) * 100)}%</span>
              <span>External</span>
            </div>
          </div>
          <div className="coach-field">
            <span className="coach-field-label">Tactical ↔ Strategic</span>
            <input
              type="range" min={0} max={100} step={1}
              value={Math.round((data.axis_y ?? 0.5) * 100)}
              onChange={e => set('axis_y', Number(e.target.value) / 100)}
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#71717a', fontFamily: 'JetBrains Mono, monospace' }}>
              <span>Tactical</span>
              <span>{Math.round((data.axis_y ?? 0.5) * 100)}%</span>
              <span>Strategic</span>
            </div>
          </div>
          <div className="coach-field">
            <span className="coach-field-label">Tag color</span>
            <div className="coach-choices">
              {TAG_COLORS.map(c => (
                <button
                  key={c.v}
                  type="button"
                  className={`coach-choice ${data.tag_color === c.v ? 'sel' : ''}`}
                  onClick={() => set('tag_color', c.v)}
                >
                  <span className="sw" style={{ background: c.v }} />
                  {c.n}
                </button>
              ))}
            </div>
          </div>
        </div>
      ),
      canNext: d => d.axis_x != null && d.axis_y != null && !!d.tag_color,
    },

    // STEP 3 — Tags + examples
    {
      title: <>Add <span className="accent">tags</span> and 2 examples</>,
      desc: 'Tags become the cross-references AI uses when drafting. Examples are real artifacts that already live this principle — point to them and we lock the pattern.',
      why: 'When AI drafts a new piece, it pulls the closest example to ground itself. Empty examples = generic outputs.',
      fields: ({ data, set }) => {
        const tags = data.tags || [];
        const examples = data.examples || ['', ''];
        return (
          <div className="coach-form">
            <div className="coach-field">
              <span className="coach-field-label">Tags (comma-sep)</span>
              <input
                className="coach-input"
                placeholder="positioning, voice, deliverables"
                value={tags.join(', ')}
                onChange={e => set('tags', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              />
            </div>
            <div className="coach-field">
              <span className="coach-field-label">Live examples</span>
              <div className="coach-bullets">
                {examples.map((ex, i) => (
                  <div key={i} className="coach-bullet">
                    <input
                      placeholder={`Example ${i + 1} — link or short description`}
                      value={ex}
                      onChange={e => {
                        const next = [...examples];
                        next[i] = e.target.value;
                        set('examples', next);
                      }}
                    />
                    <button
                      type="button"
                      className="rm"
                      onClick={() => set('examples', examples.filter((_, j) => j !== i))}
                    >
                      <Icons.X size={12} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="coach-add-bullet"
                  onClick={() => set('examples', [...examples, ''])}
                >
                  <Icons.Plus size={12} />Add example
                </button>
              </div>
            </div>
          </div>
        );
      },
      canNext: d => (d.tags || []).length >= 1 && (d.examples || []).filter(Boolean).length >= 1,
    },

    // STEP 4 — Applies to
    {
      title: <>Where does it <span className="accent">show up</span>?</>,
      desc: "Pick the surfaces this principle applies to. The system uses this to gate which AI drafts pull it in.",
      why: "If everything applies everywhere, nothing applies anywhere. Be specific.",
      fields: ({ data, set }) => {
        const sel = data.applies_to || [];
        const toggle = (s: string) => {
          set('applies_to', sel.includes(s) ? sel.filter(x => x !== s) : [...sel, s]);
        };
        return (
          <div className="coach-form">
            <div className="coach-field">
              <span className="coach-field-label">Applies to surfaces</span>
              <div className="coach-choices">
                {SURFACES.map(s => (
                  <button
                    key={s}
                    type="button"
                    className={`coach-choice ${sel.includes(s) ? 'sel' : ''}`}
                    onClick={() => toggle(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      },
      canNext: d => (d.applies_to || []).length >= 1,
    },

    // STEP 5 — Confirm
    {
      title: <>Ready to <span className="accent">save</span></>,
      desc: "This principle will start showing up in AI drafts immediately. Edit any field later from Strategy → Positioning.",
      why: "Most teams refine their positioning every 6 months. That's a healthy cadence.",
      fields: ({ data }) => (
        <div style={{
          padding: 16,
          background: 'linear-gradient(110deg, rgba(118,146,104,0.08) 0%, #ffffff 100%)',
          border: '0.5px solid rgba(118,146,104,0.3)',
          borderRadius: 11,
        }}>
          <div style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5,
            letterSpacing: '0.2em', textTransform: 'uppercase', color: '#4d6b4d',
            fontWeight: 600, marginBottom: 10,
          }}>Summary</div>
          <dl style={{ margin: 0, fontSize: 13, lineHeight: 1.7, display: 'grid', gridTemplateColumns: '110px 1fr', gap: 10 }}>
            <dt style={{ color: '#71717a' }}>Principle</dt>
            <dd style={{ margin: 0, color: '#18181b', fontWeight: 500 }}>{data.principle}</dd>
            <dt style={{ color: '#71717a' }}>Compass</dt>
            <dd style={{ margin: 0, color: '#18181b', fontFamily: 'JetBrains Mono, monospace' }}>
              {Math.round((data.axis_x ?? 0.5) * 100)}, {Math.round((data.axis_y ?? 0.5) * 100)}
            </dd>
            <dt style={{ color: '#71717a' }}>Tags</dt>
            <dd style={{ margin: 0, color: '#18181b' }}>{(data.tags || []).join(', ')}</dd>
            <dt style={{ color: '#71717a' }}>Examples</dt>
            <dd style={{ margin: 0, color: '#18181b' }}>{(data.examples || []).filter(Boolean).length}</dd>
            <dt style={{ color: '#71717a' }}>Surfaces</dt>
            <dd style={{ margin: 0, color: '#18181b' }}>{(data.applies_to || []).join(', ')}</dd>
          </dl>
        </div>
      ),
      canNext: () => true,
    },
  ],
};
