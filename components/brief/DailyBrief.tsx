/**
 * DailyBrief — clean AI-driven daily analysis rendered as a chat
 * message. No cards, no dashboard widgets — just a flowing
 * conversational briefing from your AI advisor.
 *
 * Flow on mount:
 *   1. Load brief_preferences for the user (or fall back to default).
 *   2. Run the enabled category loaders in parallel (data collection).
 *   3. Call synthesizeBrief which sends all data to Gemini and gets
 *      back a conversational analysis in Spanish.
 *   4. Render the analysis as a single chat-style bubble.
 *
 * Day-keyed cache prevents re-fetching on every page navigation.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../ui/Icons';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../context/TenantContext';
import { useAuth } from '../../hooks/useAuth';
import { errorLogger } from '../../lib/errorLogger';
import { SPRING_ENTER, SPRING_TAP } from '../../lib/ui/motion';
import { loadEnabledCategories, type CategoryData, type CategoryId } from '../../lib/brief/data-loaders';
import { synthesizeBrief, buildStrategyContext, type BriefSynthesis } from '../../lib/brief/synthesize';
import { getUserProfile } from '../../lib/agents';
import { BriefSettings } from './BriefSettings';

const DEFAULT_ENABLED: CategoryId[] = ['today_load','cashflow','pipeline','content','inbox','team_kpis','strategy','upcoming'];

// ── Day-keyed cache ───────────────────────────────────────────────
const CACHE_VERSION = 'v2';
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
    const prefix = `brief_cache:${CACHE_VERSION}:${userId}:`;
    const todayKey = cacheKey(userId);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix) && k !== todayKey) localStorage.removeItem(k);
    }
  } catch { /* quota / private-mode */ }
};

// ── Weekly focus — dynamic line derived from card data ─────────────
function buildWeeklyFocus(cards: CategoryData[]): string {
  const parts: string[] = [];
  for (const c of cards) {
    if (c.status === 'empty') continue;
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
  }
  if (parts.length === 0) {
    const h = new Date().getHours();
    return h < 12 ? 'Buenos días — tu semana empieza limpia.' : h < 18 ? 'Tu tarde está libre de urgencias.' : 'Cerrando el día sin pendientes críticos.';
  }
  return parts.slice(0, 4).join(' · ');
}

// ── Simple markdown renderer for the briefing message ──────────────
function renderBriefMessage(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Empty line → spacer
    if (!line.trim()) {
      nodes.push(<div key={i} className="h-2" />);
      continue;
    }

    // **Bold** heading lines
    const boldMatch = line.match(/^\*\*(.+?)\*\*$/);
    if (boldMatch) {
      nodes.push(
        <div
          key={i}
          className="mt-3 mb-1 first:mt-0"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.16em',
            color: 'var(--os-fg-3)',
          }}
        >
          {boldMatch[1]}
        </div>
      );
      continue;
    }

    // Inline bold within paragraph text
    const parts: React.ReactNode[] = [];
    const regex = /\*\*(.+?)\*\*/g;
    let lastIdx = 0;
    let match;
    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIdx) parts.push(line.slice(lastIdx, match.index));
      parts.push(<strong key={`b-${i}-${match.index}`} style={{ fontWeight: 600, color: 'var(--os-ink)' }}>{match[1]}</strong>);
      lastIdx = match.index + match[0].length;
    }
    if (lastIdx < line.length) parts.push(line.slice(lastIdx));

    nodes.push(
      <p
        key={i}
        className="leading-relaxed"
        style={{ fontSize: 13, color: 'var(--os-fg-1)', lineHeight: 1.7 }}
      >
        {parts.length > 0 ? parts : line}
      </p>
    );
  }
  return nodes;
}

// ── Prefs ──────────────────────────────────────────────────────────
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

interface DailyBriefProps {
  onAskFollowUp?: (prompt: string) => void;
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

