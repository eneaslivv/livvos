import { supabase } from './supabase'

export async function logActivity(entry: {
  user_name?: string
  user_avatar?: string
  action: string
  target: string
  project_title?: string
  type: string
  details?: string
}) {
  const payload = {
    user_name: entry.user_name ?? 'System',
    user_avatar: entry.user_avatar ?? 'SYS',
    action: entry.action,
    target: entry.target,
    project_title: entry.project_title ?? null,
    type: entry.type,
    details: entry.details ?? null,
  }
  await supabase.from('activity_logs').insert(payload)
}
