import { supabase } from './supabase'

// ─── AI Response Cache ───────────────────────────────────────────
// Prevents duplicate API calls for identical inputs within a TTL window.
// Cache is per-type + input hash, stored in localStorage for cross-navigation persistence.

type AICacheEntry = {
  result: unknown
  timestamp: number
}

/** TTL per request type (in milliseconds) */
const CACHE_TTL: Record<string, number> = {
  advisor: 2 * 60 * 60 * 1000,    // 2h — business context changes slowly
  advisor_chat: 0,                 // no cache — each chat turn is unique
  weekly_summary: 60 * 60 * 1000, // 1h — weekly data is stable
  proposal: 30 * 60 * 1000,       // 30 min — same brief = same proposal
  blog: 30 * 60 * 1000,           // 30 min
  tasks_bulk: 10 * 60 * 1000,     // 10 min
  plan_period: 5 * 60 * 1000,     // 5 min — plans are context-heavy
  task: 0,                         // no cache — single tasks are quick & varied
  standup: 0,                      // no cache — each standup is unique per day
}

const CACHE_VERSION = 'ai_v2'

/** Simple string hash for cache keys */
const hashInput = (s: string): string => {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return String(h)
}

const cacheKey = (type: string, input: string) => `${CACHE_VERSION}:${type}:${hashInput(input)}`

function getCached<T>(type: string, input: string): T | null {
  const ttl = CACHE_TTL[type] ?? 0
  if (ttl === 0) return null
  try {
    const raw = localStorage.getItem(cacheKey(type, input))
    if (!raw) return null
    const entry: AICacheEntry = JSON.parse(raw)
    if (Date.now() - entry.timestamp > ttl) {
      localStorage.removeItem(cacheKey(type, input))
      return null
    }
    return entry.result as T
  } catch {
    return null
  }
}

function evictExpiredCache(): void {
  try {
    const now = Date.now()
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k?.startsWith(`${CACHE_VERSION}:`)) continue
      try {
        const entry: AICacheEntry = JSON.parse(localStorage.getItem(k) || '')
        const typePart = k.split(':')[1] || ''
        const ttl = CACHE_TTL[typePart] ?? 0
        if (ttl === 0 || now - entry.timestamp > ttl) toRemove.push(k)
      } catch {
        toRemove.push(k) // corrupted entry
      }
    }
    toRemove.forEach(k => localStorage.removeItem(k))
  } catch { /* ignore */ }
}

function setCache(type: string, input: string, result: unknown): void {
  const ttl = CACHE_TTL[type] ?? 0
  if (ttl === 0) return
  try {
    const entry: AICacheEntry = { result, timestamp: Date.now() }
    const value = JSON.stringify(entry)
    // Skip caching if response is too large (>50KB) to avoid filling localStorage
    if (value.length > 50_000) return
    localStorage.setItem(cacheKey(type, input), value)
  } catch {
    // localStorage full — evict expired entries and retry once
    evictExpiredCache()
    try {
      const entry: AICacheEntry = { result, timestamp: Date.now() }
      localStorage.setItem(cacheKey(type, input), JSON.stringify(entry))
    } catch { /* still full — skip */ }
  }
}

// ─── Request throttle ────────────────────────────────────────────
// Minimum gap between API requests to prevent bursting multiple
// components at once (e.g., AiAdvisor + WeeklySummary on page load).

let lastRequestTime = 0
const MIN_REQUEST_INTERVAL = 2000 // 2 seconds between requests

async function throttle(): Promise<void> {
  const now = Date.now()
  const elapsed = now - lastRequestTime
  if (elapsed < MIN_REQUEST_INTERVAL) {
    await new Promise(r => setTimeout(r, MIN_REQUEST_INTERVAL - elapsed))
  }
  lastRequestTime = Date.now()
}

// ─── Fetch with retry on 429 ────────────────────────────────────

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 2): Promise<Response> {
  const delays = [10_000, 30_000]
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options)
    if (res.status !== 429 || attempt === maxRetries) return res
    if (import.meta.env.DEV) console.log(`[AI] 429, retrying in ${delays[attempt]}ms (attempt ${attempt + 1}/${maxRetries})`)
    await new Promise(r => setTimeout(r, delays[attempt]))
  }
  throw new Error('Max retries exceeded')
}

// ─── In-flight deduplication ─────────────────────────────────────
// If the same request is already in-flight, return the same promise
// instead of making a duplicate API call.

const inflight = new Map<string, Promise<unknown>>()

/**
 * Optional live profile enrichment. When provided, these fields are merged
 * with the server-loaded `tenant_ai_profile` row before being injected into
 * the system prompt. Use it to push fresh on-screen data the DB row doesn't
 * have (e.g. live counters, currently-selected project context).
 */
