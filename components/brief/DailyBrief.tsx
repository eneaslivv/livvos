/**
 * DailyBrief — the structured AI-driven summary at the top of the
 * Brief chat column. Replaces the old simple greeting block.
 *
 * Flow on mount:
 *   1. Load brief_preferences for the user (or fall back to default).
 *   2. Run the enabled category loaders in parallel.
 *   3. If ai_synthesis_enabled, call synthesizeBrief and render the
 *      headline + narrative + next_step at top.
 *   4. Render one card per category with its highlights + bullets +
 *      AI per-card gloss (when present).
 *   5. Settings gear opens BriefSettings to toggle which categories
 *      appear + the synthesis tone.
 *
 * Auto-refresh: on mount + when the user clicks "Refresh". No
 * polling — the brief is meant for "I just opened the page" reads;
 * action chips below trigger ad-hoc questions.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../ui/Icons';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../context/TenantContext';
import { useAuth } from '../../hooks/useAuth';
import { errorLogger } from '../../lib/errorLogger';
import { SPRING_ENTER, SPRING_TAP } from '../../lib/ui/motion';
import { CATEGORY_REGISTRY, loadEnabledCategories, type CategoryData, type CategoryId, type CategoryMeta } from '../../lib/brief/data-loaders';
import { synthesizeBrief, buildStrategyContext, type BriefSynthesis } from '../../lib/brief/synthesize';
import { getUserProfile } from '../../lib/agents';
import { BriefSettings } from './BriefSettings';

const DEFAULT_ENABLED: CategoryId[] = ['today_load','cashflow','pipeline','content','inbox','team_kpis','strategy','upcoming'];

// ── Day-keyed cache so reopening the page doesn't re-fetch + re-
//    synthesize. The synthesis Gemini call is the slow piece (2-5s);
//    the load itself fans out a handful of Supabase queries. With this
//    cache the page paints from cache instantly and only refreshes
//    silently in the background (skipping the synthesis call if the
//    payload didn't change). Cache is scoped to the calendar day so
//    morning vs afternoon-by-default get distinct snapshots without
//    bookkeeping.
const CACHE_VERSION = 'v1';
const cacheKey = (userId: string) =>
  `brief_cache:${CACHE_VERSION}:${userId}:${new Date().toISOString().slice(0, 10)}`;

type CachedBrief = {
  cards: CategoryData[];
  synthesis: BriefSynthesis | null;
  ts: number;
};

const readBriefCache = (userId: string): CachedBrief | null => {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedBrief;
    if (!parsed || !Array.isArray(parsed.cards)) return null;
    return parsed;
  } catch { return null; }
};

const writeBriefCache = (userId: string, payload: Omit<CachedBrief, 'ts'>) => {
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify({ ...payload, ts: Date.now() }));
    // Best-effort GC of older day-keys for this user (one-day-of-staleness max).
    const prefix = `brief_cache:${CACHE_VERSION}:${userId}:`;
    const todayKey = cacheKey(userId);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix) && k !== todayKey) localStorage.removeItem(k);
    }
  } catch { /* quota / private-mode */ }
};

