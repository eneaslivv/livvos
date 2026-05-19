import React from 'react';
import type { CoachFlowDef } from '../CoachFlow';
import { Icons } from '../../ui/Icons';

/**
 * Brand Creation Flow — 6 steps matching the bundle's Brand kit structure.
 *
 * Source: livv-update / livv-os-onboarding.jsx :: FLOWS['content:brands']
 *
 *  Step 1: Identity — name + slug + about
 *  Step 2: Visual — palette + typography mood
 *  Step 3: Voice & Tone — 4 sliders (formality / energy / warmth / cleverness)
 *  Step 4: Rules — do/don't language list
 *  Step 5: References — moodboard URLs + reference posts
 *  Step 6: Preview — compiled brand_prompt for AI drafts
 */

export interface BrandData {
  name?: string;
  slug?: string;
  about?: string;
  palette?: string[];          // hex array
  typography_mood?: string;    // editorial | playful | corporate | brutalist
  // 4 sliders 0..100
  voice_formality?: number;   // 0 = casual, 100 = formal
  voice_energy?: number;      // 0 = calm, 100 = energetic
  voice_warmth?: number;      // 0 = clinical, 100 = warm
  voice_cleverness?: number;  // 0 = straightforward, 100 = witty
  rules_dos?: string[];
  rules_donts?: string[];
  references?: string[];       // links or names
  brand_prompt?: string;       // compiled
}

const TYPO_MOODS = [
  { v: 'editorial', n: 'Editorial' },
  { v: 'playful', n: 'Playful' },
  { v: 'corporate', n: 'Corporate' },
  { v: 'brutalist', n: 'Brutalist' },
];

const PRESET_PALETTES = [
  { name: 'Warm cream', colors: ['#FDFBF7', '#C4A35A', '#5C1D18', '#769268'] },
  { name: 'Cool sky', colors: ['#F5F2EB', '#6DBEDC', '#2C0405', '#A855F7'] },
  { name: 'Soft pink', colors: ['#FFF5F8', '#F1ADD8', '#23150E', '#C4A35A'] },
];

const Visual = ({ data, step }: { data: BrandData; step: number; total: number }) => {
  const palette = data.palette || ['#A8A29A', '#1A1A1A', '#F5F5F5'];
  const primary = palette[1] || '#C4A35A';
  return (
    <div style={{ width: '100%', maxWidth: 340 }}>
      <div style={{
        background: '#fff', border: '0.5px solid rgba(214,209,199,0.55)',
        borderRadius: 14, overflow: 'hidden',
        boxShadow: '0 1px 0 rgba(255,255,255,0.6) inset, 0 8px 24px -12px rgba(44,4,5,0.06)',
      }}>
        {/* Palette band */}
        <div style={{ display: 'flex', height: 60 }}>
          {palette.slice(0, 5).map((c, i) => (
            <div key={i} style={{ flex: 1, background: c }} />
          ))}
        </div>
        <div style={{ padding: 18 }}>
          {/* Identity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span style={{
              fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
              letterSpacing: '0.18em', textTransform: 'uppercase', color: '#71717a',
            }}>BRAND KIT</span>
          </div>
          <h3 style={{ fontSize: 18, margin: '0 0 6px', fontWeight: 300, letterSpacing: '-0.02em', color: '#18181b' }}>
            {data.name || 'Brand name'}
          </h3>
          {data.slug && (
            <code style={{
              fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
              color: primary, letterSpacing: '0.04em',
            }}>{data.slug}</code>
          )}
          {data.about && (
            <p style={{
              margin: '10px 0 0', fontSize: 12, lineHeight: 1.5, color: '#3f3f46',
            }}>{data.about}</p>
          )}

          {/* Typography mood */}
          {step >= 1 && data.typography_mood && (
            <div style={{
              marginTop: 14, padding: '8px 12px',
              background: 'rgba(82,82,91,0.04)', borderRadius: 8,
              fontSize: 11.5, color: '#3f3f46', display: 'flex',
              justifyContent: 'space-between',
            }}>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#71717a' }}>Type mood</span>
              <span style={{ fontWeight: 500 }}>{data.typography_mood}</span>
            </div>
          )}

          {/* Voice sliders snapshot */}
          {step >= 2 && (
            <div style={{ marginTop: 14, display: 'grid', gap: 6 }}>
              {[
                { l: 'Casual ↔ Formal', v: data.voice_formality ?? 50 },
                { l: 'Calm ↔ Energetic', v: data.voice_energy ?? 50 },
                { l: 'Clinical ↔ Warm', v: data.voice_warmth ?? 50 },
                { l: 'Direct ↔ Witty', v: data.voice_cleverness ?? 50 },
              ].map(s => (
                <div key={s.l}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#71717a', marginBottom: 2,
                  }}>
                    <span>{s.l}</span><span>{s.v}</span>
                  </div>
                  <div style={{ height: 3, background: 'rgba(82,82,91,0.1)', borderRadius: 9999, overflow: 'hidden' }}>
                    <div style={{ width: `${s.v}%`, height: '100%', background: primary, borderRadius: 9999 }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Rules summary */}
          {step >= 3 && ((data.rules_dos || []).length > 0 || (data.rules_donts || []).length > 0) && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed rgba(90,62,62,0.12)' }}>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#71717a', marginBottom: 6 }}>
                Rules · {(data.rules_dos || []).length} do · {(data.rules_donts || []).length} don't
              </div>
            </div>
          )}
        </div>
      </div>
      <div style={{
        marginTop: 14, fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5,
        letterSpacing: '0.04em', color: '#a1a1aa', textAlign: 'center',
      }}>↑ live preview of the brand kit</div>
    </div>
  );
};

