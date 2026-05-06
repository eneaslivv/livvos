// Gmail manual sync.
//
// POST { tenant_id, limit? } from the frontend "Sync now" button.
//
// Flow per connected Gmail account:
//   1. Get a fresh access_token (refresh if expired)
//   2. List the most-recent N message IDs in the inbox
//   3. Filter out ones we already have in communication_messages
//      (deduplication via external_id)
//   4. For each new one: fetch full payload + thread context
//   5. Insert into communication_messages
//   6. Fire-and-forget classify-and-update for each row
//   7. Update last_sync_at on the integration_tokens row
//
// Returns { synced: N, errors: [...] } so the frontend can toast.

import { authenticate, adminClient, ensureFreshGmailToken, json, commCorsHeaders } from '../_shared/comm-utils.ts'

interface ParsedHeader { name: string; value: string }
interface GmailMessagePayload {
  id: string
  threadId: string
  internalDate: string  // ms since epoch
  snippet?: string
  payload: {
    headers: ParsedHeader[]
    body?: { data?: string; size?: number }
    parts?: Array<{ mimeType: string; body?: { data?: string }; parts?: any[] }>
  }
}

const headerVal = (headers: ParsedHeader[], name: string): string => {
  const h = headers.find(x => x.name.toLowerCase() === name.toLowerCase())
  return h?.value || ''
}

const decodeB64Url = (data: string): string => {
  if (!data) return ''
  const norm = data.replace(/-/g, '+').replace(/_/g, '/')
  const pad = '='.repeat((4 - (norm.length % 4)) % 4)
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(norm + pad), c => c.charCodeAt(0)))
  } catch {
    return ''
  }
}

// Walk the MIME tree and pick the best plain-text and html parts.
const extractBodies = (payload: GmailMessagePayload['payload']): { text: string; html: string } => {
  let text = ''
  let html = ''
  const walk = (part: any) => {
    if (!part) return
    const mime = (part.mimeType || '').toLowerCase()
    const data = part.body?.data
    if (data) {
      const decoded = decodeB64Url(data)
      if (mime === 'text/plain' && !text) text = decoded
      else if (mime === 'text/html' && !html) html = decoded
    }
    if (Array.isArray(part.parts)) part.parts.forEach(walk)
  }
  walk(payload)
  // If only html, derive plain text by stripping tags.
  if (!text && html) {
    text = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/\n{3,}/g, '\n\n').trim()
  }
  return { text, html }
}

// Parse "Display Name <email@host>" → { name, email }
const parseFromHeader = (raw: string): { name: string; email: string } => {
  const match = raw.match(/^(.*?)<([^>]+)>$/)
  if (match) return { name: match[1].trim().replace(/^"|"$/g, ''), email: match[2].trim() }
  return { name: raw.trim(), email: raw.trim() }
}

