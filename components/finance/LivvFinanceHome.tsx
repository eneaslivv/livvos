/**
 * LivvFinanceHome — invoice-first overview for the Finance module.
 *
 * The practical "keep your invoices up to date" landing: collected /
 * outstanding / overdue / expenses at the top, the invoice list with a
 * one-tap Mark-paid in the center, and cashflow + revenue-by-client on
 * the side. Reuses every data source + handler from pages/Finance.tsx —
 * no new business logic. The deeper P&L analytics stay one click away
 * (onViewAnalytics → the original LivvFinanceDashboard).
 */

import React, { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Clock, AlertCircle, Plus, BarChart3, Receipt, ChevronDown, Check } from 'lucide-react';
import type { IncomeEntry, Installment, ExpenseEntry } from '../../context/FinanceContext';
import type { LiquidityPoint } from './LivvFinanceDashboard';
import { useIsDarkMode } from '../../hooks/useIsDarkMode';

// ── Palette (kept in sync with LivvFinanceDashboard) ──────────────────
const C = {
  cream: '#FDFBF7', oat: '#F5F2EB', bone: '#E6E2D8', sand: '#D6D1C7',
  ink: '#09090B', body: 'rgba(90,62,62,0.7)', meta: 'rgba(90,62,62,0.55)',
  dashed: 'rgba(90,62,62,0.22)', dashedSoft: 'rgba(90,62,62,0.15)',
  panel: '#FFFFFF', surface: '#F5F2EB',
  gold: '#C4A35A', goldHi: '#E8BC59', income: '#769268', expense: '#C4504A',
  wine: '#7a4038', pink: '#F1ADD8', blue: '#6E89A6',
};
const C_DARK: typeof C = {
  cream: '#0A0A0B', oat: '#141416', bone: 'rgba(255,255,255,0.08)', sand: 'rgba(255,255,255,0.12)',
  ink: '#F4F4F5', body: 'rgba(244,244,245,0.72)', meta: 'rgba(244,244,245,0.50)',
  dashed: 'rgba(255,255,255,0.18)', dashedSoft: 'rgba(255,255,255,0.10)',
  panel: '#1B1B1E', surface: '#141416',
  gold: '#D4B574', goldHi: '#F0CC73', income: '#7FA876', expense: '#D8635C',
  wine: '#A35A52', pink: '#F1ADD8', blue: '#8AA4C0',
};
const usePalette = (): typeof C => (useIsDarkMode() ? C_DARK : C);

const fmt = (n: number) => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
const fmtDue = (s?: string | null) => {
  if (!s) return '—';
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
};
const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)' };
const SANS = 'var(--font-sans, Inter, sans-serif)';

type Period = 'month' | 'quarter' | 'year';
type Filter = 'all' | 'pending' | 'overdue' | 'paid';

export interface LivvFinanceHomeProps {
  incomes: IncomeEntry[];
  expenses: ExpenseEntry[];
  liquidityData: LiquidityPoint[];
  onAddIncome: () => void;
  onAddExpense: () => void;
  onMarkInstallmentPaid: (inst: Installment) => Promise<void> | void;
  onJumpToTab: (tab: 'ingresos' | 'gastos' | 'proyectos' | 'budgets' | 'propuestas') => void;
  onViewAnalytics?: () => void;
  canCreate: boolean;
}

const PERIOD_LABEL: Record<Period, string> = { month: 'This month', quarter: 'Quarter', year: 'Year' };