export type LiveAIProfile = {
  last_active_projects_summary?: string
  last_finance_summary?: string
  // Free-form pass-through. Server only reads known keys, but extras don't break anything.
  [k: string]: unknown
}

async function callGemini<T>(
  type: string,
  input: string,
  validate: (d: any) => boolean,
  profile?: LiveAIProfile,
): Promise<T> {
  // 1. Check cache
  const cached = getCached<T>(type, input)
  if (cached) {
    if (import.meta.env.DEV) console.log(`[AI] Cache hit for ${type}`)
    return cached
  }

  // 2. Deduplicate in-flight requests
  const key = cacheKey(type, input)
  const existing = inflight.get(key)
  if (existing) {
    if (import.meta.env.DEV) console.log(`[AI] Dedup in-flight for ${type}`)
    return existing as Promise<T>
  }

  // 3. Make the actual call
  const promise = (async (): Promise<T> => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

    // Returns whatever access token we can produce, or null. NEVER throws — let the
    // server decide whether the token is acceptable. Throwing pre-emptively from here
    // produced false "session expired" banners even when the user was logged in.
    const getAvailableToken = async (forceRefresh = false): Promise<string | null> => {
      if (!forceRefresh) {
        try {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.access_token) {
            // Use the existing token unless it's literally already expired.
            const expiresAt = session.expires_at ? session.expires_at * 1000 : Infinity
            if (expiresAt > Date.now() + 5_000) return session.access_token
          }
        } catch { /* fall through to refresh */ }
      }
      try {
        const { data: refreshed } = await supabase.auth.refreshSession()
        return refreshed.session?.access_token || null
      } catch {
        return null
      }
    }

    const sessionExpired = (): never => {
      const err = new Error('Your session has ended. Please log in again.') as any
      err.status = 401
      err.needsReLogin = true
      throw err
    }

    let authToken = await getAvailableToken()

    // Throttle to avoid bursting when multiple components load simultaneously
    await throttle()

    const makeRequest = async (token: string) => {
      return fetchWithRetry(`${supabaseUrl}/functions/v1/gemini`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ type, input, profile }),
      })
    }

    if (!authToken) {
      // No token at all — try one forced refresh before giving up.
      authToken = await getAvailableToken(true)
      if (!authToken) sessionExpired()
    }

    let res = await makeRequest(authToken!)

    // If the server rejects, force-refresh and retry once. Only declare the session
    // dead if the server still rejects us after a fresh token.
    if (res.status === 401) {
      if (import.meta.env.DEV) console.log(`[AI] 401 for ${type}, refreshing token and retrying`)
      const refreshed = await getAvailableToken(true)
      if (!refreshed) sessionExpired()
      res = await makeRequest(refreshed!)
      if (res.status === 401) sessionExpired()
    }

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      if (import.meta.env.DEV) console.error(`[AI] ${type} error:`, errBody)
      const message = res.status === 429
        ? 'AI temporarily unavailable. Try again in 30 seconds.'
        : res.status === 401
        ? 'Your session has ended. Please log in again.'
        : errBody.error || `Edge function error (${res.status})`
      const err = new Error(message) as any
      err.isRateLimit = res.status === 429
      err.status = res.status
      err.needsReLogin = res.status === 401
      throw err
    }

    const data = await res.json()
    if (!data?.result || !validate(data.result)) throw new Error('Invalid AI response')

    const result = data.result as T
    setCache(type, input, result)
    return result
  })()

  inflight.set(key, promise)
  promise.finally(() => inflight.delete(key))

  return promise
}

// ─── Exported functions ──────────────────────────────────────────

type TaskAIResult = {
  title: string
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  tag?: string
}

type ProposalAIResult = {
  summary: string
  content: string
  timeline: { week: number; title: string; detail: string }[]
  language?: 'en' | 'es'
}

type BlogAIResult = {
  title: string
  excerpt: string
  content: string
  language?: 'en' | 'es'
}

type WeeklySummaryAIResult = {
  objectives: string[]
  focus_tasks: string[]
  recommendations: string[]
}

export type AdvisorInsight = {
  area: string
  icon: string
  title: string
  body: string
  priority: 'high' | 'medium' | 'low'
}

export type AdvisorAIResult = {
  insights: AdvisorInsight[]
  greeting: string
}

export const generateTaskFromAI = (input: string, profile?: LiveAIProfile): Promise<TaskAIResult> =>
  callGemini('task', input, (r) => !!r?.title, profile)

export const generateProposalFromAI = (input: string, profile?: LiveAIProfile): Promise<ProposalAIResult> =>
  callGemini('proposal', input, (r) => !!r?.content, profile)

export const generateWeeklySummaryFromAI = (input: string, profile?: LiveAIProfile): Promise<WeeklySummaryAIResult> =>
  callGemini('weekly_summary', input, (r) => Array.isArray(r?.objectives) && Array.isArray(r?.focus_tasks) && Array.isArray(r?.recommendations), profile)

