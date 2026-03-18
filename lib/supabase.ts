import { createClient } from '@supabase/supabase-js'

// Proactively clean localStorage to prevent kQuotaBytes errors.
// Runs on startup and is exported so other modules can call it on demand.
export function cleanupLocalStorage() {
  try {
    // Proactive: remove known bloat keys even before quota is hit
    const bloatPrefixes = ['ld:', 'launchdarkly', 'lD_', 'intercom', 'analytics', '_dd_', 'ajs_', 'debug', 'ai_v']
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && bloatPrefixes.some(prefix => key.toLowerCase().startsWith(prefix))) {
        keysToRemove.push(key)
      }
    }
    if (keysToRemove.length) {
      keysToRemove.forEach(key => localStorage.removeItem(key))
      if (import.meta.env.DEV) console.log(`[Storage] Proactively removed ${keysToRemove.length} non-essential keys`)
    }

    // Test if we can write
    localStorage.setItem('__quota_test__', 'x')
    localStorage.removeItem('__quota_test__')
  } catch {
    if (import.meta.env.DEV) console.warn('[Storage] localStorage quota exceeded, cleaning up...')
    // Remove everything except Supabase auth
    const keysToKeep = ['sb-', 'supabase.auth']
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && !keysToKeep.some(prefix => key.includes(prefix))) {
        toRemove.push(key)
      }
    }
    toRemove.forEach(key => localStorage.removeItem(key))
    if (import.meta.env.DEV) console.log(`[Storage] Removed ${toRemove.length} non-essential keys`)

    // If still full, clear everything
    try {
      localStorage.setItem('__quota_test__', 'x')
      localStorage.removeItem('__quota_test__')
    } catch {
      if (import.meta.env.DEV) console.warn('[Storage] Still full, clearing all localStorage')
      localStorage.clear()
    }
  }
}

cleanupLocalStorage()

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
if (!supabaseUrl || !supabaseAnonKey) {
  if (import.meta.env.DEV) console.warn('Supabase env vars not set; using in-memory fallback.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true },
  global: { headers: { 'x-custom-version': 'eneas-os-v1' } }
})

/**
 * @deprecated Use `supabase` instead. The service role key must never be in the client bundle.
 * Admin operations should run in Supabase Edge Functions.
 * This alias exists only to avoid breaking imports during migration.
 */
export const supabaseAdmin = supabase

export default supabase