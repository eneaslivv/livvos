// LIVV OS — Content (Brands + Studio) + Toolkit (Connections)
const { useState: useCnS, useEffect: useCnE } = React;

// ─────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────
const BRANDS = [
  {
    id: 'livv',
    name: 'Livv Studio',
    industry: 'Operations · Strategy',
    tagline: 'Operating systems for the next generation of brands.',
    own: true,
    status: 'active',
    palette: ['#C4A35A', '#2C0405', '#FDFBF7'],
    assets: 47,
    updated: '2d ago',
    initials: 'L',
    logoBg: 'var(--os-ink)',
    voice: { formal: 0.35, technical: 0.50, serious: 0.45, direct: 0.75 },
    fonts: { heading: 'Inter', body: 'Inter' },
    photo: ['minimal', 'warm tones', 'editorial', 'documentary'],
    audience: 'Founders building service businesses 0→1M.',
    personality: 'A peer who has been there, talking shop without buzzwords.',
  },
  {
    id: 'mulberry',
    name: 'Mulberry Group',
    industry: 'Creative agency',
    tagline: 'Brand systems for ambitious teams.',
    status: 'active',
    palette: ['#C4A35A', '#1F1611', '#F5EFE8'],
    assets: 24,
    updated: 'Yesterday',
    initials: 'M',
    logoBg: '#1F1611',
    voice: { formal: 0.40, technical: 0.30, serious: 0.55, direct: 0.65 },
    fonts: { heading: 'PP Editorial', body: 'Inter' },
    photo: ['warm tones', 'editorial', 'craft'],
    audience: 'Founders of growing brands who think design matters.',
    personality: 'A creative director who keeps it grounded in business outcomes.',
  },
  {
    id: 'cremona',
    name: 'Cremona Capital',
    industry: 'Independent consulting',
    tagline: 'Patient capital for operators.',
    status: 'active',
    palette: ['#6DBEDC', '#0F1B2D', '#E8EFF6'],
    assets: 18,
    updated: '4d ago',
    initials: 'C',
    logoBg: '#0F1B2D',
    voice: { formal: 0.70, technical: 0.55, serious: 0.75, direct: 0.80 },
    fonts: { heading: 'Söhne', body: 'Söhne' },
    photo: ['minimal', 'clean', 'corporate'],
    audience: 'Founders evaluating long-term capital partners.',
    personality: 'A patient partner who values clarity over flash.',
  },
  {
    id: 'sunnyside',
    name: 'Sunnyside',
    industry: 'Brand studio',
    tagline: 'Quiet brands, loud results.',
    status: 'draft',
    palette: ['#F1ADD8', '#23150E', '#FBF2EC'],
    assets: 31,
    updated: '8d ago',
    initials: 'S',
    logoBg: '#23150E',
    voice: { formal: 0.20, technical: 0.30, serious: 0.30, direct: 0.45 },
    fonts: { heading: 'Editorial New', body: 'Inter' },
    photo: ['playful', 'pastel', 'lifestyle', 'editorial'],
    audience: 'DTC founders rebranding for the next phase.',
    personality: 'A friend who tells you when the design is trying too hard.',
  },
];

const CONNECTIONS = [
  // Social & Publishing
  { id: 'linkedin', name: 'LinkedIn', cat: 'Social & Publishing', status: 'on',  account: '@eneas',          permissions: ['Read posts', 'Publish', 'Analytics'],        sync: '12m ago', color: '#0A66C2' },
  { id: 'instagram', name: 'Instagram', cat: 'Social & Publishing', status: 'on',  account: '@livvstudio',     permissions: ['Read posts', 'Publish', 'Insights'],         sync: '24m ago', color: '#E1306C' },
  { id: 'meta-ads', name: 'Meta Ads',   cat: 'Social & Publishing', status: 'off', account: null,              permissions: ['Create ads', 'Read campaigns', 'Analytics'], sync: null, color: '#1877F2' },
  { id: 'google-ads', name: 'Google Ads', cat: 'Social & Publishing', status: 'off', account: null,            permissions: ['Create ads', 'Read campaigns'],              sync: null, color: '#4285F4' },
  { id: 'youtube',  name: 'YouTube',    cat: 'Social & Publishing', status: 'off', account: null,              permissions: ['Upload', 'Analytics'],                       sync: null, color: '#FF0000' },

  // Reference & Inspiration
  { id: 'pinterest', name: 'Pinterest', cat: 'Reference & Inspiration', status: 'on', account: '@livvstudio · 3 boards', permissions: ['Read pins', 'Sync boards'], sync: 'Just now', color: '#E60023' },
  { id: 'fonts',     name: 'Google Fonts', cat: 'Reference & Inspiration', status: 'on', account: '418 families', permissions: ['Browse', 'Use'], sync: 'Library', color: '#4285F4' },

  // Design & Assets
  { id: 'figma',     name: 'Figma',      cat: 'Design & Assets', status: 'on',  account: 'Eneas · Livv Studio', permissions: ['Read frames', 'Import tokens'], sync: '2h ago', color: '#A259FF' },
  { id: 'canva',     name: 'Canva',      cat: 'Design & Assets', status: 'off', account: null, permissions: ['Export to Canva'],   sync: null, color: '#00C4CC' },
  { id: 'cloudinary',name: 'Cloudinary', cat: 'Design & Assets', status: 'off', account: null, permissions: ['Upload', 'Transform'], sync: null, color: '#3448C5' },

  // Data & CRM
  { id: 'ga',       name: 'Google Analytics', cat: 'Data & CRM', status: 'on',  account: 'livv.studio', permissions: ['Read sessions', 'Read events'], sync: '5m ago', color: '#F9AB00' },
  { id: 'webhooks', name: 'Webhooks',         cat: 'Data & CRM', status: 'off', account: null, permissions: ['Custom endpoints'], sync: null, color: 'var(--os-fg-1)' },
];

// ─────────────────────────────────────────────────────────────
// CONTENT → BRANDS
// ─────────────────────────────────────────────────────────────
const ContentBrands = ({ onOpenBrand }) => {
  const [filter, setFilter] = useCnS('all');
  const filtered = BRANDS.filter(b => {
    if (filter === 'all') return true;
    if (filter === 'mine') return b.own;
    return b.status === filter;
  });
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <div className="filter-row">
          {[
            { id: 'all', label: 'All', count: BRANDS.length },
            { id: 'active', label: 'Active', count: BRANDS.filter(b => b.status === 'active').length },
            { id: 'draft', label: 'Draft', count: BRANDS.filter(b => b.status === 'draft').length },
            { id: 'mine', label: 'Mine', count: BRANDS.filter(b => b.own).length },
          ].map(f => (
            <button key={f.id} className={`fc ${filter === f.id ? 'active' : ''}`} onClick={() => setFilter(f.id)}>
              {f.label}
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9.5,
                padding: '1px 6px', borderRadius: 5,
                background: filter === f.id ? 'rgba(255,255,255,0.18)' : 'var(--os-surface-2)',
                color: filter === f.id ? 'var(--livv-cream-50)' : 'var(--os-fg-2)',
              }}>{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="brand-grid">
        {filtered.map(b => (
          <article key={b.id} className="brand-card" onClick={() => onOpenBrand(b)}>
            <header className="brand-card-head">
              <div className="brand-logo" style={{ background: b.logoBg, color: b.palette[2] }}>
                <span className="brand-logo-mark">{b.initials}</span>
                {b.own && <span className="brand-own-dot" title="Your own brand"/>}
              </div>
              <div className="brand-card-meta">
                <h3>{b.name}</h3>
                <span className="brand-industry">{b.industry}</span>
              </div>
              <span className={`brand-status ${b.status}`}>{b.status}</span>
            </header>
            <p className="brand-tagline">"{b.tagline}"</p>
            <div className="brand-palette-row">
              <div className="brand-palette">
                {b.palette.map((c, i) => (
                  <span key={i} className="brand-swatch" style={{ background: c, zIndex: 3 - i }}/>
                ))}
              </div>
              <span className="brand-palette-meta">{b.fonts.heading} / {b.fonts.body}</span>
            </div>
            <footer className="brand-card-foot">
              <span><strong>{b.assets}</strong> assets</span>
              <span className="dot-sep">·</span>
              <span>Updated {b.updated}</span>
            </footer>
          </article>
        ))}

        <button className="brand-add" onClick={() => onOpenBrand(null)}>
          <div className="brand-add-ic">
            <OS_ICON name="plus" size={18}/>
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--os-fg-0)' }}>New brand kit</div>
          <div style={{ fontSize: 11.5, color: 'var(--os-fg-2)', maxWidth: 220, textAlign: 'center', lineHeight: 1.45 }}>
            Configure identity, voice, palette and references. Used by every AI generation.
          </div>
        </button>
      </div>
    </>
  );
};