export const LivvFinanceHome: React.FC<LivvFinanceHomeProps> = ({
  incomes, expenses, liquidityData,
  onAddIncome, onAddExpense, onMarkInstallmentPaid, onJumpToTab, onViewAnalytics, canCreate,
}) => {
  const c = usePalette();
  const [period, setPeriod] = useState<Period>('month');
  const [filter, setFilter] = useState<Filter>('all');
  // Invoices expanded to reveal their installments (payments + dates).
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggleExpand = (id: string) => setExpanded(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const todayIso = new Date().toISOString().slice(0, 10);
  const periodStart = useMemo(() => {
    const d = new Date();
    if (period === 'month') return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
    if (period === 'quarter') return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1).toISOString().slice(0, 10);
    return new Date(d.getFullYear(), 0, 1).toISOString().slice(0, 10);
  }, [period]);

  // ── Aggregates ──────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let collected = 0, outstanding = 0, overdue = 0;
    let openCount = 0, overdueCount = 0;
    for (const inc of incomes) {
      const insts = inc.installments || [];
      let incHasOpen = false, incHasOverdue = false;
      if (insts.length) {
        for (const i of insts) {
          if (i.status === 'paid') {
            if (i.paid_date && i.paid_date.slice(0, 10) >= periodStart) collected += i.amount;
          } else {
            outstanding += i.amount; incHasOpen = true;
            if (i.due_date && i.due_date.slice(0, 10) < todayIso) { overdue += i.amount; incHasOverdue = true; }
          }
        }
      } else {
        // No installment rows — fall back to the income's own status/amount.
        if (inc.status === 'paid') { collected += inc.total_amount; }
        else { outstanding += inc.total_amount; incHasOpen = true; if (inc.status === 'overdue') { overdue += inc.total_amount; incHasOverdue = true; } }
      }
      if (incHasOpen) openCount++;
      if (incHasOverdue) overdueCount++;
    }
    const expensesPeriod = expenses
      .filter(e => (e.date || '').slice(0, 10) >= periodStart)
      .reduce((s, e) => s + (e.amount || 0), 0);
    return { collected, outstanding, overdue, openCount, overdueCount, expensesPeriod, net: collected - expensesPeriod };
  }, [incomes, expenses, periodStart, todayIso]);

  // ── Invoice list (incomes) + filter counts ──────────────────────────
  const filterCounts = useMemo(() => {
    let pending = 0, overdue = 0, paid = 0;
    for (const inc of incomes) {
      if (inc.status === 'paid') paid++;
      else if (inc.status === 'overdue') overdue++;
      else pending++;
    }
    return { all: incomes.length, pending, overdue, paid };
  }, [incomes]);

  const invoices = useMemo(() => {
    const rank = (s: string) => (s === 'overdue' ? 0 : s === 'partial' ? 1 : s === 'pending' ? 2 : 3);
    return [...incomes]
      .filter(inc => {
        if (filter === 'all') return true;
        if (filter === 'paid') return inc.status === 'paid';
        if (filter === 'overdue') return inc.status === 'overdue';
        return inc.status === 'pending' || inc.status === 'partial';
      })
      .sort((a, b) => rank(a.status) - rank(b.status) || (a.due_date || '9999').localeCompare(b.due_date || '9999'));
  }, [incomes, filter]);

  // ── Cashflow (last 6 months from liquidityData) ─────────────────────
  const cashflow = useMemo(() => {
    const rows = (liquidityData || []).slice(-6);
    const max = Math.max(1, ...rows.map(r => Math.max(r.ingresos, r.gastos)));
    return { rows, max };
  }, [liquidityData]);

  // ── Revenue by client (share of invoiced total) ─────────────────────
  const revenueByClient = useMemo(() => {
    const map = new Map<string, number>();
    for (const inc of incomes) {
      const name = inc.client_name && inc.client_name !== 'General' ? inc.client_name : 'Internal · Livv';
      map.set(name, (map.get(name) || 0) + inc.total_amount);
    }
    const total = Array.from(map.values()).reduce((s, v) => s + v, 0) || 1;
    const palette = [c.income, c.pink, c.blue, c.gold, c.wine];
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value], i) => ({ name, value, pct: Math.round((value / total) * 100), color: palette[i % palette.length] }));
  }, [incomes, c]);

  // ── Per-project P&L (income vs costs) — surfaced inside an expanded
  //    invoice so you can read the project's profitability in context. ──
  const projectPnL = useMemo(() => {
    const map = new Map<string, { name: string; income: number; collected: number; costs: number }>();
    for (const inc of incomes) {
      if (!inc.project_id) continue;
      let e = map.get(inc.project_id);
      if (!e) { e = { name: inc.project_name || inc.concept || 'Project', income: 0, collected: 0, costs: 0 }; map.set(inc.project_id, e); }
      e.income += inc.total_amount || 0;
      e.collected += (inc.installments || []).filter(i => i.status === 'paid').reduce((s, i) => s + (i.amount || 0), 0);
    }
    for (const exp of expenses) {
      if (!exp.project_id) continue;
      let e = map.get(exp.project_id);
      if (!e) { e = { name: exp.project_name || 'Project', income: 0, collected: 0, costs: 0 }; map.set(exp.project_id, e); }
      e.costs += exp.amount || 0;
    }
    return map;
  }, [incomes, expenses]);

  const markIncomePaid = async (inc: IncomeEntry) => {
    const unpaid = (inc.installments || []).filter(i => i.status !== 'paid');
    for (const inst of unpaid) await onMarkInstallmentPaid(inst);
  };

  const STATUS_PILL: Record<string, { label: string; bg: string; fg: string }> = {
    paid:    { label: 'PAID',    bg: 'rgba(118,146,104,0.14)', fg: c.income },
    overdue: { label: 'OVERDUE', bg: 'rgba(196,80,74,0.12)',   fg: c.expense },
    partial: { label: 'PARTIAL', bg: 'rgba(196,163,90,0.16)',  fg: c.gold },
    pending: { label: 'PENDING', bg: 'rgba(90,62,62,0.08)',    fg: c.meta },
  };

  const cardStyle: React.CSSProperties = {
    background: c.panel, border: `0.5px solid ${c.dashedSoft}`, borderRadius: 16,
    boxShadow: '0 1px 2px rgba(90,62,62,0.04)',
  };
  const eyebrow: React.CSSProperties = { ...MONO, fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: c.meta };

  return (
    <div style={{ fontFamily: SANS, color: c.ink }}>
      {/* ── Header ── */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <div style={eyebrow}>◎ Finances 財務</div>
          <h1 style={{ fontFamily: SANS, fontWeight: 300, fontSize: 'clamp(28px,4vw,40px)', letterSpacing: '-0.03em', lineHeight: 1, margin: '8px 0 6px', color: c.ink }}>
            Finances
          </h1>
          <p style={{ ...MONO, fontSize: 11.5, color: c.meta }}>
            Net <span style={{ color: stats.net >= 0 ? c.income : c.expense, fontWeight: 600 }}>{fmt(stats.net)}</span> {PERIOD_LABEL[period].toLowerCase()} · keep your invoices up to date below
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period toggle */}
          <div style={{ display: 'inline-flex', padding: 3, background: c.surface, borderRadius: 999, border: `0.5px solid ${c.dashedSoft}` }}>
            {(['month', 'quarter', 'year'] as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                style={{ ...MONO, padding: '5px 13px', fontSize: 11, fontWeight: 500, borderRadius: 999, border: 0, cursor: 'pointer',
                  background: period === p ? c.ink : 'transparent', color: period === p ? c.cream : c.meta, transition: 'all .2s' }}>
                {PERIOD_LABEL[p]}
              </button>
            ))}
          </div>
          {canCreate && (
            <button onClick={onAddIncome}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: c.ink, color: c.cream, border: 0, borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
              <Plus size={14} /> New invoice
            </button>
          )}
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Collected', value: stats.collected, caption: 'paid this period', Icon: ArrowDownLeft, color: c.income },
          { label: 'Outstanding', value: stats.outstanding, caption: `${stats.openCount} open invoice${stats.openCount === 1 ? '' : 's'}`, Icon: Clock, color: c.gold },
          { label: 'Overdue', value: stats.overdue, caption: stats.overdueCount > 0 ? `${stats.overdueCount} need${stats.overdueCount === 1 ? 's' : ''} a nudge` : 'all current', Icon: AlertCircle, color: c.expense },
          { label: 'Expenses', value: stats.expensesPeriod, caption: PERIOD_LABEL[period].toLowerCase(), Icon: ArrowUpRight, color: c.ink },
        ].map(s => (
          <div key={s.label} style={{ ...cardStyle, padding: '16px 18px' }}>
            <div className="flex items-center justify-between mb-2.5">
              <span style={eyebrow}>{s.label}</span>
              <s.Icon size={13} style={{ color: c.meta }} />
            </div>
            <div style={{ fontFamily: SANS, fontWeight: 300, fontSize: 30, letterSpacing: '-0.03em', lineHeight: 1, color: s.color, fontVariantNumeric: 'tabular-nums' }}>
              {fmt(s.value)}
            </div>
            <div style={{ ...MONO, fontSize: 10.5, color: c.meta, marginTop: 8 }}>{s.caption}</div>
          </div>
        ))}
      </div>

      {/* ── Body: invoices (left) + side widgets (right) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* Invoices */}
        <div className="lg:col-span-2" style={cardStyle}>
          <div className="flex items-center justify-between px-5 pt-4 pb-3 flex-wrap gap-2">
            <span style={eyebrow}>Invoices</span>
            <div className="flex items-center gap-1.5">
              {([
                { id: 'all' as Filter, label: 'All', n: filterCounts.all },
                { id: 'pending' as Filter, label: 'Pending', n: filterCounts.pending },
                { id: 'overdue' as Filter, label: 'Overdue', n: filterCounts.overdue },
                { id: 'paid' as Filter, label: 'Paid', n: filterCounts.paid },
              ]).map(f => (
                <button key={f.id} onClick={() => setFilter(f.id)}
                  style={{ ...MONO, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 11px', fontSize: 11, fontWeight: 500, borderRadius: 999, cursor: 'pointer',
                    border: filter === f.id ? `0.5px solid ${c.ink}` : `0.5px solid ${c.dashedSoft}`,
                    background: filter === f.id ? c.ink : 'transparent', color: filter === f.id ? c.cream : c.meta }}>
                  {f.label}<span style={{ opacity: 0.65 }}>{f.n}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            {invoices.length === 0 ? (
              <p style={{ ...MONO, fontSize: 12, color: c.meta, padding: '28px 0', textAlign: 'center' }}>No invoices here.</p>
            ) : invoices.map(inc => {
              const pill = STATUS_PILL[inc.status] || STATUS_PILL.pending;
              const isPaid = inc.status === 'paid';
              const isOpen = expanded.has(inc.id);
              const insts = inc.installments || [];
              return (
                <div key={inc.id} style={{ borderTop: `0.5px solid ${c.dashedSoft}` }}>
                  <div
                    role="button"
                    onClick={() => toggleExpand(inc.id)}
                    className="flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
                  >
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: isPaid ? c.income : inc.status === 'overdue' ? c.expense : c.gold, flexShrink: 0 }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: c.ink }} className="truncate">
                          {inc.client_name && inc.client_name !== 'General' ? inc.client_name : 'Internal · Livv'}
                        </span>
                        <span style={{ ...MONO, padding: '2px 7px', borderRadius: 999, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.08em', background: pill.bg, color: pill.fg }}>
                          {pill.label}
                        </span>
                      </div>
                      {inc.concept && <div style={{ ...MONO, fontSize: 10.5, color: c.meta, marginTop: 2 }} className="truncate">{inc.concept}{insts.length > 1 ? ` · ${insts.filter(i => i.status === 'paid').length}/${insts.length} installments` : ''}</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: c.ink, fontVariantNumeric: 'tabular-nums' }}>{fmt(inc.total_amount)}</div>
                      {inc.due_date && <div style={{ ...MONO, fontSize: 10, color: inc.status === 'overdue' ? c.expense : c.meta }}>due {fmtDue(inc.due_date)}</div>}
                    </div>
                    {isPaid ? (
                      <span style={{ ...MONO, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', fontSize: 11.5, fontWeight: 500, borderRadius: 999, border: `0.5px solid ${c.dashedSoft}`, color: c.meta, flexShrink: 0 }}>
                        Paid
                      </span>
                    ) : canCreate ? (
                      <button onClick={(e) => { e.stopPropagation(); markIncomePaid(inc); }}
                        style={{ ...MONO, padding: '7px 14px', fontSize: 11.5, fontWeight: 600, borderRadius: 999, border: 0, background: c.ink, color: c.cream, cursor: 'pointer', flexShrink: 0 }}>
                        Mark paid
                      </button>
                    ) : null}
                    <ChevronDown size={14} style={{ color: c.meta, flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                  </div>
                  {/* Mini dropdown — installments (payments + dates) */}
                  {isOpen && (
                    <div style={{ background: c.surface, padding: '6px 20px 10px 36px' }}>
                      {insts.length > 0 ? insts.map(inst => {
                        const ip = inst.status === 'paid' ? c.income : inst.status === 'overdue' ? c.expense : c.gold;
                        return (
                          <div key={inst.id} className="flex items-center gap-3 py-1.5">
                            <span style={{ width: 6, height: 6, borderRadius: 999, background: ip, flexShrink: 0 }} />
                            <span style={{ ...MONO, fontSize: 11, color: c.body }} className="flex-1 min-w-0 truncate">
                              Installment {inst.number}
                              <span style={{ color: c.meta }}> · {inst.status === 'paid' && inst.paid_date ? `paid ${fmtDue(inst.paid_date)}` : `due ${fmtDue(inst.due_date)}`}</span>
                            </span>
                            <span style={{ ...MONO, fontSize: 11, fontWeight: 600, color: inst.status === 'paid' ? c.income : c.ink, fontVariantNumeric: 'tabular-nums' }}>{fmt(inst.amount)}</span>
                            {inst.status !== 'paid' && canCreate && (
                              <button onClick={(e) => { e.stopPropagation(); onMarkInstallmentPaid(inst); }}
                                style={{ ...MONO, display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9.5, fontWeight: 600, padding: '3px 8px', borderRadius: 999, border: `0.5px solid ${c.dashedSoft}`, background: 'transparent', color: c.body, cursor: 'pointer', flexShrink: 0 }}>
                                <Check size={9} /> mark
                              </button>
                            )}
                          </div>
                        );
                      }) : (
                        <div style={{ ...MONO, fontSize: 11, color: c.meta, paddingTop: 2 }}>
                          Single payment · {inc.due_date ? `due ${fmtDue(inc.due_date)}` : 'no due date'} · {fmt(inc.total_amount)}
                        </div>
                      )}
                      {/* Project profitability — income vs costs for the project this invoice belongs to */}
                      {(() => {
                        if (!inc.project_id) return null;
                        const pnl = projectPnL.get(inc.project_id);
                        if (!pnl || (pnl.income === 0 && pnl.costs === 0)) return null;
                        const profit = pnl.income - pnl.costs;
                        const margin = pnl.income > 0 ? Math.round((profit / pnl.income) * 100) : 0;
                        return (
                          <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${c.dashed}` }}>
                            <div className="flex items-center justify-between mb-1.5">
                              <span style={{ ...MONO, fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.meta }}>Project · {pnl.name}</span>
                              <span style={{ ...MONO, fontSize: 10, fontWeight: 600, color: profit >= 0 ? c.income : c.expense }}>{margin}% margin</span>
                            </div>
                            <div className="flex items-center gap-5 flex-wrap">
                              {[
                                { l: 'Income', v: fmt(pnl.income), col: c.ink },
                                { l: 'Costs', v: fmt(pnl.costs), col: c.expense },
                                { l: 'Profit', v: fmt(profit), col: profit >= 0 ? c.income : c.expense },
                              ].map(m => (
                                <div key={m.l}>
                                  <span style={{ ...MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.meta }}>{m.l} </span>
                                  <span style={{ ...MONO, fontSize: 12.5, fontWeight: 600, color: m.col, fontVariantNumeric: 'tabular-nums' }}>{m.v}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button onClick={() => onJumpToTab('ingresos')}
            style={{ ...MONO, width: '100%', textAlign: 'center', padding: '11px 0', fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: c.meta, background: 'transparent', border: 0, borderTop: `0.5px solid ${c.dashedSoft}`, cursor: 'pointer' }}>
            Manage all invoices →
          </button>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Cashflow */}
          <div style={{ ...cardStyle, padding: '16px 18px' }}>
            <div className="flex items-center justify-between mb-4">
              <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: c.ink }}>Cashflow</span>
              <span style={eyebrow}>Last 6 months</span>
            </div>
            {cashflow.rows.length === 0 ? (
              <p style={{ ...MONO, fontSize: 11, color: c.meta, padding: '12px 0' }}>No data yet.</p>
            ) : (
              <div className="flex items-end justify-between gap-2" style={{ height: 96 }}>
                {cashflow.rows.map((r, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5" title={`${r.month}: +${fmt(r.ingresos)} / -${fmt(r.gastos)}`}>
                    <div className="w-full flex items-end justify-center gap-0.5" style={{ height: 80 }}>
                      <div style={{ width: '42%', height: `${Math.max(2, (r.ingresos / cashflow.max) * 80)}px`, background: c.gold, borderRadius: '3px 3px 0 0' }} />
                      <div style={{ width: '42%', height: `${Math.max(2, (r.gastos / cashflow.max) * 80)}px`, background: c.bone, borderRadius: '3px 3px 0 0' }} />
                    </div>
                    <span style={{ ...MONO, fontSize: 8.5, color: c.meta, textTransform: 'uppercase' }}>{(r.month || '').slice(0, 3)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: `1px dashed ${c.dashed}` }}>
              <div className="flex items-center gap-3" style={{ ...MONO, fontSize: 10, color: c.meta }}>
                <span className="inline-flex items-center gap-1"><span style={{ width: 7, height: 7, borderRadius: 2, background: c.gold }} /> Income</span>
                <span className="inline-flex items-center gap-1"><span style={{ width: 7, height: 7, borderRadius: 2, background: c.bone }} /> Expenses</span>
              </div>
              <span style={{ ...MONO, fontSize: 10.5, color: c.meta }}>Net <span style={{ color: stats.net >= 0 ? c.income : c.expense, fontWeight: 600 }}>{fmt(stats.net)}</span></span>
            </div>
          </div>

          {/* Revenue by client */}
          {revenueByClient.length > 0 && (
            <div style={{ ...cardStyle, padding: '16px 18px' }}>
              <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: c.ink, marginBottom: 14 }}>Revenue by client</div>
              <div className="space-y-3">
                {revenueByClient.map(r => (
                  <div key={r.name}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="inline-flex items-center gap-1.5 min-w-0">
                        <span style={{ width: 7, height: 7, borderRadius: 999, background: r.color, flexShrink: 0 }} />
                        <span style={{ fontFamily: SANS, fontSize: 12.5, color: c.ink }} className="truncate">{r.name}</span>
                      </span>
                      <span style={{ ...MONO, fontSize: 11, color: c.meta }}>{r.pct}%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: c.surface, overflow: 'hidden' }}>
                      <div style={{ width: `${r.pct}%`, height: '100%', borderRadius: 999, background: r.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Record an expense */}
          {canCreate && (
            <button onClick={onAddExpense}
              style={{ ...cardStyle, width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '13px 18px', cursor: 'pointer', ...MONO, fontSize: 12, color: c.body }}>
              <Receipt size={14} style={{ color: c.meta }} /> Record an expense
            </button>
          )}

          {/* Full analytics link */}
          {onViewAnalytics && (
            <button onClick={onViewAnalytics}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px 18px', cursor: 'pointer', background: 'transparent', border: 0, ...MONO, fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: c.meta }}>
              <BarChart3 size={13} /> Full P&L analytics →
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
