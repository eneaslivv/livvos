// LIVV OS — Strategy → Products (productized apps + systems + templates)
const { useState: usePr, useEffect: usePrE } = React;

const PRODUCTS = [
  {
    id: 'pulse',
    name: 'Livv Pulse',
    tagline: 'A pre-built executive dashboard for service businesses.',
    type: 'App',
    cat: 'Dashboard',
    palette: ['#C4A35A', '#2C0405', '#FDFBF7'],
    pricing: [
      { tier: 'Solo',   price: 49,  period: '/ mo', cap: '1 workspace · 1 user',    popular: false },
      { tier: 'Team',   price: 149, period: '/ mo', cap: '1 workspace · 5 users',   popular: true },
      { tier: 'Studio', price: 349, period: '/ mo', cap: '5 workspaces · 25 users', popular: false },
    ],
    status: 'live',
    units: 184,
    revenue: 27416,
    license: 'SaaS · subscription',
    delivery: 'Hosted on livvvv.com/p/pulse',
    checkout: 'livvvv.com/checkout/pulse',
    rating: 4.8,
    reviews: 42,
  },
  {
    id: 'agency-os',
    name: 'Agency OS',
    tagline: 'The full operating system for boutique agencies — pre-deployed.',
    type: 'System',
    cat: 'Operating system',
    palette: ['#1F1611', '#C4A35A', '#F5EFE8'],
    pricing: [
      { tier: 'Self-deploy',  price: 1200,  period: 'one-time', cap: 'You install it · docs included',         popular: false },
      { tier: 'Deploy + Coach', price: 3800, period: 'one-time', cap: '2-week guided deployment + 30d support', popular: true },
      { tier: 'White-glove',   price: 8400, period: 'one-time', cap: 'We deploy + train your team · 6 weeks',  popular: false },
    ],
    status: 'live',
    units: 38,
    revenue: 124200,
    license: 'Perpetual · per workspace',
    delivery: 'Notion + Linear + custom dashboard',
    checkout: 'livvvv.com/checkout/agency-os',
    rating: 4.9,
    reviews: 18,
  },
  {
    id: 'content-pack',
    name: 'Content Engine Pack',
    tagline: '90 days of templated posts + a publishing system, ready to import.',
    type: 'Template',
    cat: 'Notion + Linear',
    palette: ['#F1ADD8', '#23150E', '#FBF2EC'],
    pricing: [
      { tier: 'Pack',  price: 89,  period: 'one-time', cap: '90 templates + 1 user',        popular: true },
      { tier: 'Team',  price: 249, period: 'one-time', cap: '+ team license · 10 seats',    popular: false },
    ],
    status: 'live',
    units: 412,
    revenue: 41280,
    license: 'Single-team perpetual',
    delivery: 'Notion duplicatable workspace',
    checkout: 'livvvv.com/checkout/content-pack',
    rating: 4.7,
    reviews: 88,
  },
  {
    id: 'pricing-frame',
    name: 'Pricing Architecture',
    tagline: 'Restructure your offers to attract better-fit clients.',
    type: 'Template',
    cat: 'Framework + worksheets',
    palette: ['#769268', '#E8EFE5', '#1F2D1A'],
    pricing: [
      { tier: 'Framework', price: 149, period: 'one-time', cap: 'Worksheets + 30min Loom',   popular: true },
    ],
    status: 'live',
    units: 96,
    revenue: 14304,
    license: 'Single-user perpetual',
    delivery: 'PDF + Notion + Loom intro',
    checkout: 'livvvv.com/checkout/pricing-frame',
    rating: 4.6,
    reviews: 28,
  },
  {
    id: 'ai-prompts',
    name: 'AI Prompt Library',
    tagline: '47 production-grade prompts for service businesses.',
    type: 'Template',
    cat: 'Prompts · Claude / GPT',
    palette: ['#0F1B2D', '#6DBEDC', '#E8EFF6'],
    pricing: [
      { tier: 'Library',  price: 39,  period: 'one-time', cap: '47 prompts · lifetime updates',  popular: true },
      { tier: 'Pro',      price: 99,  period: 'one-time', cap: '+ custom prompt builder',         popular: false },
    ],
    status: 'live',
    units: 524,
    revenue: 23436,
    license: 'Single-user · lifetime',
    delivery: 'Web vault + JSON export',
    checkout: 'livvvv.com/checkout/ai-prompts',
    rating: 4.8,
    reviews: 142,
  },
  {
    id: 'sales-os',
    name: 'Sales OS',
    tagline: 'Pipeline + outreach + proposals as a pre-wired system.',
    type: 'System',
    cat: 'CRM-style',
    palette: ['#3D1214', '#E8BC59', '#F5EFE2'],
    pricing: [
      { tier: 'Self-deploy', price: 800,  period: 'one-time', cap: 'Install + docs',          popular: false },
      { tier: 'Deploy + Coach', price: 2200, period: 'one-time', cap: '2-week guided setup', popular: true },
    ],
    status: 'beta',
    units: 12,
    revenue: 18400,
    license: 'Perpetual · per workspace',
    delivery: 'Notion + Linear + AI prompts',
    checkout: 'livvvv.com/checkout/sales-os',
    rating: 4.5,
    reviews: 8,
  },
];

