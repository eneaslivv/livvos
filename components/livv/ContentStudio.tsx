import React, { useState, useMemo } from 'react';
import { Icons } from '../ui/Icons';
import type { Brand, Channel, ICP } from '../../types';
import './bundle-studio.css';

/**
 * Content Studio — 3-pane generator from the LIVV bundle.
 * Source: livv-update / livv-os-content.jsx :: ContentStudio
 *
 * PANE 1 (left, ~300px): config
 *   - Brand kit picker (list of brand_kits rows)
 *   - Channel chips (LinkedIn / Instagram / YouTube / Email / Ad)
 *   - Format chips (per-channel: Post/Carrusel/Article/Reel/etc)
 *   - ICP target chips
 *   - Briefing textarea
 *   - Generate button with gold conic-halo
 *
 * PANE 2 (center, fluid): visual library
 *   - Tab strip: Pinterest pins / Brand moodboard / Trained styles / Upload
 *   - Board filter pills (Editorial layouts / Warm-toned photography / etc)
 *   - Pin grid (gradient mockups with texture marks: editorial / film / serif / system / paper / soft)
 *   - Selected references tray (3 slots max) + composed prompt preview
 *
 * PANE 3 (right, ~360px): output
 *   - V1/V2/V3 tabs
 *   - Visual mockup using blended palette
 *   - Copy preview (post-like card with brand voice)
 *   - Toolbar: Edit / Regenerate / Refine
 */

interface Props {
  brands: Brand[];
  channels: Channel[];
  icps: ICP[];
}

// Pin board catalog
const PIN_BOARDS = [
  { id: 'editorial', name: 'Editorial layouts',      count: 84,  pal: ['#2C0405', '#C4A35A', '#FDFBF7'] },
  { id: 'warm',      name: 'Warm-toned photography', count: 142, pal: ['#8B5A2B', '#F5E6D3', '#3D2817'] },
  { id: 'type',      name: 'Type specimens',          count: 56,  pal: ['#0A0A0B', '#FAFAFA', '#E6E2D8'] },
  { id: 'brand',     name: 'Brand systems',            count: 73,  pal: ['#769268', '#E8EFE5', '#1F2D1A'] },
  { id: 'motion',    name: 'Motion / frames',          count: 41,  pal: ['#F1ADD8', '#FBF2EC', '#23150E'] },
  { id: 'product',   name: 'Product photography',      count: 64,  pal: ['#6DBEDC', '#0F1B2D', '#E8EFF6'] },
];

interface Pin {
  id: string;
  board: string;
  pal: string[];
  texture: 'editorial' | 'film' | 'paper' | 'soft' | 'serif' | 'mono' | 'system';
  title: string;
}

const PINS: Pin[] = [
  { id: 'p1',  board: 'editorial', pal: ['#2C0405', '#C4A35A', '#FDFBF7'], texture: 'editorial', title: 'Wine + gold cover' },
  { id: 'p2',  board: 'editorial', pal: ['#3D1214', '#E8BC59', '#F5EFE2'], texture: 'paper',     title: 'Magazine spread' },
  { id: 'p3',  board: 'editorial', pal: ['#1F1611', '#C9A35F', '#F8F3E8'], texture: 'soft',      title: 'Quiet typography' },
  { id: 'p4',  board: 'warm',      pal: ['#8B5A2B', '#F5E6D3', '#3D2817'], texture: 'film',      title: 'Sunset interior' },
  { id: 'p5',  board: 'warm',      pal: ['#A07248', '#EBD9C2', '#2D1810'], texture: 'film',      title: 'Coffee on linen' },
  { id: 'p6',  board: 'warm',      pal: ['#6D4127', '#F0DDB8', '#1F0E04'], texture: 'film',      title: 'Golden hour table' },
  { id: 'p7',  board: 'type',      pal: ['#0A0A0B', '#FAFAFA', '#E6E2D8'], texture: 'serif',     title: 'Serif specimen' },
  { id: 'p8',  board: 'type',      pal: ['#1A1A1A', '#F5F5F5', '#C4C4C4'], texture: 'mono',      title: 'Mono grid' },
  { id: 'p9',  board: 'brand',     pal: ['#769268', '#E8EFE5', '#1F2D1A'], texture: 'system',    title: 'System grid' },
  { id: 'p10', board: 'brand',     pal: ['#3F5A38', '#EAF1E5', '#1B2A14'], texture: 'system',    title: 'Sage grid' },
  { id: 'p11', board: 'motion',    pal: ['#F1ADD8', '#FBF2EC', '#23150E'], texture: 'soft',      title: 'Frame loop' },
  { id: 'p12', board: 'product',   pal: ['#6DBEDC', '#0F1B2D', '#E8EFF6'], texture: 'film',      title: 'Studio still' },
];