async function gmailFetch(accessToken: string, path: string): Promise<any> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Gmail API ${res.status}: ${(await res.text()).slice(0, 120)}`)
  return res.json()
}

// Background: classify a freshly-inserted message and write the result back.
async function classifyAndUpdate(admin: any, messageId: string, classifyInput: any) {
  try {
    // Call the gemini edge function directly (server-to-server). We use the
    // anon key — the function accepts authenticated requests but the comm_classify
    // prompt doesn't need RLS, just rate-limit protection.
    const supaUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const res = await fetch(`${supaUrl}/functions/v1/gemini`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'comm_classify', input: JSON.stringify(classifyInput) }),
    })
    if (!res.ok) {
      console.error('[gmail-sync] classify failed:', res.status, await res.text())
      return
    }
    const { result } = await res.json()
    if (!result) return
    await admin.from('communication_messages').update({
      ai_processed: true,
      ai_classification: result,
    }).eq('id', messageId)
  } catch (err) {
    console.error('[gmail-sync] classify error:', err)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: commCorsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405)

  try {
    const { tenant_id, limit = 50 } = await req.json() as { tenant_id?: string; limit?: number }
    if (!tenant_id) return json({ error: 'tenant_id required' }, 400)

    const ctx = await authenticate(req, tenant_id)
    const admin = adminClient()

    // Fetch all Gmail tokens for this tenant.
    const { data: tokens, error: tokErr } = await admin
      .from('integration_tokens')
      .select('id, gmail_email, access_token, refresh_token, expires_at')
      .eq('tenant_id', ctx.tenant_id)
      .eq('platform', 'gmail')
      .eq('is_active', true)
    if (tokErr) return json({ error: tokErr.message }, 500)
    if (!tokens || tokens.length === 0) {
      return json({ synced: 0, errors: ['No Gmail accounts connected'] })
    }

    // Get tenant name for the AI's "we" perspective.
    const { data: tenantRow } = await admin
      .from('tenants').select('name').eq('id', ctx.tenant_id).maybeSingle()
    const agencyName = tenantRow?.name || 'this agency'

    let totalSynced = 0
    const errors: string[] = []
    const cap = Math.min(Math.max(1, limit), 200)

    for (const tok of tokens) {
      try {
        const accessToken = await ensureFreshGmailToken(admin, tok)

        // 1. List recent message IDs in the INBOX.
        const list = await gmailFetch(
          accessToken,
          `/users/me/messages?labelIds=INBOX&maxResults=${cap}&q=newer_than:30d`,
        ) as { messages?: Array<{ id: string; threadId: string }> }
        const candidateIds = (list.messages || []).map(m => m.id)
        if (candidateIds.length === 0) continue

        // 2. Filter out IDs we already have.
        const { data: existing } = await admin
          .from('communication_messages')
          .select('external_id')
          .eq('tenant_id', ctx.tenant_id)
          .eq('platform', 'gmail')
          .in('external_id', candidateIds)
        const haveSet = new Set((existing || []).map((r: any) => r.external_id))
        const newIds = candidateIds.filter(id => !haveSet.has(id))

        // 3. For each new id, fetch full payload + (optionally) thread context.
        for (const msgId of newIds) {
          try {
            const m = await gmailFetch(accessToken, `/users/me/messages/${msgId}?format=full`) as GmailMessagePayload
            const headers = m.payload.headers
            const subject = headerVal(headers, 'Subject')
            const fromRaw = headerVal(headers, 'From')
            const { name: fromName, email: fromEmail } = parseFromHeader(fromRaw)
            const { text, html } = extractBodies(m.payload)

            // Thread context — fetch up to 5 prior messages in the same thread.
            let threadContext: Array<{ from: string; body: string; date: string }> = []
            try {
              const t = await gmailFetch(accessToken, `/users/me/threads/${m.threadId}`) as { messages?: GmailMessagePayload[] }
              const others = (t.messages || []).filter(x => x.id !== m.id).slice(-5)
              threadContext = others.map(o => {
                const oh = o.payload.headers
                const oFrom = headerVal(oh, 'From')
                const oBody = extractBodies(o.payload).text || ''
                return {
                  from: oFrom,
                  body: oBody.slice(0, 500),
                  date: new Date(parseInt(o.internalDate, 10)).toISOString(),
                }
              })
            } catch { /* thread fetch is best-effort */ }

            const receivedAt = new Date(parseInt(m.internalDate, 10)).toISOString()

            // 4. Insert (status pending, ai_processed false).
            const { data: inserted, error: insErr } = await admin
              .from('communication_messages')
              .insert({
                tenant_id: ctx.tenant_id,
                platform: 'gmail',
                external_id: m.id,
                thread_id: m.threadId,
                from_id: fromEmail,
                from_name: fromName,
                from_email: fromEmail,
                subject,
                body_text: text || m.snippet || '',
                body_html: html,
                thread_context: threadContext,
                received_at: receivedAt,
                ai_processed: false,
              })
              .select('id')
              .single()
            if (insErr) {
              if (!insErr.message.includes('duplicate')) errors.push(`insert ${msgId}: ${insErr.message}`)
              continue
            }
            totalSynced++

            // 5. Classify in the background (don't await — let the response return fast).
            classifyAndUpdate(admin, inserted.id, {
              platform: 'gmail',
              from_name: fromName,
              from_email: fromEmail,
              subject,
              body: text || '',
              thread_context: threadContext,
              agency_name: agencyName,
            })
          } catch (msgErr) {
            errors.push(`msg ${msgId}: ${(msgErr as Error).message}`)
          }
        }

        // Update last_sync_at.
        await admin.from('integration_tokens').update({ last_sync_at: new Date().toISOString() }).eq('id', tok.id)
      } catch (accErr) {
        errors.push(`account ${tok.gmail_email}: ${(accErr as Error).message}`)
      }
    }

    return json({ synced: totalSynced, errors })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