const StrategyProducts = ({ onOpenProduct }) => {
  const [filter, setFilter] = usePr('all');
  const filtered = filter === 'all' ? PRODUCTS : PRODUCTS.filter(p => p.type === filter);
  const totalRevenue = PRODUCTS.reduce((s, p) => s + p.revenue, 0);
  const totalUnits = PRODUCTS.reduce((s, p) => s + p.units, 0);
  const best = [...PRODUCTS].sort((a, b) => b.revenue - a.revenue)[0];
  return (
    <>
      {/* Hero · marketplace */}
      <section className="prod-hero">
        <div className="prod-hero-l">
          <div className="pos-hero-eyebrow"><span className="pos-hero-dot"/>© Productized · marketplace</div>
          <h2 className="pkg-hero-title">
            <span>${(totalRevenue/1000).toFixed(1)}K earned</span><br/>
            <span style={{ color: 'var(--os-fg-2)' }}>across {PRODUCTS.length} products · {totalUnits} units</span>
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--os-fg-1)', lineHeight: 1.55, maxWidth: 420 }}>
            Stop trading time for money. Productize what you've delivered before — apps, systems, templates — and let them sell while you sleep.
          </p>
          <div className="pkg-hero-stats">
            <div className="pkg-hero-stat">
              <div className="pkg-hero-stat-v">{PRODUCTS.filter(p => p.status === 'live').length}</div>
              <div className="pkg-hero-stat-l">Live</div>
            </div>
            <div className="pkg-hero-stat">
              <div className="pkg-hero-stat-v">{PRODUCTS.filter(p => p.status === 'beta').length}</div>
              <div className="pkg-hero-stat-l">Beta</div>
            </div>
            <div className="pkg-hero-stat">
              <div className="pkg-hero-stat-v">${(best.revenue/1000).toFixed(1)}K</div>
              <div className="pkg-hero-stat-l">Best · {best.name}</div>
            </div>
          </div>
        </div>

        {/* Revenue chart by product */}
        <div className="prod-hero-chart">
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--os-fg-2)', display: 'block', marginBottom: 12 }}>Revenue by product</span>
          {[...PRODUCTS].sort((a,b) => b.revenue - a.revenue).map(p => (
            <div key={p.id} className="tpl-hero-row" onClick={() => onOpenProduct(p)} style={{ cursor: 'pointer' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, minWidth: 130 }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: p.palette[0] }}/>{p.name}
              </span>
              <div className="phase-bar" style={{ flex: 1 }}><div className="phase-fill" style={{ width: `${(p.revenue / best.revenue) * 100}%`, background: `linear-gradient(90deg, ${p.palette[0]}, ${p.palette[1]})` }}/></div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--os-fg-0)', fontWeight: 500, minWidth: 56, textAlign: 'right' }}>${(p.revenue/1000).toFixed(1)}K</span>
            </div>
          ))}
        </div>
      </section>

      {/* Filters + add */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div className="filter-row">
          {[
            { id: 'all', l: 'All' },
            { id: 'App', l: 'Apps' },
            { id: 'System', l: 'Systems' },
            { id: 'Template', l: 'Templates' },
          ].map(f => {
            const n = f.id === 'all' ? PRODUCTS.length : PRODUCTS.filter(p => p.type === f.id).length;
            return (
              <button key={f.id} className={`fc ${filter === f.id ? 'active' : ''}`} onClick={() => setFilter(f.id)}>
                {f.l}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, padding: '1px 6px', borderRadius: 5, background: filter === f.id ? 'rgba(255,255,255,0.18)' : 'var(--os-surface-2)', color: filter === f.id ? 'var(--livv-cream-50)' : 'var(--os-fg-2)' }}>{n}</span>
              </button>
            );
          })}
        </div>
        <button className="so-action primary" style={{ marginLeft: 'auto', flex: 0 }}>
          <OS_ICON name="plus" size={13}/>New product
        </button>
      </div>

      {/* Product cards */}
      <div className="prod-grid">
        {filtered.map(p => (
          <article key={p.id} className="prod-card" onClick={() => onOpenProduct(p)}>
            <div className="prod-cover" style={{ background: `linear-gradient(135deg, ${p.palette[0]} 0%, ${p.palette[1]} 70%, ${p.palette[2] || p.palette[0]} 100%)` }}>
              <span className={`prod-type-pill prod-type-${p.type.toLowerCase()}`}>{p.type}</span>
              <span className={`brand-status ${p.status === 'live' ? 'active' : 'draft'}`}>{p.status}</span>
              <div className="prod-cover-content" style={{ color: p.palette[2] || '#fff' }}>
                <div className="prod-cover-name">{p.name}</div>
                <div className="prod-cover-cat">{p.cat}</div>
              </div>
            </div>
            <div className="prod-body">
              <p className="prod-tag">{p.tagline}</p>
              <div className="prod-stats">
                <div className="prod-stat">
                  <span className="prod-stat-l">Price from</span>
                  <span className="prod-stat-v">${Math.min(...p.pricing.map(t => t.price))}</span>
                </div>
                <div className="prod-stat">
                  <span className="prod-stat-l">Units sold</span>
                  <span className="prod-stat-v">{p.units}</span>
                </div>
                <div className="prod-stat">
                  <span className="prod-stat-l">Revenue</span>
                  <span className="prod-stat-v" style={{ color: 'var(--accent)' }}>${(p.revenue/1000).toFixed(1)}K</span>
                </div>
              </div>
              <footer className="prod-foot">
                <span className="prod-rating">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--accent)' }}><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.8 21l1.2-6.9-5-4.9 6.9-1L12 2z"/></svg>
                  <strong>{p.rating}</strong>
                  <span style={{ color: 'var(--os-fg-3)' }}>· {p.reviews} reviews</span>
                </span>
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--accent)' }}>Open →</span>
              </footer>
            </div>
          </article>
        ))}
        <button className="pos-add-card" style={{ minHeight: 360 }}>
          <div className="pos-add-ic"><OS_ICON name="plus" size={18}/></div>
          <span style={{ fontSize: 13, fontWeight: 500 }}>Launch a product</span>
          <span style={{ fontSize: 11.5, color: 'var(--os-fg-2)', textAlign: 'center', maxWidth: 220 }}>App, system or template. Stripe checkout, license, delivery — all wired by LIVV.</span>
        </button>
      </div>
    </>
  );
};

