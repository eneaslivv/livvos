/**
 * Tasks skills — every read of the tasks table goes through here so the
 * agent layer has a single, audited surface. Each skill returns a
 * SkillResult with explicit `ok` / `reason` — agents are forbidden from
 * inventing tasks the DB didn't return.
 *
 * Writes are NOT done here directly. They live as `propose_*` skills
 * that return a ProposedAction the user must approve before anything
 * hits the DB.
 */

import type { Skill, SkillResult, ExecutionContext } from '../types';

const ok = <T>(kind: SkillResult<T>['kind'], data: T, ms?: number): SkillResult<T> => ({
  ok: true, kind, data, ms,
});
const fail = (kind: SkillResult<any>['kind'], reason: string, ms?: number): SkillResult<any> => ({
  ok: false, kind, reason, ms,
});

// ── 1. List my open tasks ────────────────────────────────────────────
export const list_open_tasks_for_me: Skill<
  { include_overdue?: boolean; project_id?: string; limit?: number },
  Array<any>
> = {
  id: 'tasks.list_open_for_me',
  description: 'List open tasks assigned to or owned by the current user. Returns full task rows.',
  kind: 'read',
  validate: (p: any) => ({
    include_overdue: p?.include_overdue ?? true,
    project_id: p?.project_id || undefined,
    limit: Math.min(p?.limit || 50, 100),
  }),
  run: async (params, ctx: ExecutionContext) => {
    const t0 = Date.now();
    let q = ctx.db
      .from('tasks')
      .select('id, title, description, status, priority, start_date, end_date, due_date, project_id, client_id, assigned_to, owner_id, completed, completed_at, parent_task_id')
      .eq('tenant_id', ctx.tenantId)
      .or(`assigned_to.eq.${ctx.userId},owner_id.eq.${ctx.userId}`)
      .eq('completed', false)
      .not('status', 'in', '("done","cancelled")')
      .limit(params.limit);
    if (params.project_id) q = q.eq('project_id', params.project_id);
    const { data, error } = await q;
    const ms = Date.now() - t0;
    if (error) return fail('task[]', error.message, ms);
    if (!data || data.length === 0) return fail('task[]', 'no_open_tasks', ms);
    return ok('task[]', data, ms);
  },
};

