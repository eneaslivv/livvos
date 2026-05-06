// Shared utilities for the Communications Hub edge functions.
//
// Edge functions run on Deno, so all imports go through esm.sh and we use
// Deno.env for secrets. This module centralizes:
//   - CORS headers
//   - Supabase admin client (service role) for cross-tenant operations
//   - User-context client (auth header) for RLS-respecting reads
//   - Auth helpers (resolve user_id + tenant_id from a request)
//   - State JWT signing/verification (used by OAuth flows for CSRF)
//   - Token refresh helper for Gmail (Slack tokens don't expire)

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── CORS ────────────────────────────────────────────────────────────
export const commCorsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGINS') || '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-custom-version, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...commCorsHeaders, 'Content-Type': 'application/json' },
  })

// ── Supabase clients ───────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

/** Service-role client — bypasses RLS. Use only after auth checks. */
export const adminClient = (): SupabaseClient =>
  createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

/** User-scoped client — respects RLS. Pass through the request's auth header. */
export const userClient = (req: Request): SupabaseClient => {
  const authHeader = req.headers.get('Authorization') || ''
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  })
}

// ── Auth: resolve current user + tenant ────────────────────────────
export interface AuthContext {
  user_id: string
  tenant_id: string
  role: string
}

/**
 * Authenticate a request and resolve the user's tenant_id. Throws on any
 * failure — wrap callers in try/catch and return 401/403 as appropriate.
 *
 * If `tenantOverride` is provided (e.g. the caller already passed a
 * tenant_id query param), we verify the user is a member of THAT tenant
 * (not just any tenant). Otherwise we use whichever tenant they're a
 * member of (most users belong to one).
 */
export async function authenticate(
  req: Request,
  tenantOverride?: string,
): Promise<AuthContext> {
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')
  if (!token) throw new Error('Missing Authorization header')

  const admin = adminClient()
  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !userData.user) throw new Error('Invalid token')
  const user_id = userData.user.id

  const { data: members, error: memErr } = await admin
    .from('tenant_members')
    .select('tenant_id, role')
    .eq('user_id', user_id)
  if (memErr) throw memErr
  if (!members || members.length === 0) throw new Error('No tenant membership')

  const member = tenantOverride
    ? members.find(m => m.tenant_id === tenantOverride)
    : members[0]
  if (!member) throw new Error('Not a member of the requested tenant')

  return { user_id, tenant_id: member.tenant_id, role: member.role }
}

// ── State JWT for OAuth CSRF ───────────────────────────────────────
const STATE_SECRET = Deno.env.get('OAUTH_STATE_SECRET') || Deno.env.get('SUPABASE_JWT_SECRET') || 'dev-secret-change-me'
const enc = new TextEncoder()
const dec = new TextDecoder()

const b64url = (data: Uint8Array): string =>
  btoa(String.fromCharCode(...data))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const fromB64url = (str: string): Uint8Array => {
  const pad = '='.repeat((4 - (str.length % 4)) % 4)
  const norm = (str + pad).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(norm), (c) => c.charCodeAt(0))
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(STATE_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return b64url(new Uint8Array(sig))
}

/** Sign a state JWT with tenant_id + user_id, valid for 15 minutes. */
export async function signOAuthState(payload: { tenant_id: string; user_id: string }): Promise<string> {
  const body = {
    ...payload,
    nonce: crypto.randomUUID(),
    exp: Math.floor(Date.now() / 1000) + 15 * 60, // 15 min
  }
  const encoded = b64url(enc.encode(JSON.stringify(body)))
  const sig = await hmac(encoded)
  return `${encoded}.${sig}`
}

export async function verifyOAuthState(state: string): Promise<{ tenant_id: string; user_id: string } | null> {
  const [encoded, sig] = state.split('.')
  if (!encoded || !sig) return null
  const expectedSig = await hmac(encoded)
  if (sig !== expectedSig) return null
  try {
    const body = JSON.parse(dec.decode(fromB64url(encoded)))
    if (typeof body.exp !== 'number' || body.exp < Math.floor(Date.now() / 1000)) return null
    return { tenant_id: body.tenant_id, user_id: body.user_id }
  } catch {
    return null
  }
}

// ── Gmail token refresh ────────────────────────────────────────────
export interface GmailTokenSet {
  access_token: string
  refresh_token?: string
  expires_at: string // ISO
}

/**
 * Refresh a Gmail access token if it's expired (or about to be).
 * Returns the latest valid access_token, optionally writing the new
 * value back to integration_tokens.
 */
export async function ensureFreshGmailToken(
  admin: SupabaseClient,
  tokenRow: { id: string; access_token: string; refresh_token: string | null; expires_at: string | null },
): Promise<string> {
  const expiresAt = tokenRow.expires_at ? new Date(tokenRow.expires_at).getTime() : 0
  // Refresh if <60s left, OR if expires_at is missing entirely.
  if (expiresAt && expiresAt - Date.now() > 60_000) return tokenRow.access_token
  if (!tokenRow.refresh_token) return tokenRow.access_token // no refresh possible

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: tokenRow.refresh_token,
    grant_type: 'refresh_token',
  })
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Gmail token refresh failed: ${res.status} — ${errBody}`)
  }
  const data = await res.json() as { access_token: string; expires_in: number }
  const newExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString()

  await admin.from('integration_tokens').update({
    access_token: data.access_token,
    expires_at: newExpiresAt,
  }).eq('id', tokenRow.id)

  return data.access_token
}
