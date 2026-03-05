// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

function buildInviteEmailHtml(clientName: string, inviteLink: string, brandName: string): string {
  const firstName = clientName.split(' ')[0]
  return `<!DOCTYPE html>
<html lang="es">
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
                Hola ${firstName},
              </h1>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#71717a;">
                Te invitamos a acceder a tu portal de cliente. Desde ahí vas a poder ver el progreso de tu proyecto, pagos, documentos y comunicarte directamente con el equipo.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 32px;">
                    <a href="${inviteLink}"
                       style="display:inline-block;padding:14px 36px;background-color:#059669;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:999px;letter-spacing:0.3px;">
                      Acceder al portal
                    </a>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #f4f4f5;padding-top:24px;">
                <tr>
                  <td style="padding:8px 0;">
                    <span style="font-size:13px;color:#10b981;font-weight:600;">&#10003; Progreso en vivo</span>
                    <span style="font-size:12px;color:#a1a1aa;"> — Seguí el avance de tu proyecto</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;">
                    <span style="font-size:13px;color:#10b981;font-weight:600;">&#10003; Pagos</span>
                    <span style="font-size:12px;color:#a1a1aa;"> — Consultá tu plan de pagos y estado</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;">
                    <span style="font-size:13px;color:#10b981;font-weight:600;">&#10003; Documentos</span>
                    <span style="font-size:12px;color:#a1a1aa;"> — Contratos, archivos y credenciales</span>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa;line-height:1.5;">
                Si el botón no funciona, copiá y pegá este enlace en tu navegador:<br>
                <a href="${inviteLink}" style="color:#059669;word-break:break-all;">${inviteLink}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;background-color:#fafafa;border-top:1px solid #f4f4f5;text-align:center;">
              <p style="margin:0;font-size:11px;color:#a1a1aa;">
                Portal seguro &bull; Datos encriptados<br>
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
        subject: `${client_name || 'Cliente'}, tu acceso al portal está listo`,
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
