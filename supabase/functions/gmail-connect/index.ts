// Gmail OAuth — start of the dance.
//
// The frontend calls this with `?tenant_id=<uuid>` and the user's auth
// header. We verify they're a member of that tenant, sign a state JWT
// (CSRF protection), and return a Google OAuth URL the frontend
// redirects them to.
//
// The user authenticates with Google → Google redirects to
// gmail-callback?code=…&state=… where we finish the dance.

import { authenticate, signOAuthState, json, commCorsHeaders } from '../_shared/comm-utils.ts'

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!
const GOOGLE_REDIRECT_URI = Deno.env.get('GOOGLE_REDIRECT_URI')
  ?? `${Deno.env.get('SUPABASE_URL')}/functions/v1/gmail-callback`

// Scopes:
//   gmail.readonly — read messages + threads
//   gmail.send     — send replies
//   gmail.modify   — mark as read, add labels
// userinfo.email   — get the address of the connected account
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid',
].join(' ')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: commCorsHeaders })

  try {
    const url = new URL(req.url)
    const tenantId = url.searchParams.get('tenant_id')
    if (!tenantId) return json({ error: 'tenant_id required' }, 400)

    const ctx = await authenticate(req, tenantId)
    const state = await signOAuthState({ tenant_id: ctx.tenant_id, user_id: ctx.user_id })

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID)
    authUrl.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', SCOPES)
    authUrl.searchParams.set('access_type', 'offline')   // refresh_token
    authUrl.searchParams.set('prompt', 'consent')        // force refresh_token even on re-auth
    authUrl.searchParams.set('state', state)

    return json({ auth_url: authUrl.toString() })
  } catch (err) {
    return json({ error: (err as Error).message }, 401)
  }
})
