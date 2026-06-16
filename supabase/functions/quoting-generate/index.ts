// @ts-nocheck
// Quoting — AI quote generation, grounded in the live service_pricing
// catalog and semantically-similar past work (match_ai_outputs).
//
// POST /functions/v1/quoting-generate
// body: { brief: string|object, market?: 'us'|'latam', isExistingClient?: boolean }
// returns: { ok, quote, priced, similar }
//
// Required Supabase secrets: OPENAI_API_KEY (+ auto-injected SUPABASE_*).

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
const EMBED_MODEL = 'text-embedding-3-small';

const SYSTEM = `You are the Project Quoting Assistant for Livv Studio. Produce realistic quotes from the live catalog and past work.
Rules: custom code is priced LOWER than CMS; never quote a whole project below $1,500; don't pad for unknowns; price by actual work, not the label; bundle similar small items; respect build-order dependencies (e.g. CRM after the systems it reads from). New client/undefined scope -> two options (Simple+Premium). Existing client adding to known work -> single line. Client prices are ~38% over Livv (a suggestion).
Return ONLY JSON:
{ "mode":"two_option"|"single",
  "options": { "simple": {"items":[{"name","description","livv":number,"client":number,"complexity","timeline","bullets":[]}],"total_livv":number,"total_client":number,"timeline"}, "premium": { ... } },
  "line_items": [ { ...same item shape... } ],
  "timeline":"x–y weeks", "assumptions":[], "excluded":[], "reasoning":"grounded in catalog + history" }`;

function parseMoney(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!jwt) return json({ ok: false, error: 'missing_authorization' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) return json({ ok: false, error: 'openai_api_key_not_set' }, 500);

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, error: 'invalid_jwt' }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'bad_json' }, 400); }
  if (!body?.brief) return json({ ok: false, error: 'brief_required' }, 400);

  const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).maybeSingle();
  const tenantId = profile?.tenant_id;
  if (!tenantId) return json({ ok: false, error: 'no_tenant_context' }, 400);

  const briefText = typeof body.brief === 'string' ? body.brief : JSON.stringify(body.brief);
  const market = body.market === 'latam' ? 'latam' : 'us';
  const isExisting = !!body.isExistingClient;

  const openai = new OpenAI({ apiKey: openaiKey });

  // 1) live catalog (RLS-scoped)
  const { data: catalog } = await supabase
    .from('service_pricing')
    .select('name, fixed_price, complexity, simple_factor, standard_factor, advanced_factor, complex_factor')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('fixed_price', { ascending: false });

  // 2) semantic recall of past work
  let similar: any[] = [];
  try {
    const emb = await openai.embeddings.create({ model: EMBED_MODEL, input: briefText.slice(0, 8000) });
    const queryEmbedding = emb.data[0].embedding;
    const { data: matches } = await supabase.rpc('match_ai_outputs', {
      p_tenant_id: tenantId,
      p_query_embedding: queryEmbedding,
      p_match_count: 5,
      p_request_type: null,
      p_min_similarity: 0,
    });
    similar = matches || [];
  } catch (_e) { /* similarity is best-effort */ }

  const catalogBlock = (catalog || [])
    .map((s: any) => `- ${s.name}: $${s.fixed_price} [${s.complexity}] factors=${s.simple_factor}/${s.standard_factor}/${s.advanced_factor}/${s.complex_factor}`)
    .join('\n');
  const similarBlock = similar.length
    ? similar.map((s: any) => `- (${Number(s.similarity).toFixed(2)}) ${(s.input_text || '').slice(0, 120)}`).join('\n')
    : 'none';

  const userPrompt = [
    `MARKET: ${market}`,
    `CLIENT TYPE: ${isExisting ? 'existing client adding to known work — single-price mode' : 'new client — Simple + Premium (two_option)'}`,
    '', 'BRIEF:', briefText,
    '', 'LIVE CATALOG (Livv internal):', catalogBlock,
    '', 'SIMILAR PAST WORK:', similarBlock,
  ].join('\n');

  let quote: any = null;
  try {
    const res = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: userPrompt }],
    });
    quote = JSON.parse(res.choices[0]?.message?.content || '{}');
  } catch (e) {
    return json({ ok: false, error: 'generation_failed', detail: String(e?.message || e) }, 500);
  }

  // computed totals from the model's items (defensive)
  const sum = (items: any[] = []) => {
    const livv = items.reduce((a, i) => a + (parseMoney(i.livv) ?? 0), 0);
    const client = items.reduce((a, i) => a + (parseMoney(i.client) ?? 0), 0);
    return { livv: Math.round(livv / 5) * 5, client: Math.round(client / 5) * 5 };
  };
  const priced =
    quote?.mode === 'two_option' && quote.options
      ? { mode: 'two_option', simple: { items: quote.options.simple?.items || [], totals: sum(quote.options.simple?.items) }, premium: { items: quote.options.premium?.items || [], totals: sum(quote.options.premium?.items) } }
      : { mode: 'single', single: { items: quote?.line_items || [], totals: sum(quote?.line_items) } };

  // best-effort: log this generation + embedding so future quotes can recall it
  try {
    const emb2 = await openai.embeddings.create({ model: EMBED_MODEL, input: briefText.slice(0, 8000) });
    await supabaseAdmin.from('ai_output_log').insert({
      tenant_id: tenantId,
      user_id: user.id,
      request_type: 'quote',
      input_text: briefText.slice(0, 4000),
      input_hash: crypto.randomUUID(),
      output_json: quote,
      embedding: emb2.data[0].embedding,
    });
  } catch (_e) { /* logging is best-effort */ }

  return json({ ok: true, quote, priced, similar: similar.map((s: any) => ({ input: s.input_text, similarity: Number(Number(s.similarity).toFixed(2)) })) });
});
