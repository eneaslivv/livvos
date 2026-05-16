/**
 * Clients skills — read-only CRM access.
 */

import type { Skill, SkillResult, ExecutionContext } from '../types';

const ok = <T>(kind: SkillResult<T>['kind'], data: T, ms?: number): SkillResult<T> =>
  ({ ok: true, kind, data, ms });
const fail = (kind: SkillResult<any>['kind'], reason: string, ms?: number): SkillResult<any> =>
  ({ ok: false, kind, reason, ms });

export const list_clients: Skill<{ status?: string }, Array<any>> = {
  id: 'clients.list',
  description: 'List clients in the active tenant, optionally filtered by status.',
  kind: 'read',
  validate: (p: any) => ({ status: p?.status }),
  run: async (params, ctx) => {
    const t0 = Date.now();
    let q = ctx.db.from('clients')
      .select('id, name, email, company, status, industry, email_context_notes')
      .eq('tenant_id', ctx.tenantId);
    if (params.status) q = q.eq('status', params.status);
    const { data, error } = await q.order('name');
    const ms = Date.now() - t0;
    if (error) return fail('client[]', error.message, ms);
    if (!data || data.length === 0) return fail('client[]', 'no_clients', ms);
    return ok('client[]', data, ms);
  },
};

export const get_client: Skill<{ name_or_id: string }, any> = {
  id: 'clients.get',
  description: 'Fetch one client by id, exact name, or company.',
  kind: 'read',
  validate: (p: any) => {
    if (!p?.name_or_id) throw new Error('name_or_id required');
    return { name_or_id: p.name_or_id };
  },
  run: async (params, ctx) => {
    const t0 = Date.now();
    const term = `%${params.name_or_id.replace(/[%_]/g, m => `\\${m}`)}%`;
    const { data, error } = await ctx.db.from('clients')
      .select('*')
      .eq('tenant_id', ctx.tenantId)
      .or(`id.eq.${params.name_or_id},name.ilike.${term},company.ilike.${term}`)
      .limit(5);
    const ms = Date.now() - t0;
    if (error) return fail('client', error.message, ms);
    if (!data || data.length === 0) return fail('client', 'not_found', ms);
    return ok('client', (data.length === 1 ? data[0] : data) as any, ms);
  },
};

export const clientSkills = [list_clients, get_client];