const TRAINED_STYLES = [
  { id: 'ts1', name: 'Livv editorial',    pal: ['#2C0405', '#C4A35A', '#FDFBF7'], runs: 24 },
  { id: 'ts2', name: 'Mulberry warmth',   pal: ['#1F1611', '#C4A35A', '#F5EFE8'], runs: 18 },
  { id: 'ts3', name: 'Cremona clean',     pal: ['#0F1B2D', '#6DBEDC', '#E8EFF6'], runs: 12 },
  { id: 'ts4', name: 'Sunnyside playful', pal: ['#23150E', '#F1ADD8', '#FBF2EC'], runs: 9 },
];

const CHANNELS = [
  { id: 'linkedin',  label: 'LinkedIn',  color: '#0A66C2' },
  { id: 'instagram', label: 'Instagram', color: '#E1306C' },
  { id: 'youtube',   label: 'YouTube',   color: '#FF0000' },
  { id: 'email',     label: 'Email',     color: '#769268' },
  { id: 'ad',        label: 'Ad',        color: '#C4A35A' },
];

const TYPES: Record<string, string[]> = {
  linkedin:  ['Post', 'Carrusel', 'Article'],
  instagram: ['Reel caption', 'Carrusel', 'Single'],
  youtube:   ['Short script', 'Long-form script'],
  email:     ['Newsletter', 'Promotional'],
  ad:        ['Meta · primary', 'Meta · headline', 'Google · headline'],
};

const ICP_PALETTE = ['#C4A35A', '#6DBEDC', '#769268', '#F1ADD8', '#A855F7', '#5C1D18'];

function icpColor(icp: ICP): string {
  const fromRow = (icp as any).color as string | undefined;
  if (fromRow) return fromRow;
  let h = 0;
  for (const ch of icp.name) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return ICP_PALETTE[Math.abs(h) % ICP_PALETTE.length];
}

// Render a pin's texture as an SVG overlay on the gradient canvas
const PinTexture: React.FC<{ pin: Pin }> = ({ pin }) => {
  const c1 = pin.pal[2] || '#fff';
  const c2 = pin.pal[1];
  if (pin.texture === 'editorial') {
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <rect x="14" y="20" width="36" height="3" fill={c1} opacity={0.8} />
        <rect x="14" y="28" width="50" height="2" fill={c1} opacity={0.45} />
        <rect x="14" y="34" width="42" height="2" fill={c1} opacity={0.45} />
        <rect x="14" y="40" width="48" height="2" fill={c1} opacity={0.45} />
        <text x="14" y="78" fontSize="22" fontWeight="300" fill={c1} fontFamily="serif" letterSpacing="-1">Edit.</text>
      </svg>
    );
  }
  if (pin.texture === 'film') {
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <circle cx="68" cy="32" r="14" fill={c2} opacity={0.55} />
        <rect x="20" y="55" width="60" height="22" rx="2" fill={c1} opacity={0.35} />
      </svg>
    );
  }
  if (pin.texture === 'serif' || pin.texture === 'mono') {
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <text x="50%" y="60%" fontSize="42" fontWeight="600" textAnchor="middle" fill={c2} fontFamily={pin.texture === 'serif' ? 'serif' : 'monospace'} letterSpacing={pin.texture === 'mono' ? '4' : '-2'}>Aa</text>
      </svg>
    );
  }
  if (pin.texture === 'system') {
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        {Array.from({ length: 5 }).map((_, i) =>
          Array.from({ length: 5 }).map((__, j) => (
            <rect key={`${i}-${j}`} x={10 + i * 16} y={10 + j * 16} width="12" height="12"
              fill={pin.pal[(i + j) % pin.pal.length]}
              opacity={0.4 + ((i + j) % 3) * 0.2} />
          ))
        )}
      </svg>
    );
  }
  if (pin.texture === 'paper') {
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <rect x="20" y="14" width="60" height="72" rx="1" fill={c1} opacity={0.5} />
        <rect x="28" y="24" width="36" height="2" fill={pin.pal[0]} opacity={0.7} />
        <rect x="28" y="32" width="44" height="1.5" fill={pin.pal[0]} opacity={0.3} />
        <rect x="28" y="38" width="40" height="1.5" fill={pin.pal[0]} opacity={0.3} />
      </svg>
    );
  }
  if (pin.texture === 'soft') {
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <text x="50%" y="55%" fontSize="20" fontWeight="300" textAnchor="middle" fill={c1} fontFamily="serif" letterSpacing="0.06em" opacity={0.9}>whispered</text>
      </svg>
    );
  }
  return null;
};

