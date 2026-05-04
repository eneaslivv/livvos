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
  | 'user_login'
  | 'user_logout'

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
  // Resolve user_id, tenant_id, AND user_name from the current session if
  // they're not provided. Without this most call sites end up logging
  // "System" because they only pass a tenant_id and the user_name default
  // kicks in. Now: if user_name isn't provided, we also pull profile.name
  // (and avatar_url) so the activity feed shows who actually did the thing.
  let userId = entry.user_id
  let tenantId = entry.tenant_id
  let userName = entry.user_name
  let userAvatar = entry.user_avatar
  if (!userId || !tenantId || !userName) {
    const { data: { user } } = await supabase.auth.getUser()
    if (user && !userId) userId = user.id
    if (user && (!tenantId || !userName)) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id, name, email, avatar_url')
        .eq('id', user.id)
        .maybeSingle()
      if (profile) {
        if (!tenantId) tenantId = profile.tenant_id
        if (!userName) userName = profile.name || profile.email?.split('@')[0] || null
        if (!userAvatar && profile.avatar_url) userAvatar = profile.avatar_url
      }
      // Last-resort fallback if profile lookup fails — use email from auth.
      if (!userName && user.email) userName = user.email.split('@')[0]
    }
  }

  const payload: any = {
    user_name: userName ?? 'System',
    user_avatar: userAvatar ?? 'SYS',
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
    const actor = userName || 'Someone'
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

/**
 * Log a fresh user sign-in. Distinguishes a true sign-in (form submit / OTP)
 * from a session restore (page reload, tab reopen) by comparing the
 * session's `last_sign_in_at` to "now" — only logs if it's within 60 seconds.
 *
 * Also throttled per browser session via sessionStorage so a single sign-in
 * doesn't get logged twice (Supabase fires SIGNED_IN multiple times during
 * the initial handshake).
 */
export async function logUserSignIn(session: { user?: { id?: string; email?: string; last_sign_in_at?: string } | null } | null) {
  if (!session?.user?.id) return
  if (typeof window === 'undefined') return

  const userId = session.user.id
  const lastSignIn = session.user.last_sign_in_at ? new Date(session.user.last_sign_in_at).getTime() : 0
  // Only log a true fresh sign-in (form/OTP completed in the last minute).
  // Session restores from localStorage have older last_sign_in_at values.
  if (!lastSignIn || Date.now() - lastSignIn > 60_000) return

  // Throttle: don't log the same sign-in twice in this browser session.
  const dedupeKey = `__livv_logged_signin:${userId}:${Math.floor(lastSignIn / 1000)}`
  try {
    if (sessionStorage.getItem(dedupeKey)) return
    sessionStorage.setItem(dedupeKey, '1')
  } catch {}

  try {
    await logActivity({
      type: 'user_login',
      action: 'signed in',
      target: 'the workspace',
      metadata: {
        ua: navigator.userAgent.slice(0, 200),
        last_sign_in_at: session.user.last_sign_in_at,
      },
    })
  } catch {
    // Best-effort; never block auth on logging.
  }
}

export async function logUserSignOut() {
  try {
    await logActivity({
      type: 'user_logout',
      action: 'signed out',
      target: 'the workspace',
    })
  } catch {}
}
