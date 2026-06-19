import type { Skill, SkillResult } from '../types';
import { PROJECT_TYPES } from '../../projectArchitect/types';

const ok = <T>(kind: SkillResult<T>['kind'], data: T, ms?: number): SkillResult<T> =>
  ({ ok: true, kind, data, ms });
const fail = (kind: SkillResult<any>['kind'], reason: string, ms?: number): SkillResult<any> =>
  ({ ok: false, kind, reason, ms });

/** Pick one row per type, preferring the tenant's own calibrated blueprint
 *  over the shared template (tenant_id NULL). */
const preferOwn = (rows: any[]): any[] => {
  const byType = new Map<string, any>();
  for (const row of rows) {
    const existing = byType.get(row.type);
    // A non-null tenant_id (the tenant's own row) wins over a NULL template.
    if (!existing || (row.tenant_id && !existing.tenant_id)) byType.set(row.type, row);
  }
  return Array.from(byType.values());
};

/** Read the matching blueprint for a project type. Prefers the tenant's
 *  own version, falls back to the shared starter template. */
export const get_blueprint: Skill<{ type: string }, any> = {
  id: 'architect.get_blueprint',
  description: 'Read the canonical blueprint for a project type (tenant version preferred, else the shared template).',
  kind: 'read',
  validate: (p: any) => {
    const type = p?.type;
    if (!type || !PROJECT_TYPES.includes(type)) throw new Error('valid_type_required');
    return { type };
  },
  run: async (params, ctx) => {
    const t0 = Date.now();
    const { data, error } = await ctx.db
      .from('project_blueprints')
      .select('id, tenant_id, type, name, stages, is_active')
      .eq('type', params.type)
      .eq('is_active', true)
      // RLS already limits this to the tenant's rows plus shared templates.
      // Order so the tenant's own row (non-null tenant_id) comes first.
      .order('tenant_id', { ascending: false, nullsFirst: false });
    const ms = Date.now() - t0;
    if (error) return fail('analysis', error.message, ms);
    const chosen = (data || [])[0];
    if (!chosen) return fail('analysis', 'no_blueprint_for_type', ms);
    return ok('analysis', chosen, ms);
  },
};

/** List every blueprint the architect can apply (one per type). Used to let
 *  the model classify the brief and select the right blueprint in one call. */
export const list_blueprints: Skill<Record<string, never>, any[]> = {
  id: 'architect.list_blueprints',
  description: 'List the available project blueprints (one per type) so the model can classify and pick.',
  kind: 'read',
  run: async (_params, ctx) => {
    const t0 = Date.now();
    const { data, error } = await ctx.db
      .from('project_blueprints')
      .select('id, tenant_id, type, name, stages, is_active')
      .eq('is_active', true);
    const ms = Date.now() - t0;
    if (error) return fail('analysis', error.message, ms);
    const rows = preferOwn(data || []);
    if (rows.length === 0) return fail('analysis', 'no_blueprints', ms);
    return ok('analysis', rows, ms);
  },
};

export const projectArchitectSkills = [get_blueprint, list_blueprints];