const ProductDetail = ({ product, onClose }) => {
  const [tab, setTab] = usePr('overview');
  usePrE(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="so-overlay" onClick={onClose}/>
      <aside className="so so-wide" style={{ '--icp-color': product.palette[0] }} data-screen-label="Product Detail">
        <header className="so-head">
          <div className="prod-thumb" style={{ background: `linear-gradient(135deg, ${product.palette[0]}, ${product.palette[1]})` }}>
            <span style={{ color: product.palette[2] || '#fff', fontWeight: 600, fontSize: 14, letterSpacing: '-0.02em' }}>{product.name.split(' ').map(w => w[0]).join('').slice(0,2)}</span>
          </div>
          <div className="so-titleline">
            <div className="so-title">
              {product.name}
              <span className={`brand-status ${product.status === 'live' ? 'active' : 'draft'}`}>{product.status}</span>
            </div>
            <div className="so-sub">
              <span>{product.type} · {product.cat}</span>
              <span className="sep">·</span>
              <span className="lk">{product.checkout}</span>
            </div>
          </div>
          <div className="so-actions">
            <button className="so-iconbtn" title="Preview"><OS_ICON name="eye" size={14}/></button>
            <button className="so-iconbtn" title="Edit"><OS_ICON name="edit" size={14}/></button>
            <button className="so-iconbtn" onClick={onClose}><OS_ICON name="close" size={14} stroke={2}/></button>
          </div>
        </header>

        <div className="so-value">
          <div className="so-vbox">
            <div className="so-vlbl">Units sold</div>
            <div className="so-vval">{product.units}</div>
          </div>
          <div className="so-vbox">
            <div className="so-vlbl">Revenue</div>
            <div className="so-vval">${(product.revenue/1000).toFixed(1)}K</div>
          </div>
          <div className="so-vbox">
            <div className="so-vlbl">Rating</div>
            <div className="so-vval">{product.rating} <small>· {product.reviews}</small></div>
          </div>
        </div>

        <nav className="brand-nav">
          {[
            { id: 'overview', label: 'Overview',  icon: 'docs' },
            { id: 'pricing',  label: 'Pricing',   icon: 'money' },
            { id: 'sales',    label: 'Sales',     icon: 'activity' },
            { id: 'embed',    label: 'Embed',     icon: 'link' },
          ].map(s => (
            <button key={s.id} className={`brand-nav-item ${tab === s.id ? 'active' : ''}`} onClick={() => setTab(s.id)}>
              <OS_ICON name={s.icon} size={12}/>{s.label}
            </button>
          ))}
        </nav>

        <div className="so-body brand-body">
          {tab === 'overview' && <ProductOverview product={product}/>}
          {tab === 'pricing'  && <ProductPricing product={product}/>}
          {tab === 'sales'    && <ProductSales product={product}/>}
          {tab === 'embed'    && <ProductEmbed product={product}/>}
        </div>
      </aside>
    </>
  );
};

