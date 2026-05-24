/**
 * Onboarding skills — read-only data checks that help the onboarding
 * agent avoid duplicates and provide context during guided setup.
 */

import type { Skill, SkillResult, ExecutionContext } from '../types';

const ok = <T>(kind: SkillResult<T>['kind'], data: T, ms?: number): SkillResult<T> =>
  ({ ok: true, kind, data, ms });
const fail = (kind: SkillResult<any>['kind'], reason: string, ms?: number): SkillResult<any> =>
  ({ ok: false, kind, reason, ms });

/** List existing clients so the agent can detect duplicates and suggest
 *  linking to existing records during onboarding. */
export const check_existing_clients: Skill<Record<string, never>, any[]> = {
  id: 'onboarding.existing_clients',
  description: 'List existing clients so the agent can detect duplicates and suggest linking to existing records.',
  kind: 'read',
  run: async (_params, ctx) => {
    const t0 = Date.now();
    const { data, error } = await ctx.db.from('clients')
      .select('id, name, email, company, status, industry')
      .eq('tenant_id', ctx.tenantId)
      .order('name')
      .limit(100);
    const ms = Date.now() - t0;
    if (error) return fail('client[]', error.message, ms);
    return ok('client[]', data || [], ms);
  },
};

/** List existing projects so the agent can link new items or detect
 *  duplicate project names. */
export const check_existing_projects: Skill<Record<string, never>, any[]> = {
  id: 'onboarding.existing_projects',
  description: 'List existing projects so the agent can link new items or detect duplicate names.',
  kind: 'read',
  run: async (_params, ctx) => {
    const t0 = Date.now();
    const { data, error } = await ctx.db.from('projects')
      .select('id, title, client_id, status, deadline')
      .eq('tenant_id', ctx.tenantId)
      .order('created_at', { ascending: false })
      .limit(80);
    const ms = Date.now() - t0;
    if (error) return fail('project[]', error.message, ms);
    return ok('project[]', data || [], ms);
  },
};

/** List team members available for task assignment during onboarding. */
export const list_team_for_assignment: Skill<Record<string, never>, any[]> = {
  id: 'onboarding.team_members',
  description: 'List team members available for task assignment.',
  kind: 'read',
  run: async (_params, ctx) => {
    const t0 = Date.now();
    const { data, error } = await ctx.db.from('profiles')
      .select('id, name, email, role')
      .eq('tenant_id', ctx.tenantId)
      .limit(50);
    const ms = Date.now() - t0;
    if (error) return fail('none', error.message, ms);
    return ok('analysis', data || [], ms);
  },
};

export const onboardingSkills = [
  check_existing_clients,
  check_existing_projects,
  list_team_for_assignment,
];
