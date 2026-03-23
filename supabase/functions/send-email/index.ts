// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { emailCorsHeaders, resolveTenantBranding, wrapEmailHtml } from '../_shared/emailTemplate.ts'

interface EmailData {
  recipient_name?: string
  title: string
  message: string
  cta_url?: string
  cta_text?: string
}

const templateConfig: Record<string, { accent: string; icon: string }> = {
  task_assigned:      { accent: '#3b82f6', icon: '&#128203;' },
  task_completed:     { accent: '#10b981', icon: '&#9989;' },
  deadline_reminder:  { accent: '#f59e0b', icon: '&#9200;' },
  task_overdue:       { accent: '#ef4444', icon: '&#128308;' },
  project_update:     { accent: '#8b5cf6', icon: '&#128640;' },
  system_alert:       { accent: '#ef4444', icon: '&#128680;' },
  role_changed:       { accent: '#8b5cf6', icon: '&#128100;' },
  member_suspended:   { accent: '#f59e0b', icon: '&#9888;' },
  member_activated:   { accent: '#10b981', icon: '&#9989;' },
  member_removed:     { accent: '#ef4444', icon: '&#128683;' },
  team_invite:        { accent: '#3b82f6', icon: '&#128231;' },
  welcome:            { accent: '#10b981', icon: '&#128075;' },
  daily_schedule:     { accent: '#3b82f6', icon: '&#128197;' },
  weekly_digest:      { accent: '#8b5cf6', icon: '&#128202;' },
}

function buildWelcomeSection(): string {
  const features = [
    { icon: '&#128188;', label: 'Projects & Tasks', desc: 'Manage projects, assign tasks, track deadlines' },
    { icon: '&#128197;', label: 'Calendar & Events', desc: 'Schedule meetings, set reminders, plan your week' },
    { icon: '&#128176;', label: 'Finance', desc: 'Track income, expenses, and client payments' },
    { icon: '&#128101;', label: 'Team', desc: 'Collaborate with your team in real time' },
  ]

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
      <tr><td style="padding-bottom:12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;color:#78736A;">Everything you need</td></tr>
      ${features.map(f => `
        <tr>
          <td style="padding:10px 16px;background-color:#fafaf8;border-radius:8px;border-left:3px solid #10b981;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
              <td width="32" valign="top" style="font-size:20px;padding-right:12px;">${f.icon}</td>
              <td>
                <div style="font-size:13px;font-weight:600;color:#18181b;margin-bottom:2px;">${f.label}</div>
                <div style="font-size:12px;color:#78736A;line-height:1.4;">${f.desc}</div>
              </td>
            </tr></table>
          </td>
        </tr>
        <tr><td style="height:6px;"></td></tr>`).join('')}
    </table>`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: emailCorsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...emailCorsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: 'Missing RESEND_API_KEY' }), {
        status: 500,
        headers: { ...emailCorsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { template, to, subject, brand_name, logo_url, tenant_id, data } = await req.json()

    if (!to || !subject || !data?.title) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, subject, data.title' }),
        { status: 400, headers: { ...emailCorsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Resolve branding: prefer DB lookup, fallback to params
    let resolvedLogo: string | null = logo_url || null
    let brandName = brand_name || 'LIVV OS'

    if (tenant_id) {
      const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      const branding = await resolveTenantBranding(sb, tenant_id)
      if (branding.logoUrl) resolvedLogo = branding.logoUrl
      if (!brand_name) brandName = branding.name
    }

    const config = templateConfig[template] || templateConfig.system_alert
    const firstName = (data as EmailData).recipient_name?.split(' ')[0] || ''
    const greeting = firstName ? `Hi ${firstName},` : 'Hi,'

    // Build inner body content
    let innerBody = (data as EmailData).message
    if (template === 'welcome') {
      innerBody += buildWelcomeSection()
    }

    const htmlBody = wrapEmailHtml({
      accent: config.accent,
      brandName,
      logoUrl: resolvedLogo,
      greeting,
      title: (data as EmailData).title,
      icon: config.icon,
      bodyHtml: innerBody,
      ctaUrl: (data as EmailData).cta_url,
      ctaText: (data as EmailData).cta_text,
    })

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${brandName} <noreply@livv.space>`,
        to: [to],
        subject,
        html: htmlBody,
      }),
    })

    if (!resendResponse.ok) {
      const errText = await resendResponse.text()
      return new Response(JSON.stringify({ error: `Resend error: ${errText}` }), {
        status: 500,
        headers: { ...emailCorsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const resendData = await resendResponse.json()

    return new Response(JSON.stringify({ ok: true, message_id: resendData.id }), {
      headers: { ...emailCorsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...emailCorsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
