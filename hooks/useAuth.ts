import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { User } from '@supabase/supabase-js'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const userIdRef = useRef<string | null>(null)

  useEffect(() => {
    let isMounted = true

    // Only update user state if the user ID actually changed,
    // to prevent cascading re-renders from token refreshes
    const updateUser = (newUser: User | null) => {
      const newId = newUser?.id ?? null
      if (newId !== userIdRef.current) {
        userIdRef.current = newId
        setUser(newUser)
      }
    }

    const restoreSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (!isMounted) return
        if (error || !data.session?.user) {
          if (error) console.warn('[Auth] getSession error, trying getUser fallback:', error.message)
          // Session missing or broken (e.g. localStorage quota exceeded) — try server call
          const { data: userData } = await supabase.auth.getUser()
          if (!isMounted) return
          updateUser(userData.user ?? null)
        } else {
          updateUser(data.session.user)
        }
      } catch (err) {
        // getSession can throw if localStorage quota is exceeded
        console.warn('[Auth] getSession threw, trying getUser fallback:', err)
        if (!isMounted) return
        try {
          const { data } = await supabase.auth.getUser()
          if (!isMounted) return
          updateUser(data.user ?? null)
        } catch {
          if (!isMounted) return
          updateUser(null)
        }
      }
      if (isMounted) setLoading(false)
    }

    restoreSession()

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return
      updateUser(session?.user ?? null)
      if (event === 'INITIAL_SESSION') {
        setLoading(false)
      }
    })

    return () => {
      isMounted = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  return { user, loading }
}
