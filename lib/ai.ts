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
  weekly_summary: 60 * 60 * 1000, // 1h — weekly data is stable
  proposal: 30 * 60 * 1000,       // 30 min — same brief = same proposal
  blog: 30 * 60 * 1000,           // 30 min
  tasks_bulk: 10 * 60 * 1000,     // 10 min
  task: 0,                         // no cache — single tasks are quick & varied
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

function setCache(type: string, input: string, result: unknown): void {
  const ttl = CACHE_TTL[type] ?? 0
  if (ttl === 0) return
  try {
    const entry: AICacheEntry = { result, timestamp: Date.now() }
    localStorage.setItem(cacheKey(type, input), JSON.stringify(entry))
  } catch {
    // localStorage full or unavailable — silently skip
  }
}

// ─── In-flight deduplication ─────────────────────────────────────
// If the same request is already in-flight, return the same promise
// instead of making a duplicate API call.

const inflight = new Map<string, Promise<unknown>>()

async function callGemini<T>(type: string, input: string, validate: (d: any) => boolean): Promise<T> {
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
    const { data, error } = await supabase.functions.invoke('gemini', {
      body: { type, input },
    })

    if (error) throw new Error(error.message)
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

export const generateTaskFromAI = (input: string): Promise<TaskAIResult> =>
  callGemini('task', input, (r) => !!r?.title)

export const generateProposalFromAI = (input: string): Promise<ProposalAIResult> =>
  callGemini('proposal', input, (r) => !!r?.content)

export const generateWeeklySummaryFromAI = (input: string): Promise<WeeklySummaryAIResult> =>
  callGemini('weekly_summary', input, (r) => Array.isArray(r?.objectives) && Array.isArray(r?.focus_tasks) && Array.isArray(r?.recommendations))

export const generateAdvisorInsights = (input: string): Promise<AdvisorAIResult> =>
  callGemini('advisor', input, (r) => Array.isArray(r?.insights))

export const generateBlogFromAI = (input: string): Promise<BlogAIResult> =>
  callGemini('blog', input, (r) => !!r?.title && !!r?.content)

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
