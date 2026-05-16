/**
 * Inbox skills — read-only access to communication_messages, including
 * AI-flagged requests + unread counts.
 */

import type { Skill, SkillResult, ExecutionContext } from '../types';

const ok = <T>(kind: SkillResult<T>['kind'], data: T, ms?: number): SkillResult<T> =>
  ({ ok: true, kind, data, ms });
const fail = (kind: SkillResult<any>['kind'], reason: string, ms?: number): SkillResult<any> =>
  ({ ok: false, kind, reason, ms });

export const pending_messages: Skill<{ platform?: 'gmail' | 'slack' }, Array<any>> = {
  id: 'inbox.pending',
  description: 'Inbound messages still pending action (not replied, not archived).',
  kind: 'read',
  validate: (p: any) => ({ platform: p?.platform }),
  run: async (params, ctx) => {
    const t0 = Date.now();
    let q = ctx.db.from('communication_messages')
      .select('id, platform, from_name, from_email, subject, body_text, channel_name, received_at, ai_classification, matched_client_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('status', 'pending')
      .order('received_at', { ascending: false })
      .limit(40);
    if (params.platform) q = q.eq('platform', params.platform);
    const { data, error } = await q;
    const ms = Date.now() - t0;
    if (error) return fail('message[]', error.message, ms);
    if (!data || data.length === 0) return fail('message[]', 'inbox_clear', ms);
    return ok('message[]', data, ms);
  },
};

export const ai_flagged_requests: Skill<{}, Array<any>> = {
  id: 'inbox.ai_flagged_requests',
  description: 'Messages the AI classifier flagged as task-requests, not yet converted.',
  kind: 'read',
  run: async (_p, ctx) => {
    const t0 = Date.now();
    const { data, error } = await ctx.db.from('communication_messages')
      .select('id, platform, from_name, subject, body_text, channel_name, ai_classification, received_at')
      .eq('tenant_id', ctx.tenantId)
      .neq('status', 'task_created')
      .filter('ai_classification->>should_create_task', 'eq', 'true')
      .order('received_at', { ascending: false })
      .limit(30);
    const ms = Date.now() - t0;
    if (error) return fail('message[]', error.message, ms);
    if (!data || data.length === 0) return fail('message[]', 'no_requests', ms);
    return ok('message[]', data, ms);
  },
};

export const inboxSkills = [pending_messages, ai_flagged_requests];
