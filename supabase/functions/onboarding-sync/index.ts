// @ts-nocheck
// Onboarding -> Lean sync. Turns a stored onboarding plan into real
// projects / milestones / tasks / project_credentials.
//
// POST /functions/v1/onboarding-sync
// body: { onboardingId, dryRun?=true, mode?='create', projectId?, startDate?, ownerMap?, force? }
// Safety: defaults to a PREVIEW. Pass { dryRun: false } to write.
//
// Writes use the user's RLS-scoped client, so everything stays inside
// the caller's tenant.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigin = Deno.env.get('ALLOWED_ORIGINS') || '*';
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// --- pure: plan -> write intents (mirror of lib/quoting/onboarding-plan) ---
const PRIORITIES = new Set(['Low', 'Medium', 'High']);
function addDays(dateStr: string | null, days: number): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function taskDescription(t: any): string | null {
  const bits: string[] = [];
  if (t.internal_note) bits.push(t.internal_note);
  if (t.module) bits.push(`Module: ${t.module}`);
  if (t.optional) bits.push('⚠ Optional — not in approved scope unless confirmed.');
  if (t.client_task) bits.push('Client task.');
  return bits.join('\n') || null;
}
function computePlan(onboarding: any, opts: { startDate?: string | null; stageGapDays?: number } = {}) {
  const { startDate = null, stageGapDays = 7 } = opts;
  const plan = onboarding.plan || {};
  const p = plan.project || {};
  const stages = Array.isArray(plan.stages) ? plan.stages : [];
  const approvedValue = Number(onboarding.approved_value ?? p.approved_value ?? 0);
  const currency = onboarding.currency || p.currency || 'USD';

  const project = {
    title: p.title || 'Untitled project',
    description: p.timeline ? `Timeline: ${p.timeline}` : null,
    status: 'Active',
    progress: 0,
    client_name: p.client_name || null,
    budget_total: approvedValue,
    budget: approvedValue,
    currency,
    tags: Array.isArray(p.tags) ? p.tags : [],
    start_date: startDate || null,
    tasks_groups: stages.map((s: any) => ({ name: s.title || s.key })),
  };

  const milestones: any[] = [];
  const tasks: any[] = [];
  let order = 0;
  stages.forEach((stage: any, si: number) => {
    const stageTitle = stage.title || stage.key || `Stage ${si + 1}`;
    const stageDue = startDate ? addDays(startDate, (si + 1) * stageGapDays) : null;
    milestones.push({ title: stageTitle, description: null, status: stage.status || 'future', due_date: stageDue });
    for (const t of stage.tasks || []) {
      tasks.push({
        ref: t.ref ?? `t${order}`,
        depends_on_ref: t.depends_on ?? null,
        order_index: order,
        title: t.title || '(untitled task)',
        group_name: stageTitle,
        priority: PRIORITIES.has(t.priority) ? t.priority : 'Medium',
        status: 'pending',
        tag: t.owner_role || null,
        assignee: { suggested_role: t.owner_role || null, optional: !!t.optional, client_task: !!t.client_task },
        description: taskDescription(t),
        estimated_hours: t.estimated_hours ?? null,
        start_date: startDate ? addDays(startDate, si * stageGapDays) : null,
        end_date: stageDue,
        due_date: stageDue ? new Date(stageDue).toISOString() : null,
      });
      order += 1;
    }
  });

  const credentials = (plan.accesses_needed || []).map((a: any) => ({
    service_name: a.service || 'Access',
    url: a.url || null,
    notes: [a.needed_for ? `Needed for: ${a.needed_for}` : null, a.notes].filter(Boolean).join(' — ') || null,
  }));

  return {
    project, milestones, tasks, credentials,
    summary: {
      project: project.title, client: project.client_name, approvedValue, currency,
      stages: milestones.length, tasks: tasks.length, accesses: credentials.length,
      assetsPending: (plan.assets_pending || []).length, risks: (plan.risks || []).length,
      missingInfo: (plan.missing_info || []).length,
    },
  };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!jwt) return json({ ok: false, error: 'missing_authorization' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, error: 'invalid_jwt' }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'bad_json' }, 400); }
  if (!body?.onboardingId) return json({ ok: false, error: 'onboardingId_required' }, 400);

  const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).maybeSingle();
  const tenantId = profile?.tenant_id;
  if (!tenantId) return json({ ok: false, error: 'no_tenant_context' }, 400);

  const { data: obRows } = await supabase
    .from('project_onboardings').select('*').eq('tenant_id', tenantId).eq('id', body.onboardingId).limit(1);
  const onboarding = obRows?.[0];
  if (!onboarding) return json({ ok: false, error: 'onboarding_not_found' }, 404);

  const mode = body.mode === 'update' ? 'update' : 'create';
  const startDate = body.startDate || null;
  const computed = computePlan(onboarding, { startDate });

  if (body.dryRun !== false) {
    return json({ ok: true, preview: true, alreadySynced: onboarding.status === 'synced', existingProjectId: onboarding.project_id, ...computed });
  }

  if (onboarding.status === 'synced' && mode === 'create' && !body.force) {
    return json({ ok: false, error: 'already_synced', projectId: onboarding.project_id, hint: 'use mode:"update" or force:true' }, 409);
  }

  // 1) project
  let projectId = body.projectId || onboarding.project_id;
  if (mode === 'create' || !projectId) {
    const { data: proj, error } = await supabase
      .from('projects')
      .insert({ tenant_id: tenantId, client_id: onboarding.client_id, owner_id: user.id, manager_id: user.id, ...computed.project })
      .select('id').single();
    if (error) return json({ ok: false, error: 'project_create_failed', detail: error.message }, 500);
    projectId = proj.id;
  } else {
    await supabase.from('projects').update({ tasks_groups: computed.project.tasks_groups, updated_at: new Date().toISOString() }).eq('id', projectId).eq('tenant_id', tenantId);
  }

  // 2) milestones
  let milestonesInserted = 0;
  if (computed.milestones.length) {
    const rows = computed.milestones.map((m: any) => ({ ...m, project_id: projectId, tenant_id: tenantId }));
    const { data, error } = await supabase.from('milestones').insert(rows).select('id');
    if (!error) milestonesInserted = (data || []).length;
  }

  // 3) owner resolution (role -> user id via explicit map, else profiles.role, else null)
  const ownerMap = body.ownerMap || {};
  const { data: roster } = await supabase.from('profiles').select('id, role').eq('tenant_id', tenantId).eq('is_active', true).eq('is_agent', false);
  const resolveOwner = (role: string | null): string | null => {
    if (!role) return null;
    if (ownerMap[role]) return ownerMap[role];
    const target = String(role).toLowerCase();
    const hit = (roster || []).find((p: any) => p.role && (String(p.role).toLowerCase() === target || target.includes(String(p.role).toLowerCase())));
    return hit?.id ?? null;
  };

  // 4) tasks + dependency wiring
  const refToId = new Map<string, string>();
  if (computed.tasks.length) {
    const rows = computed.tasks.map((t: any) => {
      const assigned = resolveOwner(t.tag);
      return {
        tenant_id: tenantId, project_id: projectId, client_id: onboarding.client_id,
        title: t.title, description: t.description, group_name: t.group_name,
        priority: t.priority, status: t.status, tag: t.tag, assignee: t.assignee,
        assigned_to: assigned, assignee_id: assigned,
        estimated_hours: t.estimated_hours, start_date: t.start_date, end_date: t.end_date,
        due_date: t.due_date, order_index: t.order_index,
      };
    });
    const { data: inserted } = await supabase.from('tasks').insert(rows).select('id, order_index');
    const orderToId = new Map((inserted || []).map((r: any) => [r.order_index, r.id]));
    for (const t of computed.tasks) refToId.set(t.ref, orderToId.get(t.order_index));
    for (const t of computed.tasks) {
      if (t.depends_on_ref && refToId.has(t.depends_on_ref)) {
        const id = refToId.get(t.ref);
        const blockedBy = refToId.get(t.depends_on_ref);
        if (id && blockedBy) await supabase.from('tasks').update({ blocked_by: blockedBy }).eq('id', id).eq('tenant_id', tenantId);
      }
    }
  }

  // 5) credential placeholders (no secrets; project_credentials has no tenant_id)
  let credentialsInserted = 0;
  if (computed.credentials.length) {
    const rows = computed.credentials.map((c: any) => ({ ...c, project_id: projectId }));
    const { data } = await supabase.from('project_credentials').insert(rows).select('id');
    credentialsInserted = (data || []).length;
  }

  // 6) mark onboarding synced
  const syncResult = { project_id: projectId, milestones: milestonesInserted, tasks: computed.tasks.length, credentials: credentialsInserted, mode, synced_with: 'lean' };
  await supabase.from('project_onboardings').update({ project_id: projectId, status: 'synced', sync_result: syncResult, synced_at: new Date().toISOString() }).eq('id', body.onboardingId).eq('tenant_id', tenantId);

  return json({ ok: true, preview: false, projectId, ...syncResult, summary: computed.summary });
});