const PinTile: React.FC<{ pin: Pin; selected: boolean; onToggle: (pin: Pin) => void }> = ({ pin, selected, onToggle }) => {
  const angle = parseInt(pin.id.replace(/\D/g, ''), 10) * 35 + 135;
  return (
    <button
      type="button"
      className={`bdl-st-pin ${selected ? 'sel' : ''}`}
      onClick={() => onToggle(pin)}
    >
      <div
        className="bdl-st-pin-canvas"
        style={{ background: `linear-gradient(${angle}deg, ${pin.pal[0]} 0%, ${pin.pal[1]} 50%, ${pin.pal[2] || pin.pal[0]} 100%)` }}
      >
        <PinTexture pin={pin} />
      </div>
      <div className="bdl-st-pin-foot">
        <span className="bdl-st-pin-pal">
          {pin.pal.map((c, j) => <span key={j} style={{ background: c }} />)}
        </span>
        <span className="bdl-st-pin-title">{pin.title}</span>
      </div>
      <span className="bdl-st-pin-state">
        {selected ? <Icons.Check size={11} /> : <Icons.Plus size={11} />}
      </span>
    </button>
  );
};

export const ContentStudio: React.FC<Props> = ({ brands, channels: liveChannels, icps }) => {
  const [brandId, setBrandId] = useState<string>(brands[0]?.id || '');
  const brand = brands.find(b => b.id === brandId) || null;
  const [channel, setChannel] = useState<string>('linkedin');
  const [type, setType] = useState<string>(TYPES.linkedin[0]);
  const [icpId, setIcpId] = useState<string>(icps[0]?.id || '');
  const icp = icps.find(i => i.id === icpId);
  const [briefing, setBriefing] = useState<string>('');
  const [sourceTab, setSourceTab] = useState<'pinterest' | 'moodboard' | 'trained' | 'upload'>('pinterest');
  const [activeBoard, setActiveBoard] = useState<string>('editorial');
  const [refs, setRefs] = useState<Pin[]>([PINS[0]]);
  const [variation, setVariation] = useState<'v1' | 'v2' | 'v3'>('v1');

  const togglePin = (pin: Pin) => {
    setRefs(prev =>
      prev.find(p => p.id === pin.id)
        ? prev.filter(p => p.id !== pin.id)
        : prev.length >= 3 ? [...prev.slice(1), pin] : [...prev, pin]
    );
  };

  const types = TYPES[channel] || TYPES.linkedin;
  const channelDef = CHANNELS.find(c => c.id === channel) || CHANNELS[0];

  // Blended palette — first ref wins, else brand palette, else gold defaults
  const brandPal = (brand as any)?.palette || [(brand as any)?.color_primary, (brand as any)?.color_secondary, (brand as any)?.color_text].filter(Boolean);
  const blendedPalette = refs.length > 0
    ? refs[0].pal
    : (brandPal.length > 0 ? brandPal : ['#C4A35A', '#2C0405', '#FDFBF7']);

  const pinsForBoard = useMemo(() => PINS.filter(p => p.board === activeBoard), [activeBoard]);

  // Brand colors helpers for the brand-row pills
  const brandLogoBg = (b: Brand): string => (b as any).color_primary || '#18181b';
  const brandLogoFg = (b: Brand): string => (b as any).color_text || '#fff';

  return (
    <div className="bdl-st">
      {/* ─── PANE 1: Config ─── */}
      <aside className="bdl-st-pane">
        <div>
          <span className="bdl-st-label">Brand kit</span>
          <div className="bdl-st-brand-row">
            {brands.length === 0 ? (
              <div style={{
                padding: 12,
                background: 'rgba(196,163,90,0.07)',
                border: '0.5px dashed rgba(196,163,90,0.4)',
                borderRadius: 9,
                fontSize: 11.5,
                color: '#8b6a17',
              }}>
                No brand kits yet — create one in the <strong>Brands</strong> tab first.
              </div>
            ) : brands.map(b => (
              <button
                key={b.id}
                type="button"
                className={`bdl-st-brand ${brandId === b.id ? 'sel' : ''}`}
                onClick={() => setBrandId(b.id)}
              >
                <span
                  className="bdl-st-brand-logo"
                  style={{ background: brandLogoBg(b), color: brandLogoFg(b) }}
                >
                  {b.name.split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase()).join('')}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="bdl-st-brand-name">{b.name}</div>
                  <div className="bdl-st-brand-sub">{(b as any).industry || (b as any).slug || 'Brand kit'}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="bdl-st-label">Channel</span>
          <div className="bdl-st-chips">
            {CHANNELS.map(c => (
              <button
                key={c.id}
                type="button"
                className={`bdl-st-chip ${channel === c.id ? 'active' : ''}`}
                onClick={() => {
                  setChannel(c.id);
                  setType(TYPES[c.id][0]);
                }}
              >
                <span className="bdl-st-chip-dot" style={{ background: c.color }} />
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="bdl-st-label">Type</span>
          <div className="bdl-st-chips">
            {types.map(t => (
              <button
                key={t}
                type="button"
                className={`bdl-st-chip ${type === t ? 'active' : ''}`}
                onClick={() => setType(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="bdl-st-label">ICP target</span>
          {icps.length === 0 ? (
            <div style={{ padding: 10, background: 'rgba(82,82,91,0.05)', borderRadius: 8, fontSize: 11, color: '#71717a' }}>
              No ICPs defined — pick a default voice from the brand kit.
            </div>
          ) : (
            <div className="bdl-st-chips">
              {icps.slice(0, 5).map(i => (
                <button
                  key={i.id}
                  type="button"
                  className={`bdl-st-chip ${icpId === i.id ? 'active' : ''}`}
                  onClick={() => setIcpId(i.id)}
                >
                  <span className="bdl-st-chip-dot" style={{ background: icpColor(i) }} />
                  {i.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <span className="bdl-st-label">Briefing</span>
          <textarea
            className="bdl-st-textarea"
            value={briefing}
            onChange={e => setBriefing(e.target.value)}
            placeholder="What do you want to say? Topic, angle, hook ideas, must-include facts…"
            style={{ flex: 1 }}
          />
        </div>

        <button
          type="button"
          className="bdl-st-generate"
          disabled={!brand || !briefing.trim()}
        >
          <Icons.Sparkles size={14} />
          Generate · 3 variations
          <span className="kbd">⌘↵</span>
        </button>
      </aside>

      {/* ─── PANE 2: Visual library ─── */}
      <section className="bdl-st-pane">
        <header className="bdl-st-lib-head">
          <div className="bdl-st-lib-title">
            <span className="bdl-st-lib-pulse" />
            Visual library
          </div>
          <span className="bdl-st-lib-meta">Pinterest · Higgsfield · Trained</span>
          <div className="bdl-st-conn-status">
            <span className="bdl-st-conn-pill"><span className="dot" />Pinterest</span>
            <span className="bdl-st-conn-pill violet"><span className="dot" />Higgsfield · 12 styles</span>
          </div>
        </header>

        <div className="bdl-st-lib-tabs">
          {[
            { id: 'pinterest' as const, label: 'Pinterest pins',  count: PINS.length, ic: 'P' },
            { id: 'moodboard' as const, label: 'Brand moodboard',  count: 18, ic: 'M' },
            { id: 'trained' as const,   label: 'Trained styles',   count: TRAINED_STYLES.length, ic: '✦' },
            { id: 'upload' as const,    label: 'Upload',           count: 0, ic: '+' },
          ].map(t => (
            <button
              key={t.id}
              type="button"
              className={`bdl-st-lib-tab ${sourceTab === t.id ? 'active' : ''}`}
              onClick={() => setSourceTab(t.id)}
            >
              <span className="bdl-st-lib-tab-ic">{t.ic}</span>
              {t.label}
              {t.count > 0 && <span className="bdl-st-lib-tab-count">{t.count}</span>}
            </button>
          ))}
        </div>

        {sourceTab === 'pinterest' && (
          <>
            <div className="bdl-st-boards">
              {PIN_BOARDS.map(b => (
                <button
                  key={b.id}
                  type="button"
                  className={`bdl-st-board ${activeBoard === b.id ? 'active' : ''}`}
                  onClick={() => setActiveBoard(b.id)}
                >
                  <span className="bdl-st-board-swatches">
                    {b.pal.map((c, i) => <span key={i} style={{ background: c }} />)}
                  </span>
                  {b.name}
                  <span className="bdl-st-board-count">{b.count}</span>
                </button>
              ))}
            </div>

            <div className="bdl-st-pins">
              {(pinsForBoard.length > 0 ? pinsForBoard : PINS.slice(0, 6)).map(p => (
                <PinTile key={p.id} pin={p} selected={!!refs.find(r => r.id === p.id)} onToggle={togglePin} />
              ))}
            </div>
          </>
        )}

        {sourceTab === 'trained' && (
          <div className="bdl-st-pins">
            {TRAINED_STYLES.map(s => {
              const pinShape: Pin = { id: s.id, board: 'trained', pal: s.pal, texture: 'system', title: s.name };
              return (
                <PinTile key={s.id} pin={pinShape} selected={!!refs.find(r => r.id === s.id)} onToggle={togglePin} />
              );
            })}
          </div>
        )}

        {sourceTab === 'moodboard' && (
          <div className="bdl-st-pins">
            {Array.from({ length: 6 }).map((_, i) => {
              const pinShape: Pin = {
                id: `mb${i}`,
                board: 'moodboard',
                pal: brandPal.length > 0 ? brandPal as string[] : ['#C4A35A', '#2C0405', '#FDFBF7'],
                texture: (['editorial', 'film', 'soft', 'paper', 'system', 'serif'] as const)[i],
                title: ['Hero shot', 'Studio detail', 'Product mood', 'Type spec', 'Logo mark', 'Editorial spread'][i],
              };
              return <PinTile key={i} pin={pinShape} selected={false} onToggle={togglePin} />;
            })}
          </div>
        )}

        {sourceTab === 'upload' && (
          <div style={{
            padding: 40,
            border: '1px dashed rgba(214,209,199,0.7)',
            borderRadius: 12,
            textAlign: 'center',
            color: '#71717a',
          }}>
            <Icons.Plus size={26} style={{ marginBottom: 8, opacity: 0.6 }} />
            <div style={{ fontSize: 14, fontWeight: 500, color: '#18181b', marginBottom: 4 }}>
              Drop reference images
            </div>
            <div style={{ fontSize: 12, maxWidth: 320, margin: '0 auto' }}>
              Higgsfield extracts palette, texture and composition signatures — and weaves them into your prompt.
            </div>
          </div>
        )}

        {/* Selected refs tray + composed prompt */}
        <div className="bdl-st-tray">
          <div className="bdl-st-tray-head">
            <span className="bdl-st-label" style={{ margin: 0 }}>
              Selected references · {refs.length}/3
            </span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#a1a1aa' }}>
              Click pins to add · max 3
            </span>
          </div>
          <div className="bdl-st-tray-slots">
            {[0, 1, 2].map(i => {
              const r = refs[i];
              return r ? (
                <div
                  key={i}
                  className="bdl-st-tray-slot"
                  style={{ background: `linear-gradient(135deg, ${r.pal[0]}, ${r.pal[1]}, ${r.pal[2] || r.pal[0]})` }}
                >
                  <button
                    type="button"
                    className="bdl-st-tray-rm"
                    onClick={() => setRefs(refs.filter(x => x.id !== r.id))}
                  >
                    <Icons.X size={10} />
                  </button>
                  <span className="bdl-st-tray-name">{r.title}</span>
                </div>
              ) : (
                <div key={i} className="bdl-st-tray-slot empty">
                  <span>+</span>
                </div>
              );
            })}
          </div>

          <div className="bdl-st-prompt">
            <div className="bdl-st-prompt-head">
              <span style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 9.5,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: '#7c5cff',
                fontWeight: 600,
              }}>
                ✦ Composed prompt
              </span>
              <span style={{ marginLeft: 'auto', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#a1a1aa' }}>
                auto-updating
              </span>
            </div>
            <pre className="bdl-st-prompt-code">{`<brand: ${brand?.name || '—'}>
  palette: ${brandPal.length > 0 ? (brandPal as string[]).slice(0, 3).join(', ') : 'defaults'}
  voice: ${(brand as any)?.typography_mood || 'editorial'}

<aesthetic refs:>
${refs.length === 0
  ? '  (none selected — output uses brand defaults)'
  : refs.map(r => `  • ${r.title}  [${r.pal.join(', ')}]`).join('\n')}

<task:>
  ${channelDef.label.toUpperCase()} · ${type} · for ${icp?.name || 'general'}
  ${briefing.slice(0, 100)}${briefing.length > 100 ? '…' : ''}

→ AI fuses brand voice + visual signature → 3 variations`}</pre>
          </div>
        </div>
      </section>

      {/* ─── PANE 3: Output ─── */}
      <section className="bdl-st-pane">
        <header className="bdl-st-out-head">
          <div className="bdl-st-out-tag">
            <span className="dot" style={{ background: channelDef.color }} />
            <strong>{channelDef.label}</strong>
            <span className="sep">/</span>
            <span>{type}</span>
          </div>
          <div className="bdl-st-vars">
            {(['v1', 'v2', 'v3'] as const).map(v => (
              <button
                key={v}
                type="button"
                className={`bdl-st-var ${variation === v ? 'active' : ''}`}
                onClick={() => setVariation(v)}
              >
                {v.toUpperCase()}
              </button>
            ))}
          </div>
        </header>

        {/* Visual mockup */}
        <div
          className="bdl-st-mockup"
          style={{
            ['--mp-a' as any]: blendedPalette[0],
            ['--mp-b' as any]: blendedPalette[1] || blendedPalette[0],
          }}
        >
          <span className="bdl-st-mockup-tag">
            Visual treatment · from {refs.length > 0 ? refs.map(r => r.title).join(' + ') : 'brand defaults'}
          </span>
          <h3 className="bdl-st-mockup-headline">The system is the brand.</h3>
          <span className="bdl-st-mockup-sub">
            {brand?.name || 'Brand'} · cover frame {variation.toUpperCase()}
          </span>
        </div>

        {/* Copy preview */}
        <div className="bdl-st-copy">
          <div className="bdl-st-copy-head">
            <span
              className="bdl-st-brand-logo"
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: brand ? brandLogoBg(brand) : '#18181b',
                color: brand ? brandLogoFg(brand) : '#fff',
              }}
            >
              {brand ? brand.name.split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') : 'B'}
            </span>
            <div>
              <div className="bdl-st-copy-name">{brand?.name || 'Brand'}</div>
              <div className="bdl-st-copy-sub">{(brand as any)?.industry || 'preview'}</div>
            </div>
          </div>
          <div className="bdl-st-copy-body">
            {variation === 'v1' && (
              <>Most agencies don't have a content problem.<br />They have a <strong>system problem</strong>.<br /><br />In 6 weeks we deployed a weekly review, a 3-channel cadence, and a repurposing flow. 90 days later: zero misses.</>
            )}
            {variation === 'v2' && (
              <>Mulberry missed 6 weeks of publishing in a row.<br /><br />Founder bandwidth, not strategy, was the bottleneck.<br /><br />Here's the system we put in and what changed in 90 days.</>
            )}
            {variation === 'v3' && (
              <>Why do <strong>good agencies</strong> miss their own cadence?<br /><br />It's not talent. It's the absence of a system that runs without the founder.</>
            )}
          </div>
          <div className="bdl-st-copy-foot">
            <span>♡ Like</span>
            <span>💬 Comment</span>
            <span style={{ marginLeft: 'auto', opacity: 0.6, fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5 }}>
              within brand rules
            </span>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bdl-st-toolbar">
          <button type="button" className="bdl-st-tool">
            <Icons.Edit size={12} /> Edit
          </button>
          <button type="button" className="bdl-st-tool">
            <Icons.RefreshCw size={12} /> Regenerate
          </button>
          <button type="button" className="bdl-st-tool refine">
            <Icons.Message size={12} /> Refine
          </button>
        </div>
      </section>
    </div>
  );
};