// ── Weekly focus — dynamic line derived from the brief's category
//    data. Replaces the old static motivational quotes with a real
//    snapshot of what needs attention this week. Falls back to a
//    simple greeting when cards haven't loaded yet.
function buildWeeklyFocus(cards: CategoryData[]): string {
  const parts: string[] = [];

  for (const c of cards) {
    if (c.status === 'empty') continue;

    // Extract numeric highlights that signal load
    for (const h of c.highlights) {
      const v = typeof h.value === 'number' ? h.value : parseInt(String(h.value), 10);
      if (isNaN(v)) continue;
      const lo = h.label.toLowerCase();

      if (lo.includes('overdue') && v > 0) parts.push(`${v} overdue`);
      else if (lo.includes('due today') && v > 0) parts.push(`${v} due today`);
      else if (lo.includes('pending') && v > 0 && c.id === 'today_load') parts.push(`${v} pending tasks`);
      else if (lo.includes('hot') && v > 0) parts.push(`${v} hot leads`);
      else if ((lo.includes('warm') || lo.includes('open')) && v > 0 && c.id === 'pipeline') parts.push(`${v} deals in motion`);
      else if (lo.includes('unpaid') && v > 0) parts.push(`${v} unpaid invoices`);
      else if (lo.includes('meeting') && v > 0) parts.push(`${v} meetings today`);
      else if (lo.includes('unread') && v > 0) parts.push(`${v} unread`);
    }

    // Check bullets for actionable signals
    for (const b of c.bullets.slice(0, 3)) {
      const bl = b.toLowerCase();
      if (bl.includes('deadline') || bl.includes('vence')) {
        parts.push(b.length > 60 ? b.slice(0, 57) + '...' : b);
        break;
      }
    }
  }

  if (parts.length === 0) {
    const h = new Date().getHours();
    return h < 12 ? 'Buenos días — tu semana empieza limpia.' : h < 18 ? 'Tu tarde está libre de urgencias.' : 'Cerrando el día sin pendientes críticos.';
  }

  // Build a compact line: "3 overdue · 2 hot leads · 1 unpaid invoice"
  return parts.slice(0, 4).join(' · ');
}

interface Prefs {
  enabled_categories: CategoryId[];
  ai_synthesis_enabled: boolean;
  synthesis_tone: 'concise' | 'warm' | 'direct' | 'coaching';
  show_top_recommendation: boolean;
}

const DEFAULT_PREFS: Prefs = {
  enabled_categories: DEFAULT_ENABLED,
  ai_synthesis_enabled: true,
  synthesis_tone: 'concise',
  show_top_recommendation: true,
};

