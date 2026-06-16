// ============================================================
// Quoting — onboarding plan -> Lean write-intents (pure).
// No DB access. Turns a generated onboarding plan into the exact
// rows to create in projects / milestones / tasks / project_credentials.
// Used by the onboarding-sync edge function and by the UI preview.
// ============================================================

import type { OnboardingPlan, OnboardingRecord, OnboardingTask } from './types';

const PRIORITIES = new Set(['Low', 'Medium', 'High']);

export function addDays(dateStr: string | null | undefined, days: number): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function taskDescription(t: OnboardingTask): string | null {
  const bits: string[] = [];
  if (t.internal_note) bits.push(t.internal_note);
  if (t.module) bits.push(`Module: ${t.module}`);
  if (t.optional) bits.push('⚠ Optional — not in approved scope unless confirmed.');
  if (t.client_task) bits.push('Client task.');
  return bits.join('\n') || null;
}

export interface ComputedTask {
  ref: string;
  depends_on_ref: string | null;
  order_index: number;
  title: string;
  group_name: string;
  priority: string;
  status: string;
  tag: string | null;
  assignee: { suggested_role: string | null; optional: boolean; client_task: boolean };
  description: string | null;
  estimated_hours: number | null;
  start_date: string | null;
  end_date: string | null;
  due_date: string | null;
}

export interface ComputedPlan {
  project: Record<string, unknown>;
  milestones: Array<{ title: string; description: string | null; status: string; due_date: string | null }>;
  tasks: ComputedTask[];
  credentials: Array<{ service_name: string; url: string | null; notes: string | null }>;
  assetsPending: unknown[];
  risks: unknown[];
  missingInfo: string[];
  summary: Record<string, unknown>;
}

export function computePlan(
  onboarding: OnboardingRecord,
  opts: { startDate?: string | null; stageGapDays?: number } = {}
): ComputedPlan {
  const { startDate = null, stageGapDays = 7 } = opts;
  const plan: OnboardingPlan = onboarding.plan || {};
  const p = (plan.project || {}) as Record<string, unknown>;
  const stages = Array.isArray(plan.stages) ? plan.stages : [];

  const approvedValue = Number(onboarding.approved_value ?? (p.approved_value as number) ?? 0);
  const currency = onboarding.currency || (p.currency as string) || 'USD';

  const project: Record<string, unknown> = {
    title: (p.title as string) || 'Untitled project',
    description: p.timeline ? `Timeline: ${p.timeline}` : null,
    status: 'Active',
    progress: 0,
    client_name: (p.client_name as string) || null,
    budget_total: approvedValue,
    budget: approvedValue,
    currency,
    tags: Array.isArray(p.tags) ? p.tags : [],
    start_date: startDate || null,
    tasks_groups: stages.map((s) => ({ name: s.title || s.key })),
  };

  const milestones: ComputedPlan['milestones'] = [];
  const tasks: ComputedTask[] = [];
  let order = 0;

  stages.forEach((stage, si) => {
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
        priority: PRIORITIES.has(t.priority as string) ? (t.priority as string) : 'Medium',
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

  const credentials = (plan.accesses_needed || []).map((a) => ({
    service_name: a.service || 'Access',
    url: a.url || null,
    notes: [a.needed_for ? `Needed for: ${a.needed_for}` : null, a.notes].filter(Boolean).join(' — ') || null,
  }));

  return {
    project,
    milestones,
    tasks,
    credentials,
    assetsPending: plan.assets_pending || [],
    risks: plan.risks || [],
    missingInfo: plan.missing_info || [],
    summary: {
      project: project.title,
      client: project.client_name,
      approvedValue,
      currency,
      stages: milestones.length,
      tasks: tasks.length,
      accesses: credentials.length,
      assetsPending: (plan.assets_pending || []).length,
      risks: (plan.risks || []).length,
      missingInfo: (plan.missing_info || []).length,
    },
  };
}