// ── 2. List overdue tasks ────────────────────────────────────────────
export const list_overdue_tasks: Skill<{ for_me_only?: boolean }, Array<any>> = {
  id: 'tasks.list_overdue',
  description: 'List tasks past their due date that are still open.',
  kind: 'read',
  validate: (p: any) => ({ for_me_only: p?.for_me_only ?? true }),
  run: async (params, ctx) => {
    const t0 = Date.now();
    const todayStr = (ctx.now || new Date()).toISOString().slice(0, 10);
    let q = ctx.db
      .from('tasks')
      .select('id, title, priority, start_date, due_date, project_id, assigned_to, owner_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('completed', false)
      .not('status', 'in', '("done","cancelled")')
      .lt('start_date', todayStr);
    if (params.for_me_only) q = q.or(`assigned_to.eq.${ctx.userId},owner_id.eq.${ctx.userId}`);
    const { data, error } = await q.limit(100);
    const ms = Date.now() - t0;
    if (error) return fail('task[]', error.message, ms);
    if (!data || data.length === 0) return fail('task[]', 'no_overdue', ms);
    return ok('task[]', data, ms);
  },
};

// ── 3. Count tasks by status ─────────────────────────────────────────
export const count_tasks_by_status: Skill<
  { project_id?: string; for_me_only?: boolean },
  Record<string, number>
> = {
  id: 'tasks.count_by_status',
  description: 'Counts open / in-progress / done / cancelled tasks. Scope by project or to current user.',
  kind: 'read',
  validate: (p: any) => ({
    project_id: p?.project_id || undefined,
    for_me_only: p?.for_me_only ?? false,
  }),
  run: async (params, ctx) => {
    const t0 = Date.now();
    let q = ctx.db
      .from('tasks')
      .select('status, completed')
      .eq('tenant_id', ctx.tenantId);
    if (params.project_id) q = q.eq('project_id', params.project_id);
    if (params.for_me_only) q = q.or(`assigned_to.eq.${ctx.userId},owner_id.eq.${ctx.userId}`);
    const { data, error } = await q.limit(1000);
    const ms = Date.now() - t0;
    if (error) return fail('count', error.message, ms);
    const counts: Record<string, number> = { todo: 0, 'in-progress': 0, done: 0, cancelled: 0 };
    for (const row of data || []) {
      const s = (row as any).completed ? 'done' : ((row as any).status || 'todo');
      counts[s] = (counts[s] || 0) + 1;
    }
    return ok('count', counts as any, ms);
  },
};

// ── 4. Search tasks by title ─────────────────────────────────────────
export const search_tasks: Skill<{ query: string }, Array<any>> = {
  id: 'tasks.search',
  description: 'Full-text search across task titles + descriptions. Returns matching rows.',
  kind: 'read',
  validate: (p: any) => {
    if (!p?.query || typeof p.query !== 'string') throw new Error('query required');
    return { query: p.query };
  },
  run: async (params, ctx) => {
    const t0 = Date.now();
    const term = `%${params.query.replace(/[%_]/g, m => `\\${m}`)}%`;
    const { data, error } = await ctx.db
      .from('tasks')
      .select('id, title, status, priority, start_date, project_id')
      .eq('tenant_id', ctx.tenantId)
      .or(`title.ilike.${term},description.ilike.${term}`)
      .limit(20);
    const ms = Date.now() - t0;
    if (error) return fail('task[]', error.message, ms);
    if (!data || data.length === 0) return fail('task[]', 'no_match', ms);
    return ok('task[]', data, ms);
  },
};

// ── 5. Get task by id (with subtasks) ────────────────────────────────
export const get_task_with_subtasks: Skill<{ task_id: string }, any> = {
  id: 'tasks.get_with_subtasks',
  description: 'Fetch a single task by id plus all its subtasks.',
  kind: 'read',
  validate: (p: any) => {
    if (!p?.task_id) throw new Error('task_id required');
    return { task_id: p.task_id };
  },
  run: async (params, ctx) => {
    const t0 = Date.now();
    const [{ data: parent, error: pErr }, { data: subs, error: sErr }] = await Promise.all([
      ctx.db.from('tasks').select('*').eq('id', params.task_id).eq('tenant_id', ctx.tenantId).maybeSingle(),
      ctx.db.from('tasks').select('id, title, status, completed, completed_at, due_date').eq('parent_task_id', params.task_id).eq('tenant_id', ctx.tenantId),
    ]);
    const ms = Date.now() - t0;
    if (pErr || !parent) return fail('task', pErr?.message || 'not_found', ms);
    if (sErr) return fail('task', sErr.message, ms);
    return ok('task', { ...parent, subtasks: subs || [] } as any, ms);
  },
};

// ── 6. Propose creating a task — returns a ProposedAction ─────────────
// NOT a write — the orchestrator surfaces this as something the user
// must approve in the UI. The actual INSERT happens elsewhere.
export const propose_create_task: Skill<
  { title: string; project_id?: string; due_date?: string; priority?: string; description?: string },
  any
> = {
  id: 'tasks.propose_create',
  description: 'Propose a new task to be created. The user must approve before it persists.',
  kind: 'write',
  validate: (p: any) => {
    if (!p?.title) throw new Error('title required');
    return {
      title: p.title,
      project_id: p.project_id || undefined,
      due_date: p.due_date || undefined,
      priority: p.priority || 'medium',
      description: p.description || undefined,
    };
  },
  run: async (params, _ctx) => {
    // No DB call — just shape the proposal. The orchestrator surfaces
    // this in OrchestratorOutput.proposedActions for the UI to render
    // an approval card. Actual creation goes through CalendarContext.
    return ok('analysis', {
      proposalKind: 'create_task',
      params,
    } as any, 0);
  },
};

export const taskSkills = [
  list_open_tasks_for_me,
  list_overdue_tasks,
  count_tasks_by_status,
  search_tasks,
  get_task_with_subtasks,
  propose_create_task,
];