// ─────────────────────────────────────────────────────────────
// BRAND DETAIL SLIDE-OVER
// ─────────────────────────────────────────────────────────────
const BRAND_SECTIONS = [
  { id: 'identity', label: 'Identity',   icon: 'palette' },
  { id: 'visual',   label: 'Visual',     icon: 'layout'  },
  { id: 'voice',    label: 'Voice',      icon: 'chat'    },
  { id: 'rules',    label: 'Rules',      icon: 'tasks'   },
  { id: 'refs',     label: 'References', icon: 'spark'   },
  { id: 'preview',  label: 'Preview',    icon: 'eye'     },
];

const BrandDetail = ({ brand, onClose }) => {
  const [sec, setSec] = useCnS('identity');
  useCnE(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="so-overlay" onClick={onClose}/>
      <aside className="so so-wide" style={{ '--icp-color': brand.palette[0] }} data-screen-label="Brand Detail">
        <header className="so-head">
          <div className="brand-logo" style={{ background: brand.logoBg, color: brand.palette[2], width: 44, height: 44, borderRadius: 12 }}>
            <span className="brand-logo-mark" style={{ fontSize: 16 }}>{brand.initials}</span>
          </div>
          <div className="so-titleline">
            <div className="so-title">
              {brand.name}
              <span className={`brand-status ${brand.status}`}>{brand.status}</span>
            </div>
            <div className="so-sub">
              <span>{brand.industry}</span>
              <span className="sep">·</span>
              <span className="lk">{brand.fonts.heading} / {brand.fonts.body}</span>
              <span className="sep">·</span>
              <span><strong style={{ color: 'var(--os-fg-0)', fontWeight: 500 }}>{brand.assets}</strong> assets</span>
            </div>
          </div>
          <div className="so-actions">
            <button className="so-iconbtn" title="Train style with AI"><OS_ICON name="sparkle" size={14}/></button>
            <button className="so-iconbtn" title="Expand"><OS_ICON name="expand" size={14}/></button>
            <button className="so-iconbtn" onClick={onClose}><OS_ICON name="close" size={14} stroke={2}/></button>
          </div>
        </header>

        <nav className="brand-nav">
          {BRAND_SECTIONS.map(s => (
            <button key={s.id} className={`brand-nav-item ${sec === s.id ? 'active' : ''}`} onClick={() => setSec(s.id)}>
              <OS_ICON name={s.icon} size={12}/>
              {s.label}
            </button>
          ))}
        </nav>

        <div className="so-body brand-body">
          {sec === 'identity' && <BrandIdentity brand={brand}/>}
          {sec === 'visual'   && <BrandVisual brand={brand}/>}
          {sec === 'voice'    && <BrandVoice brand={brand}/>}
          {sec === 'rules'    && <BrandRules brand={brand}/>}
          {sec === 'refs'     && <BrandRefs brand={brand}/>}
          {sec === 'preview'  && <BrandPreview brand={brand}/>}
        </div>
      </aside>
    </>
  );
};

const SectionTitle = ({ children }) => (
  <h4 style={{
    margin: '0 0 12px', fontSize: 11, fontWeight: 600,
    fontFamily: 'var(--font-mono)', letterSpacing: '0.22em',
    textTransform: 'uppercase', color: 'var(--os-fg-2)',
  }}>{children}</h4>
);

const FieldLabel = ({ children }) => (
  <span style={{
    fontFamily: 'var(--font-mono)', fontSize: 9.5,
    letterSpacing: '0.18em', textTransform: 'uppercase',
    color: 'var(--os-fg-2)',
  }}>{children}</span>
);

