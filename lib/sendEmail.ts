import { supabase } from './supabase'

export interface SendEmailParams {
  template: 'task_assigned' | 'task_completed' | 'deadline_reminder' | 'task_overdue' | 'project_update' | 'system_alert' | 'role_changed' | 'member_suspended' | 'member_activated' | 'member_removed' | 'team_invite' | 'welcome' | 'daily_schedule' | 'weekly_digest'
  to: string
  subject: string
  brandName?: string
  logoUrl?: string
  tenantId?: string
  data: {
    recipientName?: string
    title: string
    message: string
    ctaUrl?: string
    ctaText?: string
    // Optional structured payload for daily/weekly digest templates. When
    // present the edge function renders the wine-hero "weekly digest" layout
    // instead of the plain-text fallback.
    overdue_tasks?: Array<{ id?: string; title: string; due_date?: string; project_name?: string }>
    due_today_tasks?: Array<{ id?: string; title: string; due_date?: string; project_name?: string }>
    today_events?: Array<{ id?: string; title: string; start_date?: string; project_name?: string }>
  }
}

export const sendEmail = async (params: SendEmailParams): Promise<{ ok: boolean; message_id?: string }> => {
  const { data, error } = await supabase.functions.invoke('send-email', {
    body: {
      template: params.template,
      to: params.to,
      subject: params.subject,
      brand_name: params.brandName,
      logo_url: params.logoUrl,
      tenant_id: params.tenantId,
      data: {
        recipient_name: params.data.recipientName,
        title: params.data.title,
        message: params.data.message,
        cta_url: params.data.ctaUrl,
        cta_text: params.data.ctaText,
        // Forward structured arrays untouched so the edge function can pick
        // the rich layout when they're present.
        overdue_tasks: params.data.overdue_tasks,
        due_today_tasks: params.data.due_today_tasks,
        today_events: params.data.today_events,
      },
    },
  })

  if (error) throw new Error(`Email send failed: ${error.message}`)
  if (data?.error) throw new Error(data.error)

  return data
}
