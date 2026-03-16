// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const allowedOrigin = Deno.env.get('ALLOWED_ORIGINS') || '*'
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, x-custom-version, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

function buildEmailHtml(name: string, inviteLink: string, brandName: string, type: string, logoUrl?: string): string {
  const firstName = name.split(' ')[0]
  const isClient = type === 'client'

  const accentColor = isClient ? '#2C0405' : '#b45309'
  const accentLight = isClient ? '#e8b4b4' : '#f59e0b'
  const btnColor = isClient ? '#2C0405' : '#18181b'
  const btnHover = isClient ? '#1a0203' : '#27272a'

  const heading = `Hi ${firstName},`

  const intro = isClient
    ? 'You\'ve been invited to access your client portal. Track your project\'s progress, payments, documents, and communicate directly with the team.'
    : `You've been invited to join the <strong>${brandName}</strong> team. Complete your registration to start collaborating.`

  const ctaText = isClient ? 'Access Your Portal' : 'Join the Team'

  const features = isClient
    ? [
        { label: 'Live Progress', desc: 'Track your project in real time' },
        { label: 'Payments', desc: 'View your payment plan and status' },
        { label: 'Documents', desc: 'Contracts, files, and credentials' },
      ]
    : [
        { label: 'Projects', desc: 'Full project and task management' },
        { label: 'Calendar', desc: 'Events, deadlines, and planning' },
        { label: 'Team', desc: 'Real-time collaboration' },
      ]

  const featuresHtml = features.map(f => `
    <tr>
      <td style="padding:6px 0;">
        <span style="font-size:13px;color:${accentLight};font-weight:600;">&#10003; ${f.label}</span>
        <span style="font-size:12px;color:#a1a1aa;"> &mdash; ${f.desc}</span>
      </td>
    </tr>`).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#faf9f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#faf9f7;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <!-- Header -->
          <tr>
            <td style="background-color:#0a0a0a;padding:28px 40px;text-align:center;">
              ${logoUrl
                ? `<img src="${logoUrl}" alt="${brandName}" style="max-height:48px;max-width:200px;object-fit:contain;" />`
                : `<div style="font-size:24px;font-weight:300;color:#ffffff;letter-spacing:3px;font-family:Georgia,'Times New Roman',serif;">
                livv<span style="color:${accentLight};">~</span>
              </div>`}
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:40px;">
              <h1 style="margin:0 0 12px;font-size:24px;font-weight:400;color:#18181b;font-family:Georgia,'Times New Roman',serif;">
                ${heading}
              </h1>
              <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:#71717a;">
                ${intro}
              </p>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:4px 0 32px;">
                    <a href="${inviteLink}"
                       style="display:inline-block;padding:14px 40px;background-color:${btnColor};color:#ffffff;font-size:15px;font-weight:500;text-decoration:none;border-radius:999px;letter-spacing:0.3px;">
                      ${ctaText} &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Features -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #f4f4f5;padding-top:20px;">
                ${featuresHtml}
              </table>

              <!-- Fallback link -->
              <p style="margin:28px 0 0;font-size:12px;color:#a1a1aa;line-height:1.5;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${inviteLink}" style="color:${accentColor};word-break:break-all;">${inviteLink}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;background-color:#0a0a0a;text-align:center;">
              <p style="margin:0;font-size:11px;color:#71717a;">
                Secure portal &bull; Encrypted data
              </p>
              <p style="margin:4px 0 0;font-size:11px;color:#52525b;">
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

    const { client_name, client_email, invite_link, tenant_name, invite_type, logo_url } = await req.json()

    if (!client_email || !invite_link) {
      return new Response(JSON.stringify({ error: 'Missing client_email or invite_link' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const brandName = tenant_name || 'livv'
    const type = invite_type || 'team'
    const displayName = client_name || client_email.split('@')[0]
    const htmlBody = buildEmailHtml(displayName, invite_link, brandName, type, logo_url)

    const subject = type === 'client'
      ? `${displayName}, your portal access is ready`
      : `${displayName}, you've been invited to the team`

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
