// Gmail OAuth — finish.
//
// Google redirects here with ?code=…&state=… after the user authorizes.
// We:
//   1. Verify the state JWT (CSRF protection)
//   2. Exchange the code for access + refresh tokens
//   3. Hit Google's userinfo endpoint to get the connected email address
//   4. UPSERT into integration_tokens (replace row if same gmail_email
//      reconnects)
//   5. Redirect the browser back to the eneas-os communications page
//
// We do NOT auto-watch the mailbox here (that's a separate Pub/Sub
// setup). gmail-sync will catch up the inbox the first time it runs.

import { adminClient, verifyOAuthState, commCorsHeaders } from '../_shared/comm-utils.ts'

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!
const GOOGLE_REDIRECT_URI = Deno.env.get('GOOGLE_REDIRECT_URI')
  ?? `${Deno.env.get('SUPABASE_URL')}/functions/v1/gmail-callback`
const APP_URL = Deno.env.get('APP_URL') || 'http://localhost:5173'

// Build the redirect URL the user lands on after success/failure.
const redirectBack = (status: 'success' | 'error', detail?: string) => {
  const url = new URL(`${APP_URL}/`)
  url.searchParams.set('view', 'communications')
  url.searchParams.set('connect', `gmail_${status}`)
  if (detail) url.searchParams.set('detail', detail.slice(0, 200))
  return Response.redirect(url.toString(), 302)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: commCorsHeaders })

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const oauthError = url.searchParams.get('error')

  if (oauthError) return redirectBack('error', oauthError)
  if (!code || !state) return redirectBack('error', 'missing code or state')

  // 1. CSRF check
  const verified = await verifyOAuthState(state)
  if (!verified) return redirectBack('error', 'invalid or expired state')

  try {
    // 2. Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
    })
    if (!tokenRes.ok) {
      const t = await tokenRes.text()
      return redirectBack('error', `token exchange failed: ${t.slice(0, 100)}`)
    }
    const tokens = await tokenRes.json() as {
      access_token: string
      refresh_token?: string
      expires_in: number
      scope: string
      token_type: string
    }

    // 3. Get the connected user's email
    const userInfoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    if (!userInfoRes.ok) return redirectBack('error', 'failed to fetch userinfo')
    const userInfo = await userInfoRes.json() as { email: string; sub: string }
    const gmailEmail = userInfo.email
    if (!gmailEmail) return redirectBack('error', 'no email returned')

    // 4. UPSERT into integration_tokens
    const admin = adminClient()
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    // Look for an existing row to preserve refresh_token if Google didn't
    // give us a new one (re-auth without prompt=consent loses it).
    const { data: existing } = await admin
      .from('integration_tokens')
      .select('id, refresh_token')
      .eq('tenant_id', verified.tenant_id)
      .eq('platform', 'gmail')
      .eq('gmail_email', gmailEmail)
      .maybeSingle()

    const refreshToken = tokens.refresh_token || existing?.refresh_token || null

    if (existing) {
      const { error } = await admin.from('integration_tokens').update({
        access_token: tokens.access_token,
        refresh_token: refreshToken,
        token_type: tokens.token_type,
        scope: tokens.scope,
        expires_at: expiresAt,
        is_active: true,
      }).eq('id', existing.id)
      if (error) return redirectBack('error', `update failed: ${error.message.slice(0, 80)}`)
    } else {
      const { error } = await admin.from('integration_tokens').insert({
        tenant_id: verified.tenant_id,
        platform: 'gmail',
        access_token: tokens.access_token,
        refresh_token: refreshToken,
        token_type: tokens.token_type,
        scope: tokens.scope,
        expires_at: expiresAt,
        gmail_email: gmailEmail,
        is_active: true,
        created_by: verified.user_id,
      })
      if (error) return redirectBack('error', `insert failed: ${error.message.slice(0, 80)}`)
    }

    // 5. Done
    return redirectBack('success', gmailEmail)
  } catch (err) {
    return redirectBack('error', (err as Error).message.slice(0, 100))
  }
})
