// @ts-nocheck
// Supabase Edge Function: Google Calendar Sync
// Fetches events from Google Calendar API and upserts into calendar_events
// Requires: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ENCRYPTION_MASTER_KEY

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
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID')!
    const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!
    const encryptionKey = Deno.env.get('ENCRYPTION_MASTER_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid user' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1. Get integration credentials
    const { data: cred, error: credError } = await supabase
      .from('integration_credentials')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'google_calendar')
      .eq('is_active', true)
      .single()

    if (credError || !cred) {
      return new Response(JSON.stringify({ error: 'Google Calendar not connected' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Decrypt tokens
    const tokens = JSON.parse(await decryptTokens(cred.encrypted_tokens, encryptionKey))

    // 3. Refresh access token if expired
    let accessToken = tokens.access_token
    if (Date.now() >= tokens.expires_at) {
      const refreshResp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: googleClientId,
          client_secret: googleClientSecret,
          refresh_token: tokens.refresh_token,
          grant_type: 'refresh_token',
        }),
      })

      if (!refreshResp.ok) {
        const errText = await refreshResp.text()
        await supabase
          .from('integration_credentials')
          .update({
            sync_error: `Token refresh failed: ${errText}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', cred.id)

        return new Response(JSON.stringify({ error: 'Token refresh failed' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const refreshed = await refreshResp.json()
      accessToken = refreshed.access_token

      // Update stored tokens
      tokens.access_token = refreshed.access_token
      tokens.expires_at = Date.now() + (refreshed.expires_in * 1000)
      const newEncrypted = await encryptTokens(JSON.stringify(tokens), encryptionKey)
      await supabase
        .from('integration_credentials')
        .update({ encrypted_tokens: newEncrypted, updated_at: new Date().toISOString() })
        .eq('id', cred.id)
    }

    // 4. Fetch Google Calendar events
    const body = await req.json().catch(() => ({}))
    const timeMin = body.time_min || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const timeMax = body.time_max || new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()

    const calUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
    calUrl.searchParams.set('timeMin', timeMin)
    calUrl.searchParams.set('timeMax', timeMax)
    calUrl.searchParams.set('singleEvents', 'true')
    calUrl.searchParams.set('orderBy', 'startTime')
    calUrl.searchParams.set('maxResults', '250')

    const calResp = await fetch(calUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!calResp.ok) {
      const errText = await calResp.text()
      return new Response(JSON.stringify({ error: 'Google Calendar API failed', details: errText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const calData = await calResp.json()
    const googleEvents = calData.items || []

    // 5. Map Google events to calendar_events format
    const mappedEvents = googleEvents
      .filter((e: any) => e.status !== 'cancelled')
      .map((e: any) => {
        const startDt = e.start?.dateTime ? new Date(e.start.dateTime) : null
        const endDt = e.end?.dateTime ? new Date(e.end.dateTime) : null
        const isAllDay = !e.start?.dateTime && !!e.start?.date

        const startDate = isAllDay
          ? e.start.date
          : startDt?.toISOString().split('T')[0]

        const startTime = startDt
          ? `${startDt.getHours().toString().padStart(2, '0')}:${startDt.getMinutes().toString().padStart(2, '0')}`
          : null

        const duration = startDt && endDt
          ? Math.round((endDt.getTime() - startDt.getTime()) / 60000)
          : null

        return {
          owner_id: user.id,
          title: e.summary || '(Sin titulo)',
          description: e.description || null,
          start_date: startDate,
          start_time: startTime,
          duration: duration,
          type: 'meeting',
          color: '#4285f4', // Google blue
          all_day: isAllDay,
          location: e.location || null,
          source: 'google',
          external_id: e.id,
          external_updated_at: e.updated,
          read_only: true,
        }
      })

    // 6. Upsert into calendar_events
    if (mappedEvents.length > 0) {
      const { error: upsertError } = await supabase
        .from('calendar_events')
        .upsert(mappedEvents, {
          onConflict: 'owner_id,source,external_id',
          ignoreDuplicates: false,
        })

      if (upsertError) {
        return new Response(JSON.stringify({ error: upsertError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // 7. Clean up events deleted from Google
    // Get all external_ids we just synced
    const syncedIds = mappedEvents.map((e: any) => e.external_id)
    if (syncedIds.length > 0) {
      // Delete events from our DB that are no longer in Google's response
      // (within the same time window)
      const { data: existingEvents } = await supabase
        .from('calendar_events')
        .select('id, external_id')
        .eq('owner_id', user.id)
        .eq('source', 'google')
        .gte('start_date', timeMin.split('T')[0])
        .lte('start_date', timeMax.split('T')[0])

      if (existingEvents) {
        const toDelete = existingEvents
          .filter((e: any) => e.external_id && !syncedIds.includes(e.external_id))
          .map((e: any) => e.id)

        if (toDelete.length > 0) {
          await supabase
            .from('calendar_events')
            .delete()
            .in('id', toDelete)
        }
      }
    }

    // 8. Update last_synced_at
    await supabase
      .from('integration_credentials')
      .update({
        last_synced_at: new Date().toISOString(),
        sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cred.id)

    return new Response(JSON.stringify({
      success: true,
      synced_count: mappedEvents.length,
      total_google_events: googleEvents.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// AES-256-GCM decryption
async function decryptTokens(encrypted: any, masterKey: string): Promise<string> {
  const decoder = new TextDecoder()
  const salt = Uint8Array.from(atob(encrypted.salt), (c: string) => c.charCodeAt(0))
  const iv = Uint8Array.from(atob(encrypted.iv), (c: string) => c.charCodeAt(0))
  const ciphertext = Uint8Array.from(atob(encrypted.data), (c: string) => c.charCodeAt(0))
  const tag = Uint8Array.from(atob(encrypted.tag), (c: string) => c.charCodeAt(0))

  const combined = new Uint8Array(ciphertext.length + tag.length)
  combined.set(ciphertext)
  combined.set(tag, ciphertext.length)

  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(masterKey), 'PBKDF2', false, ['deriveKey']
  )
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  )

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    combined,
  )

  return decoder.decode(decrypted)
}

// AES-256-GCM encryption (for token refresh storage)
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
