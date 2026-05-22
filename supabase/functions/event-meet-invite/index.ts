// @ts-nocheck
// Supabase Edge Function: event-meet-invite
//
// Creates a Google Meet video conference for a calendar event and emails
// the invitee with the meet link. Uses the owner's Google OAuth tokens
// (same integration_credentials row used by google-calendar-sync).
//
// POST /functions/v1/event-meet-invite
// body: { event_id: string }
// returns: { meet_link, external_event_id, invite_sent }
//
// Required env (same as google-calendar-sync):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ENCRYPTION_MASTER_KEY
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY (or via send-email)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.2';

const allowedOrigin = Deno.env.get('ALLOWED_ORIGINS') || '*';
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'missing_authorization' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
  const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
  const encryptionKey = Deno.env.get('ENCRYPTION_MASTER_KEY')!;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) return json({ error: 'invalid_jwt' }, 401);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const eventId = body?.event_id;
  if (!eventId) return json({ error: 'event_id_required' }, 400);

  // ── 1. Load event + verify ownership ─────────────────────────────────
  const { data: event, error: eventErr } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('id', eventId)
    .maybeSingle();
  if (eventErr || !event) return json({ error: 'event_not_found' }, 404);
  if (event.owner_id !== user.id) {
    return json({ error: 'forbidden — not event owner' }, 403);
  }
  if (!event.invitee_email) {
    return json({ error: 'invitee_email_required_on_event' }, 400);
  }

  // ── 2. Load Google OAuth credentials ─────────────────────────────────
  const { data: cred, error: credError } = await supabase
    .from('integration_credentials')
    .select('*')
    .eq('user_id', user.id)
    .eq('provider', 'google_calendar')
    .eq('is_active', true)
    .single();
  if (credError || !cred) {
    await markInviteError(supabase, eventId, 'google_calendar_not_connected');
    return json({
      error: 'google_calendar_not_connected',
      hint: 'Conectá tu Google Calendar en Settings → Integrations primero.',
    }, 400);
  }

  // ── 3. Decrypt + refresh token if needed ─────────────────────────────
  let accessToken: string;
  try {
    const tokens = JSON.parse(await decryptTokens(cred.encrypted_tokens, encryptionKey));
    accessToken = tokens.access_token;
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
      });
      if (!refreshResp.ok) {
        const errText = await refreshResp.text();
        await markInviteError(supabase, eventId, `token_refresh_failed: ${errText}`);
        return json({ error: 'token_refresh_failed', detail: errText }, 401);
      }
      const refreshed = await refreshResp.json();
      accessToken = refreshed.access_token;
      const newTokens = {
        ...tokens,
        access_token: refreshed.access_token,
        expires_at: Date.now() + refreshed.expires_in * 1000,
      };
      const encrypted = await encryptTokens(JSON.stringify(newTokens), encryptionKey);
      await supabase.from('integration_credentials').update({
        encrypted_tokens: encrypted,
        updated_at: new Date().toISOString(),
      }).eq('id', cred.id);
    }
  } catch (e) {
    await markInviteError(supabase, eventId, `decrypt_failed: ${e?.message}`);
    return json({ error: 'decrypt_failed', detail: e?.message }, 500);
  }

  // ── 4. Build Google Calendar event payload with conferenceData ───────
  // Google generará el Meet link automáticamente cuando conferenceData.createRequest
  // tenga conferenceSolutionKey.type='hangoutsMeet'.
  const startDate = event.start_date;
  const startTime = event.start_time || '09:00:00';
  const duration = event.duration || 60;
  const startIso = `${startDate}T${startTime.length === 8 ? startTime : startTime + ':00'}`;
  const startDt = new Date(startIso);
  const endDt = new Date(startDt.getTime() + duration * 60 * 1000);

  const requestId = `livv-meet-${event.id.slice(0, 8)}-${Date.now()}`;
  const googlePayload = {
    summary: event.title,
    description: (event.description || '') +
      `\n\n— Creado desde LIVV OS · ${new Date().toISOString().slice(0, 10)}`,
    location: event.location || undefined,
    start: { dateTime: startDt.toISOString() },
    end: { dateTime: endDt.toISOString() },
    attendees: [
      { email: event.invitee_email, displayName: event.invitee_name || undefined },
    ],
    conferenceData: {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 60 },
        { method: 'popup', minutes: 10 },
      ],
    },
  };

  // ── 5. Create event in Google Calendar (with conferenceDataVersion=1) ─
  const googleUrl = 'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all';
  const googleResp = await fetch(googleUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(googlePayload),
  });

  if (!googleResp.ok) {
    const errText = await googleResp.text();
    await markInviteError(supabase, eventId, `google_api_failed: ${errText.slice(0, 500)}`);
    return json({ error: 'google_api_failed', detail: errText.slice(0, 500) }, 500);
  }
  const googleEvent = await googleResp.json();
  const meetLink = googleEvent.hangoutLink || googleEvent.conferenceData?.entryPoints?.[0]?.uri || null;
  const externalEventId = googleEvent.id;

  // ── 6. Update local calendar_events row ──────────────────────────────
  await supabase.from('calendar_events').update({
    meet_link: meetLink,
    external_event_id: externalEventId,
    invite_sent_at: new Date().toISOString(),
    invite_error: null,
  }).eq('id', eventId);

  // ── 7. Send branded email to invitee via send-email function ─────────
  // (Google ya envía su propio invite vía sendUpdates=all; este es el
  //  livv-branded follow-up con el link bien destacado.)
  let inviteEmailOk = false;
  try {
    const { data: ownerProfile } = await supabase
      .from('profiles').select('name, email, tenant_id').eq('id', user.id).maybeSingle();
    const ownerName = ownerProfile?.name || user.email?.split('@')[0] || 'Tu contacto';
    const dateLabel = startDt.toLocaleString('es-AR', {
      weekday: 'long', day: 'numeric', month: 'long',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });

    const sendResp = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        template: 'meeting_invite',
        to: event.invitee_email,
        subject: `${ownerName} te invitó a una reunión: ${event.title}`,
        brand_name: 'LIVV',
        tenant_id: ownerProfile?.tenant_id || event.tenant_id,
        data: {
          recipient_name: event.invitee_name || event.invitee_email.split('@')[0],
          title: event.title,
          message:
            `${ownerName} te invitó a una reunión.\n\n` +
            `📅 ${dateLabel}\n` +
            `⏱️ Duración: ${duration} minutos\n` +
            (event.description ? `\n${event.description}\n` : '') +
            (event.location ? `\n📍 ${event.location}\n` : '') +
            `\nUsá el botón de abajo para unirte al Google Meet cuando arranque la reunión. ` +
            `También recibís el invite directo en tu Google Calendar.`,
          cta_text: 'Unirme al Google Meet',
          cta_url: meetLink || googleEvent.htmlLink,
        },
      }),
    });
    inviteEmailOk = sendResp.ok;
  } catch (e) {
    // Email branding falló — no es fatal, Google ya mandó su propio invite.
    console.warn('Branded email send failed:', e);
  }

  return json({
    ok: true,
    meet_link: meetLink,
    external_event_id: externalEventId,
    google_html_link: googleEvent.htmlLink,
    invite_email_sent: inviteEmailOk,
    google_invite_sent: true,  // Google envió su propio invite vía sendUpdates=all
  }, 200);
});

