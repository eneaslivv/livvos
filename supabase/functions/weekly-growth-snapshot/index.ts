// @ts-nocheck
/**
 * weekly-growth-snapshot — cron-invoked. For every tenant, calls
 * compute_growth_snapshot(tenant_id, last_monday) which UPSERTs the
 * snapshot row. Idempotent: re-running for the same week overwrites,
 * preserves manual fields (highlights/blockers/priorities).
 *
 * pg_cron schedule: Sunday 23:00 UTC (so Monday morning the dashboard
 * is fresh). Service-role-only — refuses anon JWTs.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGINS') || '*'

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function lastMonday(d = new Date()): string {
  // ISO week start: Monday = day 1. JS Date.getUTCDay returns 0 (Sun) .. 6 (Sat).
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day  // Sun: -6 days; Mon: 0; Tue: -1; … Sat: -5
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() + diff)
  return monday.toISOString().slice(0, 10)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  // Auth: service role only.
  const auth = req.headers.get('Authorization') || ''
  if (auth !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return new Response(JSON.stringify({ error: 'service_role required' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const t0 = Date.now()
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Optional body: { tenant_id?: string, week_start?: 'YYYY-MM-DD' } for smoke tests.
  let body: any = {}
  try { body = await req.json() } catch { /* empty body OK */ }
  const scopeTenant: string | null = body.tenant_id || null
  const weekStart: string = body.week_start || lastMonday()

  let tenants: { id: string }[] = []
  if (scopeTenant) {
    tenants = [{ id: scopeTenant }]
  } else {
    const { data } = await supabase.from('tenants').select('id').limit(500)
    tenants = (data || []) as { id: string }[]
  }

  let ok = 0, fail = 0
  for (const t of tenants) {
    try {
      const { error: err } = await supabase.rpc('compute_growth_snapshot', {
        p_tenant_id: t.id,
        p_week_start: weekStart,
      })
      if (err) throw err
      ok++
    } catch (e) {
      console.warn(`[weekly-snapshot] tenant ${t.id} failed:`, String(e))
      fail++
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    week_start: weekStart,
    tenants_processed: ok,
    tenants_failed: fail,
    took_ms: Date.now() - t0,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
