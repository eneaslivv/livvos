// Shared email template system for all Edge Functions
// Provides unified layout, logo resolution, and CORS headers

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── CORS ─────────────────────────────────────────────
export const emailCorsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGINS') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, x-custom-version, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ── Types ────────────────────────────────────────────
export interface TenantBranding {
  name: string
  logoUrl: string | null
}

export interface EmailLayoutOptions {
  accent: string
  brandName: string
  logoUrl: string | null
  greeting: string
  title?: string
  icon?: string
  bodyHtml: string
  ctaUrl?: string
  ctaText?: string
  footerExtra?: string
}

// ── Tenant branding lookup ───────────────────────────
export async function resolveTenantBranding(
  supabase: ReturnType<typeof createClient>,
  tenantId: string
): Promise<TenantBranding> {
  try {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name, logo_url, logo_url_dark')
      .eq('id', tenantId)
      .single()
    return {
      name: tenant?.name || 'LIVV OS',
      logoUrl: tenant?.logo_url_dark || tenant?.logo_url || null,
    }
  } catch {
    return { name: 'LIVV OS', logoUrl: null }
  }
}

// ── Logo HTML ────────────────────────────────────────
export function buildLogoHtml(
  logoUrl: string | null | undefined,
  brandName: string,
  accent: string
): string {
  if (logoUrl) {
    return `<img src="${logoUrl}" alt="${brandName}" style="max-height:48px;max-width:220px;object-fit:contain;" />`
  }
  const initial = brandName.charAt(0).toUpperCase()
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
    <td style="width:38px;height:38px;background-color:${accent};border-radius:10px;text-align:center;vertical-align:middle;font-size:18px;font-weight:700;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      ${initial}
    </td>
    <td style="padding-left:12px;font-size:18px;font-weight:600;color:#ffffff;letter-spacing:0.4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      ${brandName}
    </td>
  </tr></table>`
}

// ── Unified email layout ─────────────────────────────
export function wrapEmailHtml(options: EmailLayoutOptions): string {
  const {
    accent,
    brandName,
    logoUrl,
    greeting,
    title,
    icon,
    bodyHtml,
    ctaUrl,
    ctaText,
    footerExtra,
  } = options

  const logoHtml = buildLogoHtml(logoUrl, brandName, accent)

  const titleBlock = title
    ? `<h2 style="margin:0 0 16px;font-size:16px;font-weight:600;color:#18181b;line-height:1.4;">
        ${icon ? `${icon} ` : ''}${title}
      </h2>`
    : ''

  const ctaBlock = ctaUrl
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="padding:8px 0 0;">
            <a href="${ctaUrl}"
               style="display:inline-block;padding:14px 40px;background-color:#18181b;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:999px;letter-spacing:0.3px;box-shadow:0 2px 8px rgba(0,0,0,0.12);">
              ${ctaText || 'View Details'} &rarr;
            </a>
          </td>
        </tr>
      </table>`
    : ''

  const footerExtraHtml = footerExtra
    ? `<p style="margin:0 0 8px;font-size:11px;color:#78736A;font-weight:500;">${footerExtra}</p>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f5f3ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f3ee;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0a0a0a 0%,#141414 100%);padding:36px 40px;text-align:center;">
              ${logoHtml}
            </td>
          </tr>
          <!-- Accent bar -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,${accent},${accent}99);font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 36px;">
              <h1 style="margin:0 0 8px;font-size:24px;font-weight:600;color:#18181b;font-family:Georgia,'Times New Roman',serif;letter-spacing:-0.3px;">
                ${greeting}
              </h1>
              ${titleBlock}
              <div style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#52525b;">
                ${bodyHtml}
              </div>
              ${ctaBlock}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 36px;background-color:#fafaf8;border-top:1px solid #e6e2d8;text-align:center;">
              ${footerExtraHtml}
              <p style="margin:0;font-size:11px;color:#a1a1aa;">
                &copy; ${new Date().getFullYear()} ${brandName}. All rights reserved.
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