export const generateAdvisorInsights = (input: string, profile?: LiveAIProfile): Promise<AdvisorAIResult> =>
  callGemini('advisor', input, (r) => Array.isArray(r?.insights), profile)

/** Synchronously return cached advisor insights for the given context (or null). */
export const getCachedAdvisorInsights = (input: string): AdvisorAIResult | null =>
  getCached<AdvisorAIResult>('advisor', input)

export type AdvisorChatMessage = { role: 'user' | 'assistant'; content: string }

export type AdvisorChatResult = { reply: string }

/** Conversational follow-up chat that piggybacks on the advisor context. */
export const sendAdvisorChat = (
  context: string,
  history: AdvisorChatMessage[],
  question: string,
  profile?: LiveAIProfile,
): Promise<AdvisorChatResult> => {
  const payload = JSON.stringify({ context, history, question })
  return callGemini<AdvisorChatResult>('advisor_chat', payload, (r) => typeof r?.reply === 'string', profile)
}

export const generateBlogFromAI = (input: string, profile?: LiveAIProfile): Promise<BlogAIResult> =>
  callGemini('blog', input, (r) => !!r?.title && !!r?.content, profile)

// ─── AI Plan Period ──────────────────────────────────────────────

export type PlanChange = {
  taskId: string
  taskTitle: string
  currentDate?: string
  newDate?: string
  currentTime?: string
  newTime?: string
  currentAssignee?: string
  newAssignee?: string
  currentPriority?: string
  newPriority?: string
  reason: string
}

export type PlanAIResult = {
  changes: PlanChange[]
  summary: string
}

export const generatePlanFromAI = (input: string, profile?: LiveAIProfile): Promise<PlanAIResult> =>
  callGemini('plan_period', input, (r) => Array.isArray(r?.changes), profile)

// ─── AI Standup ──────────────────────────────────────────────────

export type StandupAction = {
  type: 'complete' | 'create' | 'update_status' | 'flag_blocked'
  taskId?: string
  taskTitle: string
  newTask?: { title: string; priority: 'low' | 'medium' | 'high'; dueDate?: string; projectName?: string }
  updates?: { status?: string; priority?: string }
  reason: string
}

export type StandupRisk = {
  type: 'deadline_risk' | 'blocker' | 'scope_creep' | 'overload'
  title: string
  description: string
  severity: 'low' | 'medium' | 'high'
}

export type StandupAIResult = {
  summary: string
  actions: StandupAction[]
  risks: StandupRisk[]
}

export const processStandupFromAI = (input: string, profile?: LiveAIProfile): Promise<StandupAIResult> =>
  callGemini('standup', input, (r) => !!r?.summary && Array.isArray(r?.actions), profile)

// ─── Tenant AI Profile (CRUD) ────────────────────────────────────
// Static per-tenant context that the user fills in via Settings → AI Preferences.
// Server auto-loads this on every gemini call; clients only need these helpers
// for the settings UI itself.

export type TenantAIProfile = {
  tenant_id: string
  business_description: string | null
  industry: string | null
  target_audience: string | null
  brand_voice: string | null
  tone: string | null
  primary_language: string | null
  goals: string[] | null
  constraints: string | null
  custom_instructions: string | null
  last_active_projects_summary: string | null
  last_finance_summary: string | null
  updated_at?: string
}

export const TENANT_AI_PROFILE_TONES = ['professional', 'casual', 'formal', 'playful', 'technical'] as const
export const TENANT_AI_PROFILE_LANGUAGES = ['es', 'en', 'pt'] as const

export async function getTenantAIProfile(tenantId: string): Promise<TenantAIProfile | null> {
  const { data, error } = await supabase
    .from('tenant_ai_profile')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) {
    if (import.meta.env.DEV) console.error('[ai] getTenantAIProfile error:', error)
    return null
  }
  return (data as TenantAIProfile) || null
}

export async function upsertTenantAIProfile(
  tenantId: string,
  patch: Partial<Omit<TenantAIProfile, 'tenant_id' | 'updated_at'>>,
): Promise<TenantAIProfile | null> {
  const { data, error } = await supabase
    .from('tenant_ai_profile')
    .upsert({ tenant_id: tenantId, ...patch }, { onConflict: 'tenant_id' })
    .select('*')
    .single()
  if (error) {
    if (import.meta.env.DEV) console.error('[ai] upsertTenantAIProfile error:', error)
    return null
  }
  return data as TenantAIProfile
}

/** Force-clear all AI caches (e.g., when user wants fresh results) */
export const clearAICache = (type?: string): void => {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(`${CACHE_VERSION}:`) && (!type || k.startsWith(`${CACHE_VERSION}:${type}:`))) {
        keys.push(k)
      }
    }
    keys.forEach(k => localStorage.removeItem(k))
  } catch {
    // ignore
  }
}
