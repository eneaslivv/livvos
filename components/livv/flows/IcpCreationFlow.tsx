import React from 'react';
import type { CoachFlowDef } from '../CoachFlow';
import { Icons } from '../../ui/Icons';

/**
 * ICP Creation Flow — 5-step wizard that walks the user through defining
 * their first Ideal Customer Profile. Saved into `strategy_icps` on finish.
 *
 * Source: livv-update bundle / livv-os-onboarding.jsx :: FLOWS['strategy:icps']
 *
 * Steps:
 *  1. Name + 3-letter short code
 *  2. Accent color + status
 *  3. 3+ pains (free text, AI uses for outreach drafts)
 *  4. Expansion path (modules they'll grow into)
 *  5. Confirm + finish (preview the card)
 */

export interface IcpData {
  name?: string;
  short?: string;
  color?: string;
  status?: 'active' | 'testing' | 'deprecated';
  pains?: string[];
  path?: string[];
}

const COLORS = [
  { v: '#C4A35A', n: 'Gold' },
  { v: '#6DBEDC', n: 'Sky' },
  { v: '#769268', n: 'Sage' },
  { v: '#F1ADD8', n: 'Pink' },
  { v: '#A855F7', n: 'Lavender' },
  { v: '#5C1D18', n: 'Wine' },
];

const MODULES = ['Sales', 'Content', 'Finance', 'Scaling', 'Strategy', 'Toolkit'];

