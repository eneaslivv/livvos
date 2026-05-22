// @ts-nocheck
// Aurora cron — runs scheduled proactive agent triggers.
//
// POST /functions/v1/aurora-cron  (called by pg_cron every 5min)
// Reads aurora_triggers with next_run_at <= now() && enabled=true,
// runs the corresponding agent with the prompt_template, persists thread
// + assistant message, fires a notification so the user knows.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import OpenAI from 'https://esm.sh/openai@4.71.0';
import { AGENTS } from '../aurora-chat/agents.ts';
import { runAgent } from '../aurora-chat/runner.ts';

interface CronTrigger {
  id: string;
  tenant_id: string;
  user_id: string | null;
  agent_slug: string;
  schedule: string;     // cron expression — informational only; pg_cron is the actual scheduler
  prompt_template: string;
  next_run_at: string;
}

// Very simple cron-to-next-run estimator. We don't parse the full cron syntax —
// just bump next_run_at by the most common intervals encoded in `schedule`.
// pg_cron stays the source of truth for the actual firing schedule.
function nextRunFromSchedule(schedule: string): Date {
  const now = new Date();
  // Daily-ish schedules → add 24h
  if (/0\s+\d{1,2}\s+\*\s+\*\s+\*/.test(schedule)) {
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    return next;
  }
  // Weekly schedules (e.g. "0 9 * * 1" Mondays) → add 7d
  if (/0\s+\d{1,2}\s+\*\s+\*\s+[0-6]/.test(schedule)) {
    const next = new Date(now);
    next.setDate(next.getDate() + 7);
    return next;
  }
  // Default: +1h
  const next = new Date(now);
  next.setHours(next.getHours() + 1);
  return next;
}

serve(async (req: Request) => {
  // Authz: cron secret OR service role JWT
  const authHeader = req.headers.get('Authorization') || '';
  const cronSecret = Deno.env.get('CRON_SECRET');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const expected = `Bearer ${cronSecret || serviceKey}`;
  if (cronSecret && authHeader !== expected && !authHeader.includes(serviceKey)) {
    return new Response('unauthorized', { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const openaiKey   = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) return jsonResp({ error: 'openai_api_key_not_set' }, 500);

  const sbAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: due, error } = await sbAdmin
    .from('aurora_triggers')
    .select('*')
    .eq('enabled', true)
    .lte('next_run_at', new Date().toISOString())
    .limit(20);
  if (error) return jsonResp({ error: error.message }, 500);
  if (!due || due.length === 0) {
    return jsonResp({ ok: true, ran: 0 });
  }

  const openai = new OpenAI({ apiKey: openaiKey });
  let ran = 0;
  const errors: any[] = [];

  for (const trig of (due as CronTrigger[])) {
    const agentDef = AGENTS[trig.agent_slug];
    if (!agentDef || !trig.user_id) continue;

    try {
      // Build a per-user supabase client so RLS scopes the tools to that user's data.
      // We forge it via service-role + impersonation header — there's no real JWT here
      // because the cron runs server-side.
      // Approach: just use service role for the tools (cron is internal, trusted).
      const sbUser = sbAdmin;

      // Get or create the thread for this trigger
      let threadId: string | null = null;
      {
        const { data: existing } = await sbAdmin
          .from('aurora_threads')
          .select('id')
          .eq('user_id', trig.user_id)
          .eq('agent_slug', agentDef.slug)
          .is('archived_at', null)
          .order('last_message_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existing) threadId = existing.id;
        else {
          const { data: newT } = await sbAdmin
            .from('aurora_threads')
            .insert({ tenant_id: trig.tenant_id, user_id: trig.user_id, agent_slug: agentDef.slug, title: 'Proactive · ' + new Date().toLocaleDateString('es-ES') })
            .select('id').single();
          threadId = newT?.id || null;
        }
      }
      if (!threadId) { errors.push({ trigger_id: trig.id, error: 'thread_create_failed' }); continue; }

      // Insert the user-facing "trigger" message so the dock shows the prompt context
      await sbAdmin.from('aurora_messages').insert({
        thread_id: threadId,
        role: 'user',
        text: trig.prompt_template,
      });

      // Run the agent
      const result = await runAgent({
        openai, agentDef,
        userMessage: trig.prompt_template,
        history: [],
        ctx: { supabase: sbUser, supabaseAdmin: sbAdmin, tenantId: trig.tenant_id, userId: trig.user_id },
      });

      // Persist the assistant response
      await sbAdmin.from('aurora_messages').insert({
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

      // Update the thread last_message_at
      await sbAdmin.from('aurora_threads').update({ last_message_at: new Date().toISOString() }).eq('id', threadId);

      // Fire an in-app notification so the user sees the proactive thread
      await sbAdmin.from('notifications').insert({
        user_id: trig.user_id,
        tenant_id: trig.tenant_id,
        type: 'system',
        priority: 'medium',
        category: 'aurora_trigger',
        title: agentDef.slug.charAt(0).toUpperCase() + agentDef.slug.slice(1) + ' tiene algo para vos',
        message: result.text?.slice(0, 140) || 'Abrí Aurora para ver el detalle.',
        link: '/home',
        action_required: false,
        action_url: '/home',
        action_text: 'Abrir Aurora',
        metadata: { agent_slug: agentDef.slug, thread_id: threadId, trigger_id: trig.id },
      });

      // Update the trigger schedule
      await sbAdmin.from('aurora_triggers').update({
        last_run_at: new Date().toISOString(),
        next_run_at: nextRunFromSchedule(trig.schedule).toISOString(),
      }).eq('id', trig.id);

      ran += 1;
    } catch (e: any) {
      errors.push({ trigger_id: trig.id, error: e?.message });
    }
  }

  return jsonResp({ ok: true, ran, errors });
});

function jsonResp(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
