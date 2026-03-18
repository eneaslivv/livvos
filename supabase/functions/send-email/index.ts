// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const allowedOrigin = Deno.env.get('ALLOWED_ORIGINS') || '*'
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, x-custom-version, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface EmailData {
  recipient_name?: string
  title: string
  message: string
  cta_url?: string
  cta_text?: string
}

// Template-specific accent colors and icons
const templateConfig: Record<string, { accent: string; icon: string }> = {
  task_assigned:      { accent: '#3b82f6', icon: '&#128203;' }, // blue, clipboard
  task_completed:     { accent: '#10b981', icon: '&#9989;' },   // green, check
  deadline_reminder:  { accent: '#f59e0b', icon: '&#9200;' },   // amber, alarm
  task_overdue:       { accent: '#ef4444', icon: '&#128308;' }, // red, red circle
  project_update:     { accent: '#8b5cf6', icon: '&#128640;' }, // violet, rocket
  system_alert:       { accent: '#ef4444', icon: '&#128680;' }, // red, rotating light
  role_changed:       { accent: '#8b5cf6', icon: '&#128100;' }, // violet, person
  member_suspended:   { accent: '#f59e0b', icon: '&#9888;' },   // amber, warning
  member_activated:   { accent: '#10b981', icon: '&#9989;' },   // green, check
  member_removed:     { accent: '#ef4444', icon: '&#128683;' }, // red, no entry
  team_invite:        { accent: '#3b82f6', icon: '&#128231;' }, // blue, envelope
}

function buildEmailHtml(
  template: string,
  data: EmailData,
  brandName: string,
  logoUrl?: string
): string {
  const config = templateConfig[template] || templateConfig.system_alert
  const firstName = data.recipient_name?.split(' ')[0] || ''
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,'

  const ctaBlock = data.cta_url
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="padding:8px 0 32px;">
            <a href="${data.cta_url}"
               style="display:inline-block;padding:14px 36px;background-color:${config.accent};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:999px;letter-spacing:0.3px;">
              ${data.cta_text || 'View Details'}
            </a>
          </td>
        </tr>
      </table>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fafafa;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:#0a0a0a;padding:32px 40px;text-align:center;">
              ${logoUrl
                ? `<img src="${logoUrl}" alt="${brandName}" style="max-height:40px;max-width:180px;object-fit:contain;" />`
                : `<div style="font-size:22px;font-weight:300;color:#ffffff;letter-spacing:2px;font-family:Georgia,serif;">${brandName}</div>`
              }
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#18181b;">
                ${greeting}
              </h1>
              <h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#18181b;">
                ${config.icon} ${data.title}
              </h2>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#71717a;">
                ${data.message}
              </p>
              ${ctaBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;background-color:#fafafa;border-top:1px solid #f4f4f5;text-align:center;">
              <p style="margin:0;font-size:11px;color:#a1a1aa;">
                &copy; ${new Date().getFullYear()} ${brandName}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: 'Missing RESEND_API_KEY' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { template, to, subject, brand_name, logo_url, tenant_id, data } = await req.json()

    if (!to || !subject || !data?.title) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, subject, data.title' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Resolve logo: use provided logo_url, or look up from tenant
    let resolvedLogo = logo_url || undefined
    let brandName = brand_name || 'LIVV OS'
    if (!resolvedLogo && tenant_id) {
      try {
        const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
        const { data: tenant } = await sb.from('tenants').select('name, logo_url, logo_url_dark').eq('id', tenant_id).single()
        if (tenant?.logo_url_dark) resolvedLogo = tenant.logo_url_dark
        else if (tenant?.logo_url) resolvedLogo = tenant.logo_url
        if (tenant?.name && !brand_name) brandName = tenant.name
      } catch (_) { /* ignore */ }
    }

    const htmlBody = buildEmailHtml(template || 'system_alert', data, brandName, resolvedLogo)

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${brandName} <onboarding@resend.dev>`,
        to: [to],
        subject,
        html: htmlBody,
      }),
    })

    if (!resendResponse.ok) {
      const errText = await resendResponse.text()
      return new Response(JSON.stringify({ error: `Resend error: ${errText}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const resendData = await resendResponse.json()

    return new Response(JSON.stringify({ ok: true, message_id: resendData.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