const ProductOverview = ({ product }) => (
  <div className="brand-stack">
    <div className="brand-section">
      <SectionTitle>Tagline</SectionTitle>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--os-fg-0)', fontStyle: 'italic' }}>"{product.tagline}"</p>
    </div>
    <div className="brand-section">
      <SectionTitle>License &amp; delivery</SectionTitle>
      <div className="ptr-utm">
        <div><span>License</span><strong>{product.license}</strong></div>
        <div><span>Delivery</span><strong>{product.delivery}</strong></div>
        <div><span>Checkout</span><strong>{product.checkout}</strong></div>
        <div><span>Category</span><strong>{product.cat}</strong></div>
      </div>
    </div>
    <div className="brand-section">
      <SectionTitle>Quick actions</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        <button className="so-action primary"><OS_ICON name="link" size={13}/>Open checkout</button>
        <button className="so-action"><OS_ICON name="docs" size={13}/>Copy embed code</button>
        <button className="so-action"><OS_ICON name="mail" size={13}/>Email to partner</button>
        <button className="so-action"><OS_ICON name="bolt" size={13}/>Auto-discount rule</button>
      </div>
    </div>
  </div>
);

const ProductPricing = ({ product }) => (
  <div className="brand-stack">
    <div className="brand-section">
      <SectionTitle>Pricing tiers · {product.pricing.length}</SectionTitle>
      <div className="prod-tier-grid">
        {product.pricing.map(t => (
          <div key={t.tier} className={`prod-tier ${t.popular ? 'popular' : ''}`}>
            {t.popular && <span className="prod-tier-flag">Popular</span>}
            <div className="prod-tier-name">{t.tier}</div>
            <div className="prod-tier-price">
              <span className="prod-tier-amount">${t.price.toLocaleString()}</span>
              <span className="prod-tier-period">{t.period}</span>
            </div>
            <div className="prod-tier-cap">{t.cap}</div>
            <button className="prod-tier-cta">Use this checkout</button>
          </div>
        ))}
      </div>
    </div>
    <div className="brand-section">
      <SectionTitle>Stripe configuration</SectionTitle>
      <div className="ptr-utm">
        <div><span>Connect status</span><strong style={{ color: 'var(--ok)' }}>● Connected</strong></div>
        <div><span>Account</span><strong>Stripe · livvvv</strong></div>
        <div><span>Currency</span><strong>USD</strong></div>
        <div><span>Tax handling</span><strong>Stripe Tax</strong></div>
      </div>
    </div>
  </div>
);

