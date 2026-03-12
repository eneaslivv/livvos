import { supabase } from './supabase'

export interface SendEmailParams {
  template: 'task_assigned' | 'task_completed' | 'deadline_reminder' | 'project_update' | 'system_alert'
  to: string
  subject: string
  brandName?: string
  data: {
    recipientName?: string
    title: string
    message: string
    ctaUrl?: string
    ctaText?: string
  }
}

export const sendEmail = async (params: SendEmailParams): Promise<{ ok: boolean; message_id?: string }> => {
  const { data, error } = await supabase.functions.invoke('send-email', {
    body: {
      template: params.template,
      to: params.to,
      subject: params.subject,
      brand_name: params.brandName,
      data: {
        recipient_name: params.data.recipientName,
        title: params.data.title,
        message: params.data.message,
        cta_url: params.data.ctaUrl,
        cta_text: params.data.ctaText,
      },
    },
  })

  if (error) throw new Error(`Email send failed: ${error.message}`)
  if (data?.error) throw new Error(data.error)

  return data
}
