// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { emailCorsHeaders, resolveTenantBranding, wrapEmailHtml } from '../_shared/emailTemplate.ts'

function buildFeaturesHtml(type: string, accent: string): string {
  const features = type === 'client'
    ? [
        { icon: '&#128202;', label: 'Live Progress', desc: 'Track your project in real time' },
        { icon: '&#128179;', label: 'Payments', desc: 'View your payment plan and status' },
        { icon: '&#128196;', label: 'Documents', desc: 'Contracts, files, and credentials' },
      ]
    : [
        { icon: '&#128188;', label: 'Projects', desc: 'Full project and task management' },
        { icon: '&#128197;', label: 'Calendar', desc: 'Events, deadlines, and planning' },
        { icon: '&#128101;', label: 'Team', desc: 'Real-time collaboration' },
      ]

  return `
    <!-- Divider -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:0 0 20px;"><div style="height:1px;background:linear-gradient(to right,transparent,#e6e2d8,transparent);"></div></td></tr>
    </table>
    <!-- Features -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding-bottom:12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;color:#78736A;">What you'll get</td></tr>
      ${features.map(f => `
        <tr>
          <td style="padding:10px 16px;background-color:#fafaf8;border-radius:8px;border-left:3px solid ${accent};">
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

    const { client_name, client_email, invite_link, tenant_name, invite_type, logo_url, tenant_id } = await req.json()

    if (!client_email || !invite_link) {
      return new Response(JSON.stringify({ error: 'Missing client_email or invite_link' }), {
        status: 400,
        headers: { ...emailCorsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const type = invite_type || 'team'
    const displayName = client_name || client_email.split('@')[0]
    const firstName = displayName.split(' ')[0]

    // Resolve branding: prefer DB lookup, fallback to params
    let brandName = tenant_name || 'livv'
    let resolvedLogo: string | null = logo_url || null

    if (tenant_id) {
      const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      const branding = await resolveTenantBranding(sb, tenant_id)
      if (branding.logoUrl) resolvedLogo = branding.logoUrl
      if (!tenant_name) brandName = branding.name
    }

    const isClient = type === 'client'
    const accent = isClient ? '#2C0405' : '#E8BC59'
    const ctaText = isClient ? 'Access Your Portal' : 'Join the Team'

    const intro = isClient
      ? 'You\'ve been invited to access your client portal. Track your project\'s progress, payments, documents, and communicate directly with the team.'
      : `You've been invited to join the <strong>${brandName}</strong> team. Complete your registration to start collaborating.`

    const fallbackLink = `<p style="margin:28px 0 0;font-size:11px;color:#a1a1aa;line-height:1.5;">
      If the button doesn't work, copy and paste this link:<br>
      <a href="${invite_link}" style="color:${accent};word-break:break-all;text-decoration:underline;">${invite_link}</a>
    </p>`

    const bodyHtml = `
      <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:#52525b;">${intro}</p>
      ${buildFeaturesHtml(type, accent)}
      ${fallbackLink}`

    const subject = isClient
      ? `${displayName}, your portal access is ready`
      : `${displayName}, you've been invited to the team`

    const htmlBody = wrapEmailHtml({
      accent,
      brandName,
      logoUrl: resolvedLogo,
      greeting: `Hi ${firstName},`,
      bodyHtml,
      ctaUrl: invite_link,
      ctaText,
      footerExtra: 'Secure portal &bull; Encrypted data &bull; End-to-end protection',
    })

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${brandName} <noreply@livv.space>`,
        to: [client_email],
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
