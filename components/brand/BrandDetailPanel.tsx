/**
 * BrandDetailPanel — slide-over with 6 sections per the LIVV spec.
 *
 *   1. Identity      — name, logo, tagline, industry, website, description
 *   2. Visual        — palette (5 colors), fonts, photo-style tags
 *   3. Voice & Tone  — 4 sliders, words include/exclude, voice examples, personality
 *   4. Content Rules — audience, hashtags-per-platform, CTAs, do/don't rules
 *   5. References    — moodboard images + reference posts/ads/videos
 *   6. Generated     — the compiled brand_prompt + "Train style" CTA
 *
 * Drives `useBrands().upsertBrand` on save. Train calls
 * `trainBrandStyle()` from lib/ai.ts which writes the prompt back to
 * the brand row.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../ui/Icons';
import { SPRING_ENTER, SPRING_TAP, TAP_SCALE } from '../../lib/ui/motion';
import { useBrands } from '../../hooks/useBrands';
import { trainBrandStyle } from '../../lib/ai';
import { errorLogger } from '../../lib/errorLogger';
import type { Brand, BrandReferenceType } from '../../types';
import '../livv/bundle-slideover.css';

interface Props {
  brand: Brand | null;
  isOpen: boolean;
  onClose: () => void;
}

// Slim controlled input that auto-converts comma/space arrays.
const TagsField: React.FC<{
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}> = ({ label, value, onChange, placeholder }) => {
  const [raw, setRaw] = useState(value.join(', '));
  useEffect(() => { setRaw(value.join(', ')); }, [value]);
  return (
    <Field label={label}>
      <input
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={() => onChange(raw.split(',').map(s => s.trim()).filter(Boolean))}
        placeholder={placeholder}
        className="w-full px-2.5 py-1.5 text-[12.5px] bg-transparent border border-zinc-200 dark:border-zinc-700/60 rounded-md outline-none focus:border-zinc-400 dark:focus:border-zinc-500 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400"
      />
    </Field>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-400 mb-1">{label}</label>
    {children}
  </div>
);

const inputCls = 'w-full px-2.5 py-1.5 text-[12.5px] bg-transparent border border-zinc-200 dark:border-zinc-700/60 rounded-md outline-none focus:border-zinc-400 dark:focus:border-zinc-500 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600';

const ColorChip: React.FC<{ label: string; value: string | null; onChange: (v: string | null) => void }> = ({ label, value, onChange }) => (
  <div className="flex items-center gap-2">
    <div
      className="w-7 h-7 rounded-md border border-zinc-200 dark:border-zinc-700 shrink-0"
      style={{ background: value || 'transparent' }}
    />
    <div className="flex-1 min-w-0">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-400">{label}</div>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder="#000000"
        className="w-full bg-transparent border-0 outline-none font-mono text-[12px] text-zinc-700 dark:text-zinc-200 -ml-0.5"
      />
    </div>
  </div>
);

const Slider: React.FC<{ label: string; left: string; right: string; value: number; onChange: (v: number) => void }> = ({ label, left, right, value, onChange }) => (
  <div>
    <div className="flex items-center justify-between text-[10.5px] mb-1">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="font-mono text-zinc-400">{value}</span>
    </div>
    <input
      type="range"
      min={0}
      max={100}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full h-1.5 accent-zinc-900 dark:accent-zinc-100"
    />
    <div className="flex items-center justify-between text-[9.5px] font-mono text-zinc-400 mt-0.5 uppercase tracking-wider">
      <span>{left}</span>
      <span>{right}</span>
    </div>
  </div>
);

const SectionHeader: React.FC<{ icon: React.ReactNode; title: string; open: boolean; onToggle: () => void; right?: React.ReactNode }> = ({ icon, title, open, onToggle, right }) => (
  <button
    type="button"
    onClick={onToggle}
    className="w-full flex items-center gap-2.5 py-3 px-1 text-left border-b border-zinc-100 dark:border-zinc-800/60 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors"
  >
    <span className="w-5 h-5 flex items-center justify-center text-zinc-400">{icon}</span>
    <span className="text-[12.5px] font-medium text-zinc-800 dark:text-zinc-100 flex-1 tracking-[-0.005em]">{title}</span>
    {right}
    <Icons.ChevronDown size={12} className={`text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} />
  </button>
);

export const BrandDetailPanel: React.FC<Props> = ({ brand, isOpen, onClose }) => {
  const { upsertBrand, deleteBrand, moodboard, references, addMoodboardItem, removeMoodboardItem, addReference, removeReference } = useBrands();
  const isNew = !brand;

  // ── Draft state — local to the panel ────────────────────────────
  const [draft, setDraft] = useState<Brand | null>(null);
  // Tabs (bundle design) instead of accordion sections — only one is visible at a time.
  type BrandTab = 'identity' | 'visual' | 'voice' | 'rules' | 'refs' | 'gen';
  const [activeTab, setActiveTab] = useState<BrandTab>('identity');
  // Expand-to-full-width — bundle's "expand" icon affordance on slide-overs.
  const [expanded, setExpanded] = useState(false);
  // openSections kept as a derived map for legacy section toggle callsites — only
  // the active tab is "open"; everything else collapsed. Old `toggle()` becomes a no-op.
  const openSections = useMemo(() => ({
    identity: activeTab === 'identity',
    visual:   activeTab === 'visual',
    voice:    activeTab === 'voice',
    rules:    activeTab === 'rules',
    refs:     activeTab === 'refs',
    gen:      activeTab === 'gen',
  }), [activeTab]);
  const [saving, setSaving] = useState(false);
  const [training, setTraining] = useState(false);
  const [moodUrl, setMoodUrl] = useState('');
  const [refDraft, setRefDraft] = useState({ type: 'post' as BrandReferenceType, platform: '', content_text: '', source_url: '' });

  useEffect(() => {
    if (brand) {
      setDraft(brand);
    } else if (isOpen && !brand) {
      // Creating new — seed sensible defaults so the form doesn't error.
      setDraft({
        id: '', tenant_id: '', name: '', logo_url: null, logo_secondary_url: null, logo_icon_url: null,
        tagline: null, industry: null, website_url: null, description: null,
        color_primary: null, color_secondary: null, color_accent: null, color_background: null, color_text: null,
        font_heading: null, font_body: null, photo_style_tags: [],
        tone_formal_casual: 50, tone_technical_accessible: 50, tone_serious_playful: 50, tone_direct_storytelling: 50,
        words_include: [], words_exclude: [], voice_examples: [], personality: null,
        audience_description: null, hashtags: {}, ctas: [], content_rules: {},
        brand_prompt: null, status: 'draft', created_at: '', updated_at: '',
      });
    }
  }, [brand, isOpen]);

  const brandMoodboard = useMemo(() => brand ? moodboard.filter(m => m.brand_id === brand.id) : [], [brand, moodboard]);
  const brandReferences = useMemo(() => brand ? references.filter(r => r.brand_id === brand.id) : [], [brand, references]);

  if (!isOpen || !draft) return null;

  // Accordion toggle behavior is replaced by tab activation — clicking a
  // SectionHeader makes that section the only visible one.
  const toggle = (key: BrandTab) => setActiveTab(key);

  const handleSave = async () => {
    if (!draft.name.trim()) return;
    setSaving(true);
    try {
      await upsertBrand({
        ...(draft.id ? { id: draft.id } : {}),
        name: draft.name,
        logo_url: draft.logo_url,
        logo_secondary_url: draft.logo_secondary_url,
        logo_icon_url: draft.logo_icon_url,
        tagline: draft.tagline,
        industry: draft.industry,
        website_url: draft.website_url,
        description: draft.description,
        color_primary: draft.color_primary,
        color_secondary: draft.color_secondary,
        color_accent: draft.color_accent,
        color_background: draft.color_background,
        color_text: draft.color_text,
        font_heading: draft.font_heading,
        font_body: draft.font_body,
        photo_style_tags: draft.photo_style_tags,
        tone_formal_casual: draft.tone_formal_casual,
        tone_technical_accessible: draft.tone_technical_accessible,
        tone_serious_playful: draft.tone_serious_playful,
        tone_direct_storytelling: draft.tone_direct_storytelling,
        words_include: draft.words_include,
        words_exclude: draft.words_exclude,
        voice_examples: draft.voice_examples,
        personality: draft.personality,
        audience_description: draft.audience_description,
        hashtags: draft.hashtags,
        ctas: draft.ctas,
        content_rules: draft.content_rules,
        status: draft.status,
      });
      onClose();
    } catch (e) {
      errorLogger.warn('save brand failed', e);
    } finally {
      setSaving(false);
    }
  };

  const handleTrain = async () => {
    if (!brand?.id) return;
    setTraining(true);
    try {
      const compiled = await trainBrandStyle(brand);
      // Realtime push from the AI write will refresh the brand row; nothing else to do here.
      void compiled;
    } catch (e) {
      errorLogger.warn('train brand style failed', e);
    } finally {
      setTraining(false);
    }
  };

  const brandColor = draft.color_primary || '#18181b';

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="bdp-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="bdl-so-overlay"
        onClick={onClose}
      />
      <motion.aside
        key="bdp-panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
        onClick={(e) => e.stopPropagation()}
        className="bdl-so"
        style={{
          ['--icp-color' as any]: brandColor,
          ...(expanded ? { width: '100vw', maxWidth: '100vw' } : {}),
        }}
      >
          {/* Header — bundle design with logo block + editable title + status + close */}
          <header className="bdl-so-head">
            <div
              className="bdl-so-icp"
              style={{
                background: brandColor,
                color: draft.color_text || (brandColor === '#18181b' ? '#fafafa' : '#18181b'),
                width: 44,
                height: 44,
                borderRadius: 11,
                fontSize: 14,
              }}
            >
              {draft.logo_url
                ? <img src={draft.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 'inherit' }} />
                : (draft.name || 'B').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            <div className="bdl-so-titleline">
              <div className="bdl-so-title">
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Brand name"
                  style={{
                    background: 'transparent',
                    border: 0,
                    outline: 'none',
                    font: 'inherit',
                    fontSize: 18,
                    fontWeight: 500,
                    letterSpacing: '-0.02em',
                    color: 'inherit',
                    width: '100%',
                  }}
                />
                <span className={`bdl-so-status`}>
                  <span className="dot" />{draft.status}
                </span>
              </div>
              <div className="bdl-so-sub">
                <span>{draft.tagline || draft.industry || (isNew ? 'New brand kit' : '—')}</span>
              </div>
            </div>
            <div className="bdl-so-actions">
              <select
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value as Brand['status'] })}
                className="bdl-so-iconbtn"
                style={{
                  width: 'auto', padding: '4px 8px',
                  fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  background: 'transparent', cursor: 'pointer',
                  border: '0.5px solid rgba(214,209,199,0.55)',
                }}
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
              <button
                onClick={() => setExpanded(e => !e)}
                className="bdl-so-iconbtn"
                title={expanded ? 'Collapse' : 'Expand to full width'}
              >
                <Icons.Maximize size={14} />
              </button>
              <button onClick={onClose} className="bdl-so-iconbtn" title="Close (Esc)">
                <Icons.X size={14} />
              </button>
            </div>
          </header>

          {/* Tab nav — bundle design (replaces the accordion) */}
          <nav className="bdl-so-tabs" style={{ flexWrap: 'wrap' }}>
            {([
              { id: 'identity', label: 'Identity', icon: <Icons.User size={11} /> },
              { id: 'visual',   label: 'Visual',   icon: <Icons.Sparkles size={11} /> },
              { id: 'voice',    label: 'Voice',    icon: <Icons.Message size={11} /> },
              { id: 'rules',    label: 'Rules',    icon: <Icons.Check size={11} /> },
              { id: 'refs',     label: 'References', icon: <Icons.Bookmark size={11} /> },
              { id: 'gen',      label: 'Preview',  icon: <Icons.Sparkles size={11} /> },
            ] as { id: BrandTab; label: string; icon: React.ReactNode }[]).map(t => (
              <button
                key={t.id}
                className={`bdl-so-tab ${activeTab === t.id ? 'active' : ''}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </nav>

          {/* Sections — only the active tab is rendered open */}
          <div className="bdl-so-body" style={{ paddingTop: 12 }}>

            {/* 1 — Identity */}
            <SectionHeader icon={<Icons.User size={12} />} title="Identity" open={openSections.identity} onToggle={() => toggle('identity')} />
            <AnimatePresence initial={false}>
              {openSections.identity && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="grid grid-cols-2 gap-3 py-3">
                    <Field label="Logo URL"><input value={draft.logo_url || ''} onChange={(e) => setDraft({ ...draft, logo_url: e.target.value || null })} placeholder="https://…" className={inputCls} /></Field>
                    <Field label="Logo icon URL"><input value={draft.logo_icon_url || ''} onChange={(e) => setDraft({ ...draft, logo_icon_url: e.target.value || null })} placeholder="https://…" className={inputCls} /></Field>
                    <Field label="Tagline"><input value={draft.tagline || ''} onChange={(e) => setDraft({ ...draft, tagline: e.target.value || null })} placeholder="One-line elevator" className={inputCls} /></Field>
                    <Field label="Industry"><input value={draft.industry || ''} onChange={(e) => setDraft({ ...draft, industry: e.target.value || null })} placeholder="SaaS, Hospitality…" className={inputCls} /></Field>
                    <Field label="Website"><input value={draft.website_url || ''} onChange={(e) => setDraft({ ...draft, website_url: e.target.value || null })} placeholder="https://…" className={inputCls} /></Field>
                    <div />
                    <div className="col-span-2">
                      <Field label="Description">
                        <textarea
                          value={draft.description || ''}
                          onChange={(e) => setDraft({ ...draft, description: e.target.value || null })}
                          rows={3}
                          placeholder="Long-form description used to brief the AI"
                          className={inputCls + ' resize-y'}
                        />
                      </Field>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 2 — Visual */}
            <SectionHeader icon={<Icons.Activity size={12} />} title="Visual style" open={openSections.visual} onToggle={() => toggle('visual')} />
            <AnimatePresence initial={false}>
              {openSections.visual && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="grid grid-cols-2 gap-3 py-3">
                    <ColorChip label="Primary" value={draft.color_primary} onChange={(v) => setDraft({ ...draft, color_primary: v })} />
                    <ColorChip label="Secondary" value={draft.color_secondary} onChange={(v) => setDraft({ ...draft, color_secondary: v })} />
                    <ColorChip label="Accent" value={draft.color_accent} onChange={(v) => setDraft({ ...draft, color_accent: v })} />
                    <ColorChip label="Background" value={draft.color_background} onChange={(v) => setDraft({ ...draft, color_background: v })} />
                    <ColorChip label="Text" value={draft.color_text} onChange={(v) => setDraft({ ...draft, color_text: v })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3 py-3">
                    <Field label="Heading font"><input value={draft.font_heading || ''} onChange={(e) => setDraft({ ...draft, font_heading: e.target.value || null })} placeholder="Inter, PP Playground…" className={inputCls} /></Field>
                    <Field label="Body font"><input value={draft.font_body || ''} onChange={(e) => setDraft({ ...draft, font_body: e.target.value || null })} placeholder="Inter, Helvetica…" className={inputCls} /></Field>
                  </div>
                  <div className="pb-3">
                    <TagsField label="Photo style tags (comma-separated)" value={draft.photo_style_tags} onChange={(v) => setDraft({ ...draft, photo_style_tags: v })} placeholder="editorial, warm, candid, golden hour" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 3 — Voice & Tone */}
            <SectionHeader icon={<Icons.Mail size={12} />} title="Voice & tone" open={openSections.voice} onToggle={() => toggle('voice')} />
            <AnimatePresence initial={false}>
              {openSections.voice && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 py-3">
                    <Slider label="Formality" left="Formal" right="Casual" value={draft.tone_formal_casual} onChange={(v) => setDraft({ ...draft, tone_formal_casual: v })} />
                    <Slider label="Technicality" left="Technical" right="Accessible" value={draft.tone_technical_accessible} onChange={(v) => setDraft({ ...draft, tone_technical_accessible: v })} />
                    <Slider label="Mood" left="Serious" right="Playful" value={draft.tone_serious_playful} onChange={(v) => setDraft({ ...draft, tone_serious_playful: v })} />
                    <Slider label="Approach" left="Direct" right="Storytelling" value={draft.tone_direct_storytelling} onChange={(v) => setDraft({ ...draft, tone_direct_storytelling: v })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3 pb-3">
                    <TagsField label="Words to USE" value={draft.words_include} onChange={(v) => setDraft({ ...draft, words_include: v })} placeholder="precise, kinetic, anchored" />
                    <TagsField label="Words to AVOID" value={draft.words_exclude} onChange={(v) => setDraft({ ...draft, words_exclude: v })} placeholder="revolucionario, sinergia" />
                    <div className="col-span-2">
                      <Field label="Voice examples (one per line)">
                        <textarea
                          value={draft.voice_examples.join('\n')}
                          onChange={(e) => setDraft({ ...draft, voice_examples: e.target.value.split('\n').filter(Boolean) })}
                          rows={3}
                          placeholder="Lines / phrases / hooks that sound like this brand"
                          className={inputCls + ' resize-y'}
                        />
                      </Field>
                    </div>
                    <div className="col-span-2">
                      <Field label="Personality (one paragraph)">
                        <textarea
                          value={draft.personality || ''}
                          onChange={(e) => setDraft({ ...draft, personality: e.target.value || null })}
                          rows={2}
                          placeholder="A studio of engineers and artists that ships results, not promises."
                          className={inputCls + ' resize-y'}
                        />
                      </Field>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 4 — Content Rules */}
            <SectionHeader icon={<Icons.Target size={12} />} title="Content rules" open={openSections.rules} onToggle={() => toggle('rules')} />
            <AnimatePresence initial={false}>
              {openSections.rules && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="py-3 space-y-3">
                    <Field label="Audience description">
                      <textarea
                        value={draft.audience_description || ''}
                        onChange={(e) => setDraft({ ...draft, audience_description: e.target.value || null })}
                        rows={2}
                        placeholder="Founders of agencies $200k-$2M/yr, ages 28-45, design-aware"
                        className={inputCls + ' resize-y'}
                      />
                    </Field>
                    <TagsField label="CTAs (comma-separated)" value={draft.ctas} onChange={(v) => setDraft({ ...draft, ctas: v })} placeholder="Book a call · Watch the demo · Reply 'INFO'" />

                    {/* Hashtags as a simple key=val,val per line — keeps it editable without a JSON editor */}
                    <Field label="Hashtags per platform">
                      <textarea
                        value={Object.entries(draft.hashtags || {}).map(([k, v]) => `${k}: ${(v as string[]).join(', ')}`).join('\n')}
                        onChange={(e) => {
                          const next: Record<string, string[]> = {};
                          for (const line of e.target.value.split('\n')) {
                            const [k, rest] = line.split(':');
                            if (k && rest !== undefined) next[k.trim()] = rest.split(',').map(s => s.trim()).filter(Boolean);
                          }
                          setDraft({ ...draft, hashtags: next });
                        }}
                        rows={3}
                        placeholder={'linkedin: #ai, #ops\ninstagram: #design'}
                        className={inputCls + ' resize-y font-mono text-[11.5px]'}
                      />
                    </Field>

                    <Field label="Do / don't rules (JSON)">
                      <textarea
                        value={JSON.stringify(draft.content_rules || {}, null, 2)}
                        onChange={(e) => {
                          try { setDraft({ ...draft, content_rules: JSON.parse(e.target.value) }); } catch { /* skip on invalid JSON until next blur */ }
                        }}
                        rows={4}
                        placeholder='{ "do": ["short bullets"], "dont": ["em dashes"] }'
                        className={inputCls + ' resize-y font-mono text-[11px]'}
                      />
                    </Field>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 5 — References (moodboard + reference posts) */}
            <SectionHeader
              icon={<Icons.Briefcase size={12} />}
              title="References"
              open={openSections.refs}
              onToggle={() => toggle('refs')}
              right={<span className="font-mono text-[10px] text-zinc-400 mr-1.5">{brandMoodboard.length + brandReferences.length}</span>}
            />
            <AnimatePresence initial={false}>
              {openSections.refs && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="py-3 space-y-4">
                    {/* Moodboard */}
                    <div>
                      <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-400 mb-2">Moodboard</div>
                      <div className="grid grid-cols-4 gap-2 mb-2">
                        {brandMoodboard.map(m => (
                          <div key={m.id} className="relative group aspect-square rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700">
                            <img src={m.image_url} alt="" className="w-full h-full object-cover" />
                            <button
                              onClick={() => removeMoodboardItem(m.id)}
                              className="absolute top-1 right-1 w-5 h-5 rounded-md bg-black/60 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center"
                            >
                              <Icons.X size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-1.5">
                        <input
                          value={moodUrl}
                          onChange={(e) => setMoodUrl(e.target.value)}
                          placeholder="Image URL (paste + Enter)"
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter' && moodUrl.trim() && brand?.id) {
                              await addMoodboardItem(brand.id, { image_url: moodUrl.trim(), source: null, source_url: null, notes: null, sort_order: brandMoodboard.length });
                              setMoodUrl('');
                            }
                          }}
                          className={inputCls + ' flex-1'}
                        />
                      </div>
                    </div>

                    {/* Reference posts */}
                    <div>
                      <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-400 mb-2">Reference posts / ads / videos</div>
                      <div className="space-y-1.5 mb-2">
                        {brandReferences.map(r => (
                          <div key={r.id} className="flex items-start gap-2 p-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                            <span className="font-mono text-[9.5px] uppercase tracking-wider bg-zinc-100 dark:bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded shrink-0">{r.type}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-[12px] text-zinc-800 dark:text-zinc-100 line-clamp-2">{r.content_text || r.source_url || '(no content)'}</div>
                              {r.platform && <div className="text-[10px] text-zinc-400 mt-0.5">{r.platform}</div>}
                            </div>
                            <button onClick={() => removeReference(r.id)} className="text-zinc-300 hover:text-rose-500 shrink-0">
                              <Icons.X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-[80px_1fr_80px] gap-1.5 items-end">
                        <select value={refDraft.type} onChange={(e) => setRefDraft({ ...refDraft, type: e.target.value as BrandReferenceType })} className={inputCls}>
                          <option value="post">Post</option>
                          <option value="ad">Ad</option>
                          <option value="video">Video</option>
                          <option value="website">Website</option>
                          <option value="email">Email</option>
                          <option value="other">Other</option>
                        </select>
                        <input
                          value={refDraft.content_text}
                          onChange={(e) => setRefDraft({ ...refDraft, content_text: e.target.value })}
                          placeholder="Paste text or describe…"
                          className={inputCls}
                        />
                        <motion.button
                          type="button"
                          disabled={!brand?.id || !refDraft.content_text.trim()}
                          whileTap={{ scale: TAP_SCALE, transition: SPRING_TAP }}
                          onClick={async () => {
                            if (!brand?.id || !refDraft.content_text.trim()) return;
                            await addReference(brand.id, { type: refDraft.type, platform: refDraft.platform || null, content_text: refDraft.content_text, image_url: null, source_url: refDraft.source_url || null, metrics: {}, notes: null });
                            setRefDraft({ type: 'post', platform: '', content_text: '', source_url: '' });
                          }}
                          className="px-2 py-1.5 text-[11px] font-semibold rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 disabled:opacity-30"
                        >
                          Add
                        </motion.button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 6 — Generated brand prompt */}
            <SectionHeader
              icon={<Icons.Sparkles size={12} />}
              title="Generated brand prompt"
              open={openSections.gen}
              onToggle={() => toggle('gen')}
              right={
                brand?.brand_prompt
                  ? <span className="font-mono text-[9.5px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mr-1.5">trained</span>
                  : <span className="font-mono text-[9.5px] uppercase tracking-wider text-zinc-400 mr-1.5">not trained</span>
              }
            />
            <AnimatePresence initial={false}>
              {openSections.gen && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="py-3 space-y-3">
                    <div className="rounded-xl border border-amber-200/70 dark:border-amber-500/30 bg-gradient-to-br from-amber-50/70 via-white to-rose-50/40 dark:from-amber-950/20 dark:via-zinc-900 dark:to-rose-950/15 p-3.5">
                      <div className="flex items-start gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                          <Icons.Sparkles size={13} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-amber-600 dark:text-amber-400 mb-1.5">Compile system prompt</div>
                          <p className="text-[12.5px] text-zinc-700 dark:text-zinc-200 leading-relaxed">
                            Run <strong>Train style</strong> to compile every field above into a single system prompt the AI uses when generating on-brand content. Re-train whenever you change voice / words / references.
                          </p>
                          <motion.button
                            type="button"
                            disabled={!brand?.id || training}
                            whileTap={{ scale: TAP_SCALE, transition: SPRING_TAP }}
                            onClick={handleTrain}
                            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-[11.5px] font-semibold"
                          >
                            <Icons.Sparkles size={11} />
                            {training ? 'Training…' : (brand?.brand_prompt ? 'Re-train style' : 'Train style')}
                          </motion.button>
                        </div>
                      </div>
                    </div>
                    {brand?.brand_prompt && (
                      <Field label="Compiled brand_prompt (read-only)">
                        <textarea
                          value={brand.brand_prompt}
                          readOnly
                          rows={10}
                          className={inputCls + ' resize-y font-mono text-[11px] bg-zinc-50/60 dark:bg-zinc-900/40'}
                        />
                      </Field>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="h-6" />
          </div>

          {/* Footer */}
          <div className="border-t border-zinc-200/40 dark:border-zinc-800/60 px-5 py-3 shrink-0 flex items-center justify-between gap-2">
            <button
              onClick={() => brand?.id && deleteBrand(brand.id).then(onClose)}
              disabled={!brand?.id}
              className="text-[11px] text-zinc-400 hover:text-rose-500 dark:hover:text-rose-400 disabled:opacity-30 transition-colors"
            >
              Delete brand
            </button>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="px-3 py-1.5 text-[11.5px] font-medium rounded-md text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                Cancel
              </button>
              <motion.button
                type="button"
                whileTap={{ scale: TAP_SCALE, transition: SPRING_TAP }}
                disabled={!draft.name.trim() || saving}
                onClick={handleSave}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[11.5px] font-semibold disabled:opacity-40"
              >
                {saving ? 'Saving…' : (isNew ? 'Create brand' : 'Save changes')}
              </motion.button>
            </div>
          </div>
      </motion.aside>
    </AnimatePresence>,
    document.body,
  );
};
