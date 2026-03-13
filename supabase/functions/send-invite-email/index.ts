// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const allowedOrigin = Deno.env.get('ALLOWED_ORIGINS') || '*'
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, x-custom-version, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

function buildInviteEmailHtml(clientName: string, inviteLink: string, brandName: string): string {
  const firstName = clientName.split(' ')[0]
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
              <div style="font-size:22px;font-weight:300;color:#ffffff;letter-spacing:2px;font-family:Georgia,serif;">
                ${brandName}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#18181b;">
                Hi ${firstName},
              </h1>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#71717a;">
                You've been invited to access your client portal. From there you can track your project's progress, payments, documents, and communicate directly with the team.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 32px;">
                    <a href="${inviteLink}"
                       style="display:inline-block;padding:14px 36px;background-color:#059669;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:999px;letter-spacing:0.3px;">
                      Access Your Portal
                    </a>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #f4f4f5;padding-top:24px;">
                <tr>
                  <td style="padding:8px 0;">
                    <span style="font-size:13px;color:#10b981;font-weight:600;">&#10003; Live progress</span>
                    <span style="font-size:12px;color:#a1a1aa;"> — Track your project in real time</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;">
                    <span style="font-size:13px;color:#10b981;font-weight:600;">&#10003; Payments</span>
                    <span style="font-size:12px;color:#a1a1aa;"> — View your payment plan and status</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;">
                    <span style="font-size:13px;color:#10b981;font-weight:600;">&#10003; Documents</span>
                    <span style="font-size:12px;color:#a1a1aa;"> — Contracts, files, and credentials</span>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa;line-height:1.5;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${inviteLink}" style="color:#059669;word-break:break-all;">${inviteLink}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;background-color:#fafafa;border-top:1px solid #f4f4f5;text-align:center;">
              <p style="margin:0;font-size:11px;color:#a1a1aa;">
                Secure portal &bull; Encrypted data<br>
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

    const { client_name, client_email, invite_link, tenant_name } = await req.json()

    if (!client_email || !invite_link) {
      return new Response(JSON.stringify({ error: 'Missing client_email or invite_link' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const brandName = tenant_name || 'Eneas OS'
    const htmlBody = buildInviteEmailHtml(client_name || client_email, invite_link, brandName)

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${brandName} <onboarding@resend.dev>`,
        to: [client_email],
        subject: `${client_name || 'Hi'}, your portal access is ready`,
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