const BrandIdentity = ({ brand }) => (
  <div className="brand-stack">
    <div className="brand-section">
      <SectionTitle>Identity</SectionTitle>
      <div className="brand-grid-2">
        <div>
          <FieldLabel>Brand name</FieldLabel>
          <input className="coach-input" defaultValue={brand.name}/>
        </div>
        <div>
          <FieldLabel>Industry</FieldLabel>
          <input className="coach-input" defaultValue={brand.industry}/>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <FieldLabel>Tagline</FieldLabel>
          <input className="coach-input" defaultValue={brand.tagline}/>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <FieldLabel>Description</FieldLabel>
          <textarea className="notes" style={{ minHeight: 80 }} defaultValue={`${brand.audience}\n\n${brand.personality}`}/>
        </div>
      </div>
    </div>
    <div className="brand-section">
      <SectionTitle>Logo</SectionTitle>
      <div className="brand-logo-row">
        {['Primary', 'Secondary', 'Icon'].map((label, i) => (
          <div key={i} className="brand-logo-slot">
            <div className="brand-logo" style={{ background: i === 1 ? brand.palette[2] : brand.logoBg, color: i === 1 ? brand.logoBg : brand.palette[2], width: 56, height: 56, borderRadius: 14 }}>
              <span className="brand-logo-mark" style={{ fontSize: 22 }}>{brand.initials}</span>
            </div>
            <span className="brand-logo-label">{label}</span>
            <button className="brand-replace">Replace</button>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const BrandVisual = ({ brand }) => (
  <div className="brand-stack">
    <div className="brand-section">
      <SectionTitle>Color palette</SectionTitle>
      <div className="brand-palette-builder">
        {['Primary', 'Secondary', 'Background', 'Text', 'Accent'].map((role, i) => {
          const c = brand.palette[i % brand.palette.length];
          return (
            <div key={role} className="brand-color">
              <div className="brand-color-swatch" style={{ background: c }}/>
              <div>
                <div className="brand-color-role">{role}</div>
                <div className="brand-color-hex">{c.toUpperCase()}</div>
              </div>
              <span className="brand-color-edit"><OS_ICON name="edit" size={11}/></span>
            </div>
          );
        })}
        <div className="brand-palette-actions">
          <button className="coach-btn"><OS_ICON name="sparkle" size={11}/>Extract from logo</button>
          <button className="coach-btn"><OS_ICON name="link" size={11}/>Import from URL</button>
        </div>
      </div>
    </div>

    <div className="brand-section">
      <SectionTitle>Typography</SectionTitle>
      <div className="brand-type-preview" style={{ background: brand.palette[2], color: brand.palette[1] }}>
        <div className="brand-type-h" style={{ fontFamily: brand.fonts.heading }}>{brand.tagline}</div>
        <div className="brand-type-b" style={{ fontFamily: brand.fonts.body }}>
          A short paragraph of body copy using the secondary font. This is how editorial
          content reads inside this brand — pay attention to the rhythm.
        </div>
        <div className="brand-type-meta">
          <span>{brand.fonts.heading} / Heading</span>
          <span className="sep">·</span>
          <span>{brand.fonts.body} / Body</span>
        </div>
      </div>
    </div>

    <div className="brand-section">
      <SectionTitle>Photographic style</SectionTitle>
      <div className="brand-tags">
        {brand.photo.map(t => (
          <span key={t} className="brand-tag sel">{t}</span>
        ))}
        {['minimal','warm tones','lifestyle','dark mood','editorial','craft','documentary','playful','pastel','corporate','clean'].filter(t => !brand.photo.includes(t)).slice(0, 6).map(t => (
          <span key={t} className="brand-tag">{t}</span>
        ))}
      </div>
    </div>

    <div className="brand-section">
      <SectionTitle>Moodboard · 18 images</SectionTitle>
      <div className="brand-mood">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="brand-mood-tile" style={{
            background: `linear-gradient(${135 + i * 35}deg, ${brand.palette[i % brand.palette.length]}, ${brand.palette[(i + 1) % brand.palette.length]})`,
          }}>
            <span className="brand-mood-source">
              {i % 3 === 0 ? <OS_ICON name="link" size={10}/> : i % 3 === 1 ? <OS_ICON name="spark" size={10}/> : <OS_ICON name="docs" size={10}/>}
              {i % 3 === 0 ? 'Pinterest' : i % 3 === 1 ? 'LinkedIn' : 'Upload'}
            </span>
          </div>
        ))}
        <button className="brand-mood-add">
          <OS_ICON name="plus" size={16}/>
          <span>Add reference</span>
        </button>
      </div>
    </div>
  </div>
);

const BrandVoice = ({ brand }) => (
  <div className="brand-stack">
    <div className="brand-section">
      <SectionTitle>Tone — sliders</SectionTitle>
      <div className="brand-sliders">
        {[
          { l: 'Formal', r: 'Casual', v: brand.voice.formal },
          { l: 'Technical', r: 'Accessible', v: brand.voice.technical },
          { l: 'Serious', r: 'Playful', v: brand.voice.serious },
          { l: 'Direct', r: 'Storytelling', v: brand.voice.direct },
        ].map((s, i) => (
          <div key={i} className="brand-slider">
            <span className="brand-slider-l">{s.l}</span>
            <div className="brand-slider-track">
              <span className="brand-slider-thumb" style={{ left: `${s.v * 100}%` }}/>
            </div>
            <span className="brand-slider-r">{s.r}</span>
          </div>
        ))}
      </div>
    </div>

    <div className="brand-section">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <SectionTitle>Use these words</SectionTitle>
          <div className="brand-tags">
            {['sistemas','transformación','resultados','operación','foundations','momentum'].map(t => (
              <span key={t} className="brand-tag sel">{t}</span>
            ))}
            <button className="brand-tag-add"><OS_ICON name="plus" size={10}/>Add</button>
          </div>
        </div>
        <div>
          <SectionTitle>Never these</SectionTitle>
          <div className="brand-tags">
            {['revolucionario','sinergias','game-changer','disrupción','best-in-class'].map(t => (
              <span key={t} className="brand-tag forbidden">{t}</span>
            ))}
            <button className="brand-tag-add"><OS_ICON name="plus" size={10}/>Add</button>
          </div>
        </div>
      </div>
    </div>

    <div className="brand-section">
      <SectionTitle>Personality in one line</SectionTitle>
      <input className="coach-input" defaultValue={brand.personality}/>
    </div>

    <div className="brand-section">
      <SectionTitle>Voice samples · 3 references</SectionTitle>
      {[
        '"We don\'t build websites. We build the systems behind your next 18 months of growth."',
        '"You have the operation. We give it teeth."',
        '"Brand isn\'t a layer on top. It\'s the operating system underneath."',
      ].map((s, i) => (
        <div key={i} className="brand-sample">
          <span className="brand-sample-q">"</span>
          <p>{s}</p>
          <span className="brand-sample-meta">Sample {i + 1} · LinkedIn post</span>
        </div>
      ))}
      <button className="log-btn"><OS_ICON name="plus" size={13}/>Add voice sample</button>
    </div>
  </div>
);

const BrandRules = ({ brand }) => (
  <div className="brand-stack">
    <div className="brand-section">
      <SectionTitle>Channel formats &amp; cadence</SectionTitle>
      <div className="brand-rules-grid">
        {[
          { ch: 'LinkedIn',  color: 'var(--sky)',  formats: ['Post', 'Carrusel', 'Article'], target: '3 / wk' },
          { ch: 'Instagram', color: 'var(--pink)', formats: ['Reel', 'Carrusel', 'Single'],   target: '2 / wk' },
          { ch: 'Email',     color: 'var(--sage)', formats: ['Newsletter'],                     target: '1 / wk' },
        ].map(r => (
          <div key={r.ch} className="brand-rule-card" style={{ '--c': r.color }}>
            <header>
              <span className="dot" style={{ background: r.color }}/>
              <strong>{r.ch}</strong>
              <span className="brand-rule-target">{r.target}</span>
            </header>
            <div className="brand-tags">
              {r.formats.map(f => (
                <span key={f} className="brand-tag sel">{f}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>

    <div className="brand-section">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <SectionTitle>Approved hashtags</SectionTitle>
          <div className="brand-tags">
            {['#operatingsystem','#systemsthinking','#agencylife','#bootstrapping','#founderjourney'].map(t => (
              <span key={t} className="brand-tag sel">{t}</span>
            ))}
          </div>
        </div>
        <div>
          <SectionTitle>Approved CTAs</SectionTitle>
          <div className="brand-tags">
            {['Reply to this','Book a 15-min call','DM "system"','Comment below'].map(t => (
              <span key={t} className="brand-tag sel">{t}</span>
            ))}
          </div>
        </div>
      </div>
    </div>

    <div className="brand-section">
      <SectionTitle>Format rules</SectionTitle>
      <div className="brand-format-rules">
        <div className="brand-format-rule"><span>Emojis</span><span className="value">Never</span></div>
        <div className="brand-format-rule"><span>Em dashes</span><span className="value">Allowed · sparingly</span></div>
        <div className="brand-format-rule"><span>Max post length · LinkedIn</span><span className="value">1,200 chars</span></div>
        <div className="brand-format-rule"><span>Bullet points</span><span className="value">Only when listing</span></div>
        <div className="brand-format-rule"><span>Hook style</span><span className="value">Statement, not question</span></div>
      </div>
    </div>
  </div>
);

const BrandRefs = ({ brand }) => (
  <div className="brand-stack">
    <div className="brand-section">
      <SectionTitle>AI training</SectionTitle>
      <div className="brand-train">
        <div className="brand-train-status">
          <span className="brand-train-dot"/>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--os-fg-0)' }}>Brand prompt trained</div>
            <div style={{ fontSize: 11.5, color: 'var(--os-fg-2)', fontFamily: 'var(--font-mono)' }}>2,847 tokens · last trained yesterday</div>
          </div>
          <button className="so-action primary" style={{ flex: 0, marginLeft: 'auto', padding: '8px 14px' }}>
            <OS_ICON name="sparkle" size={12}/>Retrain
          </button>
        </div>
        <div className="brand-train-summary">
          <div className="brand-train-row"><span>Palette</span><strong>5 colors</strong></div>
          <div className="brand-train-row"><span>Fonts</span><strong>2 families</strong></div>
          <div className="brand-train-row"><span>Voice samples</span><strong>3 referenced</strong></div>
          <div className="brand-train-row"><span>Moodboard</span><strong>18 images</strong></div>
          <div className="brand-train-row"><span>Forbidden words</span><strong>5 enforced</strong></div>
        </div>
      </div>
    </div>

    <div className="brand-section">
      <SectionTitle>Pinterest boards · 3 linked</SectionTitle>
      <div className="brand-ref-list">
        {[
          { name: 'Editorial layouts', count: 84, sync: 'auto' },
          { name: 'Warm-toned photography', count: 142, sync: 'auto' },
          { name: 'Type specimens', count: 56, sync: 'manual' },
        ].map(b => (
          <div key={b.name} className="brand-ref">
            <span className="brand-ref-ic" style={{ background: '#E60023' }}>
              <OS_ICON name="spark" size={10}/>
            </span>
            <div>
              <div style={{ fontSize: 12.5, color: 'var(--os-fg-0)', fontWeight: 500 }}>{b.name}</div>
              <div style={{ fontSize: 10.5, color: 'var(--os-fg-2)', fontFamily: 'var(--font-mono)' }}>{b.count} pins · {b.sync} sync</div>
            </div>
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ok)' }}>● Synced</span>
          </div>
        ))}
        <button className="log-btn"><OS_ICON name="plus" size={12}/>Link another board</button>
      </div>
    </div>

    <div className="brand-section">
      <SectionTitle>LinkedIn references · 4 posts</SectionTitle>
      <div className="brand-ref-list">
        {[
          { who: '@jasonfried', text: 'Most companies optimize the wrong thing because they\'re measuring the wrong thing.', metric: '4.2K reactions' },
          { who: '@arvidkahl',  text: 'Bootstrapping isn\'t cheap — it\'s expensive in time. But you keep the company.', metric: '1.8K reactions' },
          { who: '@livvstudio', text: 'Brand is the receipt. The system is the kitchen.', metric: '624 reactions' },
        ].map((p, i) => (
          <div key={i} className="brand-ref">
            <span className="brand-ref-ic" style={{ background: '#0A66C2' }}><OS_ICON name="chat" size={10}/></span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, color: 'var(--os-fg-0)' }}>{p.text}</div>
              <div style={{ fontSize: 10.5, color: 'var(--os-fg-2)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>{p.who} · {p.metric}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const BrandPreview = ({ brand }) => (
  <div className="brand-stack">
    <SectionTitle>Live preview · how generated content looks with this brand kit</SectionTitle>
    <div className="brand-preview-grid">
      <div className="brand-preview-card" style={{ background: brand.palette[2] }}>
        <div className="brand-preview-tag">LinkedIn post</div>
        <div className="brand-preview-header">
          <div className="brand-logo" style={{ background: brand.logoBg, color: brand.palette[2], width: 32, height: 32, borderRadius: 999 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{brand.initials}</span>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: brand.palette[1], fontFamily: brand.fonts.heading }}>{brand.name}</div>
            <div style={{ fontSize: 10, color: brand.palette[1], opacity: 0.6 }}>{brand.industry} · 2h</div>
          </div>
        </div>
        <div className="brand-preview-body" style={{ color: brand.palette[1], fontFamily: brand.fonts.body }}>
          Most agencies don't have a content problem.<br/>
          They have a <strong style={{ fontFamily: brand.fonts.heading }}>system problem</strong>.<br/><br/>
          Here's what we changed at Mulberry that took them from 6 misses in a row to publishing 3x per week, on time, for 90 days running.
        </div>
        <div className="brand-preview-footer" style={{ borderColor: `${brand.palette[1]}22` }}>
          <span style={{ color: brand.palette[1], opacity: 0.55 }}>♡ 124</span>
          <span style={{ color: brand.palette[1], opacity: 0.55 }}>💬 18</span>
          <span style={{ color: brand.palette[1], opacity: 0.55 }}>↗ 7</span>
        </div>
      </div>

      <div className="brand-preview-card" style={{ background: brand.palette[1], color: brand.palette[2] }}>
        <div className="brand-preview-tag" style={{ background: `${brand.palette[2]}15`, color: brand.palette[2] }}>Instagram carrusel · slide 1/5</div>
        <div style={{ aspectRatio: '1 / 1', padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: brand.fonts.heading, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.6 }}>{brand.name}</div>
          <div style={{ fontFamily: brand.fonts.heading, fontSize: 26, lineHeight: 1.1, fontWeight: 300, letterSpacing: '-0.02em' }}>
            The system is the brand.
          </div>
          <div style={{ fontFamily: brand.fonts.body, fontSize: 11, opacity: 0.7 }}>Swipe →</div>
        </div>
      </div>

      <div className="brand-preview-card" style={{ background: brand.palette[2] }}>
        <div className="brand-preview-tag" style={{ background: `${brand.palette[0]}22`, color: brand.palette[1] }}>Meta Ad · primary text</div>
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: brand.palette[1], marginBottom: 6, fontFamily: brand.fonts.heading }}>
            Your agency runs you. We build the system that runs your agency.
          </div>
          <div style={{ fontSize: 11.5, color: `${brand.palette[1]}99`, lineHeight: 1.55, fontFamily: brand.fonts.body }}>
            We deploy an operating system across content, sales, and team in 6 weeks. You keep doing the work you want to do.
          </div>
        </div>
        <div style={{ padding: '8px 16px', borderTop: `1px solid ${brand.palette[1]}15`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: `${brand.palette[1]}66`, fontFamily: brand.fonts.body, textTransform: 'uppercase', letterSpacing: '0.1em' }}>livv.studio</span>
          <span style={{ padding: '5px 12px', background: brand.palette[1], color: brand.palette[2], borderRadius: 6, fontSize: 11, fontWeight: 600, fontFamily: brand.fonts.heading }}>Book a 15-min call</span>
        </div>
      </div>
    </div>
    <button className="so-action" style={{ width: '100%', marginTop: 12 }}>
      <OS_ICON name="sparkle" size={13}/>Regenerate previews
    </button>
  </div>
);

// ─────────────────────────────────────────────────────────────
// CONTENT → STUDIO (redesigned · 3-pane aesthetic generator)
// ─────────────────────────────────────────────────────────────
const PIN_BOARDS = [
  { id: 'editorial', name: 'Editorial layouts',     count: 84,  pal: ['#2C0405', '#C4A35A', '#FDFBF7'] },
  { id: 'warm',      name: 'Warm-toned photography', count: 142, pal: ['#8B5A2B', '#F5E6D3', '#3D2817'] },
  { id: 'type',      name: 'Type specimens',          count: 56,  pal: ['#0A0A0B', '#FAFAFA', '#E6E2D8'] },
  { id: 'brand',     name: 'Brand systems',            count: 73,  pal: ['#769268', '#E8EFE5', '#1F2D1A'] },
  { id: 'motion',    name: 'Motion / frames',          count: 41,  pal: ['#F1ADD8', '#FBF2EC', '#23150E'] },
  { id: 'product',   name: 'Product photography',      count: 64,  pal: ['#6DBEDC', '#0F1B2D', '#E8EFF6'] },
];

const PINS = [
  // Editorial — warm wine + gold
  { id: 'p1',  board: 'editorial', pal: ['#2C0405','#C4A35A','#FDFBF7'], texture: 'editorial', title: 'Wine + gold cover' },
  { id: 'p2',  board: 'editorial', pal: ['#3D1214','#E8BC59','#F5EFE2'], texture: 'paper',     title: 'Magazine spread' },
  { id: 'p3',  board: 'editorial', pal: ['#1F1611','#C9A35F','#F8F3E8'], texture: 'soft',      title: 'Quiet typography' },
  // Warm
  { id: 'p4',  board: 'warm',      pal: ['#8B5A2B','#F5E6D3','#3D2817'], texture: 'film',      title: 'Sunset interior' },
  { id: 'p5',  board: 'warm',      pal: ['#A07248','#EBD9C2','#2D1810'], texture: 'film',      title: 'Coffee on linen' },
  { id: 'p6',  board: 'warm',      pal: ['#6D4127','#F0DDB8','#1F0E04'], texture: 'film',      title: 'Golden hour table' },
  // Type
  { id: 'p7',  board: 'type',      pal: ['#0A0A0B','#FAFAFA','#E6E2D8'], texture: 'serif',     title: 'Serif specimen' },
  { id: 'p8',  board: 'type',      pal: ['#1A1A1A','#F5F5F5','#C4C4C4'], texture: 'mono',      title: 'Mono grid' },
  // Brand
  { id: 'p9',  board: 'brand',     pal: ['#769268','#E8EFE5','#1F2D1A'], texture: 'system',    title: 'System grid' },
];

const TRAINED_STYLES = [
  { id: 'ts1', name: 'Livv editorial',    pal: ['#2C0405','#C4A35A','#FDFBF7'], runs: 24 },
  { id: 'ts2', name: 'Mulberry warmth',   pal: ['#1F1611','#C4A35A','#F5EFE8'], runs: 18 },
  { id: 'ts3', name: 'Cremona clean',     pal: ['#0F1B2D','#6DBEDC','#E8EFF6'], runs: 12 },
  { id: 'ts4', name: 'Sunnyside playful', pal: ['#23150E','#F1ADD8','#FBF2EC'], runs: 9 },
];

// Pin tile — gradient mockup with texture hint
const PinTile = ({ pin, selected, onToggle, big }) => {
  const angle = parseInt(pin.id.replace(/\D/g, ''), 10) * 35 + 135;
  return (
    <button
      className={`pin-tile ${selected ? 'sel' : ''} ${big ? 'big' : ''}`}
      onClick={() => onToggle(pin)}
      style={{ '--p0': pin.pal[0], '--p1': pin.pal[1], '--p2': pin.pal[2] || pin.pal[0] }}
    >
      <div className="pin-canvas" style={{ background: `linear-gradient(${angle}deg, ${pin.pal[0]} 0%, ${pin.pal[1]} 50%, ${pin.pal[2] || pin.pal[0]} 100%)` }}>
        {/* texture marks */}
        {pin.texture === 'editorial' && (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <rect x="14" y="20" width="36" height="3" fill={pin.pal[2] || '#fff'} opacity="0.8"/>
            <rect x="14" y="28" width="50" height="2" fill={pin.pal[2] || '#fff'} opacity="0.45"/>
            <rect x="14" y="34" width="42" height="2" fill={pin.pal[2] || '#fff'} opacity="0.45"/>
            <rect x="14" y="40" width="48" height="2" fill={pin.pal[2] || '#fff'} opacity="0.45"/>
            <text x="14" y="78" fontSize="22" fontWeight="300" fill={pin.pal[2] || '#fff'} fontFamily="serif" letterSpacing="-1">Edit.</text>
          </svg>
        )}
        {pin.texture === 'film' && (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <circle cx="68" cy="32" r="14" fill={pin.pal[1]} opacity="0.55"/>
            <rect x="20" y="55" width="60" height="22" rx="2" fill={pin.pal[2] || pin.pal[1]} opacity="0.35"/>
          </svg>
        )}
        {(pin.texture === 'serif' || pin.texture === 'mono') && (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <text x="50%" y="60%" fontSize="42" fontWeight="600" textAnchor="middle" fill={pin.pal[1]} fontFamily={pin.texture === 'serif' ? 'serif' : 'monospace'} letterSpacing={pin.texture === 'mono' ? '4' : '-2'}>Aa</text>
          </svg>
        )}
        {pin.texture === 'system' && (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            {Array.from({length: 5}).map((_, i) => Array.from({length: 5}).map((__, j) => (
              <rect key={`${i}-${j}`} x={10 + i*16} y={10 + j*16} width="12" height="12" fill={pin.pal[(i+j) % pin.pal.length]} opacity={0.4 + ((i+j) % 3) * 0.2}/>
            )))}
          </svg>
        )}
        {pin.texture === 'paper' && (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <rect x="20" y="14" width="60" height="72" rx="1" fill={pin.pal[2] || '#fff'} opacity="0.5"/>
            <rect x="28" y="24" width="36" height="2" fill={pin.pal[0]} opacity="0.7"/>
            <rect x="28" y="32" width="44" height="1.5" fill={pin.pal[0]} opacity="0.3"/>
            <rect x="28" y="38" width="40" height="1.5" fill={pin.pal[0]} opacity="0.3"/>
          </svg>
        )}
        {pin.texture === 'soft' && (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <text x="50%" y="55%" fontSize="20" fontWeight="300" textAnchor="middle" fill={pin.pal[2] || '#fff'} fontFamily="serif" letterSpacing="0.06em" opacity="0.9">whispered</text>
          </svg>
        )}
      </div>
      <div className="pin-tile-foot">
        <div className="pin-tile-pal">{pin.pal.map((c, j) => <span key={j} style={{ background: c }}/>)}</div>
        <span className="pin-tile-title">{pin.title}</span>
      </div>
      <span className="pin-tile-state">
        {selected ? <OS_ICON name="tasks" size={10}/> : <OS_ICON name="plus" size={10}/>}
      </span>
      <span className="pin-tile-board">{PIN_BOARDS.find(b => b.id === pin.board)?.name || pin.board}</span>
    </button>
  );
};

const ContentStudio = () => {
  const [brand, setBrand] = useCnS(BRANDS[0]);
  const [channel, setChannel] = useCnS('linkedin');
  const [type, setType] = useCnS('post');
  const [icp, setIcp] = useCnS('agency');
  const [variation, setVariation] = useCnS('v1');
  const [briefing, setBriefing] = useCnS('Tell the story of how we systemized Mulberry\'s content cadence — from 6 misses in a row to publishing 3x per week for 90 days.');
  const [sourceTab, setSourceTab] = useCnS('pinterest');
  const [activeBoard, setActiveBoard] = useCnS('editorial');
  const [refs, setRefs] = useCnS([PINS[0]]);

  const togglePin = (pin) => {
    setRefs(prev => prev.find(p => p.id === pin.id)
      ? prev.filter(p => p.id !== pin.id)
      : prev.length >= 3 ? [...prev.slice(1), pin] : [...prev, pin]);
  };

  const channels = [
    { id: 'linkedin', label: 'LinkedIn', color: '#0A66C2' },
    { id: 'instagram', label: 'Instagram', color: '#E1306C' },
    { id: 'youtube', label: 'YouTube', color: '#FF0000' },
    { id: 'email', label: 'Email', color: 'var(--sage)' },
    { id: 'ad', label: 'Ad', color: 'var(--accent)' },
  ];
  const types = {
    linkedin: ['Post', 'Carrusel', 'Article'],
    instagram: ['Reel caption', 'Carrusel', 'Single'],
    youtube: ['Short script', 'Long-form script'],
    email: ['Newsletter', 'Promotional'],
    ad: ['Meta · primary text', 'Meta · headline', 'Google · headline'],
  };

  // The blended palette is what the output preview uses
  const blendedPalette = refs.length > 0 ? refs[0].pal : brand.palette;

  const pinsForBoard = sourceTab === 'pinterest' ? PINS.filter(p => p.board === activeBoard) : [];

  return (
    <div className="studio2">

      {/* ─── PANE 1: Config ─── */}
      <aside className="studio2-config">
        <div className="studio2-section">
          <span className="studio2-label">Brand kit</span>
          <div className="studio2-brand-row">
            {BRANDS.map(b => (
              <button key={b.id} className={`studio2-brand ${brand.id === b.id ? 'sel' : ''}`} onClick={() => setBrand(b)} title={b.name}>
                <span className="brand-logo" style={{ background: b.logoBg, color: b.palette[2], width: 30, height: 30, borderRadius: 9 }}>
                  <span className="brand-logo-mark" style={{ fontSize: 12 }}>{b.initials}</span>
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="studio2-brand-name">{b.name}</div>
                  <div className="studio2-brand-sub">{b.industry}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="studio2-section">
          <span className="studio2-label">Channel</span>
          <div className="filter-row">
            {channels.map(c => (
              <button key={c.id} className={`fc ${channel === c.id ? 'active' : ''}`} onClick={() => { setChannel(c.id); setType(types[c.id][0].toLowerCase().replace(/[^a-z]/g, '')); }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: c.color }}/>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="studio2-section">
          <span className="studio2-label">Type</span>
          <div className="filter-row">
            {types[channel].map(t => {
              const id = t.toLowerCase().replace(/[^a-z]/g, '');
              return <button key={t} className={`fc ${type === id ? 'active' : ''}`} onClick={() => setType(id)}>{t}</button>;
            })}
          </div>
        </div>

        <div className="studio2-section">
          <span className="studio2-label">ICP target</span>
          <div className="filter-row">
            {Object.entries(ICPS).map(([id, i]) => (
              <button key={id} className={`fc ${icp === id ? 'active' : ''}`} onClick={() => setIcp(id)}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: i.color }}/>
                {i.name}
              </button>
            ))}
          </div>
        </div>

        <div className="studio2-section">
          <span className="studio2-label">Briefing</span>
          <textarea className="notes" style={{ minHeight: 90, fontSize: 12.5 }} value={briefing} onChange={e => setBriefing(e.target.value)}/>
        </div>

        <button className="studio2-generate">
          <span className="studio-generate-glow" aria-hidden/>
          <OS_ICON name="sparkle" size={14}/>
          Generate · 3 variations
          <span className="kbd">⌘↵</span>
        </button>
      </aside>

      {/* ─── PANE 2: Visual Library ─── */}
      <section className="studio2-library">
        <header className="studio2-lib-head">
          <div className="studio2-lib-title">
            <span className="studio2-lib-pulse"/>
            <strong>Visual library</strong>
            <span className="studio2-lib-meta">Pinterest · Higgsfield · Trained</span>
          </div>
          <div className="studio2-conn-status">
            <span className="conn-status on" style={{ padding: '3px 8px' }}><span className="dot"/>Pinterest</span>
            <span className="conn-status on" style={{ padding: '3px 8px', background: 'rgba(124,92,255,0.10)', color: '#7C5CFF' }}><span className="dot" style={{ background: '#7C5CFF' }}/>Higgsfield · 12 styles</span>
          </div>
        </header>

        <div className="studio2-lib-tabs">
          {[
            { id: 'pinterest', label: 'Pinterest pins', count: PINS.length, ic: <span style={{ fontWeight: 700 }}>P</span> },
            { id: 'moodboard', label: 'Brand moodboard', count: 18, ic: <OS_ICON name="palette" size={11}/> },
            { id: 'trained',   label: 'Trained styles', count: TRAINED_STYLES.length, ic: <OS_ICON name="sparkle" size={11}/> },
            { id: 'upload',    label: 'Upload',         count: 0, ic: <OS_ICON name="plus" size={11}/> },
          ].map(t => (
            <button key={t.id} className={`studio2-lib-tab ${sourceTab === t.id ? 'active' : ''}`} onClick={() => setSourceTab(t.id)}>
              <span className="studio2-lib-tab-ic">{t.ic}</span>
              {t.label}
              {t.count > 0 && <span className="studio2-lib-tab-count">{t.count}</span>}
            </button>
          ))}
        </div>

        {sourceTab === 'pinterest' && (
          <>
            <div className="studio2-boards">
              {PIN_BOARDS.map(b => (
                <button key={b.id} className={`studio2-board ${activeBoard === b.id ? 'active' : ''}`} onClick={() => setActiveBoard(b.id)}>
                  <span className="studio2-board-swatches">
                    {b.pal.map((c, i) => <span key={i} style={{ background: c }}/>)}
                  </span>
                  <span className="studio2-board-name">{b.name}</span>
                  <span className="studio2-board-count">{b.count}</span>
                </button>
              ))}
            </div>
            <div className="studio2-pins">
              {pinsForBoard.length > 0 ? pinsForBoard.map(p => (
                <PinTile key={p.id} pin={p} selected={!!refs.find(r => r.id === p.id)} onToggle={togglePin}/>
              )) : PINS.slice(0, 6).map(p => (
                <PinTile key={p.id} pin={p} selected={!!refs.find(r => r.id === p.id)} onToggle={togglePin}/>
              ))}
            </div>
          </>
        )}

        {sourceTab === 'trained' && (
          <div className="studio2-trained">
            {TRAINED_STYLES.map(s => (
              <button key={s.id} className={`studio2-trained-card ${refs.find(r => r.id === s.id) ? 'sel' : ''}`} onClick={() => togglePin({ id: s.id, board: 'trained', pal: s.pal, texture: 'system', title: s.name })}>
                <div className="studio2-trained-preview" style={{ background: `linear-gradient(135deg, ${s.pal[0]}, ${s.pal[1]}, ${s.pal[2] || s.pal[0]})` }}>
                  <span style={{ position: 'absolute', top: 8, left: 8, padding: '2px 7px', background: 'rgba(15,15,15,0.55)', color: '#fff', borderRadius: 999, fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.1em' }}>TRAINED · {s.runs}</span>
                  <span style={{ position: 'absolute', bottom: 8, left: 8, color: s.pal[2] || '#fff', fontSize: 16, fontWeight: 500, letterSpacing: '-0.02em' }}>{s.name}</span>
                </div>
                <div className="studio2-trained-pal">{s.pal.map((c, j) => <span key={j} style={{ background: c }}/>)}</div>
              </button>
            ))}
            <button className="studio2-trained-add">
              <OS_ICON name="sparkle" size={16}/>
              <span style={{ fontSize: 12, fontWeight: 500 }}>Train new style</span>
              <span style={{ fontSize: 10.5, color: 'var(--os-fg-2)', textAlign: 'center', maxWidth: 160 }}>Drop 5+ pins or upload images. Higgsfield trains a reusable style model.</span>
            </button>
          </div>
        )}

        {sourceTab === 'moodboard' && (
          <div className="studio2-pins">
            {Array.from({ length: 8 }).map((_, i) => (
              <PinTile key={i} pin={{ id: `mb${i}`, board: 'mb', pal: brand.palette, texture: ['editorial','film','soft','paper','system','serif','mono','editorial'][i], title: ['Hero shot','Studio detail','Product mood','Type spec','Logo mark','Editorial spread','Mono moment','Carrusel cover'][i] }} selected={false} onToggle={togglePin}/>
            ))}
          </div>
        )}

        {sourceTab === 'upload' && (
          <div className="studio2-upload">
            <div className="studio2-upload-ic"><OS_ICON name="plus" size={26}/></div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--os-fg-0)' }}>Drop reference images</div>
            <div style={{ fontSize: 12, color: 'var(--os-fg-2)', maxWidth: 320, textAlign: 'center' }}>Higgsfield extracts palette, texture and composition signatures — and weaves them into your prompt.</div>
            <button className="so-action primary" style={{ flex: 0, marginTop: 6 }}><OS_ICON name="docs" size={12}/>Browse files</button>
          </div>
        )}

        {/* Selected refs tray + composed prompt */}
        <div className="studio2-tray">
          <div className="studio2-tray-head">
            <span className="studio2-label" style={{ margin: 0 }}>Selected references · {refs.length}/3</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--os-fg-3)' }}>Click pins to add · max 3</span>
          </div>
          <div className="studio2-tray-slots">
            {[0,1,2].map(i => {
              const r = refs[i];
              return r ? (
                <div key={i} className="studio2-tray-slot filled" style={{ background: `linear-gradient(135deg, ${r.pal[0]}, ${r.pal[1]}, ${r.pal[2] || r.pal[0]})` }}>
                  <button className="studio2-tray-rm" onClick={() => setRefs(refs.filter(x => x.id !== r.id))}>
                    <OS_ICON name="close" size={10} stroke={2.4}/>
                  </button>
                  <div className="studio2-tray-pal">{r.pal.map((c, j) => <span key={j} style={{ background: c }}/>)}</div>
                  <span className="studio2-tray-name">{r.title || r.id}</span>
                </div>
              ) : (
                <div key={i} className="studio2-tray-slot empty">
                  <span>+</span>
                </div>
              );
            })}
          </div>

          <div className="studio2-prompt">
            <div className="studio2-prompt-head">
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#7C5CFF', fontWeight: 600 }}>© Composed prompt</span>
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--os-fg-3)' }}>auto-updating</span>
            </div>
            <pre className="studio2-prompt-code">{`<brand: ${brand.name}>
  voice: ${Object.entries(brand.voice).map(([k,v]) => v > 0.5 ? k : `not-${k}`).slice(0,2).join(', ')}
  palette: ${brand.palette.join(', ')}

<aesthetic refs:>
${refs.length === 0 ? '  (none selected — output uses brand defaults)' : refs.map(r => `  • ${r.title || r.id}  [${r.pal.join(', ')}]`).join('\n')}

<task:>
  ${channel.toUpperCase()} · ${types[channel].find(t => t.toLowerCase().replace(/[^a-z]/g,'') === type)} · for ${ICPS[icp]?.name}
  ${briefing.slice(0, 100)}${briefing.length > 100 ? '…' : ''}

→ Higgsfield fuses brand voice + visual signature → 3 variations`}</pre>
          </div>
        </div>
      </section>

      {/* ─── PANE 3: Output ─── */}
      <section className="studio2-output">
        <header className="studio2-out-head">
          <div className="studio2-out-tag">
            <span className="dot" style={{ background: channels.find(c => c.id === channel).color }}/>
            <strong>{channels.find(c => c.id === channel).label}</strong>
            <span className="sep">/</span>
            <span>{types[channel].find(t => t.toLowerCase().replace(/[^a-z]/g,'') === type) || types[channel][0]}</span>
          </div>
          <div className="studio-vars">
            {['v1','v2','v3'].map(v => (
              <button key={v} className={`studio-var ${variation === v ? 'active' : ''}`} onClick={() => setVariation(v)}>
                {v.toUpperCase()}
              </button>
            ))}
          </div>
        </header>

        <div className="studio2-canvas">
          {/* Visual mockup using blended palette */}
          <div className="studio2-visual-mockup" style={{ background: `linear-gradient(135deg, ${blendedPalette[0]} 0%, ${blendedPalette[1]} 100%)` }}>
            <span className="studio2-visual-tag">Visual treatment · from {refs.length > 0 ? refs.map(r => r.title || r.id).join(' + ') : 'brand defaults'}</span>
            <div style={{
              fontFamily: brand.fonts.heading,
              fontSize: 26, fontWeight: 300, letterSpacing: '-0.025em',
              color: blendedPalette[2] || '#fff',
              padding: '40px 28px 12px',
              lineHeight: 1.15,
            }}>
              The system is the brand.
            </div>
            <div style={{ padding: '0 28px 24px', fontSize: 12, color: blendedPalette[2] || '#fff', opacity: 0.7, fontFamily: brand.fonts.body }}>
              {brand.name} · cover frame v{variation.slice(1)}
            </div>
          </div>

          {/* Copy preview */}
          <div className="brand-preview-card studio2-copy" style={{ background: brand.palette[2] }}>
            <div className="brand-preview-header">
              <div className="brand-logo" style={{ background: brand.logoBg, color: brand.palette[2], width: 32, height: 32, borderRadius: 999 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{brand.initials}</span>
              </div>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: brand.palette[1], fontFamily: brand.fonts.heading }}>{brand.name}</div>
                <div style={{ fontSize: 10.5, color: brand.palette[1], opacity: 0.55 }}>{brand.industry} · preview</div>
              </div>
            </div>
            <div className="brand-preview-body" style={{ color: brand.palette[1], fontFamily: brand.fonts.body, fontSize: 13, lineHeight: 1.55 }}>
              {variation === 'v1' && <>Most agencies don't have a content problem.<br/>They have a <strong style={{ fontFamily: brand.fonts.heading }}>system problem</strong>.<br/><br/>In 6 weeks we deployed a weekly review, a 3-channel cadence, and a repurposing flow. 90 days later: zero misses.</>}
              {variation === 'v2' && <>Mulberry missed 6 weeks of publishing in a row.<br/><br/>Founder bandwidth, not strategy, was the bottleneck.<br/><br/>Here's the system we put in and what changed in 90 days.</>}
              {variation === 'v3' && <>Why do <strong style={{ fontFamily: brand.fonts.heading }}>good agencies</strong> miss their own cadence?<br/><br/>It's not talent. It's the absence of a system that runs without the founder.</>}
            </div>
            <div className="brand-preview-footer" style={{ borderColor: `${brand.palette[1]}22` }}>
              <span style={{ color: brand.palette[1], opacity: 0.55, fontSize: 11 }}>♡ Like</span>
              <span style={{ color: brand.palette[1], opacity: 0.55, fontSize: 11 }}>💬 Comment</span>
              <span style={{ marginLeft: 'auto', color: brand.palette[1], opacity: 0.4, fontSize: 10, fontFamily: 'var(--font-mono)' }}>within brand rules</span>
            </div>
          </div>

          {/* Toolbar */}
          <div className="studio-toolbar">
            <button className="studio-tool"><OS_ICON name="edit" size={12}/>Edit</button>
            <button className="studio-tool"><OS_ICON name="sparkle" size={12}/>Regenerate</button>
            <button className="studio-tool refine"><OS_ICON name="chat" size={12}/>Refine</button>
            <span style={{ flex: 1 }}/>
            <button className="studio-tool"><OS_ICON name="calendar" size={12}/>Schedule</button>
            <button className="studio-tool primary"><OS_ICON name="tasks" size={12}/>Send to Pipeline</button>
          </div>
        </div>
      </section>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// TOOLKIT → CONNECTIONS
// ─────────────────────────────────────────────────────────────
const ToolkitConnections = () => {
  const cats = ['Social & Publishing', 'Reference & Inspiration', 'Design & Assets', 'Data & CRM'];
  const counts = cats.map(c => CONNECTIONS.filter(x => x.cat === c).filter(x => x.status === 'on').length);
  const [open, setOpen] = useCnS(null);
  return (
    <>
      <div className="conn-summary">
        {cats.map((c, i) => (
          <div key={c} className="conn-summary-cell">
            <span className="conn-summary-lbl">{c}</span>
            <span className="conn-summary-v">
              <strong>{counts[i]}</strong>
              <small>/ {CONNECTIONS.filter(x => x.cat === c).length} connected</small>
            </span>
          </div>
        ))}
      </div>

      {cats.map(cat => (
        <section key={cat} className="conn-cat">
          <h3 className="conn-cat-title">
            <span className="conn-cat-dot"/>
            {cat}
          </h3>
          <div className="conn-grid">
            {CONNECTIONS.filter(c => c.cat === cat).map(c => (
              <article key={c.id} className={`conn-card ${c.status === 'on' ? 'connected' : ''}`}>
                <header className="conn-card-head">
                  <div className="conn-logo" style={{ background: `color-mix(in oklab, ${c.color} 14%, var(--os-surface))`, color: c.color }}>
                    {c.id === 'linkedin' && <strong>in</strong>}
                    {c.id === 'instagram' && <OS_ICON name="content" size={16}/>}
                    {c.id === 'meta-ads' && <OS_ICON name="sales" size={16}/>}
                    {c.id === 'google-ads' && <strong>G</strong>}
                    {c.id === 'youtube' && <OS_ICON name="play" size={16}/>}
                    {c.id === 'pinterest' && <strong>P</strong>}
                    {c.id === 'fonts' && <strong>Aa</strong>}
                    {c.id === 'figma' && <strong>F</strong>}
                    {c.id === 'canva' && <strong>C</strong>}
                    {c.id === 'cloudinary' && <OS_ICON name="docs" size={16}/>}
                    {c.id === 'ga' && <OS_ICON name="activity" size={16}/>}
                    {c.id === 'webhooks' && <OS_ICON name="link" size={16}/>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4>{c.name}</h4>
                    {c.account ? (
                      <div className="conn-account">{c.account}</div>
                    ) : (
                      <div className="conn-account muted">Not connected</div>
                    )}
                  </div>
                  <span className={`conn-status ${c.status}`}>
                    <span className="dot"/>
                    {c.status === 'on' ? 'Connected' : 'Off'}
                  </span>
                </header>

                <div className="conn-perms">
                  {c.permissions.map(p => (
                    <span key={p} className="conn-perm">{p}</span>
                  ))}
                </div>

                <footer className="conn-card-foot">
                  {c.sync && (
                    <span className="conn-sync">
                      <span className="conn-sync-dot"/>
                      Last sync: {c.sync}
                    </span>
                  )}
                  <button className={`conn-btn ${c.status === 'on' ? 'manage' : 'connect'}`} onClick={() => c.status === 'on' && setOpen(c)}>
                    {c.status === 'on' ? 'Manage' : 'Connect'}
                    <OS_ICON name="arrow" size={11}/>
                  </button>
                </footer>
              </article>
            ))}
          </div>
        </section>
      ))}
      {open && <ConnectionDetail conn={open} onClose={() => setOpen(null)}/>}
    </>
  );
};

// ─────────────────────────────────────────────────────────────
// CONNECTION DETAIL — slide-over with style/prompt/image summary
// ─────────────────────────────────────────────────────────────
const ConnectionDetail = ({ conn, onClose }) => {
  const [tab, setTab] = useCnS('overview');
  useCnE(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Per-connection content
  const ASSETS = {
    linkedin:  [
      { kind: 'post', preview: 'Most agencies don\'t have a content problem. They have a system problem.', metric: '14.8K impressions · 6.4% eng' },
      { kind: 'post', preview: 'Why founders bottleneck their own teams (and the 3-step system to fix it)', metric: '8.1K impressions · 5.2% eng' },
      { kind: 'post', preview: 'Pricing is positioning. Three brands that learned this the hard way.', metric: '6.4K impressions · 4.8% eng' },
    ],
    instagram: [
      { kind: 'reel',     preview: 'BTS Sunnyside rebrand · 32s', metric: '8.1K reach · 5.8% eng' },
      { kind: 'carrusel', preview: '5-slide framework · pricing as positioning', metric: '6.4K reach · 4.1% eng' },
      { kind: 'single',   preview: 'Studio detail shot · warm tones', metric: '4.2K reach · 3.6% eng' },
    ],
    pinterest: [
      { kind: 'board', preview: 'Editorial layouts · 84 pins · auto-sync', metric: 'Synced to Livv brand moodboard' },
      { kind: 'board', preview: 'Warm-toned photography · 142 pins',       metric: 'Synced to Mulberry brand moodboard' },
      { kind: 'board', preview: 'Type specimens · 56 pins · manual sync',  metric: 'Synced to Livv typography refs' },
    ],
    fonts: [
      { kind: 'font', preview: 'Inter · variable',           metric: 'Used in 3 brand kits' },
      { kind: 'font', preview: 'PP Editorial · serif',       metric: 'Used in Mulberry, Sunnyside' },
      { kind: 'font', preview: 'JetBrains Mono · code',      metric: 'Used in Livv mono labels' },
    ],
    figma: [
      { kind: 'frame', preview: 'Livv · Brand kit master',    metric: 'Last edit: 2h ago' },
      { kind: 'frame', preview: 'Mulberry · Brand system',     metric: 'Last edit: yesterday' },
      { kind: 'tokens', preview: 'Design tokens · 4 brand kits', metric: 'Auto-import on save' },
    ],
    ga: [
      { kind: 'metric', preview: 'Sessions · 8.4K / 30d',          metric: '+12% vs prev' },
      { kind: 'metric', preview: 'Top page: /agency-os',           metric: '2.1K sessions' },
      { kind: 'metric', preview: 'Conversion rate · 3.4%',         metric: '+0.8 pts' },
    ],
  };

  const PROMPTS = {
    linkedin:  [
      { name: 'Hot-take post',     prompt: 'Write a contrarian 1-paragraph LinkedIn post about {{topic}}, in {{brand.voice}}. End with one question.' },
      { name: 'Case study teaser', prompt: 'Tease a case study for {{client}} in 3 short lines. Hook in the first 50 chars.' },
    ],
    instagram: [
      { name: '5-slide carrusel',  prompt: 'Build a 5-slide carrusel about {{topic}} — slide 1 hook, slides 2-4 framework, slide 5 CTA.' },
      { name: 'BTS reel script',    prompt: 'Write a 30s reel script showing the {{moment}} behind {{project}}. Cinematic, warm tone.' },
    ],
    pinterest: [
      { name: 'Style extraction',   prompt: 'Extract palette + texture + composition signature from these {{N}} pins. Output as brand prompt fragment.' },
      { name: 'Aesthetic anchor',   prompt: 'Compose a generation prompt anchored on this Pinterest board\'s visual language for {{brand}}.' },
    ],
    fonts: [
      { name: 'Type pairing',       prompt: 'Suggest a body font that pairs with {{heading}} for a {{industry}} brand with a {{tone}} voice.' },
    ],
    figma: [
      { name: 'Token sync',         prompt: 'Pull colors and type tokens from {{frame}} and apply to {{brand}} kit.' },
    ],
    ga: [
      { name: 'Weekly anomaly scan', prompt: 'Flag any traffic anomalies in the last 7 days vs trailing 30-day average. Suggest causes.' },
    ],
  };

  const assets = ASSETS[conn.id] || [];
  const prompts = PROMPTS[conn.id] || [];

  return (
    <>
      <div className="so-overlay" onClick={onClose}/>
      <aside className="so so-wide" style={{ '--icp-color': conn.color }} data-screen-label="Connection Detail">
        <header className="so-head">
          <div className="conn-logo" style={{ background: `color-mix(in oklab, ${conn.color} 14%, var(--os-surface))`, color: conn.color, width: 44, height: 44, borderRadius: 12, flexShrink: 0 }}>
            {conn.id === 'linkedin' ? <strong>in</strong> : conn.id === 'pinterest' ? <strong>P</strong> : conn.id === 'figma' ? <strong>F</strong> : conn.id === 'fonts' ? <strong>Aa</strong> : <OS_ICON name="link" size={18}/>}
          </div>
          <div className="so-titleline">
            <div className="so-title">
              {conn.name}
              <span className="conn-status on" style={{ padding: '2px 8px' }}><span className="dot"/>Connected</span>
            </div>
            <div className="so-sub">
              <span>{conn.account || '—'}</span>
              <span className="sep">·</span>
              <span>Last sync: {conn.sync}</span>
            </div>
          </div>
          <div className="so-actions">
            <button className="so-iconbtn" title="Sync now"><OS_ICON name="bolt" size={14}/></button>
            <button className="so-iconbtn" onClick={onClose}><OS_ICON name="close" size={14} stroke={2}/></button>
          </div>
        </header>

        <nav className="brand-nav">
          {[
            { id: 'overview', label: 'Overview',  icon: 'docs' },
            { id: 'assets',   label: assets[0]?.kind === 'metric' ? 'Metrics' : assets[0]?.kind === 'board' ? 'Boards' : assets[0]?.kind === 'font' ? 'Fonts' : assets[0]?.kind === 'frame' ? 'Frames' : 'Recent', icon: 'eye' },
            { id: 'prompts',  label: 'Prompts',   icon: 'sparkle' },
            { id: 'settings', label: 'Settings',  icon: 'cog' },
          ].map(s => (
            <button key={s.id} className={`brand-nav-item ${tab === s.id ? 'active' : ''}`} onClick={() => setTab(s.id)}>
              <OS_ICON name={s.icon} size={12}/>{s.label}
            </button>
          ))}
        </nav>

        <div className="so-body brand-body">
          {tab === 'overview' && (
            <div className="brand-stack">
              <div className="brand-section">
                <SectionTitle>What this connection powers</SectionTitle>
                <div className="ai-vision-caps" style={{ borderLeftColor: conn.color }}>
                  <span className="ai-vision-eyebrow" style={{ color: conn.color }}>Capabilities</span>
                  <ul>
                    {conn.permissions.map(p => <li key={p}>{p}</li>)}
                  </ul>
                </div>
              </div>
              <div className="brand-section">
                <SectionTitle>Linked across</SectionTitle>
                <div className="ptr-utm">
                  <div><span>Used in brand kits</span><strong>3 of 4</strong></div>
                  <div><span>Active automations</span><strong>2</strong></div>
                  <div><span>Studio generations</span><strong>184</strong></div>
                  <div><span>Pull frequency</span><strong>Every 15m</strong></div>
                </div>
              </div>
            </div>
          )}

          {tab === 'assets' && (
            <div className="brand-stack">
              <div className="brand-section">
                <SectionTitle>Recent · pulled from {conn.name}</SectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {assets.length === 0 && <div style={{ fontSize: 12, color: 'var(--os-fg-2)', padding: 16, textAlign: 'center', background: 'var(--os-surface)', borderRadius: 9, border: '1px dashed var(--os-border-2)' }}>No assets indexed yet · trigger a sync</div>}
                  {assets.map((a, i) => (
                    <div key={i} className="ptr-payout-row">
                      <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: conn.color, fontWeight: 600 }}>{a.kind}</div>
                        <div style={{ fontSize: 12.5, color: 'var(--os-fg-0)', marginTop: 3, fontWeight: 500 }}>{a.preview}</div>
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--os-fg-2)' }}>{a.metric}</span>
                      <button className="ptr-copy-btn" style={{ padding: '4px 9px' }}>Use</button>
                    </div>
                  ))}
                </div>
              </div>
              {(conn.id === 'pinterest' || conn.id === 'instagram') && (
                <div className="brand-section">
                  <SectionTitle>Visual signature · extracted palette</SectionTitle>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[conn.color, '#FDFBF7', '#1F1611', '#C4A35A', '#769268'].map((c, i) => (
                      <div key={i} style={{ flex: 1, height: 56, borderRadius: 8, background: c, border: '0.5px solid var(--os-border-2)' }}/>
                    ))}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--os-fg-2)' }}>
                    Auto-extracted from {assets.length} most-engaged posts · last refresh {conn.sync}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'prompts' && (
            <div className="brand-stack">
              <div className="brand-section">
                <SectionTitle>Prompts wired to this connection · {prompts.length}</SectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {prompts.map((p, i) => (
                    <div key={i} style={{ padding: '12px 14px', background: 'var(--os-surface)', border: '0.5px solid var(--os-border-2)', borderRadius: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--os-fg-0)' }}>{p.name}</span>
                        <button className="ptr-copy-btn" style={{ padding: '3px 9px' }}><OS_ICON name="edit" size={10}/>Edit</button>
                      </div>
                      <pre style={{ margin: 0, padding: '8px 10px', background: 'var(--os-ink)', color: 'var(--livv-cream-50)', borderRadius: 7, fontFamily: 'var(--font-mono)', fontSize: 10.5, lineHeight: 1.55, whiteSpace: 'pre-wrap', maxHeight: 100, overflow: 'auto' }}>{p.prompt}</pre>
                    </div>
                  ))}
                  <button className="log-btn"><OS_ICON name="plus" size={12}/>New prompt</button>
                </div>
              </div>
            </div>
          )}

          {tab === 'settings' && (
            <div className="brand-stack">
              <div className="brand-section">
                <SectionTitle>Permissions</SectionTitle>
                <div className="brand-tags">
                  {conn.permissions.map(p => <span key={p} className="brand-tag sel">{p}</span>)}
                </div>
              </div>
              <div className="brand-section">
                <SectionTitle>Sync</SectionTitle>
                <div className="ptr-utm">
                  <div><span>Frequency</span><strong>Every 15m</strong></div>
                  <div><span>Last sync</span><strong>{conn.sync}</strong></div>
                </div>
                <button className="so-action primary" style={{ flex: 0, marginTop: 12 }}><OS_ICON name="bolt" size={12}/>Sync now</button>
              </div>
              <div className="brand-section">
                <button className="so-action" style={{ flex: 0, color: 'var(--err)', borderColor: 'rgba(239,68,68,0.18)' }}>
                  <OS_ICON name="close" size={12} stroke={2}/>Disconnect
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

Object.assign(window, { BRANDS, CONNECTIONS, ContentBrands, BrandDetail, ContentStudio, ToolkitConnections });
