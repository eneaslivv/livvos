/**
 * Content Engine — distribution motor for the whole growth strategy.
 * Manages channels (where we publish), pieces (what we publish), and
 * the lifecycle (idea → drafted → review → scheduled → published).
 *
 * Three tabs:
 *   1. Pipeline — kanban by status, drag forward as a piece progresses
 *   2. Calendar — month grid of scheduled + published pieces
 *   3. Channels — list of channels with frequency targets + compliance
 *
 * Joins to strategy_icps (target audience) and content_channels.
 * Loose link to projects via source_project_id for case-study source.
 *
 * Not done yet (deferred):
 *   • AI features (case-study draft from project, content idea suggester)
 *   • Engagement metrics dashboard
 *   • Repurpose chain visualizer
 *   • Drag-and-drop on the kanban — for now, status updates via inline buttons
 *   • Per-channel frequency compliance visualization
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../components/ui/Icons';
import { supabase } from '../lib/supabase';
import { useTenant } from '../context/TenantContext';
import { useBrands } from '../hooks/useBrands';
import { BrandDetailPanel } from '../components/brand/BrandDetailPanel';
import { generateContent, type ContentVariation } from '../lib/ai';
import type { Brand } from '../types';
import { errorLogger } from '../lib/errorLogger';
import { SPRING_ENTER, SPRING_TAP } from '../lib/ui/motion';
import '../components/livv/bundle-strategy.css';
import '../components/livv/bundle-cards.css';
import { CoachFlow } from '../components/livv/CoachFlow';
import { BRAND_CREATION_FLOW, type BrandData } from '../components/livv/flows/BrandCreationFlow';
import { CONTENT_SETUP_FLOW, type ContentSetupData } from '../components/livv/flows/ContentChannelsFlow';
import { ContentStudio as BundleContentStudio } from '../components/livv/ContentStudio';

// ── Types mirroring the DB schema ─────────────────────────────────
interface Channel {
  id: string;
  tenant_id: string;
  name: string;
  platform: string;
  priority: 'principal' | 'secondary' | 'long-term' | 'passive';
  target_audience: string | null;
  tone: string | null;
  format_types: string[];
  frequency_target: string | null;
  frequency_posts_per_week: number | null;
  status: 'active' | 'paused' | 'archived';
  created_at: string;
}

interface Piece {
  id: string;
  tenant_id: string;
  title: string;
  channel_id: string | null;
  content_type: string;
  status: 'idea' | 'drafted' | 'review' | 'scheduled' | 'published' | 'repurposed';
  target_icp_id: string | null;
  body: string | null;
  media_urls: string[];
  scheduled_date: string | null;
  published_date: string | null;
  published_url: string | null;
  source_project_id: string | null;
  repurposed_from: string | null;
  engagement_metrics: Record<string, any>;
  notes: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

interface ICP { id: string; name: string }

type Tab = 'pipeline' | 'calendar' | 'channels' | 'brands' | 'studio';

const STATUS_FLOW: Array<{ id: Piece['status']; label: string; tone: string }> = [
  { id: 'idea',       label: 'Ideas',      tone: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300' },
  { id: 'drafted',    label: 'Drafted',    tone: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  { id: 'review',     label: 'Review',     tone: 'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300' },
  { id: 'scheduled',  label: 'Scheduled',  tone: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300' },
  { id: 'published',  label: 'Published',  tone: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  { id: 'repurposed', label: 'Repurposed', tone: 'bg-fuchsia-50 dark:bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300' },
];

const PRIORITY_TONE: Record<string, string> = {
  principal:   'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200/60 dark:border-emerald-500/30',
  secondary:   'text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-500/10 border-violet-200/60 dark:border-violet-500/30',
  'long-term': 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border-amber-200/60 dark:border-amber-500/30',
  passive:     'text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700',
};

const EMPTY_CHANNEL: Omit<Channel, 'id' | 'tenant_id' | 'created_at'> = {
  name: '',
  platform: 'linkedin',
  priority: 'secondary',
  target_audience: null,
  tone: null,
  format_types: [],
  frequency_target: null,
  frequency_posts_per_week: null,
  status: 'active',
};

const EMPTY_PIECE: Omit<Piece, 'id' | 'tenant_id' | 'created_at' | 'updated_at'> = {
  title: '',
  channel_id: null,
  content_type: 'post',
  status: 'idea',
  target_icp_id: null,
  body: null,
  media_urls: [],
  scheduled_date: null,
  published_date: null,
  published_url: null,
  source_project_id: null,
  repurposed_from: null,
  engagement_metrics: {},
  notes: null,
  assigned_to: null,
};

export const ContentEngine: React.FC = () => {
  const { currentTenant } = useTenant();
  const [tab, setTab] = useState<Tab>('pipeline');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [icps, setIcps] = useState<ICP[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPiece, setEditingPiece] = useState<Piece | 'new' | null>(null);
  const [editingChannel, setEditingChannel] = useState<Channel | 'new' | null>(null);
  // Brand kit state — comes from its own hook (separate from the
  // content channel/piece state above so the brand kit logic can
  // evolve without touching the rest of this page).
  const { brands } = useBrands();
  const [editingBrand, setEditingBrand] = useState<Brand | 'new' | null>(null);
  // Brand CoachFlow — 6-step guided wizard for creating a brand kit.
  // Triggered by the "Guided" button on the Brands tab.
  const [brandCoachOpen, setBrandCoachOpen] = useState(false);
  const [brandCoachSaving, setBrandCoachSaving] = useState(false);

  // Content Setup flow finish — inserts channels + their cadence target
  // + creates the first piece as a draft. All from the wizard data.
  const handleContentSetupFinish = useCallback(async (data: ContentSetupData) => {
    if (!currentTenant?.id) return;
    try {
      const tid = currentTenant.id;
      // 1) Insert all picked channels
      const cadence = data.cadence || {};
      const channelRows = (data.channels || []).map(id => ({
        tenant_id: tid,
        platform: id,
        name: id.charAt(0).toUpperCase() + id.slice(1),
        target_per_week: cadence[id] || 2,
        priority: 1,
        status: 'active',
      }));
      if (channelRows.length > 0) {
        await supabase.from('content_channels').insert(channelRows);
      }
      // 2) Create the first piece as a draft
      const fp = data.firstPiece;
      if (fp?.title && fp.channel) {
        await supabase.from('content_pieces').insert({
          tenant_id: tid,
          title: fp.title,
          channel_platform: fp.channel,
          status: 'draft',
        });
      }
      await refetch();
    } catch (e) {
      errorLogger.warn('content setup finish failed', e);
    }
  }, [currentTenant?.id]);

  const handleBrandCoachFinish = useCallback(async (data: BrandData) => {
    if (!currentTenant?.id) return;
    setBrandCoachSaving(true);
    try {
      // Compile the brand_prompt the wizard built
      const compiled = [
        `# ${data.name || 'Brand'}`,
        data.about ? `\n${data.about}\n` : '',
        data.typography_mood ? `Typography mood: ${data.typography_mood}` : '',
        `Voice: formality ${data.voice_formality ?? 50} · energy ${data.voice_energy ?? 50} · warmth ${data.voice_warmth ?? 50} · cleverness ${data.voice_cleverness ?? 50}`,
        (data.rules_dos || []).filter(Boolean).length > 0
          ? `\nDO: ${(data.rules_dos || []).filter(Boolean).join(' · ')}`
          : '',
        (data.rules_donts || []).filter(Boolean).length > 0
          ? `\nDON'T: ${(data.rules_donts || []).filter(Boolean).join(' · ')}`
          : '',
      ].filter(Boolean).join('\n');

      const { error } = await supabase.from('brand_kits').insert({
        tenant_id: currentTenant.id,
        name: data.name,
        slug: data.slug,
        about: data.about,
        palette: data.palette || [],
        typography_mood: data.typography_mood,
        voice_formality: data.voice_formality,
        voice_energy: data.voice_energy,
        voice_warmth: data.voice_warmth,
        voice_cleverness: data.voice_cleverness,
        rules_dos: (data.rules_dos || []).filter(Boolean),
        rules_donts: (data.rules_donts || []).filter(Boolean),
        references: (data.references || []).filter(Boolean),
        brand_prompt: compiled,
      });
      if (error) throw error;
      setBrandCoachOpen(false);
      await refetch();
    } catch (err: any) {
      errorLogger.warn('brand coach finish failed', err);
      alert(`Could not save brand kit: ${err.message}`);
    } finally {
      setBrandCoachSaving(false);
    }
  }, [currentTenant?.id]);

  const refetch = useCallback(async () => {
    if (!currentTenant?.id) return;
    setLoading(true);
    try {
      const [cRes, pRes, iRes] = await Promise.all([
        supabase.from('content_channels').select('*').eq('tenant_id', currentTenant.id).order('priority', { ascending: true }).order('created_at', { ascending: false }),
        supabase.from('content_pieces').select('*').eq('tenant_id', currentTenant.id).order('created_at', { ascending: false }).limit(200),
        supabase.from('strategy_icps').select('id, name').eq('tenant_id', currentTenant.id),
      ]);
      setChannels((cRes.data || []) as Channel[]);
      setPieces((pRes.data || []) as Piece[]);
      setIcps((iRes.data || []) as ICP[]);
    } catch (e) {
      errorLogger.warn('content engine load failed', e);
    } finally {
      setLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => { refetch(); }, [refetch]);

  // ── Group pieces by status for the kanban ────────────────────────
  const pipelinePieces = useMemo(() => {
    const map: Record<string, Piece[]> = {};
    for (const s of STATUS_FLOW) map[s.id] = [];
    for (const p of pieces) {
      if (map[p.status]) map[p.status].push(p);
    }
    return map;
  }, [pieces]);

  // ── Move a piece's status. Sets published_date when moving INTO
  //     'published', clears it when moving OUT. ─────────────────────
  const handleMoveStatus = async (piece: Piece, newStatus: Piece['status']) => {
    const today = new Date().toISOString().slice(0, 10);
    const patch: Partial<Piece> = { status: newStatus };
    if (newStatus === 'published' && !piece.published_date) patch.published_date = today;
    if (newStatus !== 'published' && piece.status === 'published') patch.published_date = null;
    try {
      await supabase.from('content_pieces').update(patch).eq('id', piece.id);
      setPieces(prev => prev.map(p => p.id === piece.id ? { ...p, ...patch } : p));
    } catch (e) {
      errorLogger.warn('move status failed', e);
    }
  };

  // Setup mode is active when the current tab has no underlying data and
  // we're auto-rendering the inline wizard. Show the SETUP MODE breadcrumb pill.
  const inSetupMode = (
    (tab === 'pipeline' && channels.length === 0) ||
    (tab === 'calendar' && channels.length === 0) ||
    (tab === 'channels' && channels.length === 0) ||
    (tab === 'brands' && brands.length === 0)
  );

  return (
    <div className="max-w-[1320px] mx-auto px-6 py-6">
      {/* Setup-mode breadcrumb (bundle screenshot pattern) */}
      <div className="flex items-center gap-2 mb-3 text-[11px] font-mono uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">
        <span className="inline-flex items-center gap-1">
          <Icons.Sparkles size={11} />
          Content
        </span>
        <span className="opacity-40">/</span>
        <span className="text-zinc-700 dark:text-zinc-200 capitalize">{tab}</span>
        {inSetupMode && (
          <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-300/50 dark:border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Setup mode
          </span>
        )}
      </div>

      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="bdl-page-title">
            {inSetupMode ? `Build your ${tab}` : 'Content'}
          </h1>
          <p className="bdl-page-sub">
            {inSetupMode
              ? '3 steps · ~3 min · channels → cadence → first piece'
              : 'Pipeline · Calendar · Channels · Brand kits · Studio'}
          </p>
        </div>
      </header>

      {/* Bundle-style pill tabs + action button */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="bdl-tabs">
          {([
            { id: 'pipeline' as const, label: 'Pipeline', icon: 'List' },
            { id: 'calendar' as const, label: 'Calendar', icon: 'Calendar' },
            { id: 'channels' as const, label: 'Channels', icon: 'Globe' },
            { id: 'brands' as const,   label: 'Brands',   icon: 'Sparkles' },
            { id: 'studio' as const,   label: 'Studio',   icon: 'Edit' },
          ]).map(t => {
            const IconCmp = (Icons as any)[t.icon] || Icons.Sparkles;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`bdl-tab ${active ? 'active' : ''}`}
              >
                <IconCmp size={13} />
                {t.label}
              </button>
            );
          })}
        </div>
        {tab === 'brands' && (
          <button
            onClick={() => setBrandCoachOpen(true)}
            className="bdl-action ml-auto"
            style={{
              borderColor: 'rgba(196,163,90,0.5)',
              color: '#8b6a17',
              background: 'rgba(196,163,90,0.08)',
            }}
            title="Guided 6-step brand kit wizard"
          >
            <Icons.Sparkles size={12} />
            Guided
          </button>
        )}
        {tab !== 'studio' && (
          <button
            onClick={() => {
              if (tab === 'channels') setEditingChannel('new');
              else if (tab === 'brands') setEditingBrand('new' as any);
              else setEditingPiece('new');
            }}
            className={`bdl-action primary ${tab === 'brands' ? '' : 'ml-auto'}`}
          >
            <Icons.Plus size={12} />
            New {tab === 'channels' ? 'channel' : tab === 'brands' ? 'brand' : 'piece'}
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Icons.Loader className="animate-spin text-zinc-400" size={20} />
        </div>
      )}

      {/* When there are no channels yet, ANY of pipeline/calendar/channels
         tabs takes over with the inline 3-step content setup wizard
         (channels → cadence → first piece). Matches the bundle's
         "Build your content engine" setup mode pattern. */}
      {!loading && tab === 'pipeline' && (
        channels.length === 0 ? (
          <CoachFlow
            flow={CONTENT_SETUP_FLOW}
            onComplete={handleContentSetupFinish}
            onClose={() => setEditingChannel('new')}
            inline
            skipLabel="Skip — open empty form"
          />
        ) : (
          <Pipeline
            grouped={pipelinePieces}
            channels={channels}
            icps={icps}
            onEdit={(p) => setEditingPiece(p)}
            onMoveStatus={handleMoveStatus}
            onNew={() => setEditingPiece('new')}
          />
        )
      )}

      {!loading && tab === 'calendar' && (
        channels.length === 0 ? (
          <CoachFlow
            flow={CONTENT_SETUP_FLOW}
            onComplete={handleContentSetupFinish}
            onClose={() => setEditingChannel('new')}
            inline
            skipLabel="Skip — open empty form"
          />
        ) : (
          <CalendarView pieces={pieces} channels={channels} onEdit={(p) => setEditingPiece(p)} />
        )
      )}

      {!loading && tab === 'channels' && (
        channels.length === 0 ? (
          <CoachFlow
            flow={CONTENT_SETUP_FLOW}
            onComplete={handleContentSetupFinish}
            onClose={() => setEditingChannel('new')}
            inline
            skipLabel="Skip — open empty form"
          />
        ) : (
          <ChannelsList
            channels={channels}
            pieces={pieces}
            onEdit={(c) => setEditingChannel(c)}
            onNew={() => setEditingChannel('new')}
          />
        )
      )}

      {!loading && tab === 'brands' && (
        brands.length === 0 ? (
          // Empty → INLINE 6-step Brand wizard (bundle setup mode pattern).
          // Page tabs stay visible above so the user can bail at any time.
          <CoachFlow
            flow={BRAND_CREATION_FLOW}
            onComplete={handleBrandCoachFinish}
            onClose={() => setEditingBrand('new' as any)}
            inline
            skipLabel="Skip — open empty form"
          />
        ) : (
          <BrandsGrid
            brands={brands}
            onOpen={(b) => setEditingBrand(b)}
            onNew={() => setEditingBrand('new')}
          />
        )
      )}

      {!loading && tab === 'studio' && (
        // Bundle's 3-pane Content Studio: Brand kit + channel + format + ICP +
        // briefing on the left, Pinterest/Trained/Upload visual library + composed
        // prompt in the middle, V1/V2/V3 preview with mockup + copy on the right.
        // Source: livv-update / livv-os-content.jsx :: ContentStudio
        <BundleContentStudio brands={brands} channels={channels} icps={icps} />
      )}

      <AnimatePresence>
        {editingPiece && (
          <PieceModal
            value={editingPiece === 'new' ? null : editingPiece}
            channels={channels}
            icps={icps}
            pieces={pieces}
            onClose={() => setEditingPiece(null)}
            onSaved={() => { setEditingPiece(null); refetch(); }}
          />
        )}
        {editingChannel && (
          <ChannelModal
            value={editingChannel === 'new' ? null : editingChannel}
            onClose={() => setEditingChannel(null)}
            onSaved={() => { setEditingChannel(null); refetch(); }}
          />
        )}
      </AnimatePresence>

      {/* Brand detail slide-over — opens for both "new" and existing brands. */}
      {editingBrand !== null && (
        <BrandDetailPanel
          brand={editingBrand === 'new' ? null : editingBrand}
          isOpen
          onClose={() => setEditingBrand(null)}
        />
      )}

      {/* Brand CoachFlow — 6-step guided wizard (identity/visual/voice/rules/refs/preview).
         On finish, inserts a row in brand_kits with the compiled brand_prompt. */}
      {brandCoachOpen && (
        <CoachFlow
          flow={BRAND_CREATION_FLOW}
          onComplete={handleBrandCoachFinish}
          onClose={() => !brandCoachSaving && setBrandCoachOpen(false)}
        />
      )}
    </div>
  );
};

