/**
 * Project skills — read-only project queries.
 */

import type { Skill, SkillResult, ExecutionContext } from '../types';

const ok = <T>(kind: SkillResult<T>['kind'], data: T, ms?: number): SkillResult<T> =>
  ({ ok: true, kind, data, ms });
const fail = (kind: SkillResult<any>['kind'], reason: string, ms?: number): SkillResult<any> =>
  ({ ok: false, kind, reason, ms });

export const list_projects: Skill<{ status?: string }, Array<any>> = {
  id: 'projects.list',
  description: 'List projects in the active tenant, optionally filtered by status.',
  kind: 'read',
  validate: (p: any) => ({ status: p?.status }),
  run: async (params, ctx) => {
    const t0 = Date.now();
    let q = ctx.db.from('projects')
      .select('id, title, status, progress, deadline, client_id, budget, currency')
      .eq('tenant_id', ctx.tenantId);
    if (params.status) q = q.eq('status', params.status);
    const { data, error } = await q.order('created_at', { ascending: false });
    const ms = Date.now() - t0;
    if (error) return fail('project[]', error.message, ms);
    if (!data || data.length === 0) return fail('project[]', 'no_projects', ms);
    return ok('project[]', data, ms);
  },
};

export const project_health: Skill<{ project_id: string }, any> = {
  id: 'projects.health',
  description: 'Snapshot of a project — status, % done, overdue tasks, days to deadline.',
  kind: 'read',
  validate: (p: any) => {
    if (!p?.project_id) throw new Error('project_id required');
    return { project_id: p.project_id };
  },
  run: async (params, ctx) => {
    const t0 = Date.now();
    const today = (ctx.now || new Date()).toISOString().slice(0, 10);
    const [pRes, taskRes] = await Promise.all([
      ctx.db.from('projects').select('id, title, status, deadline, progress')
        .eq('id', params.project_id).eq('tenant_id', ctx.tenantId).maybeSingle(),
      ctx.db.from('tasks').select('status, completed, start_date')
        .eq('project_id', params.project_id).eq('tenant_id', ctx.tenantId).limit(500),
    ]);
    const ms = Date.now() - t0;
    if (pRes.error || !pRes.data) return fail('analysis', pRes.error?.message || 'not_found', ms);
    const tasks = (taskRes.data || []) as any[];
    const total = tasks.length;
    const done = tasks.filter(t => t.completed || t.status === 'done').length;
    const overdue = tasks.filter(t => !t.completed && t.status !== 'done' && t.start_date && t.start_date < today).length;
    const deadline = (pRes.data as any).deadline;
    const days_to_deadline = deadline
      ? Math.round((new Date(deadline + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / 86400000)
      : null;
    return ok('analysis', {
      project: pRes.data,
      tasks_total: total,
      tasks_done: done,
      tasks_overdue: overdue,
      completion_pct: total ? Math.round((done / total) * 100) : 0,
      days_to_deadline,
    } as any, ms);
  },
};

export const projectSkills = [list_projects, project_health];
