// @ts-nocheck
// Aurora chat — OpenAI-backed multi-agent endpoint.
//
// POST /functions/v1/aurora-chat
// body: { agent: AgentSlug, message: string, tenant_id?: string, thread_id?: string }
// returns: { agent, text, canvas, request_id, thread_id }
//
// Required env (Supabase secrets):
//   OPENAI_API_KEY                  OpenAI API key (sk-...)
//   SUPABASE_URL                    auto-injected by Supabase
//   SUPABASE_ANON_KEY               auto-injected
//   SUPABASE_SERVICE_ROLE_KEY       auto-injected (used only for Pulse cross-tenant)
//   ALLOWED_ORIGINS                 (optional) CSV of allowed origins, defaults to *

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import OpenAI from 'https://esm.sh/openai@4.71.0';
import { AGENTS } from './agents.ts';
import { runAgent } from './runner.ts';

const allowedOrigin = Deno.env.get('ALLOWED_ORIGINS') || '*';
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DAILY_QUOTA_PER_USER = 200;
const HISTORY_TURNS = 10;

interface ChatBody {
  agent: string;
  message: string;
  tenant_id?: string;
  thread_id?: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST')   return json({ error: 'method_not_allowed' }, 405);

  // --- Auth: extract JWT, build a per-user supabase client (RLS scoped) ---
  const authHeader = req.headers.get('Authorization') || '';
  const jwt = authHeader.replace('Bearer ', '').trim();
  if (!jwt) return json({ error: 'missing_authorization' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const openaiKey = Deno.env.get('OPENAI_API_KEY');

  if (!openaiKey) return json({ error: 'openai_api_key_not_set' }, 500);

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'invalid_jwt' }, 401);

  let body: ChatBody;
  try { body = await req.json(); }
  catch { return json({ error: 'bad_json' }, 400); }

  const agentDef = AGENTS[body.agent];
  if (!agentDef) return json({ error: 'unknown_agent', agent: body.agent }, 400);
  if (!body.message || typeof body.message !== 'string') {
    return json({ error: 'message_required' }, 400);
  }

  // Resolve tenant_id (trust user's profile, ignore client-supplied)
  const { data: profile } = await supabase
    .from('profiles').select('tenant_id').eq('id', user.id).maybeSingle();
  const tenantId = profile?.tenant_id || body.tenant_id;
  if (!tenantId) return json({ error: 'no_tenant_context' }, 400);

  // Agent-specific guard (Pulse = platform admin only)
  if (agentDef.guard) {
    const allowed = await agentDef.guard({ supabase, supabaseAdmin, tenantId, userId: user.id });
    if (!allowed) return json({ error: 'agent_access_denied', agent: agentDef.slug }, 403);
  }

  // Daily quota — soft limit per user (counts user messages in last 24h)
  const { data: userThreads } = await supabaseAdmin
    .from('aurora_threads').select('id').eq('user_id', user.id);
  const threadIds = (userThreads || []).map((t: any) => t.id);
  if (threadIds.length > 0) {
    const { count: usedToday } = await supabaseAdmin
      .from('aurora_messages')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'user')
      .in('thread_id', threadIds)
      .gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString());
    if ((usedToday || 0) >= DAILY_QUOTA_PER_USER) {
      return json({ error: 'daily_quota_exceeded', quota: DAILY_QUOTA_PER_USER }, 429);
    }
  }

  // Resolve / create thread
  let threadId = body.thread_id;
  if (!threadId) {
    const { data: tid, error: tidErr } = await supabase.rpc('aurora_get_or_create_thread', { p_agent_slug: agentDef.slug });
    if (tidErr) return json({ error: 'thread_create_failed', detail: tidErr.message }, 500);
    threadId = tid as string;
  }

  // Load last N turns as history (user + assistant only — skip tool noise)
  const { data: hist } = await supabaseAdmin
    .from('aurora_messages')
    .select('role, text')
    .eq('thread_id', threadId)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: false })
    .limit(HISTORY_TURNS * 2);
  const history = (hist || [])
    .reverse()
    .filter((m: any) => m.text)
    .map((m: any) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text }));

  // Persist user message FIRST (so it appears even if the model fails)
  await supabaseAdmin.from('aurora_messages').insert({
    thread_id: threadId,
    role: 'user',
    text: body.message,
  });

  // Run the agent
  const openai = new OpenAI({ apiKey: openaiKey });
  let result;
  try {
    result = await runAgent({
      openai, agentDef,
      userMessage: body.message,
      history,
      ctx: { supabase, supabaseAdmin, tenantId, userId: user.id },
    });
  } catch (e: any) {
    return json({ error: 'agent_run_failed', detail: e?.message }, 500);
  }

  // Persist assistant message + cost telemetry
  await supabaseAdmin.from('aurora_messages').insert({
    thread_id: threadId,
    role: 'assistant',
    agent_slug: agentDef.slug,
    text: result.text,
    canvas: result.canvas,
    tokens_in: result.tokens_in,
    tokens_out: result.tokens_out,
    model: result.model,
    cost_usd: result.cost_usd,
  });

  // Update thread last_message_at
  await supabaseAdmin.from('aurora_threads').update({ last_message_at: new Date().toISOString() }).eq('id', threadId);

  return json({
    agent: agentDef.slug,
    text: result.text,
    canvas: result.canvas ? { ...result.canvas, agent: agentDef.slug } : null,
    request_id: crypto.randomUUID(),
    thread_id: threadId,
    cost_usd: result.cost_usd,
    tokens: { in: result.tokens_in, out: result.tokens_out },
  }, 200);
});

function json(body: any, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
