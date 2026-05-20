/**
 * Products — productized apps + systems + templates marketplace.
 *
 * Source: livv-update / livv-os-products.jsx (StrategyProducts + ProductDetail).
 *
 * Hero with revenue/units totals + revenue-by-product chart, then a filter
 * row (All / Apps / Systems / Templates) and a grid of product cards with
 * gradient cover, type pill, status, stats and a 5-star rating. Clicking a
 * card opens a side-panel (ProductDetailPanel) with 4 tabs:
 *   Overview · Pricing · Sales · Embed.
 *
 * Phase 1 data source is the bundle's PRODUCTS constant — once a `products`
 * table exists we swap to a Supabase query. The page wires that as a
 * useEffect with a graceful fallback so it ships before the table lands.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../components/ui/Icons';
import { supabase } from '../lib/supabase';
import { useTenant } from '../context/TenantContext';
import { SPRING_ENTER } from '../lib/ui/motion';
import { errorLogger } from '../lib/errorLogger';
import '../components/livv/bundle-strategy.css';

interface PricingTier {
  tier: string;
  price: number;
  period: string;
  cap: string;
  popular?: boolean;
}

interface Product {
  id: string;
  name: string;
  tagline: string;
  type: 'App' | 'System' | 'Template';
  cat: string;
  palette: string[];
  pricing: PricingTier[];
  status: 'live' | 'beta' | 'draft';
  units: number;
  revenue: number;
  license: string;
  delivery: string;
  checkout: string;
  rating: number;
  reviews: number;
}

// Bundle defaults — shown when no live products exist yet so the page
// always feels populated. Replace by Supabase rows once `products` is wired.
const BUNDLE_PRODUCTS: Product[] = [
  {
    id: 'pulse',
    name: 'Livv Pulse',
    tagline: 'A pre-built executive dashboard for service businesses.',
    type: 'App', cat: 'Dashboard',
    palette: ['#C4A35A', '#2C0405', '#FDFBF7'],
    pricing: [
      { tier: 'Solo',   price: 49,  period: '/ mo', cap: '1 workspace · 1 user' },
      { tier: 'Team',   price: 149, period: '/ mo', cap: '1 workspace · 5 users',   popular: true },
      { tier: 'Studio', price: 349, period: '/ mo', cap: '5 workspaces · 25 users' },
    ],
    status: 'live', units: 184, revenue: 27416,
    license: 'SaaS · subscription', delivery: 'Hosted on livvvv.com/p/pulse',
    checkout: 'livvvv.com/checkout/pulse', rating: 4.8, reviews: 42,
  },
  {
    id: 'agency-os',
    name: 'Agency OS',
    tagline: 'The full operating system for boutique agencies — pre-deployed.',
    type: 'System', cat: 'Operating system',
    palette: ['#1F1611', '#C4A35A', '#F5EFE8'],
    pricing: [
      { tier: 'Self-deploy',     price: 1200, period: 'one-time', cap: 'You install it · docs included' },
      { tier: 'Deploy + Coach',  price: 3800, period: 'one-time', cap: '2-week guided deployment + 30d support', popular: true },
      { tier: 'White-glove',     price: 8400, period: 'one-time', cap: 'We deploy + train your team · 6 weeks' },
    ],
    status: 'live', units: 38, revenue: 124200,
    license: 'Perpetual · per workspace', delivery: 'Notion + Linear + custom dashboard',
    checkout: 'livvvv.com/checkout/agency-os', rating: 4.9, reviews: 18,
  },
  {
    id: 'content-pack',
    name: 'Content Engine Pack',
    tagline: '90 days of templated posts + a publishing system, ready to import.',
    type: 'Template', cat: 'Notion + Linear',
    palette: ['#F1ADD8', '#23150E', '#FBF2EC'],
    pricing: [
      { tier: 'Pack', price: 89,  period: 'one-time', cap: '90 templates + 1 user', popular: true },
      { tier: 'Team', price: 249, period: 'one-time', cap: '+ team license · 10 seats' },
    ],
    status: 'live', units: 412, revenue: 41280,
    license: 'Single-team perpetual', delivery: 'Notion duplicatable workspace',
    checkout: 'livvvv.com/checkout/content-pack', rating: 4.7, reviews: 88,
  },
  {
    id: 'pricing-frame',
    name: 'Pricing Architecture',
    tagline: 'Restructure your offers to attract better-fit clients.',
    type: 'Template', cat: 'Framework + worksheets',
    palette: ['#769268', '#E8EFE5', '#1F2D1A'],
    pricing: [{ tier: 'Framework', price: 149, period: 'one-time', cap: 'Worksheets + 30min Loom', popular: true }],
    status: 'live', units: 96, revenue: 14304,
    license: 'Single-user perpetual', delivery: 'PDF + Notion + Loom intro',
    checkout: 'livvvv.com/checkout/pricing-frame', rating: 4.6, reviews: 28,
  },
  {
    id: 'ai-prompts',
    name: 'AI Prompt Library',
    tagline: '47 production-grade prompts for service businesses.',
    type: 'Template', cat: 'Prompts · Claude / GPT',
    palette: ['#0F1B2D', '#6DBEDC', '#E8EFF6'],
    pricing: [
      { tier: 'Library', price: 39, period: 'one-time', cap: '47 prompts · lifetime updates', popular: true },
      { tier: 'Pro',     price: 99, period: 'one-time', cap: '+ custom prompt builder' },
    ],
    status: 'live', units: 524, revenue: 23436,
    license: 'Single-user · lifetime', delivery: 'Web vault + JSON export',
    checkout: 'livvvv.com/checkout/ai-prompts', rating: 4.8, reviews: 142,
  },
  {
    id: 'sales-os',
    name: 'Sales OS',
    tagline: 'Pipeline + outreach + proposals as a pre-wired system.',
    type: 'System', cat: 'CRM-style',
    palette: ['#3D1214', '#E8BC59', '#F5EFE2'],
    pricing: [
      { tier: 'Self-deploy',    price: 800,  period: 'one-time', cap: 'Install + docs' },
      { tier: 'Deploy + Coach', price: 2200, period: 'one-time', cap: '2-week guided setup', popular: true },
    ],
    status: 'beta', units: 12, revenue: 18400,
    license: 'Perpetual · per workspace', delivery: 'Notion + Linear + AI prompts',
    checkout: 'livvvv.com/checkout/sales-os', rating: 4.5, reviews: 8,
  },
];

type Filter = 'all' | 'App' | 'System' | 'Template';

export const Products: React.FC = () => {
  const { currentTenant } = useTenant();
  const [products, setProducts] = useState<Product[]>(BUNDLE_PRODUCTS);
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<Product | null>(null);

  // Best-effort load from a `products` table — if it doesn't exist yet,
  // we silently keep the bundle defaults so the page is never empty.
  useEffect(() => {
    if (!currentTenant?.id) return;
    (async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('tenant_id', currentTenant.id)
        .order('revenue', { ascending: false });
      if (!error && data && data.length > 0) {
        setProducts(data as Product[]);
      } else if (error && (error as any).code !== '42P01') {
        // 42P01 = relation does not exist — expected before migration.
        errorLogger.warn('products load failed', error);
      }
    })();
  }, [currentTenant?.id]);

  const filtered = filter === 'all' ? products : products.filter(p => p.type === filter);
  const totals = useMemo(() => {
    const revenue = products.reduce((s, p) => s + p.revenue, 0);
    const units   = products.reduce((s, p) => s + p.units, 0);
    const live    = products.filter(p => p.status === 'live').length;
    const beta    = products.filter(p => p.status === 'beta').length;
    const best    = [...products].sort((a, b) => b.revenue - a.revenue)[0];
    return { revenue, units, live, beta, best };
  }, [products]);

  return (
    <div className="max-w-[1320px] mx-auto px-6 py-6">
      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="bdl-page-title">Products</h1>
          <p className="bdl-page-sub">
            Productized apps · systems · templates · revenue · {products.length} active
          </p>
        </div>
      </header>

      {/* Hero — bundle's prod-hero pattern */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6 p-5 rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-gradient-to-br from-amber-50/40 via-white to-rose-50/30 dark:from-amber-950/10 dark:via-zinc-900 dark:to-rose-950/10">
        <div>
          <div className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300 inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Productized · marketplace
          </div>
          <h2 className="text-[28px] font-light text-zinc-900 dark:text-zinc-100 mt-2 leading-tight" style={{ letterSpacing: '-0.03em' }}>
            ${(totals.revenue / 1000).toFixed(1)}K earned<br />
            <span className="text-zinc-400">across {products.length} products · {totals.units} units</span>
          </h2>
          <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-3 max-w-[420px] leading-relaxed">
            Stop trading time for money. Productize what you've delivered before — apps, systems, templates — and let them sell while you sleep.
          </p>
          <div className="grid grid-cols-3 gap-3 mt-4">
            <HeroStat v={totals.live} l="Live" />
            <HeroStat v={totals.beta} l="Beta" />
            {totals.best && (
              <HeroStat v={`$${(totals.best.revenue / 1000).toFixed(1)}K`} l={`Best · ${totals.best.name}`} />
            )}
          </div>
        </div>

        <div className="lg:pl-5 lg:border-l lg:border-zinc-200/60 dark:lg:border-zinc-700/50">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-zinc-500 block mb-2.5">Revenue by product</span>
          {[...products].sort((a, b) => b.revenue - a.revenue).map(p => (
            <button
              key={p.id}
              onClick={() => setOpen(p)}
              className="w-full flex items-center gap-2.5 py-1.5 text-left hover:bg-zinc-100/40 dark:hover:bg-zinc-800/20 -mx-1.5 px-1.5 rounded-md"
            >
              <span className="inline-flex items-center gap-1.5 text-[12px] text-zinc-700 dark:text-zinc-300 min-w-[130px]">
                <span className="w-2 h-2 rounded-full" style={{ background: p.palette[0] }} />
                {p.name}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-zinc-200/70 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(p.revenue / (totals.best?.revenue || 1)) * 100}%`,
                    background: `linear-gradient(90deg, ${p.palette[0]}, ${p.palette[1]})`,
                  }}
                />
              </div>
              <span className="font-mono text-[11px] text-zinc-900 dark:text-zinc-100 min-w-[56px] text-right tabular-nums">
                ${(p.revenue / 1000).toFixed(1)}K
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Filter row + new product CTA */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {([
            { id: 'all'      as Filter, l: 'All'       },
            { id: 'App'      as Filter, l: 'Apps'      },
            { id: 'System'   as Filter, l: 'Systems'   },
            { id: 'Template' as Filter, l: 'Templates' },
          ]).map(f => {
            const n = f.id === 'all' ? products.length : products.filter(p => p.type === f.id).length;
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-medium border transition-colors ${active ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100' : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
              >
                {f.l}
                <span className={`font-mono text-[9.5px] px-1.5 rounded ${active ? 'bg-white/20' : 'bg-zinc-200/60 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'}`}>{n}</span>
              </button>
            );
          })}
        </div>
        <button
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[12px] font-semibold hover:opacity-90 transition-opacity"
          title="Productize a new offer"
        >
          <Icons.Plus size={12} />
          New product
        </button>
      </div>

      {/* Product cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((p, idx) => (
          <ProductCard key={p.id} product={p} delay={idx * 0.04} onOpen={() => setOpen(p)} />
        ))}
        <button
          className="rounded-2xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 bg-white/40 dark:bg-zinc-900/30 hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors p-6 flex flex-col items-center justify-center gap-2 min-h-[360px]"
          title="Launch a new product"
        >
          <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
            <Icons.Plus size={18} className="text-zinc-500" />
          </div>
          <span className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">Launch a product</span>
          <span className="text-[11px] text-zinc-500 text-center max-w-[220px]">
            App, system or template. Stripe checkout, license, delivery — all wired by LIVV.
          </span>
        </button>
      </div>

      <AnimatePresence>
        {open && <ProductDetailPanel product={open} onClose={() => setOpen(null)} />}
      </AnimatePresence>
    </div>
  );
};

const HeroStat: React.FC<{ v: string | number; l: string }> = ({ v, l }) => (
  <div>
    <div className="text-[22px] font-light text-zinc-900 dark:text-zinc-100 font-mono tabular-nums">{v}</div>
    <div className="text-[9.5px] font-mono uppercase tracking-wider text-zinc-500 mt-0.5">{l}</div>
  </div>
);

const ProductCard: React.FC<{ product: Product; delay: number; onOpen: () => void }> = ({ product, delay, onOpen }) => {
  const TYPE_TONE: Record<Product['type'], string> = {
    App:      'bg-amber-100/80 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
    System:   'bg-zinc-900/80 text-zinc-100 dark:bg-zinc-100/15 dark:text-zinc-100',
    Template: 'bg-pink-100/80 text-pink-800 dark:bg-pink-500/20 dark:text-pink-300',
  };
  const STATUS_TONE: Record<Product['status'], string> = {
    live:  'bg-emerald-100/80 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
    beta:  'bg-violet-100/80 text-violet-800 dark:bg-violet-500/20 dark:text-violet-300',
    draft: 'bg-zinc-100/80 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  };
  const minPrice = Math.min(...product.pricing.map(t => t.price));
  return (
    <motion.button
      onClick={onOpen}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING_ENTER, delay }}
      whileHover={{ y: -2 }}
      className="text-left rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
    >
      {/* Cover */}
      <div
        className="relative px-4 pt-3 pb-5 min-h-[140px]"
        style={{
          background: `linear-gradient(135deg, ${product.palette[0]} 0%, ${product.palette[1]} 70%, ${product.palette[2] || product.palette[0]} 100%)`,
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <span className={`text-[9.5px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded backdrop-blur ${TYPE_TONE[product.type]}`}>
            {product.type}
          </span>
          <span className={`text-[9.5px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded backdrop-blur ${STATUS_TONE[product.status]}`}>
            {product.status}
          </span>
        </div>
        <div className="absolute left-4 right-4 bottom-3" style={{ color: product.palette[2] || '#fff' }}>
          <div className="text-[18px] font-medium leading-tight" style={{ letterSpacing: '-0.02em' }}>
            {product.name}
          </div>
          <div className="text-[10.5px] font-mono uppercase tracking-wider opacity-80 mt-0.5">{product.cat}</div>
        </div>
      </div>
      {/* Body */}
      <div className="p-4">
        <p className="text-[12.5px] text-zinc-600 dark:text-zinc-400 italic leading-snug">{product.tagline}</p>
        <div className="grid grid-cols-3 gap-2 my-3 pt-3 border-t border-dashed border-zinc-100 dark:border-zinc-800">
          <div>
            <div className="text-[9.5px] font-mono uppercase tracking-wider text-zinc-400">Price from</div>
            <div className="text-[13px] font-mono tabular-nums text-zinc-900 dark:text-zinc-100 mt-0.5">${minPrice}</div>
          </div>
          <div>
            <div className="text-[9.5px] font-mono uppercase tracking-wider text-zinc-400">Units sold</div>
            <div className="text-[13px] font-mono tabular-nums text-zinc-900 dark:text-zinc-100 mt-0.5">{product.units}</div>
          </div>
          <div>
            <div className="text-[9.5px] font-mono uppercase tracking-wider text-zinc-400">Revenue</div>
            <div className="text-[13px] font-mono tabular-nums mt-0.5" style={{ color: product.palette[0] }}>
              ${(product.revenue / 1000).toFixed(1)}K
            </div>
          </div>
        </div>
        <footer className="flex items-center pt-2 border-t border-dashed border-zinc-100 dark:border-zinc-800">
          <span className="inline-flex items-center gap-1 text-[11px] text-zinc-600 dark:text-zinc-400">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style={{ color: product.palette[0] }}>
              <path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.8 21l1.2-6.9-5-4.9 6.9-1L12 2z" />
            </svg>
            <strong className="text-zinc-900 dark:text-zinc-100 font-mono">{product.rating}</strong>
            <span className="text-zinc-400">· {product.reviews} reviews</span>
          </span>
          <span className="ml-auto font-mono text-[10.5px]" style={{ color: product.palette[0] }}>Open →</span>
        </footer>
      </div>
    </motion.button>
  );
};

// ─────────────────────────────────────────────────────────────
// ProductDetailPanel — slide-over with Overview / Pricing / Sales / Embed
// ─────────────────────────────────────────────────────────────
type DetailTab = 'overview' | 'pricing' | 'sales' | 'embed';

const ProductDetailPanel: React.FC<{ product: Product; onClose: () => void }> = ({ product, onClose }) => {
  const [tab, setTab] = useState<DetailTab>('overview');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <motion.aside
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={SPRING_ENTER}
        className={`fixed top-0 right-0 z-50 h-full bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col shadow-2xl ${expanded ? 'w-full' : 'w-full max-w-[680px]'}`}
      >
        <header className="px-5 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800/60 shrink-0 flex items-start gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 font-semibold text-[13px]"
            style={{
              background: `linear-gradient(135deg, ${product.palette[0]}, ${product.palette[1]})`,
              color: product.palette[2] || '#fff',
            }}
          >
            {product.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[16px] font-medium text-zinc-900 dark:text-zinc-100">{product.name}</h2>
              <span className={`text-[9.5px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${product.status === 'live' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' : product.status === 'beta' ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800'}`}>
                {product.status}
              </span>
            </div>
            <div className="text-[11.5px] text-zinc-500 mt-0.5">
              {product.type} · {product.cat}
              <span className="mx-1.5 text-zinc-300">·</span>
              <a className="text-amber-700 dark:text-amber-400 hover:underline" href={`https://${product.checkout}`} target="_blank" rel="noopener noreferrer">{product.checkout}</a>
            </div>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={() => setExpanded(e => !e)} className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500" title={expanded ? 'Collapse' : 'Expand to full page'}>
              {expanded ? <Icons.X size={13} /> : <Icons.Maximize size={13} />}
            </button>
            <button className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500" title="Edit">
              <Icons.Edit size={13} />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500" title="Close (Esc)">
              <Icons.X size={13} />
            </button>
          </div>
        </header>

        {/* Value strip — Units / Revenue / Rating */}
        <div className="grid grid-cols-3 border-b border-zinc-100 dark:border-zinc-800/60 shrink-0">
          {[
            { l: 'Units sold', v: product.units.toLocaleString() },
            { l: 'Revenue',    v: `$${(product.revenue / 1000).toFixed(1)}K`, c: product.palette[0] },
            { l: 'Rating',     v: `${product.rating}`, sub: `· ${product.reviews}` },
          ].map((s, i) => (
            <div key={i} className={`px-4 py-3 ${i > 0 ? 'border-l border-zinc-100 dark:border-zinc-800/60' : ''}`}>
              <div className="text-[9.5px] font-mono uppercase tracking-wider text-zinc-400">{s.l}</div>
              <div className="text-[18px] font-light tabular-nums mt-0.5" style={{ color: (s as any).c || undefined, letterSpacing: '-0.02em' }}>
                {s.v}
                {(s as any).sub && <small className="text-[12px] text-zinc-400 ml-1">{(s as any).sub}</small>}
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <nav className="px-5 border-b border-zinc-100 dark:border-zinc-800/60 shrink-0 flex items-center gap-4 -mb-px">
          {([
            { id: 'overview' as DetailTab, label: 'Overview' },
            { id: 'pricing'  as DetailTab, label: 'Pricing'  },
            { id: 'sales'    as DetailTab, label: 'Sales'    },
            { id: 'embed'    as DetailTab, label: 'Embed'    },
          ]).map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative py-2.5 px-1 text-[12.5px] font-medium transition-colors ${active ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'}`}
              >
                {t.label}
                {active && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-zinc-900 dark:bg-zinc-100 rounded-full" />}
              </button>
            );
          })}
        </nav>

        {/* Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-5">
          {tab === 'overview' && <ProductOverview product={product} />}
          {tab === 'pricing'  && <ProductPricing  product={product} />}
          {tab === 'sales'    && <ProductSales    product={product} />}
          {tab === 'embed'    && <ProductEmbed    product={product} />}
        </div>
      </motion.aside>
    </>
  );
};

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-zinc-400 mb-2">{children}</div>
);

const KV: React.FC<{ k: string; v: React.ReactNode }> = ({ k, v }) => (
  <div className="flex items-center justify-between gap-3 py-2 border-b border-dashed border-zinc-100 dark:border-zinc-800/60 last:border-b-0">
    <span className="text-[11px] font-mono text-zinc-500">{k}</span>
    <strong className="text-[12.5px] text-zinc-900 dark:text-zinc-100 font-normal">{v}</strong>
  </div>
);

const ProductOverview: React.FC<{ product: Product }> = ({ product }) => (
  <div className="space-y-5">
    <section>
      <SectionLabel>Tagline</SectionLabel>
      <p className="text-[14px] italic text-zinc-700 dark:text-zinc-200 leading-relaxed">"{product.tagline}"</p>
    </section>
    <section>
      <SectionLabel>License & delivery</SectionLabel>
      <div className="rounded-lg border border-zinc-200/70 dark:border-zinc-800 px-3.5 py-1">
        <KV k="License"   v={product.license} />
        <KV k="Delivery"  v={product.delivery} />
        <KV k="Checkout"  v={<a className="text-amber-700 dark:text-amber-400 hover:underline" href={`https://${product.checkout}`} target="_blank" rel="noopener noreferrer">{product.checkout}</a>} />
        <KV k="Category"  v={product.cat} />
      </div>
    </section>
    <section>
      <SectionLabel>Quick actions</SectionLabel>
      <div className="grid grid-cols-2 gap-2">
        {[
          { l: 'Open checkout',     i: <Icons.Link size={13} />,        primary: true },
          { l: 'Copy embed code',   i: <Icons.FileText size={13} />,    primary: false },
          { l: 'Email to partner',  i: <Icons.Mail size={13} />,        primary: false },
          { l: 'Auto-discount rule',i: <Icons.Sparkles size={13} />,    primary: false },
        ].map(b => (
          <button
            key={b.l}
            className={`inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[12px] font-semibold transition-colors ${b.primary ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90' : 'border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
          >
            {b.i}
            {b.l}
          </button>
        ))}
      </div>
    </section>
  </div>
);

const ProductPricing: React.FC<{ product: Product }> = ({ product }) => (
  <div className="space-y-5">
    <section>
      <SectionLabel>Pricing tiers · {product.pricing.length}</SectionLabel>
      <div className="grid grid-cols-1 gap-2">
        {product.pricing.map(t => (
          <div
            key={t.tier}
            className={`relative rounded-xl border p-4 ${t.popular ? 'border-amber-400 dark:border-amber-500 bg-amber-50/40 dark:bg-amber-950/10' : 'border-zinc-200/70 dark:border-zinc-800'}`}
          >
            {t.popular && (
              <span className="absolute -top-2 left-3 text-[9.5px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500 text-white">
                Popular
              </span>
            )}
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <div className="text-[12px] font-mono uppercase tracking-wider text-zinc-500">{t.tier}</div>
                <div className="text-[24px] font-light tabular-nums text-zinc-900 dark:text-zinc-100 mt-0.5" style={{ letterSpacing: '-0.02em' }}>
                  ${t.price.toLocaleString()}
                  <span className="text-[12px] text-zinc-400 ml-1">{t.period}</span>
                </div>
                <div className="text-[11.5px] text-zinc-500 mt-1">{t.cap}</div>
              </div>
              <button className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[11.5px] font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800">
                <Icons.Link size={11} />
                Use this checkout
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
    <section>
      <SectionLabel>Stripe configuration</SectionLabel>
      <div className="rounded-lg border border-zinc-200/70 dark:border-zinc-800 px-3.5 py-1">
        <KV k="Connect status" v={<span className="text-emerald-600 dark:text-emerald-400">● Connected</span>} />
        <KV k="Account"        v="Stripe · livvvv" />
        <KV k="Currency"       v="USD" />
        <KV k="Tax handling"   v="Stripe Tax" />
      </div>
    </section>
  </div>
);

const ProductSales: React.FC<{ product: Product }> = ({ product }) => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May'];
  const sales = [12, 18, 24, 32, product.units > 100 ? 41 : 24];
  const max = Math.max(...sales);
  const recent = [
    { who: 'Boreal Beauty',    tier: product.pricing[product.pricing.length - 1].tier, amount: product.pricing[product.pricing.length - 1].price, when: 'Today' },
    { who: 'Halcyon AI',        tier: product.pricing[0].tier, amount: product.pricing[0].price, when: 'Yesterday' },
    { who: 'Verdant Hill',      tier: product.pricing[Math.min(1, product.pricing.length - 1)].tier, amount: product.pricing[Math.min(1, product.pricing.length - 1)].price, when: '2d ago' },
    { who: 'Cassia & Co.',      tier: product.pricing[0].tier, amount: product.pricing[0].price, when: '3d ago' },
  ];
  return (
    <div className="space-y-5">
      <section>
        <SectionLabel>Units sold · last 5 months</SectionLabel>
        <div className="flex items-end gap-3.5 h-[140px] py-3">
          {months.map((m, i) => (
            <div key={m} className="flex-1 flex flex-col items-center gap-1.5">
              <div className="w-full flex items-end justify-center" style={{ height: 110 }}>
                <div
                  style={{
                    width: '60%',
                    height: `${(sales[i] / max) * 100}%`,
                    background: `linear-gradient(180deg, ${product.palette[0]} 0%, ${product.palette[1]} 100%)`,
                    borderRadius: '4px 4px 0 0',
                  }}
                />
              </div>
              <div className="text-[9.5px] font-mono text-zinc-400">{m}</div>
              <div className="text-[10px] font-mono text-zinc-700 dark:text-zinc-300 font-medium">{sales[i]}</div>
            </div>
          ))}
        </div>
      </section>
      <section>
        <SectionLabel>Recent transactions</SectionLabel>
        <div className="space-y-1.5">
          {recent.map((tx, i) => (
            <div key={i} className="grid items-center gap-3 px-3 py-2 rounded-lg bg-zinc-50/60 dark:bg-zinc-900/40 border border-zinc-100 dark:border-zinc-800" style={{ gridTemplateColumns: '1fr auto auto' }}>
              <div>
                <div className="text-[12.5px] font-medium text-zinc-900 dark:text-zinc-100">{tx.who}</div>
                <div className="text-[10.5px] font-mono text-zinc-500 mt-0.5">{tx.tier} · {tx.when}</div>
              </div>
              <span className="font-mono text-[13px] tabular-nums" style={{ color: product.palette[0] }}>
                ${tx.amount.toLocaleString()}
              </span>
              <span className="inline-flex items-center gap-1 text-[9.5px] font-mono uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Paid
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

const ProductEmbed: React.FC<{ product: Product }> = ({ product }) => (
  <div className="space-y-5">
    <section>
      <SectionLabel>Embeddable widgets</SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {[
          { name: 'Buy button',     desc: '"Get $X for $Y" CTA — paste anywhere' },
          { name: 'Pricing card',   desc: 'Tier comparison · with checkout buttons' },
          { name: 'Hosted page',    desc: `livvvv.com/p/${product.id} · fully branded` },
          { name: 'Affiliate link', desc: 'Co-branded link for partners' },
        ].map(w => (
          <div key={w.name} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-zinc-50/60 dark:bg-zinc-900/40 border border-zinc-100 dark:border-zinc-800">
            <span className="w-7 h-7 rounded-md bg-white dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-300">
              <Icons.Link size={12} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-medium text-zinc-800 dark:text-zinc-100">{w.name}</div>
              <div className="text-[10.5px] text-zinc-500">{w.desc}</div>
            </div>
            <button className="text-[10.5px] font-mono uppercase tracking-wider text-zinc-600 dark:text-zinc-300 px-2 py-1 rounded hover:bg-white dark:hover:bg-zinc-800">
              Copy
            </button>
          </div>
        ))}
      </div>
    </section>
    <section>
      <SectionLabel>Embed snippet</SectionLabel>
      <pre className="text-[11px] font-mono leading-relaxed p-3 rounded-lg bg-zinc-950 text-zinc-200 overflow-x-auto">
{`<script src="https://livvvv.com/embed.js" data-product="${product.id}" data-tier="${product.pricing.find(t => t.popular)?.tier.toLowerCase() || 'default'}"></script>
<div class="livv-buy" data-product="${product.id}"></div>`}
      </pre>
    </section>
  </div>
);
