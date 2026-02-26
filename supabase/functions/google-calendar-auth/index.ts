// @ts-nocheck
// Supabase Edge Function: Google Calendar OAuth
// Handles OAuth flow: get-auth-url, exchange-code, disconnect
// Requires: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, ENCRYPTION_MASTER_KEY

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No auth header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID')!
    const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!
    const encryptionKey = Deno.env.get('ENCRYPTION_MASTER_KEY')!
    const defaultRedirectUri = Deno.env.get('GOOGLE_REDIRECT_URI')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid user' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const { action, code, redirect_uri: redirectUriOverride } = body
    const redirectUri = redirectUriOverride || defaultRedirectUri

    // --- GET AUTH URL ---
    if (action === 'get-auth-url') {
      const scopes = ['https://www.googleapis.com/auth/calendar.readonly']
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      authUrl.searchParams.set('client_id', googleClientId)
      authUrl.searchParams.set('redirect_uri', redirectUri)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('scope', scopes.join(' '))
      authUrl.searchParams.set('access_type', 'offline')
      authUrl.searchParams.set('prompt', 'consent')
      authUrl.searchParams.set('state', user.id)

      return new Response(JSON.stringify({ url: authUrl.toString() }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // --- EXCHANGE CODE ---
    if (action === 'exchange-code') {
      if (!code) {
        return new Response(JSON.stringify({ error: 'Missing authorization code' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: googleClientId,
          client_secret: googleClientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      })

      if (!tokenResponse.ok) {
        const err = await tokenResponse.text()
        return new Response(JSON.stringify({ error: 'Token exchange failed', details: err }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const tokens = await tokenResponse.json()

      // Get Google email for display
      const userInfoResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })
      const userInfo = await userInfoResp.json()

      // Encrypt tokens
      const encryptedTokens = await encryptTokens(JSON.stringify({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: Date.now() + (tokens.expires_in * 1000),
      }), encryptionKey)

      // Upsert credentials
      const { error: upsertError } = await supabase
        .from('integration_credentials')
        .upsert({
          user_id: user.id,
          provider: 'google_calendar',
          encrypted_tokens: encryptedTokens,
          scopes: ['calendar.readonly'],
          external_email: userInfo.email,
          is_active: true,
          last_synced_at: null,
          sync_error: null,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,provider',
        })

      if (upsertError) {
        return new Response(JSON.stringify({ error: upsertError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ success: true, email: userInfo.email }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // --- DISCONNECT ---
    if (action === 'disconnect') {
      await supabase
        .from('integration_credentials')
        .delete()
        .eq('user_id', user.id)
        .eq('provider', 'google_calendar')

      // Remove synced events
      await supabase
        .from('calendar_events')
        .delete()
        .eq('owner_id', user.id)
        .eq('source', 'google')

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // --- CHECK STATUS ---
    if (action === 'status') {
      const { data, error } = await supabase
        .from('integration_credentials')
        .select('external_email, last_synced_at, sync_error, is_active')
        .eq('user_id', user.id)
        .eq('provider', 'google_calendar')
        .maybeSingle()

      return new Response(JSON.stringify({
        connected: !!data?.is_active,
        email: data?.external_email || null,
        last_synced_at: data?.last_synced_at || null,
        sync_error: data?.sync_error || null,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// AES-256-GCM encryption using Deno Web Crypto API
async function encryptTokens(plaintext: string, masterKey: string) {
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(32))
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(masterKey), 'PBKDF2', false, ['deriveKey']
  )
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  )

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  )

  const encryptedArray = new Uint8Array(encrypted)
  const ciphertext = encryptedArray.slice(0, -16)
  const tag = encryptedArray.slice(-16)

  return {
    data: btoa(String.fromCharCode(...ciphertext)),
    iv: btoa(String.fromCharCode(...iv)),
    tag: btoa(String.fromCharCode(...tag)),
    salt: btoa(String.fromCharCode(...salt)),
    version: 1,
  }
}
