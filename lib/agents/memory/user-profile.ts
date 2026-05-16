/**
 * User profile — learned preferences per user that the orchestrator
 * injects into every agent prompt. Two sources:
 *
 *   1. Explicit (user fills in via Settings → AI Profile):
 *      • preferred_tone (formal / friendly / concise / casual)
 *      • preferred_reply_length (short / medium / long)
 *      • preferred_language (es / en / auto)
 *      • manual_notes (anything they want the AI to always know)
 *      • style_rules (banned phrases, "never use emoji", etc.)
 *
 *   2. Learned by the critique loop:
 *      • topic_weights — which agents the user invokes most
 *      • learned_traits — patterns the critique agent noticed
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface UserProfile {
  user_id: string;
  tenant_id: string;
  preferred_tone: string;
  preferred_reply_length: string;
  preferred_language: string;
  topic_weights: Record<string, number>;
  learned_traits: string | null;
  manual_notes: string | null;
  style_rules: string[];
}

const DEFAULT_PROFILE = (userId: string, tenantId: string): UserProfile => ({
  user_id: userId,
  tenant_id: tenantId,
  preferred_tone: 'friendly',
  preferred_reply_length: 'medium',
  preferred_language: 'auto',
  topic_weights: {},
  learned_traits: null,
  manual_notes: null,
  style_rules: [],
});

// In-memory cache — profile doesn't change per turn, so don't re-fetch.
const profileCache = new Map<string, { profile: UserProfile; fetchedAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 min

export async function getUserProfile(
  db: SupabaseClient,
  args: { userId: string; tenantId: string },
): Promise<UserProfile> {
  const cacheKey = `${args.userId}:${args.tenantId}`;
  const cached = profileCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.profile;
  }
  try {
    const { data } = await db.from('agent_user_profiles')
      .select('*')
      .eq('user_id', args.userId)
      .maybeSingle();
    const profile = (data as any) || DEFAULT_PROFILE(args.userId, args.tenantId);
    // Normalize potentially-null arrays/objects.
    if (!profile.topic_weights) profile.topic_weights = {};
    if (!profile.style_rules) profile.style_rules = [];
    profileCache.set(cacheKey, { profile, fetchedAt: Date.now() });
    return profile;
  } catch {
    return DEFAULT_PROFILE(args.userId, args.tenantId);
  }
}

export async function saveUserProfile(
  db: SupabaseClient,
  args: { userId: string; tenantId: string; updates: Partial<UserProfile> },
): Promise<void> {
  const cacheKey = `${args.userId}:${args.tenantId}`;
  try {
    await db.from('agent_user_profiles').upsert({
      user_id: args.userId,
      tenant_id: args.tenantId,
      ...args.updates,
      updated_at: new Date().toISOString(),
    });
    profileCache.delete(cacheKey);
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[agent-profile] save failed:', e);
  }
}

/** Format the profile as a prompt block to inject into the agent's
 *  system message. Returns empty string if the profile has nothing
 *  worth injecting. */
export function formatProfileForPrompt(profile: UserProfile): string {
  const bits: string[] = [];

  // Tone + length + language preferences
  const styleParts: string[] = [];
  if (profile.preferred_tone && profile.preferred_tone !== 'friendly') {
    styleParts.push(`tone: ${profile.preferred_tone}`);
  }
  if (profile.preferred_reply_length && profile.preferred_reply_length !== 'medium') {
    styleParts.push(`reply length: ${profile.preferred_reply_length}`);
  }
  if (profile.preferred_language && profile.preferred_language !== 'auto') {
    styleParts.push(`always reply in ${profile.preferred_language}`);
  }
  if (styleParts.length > 0) {
    bits.push(`User preferences — ${styleParts.join(', ')}.`);
  }

  // Style rules — hard constraints
  if (profile.style_rules && profile.style_rules.length > 0) {
    bits.push(`Style rules (MUST follow):\n${profile.style_rules.map((r: string) => `  • ${r}`).join('\n')}`);
  }

  // Learned traits (from critique loop) — soft hints
  if (profile.learned_traits) {
    bits.push(`What we've learned about this user from past conversations:\n${profile.learned_traits}`);
  }

  // Manual notes — explicit user input
  if (profile.manual_notes) {
    bits.push(`User's own notes about how they want you to operate:\n${profile.manual_notes}`);
  }

  if (bits.length === 0) return '';
  return [
    '── USER PROFILE (adapt your reply to these preferences) ──',
    ...bits,
    '',
  ].join('\n');
}