const ProductSales = ({ product }) => {
  const months = ['Jan','Feb','Mar','Apr','May'];
  const sales = [12, 18, 24, 32, product.units > 100 ? 41 : 24];
  return (
    <div className="brand-stack">
      <div className="brand-section">
        <SectionTitle>Units sold · last 5 months</SectionTitle>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 140, padding: '12px 0' }}>
          {months.map((m, i) => (
            <div key={m} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ width: '100%', height: 110, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                <div style={{ width: '60%', height: `${(sales[i] / Math.max(...sales)) * 100}%`, background: `linear-gradient(180deg, ${product.palette[0]} 0%, ${product.palette[1]} 100%)`, borderRadius: '4px 4px 0 0' }}/>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--os-fg-2)' }}>{m}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--os-fg-0)', fontWeight: 500 }}>{sales[i]}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="brand-section">
        <SectionTitle>Recent transactions</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[
            { who: 'Boreal Beauty',    tier: product.pricing[product.pricing.length-1].tier, amount: product.pricing[product.pricing.length-1].price, when: 'Today' },
            { who: 'Halcyon AI',        tier: product.pricing[0].tier, amount: product.pricing[0].price, when: 'Yesterday' },
            { who: 'Verdant Hill',      tier: product.pricing[Math.min(1, product.pricing.length-1)].tier, amount: product.pricing[Math.min(1, product.pricing.length-1)].price, when: '2d ago' },
            { who: 'Cassia & Co.',      tier: product.pricing[0].tier, amount: product.pricing[0].price, when: '3d ago' },
          ].map((tx, i) => (
            <div key={i} className="ptr-payout-row">
              <div>
                <div style={{ fontSize: 12.5, color: 'var(--os-fg-0)', fontWeight: 500 }}>{tx.who}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--os-fg-2)', marginTop: 2 }}>{tx.tier} · {tx.when}</div>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent)', fontWeight: 500 }}>${tx.amount.toLocaleString()}</span>
              <span className="conn-status on"><span className="dot"/>Paid</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const ProductEmbed = ({ product }) => (
  <div className="brand-stack">
    <div className="brand-section">
      <SectionTitle>Embeddable widgets</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          { name: 'Buy button',      desc: '"Get $X for $Y" CTA — paste anywhere' },
          { name: 'Pricing card',    desc: 'Tier comparison · with checkout buttons' },
          { name: 'Hosted page',     desc: `livvvv.com/p/${product.id} · fully branded` },
          { name: 'Affiliate link',  desc: 'Co-branded link for partners' },
        ].map(w => (
          <div key={w.name} className="ptr-widget">
            <div className="ptr-widget-ic"><OS_ICON name="link" size={14}/></div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--os-fg-0)' }}>{w.name}</div>
              <div style={{ fontSize: 10.5, color: 'var(--os-fg-2)' }}>{w.desc}</div>
            </div>
            <button className="ptr-copy-btn" style={{ marginLeft: 'auto', padding: '4px 9px' }}>Copy</button>
          </div>
        ))}
      </div>
    </div>
    <div className="brand-section">
      <SectionTitle>Embed snippet</SectionTitle>
      <pre className="studio2-prompt-code" style={{ fontSize: 11 }}>{`<script src="https://livvvv.com/embed.js" data-product="${product.id}" data-tier="${product.pricing.find(t => t.popular)?.tier.toLowerCase() || 'default'}"></script>
<div class="livv-buy" data-product="${product.id}"></div>`}</pre>
    </div>
  </div>
);

Object.assign(window, { PRODUCTS, StrategyProducts, ProductDetail });
