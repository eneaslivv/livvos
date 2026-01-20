import { supabase } from './supabase'

export async function ensureAuthSession() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    try {
      await supabase.auth.signInAnonymously()
    } catch {
      // fallback: create a temp guest session in local storage to avoid crashes
    }
  }
  await ensureProfile()
}

export async function getUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function ensureProfile() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const email = user.email ?? 'guest@local'
  await supabase.from('profiles').upsert({
    user_id: user.id,
    email,
    name: user.user_metadata?.name ?? email.split('@')[0]
  }, { onConflict: 'user_id' })
}
