/**
 * Calendar skills — read-only access to calendar_events table.
 */

import type { Skill, SkillResult, ExecutionContext } from '../types';

const ok = <T>(kind: SkillResult<T>['kind'], data: T, ms?: number): SkillResult<T> =>
  ({ ok: true, kind, data, ms });
const fail = (kind: SkillResult<any>['kind'], reason: string, ms?: number): SkillResult<any> =>
  ({ ok: false, kind, reason, ms });

export const today_events: Skill<{}, Array<any>> = {
  id: 'calendar.today_events',
  description: "All events on today's calendar, sorted by start time.",
  kind: 'read',
  run: async (_p, ctx: ExecutionContext) => {
    const t0 = Date.now();
    const today = (ctx.now || new Date()).toISOString().slice(0, 10);
    const { data, error } = await ctx.db
      .from('calendar_events')
      .select('id, title, start_date, start_time, duration, type, location')
      .eq('tenant_id', ctx.tenantId)
      .eq('start_date', today)
      .order('start_time', { ascending: true });
    const ms = Date.now() - t0;
    if (error) return fail('event[]', error.message, ms);
    if (!data || data.length === 0) return fail('event[]', 'no_events_today', ms);
    return ok('event[]', data, ms);
  },
};

export const upcoming_events: Skill<{ days?: number }, Array<any>> = {
  id: 'calendar.upcoming_events',
  description: 'Events in the next N days (default 7).',
  kind: 'read',
  validate: (p: any) => ({ days: Math.min(p?.days || 7, 30) }),
  run: async (params, ctx) => {
    const t0 = Date.now();
    const start = (ctx.now || new Date()).toISOString().slice(0, 10);
    const end = new Date((ctx.now || new Date()).getTime() + params.days * 86400000).toISOString().slice(0, 10);
    const { data, error } = await ctx.db
      .from('calendar_events')
      .select('id, title, start_date, start_time, duration, type, location')
      .eq('tenant_id', ctx.tenantId)
      .gte('start_date', start)
      .lte('start_date', end)
      .order('start_date', { ascending: true })
      .order('start_time', { ascending: true });
    const ms = Date.now() - t0;
    if (error) return fail('event[]', error.message, ms);
    if (!data || data.length === 0) return fail('event[]', 'no_upcoming', ms);
    return ok('event[]', data, ms);
  },
};

export const detect_conflicts: Skill<{}, Array<any>> = {
  id: 'calendar.detect_conflicts',
  description: 'Find time-overlapping events on today.',
  kind: 'read',
  run: async (_p, ctx) => {
    const t0 = Date.now();
    const today = (ctx.now || new Date()).toISOString().slice(0, 10);
    const { data, error } = await ctx.db
      .from('calendar_events')
      .select('id, title, start_time, duration')
      .eq('tenant_id', ctx.tenantId)
      .eq('start_date', today)
      .not('start_time', 'is', null)
      .order('start_time');
    const ms = Date.now() - t0;
    if (error) return fail('analysis', error.message, ms);
    const sorted = (data || []).filter((e: any) => e.start_time);
    const conflicts: any[] = [];
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i] as any; const b = sorted[j] as any;
        const aStart = toMin(a.start_time); const aEnd = aStart + (a.duration || 60);
        const bStart = toMin(b.start_time);
        if (bStart < aEnd) conflicts.push({ a, b });
      }
    }
    if (conflicts.length === 0) return fail('analysis', 'no_conflicts', ms);
    return ok('analysis', conflicts as any, ms);
  },
};
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

export const calendarSkills = [today_events, upcoming_events, detect_conflicts];
