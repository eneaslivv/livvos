/**
 * DailyBrief — clean AI-driven daily analysis rendered as a chat
 * message. No cards, no dashboard widgets — just a flowing
 * conversational briefing from your AI advisor.
 *
 * Flow on mount:
 *   1. Load brief_preferences for the user (or fall back to default).
 *   2. Run the enabled category loaders in parallel (data collection).
 *   3. Call synthesizeBrief which sends all data to Gemini and gets
 *      back a conversational analysis in English.
 *   4. Render the analysis as a single chat-style bubble.
 *
 * Day-keyed cache prevents re-fetching on every page navigation.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../ui/Icons';
// Self-import the brief styles so the bd-brief-* classes are present
// wherever DailyBrief renders (e.g. Home), not only on the lazy Brief page.
import './BriefDesign.css';
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
const CACHE_VERSION = 'v5-en';
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
function buildWeeklyFocusEnglish(cards: CategoryData[]): string {
  const focus = buildWeeklyFocus(cards);
  if (!focus || /Buenos|tarde|Cerrando|crÃ|dÃ/i.test(focus)) {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning - your week is clean.' : h < 18 ? 'Your afternoon is clear of urgent blockers.' : 'Closing the day with no critical blockers.';
  }
  return focus.replace(/ Â· /g, ' · ');
}

function cleanLocalSignal(value: string | undefined): string {
  return String(value || '')
    .replace(/ðŸ”¥|🔥/g, 'High priority:')
    .replace(/ðŸŽ¯|🎯/g, '')
    .replace(/âš |⚠/g, 'Risk:')
    .replace(/ðŸ“…|📅/g, '')
    .replace(/ðŸ”|🔁/g, '')
    .replace(/✅|✓/g, '')
    .replace(/Â·/g, '·')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildLocalBrief(cards: CategoryData[], includeRecommendation: boolean): BriefSynthesis | null {
  const activeCards = cards.filter(c => c.status !== 'empty');
  if (activeCards.length === 0) return null;

  const attentionCards = activeCards.filter(c => c.status === 'attention');
  const todayLoad = cards.find(c => c.id === 'today_load');
  const overdue = Number(todayLoad?.context?.overdue_count || 0);
  const dueToday = Number(todayLoad?.context?.due_today_count || 0);
  const lines: string[] = [];

  // Conversational read of the day — no headers, no numbered lists. The Brief
  // should sound like a colleague talking you through the morning, not a report.
  if (attentionCards.length > 0) {
    const bits: string[] = [];
    if (overdue > 0) bits.push(`${overdue} overdue`);
    if (dueToday > 0) bits.push(`${dueToday} due today`);
    const load = bits.length ? `You're carrying ${bits.join(' and ')}, so` : 'A few things need a look, so';
    lines.push(`Here's where things stand. ${load} the move today is to clear what's blocking before you open anything new.`);
  } else {
    lines.push("Here's where things stand. Nothing is on fire today, so it's a good window to get ahead on what's coming instead of reacting.");
  }

  // Guide through the top things to tackle, in flowing prose.
  const priorities = attentionCards
    .slice(0, 3)
    .map(card => ({ area: card.title.toLowerCase(), sig: cleanLocalSignal(card.bullets[0]) }))
    .filter(p => p.sig);
  if (priorities.length > 0) {
    const sentences = priorities.map((p, i) => {
      const lead = i === 0 ? 'Start with' : i === 1 ? 'Then' : 'After that';
      return `${lead} ${p.area}: ${p.sig.replace(/\.$/, '')}.`;
    });
    lines.push(sentences.join(' '));
  }

  // One light line on what's steady, so the brief feels balanced, not alarmist.
  const okCards = activeCards.filter(c => c.status === 'ok').slice(0, 3);
  if (okCards.length > 0) {
    lines.push(`The rest is steady for now: ${okCards.map(c => c.title.toLowerCase()).join(', ')}.`);
  }

  // next_step is shown on its own "Do this first" card, so it is not repeated
  // inside the message — keeping the brief itself uncluttered.
  const nextStep = includeRecommendation
    ? attentionCards[0]?.bullets[0]
      ? `Clear the first ${attentionCards[0].title.toLowerCase()} blocker: ${cleanLocalSignal(attentionCards[0].bullets[0])}`
      : overdue > 0
        ? 'Start by closing or rescheduling the oldest overdue task.'
        : 'Pick one priority task and protect a focused work block for it.'
    : null;

  return {
    headline: attentionCards.length > 0 ? `${attentionCards.length} areas need attention` : 'No critical blockers',
    message: lines.join('\n\n'),
    next_step: nextStep,
  };
}

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
          const [profile, strategyCtx, activeHoursHint] = await Promise.all([
            getUserProfile(supabase as any, { userId: user.id, tenantId: currentTenant.id }).catch(() => null),
            loadStrategyContext(),
            (async (): Promise<string | null> => {
              try {
                const since = new Date(Date.now() - 30 * 86400000).toISOString();
                const { data } = await (supabase as any).from('agent_conversations')
                  .select('created_at').eq('user_id', user.id).eq('tenant_id', currentTenant.id)
                  .gte('created_at', since).limit(1000);
                if (!data || data.length < 8) return null;
                const buckets = new Array(24).fill(0);
                for (const r of data as any[]) { const h = new Date(r.created_at).getHours(); if (h >= 0 && h < 24) buckets[h]++; }
                const top = buckets.map((c: number, h: number) => ({ h, c })).filter((x: any) => x.c > 0)
                  .sort((a: any, b: any) => b.c - a.c).slice(0, 3).map((x: any) => x.h).sort((a: number, b: number) => a - b);
                if (!top.length) return null;
                return `The user is typically active around ${top.map((h: number) => String(h).padStart(2, '0') + 'h').join(', ')} (learned from usage). Frame the briefing for that daily rhythm.`;
              } catch { return null; }
            })(),
          ]);
          const firstName = ((user as any)?.user_metadata?.name || (user as any)?.email || '').split(/[\s@]/)[0] || null;
          synthResult = await synthesizeBrief({
            cards: loadedCards,
            userName: firstName,
            tone: usePrefs.synthesis_tone,
            includeRecommendation: usePrefs.show_top_recommendation,
            learnedTraits: profile?.learned_traits || null,
            topicWeights: (profile as any)?.topic_weights || {},
            activeHoursHint,
            strategyContext: strategyCtx,
          });
          if (!synthResult) {
            synthResult = buildLocalBrief(loadedCards, usePrefs.show_top_recommendation);
          }
          setSynthesis(synthResult);
        } finally {
          setSynthesizing(false);
        }
      } else {
        synthResult = buildLocalBrief(loadedCards, usePrefs.show_top_recommendation);
        setSynthesis(synthResult);
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
  const weeklyFocus = useMemo(() => buildWeeklyFocusEnglish(cards), [cards]);

  // Timestamp for the briefing
  const briefTime = useMemo(() => {
    return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }, [synthesis]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bd-brief-panel pb-3">
      {/* ── Sticky header ─────────────────────────────────────────── */}
      <div className="bd-brief-sticky">
        <div className="bd-brief-head">
          <span
            aria-hidden
            className="bd-brief-pulse"
          />
          <div className="bd-brief-title">
            Today's brief
          </div>
          {synthesizing && !synthesis && (
            <span className="bd-brief-state is-active">
              <Icons.Loader size={9} className="animate-spin" />
              analyzing
            </span>
          )}
          {refreshing && !synthesizing && !loading && (
            <span className="bd-brief-state">
              <Icons.Loader size={9} className="animate-spin" />
              refreshing
            </span>
          )}
          <div className="bd-brief-actions">
            <motion.button
              onClick={() => refresh()}
              disabled={refreshing}
              whileTap={{ scale: 0.92, transition: SPRING_TAP }}
              title="Refresh brief"
              className="bd-icon-btn disabled:opacity-40"
            >
              <Icons.Activity size={11} className={refreshing ? 'animate-spin' : ''} />
            </motion.button>
            <motion.button
              onClick={() => setSettingsOpen(true)}
              whileTap={{ scale: 0.92, transition: SPRING_TAP }}
              title="Configure categories"
              className="bd-icon-btn"
            >
              <Icons.Settings size={11} />
            </motion.button>
          </div>
        </div>

        {/* Weekly focus line */}
        {weeklyFocus && (
          <div className="bd-brief-focus">
            <span aria-hidden className="bd-brief-focus-bar" />
            <p>{weeklyFocus}</p>
          </div>
        )}
      </div>

      {/* ── Content area ──────────────────────────────────────────── */}
      <div className="bd-brief-body px-5 pt-4">

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
              No data yet. Add leads, tasks, content, or calendar events and this brief will build itself.
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
                      Do this first
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
            Analyzing your workspace...
          </div>
        )}

        {/* Fallback when synthesis failed but we have data */}
        {!loading && !allEmpty && !synthesis && !synthesizing && (
          <div style={{ fontSize: 13, color: 'var(--os-fg-2)', lineHeight: 1.7 }}>
            <p>
              You have {cards.filter(c => c.status === 'attention').length} areas that need attention
              {cards.filter(c => c.status === 'ok').length > 0
                ? ` and ${cards.filter(c => c.status === 'ok').length} that are on track.`
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
              Generate analysis
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
