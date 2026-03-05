import { createClient } from '@supabase/supabase-js'

// Clean up localStorage if near quota to prevent kQuotaBytes errors
function cleanupLocalStorage() {
  try {
    // Test if we can write
    localStorage.setItem('__quota_test__', 'x')
    localStorage.removeItem('__quota_test__')
  } catch {
    console.warn('[Storage] localStorage quota exceeded, cleaning up...')
    // Remove non-essential keys (keep Supabase auth)
    const keysToKeep = ['sb-', 'supabase.auth']
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && !keysToKeep.some(prefix => key.includes(prefix))) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key))
    console.log(`[Storage] Removed ${keysToRemove.length} non-essential keys`)

    // If still full, clear everything
    try {
      localStorage.setItem('__quota_test__', 'x')
      localStorage.removeItem('__quota_test__')
    } catch {
      console.warn('[Storage] Still full, clearing all localStorage')
      localStorage.clear()
    }
  }
}

cleanupLocalStorage()

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase env vars not set; using in-memory fallback.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true },
  global: { headers: { 'x-custom-version': 'eneas-os-v1' } }
})

/** Admin client for storage operations — bypasses RLS */
export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : supabase

export default supabase