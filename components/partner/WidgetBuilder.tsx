/**
 * WidgetBuilder — sits on top of PartnerDetailPanel as a second
 * slide-over. Lets the partner configure an embeddable widget (form /
 * banner / CTA / etc.) with live preview + copyable embed snippet.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../ui/Icons';
import { SPRING_ENTER, SPRING_TAP, TAP_SCALE } from '../../lib/ui/motion';
import type { Partner, PartnerWidget, PartnerWidgetConfig, PartnerWidgetType } from '../../types';

interface Props {
  partner: Partner;
  existing: PartnerWidget | null;
  onClose: () => void;
  onSave: (type: PartnerWidgetType, config: PartnerWidgetConfig, name: string | null) => Promise<void>;
}

const TYPE_DEFAULTS: Record<PartnerWidgetType, { name: string; headline: string; sub: string; cta_text: string; theme: 'light' | 'dark' | 'auto'; position: PartnerWidgetConfig['position'] }> = {
  form:   { name: 'Lead form',     headline: 'Get a quote',                 sub: 'Tell us about your project',          cta_text: 'Send',         theme: 'light', position: 'inline'       },
  banner: { name: 'Top banner',    headline: 'Built by LIVV',               sub: '20% off your first month',            cta_text: 'Claim offer',  theme: 'dark',  position: 'inline'       },
  calc:   { name: 'Pricing calc',  headline: 'Estimate your monthly cost',  sub: 'Adjust the sliders for a live total', cta_text: 'See full pricing', theme: 'light', position: 'inline'   },
  cta:    { name: 'CTA strip',     headline: 'Ready to scale?',             sub: '30-minute strategy call, free',       cta_text: 'Book a call',  theme: 'auto',  position: 'inline'       },
  card:   { name: 'Sidebar card',  headline: 'Powered by LIVV',             sub: 'Operating system for your studio',    cta_text: 'Learn more',   theme: 'light', position: 'inline'       },
  modal:  { name: 'Modal trigger', headline: '👋 Welcome',                  sub: 'Drop us a line and we\'ll reply within 24h', cta_text: 'Get started', theme: 'light', position: 'modal-trigger' },
};

export const WidgetBuilder: React.FC<Props> = ({ partner, existing, onClose, onSave }) => {
  const [type, setType] = useState<PartnerWidgetType>(existing?.type || 'form');
  const [name, setName] = useState<string>(existing?.name || TYPE_DEFAULTS['form'].name);
  const [config, setConfig] = useState<PartnerWidgetConfig>(existing?.config || {
    ...TYPE_DEFAULTS[existing?.type || 'form'],
    colors: {
      bg: partner.brand_color || '#18181b',
      fg: '#ffffff',
      accent: '#f59e0b',
    },
  });
  const [saving, setSaving] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');

  // When type changes, swap in sensible defaults for the new type
  // unless the user has already customized the headline.
  useEffect(() => {
    const def = TYPE_DEFAULTS[type];
    setConfig(prev => ({
      ...prev,
      headline: prev.headline || def.headline,
      sub: prev.sub || def.sub,
      cta_text: prev.cta_text || def.cta_text,
      theme: prev.theme || def.theme,
      position: prev.position || def.position,
    }));
    if (!existing) setName(def.name);
  }, [type]);  // eslint-disable-line react-hooks/exhaustive-deps

  const portalLink = useMemo(
    () => (typeof window !== 'undefined' ? `${window.location.origin}/portal/${partner.referral_code}` : `https://livv.os/portal/${partner.referral_code}`),
    [partner.referral_code],
  );

  // Generate a simple `<script>` embed snippet that the partner copies
  // onto their site. The script reads data-attrs + renders an iframe
  // pointing at our portal. The actual loader will be implemented
  // server-side in a follow-up — for now the snippet is informational.
  const embedSnippet = useMemo(() => {
    return [
      `<!-- LIVV partner widget — ${type} · ${partner.name} -->`,
      `<script async src="${typeof window !== 'undefined' ? window.location.origin : ''}/widget.js"`,
      `  data-partner="${partner.referral_code}"`,
      `  data-type="${type}"`,
      `  data-theme="${config.theme || 'light'}"`,
      `  data-position="${config.position || 'inline'}"`,
      `></script>`,
    ].join('\n');
  }, [partner.referral_code, partner.name, type, config.theme, config.position]);

  const copyEmbed = async () => {
    try {
      await navigator.clipboard.writeText(embedSnippet);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 1500);
    } catch {/* ignore */}
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(type, config, name || null);
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-2.5 py-1.5 text-[12.5px] bg-transparent border border-zinc-200 dark:border-zinc-700/60 rounded-md outline-none focus:border-zinc-400 dark:focus:border-zinc-500 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600';

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex justify-end bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.aside
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={SPRING_ENTER}
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-[820px] bg-white dark:bg-zinc-950 border-l border-zinc-200/60 dark:border-zinc-800 shadow-[-20px_0_60px_-10px_rgba(0,0,0,0.15)] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-200/40 dark:border-zinc-800/60 flex items-center justify-between gap-3 shrink-0">
          <div>
            <h3 className="text-[15.5px] font-semibold text-zinc-900 dark:text-zinc-100 tracking-[-0.012em]">
              {existing ? 'Edit widget' : 'New widget'}
            </h3>
            <p className="text-[11.5px] text-zinc-500 mt-0.5">for {partner.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <Icons.X size={14} />
          </button>
        </div>

        {/* Split body */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-0 min-h-0">
          {/* Left — config */}
          <div className="overflow-y-auto px-5 py-4 space-y-3 border-r border-zinc-100 dark:border-zinc-800/60">
            <div>
              <label className="block font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-400 mb-1">Type</label>
              <div className="grid grid-cols-3 gap-1">
                {(['form', 'banner', 'cta', 'card', 'calc', 'modal'] as PartnerWidgetType[]).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`px-2 py-1 text-[10.5px] font-mono uppercase tracking-wider rounded-md border transition-colors ${
                      type === t
                        ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100'
                        : 'bg-transparent text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-400 mb-1">Name (internal)</label>
              <input value={name || ''} onChange={(e) => setName(e.target.value)} placeholder={TYPE_DEFAULTS[type].name} className={inputCls} />
            </div>
            <div>
              <label className="block font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-400 mb-1">Headline</label>
              <input value={config.headline || ''} onChange={(e) => setConfig({ ...config, headline: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-400 mb-1">Sub / description</label>
              <textarea value={config.sub || ''} onChange={(e) => setConfig({ ...config, sub: e.target.value })} rows={2} className={inputCls + ' resize-y'} />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-400 mb-1">CTA text</label>
                <input value={config.cta_text || ''} onChange={(e) => setConfig({ ...config, cta_text: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-400 mb-1">CTA URL</label>
                <input value={config.cta_url || ''} onChange={(e) => setConfig({ ...config, cta_url: e.target.value })} placeholder={portalLink} className={inputCls} />
              </div>
              <div>
                <label className="block font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-400 mb-1">Theme</label>
                <select value={config.theme || 'light'} onChange={(e) => setConfig({ ...config, theme: e.target.value as any })} className={inputCls}>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="auto">Auto</option>
                </select>
              </div>
              <div>
                <label className="block font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-400 mb-1">Position</label>
                <select value={config.position || 'inline'} onChange={(e) => setConfig({ ...config, position: e.target.value as any })} className={inputCls}>
                  <option value="inline">Inline</option>
                  <option value="floating-br">Floating · bottom right</option>
                  <option value="floating-bl">Floating · bottom left</option>
                  <option value="modal-trigger">Modal trigger</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-400 mb-1">Bg</label>
                <input value={config.colors?.bg || ''} onChange={(e) => setConfig({ ...config, colors: { ...(config.colors || {}), bg: e.target.value } })} placeholder="#18181b" className={inputCls + ' font-mono text-[11px]'} />
              </div>
              <div>
                <label className="block font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-400 mb-1">Fg</label>
                <input value={config.colors?.fg || ''} onChange={(e) => setConfig({ ...config, colors: { ...(config.colors || {}), fg: e.target.value } })} placeholder="#ffffff" className={inputCls + ' font-mono text-[11px]'} />
              </div>
              <div>
                <label className="block font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-400 mb-1">Accent</label>
                <input value={config.colors?.accent || ''} onChange={(e) => setConfig({ ...config, colors: { ...(config.colors || {}), accent: e.target.value } })} placeholder="#f59e0b" className={inputCls + ' font-mono text-[11px]'} />
              </div>
            </div>

            {/* Embed snippet — copyable */}
            <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/60">
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-400">Embed snippet</label>
                <motion.button
                  type="button"
                  onClick={copyEmbed}
                  whileTap={{ scale: TAP_SCALE, transition: SPRING_TAP }}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                >
                  {copyState === 'copied' ? <><Icons.Check size={9} /> Copied</> : <><Icons.Link size={9} /> Copy</>}
                </motion.button>
              </div>
              <pre className="font-mono text-[10px] leading-relaxed text-zinc-700 dark:text-zinc-300 bg-zinc-50/80 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-all">
                {embedSnippet}
              </pre>
            </div>
          </div>

          {/* Right — preview */}
          <div className="overflow-y-auto p-5 bg-zinc-50/60 dark:bg-zinc-900/40">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-400 mb-2">Live preview</div>
            <div className="flex items-center justify-center min-h-[60%] py-6">
              <WidgetPreview type={type} config={config} portalLink={portalLink} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-200/40 dark:border-zinc-800/60 px-5 py-3 shrink-0 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-[11.5px] font-medium rounded-md text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            Cancel
          </button>
          <motion.button
            type="button"
            whileTap={{ scale: TAP_SCALE, transition: SPRING_TAP }}
            disabled={saving}
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[11.5px] font-semibold disabled:opacity-40"
          >
            {saving ? 'Saving…' : (existing ? 'Save changes' : 'Create widget')}
          </motion.button>
        </div>
      </motion.aside>
    </motion.div>,
    document.body,
  );
};

// ── Preview ─────────────────────────────────────────────────────
const WidgetPreview: React.FC<{ type: PartnerWidgetType; config: PartnerWidgetConfig; portalLink: string }> = ({ type, config, portalLink }) => {
  const bg = config.colors?.bg || '#18181b';
  const fg = config.colors?.fg || '#ffffff';
  const accent = config.colors?.accent || '#f59e0b';
  const isDark = config.theme === 'dark' || (config.theme === 'auto' && bg.toLowerCase() < '#888888');

  if (type === 'banner') {
    return (
      <div className="w-full max-w-md p-4 rounded-xl flex items-center gap-3 shadow-lg" style={{ background: bg, color: fg }}>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-semibold leading-tight">{config.headline}</div>
          <div className="text-[11.5px] opacity-80 mt-0.5">{config.sub}</div>
        </div>
        <a href={config.cta_url || portalLink} target="_blank" rel="noopener noreferrer" className="shrink-0 px-3 py-1.5 rounded-md text-[11.5px] font-semibold" style={{ background: accent, color: bg }}>
          {config.cta_text}
        </a>
      </div>
    );
  }
  if (type === 'cta') {
    return (
      <div className="w-full max-w-md p-6 rounded-2xl text-center shadow-lg" style={{ background: bg, color: fg }}>
        <div className="text-[18px] font-semibold tracking-[-0.012em] mb-1">{config.headline}</div>
        <div className="text-[12px] opacity-75 mb-4">{config.sub}</div>
        <a href={config.cta_url || portalLink} target="_blank" rel="noopener noreferrer" className="inline-block px-4 py-2 rounded-lg text-[12.5px] font-semibold" style={{ background: accent, color: bg }}>
          {config.cta_text}
        </a>
      </div>
    );
  }
  if (type === 'card') {
    return (
      <div className="w-72 p-4 rounded-xl shadow-md" style={{ background: isDark ? bg : '#ffffff', color: isDark ? fg : '#18181b' }}>
        <div className="text-[10px] font-mono uppercase tracking-[0.2em] mb-1.5" style={{ color: accent }}>Powered by</div>
        <div className="text-[13.5px] font-semibold mb-1">{config.headline}</div>
        <div className="text-[11.5px] opacity-70 mb-3">{config.sub}</div>
        <a href={config.cta_url || portalLink} target="_blank" rel="noopener noreferrer" className="block text-center px-3 py-1.5 rounded-md text-[11.5px] font-semibold" style={{ background: accent, color: isDark ? bg : '#ffffff' }}>
          {config.cta_text}
        </a>
      </div>
    );
  }
  if (type === 'calc') {
    return (
      <div className="w-80 p-5 rounded-xl shadow-md bg-white text-zinc-900 border border-zinc-200">
        <div className="text-[13.5px] font-semibold mb-1 tracking-[-0.005em]">{config.headline}</div>
        <div className="text-[11px] text-zinc-500 mb-3">{config.sub}</div>
        <div className="space-y-2 mb-3">
          <div className="flex items-center justify-between text-[11.5px] text-zinc-600">
            <span>Pages</span><span className="font-mono">6</span>
          </div>
          <input type="range" min={1} max={20} defaultValue={6} className="w-full accent-zinc-900" />
        </div>
        <div className="flex items-baseline justify-between mb-3">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">Est.</span>
          <span className="text-[20px] font-light tracking-[-0.03em] tabular-nums">$2,500</span>
        </div>
        <a href={config.cta_url || portalLink} target="_blank" rel="noopener noreferrer" className="block text-center px-3 py-2 rounded-md text-[12px] font-semibold text-white" style={{ background: bg }}>
          {config.cta_text}
        </a>
      </div>
    );
  }
  if (type === 'modal') {
    return (
      <div className="relative w-full max-w-md">
        <button className="px-4 py-2 rounded-full text-[12px] font-semibold shadow-lg" style={{ background: bg, color: fg }}>
          💬 Chat with us
        </button>
        <div className="mt-3 p-5 rounded-2xl shadow-2xl border border-zinc-200 bg-white text-zinc-900">
          <div className="text-[14px] font-semibold mb-1">{config.headline}</div>
          <div className="text-[11.5px] text-zinc-500 mb-3">{config.sub}</div>
          <input className="w-full px-3 py-1.5 rounded-md border border-zinc-200 text-[12px] mb-2" placeholder="your@email.com" />
          <textarea className="w-full px-3 py-1.5 rounded-md border border-zinc-200 text-[12px] mb-2" rows={2} placeholder="What's up?" />
          <button className="w-full px-3 py-2 rounded-md text-[12px] font-semibold" style={{ background: accent, color: '#ffffff' }}>
            {config.cta_text}
          </button>
        </div>
      </div>
    );
  }
  // form (default)
  return (
    <div className="w-full max-w-sm p-5 rounded-2xl shadow-md" style={{ background: isDark ? bg : '#ffffff', color: isDark ? fg : '#18181b', borderColor: isDark ? 'transparent' : '#e4e4e7', borderWidth: 1 }}>
      <div className="text-[14px] font-semibold mb-1 tracking-[-0.005em]">{config.headline}</div>
      <div className="text-[11.5px] opacity-65 mb-4">{config.sub}</div>
      <input className="w-full px-3 py-2 rounded-md text-[12.5px] mb-2" placeholder="Your name" style={{ background: isDark ? 'rgba(255,255,255,0.06)' : '#f4f4f5', border: '0' }} />
      <input className="w-full px-3 py-2 rounded-md text-[12.5px] mb-2" placeholder="Email" style={{ background: isDark ? 'rgba(255,255,255,0.06)' : '#f4f4f5', border: '0' }} />
      <textarea className="w-full px-3 py-2 rounded-md text-[12.5px] mb-3" placeholder="Tell us about your project" rows={3} style={{ background: isDark ? 'rgba(255,255,255,0.06)' : '#f4f4f5', border: '0' }} />
      <button className="w-full px-3 py-2 rounded-md text-[12px] font-semibold" style={{ background: accent, color: isDark ? bg : '#ffffff' }}>
        {config.cta_text}
      </button>
    </div>
  );
};
