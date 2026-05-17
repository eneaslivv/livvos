// @ts-nocheck
/**
 * Scheduled critique — server-side runCritique for every active user.
 *
 * What it does (mirrors lib/agents/critique/critique-agent.ts):
 *   1. Find users who had ≥3 agent_conversations turns in the last 30 days
 *      AND who haven't been analyzed in the last 6 days.
 *   2. For each: pull recent turns + feedback stats, compute topic_weights
 *      + skill stats, ask Gemini for a bulleted learned_traits summary,
 *      upsert agent_user_profiles with the result + last_critique_at.
 *   3. Returns a JSON summary { processed, skipped, failed, took_ms }.
 *
 * Invocation:
 *   - pg_cron weekly (see migrations/2026-05-23_scheduled_critique.sql)
 *   - manually: POST /functions/v1/scheduled-critique with optional
 *     {tenant_id?, user_id?, max_users?} to scope a run.
 *
 * Auth: service_role only — refuses anon/JWT. Critique reads cross-user
 * data (it sees everyone's conversations) and that must NEVER be exposed
 * to a user request.
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || ''
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGINS') || '*'

// Hard cap per cron run so a quiet weekend doesn't bill a fortune. The
// loop processes oldest-critique-first so over time every active user
// gets covered.
const DEFAULT_MAX_USERS = 50
// Lookback window for "is this user active enough to analyze".
const ACTIVE_DAYS = 30
// Minimum turns to bother asking the LLM. Matches the in-app behavior
// (Settings → Analyze button refuses with <3 turns).
const MIN_TURNS = 3
// Skip users critiqued within this many days — keeps the loop idempotent
// across cron runs of differing cadence (daily, weekly, manual).
const COOLDOWN_DAYS = 6

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface CritiqueStats {
  total_turns: number
  thumbs_up: number
  thumbs_down: number
  re_asks: number
  actions_confirmed: number
  actions_skipped: number
  most_used_agent: string | null
  pct_no_data: number
}

/** Call Gemini directly. We deliberately skip the shared /functions/v1/gemini
 *  endpoint because it auth-gates on user JWT + tenant quotas, neither of
 *  which apply to a server-cron job. Talking to the API directly also keeps
 *  this function self-contained. */
async function askGemini(prompt: string): Promise<string | null> {
  if (!GEMINI_API_KEY) {
    console.warn('[scheduled-critique] GEMINI_API_KEY missing — skipping LLM call')
    return null
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 600,
    },
  })
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    if (!res.ok) {
      console.warn(`[scheduled-critique] gemini ${res.status}: ${(await res.text()).slice(0, 200)}`)
      return null
    }
    const data = await res.json()
    const parts = data?.candidates?.[0]?.content?.parts || []
    return parts.map((p: any) => p.text || '').join('').trim() || null
  } catch (e) {
    console.warn('[scheduled-critique] gemini call failed:', String(e))
    return null
  }
}

/** Compute aggregate feedback signals over a window. Mirrors
 *  lib/agents/memory/feedback.ts → fetchFeedbackStats. */
async function feedbackStats(
  supabase: any,
  userId: string,
  sinceDays: number,
): Promise<Record<string, number>> {
  const since = new Date(Date.now() - sinceDays * 86400000).toISOString()
  const { data } = await supabase
    .from('agent_feedback')
    .select('signal')
    .eq('user_id', userId)
    .gte('created_at', since)
  const counts: Record<string, number> = {}
  for (const row of (data || []) as any[]) {
    counts[row.signal] = (counts[row.signal] || 0) + 1
  }
  return counts
}

