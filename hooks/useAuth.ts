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
      const { data, error } = await supabase.auth.getSession()
      if (!isMounted) return
      if (error) {
        console.warn('[Auth] Failed to restore session:', error.message)
      }
      updateUser(data.session?.user ?? null)
      setLoading(false)
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