export const BRAND_CREATION_FLOW: CoachFlowDef<BrandData> = {
  tag: 'Define a brand kit',
  initial: {
    palette: ['#FDFBF7', '#C4A35A', '#5C1D18', '#769268'],
    typography_mood: 'editorial',
    voice_formality: 40,
    voice_energy: 60,
    voice_warmth: 70,
    voice_cleverness: 55,
    rules_dos: ['', ''],
    rules_donts: ['', ''],
    references: ['', ''],
  },
  visual: Visual,
  steps: [
    // STEP 1 — Identity
    {
      title: <>Name your <span className="accent">brand</span></>,
      desc: 'The brand kit is the source of truth for every piece of content the AI drafts on behalf of this entity. Start with a clear name and a short about.',
      why: 'Every AI prompt downstream pulls these fields. A vague name or about makes drafts feel generic.',
      fields: ({ data, set }) => (
        <div className="coach-form">
          <div className="coach-field">
            <span className="coach-field-label">Brand name</span>
            <input
              className="coach-input"
              placeholder="e.g. LIVV Studio"
              value={data.name || ''}
              onChange={e => {
                set('name', e.target.value);
                if (!data.slug) {
                  set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
                }
              }}
            />
          </div>
          <div className="coach-field">
            <span className="coach-field-label">Slug (auto-generated)</span>
            <input
              className="coach-input"
              style={{ fontFamily: 'JetBrains Mono, monospace', maxWidth: 240 }}
              placeholder="livv-studio"
              value={data.slug || ''}
              onChange={e => set('slug', e.target.value.toLowerCase().replace(/\s+/g, '-'))}
            />
          </div>
          <div className="coach-field">
            <span className="coach-field-label">About (1–2 sentences)</span>
            <textarea
              className="coach-input"
              rows={3}
              placeholder="What this brand stands for — the operating belief, who it serves, what changes when they work with you."
              value={data.about || ''}
              onChange={e => set('about', e.target.value)}
              style={{ resize: 'vertical', minHeight: 80, fontFamily: 'inherit' }}
            />
          </div>
        </div>
      ),
      canNext: d => !!d.name && !!d.about,
    },

    // STEP 2 — Visual: palette + typography
    {
      title: <>Pick the <span className="accent">visual atoms</span></>,
      desc: 'Palette + typography mood are the rails AI uses for cover images, gradient blocks, and editorial decisions.',
      why: 'When a Studio render needs a background gradient or an Activity card needs a tone, this is what it pulls from.',
      fields: ({ data, set }) => (
        <div className="coach-form">
          <div className="coach-field">
            <span className="coach-field-label">Preset palettes</span>
            <div className="coach-choices">
              {PRESET_PALETTES.map(p => {
                const sel = JSON.stringify(data.palette) === JSON.stringify(p.colors);
                return (
                  <button
                    key={p.name}
                    type="button"
                    className={`coach-choice ${sel ? 'sel' : ''}`}
                    onClick={() => set('palette', p.colors)}
                  >
                    <span style={{ display: 'inline-flex', height: 14, borderRadius: 4, overflow: 'hidden', border: '0.5px solid rgba(0,0,0,0.1)' }}>
                      {p.colors.slice(0, 4).map((c, i) => (
                        <span key={i} style={{ display: 'inline-block', width: 12, height: 14, background: c }} />
                      ))}
                    </span>
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="coach-field">
            <span className="coach-field-label">Custom palette (4 hex codes)</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(data.palette || ['#FFF', '#000', '#888', '#555']).map((c, i) => (
                <input
                  key={i}
                  type="color"
                  value={c}
                  onChange={e => {
                    const next = [...(data.palette || [])];
                    next[i] = e.target.value;
                    set('palette', next);
                  }}
                  style={{ width: 48, height: 48, border: 'none', cursor: 'pointer', background: 'transparent', padding: 0 }}
                />
              ))}
            </div>
          </div>
          <div className="coach-field">
            <span className="coach-field-label">Typography mood</span>
            <div className="coach-choices">
              {TYPO_MOODS.map(m => (
                <button
                  key={m.v}
                  type="button"
                  className={`coach-choice ${data.typography_mood === m.v ? 'sel' : ''}`}
                  onClick={() => set('typography_mood', m.v)}
                >
                  {m.n}
                </button>
              ))}
            </div>
          </div>
        </div>
      ),
      canNext: d => (d.palette || []).length >= 3 && !!d.typography_mood,
    },

    // STEP 3 — Voice
    {
      title: <>Tune the <span className="accent">voice</span></>,
      desc: 'Voice is what makes AI drafts sound like the brand — not generic. Slide each axis to where this brand actually speaks.',
      why: 'Each slider directly weights phrasing in the AI prompt. Casual=contractions; formal=full forms; energetic=imperative; calm=reflective.',
      fields: ({ data, set }) => (
        <div className="coach-form">
          {[
            { k: 'voice_formality' as const,   l: 'Casual ↔ Formal',     left: 'Casual',     right: 'Formal' },
            { k: 'voice_energy' as const,      l: 'Calm ↔ Energetic',    left: 'Calm',       right: 'Energetic' },
            { k: 'voice_warmth' as const,      l: 'Clinical ↔ Warm',     left: 'Clinical',   right: 'Warm' },
            { k: 'voice_cleverness' as const,  l: 'Direct ↔ Witty',      left: 'Direct',     right: 'Witty' },
          ].map(s => (
            <div key={s.k} className="coach-field">
              <span className="coach-field-label">{s.l}</span>
              <input
                type="range" min={0} max={100} step={1}
                value={data[s.k] ?? 50}
                onChange={e => set(s.k, Number(e.target.value))}
                style={{ width: '100%' }}
              />
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: 10.5, color: '#71717a',
                fontFamily: 'JetBrains Mono, monospace',
              }}>
                <span>{s.left}</span>
                <span>{data[s.k] ?? 50}</span>
                <span>{s.right}</span>
              </div>
            </div>
          ))}
        </div>
      ),
      canNext: () => true,
    },

    // STEP 4 — Rules
    {
      title: <>Write the <span className="accent">do/don't</span> list</>,
      desc: "Concrete language rules. 3-5 of each. Be specific — 'sound warm' is useless, 'use 'you' not 'one'' is gold.",
      why: 'These rules are injected directly into every AI draft prompt as constraints. The more concrete, the cleaner the output.',
      fields: ({ data, set }) => {
        const dos = data.rules_dos || ['', ''];
        const donts = data.rules_donts || ['', ''];
        return (
          <div className="coach-form">
            <div className="coach-field">
              <span className="coach-field-label" style={{ color: '#4d6b4d' }}>✓ Do</span>
              <div className="coach-bullets">
                {dos.map((v, i) => (
                  <div key={i} className="coach-bullet">
                    <input
                      placeholder={`Do ${i + 1} — e.g. "Use 'you' not 'one'"`}
                      value={v}
                      onChange={e => {
                        const next = [...dos];
                        next[i] = e.target.value;
                        set('rules_dos', next);
                      }}
                    />
                    <button
                      type="button"
                      className="rm"
                      onClick={() => set('rules_dos', dos.filter((_, j) => j !== i))}
                    >
                      <Icons.X size={12} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="coach-add-bullet"
                  onClick={() => set('rules_dos', [...dos, ''])}
                >
                  <Icons.Plus size={12} />Add do
                </button>
              </div>
            </div>
            <div className="coach-field">
              <span className="coach-field-label" style={{ color: '#b91c1c' }}>✗ Don't</span>
              <div className="coach-bullets">
                {donts.map((v, i) => (
                  <div key={i} className="coach-bullet">
                    <input
                      placeholder={`Don't ${i + 1} — e.g. "Never say 'leverage'"`}
                      value={v}
                      onChange={e => {
                        const next = [...donts];
                        next[i] = e.target.value;
                        set('rules_donts', next);
                      }}
                    />
                    <button
                      type="button"
                      className="rm"
                      onClick={() => set('rules_donts', donts.filter((_, j) => j !== i))}
                    >
                      <Icons.X size={12} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="coach-add-bullet"
                  onClick={() => set('rules_donts', [...donts, ''])}
                >
                  <Icons.Plus size={12} />Add don't
                </button>
              </div>
            </div>
          </div>
        );
      },
      canNext: d => (d.rules_dos || []).filter(Boolean).length >= 1 || (d.rules_donts || []).filter(Boolean).length >= 1,
    },

    // STEP 5 — References
    {
      title: <>Drop your <span className="accent">references</span></>,
      desc: "Real artifacts that already nail this brand — links, posts, names. AI uses these to ground every draft so outputs stay in-style.",
      why: "Reference posts are the closest signal AI has to your taste. 3 great ones beat 50 mediocre ones.",
      fields: ({ data, set }) => {
        const refs = data.references || ['', ''];
        return (
          <div className="coach-bullets">
            {refs.map((v, i) => (
              <div key={i} className="coach-bullet">
                <input
                  placeholder={`Reference ${i + 1} — link, post title, or short description`}
                  value={v}
                  onChange={e => {
                    const next = [...refs];
                    next[i] = e.target.value;
                    set('references', next);
                  }}
                />
                <button
                  type="button"
                  className="rm"
                  onClick={() => set('references', refs.filter((_, j) => j !== i))}
                >
                  <Icons.X size={12} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="coach-add-bullet"
              onClick={() => set('references', [...refs, ''])}
            >
              <Icons.Plus size={12} />Add reference
            </button>
          </div>
        );
      },
      canNext: d => (d.references || []).filter(Boolean).length >= 1,
    },

    // STEP 6 — Preview compiled brand_prompt
    {
      title: <>This is your <span className="accent">brand prompt</span></>,
      desc: "Every AI draft (content, outreach, case studies, ads) pulls this compiled prompt automatically. Edit any input later from Content → Brands.",
      why: "Auditable AI is the goal — you can see exactly what context every draft starts from.",
      fields: ({ data }) => {
        const compiled = [
          `# ${data.name || 'Brand'}`,
          data.about ? `\n${data.about}\n` : '',
          data.typography_mood ? `Typography mood: ${data.typography_mood}` : '',
          `Voice: formality ${data.voice_formality ?? 50} · energy ${data.voice_energy ?? 50} · warmth ${data.voice_warmth ?? 50} · cleverness ${data.voice_cleverness ?? 50}`,
          (data.rules_dos || []).filter(Boolean).length > 0 ? `\n✓ DO\n${(data.rules_dos || []).filter(Boolean).map(r => `  • ${r}`).join('\n')}` : '',
          (data.rules_donts || []).filter(Boolean).length > 0 ? `\n✗ DON'T\n${(data.rules_donts || []).filter(Boolean).map(r => `  • ${r}`).join('\n')}` : '',
          (data.references || []).filter(Boolean).length > 0 ? `\nRefs:\n${(data.references || []).filter(Boolean).map(r => `  – ${r}`).join('\n')}` : '',
        ].filter(Boolean).join('\n');
        return (
          <div style={{
            padding: 14,
            background: '#fdfbf7',
            border: '0.5px solid rgba(214,209,199,0.7)',
            borderRadius: 11,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11.5,
            lineHeight: 1.6,
            color: '#3f3f46',
            whiteSpace: 'pre-wrap',
            maxHeight: 360,
            overflowY: 'auto',
          }}>
            {compiled}
          </div>
        );
      },
      canNext: () => true,
    },
  ],
};
