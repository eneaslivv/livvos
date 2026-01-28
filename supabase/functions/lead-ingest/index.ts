// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

const detectLanguage = (text: string) => {
  const spanishHints = /(\b(el|la|los|las|que|para|con|una|este|esta|cliente|propuesta|entregables)\b)/i
  return spanishHints.test(text) ? 'es' : 'en'
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
      project_type,
      language,
      tenant_slug,
      create_proposal,
      utm_source,
      utm_medium,
      utm_campaign,
      origin,
      source,
      temperature,
      category,
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
    ].filter(Boolean).join('\n')

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

    return new Response(JSON.stringify({
      ok: true,
      lead_id: lead.id,
      proposal_id: proposalId
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