// ── Brands grid ───────────────────────────────────────────────────
const BrandsGrid: React.FC<{ brands: Brand[]; onOpen: (b: Brand) => void; onNew: () => void }> = ({ brands, onOpen, onNew }) => {
  if (brands.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 p-10 text-center">
        <Icons.Sparkles size={20} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-2" />
        <div className="text-[13px] font-medium text-zinc-700 dark:text-zinc-200">No brand kits yet</div>
        <p className="text-[11.5px] text-zinc-500 mt-1">A brand kit captures voice, palette, audience, and content rules so the AI generates on-brand content.</p>
        <button onClick={onNew} className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-semibold rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900">
          <Icons.Plus size={11} /> Create your first brand
        </button>
      </div>
    );
  }
  return (
    <div className="bdl-brand-grid">
      {brands.map((b, idx) => {
        const palette = [
          (b as any).palette?.[0] || b.color_primary,
          (b as any).palette?.[1] || b.color_secondary,
          (b as any).palette?.[2] || b.color_accent,
          (b as any).palette?.[3] || b.color_background,
          (b as any).palette?.[4] || b.color_text,
        ].filter(Boolean);
        const initials = b.name.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
        const brandColor = b.color_primary || palette[0] || '#18181b';
        const textColor = b.color_text || (brandColor === '#18181b' ? '#fafafa' : '#18181b');
        const isOwn = (b as any).is_own === true; // marks the agency's own brand
        return (
          <motion.button
            key={b.id}
            onClick={() => onOpen(b)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING_ENTER, delay: idx * 0.03 }}
            className="bdl-brand-card"
            style={{ ['--brand-color' as any]: brandColor }}
          >
            <div className="bdl-brand-card-head">
              <div className="bdl-brand-logo" style={{ background: brandColor, color: textColor }}>
                {b.logo_url ? (
                  <img src={b.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 'inherit' }} />
                ) : initials}
                {isOwn && <span className="bdl-brand-own-dot" />}
              </div>
              <div className="bdl-brand-meta">
                <h3>{b.name}</h3>
                <div className="bdl-brand-industry">{b.industry || (b as any).slug || '—'}</div>
              </div>
              <span className={`bdl-brand-status ${b.status}`}>{b.status}</span>
            </div>

            {(b.tagline || b.description || (b as any).about) && (
              <p className="bdl-brand-tagline">
                {b.tagline || b.description || (b as any).about}
              </p>
            )}

            {palette.length > 0 && (
              <div className="bdl-brand-palette">
                {palette.slice(0, 6).map((c, i) => (
                  <span key={i} className="bdl-brand-swatch" style={{ background: c as string }} />
                ))}
              </div>
            )}

            <div className="bdl-brand-foot">
              <span>
                {palette.length} colors · {(b as any).typography_mood || 'editorial'}
              </span>
              {b.brand_prompt && (
                <span style={{ color: '#4d6b4d', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Icons.Sparkles size={10} />
                  <strong>trained</strong>
                </span>
              )}
            </div>
          </motion.button>
        );
      })}

      {/* + New brand dashed card */}
      <motion.button
        onClick={onNew}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING_ENTER, delay: brands.length * 0.03 }}
        className="bdl-brand-add"
      >
        <span className="bdl-brand-add-ic"><Icons.Plus size={18} /></span>
        <span style={{ fontSize: 13, fontWeight: 500 }}>New brand kit</span>
        <span style={{ fontSize: 11, color: '#a1a1aa', textAlign: 'center', maxWidth: 220 }}>
          Capture voice, palette, audience, content rules. AI uses this to stay on-brand.
        </span>
      </motion.button>
    </div>
  );
};

