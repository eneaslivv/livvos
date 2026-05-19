import React from 'react';
import type { CoachFlowDef } from '../CoachFlow';
import { Icons } from '../../ui/Icons';

/**
 * Content Engine setup flow — "Build your content engine".
 * Source: livv-update / livv-os-onboarding.jsx (FLOWS['content:calendar'])
 *
 * 3 steps matching the bundle screenshot:
 *   1. Pick channels (LinkedIn / Instagram / YouTube / Email / X)
 *   2. Set cadence per channel (posts per week)
 *   3. First piece — title + channel + when
 *
 * Live preview on the right shows a 7-day calendar grid that fills up
 * as the user picks channels and sets cadence.
 */

export interface ContentSetupData {
  channels?: string[];
  cadence?: Record<string, number>;
  firstPiece?: {
    title?: string;
    channel?: string;
    when?: string;
  };
}

const CHANNELS = [
  { id: 'linkedin',  label: 'LinkedIn',  color: '#0A66C2', dot: '#6DBEDC' },
  { id: 'instagram', label: 'Instagram', color: '#E1306C', dot: '#F1ADD8' },
  { id: 'youtube',   label: 'YouTube',   color: '#FF0000', dot: '#EF4444' },
  { id: 'email',     label: 'Email',     color: '#769268', dot: '#769268' },
  { id: 'twitter',   label: 'X / Twitter', color: '#0F1419', dot: '#27272A' },
];

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const Visual = ({ data, step }: { data: ContentSetupData; step: number; total: number }) => {
  const selected = data.channels || [];
  const cadence = data.cadence || {};
  // Distribute the per-channel cadence across the week for the preview
  const slots: Array<{ day: number; channel: string }> = [];
  selected.forEach(ch => {
    const n = Math.min(7, Math.max(1, cadence[ch] ?? 2));
    // Spread evenly: pick day indices
    for (let i = 0; i < n; i++) {
      const day = Math.floor((i / n) * 7);
      slots.push({ day, channel: ch });
    }
  });

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(7, 1fr)',
      gap: 8,
      width: '100%',
      maxWidth: 520,
      height: '100%',
      maxHeight: 420,
    }}>
      {DAYS.map((d, i) => {
        const daySlots = slots.filter(s => s.day === i);
        return (
          <div
            key={i}
            style={{
              background: '#fff',
              border: '0.5px solid rgba(214,209,199,0.55)',
              borderRadius: 10,
              padding: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              minHeight: 220,
              position: 'relative',
            }}
          >
            <span style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10.5,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#71717a',
            }}>{d}</span>
            {daySlots.length === 0 ? (
              <span style={{
                fontSize: 9,
                color: '#d4d4d8',
                fontFamily: 'JetBrains Mono, monospace',
                marginTop: 'auto',
              }}>—</span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {daySlots.map((s, j) => {
                  const ch = CHANNELS.find(c => c.id === s.channel);
                  return (
                    <div
                      key={j}
                      style={{
                        background: `color-mix(in oklab, ${ch?.dot} 12%, transparent)`,
                        borderLeft: `2px solid ${ch?.dot}`,
                        padding: '4px 6px',
                        borderRadius: 4,
                        fontSize: 10,
                        color: '#3f3f46',
                        animation: 'coach-step-in 0.3s cubic-bezier(0.4,0,0.2,1)',
                      }}
                    >
                      {ch?.label}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export const CONTENT_SETUP_FLOW: CoachFlowDef<ContentSetupData> = {
  tag: 'Build your content engine',
  initial: {
    channels: [],
    cadence: {},
    firstPiece: {},
  },
  visual: Visual,
  steps: [
    // STEP 1 — Pick channels
    {
      title: <>Pick your <span className="accent">channels</span></>,
      desc:
        'Where does your audience actually show up? Pick 2–3 — not 6. Discipline on fewer channels beats sloppy effort on many.',
      why:
        'Each channel gets its own publishing cadence target, content templates, and compliance tracker. Fewer channels means clearer feedback loops.',
      fields: ({ data, set }) => {
        const sel = data.channels || [];
        const toggle = (id: string) => {
          set('channels', sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);
        };
        return (
          <div className="coach-form">
            <div className="coach-field">
              <span className="coach-field-label">Active channels (pick 2–3)</span>
              <div className="coach-choices">
                {CHANNELS.map(ch => (
                  <button
                    key={ch.id}
                    type="button"
                    className={`coach-choice ${sel.includes(ch.id) ? 'sel' : ''}`}
                    onClick={() => toggle(ch.id)}
                  >
                    <span className="sw" style={{ background: ch.dot }} />
                    {ch.label}
                  </button>
                ))}
              </div>
              {sel.length > 3 && (
                <div style={{
                  marginTop: 8, fontSize: 11.5, color: '#b91c1c',
                  fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.04em',
                }}>
                  ⚠ 4+ channels is a lot. Most teams crash and burn. Start with 2.
                </div>
              )}
            </div>
          </div>
        );
      },
      canNext: d => (d.channels || []).length >= 1,
    },

    // STEP 2 — Cadence per channel
    {
      title: <>Set the <span className="accent">cadence</span></>,
      desc:
        "How often will you publish on each? Be honest about what your team can actually sustain for 90 days.",
      why:
        'Cadence sets the system\'s expectations. The Pipeline tab will track compliance and ping you when you fall behind.',
      fields: ({ data, set }) => {
        const sel = data.channels || [];
        const cadence = data.cadence || {};
        return (
          <div className="coach-form">
            {sel.map(id => {
              const ch = CHANNELS.find(c => c.id === id);
              const val = cadence[id] ?? 2;
              return (
                <div key={id} className="coach-field">
                  <span className="coach-field-label" style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: 9999, background: ch?.dot,
                    }} />
                    {ch?.label} — posts per week
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input
                      type="range" min={1} max={7} step={1}
                      value={val}
                      onChange={e => set('cadence', { ...cadence, [id]: Number(e.target.value) })}
                      style={{ flex: 1 }}
                    />
                    <span style={{
                      width: 36, textAlign: 'right',
                      fontFamily: 'JetBrains Mono, monospace', fontSize: 13,
                      fontWeight: 500, color: '#18181b',
                    }}>{val}/w</span>
                  </div>
                </div>
              );
            })}
            <div style={{
              padding: 12, background: 'rgba(196,163,90,0.07)', borderRadius: 9,
              fontSize: 12, color: '#3f3f46', marginTop: 4,
            }}>
              <strong style={{ color: '#18181b' }}>Total: {Object.values(cadence).reduce((s, n) => s + n, 0)} posts/week</strong>
              {' '}across {sel.length} channel{sel.length === 1 ? '' : 's'}.
            </div>
          </div>
        );
      },
      canNext: d => (d.channels || []).every(id => (d.cadence || {})[id] != null && (d.cadence || {})[id]! > 0),
    },

    // STEP 3 — First piece
    {
      title: <>Draft your <span className="accent">first piece</span></>,
      desc:
        "One piece. Real. Shippable. The system kicks in once you've published something — until then it's just configuration.",
      why:
        'The Pipeline / Calendar / Performance tabs all light up once the first piece exists. This gets you over the activation hump.',
      fields: ({ data, set }) => {
        const fp = data.firstPiece || {};
        const update = (patch: Partial<NonNullable<ContentSetupData['firstPiece']>>) => set('firstPiece', { ...fp, ...patch });
        return (
          <div className="coach-form">
            <div className="coach-field">
              <span className="coach-field-label">Working title</span>
              <input
                className="coach-input"
                placeholder='e.g. "How we run agency cadence — 3 patterns"'
                value={fp.title || ''}
                onChange={e => update({ title: e.target.value })}
              />
            </div>
            <div className="coach-field">
              <span className="coach-field-label">Channel</span>
              <div className="coach-choices">
                {(data.channels || []).map(id => {
                  const ch = CHANNELS.find(c => c.id === id);
                  if (!ch) return null;
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`coach-choice ${fp.channel === id ? 'sel' : ''}`}
                      onClick={() => update({ channel: id })}
                    >
                      <span className="sw" style={{ background: ch.dot }} />
                      {ch.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="coach-field">
              <span className="coach-field-label">When (day this week)</span>
              <div className="coach-choices">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => (
                  <button
                    key={day}
                    type="button"
                    className={`coach-choice ${fp.when === day ? 'sel' : ''}`}
                    onClick={() => update({ when: day })}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
            <div style={{
              padding: 14,
              background: 'linear-gradient(110deg, rgba(118,146,104,0.08) 0%, #ffffff 100%)',
              border: '0.5px solid rgba(118,146,104,0.3)',
              borderRadius: 11, marginTop: 8,
            }}>
              <div style={{
                fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5,
                letterSpacing: '0.2em', textTransform: 'uppercase', color: '#4d6b4d',
                fontWeight: 600, marginBottom: 4,
              }}>You're set</div>
              <div style={{ fontSize: 12.5, color: '#3f3f46', lineHeight: 1.5 }}>
                After this step, you'll see your Calendar populated with the {(data.channels || []).length} channel{(data.channels || []).length === 1 ? '' : 's'} you picked, and an empty first piece ready to draft.
              </div>
            </div>
          </div>
        );
      },
      canNext: d => !!d.firstPiece?.title && !!d.firstPiece?.channel,
    },
  ],
};
