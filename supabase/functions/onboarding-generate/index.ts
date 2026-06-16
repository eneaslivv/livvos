// @ts-nocheck
// AI Onboarding Generator — approved proposal -> structured onboarding plan.
//
// POST /functions/v1/onboarding-generate
// body: { proposalId: string, persist?: boolean }
// returns: { ok, onboardingId, plan }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import OpenAI from 'https://esm.sh/openai@4.71.0';

const allowedOrigin = Deno.env.get('ALLOWED_ORIGINS') || '*';
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const CHAT_MODEL = Deno.env.get('OPENAI_CHAT_MODEL') || 'gpt-4o';

const SYSTEM = `You transform an APPROVED quote into an operational project onboarding for Livv Studio, ready to sync to the internal projects/tasks system ("Lean").
Use ONLY the approved scope. Anything not sold -> mark optional / out_of_scope / future_phase. Decompose modules into tasks; request needed accesses; list pending assets; flag risks (scope/technical/design/integration) and missing info; order dependencies (depends_on by ref). Scale design tasks to the design level. E-commerce -> products/payments/shipping; CRM -> pipelines/fields; CMS -> collections/content types.
Owner roles: PM, Design, Development, Content, Client, Technical Review, Sales/Admin.
Stages (keys, in order, include only relevant; mark rest optional): kickoff, assets_access, strategy, design, development, internal_review, client_review, prelaunch_launch, post_launch_support.
Return ONLY JSON:
{ "project": {"title","client_name","project_type","platform","design_level","approved_value":number,"currency","timeline","tags":[]},
  "modules":[], "approved_extras":[], "out_of_scope":[], "special_requirements":[],
  "stages":[ {"key","title","status":"future","tasks":[ {"ref","title","owner_role","priority":"Low|Medium|High","status":"pending","depends_on":null,"module":null,"internal_note":null,"optional":false,"client_task":false,"estimated_hours":null} ]} ],
  "assets_pending":[ {"name","needed_for","status":"pending"} ],
  "accesses_needed":[ {"service","needed_for","notes":null} ],
  "owners_suggested":{}, "suggested_dates":{}, "risks":[ {"type","description","stage"} ], "missing_info":[], "custom_notes":[] }
Keep every "ref" unique so dependencies resolve.`;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!jwt) return json({ ok: false, error: 'missing_authorization' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) return json({ ok: false, error: 'openai_api_key_not_set' }, 500);

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, error: 'invalid_jwt' }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'bad_json' }, 400); }
  if (!body?.proposalId) return json({ ok: false, error: 'proposalId_required' }, 400);

  const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).maybeSingle();
  const tenantId = profile?.tenant_id;
  if (!tenantId) return json({ ok: false, error: 'no_tenant_context' }, 400);

  const { data: proposalRows } = await supabase
    .from('proposals')
    .select('id, title, summary, brief_text, project_type, language, complexity, pricing_snapshot, pricing_total, currency, client_id')
    .eq('tenant_id', tenantId).eq('id', body.proposalId).limit(1);
  const proposal = proposalRows?.[0];
  if (!proposal) return json({ ok: false, error: 'proposal_not_found' }, 404);

  let client: any = null;
  if (proposal.client_id) {
    const { data } = await supabase.from('clients').select('id, name, company').eq('tenant_id', tenantId).eq('id', proposal.client_id).limit(1);
    client = data?.[0] || null;
  }
  const { data: crs } = await supabase.from('custom_requests').select('*').eq('tenant_id', tenantId).eq('proposal_id', body.proposalId);

  const snapshot = proposal.pricing_snapshot || {};
  const modules = (snapshot.items || []).map((i: any) => ({ name: i.name, complexity: i.complexity }));
  const approvedExtras = (crs || []).filter((c: any) => c.status === 'extra' && c.approved_price != null);
  const outOfScope = (crs || []).filter((c: any) => c.status === 'out_of_scope');
  const futurePhase = (crs || []).filter((c: any) => c.status === 'future_phase');

  const userPrompt = [
    'APPROVED QUOTE',
    `- Title: ${proposal.title}`,
    `- Client: ${client?.name || proposal.client_id || 'unknown'}${client?.company ? ` (${client.company})` : ''}`,
    `- Project type: ${proposal.project_type || 'n/a'}`,
    `- Design level / complexity: ${proposal.complexity || 'standard'}`,
    `- Approved value: ${proposal.pricing_total ?? snapshot?.totals?.livv ?? 'n/a'} ${proposal.currency || 'USD'}`,
    `- Brief: ${proposal.brief_text || proposal.summary || 'n/a'}`,
    '', 'MODULES INCLUDED:', JSON.stringify(modules),
    '', 'APPROVED EXTRAS:', JSON.stringify(approvedExtras.map((c: any) => ({ note: c.client_facing_note, modules: c.affected_modules }))),
    '', 'OUT OF SCOPE:', JSON.stringify(outOfScope.map((c: any) => c.client_facing_note || c.original_text)),
    '', 'FUTURE PHASE:', JSON.stringify(futurePhase.map((c: any) => c.client_facing_note || c.original_text)),
    '', 'Generate the onboarding plan JSON now. Respect scope strictly.',
  ].join('\n');

  const openai = new OpenAI({ apiKey: openaiKey });
  let plan: any = null;
  try {
    const res = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: userPrompt }],
    });
    plan = JSON.parse(res.choices[0]?.message?.content || '{}');
  } catch (e) {
    return json({ ok: false, error: 'generation_failed', detail: String(e?.message || e) }, 500);
  }

  // anchor headline numbers to the real approved value
  plan.project = plan.project || {};
  plan.project.approved_value = Number(proposal.pricing_total ?? plan.project.approved_value ?? 0);
  plan.project.currency = proposal.currency || plan.project.currency || 'USD';
  if (!plan.project.client_name && client?.name) plan.project.client_name = client.name;
  if (!plan.project.title) plan.project.title = proposal.title;

  let onboardingId: string | null = null;
  if (body.persist !== false) {
    const { data: saved, error } = await supabase
      .from('project_onboardings')
      .insert({
        tenant_id: tenantId,
        proposal_id: body.proposalId,
        client_id: proposal.client_id,
        created_by: user.id,
        status: 'draft',
        approved_value: proposal.pricing_total,
        currency: proposal.currency || 'USD',
        plan,
      })
      .select('id').single();
    if (error) return json({ ok: false, error: 'persist_failed', detail: error.message }, 500);
    onboardingId = saved?.id || null;
  }

  return json({ ok: true, onboardingId, plan });
});
