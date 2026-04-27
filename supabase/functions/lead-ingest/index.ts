// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.2'

const allowedOrigin = Deno.env.get('ALLOWED_ORIGINS') || '*'
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, x-custom-version, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

const detectLanguage = (text: string) => {
  const spanishHints = /(\b(el|la|los|las|que|para|con|una|este|esta|cliente|propuesta|entregables)\b)/i
  return spanishHints.test(text) ? 'es' : 'en'
}

const LEAD_VALUE_BY_CATEGORY: Record<string, number> = {
  contact: 500,
  quote: 800,
  partner: 1000,
  lead: 400,
  newsletter: 50,
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input.trim().toLowerCase())
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function normalizePhone(phone?: string): string | undefined {
  if (!phone) return undefined
  const digits = String(phone).replace(/\D/g, '')
  return digits || undefined
}

function getClientIp(req: Request): string | undefined {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real
  return undefined
}

function buildFbc(fbclid?: string): string | undefined {
  if (!fbclid) return undefined
  return `fb.1.${Date.now()}.${fbclid}`
}

async function sendMetaCapi(params: {
  email: string
  phone?: string
  name?: string
  eventId: string
  eventSourceUrl?: string
  clientIp?: string
  userAgent?: string
  fbc?: string
  fbp?: string
  value: number
  currency: string
  origin: string
  category: string
}) {
  const pixelId = Deno.env.get('META_PIXEL_ID')
  const accessToken = Deno.env.get('META_CAPI_ACCESS_TOKEN')
  const testCode = Deno.env.get('META_CAPI_TEST_EVENT_CODE') || undefined
  if (!pixelId || !accessToken) {
    return { skipped: 'META_PIXEL_ID or META_CAPI_ACCESS_TOKEN missing' }
  }

  const nameParts = (params.name || '').trim().split(/\s+/)
  const fn = nameParts[0] || undefined
  const ln = nameParts.length > 1 ? nameParts[nameParts.length - 1] : undefined

  const userData: Record<string, string | string[]> = {
    em: [await sha256Hex(params.email)],
  }
  const normalizedPhone = normalizePhone(params.phone)
  if (normalizedPhone) userData.ph = [await sha256Hex(normalizedPhone)]
  if (fn) userData.fn = [await sha256Hex(fn)]
  if (ln) userData.ln = [await sha256Hex(ln)]
  if (params.clientIp) userData.client_ip_address = params.clientIp
  if (params.userAgent) userData.client_user_agent = params.userAgent
  if (params.fbc) userData.fbc = params.fbc
  if (params.fbp) userData.fbp = params.fbp

  const event = {
    event_name: 'Lead',
    event_time: Math.floor(Date.now() / 1000),
    event_id: params.eventId,
    action_source: 'website',
    event_source_url: params.eventSourceUrl,
    user_data: userData,
    custom_data: {
      currency: params.currency,
      value: params.value,
      content_name: params.origin,
      content_category: params.category,
    },
  }

  const url = `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [event],
        ...(testCode ? { test_event_code: testCode } : {}),
      }),
    })
    const text = await res.text()
    return { status: res.status, body: text.slice(0, 400) }
  } catch (e) {
    return { error: String(e) }
  }
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceRole) {
      return new Response(JSON.stringify({ error: 'Missing Supabase env vars' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const {
      name,
      email,
      company,
      message,
      phone,
      project_type,
      language,
      tenant_slug,
      create_proposal,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
      origin,
      source,
      temperature,
      category,
      gclid,
      fbclid,
      msclkid,
      fbp,
      fbc,
      attribution,
      page_url,
      user_agent,
      event_id,
    } = body || {}

    if (!name || !email || !message || !tenant_slug) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRole, {
      auth: { persistSession: false }
    })

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, owner_id, slug')
      .eq('slug', tenant_slug)
      .maybeSingle()

    if (tenantError || !tenant) {
      return new Response(JSON.stringify({ error: 'Tenant not found', tenant_slug }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const enrichedMessage = [
      message,
      utm_source ? `UTM source: ${utm_source}` : null,
      utm_medium ? `UTM medium: ${utm_medium}` : null,
      utm_campaign ? `UTM campaign: ${utm_campaign}` : null,
      utm_term ? `UTM term: ${utm_term}` : null,
      utm_content ? `UTM content: ${utm_content}` : null,
      gclid ? `GCLID: ${gclid}` : null,
      fbclid ? `FBCLID: ${fbclid}` : null,
      msclkid ? `MSCLKID: ${msclkid}` : null,
      page_url ? `Page: ${page_url}` : null,
    ].filter(Boolean).join('\n')

    const attributionMeta = {
      gclid: gclid || attribution?.first_gclid || null,
      fbclid: fbclid || attribution?.first_fbclid || null,
      msclkid: msclkid || null,
      utm_source: utm_source || attribution?.utm_source || null,
      utm_medium: utm_medium || attribution?.utm_medium || null,
      utm_campaign: utm_campaign || attribution?.utm_campaign || null,
      utm_term: utm_term || attribution?.utm_term || null,
      utm_content: utm_content || attribution?.utm_content || null,
      first_landing_page: attribution?.first_landing_page || null,
      first_referrer: attribution?.first_referrer || null,
      first_utm_source: attribution?.first_utm_source || null,
      first_utm_medium: attribution?.first_utm_medium || null,
      first_utm_campaign: attribution?.first_utm_campaign || null,
      visit_count: attribution?.visit_count || null,
      page_url: page_url || null,
      user_agent: user_agent || req.headers.get('user-agent') || null,
    }

    const leadPayload: Record<string, any> = {
      name,
      email,
      company: company || null,
      message: enrichedMessage,
      origin: origin || 'Web Form',
      source: source || 'livvvv.com',
      status: 'new',
      tenant_id: tenant.id,
      owner_id: tenant.owner_id,
      utm: { ...attributionMeta, phone: phone || null },
    }

    if (temperature) leadPayload.temperature = temperature
    if (category) leadPayload.category = category

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .insert(leadPayload)
      .select()
      .single()

    if (leadError) {
      return new Response(JSON.stringify({ error: leadError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let proposalId = null

    if (create_proposal) {
      const detectedLanguage = language || detectLanguage(`${message} ${company || ''}`)
      const brief = message

      const { data: proposal, error: proposalError } = await supabase
        .from('proposals')
        .insert({
          tenant_id: tenant.id,
          lead_id: lead.id,
          created_by: tenant.owner_id,
          title: `${company ? company + ' - ' : ''}${project_type || 'Project Proposal'}`,
          status: 'draft',
          project_type: project_type || 'web',
          language: detectedLanguage,
          brief_text: brief,
          currency: 'USD'
        })
        .select()
        .single()

      if (!proposalError && proposal?.id) {
        proposalId = proposal.id
        await supabase.from('leads').update({
          proposal_status: 'draft',
          last_proposal_id: proposal.id
        }).eq('id', lead.id)
      }
    }

    // Notification to the inbox. Errors are surfaced in response for debugging.
    let notifyStatus: any = { attempted: false }
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const notifyTo = Deno.env.get('LEAD_NOTIFY_EMAIL') || 'hola@livv.systems'
    if (resendApiKey) {
      notifyStatus.attempted = true
      const esc = (s: string) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
      const rows = [
        ['Name', name],
        ['Email', email],
        ['Company', company || '—'],
        ['Project type', project_type || '—'],
        ['Origin', origin || 'Web Form'],
        ['Source', source || 'livvvv.com'],
        ['UTM', [utm_source, utm_medium, utm_campaign].filter(Boolean).join(' / ') || '—'],
      ].map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#78736A;font-size:12px;">${esc(k)}</td><td style="padding:4px 0;font-size:13px;color:#18181b;">${esc(String(v))}</td></tr>`).join('')
      const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;">
        <h2 style="margin:0 0 12px;font-size:18px;">New lead via web form</h2>
        <table role="presentation" cellpadding="0" cellspacing="0">${rows}</table>
        <div style="margin-top:16px;padding:12px;background:#fafaf8;border-left:3px solid #3b82f6;border-radius:6px;white-space:pre-wrap;font-size:13px;">${esc(message)}</div>
      </div>`
      try {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'LIVV OS <noreply@livv.space>',
            to: [notifyTo],
            reply_to: email,
            subject: `New lead · ${name}${company ? ' · ' + company : ''}`,
            html,
          }),
        })
        const bodyText = await r.text()
        notifyStatus.status = r.status
        notifyStatus.body = bodyText.slice(0, 400)
        if (!r.ok) console.error('lead-ingest resend fail', r.status, bodyText)
      } catch (e) {
        notifyStatus.error = String(e)
        console.error('lead-ingest resend throw', e)
      }
    } else {
      notifyStatus.skipped = 'no RESEND_API_KEY'
    }

    // Meta CAPI — server-side Lead event, deduplicated with client Pixel via event_id
    const capiEventId = event_id || `lead_${lead.id}`
    const leadCategory = category || 'lead'
    const leadValue = LEAD_VALUE_BY_CATEGORY[leadCategory] ?? LEAD_VALUE_BY_CATEGORY.lead
    const effectiveFbclid = fbclid || attribution?.first_fbclid
    const capiResult = await sendMetaCapi({
      email,
      phone,
      name,
      eventId: capiEventId,
      eventSourceUrl: page_url,
      clientIp: getClientIp(req),
      userAgent: user_agent || req.headers.get('user-agent') || undefined,
      fbc: fbc || (effectiveFbclid ? buildFbc(effectiveFbclid) : undefined),
      fbp,
      value: leadValue,
      currency: 'USD',
      origin: origin || 'Web Form',
      category: leadCategory,
    })

    return new Response(JSON.stringify({
      ok: true,
      lead_id: lead.id,
      proposal_id: proposalId,
      notify: notifyStatus,
      capi: capiResult,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
