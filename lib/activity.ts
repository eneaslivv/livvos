import { supabase } from './supabase'
import { notifyWithEmail } from './notifyWithEmail'

export type ActivityType =
  | 'task_created'
  | 'task_assigned'
  | 'task_completed'
  | 'task_reopened'
  | 'task_deleted'
  | 'project_created'
  | 'project_update'
  | 'status_change'
  | 'file_uploaded'
  | 'comment'

interface NotifyTarget {
  userId: string
  /** Notification type — defaults to 'task' for task_* activities, 'activity' otherwise */
  notifType?: 'task' | 'project' | 'activity' | 'mention'
  /** Override the notification body (defaults to "<user> <action> <target>") */
  message?: string
  link?: string
  priority?: 'low' | 'medium' | 'high' | 'urgent'
}

export async function logActivity(entry: {
  user_name?: string
  user_avatar?: string
  action: string
  target: string
  project_title?: string
  type: ActivityType | string
  details?: string
  tenant_id?: string | null
  user_id?: string | null
  metadata?: Record<string, any>
  /** Users to notify (in-app + optional email). Self is auto-filtered. */
  notify?: NotifyTarget[]
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

  const payload: any = {
    user_name: entry.user_name ?? 'System',
    user_avatar: entry.user_avatar ?? 'SYS',
    action: entry.action,
    target: entry.target,
    project_title: entry.project_title ?? null,
    type: entry.type,
    details: entry.details ?? null,
    metadata: entry.metadata ?? {},
    ...(userId && { user_id: userId }),
    ...(tenantId && { tenant_id: tenantId }),
  }
  await supabase.from('activity_logs').insert(payload)

  // Fan out notifications (fire-and-forget). Skip self-notifications.
  if (entry.notify && tenantId) {
    const actor = entry.user_name || 'Someone'
    const projectSuffix = entry.project_title ? ` in ${entry.project_title}` : ''
    const defaultMessage = `${actor} ${entry.action} ${entry.target}${projectSuffix}`
    const isTask = entry.type.startsWith('task_')
    entry.notify
      .filter(t => t.userId && t.userId !== userId)
      .forEach(target => {
        notifyWithEmail({
          userId: target.userId,
          tenantId: tenantId!,
          type: target.notifType || (isTask ? 'task' : 'activity'),
          title: `${actor} ${entry.action}: ${entry.target}`,
          message: target.message || defaultMessage,
          priority: target.priority || (entry.type === 'task_assigned' ? 'medium' : 'low'),
          link: target.link || (isTask ? '/calendar' : '/activity'),
          actionText: 'View',
        }).catch(() => {})
      })
  }
}
