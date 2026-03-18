import { supabase } from './supabase'

export async function logActivity(entry: {
  user_name?: string
  user_avatar?: string
  action: string
  target: string
  project_title?: string
  type: string
  details?: string
  tenant_id?: string | null
  user_id?: string | null
}) {
  // Resolve user_id and tenant_id from current session if not provided
  let userId = entry.user_id
  let tenantId = entry.tenant_id
  if (!userId || !tenantId) {
    const { data: { user } } = await supabase.auth.getUser()
    if (user && !userId) userId = user.id
    if (user && !tenantId) {
      const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single()
      if (profile) tenantId = profile.tenant_id
    }
  }

  const payload = {
    user_name: entry.user_name ?? 'System',
    user_avatar: entry.user_avatar ?? 'SYS',
    action: entry.action,
    target: entry.target,
    project_title: entry.project_title ?? null,
    type: entry.type,
    details: entry.details ?? null,
    ...(userId && { user_id: userId }),
    ...(tenantId && { tenant_id: tenantId }),
  }
  await supabase.from('activity_logs').insert(payload)
}
