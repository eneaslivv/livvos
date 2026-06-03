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
  const payload = {
    id: user.id,
    user_id: user.id,
    email,
    name: user.user_metadata?.name ?? email.split('@')[0]
  }

  const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' })
  if (!error) return

  // Legacy deployments may not have profiles.user_id yet. Retry with the
  // canonical id-only shape rather than blocking session bootstrap.
  await supabase.from('profiles').upsert({
    id: user.id,
    email,
    name: user.user_metadata?.name ?? email.split('@')[0]
  }, { onConflict: 'id' })
}
