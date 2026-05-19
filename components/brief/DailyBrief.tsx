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
}

export const DailyBrief: React.FC<DailyBriefProps> = ({ onAskFollowUp }) => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [cards, setCards] = useState<CategoryData[]>([]);
  const [synthesis, setSynthesis] = useState<BriefSynthesis | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  // Full refresh: load cards + optionally synthesize.
  const refresh = useCallback(async (loadedPrefs?: Prefs) => {
    if (!currentTenant?.id || !user?.id) return;
    const usePrefs = loadedPrefs || prefs;
    setRefreshing(true);
    try {
      const ctx = { db: supabase as any, tenantId: currentTenant.id, userId: user.id, now: new Date() };
      const loadedCards = await loadEnabledCategories(ctx, usePrefs.enabled_categories);
      setCards(loadedCards);
      // Synthesize separately — UI shows cards immediately while AI churns.
      if (usePrefs.ai_synthesis_enabled && loadedCards.length > 0) {
        setSynthesizing(true);
        try {
          // Pull the user's first name + learned traits + strategy context in parallel.
          const [profile, strategyCtx] = await Promise.all([
            getUserProfile(supabase as any, { userId: user.id, tenantId: currentTenant.id }).catch(() => null),
            loadStrategyContext(),
          ]);
          const firstName = ((user as any)?.user_metadata?.name || (user as any)?.email || '').split(/[\s@]/)[0] || null;
          const result = await synthesizeBrief({
            cards: loadedCards,
            userName: firstName,
            tone: usePrefs.synthesis_tone,
            includeRecommendation: usePrefs.show_top_recommendation,
            learnedTraits: profile?.learned_traits || null,
            strategyContext: strategyCtx,
          });
          setSynthesis(result);
        } finally {
          setSynthesizing(false);
        }
      } else {
        setSynthesis(null);
      }
    } catch (e) {
      errorLogger.warn('daily brief load failed', e);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [currentTenant?.id, user?.id, prefs, loadStrategyContext]);

  // Initial mount: load prefs then cards. We pass prefs through to
  // refresh() so it doesn't wait for the next render to pick them up.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await loadPrefs();
      if (cancelled) return;
      setPrefs(p);
      refresh(p);
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

  return (
    <div className="px-5 pt-4 pb-3 space-y-3">
      {/* Top bar: refresh + settings */}
      <div className="flex items-center gap-1">
        <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-400">Today's brief</div>
        {synthesizing && (
          <span className="text-[10px] text-violet-500 inline-flex items-center gap-1 ml-1.5">
            <Icons.Loader size={9} className="animate-spin" />
            synthesizing
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
                <CategoryCard key={c.id} meta={meta} data={c} aiTag={aiTag} idx={idx} />
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
    </div>
  );
};

// ── CategoryCard ──────────────────────────────────────────────────
const CategoryCard: React.FC<{ meta: CategoryMeta; data: CategoryData; aiTag?: string; idx: number }> = ({ meta, data, aiTag, idx }) => {
  const tint = TONE_TINT[meta.tone] || TONE_TINT.zinc;
  const IconCmp = (Icons as any)[meta.icon] || Icons.Sparkles;
  const attention = data.status === 'attention';
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={{ ...SPRING_ENTER, delay: idx * 0.04 }}
      className={`rounded-xl border ${tint.card} bg-white dark:bg-zinc-900 p-3`}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={`w-5 h-5 rounded-md flex items-center justify-center ${tint.pill}`}>
          <IconCmp size={11} />
        </span>
        <span className="text-[12px] font-semibold text-zinc-900 dark:text-zinc-100">{data.title}</span>
        {attention && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 ml-1" title="Needs attention" />}
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
      {/* Bullets — raw data */}
      {data.bullets.length > 0 && (
        <ul className="text-[11px] text-zinc-700 dark:text-zinc-200 space-y-0.5 leading-snug">
          {data.bullets.slice(0, 5).map((b, i) => (
            <li key={i} className="truncate" title={b}>{b}</li>
          ))}
        </ul>
      )}
    </motion.div>
  );
};
