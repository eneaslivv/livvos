/**
 * Critique agent — runs offline (on demand from Settings or scheduled)
 * over recent conversations + feedback signals to:
 *   1. Identify patterns in the user's questions + preferences.
 *   2. Update the user's `learned_traits` field on agent_user_profiles.
 *   3. Surface bad-quality replies for review.
 *
 * Hands a structured input bundle to Gemini and parses a structured
 * output. NEVER mutates without explicit user opt-in via UI.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendAdvisorChat } from '../../ai';
import { fetchRecentTurns } from '../memory/conversation-log';
import { fetchFeedbackStats, getUserProfile, saveUserProfile } from '../memory';

interface CritiqueResult {
  ok: boolean;
  /** Updated learned_traits text — bulleted summary. */
  learned_traits?: string;
  /** Top topics by interaction frequency. */
  topic_weights?: Record<string, number>;
  /** Quality signals over the period. */
  stats: {
    total_turns: number;
    thumbs_up: number;
    thumbs_down: number;
    re_asks: number;
    actions_confirmed: number;
    actions_skipped: number;
    most_used_agent: string | null;
    pct_no_data: number;
  };
  /** Free-form observations the critique agent surfaced. */
  observations?: string;
}

export async function runCritique(args: {
  db: SupabaseClient;
  userId: string;
  tenantId: string;
  sinceDays?: number;
}): Promise<CritiqueResult> {
  const turns = await fetchRecentTurns(args.db, {
    userId: args.userId, tenantId: args.tenantId, limit: 50,
  });
  const feedback = await fetchFeedbackStats(args.db, {
    userId: args.userId, tenantId: args.tenantId, sinceDays: args.sinceDays || 30,
  });

  // Topic frequencies from agent_id
  const topicCounts: Record<string, number> = {};
  let totalSkillNoData = 0;
  let totalSkillRuns = 0;
  for (const t of turns as any[]) {
    const domain = (t.agent_id || '').replace('-agent', '');
    if (domain) topicCounts[domain] = (topicCounts[domain] || 0) + 1;
    const trace = (t.skill_trace || []) as any[];
    totalSkillRuns += trace.length;
    totalSkillNoData += trace.filter(s => !s.ok).length;
  }
  const sortedTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]);
  const mostUsedAgent = sortedTopics[0]?.[0] || null;

  // Normalize topic counts to weights 0..1
  const max = sortedTopics[0]?.[1] || 1;
  const topic_weights: Record<string, number> = {};
  for (const [k, v] of sortedTopics) topic_weights[k] = Math.round((v / max) * 100) / 100;

  const stats = {
    total_turns: turns.length,
    thumbs_up: feedback.thumbs_up || 0,
    thumbs_down: feedback.thumbs_down || 0,
    re_asks: feedback.re_asked_same_thing || 0,
    actions_confirmed: feedback.action_confirmed || 0,
    actions_skipped: feedback.action_skipped || 0,
    most_used_agent: mostUsedAgent,
    pct_no_data: totalSkillRuns > 0 ? Math.round((totalSkillNoData / totalSkillRuns) * 100) / 100 : 0,
  };

  if (turns.length < 3) {
    // Too little data — don't ask the LLM, just return stats.
    return { ok: true, stats, topic_weights };
  }

  // Build a compact summary of recent interactions for the LLM
  const recentSample = (turns as any[]).slice(0, 20).map((t, i) => {
    const status = (t.skill_trace || []).every((s: any) => s.ok) ? '✓' : '⚠';
    return `${i + 1}. [${t.agent_id}] ${status} "${(t.query || '').slice(0, 80)}" → "${(t.reply || '').slice(0, 120)}…"`;
  }).join('\n');

  const profile = await getUserProfile(args.db, { userId: args.userId, tenantId: args.tenantId });
  const existingTraits = profile.learned_traits || '(none yet)';

  const prompt = [
    'You are a meta-analyzer reviewing how a user has been interacting with an AI assistant.',
    '',
    `RECENT INTERACTIONS (${turns.length} turns, last ${args.sinceDays || 30} days):`,
    recentSample,
    '',
    'AGGREGATE STATS:',
    `  • Total turns: ${stats.total_turns}`,
    `  • Thumbs up: ${stats.thumbs_up} · Thumbs down: ${stats.thumbs_down}`,
    `  • User re-asked same question: ${stats.re_asks} times`,
    `  • Proposed actions: ${stats.actions_confirmed} confirmed, ${stats.actions_skipped} skipped`,
    `  • Most-used agent: ${stats.most_used_agent || 'none'}`,
    `  • % of skill calls that returned no data: ${Math.round(stats.pct_no_data * 100)}%`,
    '',
    `EXISTING LEARNED TRAITS (overwrite):`,
    existingTraits,
    '',
    'Your job: output a CONCISE bulleted summary (5-8 bullets, max 80 chars each) of what we now know about this user. Focus on:',
    '  • Which topics/areas they care about most.',
    '  • Tone/length preferences inferred from query phrasing.',
    '  • Patterns in when they re-ask (signal of unclear replies).',
    '  • Whether they tend to confirm or skip proposed actions.',
    '  • Anything notable about how to make the AI more useful for them.',
    '',
    'Output ONLY the bulleted list, no preamble or markdown headers. Each bullet starts with "• ".',
  ].join('\n');

  let learned_traits: string | undefined;
  let observations: string | undefined;
  try {
    const r = await sendAdvisorChat('', [], prompt);
    learned_traits = ((r as any)?.reply || '').trim();
    if (learned_traits && !learned_traits.startsWith('•')) {
      // Force bullet format if the LLM ignored
      learned_traits = learned_traits.split('\n').filter(Boolean).map(l => l.trim().startsWith('•') ? l : `• ${l}`).join('\n');
    }
  } catch (e) {
    observations = `(critique LLM call failed: ${(e as Error).message})`;
  }

  // Persist
  await saveUserProfile(args.db, {
    userId: args.userId,
    tenantId: args.tenantId,
    updates: {
      learned_traits: learned_traits || profile.learned_traits,
      topic_weights,
    },
  });

  return { ok: true, learned_traits, topic_weights, stats, observations };
}