function json(body: any, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function markInviteError(supabase: any, eventId: string, msg: string) {
  await supabase.from('calendar_events').update({ invite_error: msg }).eq('id', eventId);
}

// ── Encryption helpers (compat con google-calendar-sync) ───────────────
async function decryptTokens(encrypted: any, masterKey: string): Promise<string> {
  const decoder = new TextDecoder();
  const salt = Uint8Array.from(atob(encrypted.salt), (c) => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(encrypted.iv), (c) => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(encrypted.data), (c) => c.charCodeAt(0));
  const tag = Uint8Array.from(atob(encrypted.tag), (c) => c.charCodeAt(0));
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext);
  combined.set(tag, ciphertext.length);
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(masterKey), 'PBKDF2', false, ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, combined);
  return decoder.decode(decrypted);
}

async function encryptTokens(plaintext: string, masterKey: string) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(masterKey), 'PBKDF2', false, ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext),
  );
  const data = new Uint8Array(encrypted);
  const ciphertext = data.slice(0, data.length - 16);
  const tag = data.slice(data.length - 16);
  return {
    salt: btoa(String.fromCharCode(...salt)),
    iv: btoa(String.fromCharCode(...iv)),
    data: btoa(String.fromCharCode(...ciphertext)),
    tag: btoa(String.fromCharCode(...tag)),
  };
}