/** Run critique for one user. Returns 'ok' | 'skip' | 'fail'. */
async function critiqueOne(
  supabase: any,
  userId: string,
  tenantId: string,
): Promise<'ok' | 'skip' | 'fail'> {
  // Pull last 50 turns
  const { data: turns } = await supabase
    .from('agent_conversations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  const turnList = (turns || []) as any[]
  if (turnList.length < MIN_TURNS) {
    return 'skip'
  }

  // Compute topic_weights + skill stats (mirrors critique-agent.ts)
  const topicCounts: Record<string, number> = {}
  let totalSkillNoData = 0
  let totalSkillRuns = 0
  for (const t of turnList) {
    const domain = (t.agent_id || '').replace('-agent', '')
    if (domain) topicCounts[domain] = (topicCounts[domain] || 0) + 1
    const trace = (t.skill_trace || []) as any[]
    totalSkillRuns += trace.length
    totalSkillNoData += trace.filter((s) => !s.ok).length
  }
  const sortedTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1])
  const mostUsedAgent = sortedTopics[0]?.[0] || null
  const max = sortedTopics[0]?.[1] || 1
  const topic_weights: Record<string, number> = {}
  for (const [k, v] of sortedTopics) topic_weights[k] = Math.round((v / max) * 100) / 100

  const feedback = await feedbackStats(supabase, userId, ACTIVE_DAYS)
  const stats: CritiqueStats = {
    total_turns: turnList.length,
    thumbs_up: feedback.thumbs_up || 0,
    thumbs_down: feedback.thumbs_down || 0,
    re_asks: feedback.re_asked_same_thing || 0,
    actions_confirmed: feedback.action_confirmed || 0,
    actions_skipped: feedback.action_skipped || 0,
    most_used_agent: mostUsedAgent,
    pct_no_data: totalSkillRuns > 0 ? Math.round((totalSkillNoData / totalSkillRuns) * 100) / 100 : 0,
  }

  // Compact transcript for the meta-prompt
  const recentSample = turnList.slice(0, 20).map((t, i) => {
    const status = (t.skill_trace || []).every((s: any) => s.ok) ? '✓' : '⚠'
    return `${i + 1}. [${t.agent_id}] ${status} "${(t.query || '').slice(0, 80)}" → "${(t.reply || '').slice(0, 120)}…"`
  }).join('\n')

  // Get existing traits to give the LLM continuity
  const { data: existingProfile } = await supabase
    .from('agent_user_profiles')
    .select('learned_traits')
    .eq('user_id', userId)
    .maybeSingle()
  const existingTraits = (existingProfile as any)?.learned_traits || '(none yet)'

  const prompt = [
    'You are a meta-analyzer reviewing how a user has been interacting with an AI assistant.',
    '',
    `RECENT INTERACTIONS (${turnList.length} turns, last ${ACTIVE_DAYS} days):`,
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
    'EXISTING LEARNED TRAITS (overwrite):',
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
  ].join('\n')

  let learnedTraits = await askGemini(prompt)
  if (learnedTraits && !learnedTraits.startsWith('•')) {
    learnedTraits = learnedTraits.split('\n').filter(Boolean)
      .map((l) => l.trim().startsWith('•') ? l : `• ${l}`).join('\n')
  }

  // Upsert profile with whatever we learned. Even if Gemini failed, we
  // still want to bump last_critique_at + topic_weights so the user
  // doesn't get retried tomorrow for the same empty result.
  const upsertBody: Record<string, any> = {
    user_id: userId,
    tenant_id: tenantId,
    topic_weights,
    last_critique_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  if (learnedTraits) upsertBody.learned_traits = learnedTraits

  const { error: upsertErr } = await supabase
    .from('agent_user_profiles')
    .upsert(upsertBody, { onConflict: 'user_id' })

  if (upsertErr) {
    console.warn(`[scheduled-critique] upsert failed for ${userId}:`, upsertErr.message)
    return 'fail'
  }
  return 'ok'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  // ── Auth: service-role only ───────────────────────────────────────
  // The function reads conversations across users; that's not a thing a
  // logged-in user should ever do via this endpoint. Reject anything
  // that isn't the service-role bearer.
  const authHeader = req.headers.get('Authorization') || ''
  const isServiceRole = authHeader === `Bearer ${SERVICE_ROLE_KEY}`
  if (!isServiceRole) {
    return new Response(JSON.stringify({ error: 'service_role required' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const t0 = Date.now()
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Optional body to scope the run — handy for manual smoke tests and
  // future per-user "run now" buttons that go through this endpoint.
  let body: any = {}
  try { body = await req.json() } catch { /* empty body is fine */ }
  const scopeUserId: string | null = body.user_id || null
  const scopeTenantId: string | null = body.tenant_id || null
  const maxUsers: number = Number(body.max_users) || DEFAULT_MAX_USERS

  // ── Find candidates ──────────────────────────────────────────────
  // SELECT users with ≥MIN_TURNS turns in last ACTIVE_DAYS, ordered by
  // staleness (oldest critique first). Done via SQL because Postgres
  // can do the aggregation in one round-trip vs N queries in Deno.
  const sinceIso = new Date(Date.now() - ACTIVE_DAYS * 86400000).toISOString()
  const cooldownIso = new Date(Date.now() - COOLDOWN_DAYS * 86400000).toISOString()

  let query = supabase
    .from('agent_conversations')
    .select('user_id, tenant_id', { count: 'exact' })
    .gte('created_at', sinceIso)
  if (scopeUserId) query = query.eq('user_id', scopeUserId)
  if (scopeTenantId) query = query.eq('tenant_id', scopeTenantId)
  // Fetch ALL rows in the window so we can group in JS — for typical
  // tenants this is well under 10k rows. If volume grows past that we
  // should move the grouping into a SQL RPC.
  const { data: rows, error: rowsErr } = await query.limit(20000)
  if (rowsErr) {
    return new Response(JSON.stringify({ error: 'query failed', details: rowsErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Tally turns per user+tenant pair
  const tally = new Map<string, { user_id: string; tenant_id: string; n: number }>()
  for (const r of (rows || []) as any[]) {
    const key = `${r.user_id}::${r.tenant_id}`
    const cur = tally.get(key) || { user_id: r.user_id, tenant_id: r.tenant_id, n: 0 }
    cur.n++
    tally.set(key, cur)
  }
  const eligible = Array.from(tally.values()).filter((u) => u.n >= MIN_TURNS)

  if (eligible.length === 0) {
    return new Response(JSON.stringify({
      ok: true, processed: 0, skipped: 0, failed: 0, eligible: 0,
      message: 'No eligible users in window', took_ms: Date.now() - t0,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Pull the most recent critique for each eligible user so we can skip
  // anyone analyzed within the cooldown window.
  const userIds = eligible.map((u) => u.user_id)
  const { data: profiles } = await supabase
    .from('agent_user_profiles')
    .select('user_id, last_critique_at')
    .in('user_id', userIds)
  const lastByUser = new Map<string, string | null>(
    (profiles || []).map((p: any) => [p.user_id, p.last_critique_at || null]),
  )

  // Filter cooldown + sort oldest-first so the queue rotates fairly
  // across cron runs.
  const queue = eligible
    .filter((u) => {
      const last = lastByUser.get(u.user_id)
      return !last || last < cooldownIso
    })
    .sort((a, b) => {
      const la = lastByUser.get(a.user_id) || ''
      const lb = lastByUser.get(b.user_id) || ''
      return la.localeCompare(lb)
    })
    .slice(0, maxUsers)

  let processed = 0, skipped = 0, failed = 0
  for (const { user_id, tenant_id } of queue) {
    try {
      const outcome = await critiqueOne(supabase, user_id, tenant_id)
      if (outcome === 'ok') processed++
      else if (outcome === 'skip') skipped++
      else failed++
    } catch (e) {
      console.warn(`[scheduled-critique] crit ${user_id} threw:`, String(e))
      failed++
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    processed, skipped, failed,
    eligible: eligible.length,
    queued: queue.length,
    took_ms: Date.now() - t0,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
