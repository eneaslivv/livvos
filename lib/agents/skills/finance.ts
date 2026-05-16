/**
 * Finance skills — strict read-only access to incomes, expenses, and
 * installments. All queries scoped to the active tenant via RLS. Never
 * invents amounts or status.
 */

import type { Skill, SkillResult, ExecutionContext } from '../types';

const ok = <T>(kind: SkillResult<T>['kind'], data: T, ms?: number): SkillResult<T> =>
  ({ ok: true, kind, data, ms });
const fail = (kind: SkillResult<any>['kind'], reason: string, ms?: number): SkillResult<any> =>
  ({ ok: false, kind, reason, ms });

// ── 1. Month financial summary ───────────────────────────────────────
export const monthly_summary: Skill<
  { year?: number; month?: number },
  { income: number; expense: number; net: number; income_paid: number; income_pending: number; period: string }
> = {
  id: 'finance.monthly_summary',
  description: 'Total incomes / expenses / net for a given month (default = current).',
  kind: 'read',
  validate: (p: any) => {
    const now = new Date();
    return { year: p?.year || now.getFullYear(), month: p?.month || (now.getMonth() + 1) };
  },
  run: async (params, ctx) => {
    const t0 = Date.now();
    const monthStr = String(params.month).padStart(2, '0');
    const start = `${params.year}-${monthStr}-01`;
    const next = new Date(params.year, params.month, 1).toISOString().slice(0, 10);

    const [incRes, expRes, instRes] = await Promise.all([
      ctx.db.from('incomes').select('total_amount, status, due_date')
        .eq('tenant_id', ctx.tenantId).gte('due_date', start).lt('due_date', next),
      ctx.db.from('expenses').select('amount, status, date')
        .eq('tenant_id', ctx.tenantId).gte('date', start).lt('date', next),
      ctx.db.from('installments').select('amount, status, paid_date, due_date')
        .gte('due_date', start).lt('due_date', next),
    ]);
    const ms = Date.now() - t0;
    if (incRes.error) return fail('analysis', incRes.error.message, ms);
    if (expRes.error) return fail('analysis', expRes.error.message, ms);

    const income = (incRes.data || []).reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0);
    const expense = (expRes.data || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    const income_paid = (instRes.data || []).filter((r: any) => r.status === 'paid')
      .reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    const income_pending = (instRes.data || []).filter((r: any) => r.status !== 'paid')
      .reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

    if (income === 0 && expense === 0 && (instRes.data || []).length === 0) {
      return fail('analysis', 'no_finance_data', ms);
    }
    return ok('analysis', {
      income, expense, net: income - expense,
      income_paid, income_pending,
      period: `${params.year}-${monthStr}`,
    }, ms);
  },
};

// ── 2. Overdue installments ──────────────────────────────────────────
export const overdue_installments: Skill<{}, Array<any>> = {
  id: 'finance.overdue_installments',
  description: 'List installments whose due_date has passed but status != paid.',
  kind: 'read',
  run: async (_params, ctx) => {
    const t0 = Date.now();
    const todayStr = (ctx.now || new Date()).toISOString().slice(0, 10);
    const { data, error } = await ctx.db
      .from('installments')
      .select('id, income_id, amount, due_date, status, paid_date, number')
      .lt('due_date', todayStr)
      .neq('status', 'paid')
      .limit(50);
    const ms = Date.now() - t0;
    if (error) return fail('income[]', error.message, ms);
    if (!data || data.length === 0) return fail('income[]', 'none_overdue', ms);
    return ok('income[]', data, ms);
  },
};

// ── 3. Profitability by project ──────────────────────────────────────
export const project_profitability: Skill<{ project_id: string }, any> = {
  id: 'finance.project_profitability',
  description: 'Compute income collected, expenses, and net for a single project.',
  kind: 'read',
  validate: (p: any) => {
    if (!p?.project_id) throw new Error('project_id required');
    return { project_id: p.project_id };
  },
  run: async (params, ctx) => {
    const t0 = Date.now();
    const [incRes, expRes] = await Promise.all([
      ctx.db.from('incomes').select('total_amount, installments').eq('tenant_id', ctx.tenantId).eq('project_id', params.project_id),
      ctx.db.from('expenses').select('amount').eq('tenant_id', ctx.tenantId).eq('project_id', params.project_id),
    ]);
    const ms = Date.now() - t0;
    if (incRes.error) return fail('analysis', incRes.error.message, ms);
    if (expRes.error) return fail('analysis', expRes.error.message, ms);
    const totalIncome = (incRes.data || []).reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0);
    const collected = (incRes.data || []).flatMap((r: any) => r.installments || [])
      .filter((i: any) => i.status === 'paid')
      .reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
    const totalExpense = (expRes.data || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    if (totalIncome === 0 && totalExpense === 0) return fail('analysis', 'no_finance_data', ms);
    return ok('analysis', {
      total_agreed: totalIncome,
      collected,
      pending: totalIncome - collected,
      expenses: totalExpense,
      net: collected - totalExpense,
    } as any, ms);
  },
};

export const financeSkills = [monthly_summary, overdue_installments, project_profitability];