  const refresh = useCallback(async (loadedPrefs?: Prefs, opts?: { silent?: boolean }) => {
    if (!currentTenant?.id || !user?.id) return;
    const usePrefs = loadedPrefs || prefs;
    setRefreshing(true);
    try {
      const ctx = { db: supabase as any, tenantId: currentTenant.id, userId: user.id, now: new Date() };
      const loadedCards = await loadEnabledCategories(ctx, usePrefs.enabled_categories);
      setCards(loadedCards);
      let synthResult: BriefSynthesis | null = null;
      if (usePrefs.ai_synthesis_enabled && loadedCards.length > 0) {
        setSynthesizing(true);
        try {
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
      writeBriefCache(user.id, { cards: loadedCards, synthesis: synthResult });
    } catch (e) {
      errorLogger.warn('daily brief load failed', e);
    } finally {
      setRefreshing(false);
      setLoading(false);
      void opts;
    }
  }, [currentTenant?.id, user?.id, prefs, loadStrategyContext]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await loadPrefs();
      if (cancelled) return;
      setPrefs(p);
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
  }, [loadPrefs]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const allEmpty = !loading && cards.every(c => c.status === 'empty');
  const weeklyFocus = useMemo(() => buildWeeklyFocus(cards), [cards]);

  // Timestamp for the briefing
  const briefTime = useMemo(() => {
    return new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }, [synthesis]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="pb-3">
      {/* ── Sticky header ─────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-10 px-5 pt-3 pb-3 backdrop-blur"
        style={{
          background: 'rgba(253,251,247,0.95)',
          borderBottom: '1px solid var(--os-border)',
        }}
      >
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: 'var(--accent)', boxShadow: '0 0 0 3px var(--accent-soft)' }}
          />
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.22em',
            color: 'var(--os-fg-3)',
          }}>
            Today's brief
          </div>
          {synthesizing && (
            <span
              className="inline-flex items-center gap-1"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9.5,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: 'var(--accent)',
              }}
            >
              <Icons.Loader size={9} className="animate-spin" />
              analyzing
            </span>
          )}
          {refreshing && !synthesizing && !loading && (
            <span
              className="inline-flex items-center gap-1"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9.5,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: 'var(--os-fg-3)',
              }}
            >
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
              className="p-1 rounded transition-colors disabled:opacity-40"
              style={{ color: 'var(--os-fg-3)' }}
            >
              <Icons.Activity size={11} className={refreshing ? 'animate-spin' : ''} />
            </motion.button>
            <motion.button
              onClick={() => setSettingsOpen(true)}
              whileTap={{ scale: 0.92, transition: SPRING_TAP }}
              title="Configure categories"
              className="p-1 rounded transition-colors"
              style={{ color: 'var(--os-fg-3)' }}
            >
              <Icons.Settings size={11} />
            </motion.button>
          </div>
        </div>

        {/* Weekly focus line */}
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
            <p style={{
              fontSize: 12.5,
              fontWeight: 500,
              letterSpacing: '-0.01em',
              color: 'var(--os-fg-1)',
              lineHeight: 1.5,
            }}>
              {weeklyFocus}
            </p>
          </div>
        )}
      </div>

      {/* ── Content area ──────────────────────────────────────────── */}
      <div className="px-5 pt-4">

        {/* Loading state — minimal skeleton */}
        {loading && (
          <div className="space-y-3 py-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse" style={{ opacity: 1 - i * 0.2 }}>
                <div className="h-3 rounded-full mb-2" style={{ background: 'var(--os-surface)', width: `${85 - i * 15}%` }} />
                <div className="h-3 rounded-full" style={{ background: 'var(--os-surface)', width: `${70 - i * 10}%` }} />
              </div>
            ))}
          </div>
        )}

        {/* All-empty fallback */}
        {!loading && allEmpty && (
          <div
            className="py-8 text-center"
            style={{ borderRadius: 14, border: '1px dashed var(--os-border-2)' }}
          >
            <p style={{ fontSize: 13, color: 'var(--os-fg-2)' }}>
              Sin datos todavía. Sumá leads, tareas o contenido y tu brief se va a armar solo.
            </p>
          </div>
        )}

        {/* ── AI Analysis — the main briefing ──────────────────── */}
        <AnimatePresence>
          {synthesis && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={SPRING_ENTER}
            >
              {/* Briefing message */}
              <div className="space-y-0">
                {renderBriefMessage(synthesis.message)}
              </div>

              {/* Next step — actionable CTA */}
              {synthesis.next_step && (
                <div
                  className="mt-4 flex items-start gap-2.5 p-3"
                  style={{
                    borderRadius: 12,
                    background: 'var(--accent-soft)',
                    border: '1px solid rgba(196,163,90,0.15)',
                  }}
                >
                  <Icons.Sparkles size={12} className="shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                  <div className="flex-1 min-w-0">
                    <div style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      fontWeight: 500,
                      textTransform: 'uppercase',
                      letterSpacing: '0.18em',
                      color: 'var(--accent)',
                      marginBottom: 3,
                    }}>
                      Hacé esto primero
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--os-ink)', lineHeight: 1.5 }}>
                      {synthesis.next_step}
                    </div>
                  </div>
                  {onAskFollowUp && (
                    <motion.button
                      onClick={() => onAskFollowUp(`Help me with: ${synthesis.next_step}`)}
                      whileTap={{ scale: 0.94, transition: SPRING_TAP }}
                      className="shrink-0 px-2.5 py-1 transition-colors"
                      style={{
                        fontSize: 10,
                        fontWeight: 500,
                        color: 'var(--accent)',
                        borderRadius: 9999,
                        border: '1px solid rgba(196,163,90,0.25)',
                      }}
                    >
                      Talk it out
                    </motion.button>
                  )}
                </div>
              )}

              {/* Timestamp */}
              <div className="mt-3 flex items-center gap-1.5" style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: 'var(--os-fg-3)',
                letterSpacing: '0.1em',
              }}>
                <Icons.Clock size={9} />
                generated at {briefTime}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Synthesizing placeholder when no cached synthesis */}
        {!loading && !synthesis && synthesizing && (
          <div className="py-6 flex items-center gap-2" style={{ color: 'var(--os-fg-3)', fontSize: 12 }}>
            <Icons.Loader size={12} className="animate-spin" style={{ color: 'var(--accent)' }} />
            Analizando tus datos...
          </div>
        )}

        {/* Fallback when synthesis failed but we have data */}
        {!loading && !allEmpty && !synthesis && !synthesizing && (
          <div style={{ fontSize: 13, color: 'var(--os-fg-2)', lineHeight: 1.7 }}>
            <p>
              Tenés {cards.filter(c => c.status === 'attention').length} áreas que necesitan atención
              {cards.filter(c => c.status === 'ok').length > 0
                ? ` y ${cards.filter(c => c.status === 'ok').length} que están al día.`
                : '.'
              }
            </p>
            <button
              onClick={() => refresh()}
              className="mt-2 inline-flex items-center gap-1.5 transition-colors"
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--accent)',
              }}
            >
              <Icons.Activity size={10} />
              Generar análisis
            </button>
          </div>
        )}
      </div>

      {/* Settings modal */}
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