const TONE_TINT: Record<string, { card: string; pill: string }> = {
  rose:    { card: 'border-rose-200/60 dark:border-rose-500/30',         pill: 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300' },
  emerald: { card: 'border-emerald-200/60 dark:border-emerald-500/30',   pill: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  violet:  { card: 'border-violet-200/60 dark:border-violet-500/30',     pill: 'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300' },
  fuchsia: { card: 'border-fuchsia-200/60 dark:border-fuchsia-500/30',   pill: 'bg-fuchsia-50 dark:bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300' },
  amber:   { card: 'border-amber-200/60 dark:border-amber-500/30',       pill: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  blue:    { card: 'border-blue-200/60 dark:border-blue-500/30',         pill: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300' },
  indigo:  { card: 'border-indigo-200/60 dark:border-indigo-500/30',     pill: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' },
  zinc:    { card: 'border-zinc-200/70 dark:border-zinc-800',            pill: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300' },
};

const PILL_TONE: Record<string, string> = {
  rose:    'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300',
  amber:   'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300',
  emerald: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  violet:  'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300',
  indigo:  'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  zinc:    'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300',
};

interface DailyBriefProps {
  /** Allows the parent (Brief chat column) to surface a "What's next?"
   *  CTA that prefills the chat. Optional. */
  onAskFollowUp?: (prompt: string) => void;
  /** Click on any category card jumps to its owning page (e.g.
   *  Cashflow → /finance, Pipeline → /sales_pipeline). Without
   *  this, cards still render but become read-only. */
  onNavigate?: (page: string) => void;
}

export const DailyBrief: React.FC<DailyBriefProps> = ({ onAskFollowUp, onNavigate }) => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [cards, setCards] = useState<CategoryData[]>([]);
  const [synthesis, setSynthesis] = useState<BriefSynthesis | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Message detail panel — opens when clicking on an inbox item.
  const [previewItem, setPreviewItem] = useState<{ id: string; text: string; meta?: Record<string, any> } | null>(null);

  // Pull prefs (or seed defaults). Failing means we silently fall back.
  const loadPrefs = useCallback(async (): Promise<Prefs> => {
    if (!user?.id) return DEFAULT_PREFS;
    try {
      const { data } = await supabase.from('brief_preferences').select('*').eq('user_id', user.id).maybeSingle();
      if (data) {
        return {
          enabled_categories: (data.enabled_categories || DEFAULT_ENABLED) as CategoryId[],
          ai_synthesis_enabled: !!data.ai_synthesis_enabled,
          synthesis_tone: data.synthesis_tone || 'concise',
          show_top_recommendation: !!data.show_top_recommendation,
        };
      }
    } catch { /* fall through */ }
    return DEFAULT_PREFS;
  }, [user?.id]);

  // Build the strategy context block — used by the synthesis layer
  // to bias recommendations toward what the business actually cares
  // about, not just whatever data is loudest today.
  const loadStrategyContext = useCallback(async (): Promise<string | null> => {
    if (!currentTenant?.id) return null;
    try {
      const [icpRes, pkgRes, posRes] = await Promise.all([
        supabase.from('strategy_icps').select('name').eq('tenant_id', currentTenant.id).eq('status', 'active').limit(8),
        supabase.from('strategy_packages').select('name').eq('tenant_id', currentTenant.id).eq('status', 'active').limit(8),
        supabase.from('strategy_positioning').select('principle').eq('tenant_id', currentTenant.id).limit(5),
      ]);
      return buildStrategyContext({
        icpNames: (icpRes.data || []).map((r: any) => r.name),
        packageNames: (pkgRes.data || []).map((r: any) => r.name),
        positioningPrinciples: (posRes.data || []).map((r: any) => r.principle),
      });
    } catch { return null; }
  }, [currentTenant?.id]);

  // Full refresh: load cards + optionally synthesize. `silent` means
  // we already painted from cache — skip the spinner and only flip
  // the small "refreshing" pill so the UI doesn't flash on re-mounts.
  const refresh = useCallback(async (loadedPrefs?: Prefs, opts?: { silent?: boolean }) => {
    if (!currentTenant?.id || !user?.id) return;
    const usePrefs = loadedPrefs || prefs;
    setRefreshing(true);
    try {
      const ctx = { db: supabase as any, tenantId: currentTenant.id, userId: user.id, now: new Date() };
      const loadedCards = await loadEnabledCategories(ctx, usePrefs.enabled_categories);
      setCards(loadedCards);
      // Synthesize separately — UI shows cards immediately while AI churns.
      let synthResult: BriefSynthesis | null = null;
      if (usePrefs.ai_synthesis_enabled && loadedCards.length > 0) {
        setSynthesizing(true);
        try {
          // Pull the user's first name + learned traits + strategy context in parallel.
          const [profile, strategyCtx] = await Promise.all([
            getUserProfile(supabase as any, { userId: user.id, tenantId: currentTenant.id }).catch(() => null),
            loadStrategyContext(),
          ]);
          const firstName = ((user as any)?.user_metadata?.name || (user as any)?.email || '').split(/[\s@]/)[0] || null;
          synthResult = await synthesizeBrief({
            cards: loadedCards,
            userName: firstName,
            tone: usePrefs.synthesis_tone,
            includeRecommendation: usePrefs.show_top_recommendation,
            learnedTraits: profile?.learned_traits || null,
            strategyContext: strategyCtx,
          });
          setSynthesis(synthResult);
        } finally {
          setSynthesizing(false);
        }
      } else {
        setSynthesis(null);
      }
      // Persist for next mount — avoids the "se recarga muchas veces"
      // feeling: re-opening the page paints from cache instantly.
      writeBriefCache(user.id, { cards: loadedCards, synthesis: synthResult });
    } catch (e) {
      errorLogger.warn('daily brief load failed', e);
    } finally {
      setRefreshing(false);
      setLoading(false);
      void opts; // silent flag is observed via initial loading state below
    }
  }, [currentTenant?.id, user?.id, prefs, loadStrategyContext]);

  // Initial mount: load prefs, then either paint from cache (instant)
  // and silently refresh, or block on a fresh fetch. We pass prefs
  // through to refresh() so it doesn't wait for the next render.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await loadPrefs();
      if (cancelled) return;
      setPrefs(p);
      // Paint from cache first — this is the difference between
      // "brief flickers on every navigation" and "brief is always
      // there." Cache is day-keyed so it's never more than a few
      // hours stale, and the background refresh fixes anything new.
      if (user?.id) {
        const cached = readBriefCache(user.id);
        if (cached) {
          setCards(cached.cards);
          setSynthesis(cached.synthesis);
          setLoading(false);
        }
      }
      refresh(p, { silent: true });
    })();
    return () => { cancelled = true; };
  }, [loadPrefs]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Settings save — persist + refresh with new prefs.
  const handlePrefsChange = async (next: Prefs) => {
    if (!user?.id || !currentTenant?.id) return;
    setPrefs(next);
    try {
      await supabase.from('brief_preferences').upsert({
        user_id: user.id,
        tenant_id: currentTenant.id,
        ...next,
      });
    } catch (e) {
      errorLogger.warn('save brief prefs failed', e);
    }
    setSettingsOpen(false);
    refresh(next);
  };

  // Order cards by the user's preference list (cards came back filtered
  // by it already; this enforces the order even if a loader resolved
  // out of order).
  const orderedCards = useMemo(() => {
    const idxOf = (id: CategoryId) => prefs.enabled_categories.indexOf(id);
    return [...cards].sort((a, b) => idxOf(a.id) - idxOf(b.id));
  }, [cards, prefs.enabled_categories]);

  const allEmpty = !loading && orderedCards.every(c => c.status === 'empty');
  const weeklyFocus = useMemo(() => buildWeeklyFocus(orderedCards), [orderedCards]);

  return (
    <div className="pb-3">
      {/* ── Sticky header ─────────────────────────────────────────
         Stays pinned at the top of the brief column while the user
         scrolls through cards or chat below it. Typography upgraded
         to match the design bundle: mono eyebrow with wider tracking,
         a gold pulse dot (livv-gold) that breathes, and the daily
         reflection rendered as an aphorism with a vertical gold
         gradient bar on the left (replaces the flat dot). Backdrop-
         blur so cards passing under it remain readable. */}
      <div className="sticky top-0 z-10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur border-b border-zinc-100 dark:border-zinc-800/60 px-5 pt-3 pb-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"
            style={{ boxShadow: '0 0 0 3px rgba(232, 188, 89, 0.18)' }}
          />
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">Today's brief</div>
          {synthesizing && (
            <span className="font-mono text-[9.5px] text-violet-500 inline-flex items-center gap-1 tracking-wider uppercase">
              <Icons.Loader size={9} className="animate-spin" />
              synthesizing
            </span>
          )}
          {refreshing && !synthesizing && !loading && (
            <span className="font-mono text-[9.5px] text-zinc-400 inline-flex items-center gap-1 tracking-wider uppercase">
              <Icons.Loader size={9} className="animate-spin" />
              refreshing
            </span>
          )}
          <div className="ml-auto flex items-center gap-0.5">
            <motion.button
              onClick={() => refresh()}
              disabled={refreshing}
              whileTap={{ scale: 0.92, transition: SPRING_TAP }}
              title="Refresh brief"
              className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
            >
              <Icons.Activity size={11} className={refreshing ? 'animate-spin' : ''} />
            </motion.button>
            <motion.button
              onClick={() => setSettingsOpen(true)}
              whileTap={{ scale: 0.92, transition: SPRING_TAP }}
              title="Configure categories"
              className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <Icons.Settings size={11} />
            </motion.button>
          </div>
        </div>
        {/* Weekly focus line — derived from real card data (overdue
           tasks, hot leads, unpaid invoices, etc). Gold-bar accent. */}
        {weeklyFocus && (
          <div
            className="mt-2.5 relative pl-4 pr-3 py-2 rounded-r-[10px]"
            style={{ background: 'linear-gradient(90deg, rgba(232,188,89,0.06) 0%, transparent 100%)' }}
          >
            <span
              aria-hidden
              className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full"
              style={{ background: 'linear-gradient(180deg, #E8BC59 0%, transparent 100%)' }}
            />
            <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--os-fg-1)', fontWeight: 500, letterSpacing: '-0.01em' }}>
              {weeklyFocus}
            </p>
          </div>
        )}
      </div>

      <div className="px-5 pt-3 space-y-3">

      {/* AI synthesis at top */}
      <AnimatePresence>
        {synthesis && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={SPRING_ENTER}
            className="rounded-xl border border-violet-200/60 dark:border-violet-500/30 bg-gradient-to-br from-violet-50/60 to-fuchsia-50/30 dark:from-violet-500/8 dark:to-fuchsia-500/5 p-3"
          >
            <div className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">{synthesis.headline}</div>
            {synthesis.narrative && (
              <p className="text-[12px] text-zinc-700 dark:text-zinc-200 leading-relaxed mt-1.5">{synthesis.narrative}</p>
            )}
            {synthesis.next_step && (
              <div className="mt-2.5 pt-2.5 border-t border-violet-200/40 dark:border-violet-500/20 flex items-start gap-2">
                <Icons.Sparkles size={11} className="text-violet-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400 mb-0.5">Do first</div>
                  <div className="text-[12px] text-zinc-800 dark:text-zinc-100">{synthesis.next_step}</div>
                </div>
                {onAskFollowUp && (
                  <motion.button
                    onClick={() => onAskFollowUp(`Help me with: ${synthesis.next_step}`)}
                    whileTap={{ scale: 0.94, transition: SPRING_TAP }}
                    className="shrink-0 text-[10px] font-semibold text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-500/15 px-2 py-1 rounded-md transition-colors"
                  >
                    Talk it out →
                  </motion.button>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-6">
          <Icons.Loader size={14} className="animate-spin text-zinc-400" />
        </div>
      )}

      {/* All-empty fallback */}
      {!loading && allEmpty && (
        <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-700 p-4 text-center">
          <Icons.Sparkles size={20} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-1.5" />
          <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400">
            Nothing to surface yet. Add some leads, content, or tasks and your brief will populate.
          </p>
        </div>
      )}

      {/* Category cards */}
      {!loading && !allEmpty && (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {orderedCards.filter(c => c.status !== 'empty').map((c, idx) => {
              const meta = CATEGORY_REGISTRY.find(m => m.id === c.id);
              if (!meta) return null;
              const aiTag = synthesis?.per_card?.[c.id];
              return (
                <CategoryCard
                  key={c.id}
                  meta={meta}
                  data={c}
                  aiTag={aiTag}
                  idx={idx}
                  onOpen={onNavigate ? () => onNavigate(meta.navigateTo) : undefined}
                  onItemClick={c.items ? (item) => setPreviewItem(item) : undefined}
                />
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {settingsOpen && (
          <BriefSettings
            prefs={prefs}
            onClose={() => setSettingsOpen(false)}
            onSave={handlePrefsChange}
          />
        )}
      </AnimatePresence>

      {/* Message detail slide-over — opens when user clicks on an
          inbox item in the "Inbox signals" card. Shows full body +
          AI classification + metadata without navigating away. */}
      <MessagePreviewPanel
        item={previewItem}
        onClose={() => setPreviewItem(null)}
      />
      </div>
    </div>
  );
};

// ── MessagePreviewPanel — slide-over for inbox message detail ────
const MessagePreviewPanel: React.FC<{
  item: { id: string; text: string; meta?: Record<string, any> } | null;
  onClose: () => void;
}> = ({ item, onClose }) => {
  if (!item) return null;
  const m = item.meta || {};
  const isSlack = m.platform === 'slack';
  const aiC = m.ai_classification || {};
  return (
    <AnimatePresence>
      {item && (
        <>
          {/* Backdrop */}
          <motion.div
            key="msg-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 z-[70]"
          />
          {/* Panel */}
          <motion.div
            key="msg-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-[480px] bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl z-[71] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/60">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                isSlack ? 'bg-violet-50 dark:bg-violet-500/10' : 'bg-rose-50 dark:bg-rose-500/10'
              }`}>
                {isSlack
                  ? <Icons.Hash size={14} className="text-violet-500" />
                  : <Icons.Mail size={14} className="text-rose-500" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                  {m.from_name || m.from_email || 'Unknown sender'}
                </div>
                <div className="text-[11px] text-zinc-400 truncate">
                  {m.from_email || ''}{m.channel_name ? ` · #${m.channel_name}` : ''}
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <Icons.X size={16} className="text-zinc-400" />
              </button>
            </div>

            {/* Subject */}
            {m.subject && (
              <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800/60">
                <div className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
                  {m.subject}
                </div>
                {m.received_at && (
                  <div className="text-[10.5px] text-zinc-400 mt-1 font-mono tabular-nums">
                    {new Date(m.received_at).toLocaleString('es-AR', {
                      weekday: 'short', day: 'numeric', month: 'short',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </div>
                )}
              </div>
            )}

            {/* AI classification summary */}
            {(aiC.summary || aiC.proposed_title) && (
              <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800/60">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Icons.Sparkles size={11} className="text-violet-500" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">AI Analysis</span>
                </div>
                {aiC.summary && (
                  <p className="text-[12px] text-zinc-700 dark:text-zinc-300 leading-relaxed">{aiC.summary}</p>
                )}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {aiC.intent && (
                    <span className="text-[9.5px] px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-medium">
                      Intent: {aiC.intent}
                    </span>
                  )}
                  {aiC.priority && (
                    <span className={`text-[9.5px] px-1.5 py-0.5 rounded-full font-medium ${
                      aiC.priority === 'high' ? 'bg-rose-100 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300'
                      : aiC.priority === 'medium' ? 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                    }`}>
                      Priority: {aiC.priority}
                    </span>
                  )}
                  {aiC.should_create_task && (
                    <span className="text-[9.5px] px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300 font-medium">
                      Task request
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="text-[12.5px] text-zinc-700 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">
                {m.body_text || '(No body)'}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center gap-2">
              <span className="text-[10px] text-zinc-400 font-mono">{item.id.slice(0, 8)}</span>
              <span className={`text-[9.5px] px-1.5 py-0.5 rounded-full font-medium ${
                isSlack ? 'bg-violet-100 dark:bg-violet-500/10 text-violet-600' : 'bg-rose-100 dark:bg-rose-500/10 text-rose-600'
              }`}>
                {isSlack ? 'Slack' : 'Gmail'}
              </span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// ── CategoryCard ──────────────────────────────────────────────────
const CategoryCard: React.FC<{ meta: CategoryMeta; data: CategoryData; aiTag?: string; idx: number; onOpen?: () => void; onItemClick?: (item: { id: string; text: string; meta?: Record<string, any> }) => void }> = ({ meta, data, aiTag, idx, onOpen, onItemClick }) => {
  const tint = TONE_TINT[meta.tone] || TONE_TINT.zinc;
  const IconCmp = (Icons as any)[meta.icon] || Icons.Sparkles;
  const attention = data.status === 'attention';
  // When onOpen is supplied, the whole card becomes a clickable drill-
  // down to the owning page. Use motion.button for tap feedback +
  // accessibility; the resting visuals stay the same as the read-only
  // version so adding navigation doesn't change the page's tone.
  const Component: any = onOpen ? motion.button : motion.div;
  const extraProps = onOpen ? {
    onClick: onOpen,
    whileTap: { scale: 0.99, transition: SPRING_TAP },
    whileHover: { y: -1, transition: SPRING_TAP },
  } : {};
  return (
    <Component
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={{ ...SPRING_ENTER, delay: idx * 0.04 }}
      {...extraProps}
      className={`group w-full text-left rounded-xl border ${tint.card} bg-white dark:bg-zinc-900 p-3 ${onOpen ? 'hover:border-zinc-300 dark:hover:border-zinc-700 cursor-pointer' : ''} transition-colors`}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={`w-5 h-5 rounded-md flex items-center justify-center ${tint.pill}`}>
          <IconCmp size={11} />
        </span>
        <span className="text-[12px] font-semibold text-zinc-900 dark:text-zinc-100">{data.title}</span>
        {attention && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 ml-1" title="Needs attention" />}
        {onOpen && (
          <Icons.ArrowLeft size={10} className="ml-auto rotate-180 text-zinc-300 dark:text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
      {/* Highlights */}
      {data.highlights.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {data.highlights.map((h, i) => (
            <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded tabular-nums ${PILL_TONE[h.tone || 'zinc']}`}>
              <span className="text-zinc-400 dark:text-zinc-500 font-medium uppercase tracking-wider text-[8.5px] mr-0.5">{h.label}</span>
              <span className="font-semibold">{h.value}</span>
            </span>
          ))}
        </div>
      )}
      {/* AI gloss (single line from the per-card synthesis) */}
      {aiTag && (
        <div className="text-[11px] text-violet-700 dark:text-violet-300 italic leading-relaxed mb-1.5 pl-0.5">
          ↳ {aiTag}
        </div>
      )}
      {/* Gauges — per-channel compliance bars (and similar). When a
          loader sets data.gauges, each entry renders as a tiny bar
          with label + current/target + color tone. */}
      {data.gauges && data.gauges.length > 0 && (
        <div className="space-y-1 mb-1.5">
          {data.gauges.map((g, i) => {
            const pct = g.target > 0 ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0;
            const barCls = g.tone === 'emerald' ? 'bg-emerald-500'
              : g.tone === 'amber' ? 'bg-amber-500'
              : g.tone === 'violet' ? 'bg-violet-500'
              : 'bg-rose-500';
            const textCls = g.tone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400'
              : g.tone === 'amber' ? 'text-amber-600 dark:text-amber-400'
              : g.tone === 'violet' ? 'text-violet-600 dark:text-violet-400'
              : 'text-rose-600 dark:text-rose-400';
            return (
              <div key={i}>
                <div className="flex items-center justify-between text-[10px] mb-0.5">
                  <span className="text-zinc-600 dark:text-zinc-300 truncate">{g.label}</span>
                  <span className={`tabular-nums font-semibold ${textCls}`}>{g.current}/{g.target}</span>
                </div>
                <div className="h-1 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ ...SPRING_ENTER, delay: 0.1 + i * 0.04 }}
                    className={`h-full rounded-full ${barCls}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
      {/* Bullets / Items — raw data, or structured clickable rows when
          the loader provides items (e.g. inbox messages). */}
      {data.items && data.items.length > 0 && onItemClick ? (
        <ul className="text-[11px] text-zinc-700 dark:text-zinc-200 space-y-0.5 leading-snug">
          {data.items.slice(0, 6).map((item) => (
            <li key={item.id}>
              <button
                onClick={(e) => { e.stopPropagation(); onItemClick(item); }}
                className="w-full text-left truncate hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-zinc-800/40 -mx-1 px-1 py-0.5 rounded transition-colors cursor-pointer inline-flex items-center gap-1"
                title={item.text}
              >
                {item.meta?.platform === 'slack' ? (
                  <Icons.Hash size={9} className="text-violet-400 shrink-0" />
                ) : item.meta?.platform === 'gmail' ? (
                  <Icons.Mail size={9} className="text-rose-400 shrink-0" />
                ) : null}
                {item.text}
              </button>
            </li>
          ))}
        </ul>
      ) : data.bullets.length > 0 ? (
        <ul className="text-[11px] text-zinc-700 dark:text-zinc-200 space-y-0.5 leading-snug">
          {data.bullets.slice(0, 5).map((b, i) => (
            <li key={i} className="truncate" title={b}>{b}</li>
          ))}
        </ul>
      ) : null}
    </Component>
  );
};
