import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

const HEARTBEAT_MS = 4 * 60 * 1000 // < the 5-min "Online now" window used in Team

/**
 * Keeps profiles.last_seen_at fresh while the app is open, so Team can show
 * who is online / when someone was last active. Fire-and-forget: presence
 * must never surface errors to the user.
 */
export function usePresenceHeartbeat() {
  const { user } = useAuth()

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false

    const beat = () => {
      if (cancelled || document.visibilityState === 'hidden') return
      supabase
        .from('profiles')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', user.id)
        .then(({ error }) => {
          if (error && import.meta.env.DEV) console.warn('[presence] heartbeat failed:', error.message)
        })
    }

    beat()
    const interval = setInterval(beat, HEARTBEAT_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') beat()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [user?.id])
}