// ── Studio panel ──────────────────────────────────────────────────
// Split layout: brand + channel + content_type + ICP + briefing on the
// left, AI-generated variations on the right.
const StudioPanel: React.FC<{ brands: Brand[]; channels: Channel[]; icps: ICP[] }> = ({ brands, channels, icps }) => {
  const [brandId, setBrandId] = useState<string>('');
  const [channelKey, setChannelKey] = useState<string>('linkedin');
  const [contentType, setContentType] = useState<string>('post');
  const [icpId, setIcpId] = useState<string>('');
  const [briefing, setBriefing] = useState('');
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(false);
  const [variations, setVariations] = useState<ContentVariation[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // Default brand selection — first active brand if any.
  useEffect(() => {
    if (!brandId && brands.length > 0) {
      const active = brands.find(b => b.status === 'active') || brands[0];
      setBrandId(active.id);
    }
  }, [brands, brandId]);

  const selectedBrand = brands.find(b => b.id === brandId);
  const selectedIcp = icps.find(i => i.id === icpId);

  const handleGenerate = async () => {
    if (!selectedBrand || !briefing.trim()) return;
    setLoading(true);
    setErr(null);
    try {
      const result = await generateContent({
        brand_id: selectedBrand.id,
        brand_prompt: selectedBrand.brand_prompt,
        channel: channelKey,
        content_type: contentType,
        icp_summary: selectedIcp?.name || null,
        briefing: briefing.trim(),
        reference: reference.trim() || null,
      });
      setVariations(result.variations || []);
    } catch (e) {
      setErr((e as Error).message);
      errorLogger.warn('generate content failed', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5">
      {/* Left — controls */}
      <div className="space-y-3">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3">
          <div>
            <label className="block font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-400 mb-1">Brand</label>
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="w-full px-2.5 py-1.5 text-[12.5px] bg-transparent border border-zinc-200 dark:border-zinc-700/60 rounded-md outline-none focus:border-zinc-400 text-zinc-800 dark:text-zinc-200">
              {brands.length === 0 && <option value="">No brands yet — create one in the Brands tab</option>}
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}{!b.brand_prompt ? ' (not trained)' : ''}</option>)}
            </select>
            {selectedBrand && !selectedBrand.brand_prompt && (
              <p className="text-[10.5px] text-amber-600 dark:text-amber-400 mt-1">⚠ This brand isn't trained yet. Open it in Brands and click <strong>Train style</strong> for best results.</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-400 mb-1">Channel</label>
              <select value={channelKey} onChange={(e) => setChannelKey(e.target.value)} className="w-full px-2.5 py-1.5 text-[12.5px] bg-transparent border border-zinc-200 dark:border-zinc-700/60 rounded-md outline-none">
                <option value="linkedin">LinkedIn</option>
                <option value="instagram">Instagram</option>
                <option value="twitter">X / Twitter</option>
                <option value="youtube">YouTube</option>
                <option value="tiktok">TikTok</option>
                <option value="email">Email</option>
              </select>
            </div>
            <div>
              <label className="block font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-400 mb-1">Format</label>
              <select value={contentType} onChange={(e) => setContentType(e.target.value)} className="w-full px-2.5 py-1.5 text-[12.5px] bg-transparent border border-zinc-200 dark:border-zinc-700/60 rounded-md outline-none">
                <option value="post">Post</option>
                <option value="thread">Thread</option>
                <option value="reel">Reel</option>
                <option value="story">Story</option>
                <option value="ad">Ad</option>
                <option value="email">Email</option>
                <option value="video">Video</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-400 mb-1">Target ICP (optional)</label>
            <select value={icpId} onChange={(e) => setIcpId(e.target.value)} className="w-full px-2.5 py-1.5 text-[12.5px] bg-transparent border border-zinc-200 dark:border-zinc-700/60 rounded-md outline-none">
              <option value="">— Any —</option>
              {icps.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-400 mb-1">Briefing</label>
            <textarea
              value={briefing}
              onChange={(e) => setBriefing(e.target.value)}
              rows={5}
              placeholder="What do you want to say? Topic, angle, hook ideas, must-include facts…"
              className="w-full px-2.5 py-1.5 text-[12.5px] bg-transparent border border-zinc-200 dark:border-zinc-700/60 rounded-md outline-none focus:border-zinc-400 resize-y text-zinc-800 dark:text-zinc-200"
            />
          </div>
          <div>
            <label className="block font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-400 mb-1">Reference (optional)</label>
            <textarea
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              rows={2}
              placeholder="A post / ad / line that has the energy you want"
              className="w-full px-2.5 py-1.5 text-[12.5px] bg-transparent border border-zinc-200 dark:border-zinc-700/60 rounded-md outline-none resize-y text-zinc-800 dark:text-zinc-200"
            />
          </div>
          <motion.button
            type="button"
            onClick={handleGenerate}
            disabled={!selectedBrand || !briefing.trim() || loading}
            whileTap={{ scale: 0.97, transition: SPRING_TAP }}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[12.5px] font-semibold disabled:opacity-40"
          >
            <Icons.Sparkles size={12} />
            {loading ? 'Generating…' : 'Generate 3 variations'}
          </motion.button>
          {err && <div className="text-[11px] text-rose-600 dark:text-rose-400">{err}</div>}
        </div>
      </div>

      {/* Right — preview */}
      <div className="space-y-3">
        {variations.length === 0 && !loading && (
          <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 p-10 text-center">
            <Icons.Edit size={20} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-2" />
            <div className="text-[13px] font-medium text-zinc-700 dark:text-zinc-200">Studio is ready</div>
            <p className="text-[11.5px] text-zinc-500 mt-1">Pick a brand, a channel, write your briefing, and click Generate. You'll get 3 on-brand variations.</p>
          </div>
        )}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Icons.Loader size={20} className="animate-spin text-zinc-400" />
          </div>
        )}
        {variations.map((v, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING_ENTER, delay: i * 0.05 }}
            className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-zinc-400">Variation {i + 1}</span>
              {v.cta && <span className="ml-auto font-mono text-[9.5px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400">{v.cta}</span>}
            </div>
            {v.headline && <div className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100 leading-snug mb-1.5">{v.headline}</div>}
            <p className="text-[12.5px] text-zinc-700 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">{v.body}</p>
            {v.hashtags && v.hashtags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {v.hashtags.map((h, j) => <span key={j} className="text-[10.5px] text-zinc-500 dark:text-zinc-400">{h}</span>)}
              </div>
            )}
            {v.visual_brief && (
              <div className="mt-2 text-[10.5px] italic text-zinc-500 dark:text-zinc-400 border-t border-zinc-100 dark:border-zinc-800 pt-2">
                <Icons.Image size={10} className="inline mr-1" /> {v.visual_brief}
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
};

// ── Pipeline (kanban) ─────────────────────────────────────────────
const Pipeline: React.FC<{
  grouped: Record<string, Piece[]>;
  channels: Channel[];
  icps: ICP[];
  onEdit: (p: Piece) => void;
  onMoveStatus: (p: Piece, s: Piece['status']) => void;
  onNew: () => void;
}> = ({ grouped, channels, icps, onEdit, onMoveStatus, onNew }) => {
  const totalPieces = STATUS_FLOW.reduce((s, st) => s + (grouped[st.id]?.length || 0), 0);
  if (totalPieces === 0) {
    return (
      <EmptyState
        icon="List"
        title="No content pieces yet"
        body="The pipeline tracks every piece through idea → drafted → review → scheduled → published. Start with an idea — even just a title is enough."
        cta="Add your first idea"
        onClick={onNew}
      />
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
      {STATUS_FLOW.map(s => (
        <PipelineColumn
          key={s.id}
          status={s}
          pieces={grouped[s.id] || []}
          channels={channels}
          icps={icps}
          onEdit={onEdit}
          onMoveStatus={onMoveStatus}
        />
      ))}
    </div>
  );
};

const PipelineColumn: React.FC<{
  status: typeof STATUS_FLOW[number];
  pieces: Piece[];
  channels: Channel[];
  icps: ICP[];
  onEdit: (p: Piece) => void;
  onMoveStatus: (p: Piece, s: Piece['status']) => void;
}> = ({ status, pieces, channels, icps, onEdit, onMoveStatus }) => {
  const channelMap = useMemo(() => new Map(channels.map(c => [c.id, c])), [channels]);
  const icpMap = useMemo(() => new Map(icps.map(i => [i.id, i])), [icps]);
  // Statuses immediately adjacent in the flow — surfaced as one-tap
  // chips on each card so the user can advance without opening the
  // edit modal. Forward arrow on the right, backward arrow on the left.
  const currentIdx = STATUS_FLOW.findIndex(s => s.id === status.id);
  const nextStatus = STATUS_FLOW[currentIdx + 1];
  const prevStatus = STATUS_FLOW[currentIdx - 1];
  return (
    <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-900/40 flex flex-col">
      <header className={`px-3 py-2 rounded-t-xl ${status.tone} flex items-center gap-2`}>
        <span className="text-[11px] font-bold uppercase tracking-wider">{status.label}</span>
        <span className="ml-auto text-[10px] font-mono tabular-nums opacity-70">{pieces.length}</span>
      </header>
      <div className="flex-1 p-2 space-y-1.5 min-h-[120px]">
        {pieces.length === 0 ? (
          <div className="text-[10.5px] text-zinc-400 italic text-center py-3">empty</div>
        ) : (
          <AnimatePresence initial={false}>
            {pieces.slice(0, 20).map((p, idx) => {
              const ch = p.channel_id ? channelMap.get(p.channel_id) : null;
              const icp = p.target_icp_id ? icpMap.get(p.target_icp_id) : null;
              return (
                <motion.div
                  key={p.id}
                  layout
                  initial={{ opacity: 0, y: 4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
                  transition={{ ...SPRING_ENTER, delay: idx < 8 ? idx * 0.02 : 0 }}
                  className="group rounded-lg border border-zinc-200/70 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 cursor-pointer transition-colors"
                  onClick={() => onEdit(p)}
                >
                  <div className="flex items-start gap-1.5 mb-1">
                    <span className="text-[9px] font-mono uppercase text-zinc-400 tracking-wider mt-0.5">{p.content_type}</span>
                  </div>
                  <div className="text-[12px] font-medium text-zinc-900 dark:text-zinc-100 line-clamp-2 leading-snug">{p.title}</div>
                  <div className="flex flex-wrap items-center gap-1 mt-1.5 text-[10px] text-zinc-500">
                    {ch && (
                      <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                        {ch.name}
                      </span>
                    )}
                    {icp && (
                      <span className="inline-flex items-center gap-0.5 truncate max-w-[100px]" title={icp.name}>
                        <Icons.Target size={9} />
                        {icp.name}
                      </span>
                    )}
                    {p.scheduled_date && (
                      <span className="inline-flex items-center gap-0.5 ml-auto font-mono tabular-nums">
                        <Icons.Calendar size={9} />
                        {p.scheduled_date.slice(5)}
                      </span>
                    )}
                  </div>
                  {/* Quick advance — show fwd/back arrows on hover */}
                  <div className="flex items-center gap-0.5 mt-1.5 pt-1.5 border-t border-zinc-100 dark:border-zinc-800/60 opacity-0 group-hover:opacity-100 transition-opacity">
                    {prevStatus && (
                      <button
                        onClick={e => { e.stopPropagation(); onMoveStatus(p, prevStatus.id); }}
                        className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        title={`← ${prevStatus.label}`}
                      >
                        <Icons.ArrowLeft size={10} />
                      </button>
                    )}
                    {nextStatus && (
                      <button
                        onClick={e => { e.stopPropagation(); onMoveStatus(p, nextStatus.id); }}
                        className="ml-auto p-1 rounded text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 inline-flex items-center gap-0.5"
                        title={`${nextStatus.label} →`}
                      >
                        <span className="text-[9.5px] font-semibold">{nextStatus.label}</span>
                        <Icons.ArrowLeft size={10} className="rotate-180" />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};

// ── Calendar view (month grid) ────────────────────────────────────
const CalendarView: React.FC<{
  pieces: Piece[];
  channels: Channel[];
  onEdit: (p: Piece) => void;
}> = ({ pieces, channels, onEdit }) => {
  // Anchor the grid to the current month. Could be made navigable
  // later (prev/next arrows) — kept simple for v1.
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startDay = firstOfMonth.getDay(); // 0 = Sun
  // 6 rows × 7 cols = 42 cells. Start from the Sunday before the
  // 1st of month so the calendar is always rectangular.
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(year, month, 1 - startDay + i);
    cells.push(d);
  }
  const channelMap = useMemo(() => new Map(channels.map(c => [c.id, c])), [channels]);

  // Bucket pieces by ISO date (scheduled_date OR published_date)
  const piecesByDate = useMemo(() => {
    const m = new Map<string, Piece[]>();
    for (const p of pieces) {
      const key = p.scheduled_date || p.published_date;
      if (!key) continue;
      const cur = m.get(key) || [];
      cur.push(p);
      m.set(key, cur);
    }
    return m;
  }, [pieces]);

  const monthLabel = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">{monthLabel}</h2>
        <div className="text-[10px] text-zinc-400">
          Scheduled + published content. Click any piece to edit.
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 text-center">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          const iso = d.toISOString().slice(0, 10);
          const inMonth = d.getMonth() === month;
          const isToday = iso === today.toISOString().slice(0, 10);
          const dayPieces = piecesByDate.get(iso) || [];
          return (
            <div
              key={i}
              className={`min-h-[88px] rounded-md border p-1.5 text-[10px] transition-colors ${
                inMonth
                  ? 'bg-white dark:bg-zinc-900 border-zinc-200/70 dark:border-zinc-800'
                  : 'bg-zinc-50/40 dark:bg-zinc-900/40 border-zinc-100 dark:border-zinc-800/60'
              }`}
            >
              <div className={`text-[10px] font-mono tabular-nums ${
                isToday ? 'text-violet-600 dark:text-violet-400 font-bold'
                : inMonth ? 'text-zinc-700 dark:text-zinc-300'
                : 'text-zinc-300 dark:text-zinc-700'
              }`}>
                {d.getDate()}
              </div>
              <div className="space-y-0.5 mt-1">
                {dayPieces.slice(0, 3).map(p => {
                  const ch = p.channel_id ? channelMap.get(p.channel_id) : null;
                  return (
                    <button
                      key={p.id}
                      onClick={() => onEdit(p)}
                      className={`w-full text-left text-[9.5px] px-1 py-0.5 rounded truncate ${
                        p.status === 'published'
                          ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/20'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                      }`}
                      title={`${p.title}${ch ? ' · ' + ch.name : ''}`}
                    >
                      {p.title}
                    </button>
                  );
                })}
                {dayPieces.length > 3 && (
                  <div className="text-[9px] text-zinc-400 pl-1">+{dayPieces.length - 3}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Channels list ─────────────────────────────────────────────────
const ChannelsList: React.FC<{
  channels: Channel[];
  pieces: Piece[];
  onEdit: (c: Channel) => void;
  onNew: () => void;
}> = ({ channels, pieces, onEdit, onNew }) => {
  if (channels.length === 0) {
    return (
      <EmptyState
        icon="Globe"
        title="No channels yet"
        body="Channels are where you publish: LinkedIn, Instagram, YouTube, newsletter, etc. Each has a target frequency — the engine uses these to track if you're keeping up."
        cta="Add your first channel"
        onClick={onNew}
      />
    );
  }
  // Compute "posts this week" per channel for frequency compliance
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const postsThisWeek: Record<string, number> = {};
  for (const p of pieces) {
    if (!p.channel_id) continue;
    if (p.status !== 'published') continue;
    if (!p.published_date || p.published_date < weekAgo) continue;
    postsThisWeek[p.channel_id] = (postsThisWeek[p.channel_id] || 0) + 1;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {channels.map((c, idx) => {
        const thisWeek = postsThisWeek[c.id] || 0;
        const target = c.frequency_posts_per_week || 0;
        const onTrack = target === 0 || thisWeek >= target;
        return (
          <motion.button
            key={c.id}
            onClick={() => onEdit(c)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING_ENTER, delay: idx * 0.03 }}
            whileTap={{ scale: 0.98, transition: SPRING_TAP }}
            whileHover={{ y: -2, transition: SPRING_TAP }}
            className="text-left p-4 rounded-xl border border-zinc-200/70 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900 transition-colors"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <h3 className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">{c.name}</h3>
                <div className="text-[10px] text-zinc-400 font-mono uppercase mt-0.5">{c.platform}</div>
              </div>
              <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${PRIORITY_TONE[c.priority]}`}>
                {c.priority}
              </span>
            </div>
            {c.target_audience && (
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5">
                For: {c.target_audience}
              </div>
            )}
            {target > 0 && (
              <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/60">
                <div className="flex items-center justify-between text-[10.5px]">
                  <span className="text-zinc-500 dark:text-zinc-400">This week</span>
                  <span className={`font-semibold tabular-nums ${onTrack ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {thisWeek} / {target}
                  </span>
                </div>
                <div className="h-1 rounded-full bg-zinc-100 dark:bg-zinc-800 mt-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${onTrack ? 'bg-emerald-500' : 'bg-rose-500'}`}
                    style={{ width: `${Math.min(100, (thisWeek / target) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </motion.button>
        );
      })}
    </div>
  );
};

// ── Empty state (shared) ──────────────────────────────────────────
const EmptyState: React.FC<{ icon: string; title: string; body: string; cta: string; onClick: () => void }> = ({
  icon, title, body, cta, onClick,
}) => {
  const IconCmp = (Icons as any)[icon] || Icons.Sparkles;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_ENTER}
      className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-700 p-12 text-center max-w-xl mx-auto"
    >
      <IconCmp size={32} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-3" />
      <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-200">{title}</h3>
      <p className="text-[12.5px] text-zinc-500 dark:text-zinc-400 mt-2 max-w-md mx-auto">{body}</p>
      <motion.button
        onClick={onClick}
        whileTap={{ scale: 0.97, transition: SPRING_TAP }}
        whileHover={{ y: -1, transition: SPRING_TAP }}
        className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[12px] font-semibold hover:opacity-90 transition-opacity"
      >
        <Icons.Plus size={12} />
        {cta}
      </motion.button>
    </motion.div>
  );
};

// ── Shared modal shell (mirrored from StrategyHub for now) ───────
const inputClass =
  'w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-[12.5px] text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none';
const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block">
    <div className="flex items-baseline gap-2 mb-1.5">
      <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">{label}</span>
      {hint && <span className="text-[10px] text-zinc-400">{hint}</span>}
    </div>
    {children}
  </label>
);
const splitList = (s: string): string[] => s.split(',').map(x => x.trim()).filter(Boolean);

const ModalShell: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }> = ({ title, onClose, children, footer }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.18 }}
    onClick={onClose}
    className="fixed inset-0 z-[70] bg-zinc-900/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
  >
    <motion.div
      onClick={e => e.stopPropagation()}
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
      transition={SPRING_ENTER}
      className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
        <button onClick={onClose} className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
          <Icons.X size={14} />
        </button>
      </div>
      <div className="px-5 py-4 max-h-[60vh] overflow-y-auto space-y-4">{children}</div>
      <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-end gap-2">{footer}</div>
    </motion.div>
  </motion.div>
);

// ── Piece modal ───────────────────────────────────────────────────
const PieceModal: React.FC<{
  value: Piece | null;
  channels: Channel[];
  icps: ICP[];
  pieces: Piece[];
  onClose: () => void;
  onSaved: () => void;
}> = ({ value, channels, icps, pieces, onClose, onSaved }) => {
  const { currentTenant } = useTenant();
  const [form, setForm] = useState<typeof EMPTY_PIECE>({
    ...EMPTY_PIECE,
    ...(value ? {
      title: value.title,
      channel_id: value.channel_id,
      content_type: value.content_type,
      status: value.status,
      target_icp_id: value.target_icp_id,
      body: value.body,
      media_urls: value.media_urls,
      scheduled_date: value.scheduled_date,
      published_date: value.published_date,
      published_url: value.published_url,
      source_project_id: value.source_project_id,
      repurposed_from: value.repurposed_from,
      engagement_metrics: value.engagement_metrics,
      notes: value.notes,
      assigned_to: value.assigned_to,
    } : {}),
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!currentTenant?.id) return;
    if (!form.title.trim()) { setError('Title is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      if (value) {
        const { error: err } = await supabase.from('content_pieces').update(form).eq('id', value.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('content_pieces').insert({ ...form, tenant_id: currentTenant.id });
        if (err) throw err;
      }
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!value || !confirm(`Delete piece "${value.title}"?`)) return;
    setDeleting(true);
    try {
      const { error: err } = await supabase.from('content_pieces').delete().eq('id', value.id);
      if (err) throw err;
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ModalShell
      title={value ? `Edit piece — ${value.title}` : 'New content piece'}
      onClose={onClose}
      footer={
        <>
          {value && (
            <button onClick={handleDelete} disabled={deleting || saving} className="mr-auto px-3 py-1.5 text-[11.5px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg disabled:opacity-40 transition-colors">{deleting ? 'Deleting…' : 'Delete'}</button>
          )}
          <button onClick={onClose} className="px-3 py-1.5 text-[11.5px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-[11.5px] font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg disabled:opacity-50 transition-colors inline-flex items-center gap-1.5">
            {saving ? <><Icons.Loader size={12} className="animate-spin" /> Saving…</> : <><Icons.Save size={12} /> Save</>}
          </button>
        </>
      }
    >
      {error && <div className="p-2 rounded-md bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 text-[11px]">{error}</div>}
      <Field label="Title">
        <input className={inputClass} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Case study: How we deployed Sunnyside in 14 days" />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Type">
          <select className={inputClass} value={form.content_type} onChange={e => setForm(f => ({ ...f, content_type: e.target.value }))}>
            {['post','carousel','reel','video','article','case_study','loom'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className={inputClass} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Piece['status'] }))}>
            {STATUS_FLOW.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Channel">
          <select className={inputClass} value={form.channel_id || ''} onChange={e => setForm(f => ({ ...f, channel_id: e.target.value || null }))}>
            <option value="">— None —</option>
            {channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Target ICP">
          <select className={inputClass} value={form.target_icp_id || ''} onChange={e => setForm(f => ({ ...f, target_icp_id: e.target.value || null }))}>
            <option value="">— None —</option>
            {icps.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </Field>
        <Field label="Repurposed from">
          <select className={inputClass} value={form.repurposed_from || ''} onChange={e => setForm(f => ({ ...f, repurposed_from: e.target.value || null }))}>
            <option value="">— None —</option>
            {pieces.filter(p => p.id !== value?.id).map(p => (
              <option key={p.id} value={p.id}>{p.title.slice(0, 50)}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Scheduled date">
          <input type="date" className={inputClass} value={form.scheduled_date || ''} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value || null }))} />
        </Field>
        <Field label="Published date">
          <input type="date" className={inputClass} value={form.published_date || ''} onChange={e => setForm(f => ({ ...f, published_date: e.target.value || null }))} />
        </Field>
      </div>
      <Field label="Body / copy">
        <textarea rows={5} className={inputClass} value={form.body || ''} onChange={e => setForm(f => ({ ...f, body: e.target.value || null }))} placeholder="Hook in the first line. Then the meat." />
      </Field>
      <Field label="Published URL">
        <input className={inputClass} value={form.published_url || ''} onChange={e => setForm(f => ({ ...f, published_url: e.target.value || null }))} placeholder="https://linkedin.com/posts/..." />
      </Field>
      <Field label="Notes">
        <textarea rows={2} className={inputClass} value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value || null }))} />
      </Field>
    </ModalShell>
  );
};

// ── Channel modal ─────────────────────────────────────────────────
const ChannelModal: React.FC<{ value: Channel | null; onClose: () => void; onSaved: () => void }> = ({ value, onClose, onSaved }) => {
  const { currentTenant } = useTenant();
  const [form, setForm] = useState<typeof EMPTY_CHANNEL>({
    ...EMPTY_CHANNEL,
    ...(value ? {
      name: value.name,
      platform: value.platform,
      priority: value.priority,
      target_audience: value.target_audience,
      tone: value.tone,
      format_types: value.format_types,
      frequency_target: value.frequency_target,
      frequency_posts_per_week: value.frequency_posts_per_week,
      status: value.status,
    } : {}),
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!currentTenant?.id) return;
    if (!form.name.trim() || !form.platform.trim()) { setError('Name + platform required.'); return; }
    setSaving(true);
    setError(null);
    try {
      if (value) {
        const { error: err } = await supabase.from('content_channels').update(form).eq('id', value.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('content_channels').insert({ ...form, tenant_id: currentTenant.id });
        if (err) throw err;
      }
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!value || !confirm(`Delete channel "${value.name}"? Pieces linked to it will lose the link.`)) return;
    setDeleting(true);
    try {
      const { error: err } = await supabase.from('content_channels').delete().eq('id', value.id);
      if (err) throw err;
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ModalShell
      title={value ? `Edit channel — ${value.name}` : 'New channel'}
      onClose={onClose}
      footer={
        <>
          {value && (
            <button onClick={handleDelete} disabled={deleting || saving} className="mr-auto px-3 py-1.5 text-[11.5px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg disabled:opacity-40 transition-colors">{deleting ? 'Deleting…' : 'Delete'}</button>
          )}
          <button onClick={onClose} className="px-3 py-1.5 text-[11.5px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-[11.5px] font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg disabled:opacity-50 transition-colors inline-flex items-center gap-1.5">
            {saving ? <><Icons.Loader size={12} className="animate-spin" /> Saving…</> : <><Icons.Save size={12} /> Save</>}
          </button>
        </>
      }
    >
      {error && <div className="p-2 rounded-md bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 text-[11px]">{error}</div>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name">
          <input className={inputClass} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="LIVV LinkedIn" />
        </Field>
        <Field label="Platform">
          <input className={inputClass} value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value.toLowerCase() }))} placeholder="linkedin" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Priority">
          <select className={inputClass} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as Channel['priority'] }))}>
            <option value="principal">principal</option>
            <option value="secondary">secondary</option>
            <option value="long-term">long-term</option>
            <option value="passive">passive</option>
          </select>
        </Field>
        <Field label="Status">
          <select className={inputClass} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Channel['status'] }))}>
            <option value="active">active</option>
            <option value="paused">paused</option>
            <option value="archived">archived</option>
          </select>
        </Field>
      </div>
      <Field label="Target audience">
        <input className={inputClass} value={form.target_audience || ''} onChange={e => setForm(f => ({ ...f, target_audience: e.target.value || null }))} placeholder="Agency founders + tech CMOs" />
      </Field>
      <Field label="Tone">
        <textarea rows={2} className={inputClass} value={form.tone || ''} onChange={e => setForm(f => ({ ...f, tone: e.target.value || null }))} placeholder="Direct, confident, no jargon. Show > tell." />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Frequency target" hint="Human-readable">
          <input className={inputClass} value={form.frequency_target || ''} onChange={e => setForm(f => ({ ...f, frequency_target: e.target.value || null }))} placeholder="4-5 posts/week" />
        </Field>
        <Field label="Posts per week" hint="Numeric — used for compliance tracking">
          <input type="number" className={inputClass} value={form.frequency_posts_per_week ?? ''} onChange={e => setForm(f => ({ ...f, frequency_posts_per_week: e.target.value === '' ? null : Number(e.target.value) }))} placeholder="5" />
        </Field>
      </div>
      <Field label="Format types" hint="Comma-separated: post, carousel, reel, video">
        <input className={inputClass} value={form.format_types.join(', ')} onChange={e => setForm(f => ({ ...f, format_types: splitList(e.target.value) }))} placeholder="post, carousel, video" />
      </Field>
    </ModalShell>
  );
};