// Visual preview that builds up as the user fills in each step.
const Visual = ({ data, step }: { data: IcpData; step: number; total: number }) => {
  const c = data.color || '#C4A35A';
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
        <span
          style={{
            position: 'absolute',
            left: 0,
            top: 14,
            bottom: 14,
            width: 3,
            background: c,
            opacity: 0.7,
            borderRadius: '0 9999px 9999px 0',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 9,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#71717a',
            }}
          >
            ICP target
          </span>
          {data.short && (
            <span
              style={{
                padding: '1px 7px',
                background: `color-mix(in oklab, ${c} 14%, transparent)`,
                color: c,
                borderRadius: 4,
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 8.5,
                letterSpacing: '0.08em',
                fontWeight: 600,
              }}
            >
              {data.short}
            </span>
          )}
          <span
            style={{
              marginLeft: 'auto',
              padding: '1px 6px',
              background: data.status === 'active' ? 'rgba(118,146,104,0.13)' : 'rgba(82,82,91,0.08)',
              color: data.status === 'active' ? '#4d6b4d' : '#71717a',
              borderRadius: 4,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 8.5,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            {data.status || 'NEW'}
          </span>
        </div>
        <h3
          style={{
            fontSize: 18,
            margin: '0 0 14px',
            fontWeight: 300,
            letterSpacing: '-0.02em',
            color: '#18181b',
          }}
        >
          {data.name || 'Your ICP name'}
        </h3>

        {step >= 2 && data.pains && data.pains.filter(Boolean).length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 9,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: '#71717a',
                marginBottom: 6,
              }}
            >
              Pains · {data.pains.filter(Boolean).length}
            </div>
            {data.pains.filter(Boolean).slice(0, 3).map((p, i) => (
              <div
                key={i}
                style={{ fontSize: 11.5, color: '#3f3f46', padding: '3px 0', display: 'flex', gap: 6 }}
              >
                <span
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: 9999,
                    background: c,
                    marginTop: 6,
                    flexShrink: 0,
                  }}
                />
                <span>{p}</span>
              </div>
            ))}
          </div>
        )}

        {step >= 3 && data.path && data.path.length > 0 && (
          <div
            style={{
              marginTop: 14,
              paddingTop: 12,
              borderTop: '1px dashed rgba(90,62,62,0.12)',
            }}
          >
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 9,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: '#71717a',
                marginBottom: 6,
              }}
            >
              Expansion path · {data.path.length}
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {data.path.map((m, i) => (
                <span
                  key={m}
                  style={{
                    padding: '2px 9px',
                    background: `color-mix(in oklab, ${c} ${10 + i * 4}%, #ffffff)`,
                    border: `0.5px solid color-mix(in oklab, ${c} 30%, transparent)`,
                    color: `color-mix(in oklab, ${c} 75%, #18181b)`,
                    borderRadius: 9999,
                    fontSize: 11,
                    fontWeight: 500,
                  }}
                >
                  {m}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      <div
        style={{
          marginTop: 14,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10.5,
          letterSpacing: '0.04em',
          color: '#a1a1aa',
          textAlign: 'center',
        }}
      >
        ↑ live preview of your ICP card
      </div>
    </div>
  );
};

export const ICP_CREATION_FLOW: CoachFlowDef<IcpData> = {
  tag: 'Define your first ICP',
  initial: { pains: ['', '', ''], path: [] },
  visual: Visual,
  steps: [
    // STEP 1 — Name + short code
    {
      title: (
        <>
          Start with <span className="accent">who you sell to</span>
        </>
      ),
      desc:
        'An ICP is a sharp answer to "who do we serve best?". Most teams skip this — and then nothing else lines up. Pick the first one with intention.',
      why:
        'The ICP is the seed for everything: pricing, content angles, outreach messaging, hiring. Without it, AI is guessing.',
      fields: ({ data, set }) => (
        <div className="coach-form">
          <div className="coach-field">
            <span className="coach-field-label">ICP name</span>
            <input
              className="coach-input"
              placeholder="e.g. Boutique creative agencies"
              value={data.name || ''}
              onChange={e => set('name', e.target.value)}
            />
          </div>
          <div className="coach-field">
            <span className="coach-field-label">3-letter short code</span>
            <input
              className="coach-input"
              maxLength={3}
              style={{
                width: 120,
                fontFamily: 'JetBrains Mono, monospace',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
              placeholder="AGY"
              value={data.short || ''}
              onChange={e => set('short', e.target.value.toUpperCase())}
            />
          </div>
          <div className="coach-suggest">
            <span
              className="coach-suggest-chip"
              onClick={() => {
                set('name', 'Boutique agencies');
                set('short', 'AGY');
              }}
            >
              Boutique agencies
            </span>
            <span
              className="coach-suggest-chip"
              onClick={() => {
                set('name', 'Independent consultants');
                set('short', 'CON');
              }}
            >
              Independent consultants
            </span>
            <span
              className="coach-suggest-chip"
              onClick={() => {
                set('name', 'SaaS founders');
                set('short', 'SAS');
              }}
            >
              SaaS founders
            </span>
          </div>
        </div>
      ),
      canNext: d => !!d.name && !!d.short && d.short.length >= 2,
    },

    // STEP 2 — Color + status
    {
      title: (
        <>
          Pick a <span className="accent">color</span> and a status
        </>
      ),
      desc:
        "Colors aren't decoration — they let you spot ICP patterns across leads, content and KPIs in seconds. Status tells the system whether this ICP is in production or still in test.",
      why:
        'The color you pick becomes the accent on every lead card, every content piece and every cohort chart for this ICP across LIVV OS.',
      fields: ({ data, set }) => (
        <div className="coach-form">
          <div className="coach-field">
            <span className="coach-field-label">Accent color</span>
            <div className="coach-choices">
              {COLORS.map(c => (
                <button
                  key={c.v}
                  type="button"
                  className={`coach-choice ${data.color === c.v ? 'sel' : ''}`}
                  onClick={() => set('color', c.v)}
                >
                  <span className="sw" style={{ background: c.v }} />
                  {c.n}
                </button>
              ))}
            </div>
          </div>
          <div className="coach-field">
            <span className="coach-field-label">Status</span>
            <div className="coach-choices">
              {(['active', 'testing', 'deprecated'] as const).map(s => (
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
        </div>
      ),
      canNext: d => !!d.color && !!d.status,
    },

    // STEP 3 — Pains
    {
      title: (
        <>
          Name <span className="accent">3 pains</span> they wake up with
        </>
      ),
      desc:
        'Write them in the words your prospect uses on a discovery call. Not features, not buzzwords — actual sentences. These will fuel outreach, content angles, and AI summaries downstream.',
      why:
        "When AI drafts your next cold email or case study, it pulls directly from this list. Vague pains = vague messaging.",
      fields: ({ data, set }) => {
        const pains = data.pains || ['', '', ''];
        const update = (i: number, v: string) => {
          const next = [...pains];
          next[i] = v;
          set('pains', next);
        };
        return (
          <div className="coach-bullets">
            {pains.map((p, i) => (
              <div key={i} className="coach-bullet">
                <input
                  placeholder={`Pain ${i + 1} — e.g. "I'm the bottleneck on every proposal"`}
                  value={p}
                  onChange={e => update(i, e.target.value)}
                />
                <button
                  type="button"
                  className="rm"
                  onClick={() => set('pains', pains.filter((_, j) => j !== i))}
                  aria-label="Remove"
                >
                  <Icons.X size={12} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="coach-add-bullet"
              onClick={() => set('pains', [...pains, ''])}
            >
              <Icons.Plus size={12} />
              Add pain
            </button>
          </div>
        );
      },
      canNext: d => (d.pains || []).filter(Boolean).length >= 2,
    },

    // STEP 4 — Expansion path
    {
      title: (
        <>
          Sketch the <span className="accent">expansion path</span>
        </>
      ),
      desc:
        "What's the first module you sell? Then where do they grow with you? Most accounts double in revenue once you map this — because every module sale has a clear next.",
      why:
        'LIVV uses this path to recommend the next package to upsell to every active client in this ICP. The system pings you when an account is ready.',
      fields: ({ data, set }) => {
        const path = data.path || [];
        const toggle = (m: string) => {
          const next = path.includes(m) ? path.filter(x => x !== m) : [...path, m];
          set('path', next);
        };
        return (
          <div className="coach-form">
            <div className="coach-field">
              <span className="coach-field-label">Modules in their journey (in order)</span>
              <div className="coach-choices">
                {MODULES.map(m => (
                  <button
                    key={m}
                    type="button"
                    className={`coach-choice ${path.includes(m) ? 'sel' : ''}`}
                    onClick={() => toggle(m)}
                  >
                    {path.includes(m) && (
                      <span
                        style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: 9,
                          fontWeight: 700,
                          minWidth: 10,
                          textAlign: 'center',
                        }}
                      >
                        {path.indexOf(m) + 1}
                      </span>
                    )}
                    {m}
                  </button>
                ))}
              </div>
              {path.length > 0 && (
                <div style={{ fontSize: 11, color: '#71717a', marginTop: 6 }}>
                  Path: <strong style={{ color: '#3f3f46', fontWeight: 500 }}>{path.join(' → ')}</strong>
                </div>
              )}
            </div>
          </div>
        );
      },
      canNext: d => (d.path || []).length >= 1,
    },

    // STEP 5 — Confirm
    {
      title: (
        <>
          You're <span className="accent">ready</span> to save this ICP
        </>
      ),
      desc:
        "Hit finish and we'll create this ICP across LIVV — pipeline cards, content briefs, outreach drafts and KPIs will all start tagging against it. You can edit any field later from Strategy → ICPs.",
      why:
        'The richer this profile, the smarter every AI suggestion gets. Most teams refine their ICP every 3 months — that\'s a healthy cadence.',
      fields: ({ data }) => (
        <div
          style={{
            padding: 16,
            background: 'linear-gradient(110deg, rgba(118,146,104,0.08) 0%, #ffffff 100%)',
            border: '0.5px solid rgba(118,146,104,0.3)',
            borderRadius: 11,
          }}
        >
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 9.5,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: '#4d6b4d',
              fontWeight: 600,
              marginBottom: 10,
            }}
          >
            Summary
          </div>
          <dl style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 10 }}>
              <dt style={{ color: '#71717a' }}>Name</dt>
              <dd style={{ margin: 0, color: '#18181b', fontWeight: 500 }}>{data.name}</dd>
              <dt style={{ color: '#71717a' }}>Short code</dt>
              <dd
                style={{
                  margin: 0,
                  color: '#18181b',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontWeight: 600,
                }}
              >
                {data.short}
              </dd>
              <dt style={{ color: '#71717a' }}>Color</dt>
              <dd
                style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 4,
                    background: data.color,
                    border: '0.5px solid rgba(0,0,0,0.1)',
                  }}
                />
                <span style={{ color: '#18181b', fontWeight: 500 }}>{data.color}</span>
              </dd>
              <dt style={{ color: '#71717a' }}>Status</dt>
              <dd style={{ margin: 0, color: '#18181b', fontWeight: 500 }}>{data.status}</dd>
              <dt style={{ color: '#71717a' }}>Pains</dt>
              <dd style={{ margin: 0, color: '#18181b' }}>
                {(data.pains || []).filter(Boolean).length}
              </dd>
              <dt style={{ color: '#71717a' }}>Path</dt>
              <dd style={{ margin: 0, color: '#18181b', fontWeight: 500 }}>
                {(data.path || []).join(' → ')}
              </dd>
            </div>
          </dl>
        </div>
      ),
      canNext: () => true,
    },
  ],
};
