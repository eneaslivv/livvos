import { supabase } from './supabase'
import { sendEmail } from './sendEmail'
import type { SendEmailParams } from './sendEmail'

/**
 * Creates an in-app notification AND sends an email (if user preferences allow).
 * Designed to be called from any context without circular dependencies.
 * Email sending is fire-and-forget — failures don't affect the notification.
 */

interface NotifyParams {
  userId: string
  tenantId: string
  type: 'task' | 'project' | 'deadline' | 'system' | 'security' | 'billing' | 'invite' | 'lead' | 'activity' | 'mention'
  title: string
  message: string
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  link?: string
  actionUrl?: string
  actionText?: string
  metadata?: Record<string, any>
  brandName?: string
  logoUrl?: string
}

const typeToTemplate: Record<string, SendEmailParams['template']> = {
  task: 'task_assigned',
  deadline: 'deadline_reminder',
  project: 'project_update',
  system: 'system_alert',
  security: 'system_alert',
  billing: 'system_alert',
  invite: 'team_invite',
  lead: 'system_alert',
  activity: 'project_update',
  mention: 'task_assigned',
}

export const notifyWithEmail = async (params: NotifyParams): Promise<void> => {
  const priority = params.priority || 'medium'

  // 1. Insert in-app notification
  await supabase.from('notifications').insert({
    user_id: params.userId,
    tenant_id: params.tenantId,
    type: params.type,
    title: params.title,
    message: params.message,
    priority,
    link: params.link || null,
    action_url: params.actionUrl || null,
    action_text: params.actionText || null,
    metadata: params.metadata || {},
    action_required: false,
    category: params.type,
    read: false,
  })

  // 2. Check email preferences (fire-and-forget)
  try {
    const { data: shouldSend } = await supabase.rpc('should_send_email', {
      p_user_id: params.userId,
      p_type: params.type,
      p_priority: priority,
    })

    if (!shouldSend) return

    // Look up user email
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', params.userId)
      .single()

    if (!profile?.email) return

    const ctaUrl = params.actionUrl || params.link
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

    await sendEmail({
      template: typeToTemplate[params.type] || 'system_alert',
      to: profile.email,
      subject: params.title,
      brandName: params.brandName || 'LIVV OS',
      logoUrl: params.logoUrl,
      tenantId: params.tenantId,
      data: {
        recipientName: profile.full_name || undefined,
        title: params.title,
        message: params.message,
        ctaUrl: ctaUrl ? (ctaUrl.startsWith('http') ? ctaUrl : `${baseUrl}${ctaUrl}`) : undefined,
        ctaText: params.actionText || 'View Details',
      },
    })
  } catch (err) {
    if (import.meta.env.DEV) console.warn('Email notification failed (non-blocking):', err)
  }
}
