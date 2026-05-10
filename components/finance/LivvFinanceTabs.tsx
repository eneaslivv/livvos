/**
 * LivvFinanceTabs — editorial-style tab content for Finance.
 *
 * Adapts the Income / Expenses / Budgets tabs to the Livv editorial
 * visual language already used by LivvFinanceDashboard:
 *  - cream canvas, dashed dividers, gold accent
 *  - 3-metric strip with vertical dashed dividers (was 4 dense cards)
 *  - filter PILLS instead of square chips
 *  - data ROWS instead of dense tables (each row breathes more, drops
 *    irrelevant cells, hides edit/delete behind hover)
 *  - one-click "Mark paid" right on the row, no expand needed
 *
 * No business logic changes — every handler is the same one
 * pages/Finance.tsx already wires up. Only the visual layer moves.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Search, ChevronLeft, ChevronRight, Pencil, Trash2, Plus, Wallet,
  Receipt, ArrowDownLeft, Link2, Check, Clock, AlertTriangle, ChevronDown,
  Sparkles, Upload,
  type LucideIcon,
} from 'lucide-react';
import type {
  IncomeEntry, Installment, ExpenseEntry, Budget,
} from '../../context/FinanceContext';
import { useIsDarkMode } from '../../hooks/useIsDarkMode';

// ──────────────────────────────────────────────────────────────────────
//  Palette (Livv design tokens)
// ──────────────────────────────────────────────────────────────────────

// Default (light) Livv editorial palette. Used by primitives that don't
// re-derive their palette per-render. Components that DO want dark-mode
// support pull `useFinancePalette()` and shadow this `C` locally.
const C = {
  cream:    '#FDFBF7',
  oat:      '#F5F2EB',
  bone:     '#E6E2D8',
  ink:      '#09090B',
  body:     'rgba(90,62,62,0.7)',
  meta:     'rgba(90,62,62,0.55)',
  dashed:   'rgba(90,62,62,0.22)',
  dashedSoft: 'rgba(90,62,62,0.15)',
  gold:     '#C4A35A',
  goldHi:   '#E8BC59',
  income:   '#769268',
  expense:  '#C4504A',
  amber:    '#C4A35A',
  wine:     '#7a4038',
};

// Dark palette for the same editorial layer. We don't try to invert the
// light cream into something neon — the goal is a calm, sophisticated dark
// (zinc-950 base, slightly warmer accent) that keeps the income/expense
// hues recognizable. Hand-tuned, not algorithmic, so the gold accent
// keeps its character against a near-black background.
const C_DARK: typeof C = {
  cream:      '#0A0A0B',           // page surface (was the cream paper)
  oat:        '#141416',           // hover surfaces
  bone:       'rgba(255,255,255,0.08)', // borders / dashed dividers
  ink:        '#F4F4F5',           // primary text (zinc-100)
  body:       'rgba(244,244,245,0.72)',
  meta:       'rgba(244,244,245,0.50)',
  dashed:     'rgba(255,255,255,0.18)',
  dashedSoft: 'rgba(255,255,255,0.10)',
  gold:       '#D4B574',           // gold reads slightly brighter on dark
  goldHi:     '#F0CC73',
  income:     '#7FA876',           // income green, lifted for contrast
  expense:    '#D8635C',           // expense red, lifted for contrast
  amber:      '#D4B574',
  wine:       '#A35A52',
};

/** Returns the active Livv editorial palette. Reactive to the .dark
 *  class on <html> so dropdowns / toggles flip the colors live. */
const useFinancePalette = (): typeof C => (useIsDarkMode() ? C_DARK : C);

// ──────────────────────────────────────────────────────────────────────
//  Format helpers
// ──────────────────────────────────────────────────────────────────────

const fmt = (n: number) => '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
const fmtSigned = (n: number) => (n < 0 ? '-' : '') + fmt(n);
const fmtDate = (s?: string | null) => {
  if (!s) return '—';
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
};

// ──────────────────────────────────────────────────────────────────────
//  Editorial primitives
// ──────────────────────────────────────────────────────────────────────

const Eyebrow: React.FC<{ children: React.ReactNode; gold?: boolean; style?: React.CSSProperties }> = ({ children, gold, style }) => {
  const C = useFinancePalette();
  return (
    <span style={{
      fontFamily: 'Inter', fontSize: 10, fontWeight: 500, letterSpacing: '0.22em',
      textTransform: 'uppercase', color: gold ? C.gold : C.meta, ...style,
    }}>{children}</span>
  );
};

const Dashed: React.FC<{ vertical?: boolean; style?: React.CSSProperties }> = ({ vertical, style }) => {
  const C = useFinancePalette();
  return vertical
    ? <div style={{ width: 1, alignSelf: 'stretch', borderLeft: `1px dashed ${C.dashed}`, ...style }} />
    : <div style={{ height: 1, width: '100%', borderTop: `1px dashed ${C.dashed}`, ...style }} />;
};

/** Hero — eyebrow + h2 + subtitle + optional trailing actions */
const Hero: React.FC<{
  eyebrow: string;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
}> = ({ eyebrow, title, subtitle, trailing }) => {
  const C = useFinancePalette();
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
      marginBottom: 24, flexWrap: 'wrap', gap: 16,
    }}>
      <div>
        <Eyebrow style={{ marginBottom: 8, display: 'block' }}>{eyebrow}</Eyebrow>
        <h2 style={{
          fontFamily: 'Inter', fontWeight: 300, fontSize: 40, lineHeight: 1,
          letterSpacing: '-0.04em', margin: 0, color: C.ink,
        }}>{title}</h2>
        {subtitle && (
          <p style={{
            fontFamily: 'Inter', fontSize: 13, color: C.body, margin: '10px 0 0',
            maxWidth: 480, letterSpacing: '-0.005em',
          }}>{subtitle}</p>
        )}
      </div>
      {trailing && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{trailing}</div>}
    </div>
  );
};

/** Metric strip — 3 numbers separated by vertical dashed dividers */
const MetricStrip: React.FC<{ items: { label: string; value: string; color?: string; hint?: string }[] }> = ({ items }) => {
  const C = useFinancePalette();
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: items.length === 3
        ? '1fr auto 1fr auto 1fr'
        : items.length === 4
          ? '1fr auto 1fr auto 1fr auto 1fr'
          : `repeat(${items.length}, 1fr)`,
      borderTop: `1px dashed ${C.dashed}`, borderBottom: `1px dashed ${C.dashed}`,
      padding: '24px 0', marginBottom: 24,
    }}>
      {items.map((it, i) => (
        <React.Fragment key={i}>
          <div style={{ paddingLeft: i === 0 ? 0 : 24, paddingRight: i === items.length - 1 ? 0 : 24 }}>
            <Eyebrow>{it.label}</Eyebrow>
            <div style={{
              fontFamily: 'Inter', fontWeight: 300, fontSize: 36, lineHeight: 1,
              letterSpacing: '-0.04em', color: it.color || C.ink,
              fontVariantNumeric: 'tabular-nums', marginTop: 8,
            }}>{it.value}</div>
            {it.hint && (
              <div style={{
                fontFamily: '"JetBrains Mono", monospace', fontSize: 10,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: C.meta, marginTop: 6,
              }}>{it.hint}</div>
            )}
          </div>
          {i < items.length - 1 && <Dashed vertical />}
        </React.Fragment>
      ))}
    </div>
  );
};

/** Pill filter chip — rounded-full, ink when active */
const FilterPill: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
}> = ({ active, onClick, children, count }) => {
  const C = useFinancePalette();
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 14px', borderRadius: 9999, cursor: 'pointer',
        border: active ? `1px solid ${C.ink}` : `1px solid ${C.bone}`,
        background: active ? C.ink : 'transparent',
        color: active ? C.cream : C.body,
        fontFamily: 'Inter', fontSize: 12, fontWeight: 500, letterSpacing: '-0.005em',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        transition: 'all .2s cubic-bezier(.16,1,.3,1)',
      }}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span style={{
          fontSize: 10, fontWeight: 500, opacity: active ? 0.7 : 0.5,
          fontFamily: '"JetBrains Mono", monospace',
        }}>{count}</span>
      )}
    </button>
  );
};

/** Search input pill — rounded-full with leading icon */
const SearchPill: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  width?: number | string;
}> = ({ value, onChange, placeholder, width }) => {
  const C = useFinancePalette();
  const isDark = useIsDarkMode();
  const [focused, setFocused] = useState(false);
  return (
    <div style={{
      position: 'relative', display: 'inline-flex', alignItems: 'center',
      width: width || 280, maxWidth: '100%',
      background: isDark ? C.oat : '#FFFFFF', borderRadius: 9999,
      border: `1px solid ${focused ? C.ink : C.bone}`,
      padding: '6px 14px 6px 12px',
      transition: 'border-color .2s',
    }}>
      <Search size={13} color={C.meta} style={{ marginRight: 8, flexShrink: 0 }} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder || 'Search…'}
        style={{
          flex: 1, background: 'transparent', border: 'none', outline: 'none',
          fontFamily: 'Inter', fontSize: 12, fontWeight: 400, color: C.ink,
          letterSpacing: '-0.005em', minWidth: 0,
        }}
      />
    </div>
  );
};

/** Action button — pill, variants */
const ActionButton: React.FC<{
  icon?: React.ReactNode; label: string;
  onClick?: () => void;
  variant?: 'ghost' | 'primary' | 'income' | 'expense' | 'gold';
  size?: 'md' | 'sm';
}> = ({ icon, label, onClick, variant = 'ghost', size = 'md' }) => {
  const C = useFinancePalette();
  const isDark = useIsDarkMode();
  const [hover, setHover] = useState(false);
  // In dark mode the "ghost" / "income" / "expense" variants get a panel-toned
  // background instead of pure white so they don't punch a hole in the layout.
  const surface = isDark ? C.oat : '#FFFFFF';
  const styles: Record<string, React.CSSProperties> = {
    ghost:   { background: surface, color: C.ink,     border: `1px solid ${C.bone}` },
    income:  { background: surface, color: C.income,  border: `1px solid ${C.income}55` },
    expense: { background: surface, color: C.expense, border: `1px solid ${C.expense}55` },
    primary: { background: C.ink,   color: C.cream,   border: `1px solid ${C.ink}` },
    gold:    { background: C.goldHi, color: '#09090B', border: `1px solid ${C.goldHi}` },
  };
  const pad = size === 'sm' ? '6px 12px' : '9px 16px';
  const fz = size === 'sm' ? 11 : 12.5;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        ...styles[variant], padding: pad, borderRadius: 9999, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 7,
        fontFamily: 'Inter', fontSize: fz, fontWeight: 500, letterSpacing: '-0.005em',
        transform: hover ? 'translateY(-1px)' : 'translateY(0)',
        boxShadow: hover
          ? (isDark ? '0 6px 14px rgba(0,0,0,0.4)' : '0 6px 14px rgba(0,0,0,0.08)')
          : (isDark ? '0 1px 2px rgba(0,0,0,0.3)' : '0 2px 4px rgba(0,0,0,0.02)'),
        transition: 'all .25s cubic-bezier(.16,1,.3,1)',
      }}
    >
      {icon}{label}
    </button>
  );
};

/** Status badge — small uppercase mono pill */
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const C = useFinancePalette();
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    paid:    { bg: `${C.income}26`,  fg: C.income,  label: 'Paid' },
    partial: { bg: `${C.gold}30`,    fg: C.gold,    label: 'Partial' },
    pending: { bg: `${C.amber}26`,   fg: C.amber,   label: 'Pending' },
    overdue: { bg: `${C.expense}26`, fg: C.expense, label: 'Overdue' },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{
      display: 'inline-flex', padding: '2px 8px', borderRadius: 4,
      background: s.bg, color: s.fg,
      fontFamily: '"JetBrains Mono", monospace', fontSize: 9, fontWeight: 600,
      letterSpacing: '0.1em', textTransform: 'uppercase',
    }}>{s.label}</span>
  );
};

/** Card surface — flips to a dark zinc panel in dark mode so the
 *  white-on-black inversion bug we used to have is gone. */
const Card: React.FC<{ children: React.ReactNode; padding?: number; style?: React.CSSProperties }> = ({ children, padding = 28, style }) => {
  const C = useFinancePalette();
  const isDark = useIsDarkMode();
  return (
    <div style={{
      background: isDark ? C.oat : '#FFFFFF',
      border: `1px solid ${C.bone}`,
      borderRadius: 24, padding,
      boxShadow: isDark
        ? '0 1px 2px rgba(0,0,0,0.4), 0 8px 16px -4px rgba(0,0,0,0.5)'
        : '0 2px 4px rgba(0,0,0,0.02), 0 8px 16px -4px rgba(0,0,0,0.04)',
      ...style,
    }}>{children}</div>
  );
};

/** Empty / loading state */
const StateBlock: React.FC<{ icon: LucideIcon; title: string; subtitle?: string; cta?: React.ReactNode }> = ({ icon: Icon, title, subtitle, cta }) => {
  const C = useFinancePalette();
  const isDark = useIsDarkMode();
  return (
    <div style={{
      background: isDark ? C.oat : '#FFFFFF',
      border: `1px solid ${C.bone}`, borderRadius: 24,
      padding: '48px 32px', textAlign: 'center',
    }}>
      <Icon size={28} color={C.dashed} style={{ marginBottom: 8 }} />
      <p style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 500, color: C.ink, margin: 0 }}>{title}</p>
      {subtitle && <p style={{ fontFamily: 'Inter', fontSize: 12, color: C.meta, margin: '4px 0 0' }}>{subtitle}</p>}
      {cta && <div style={{ marginTop: 16 }}>{cta}</div>}
    </div>
  );
};

const Loading: React.FC<{ label: string }> = ({ label }) => {
  const C = useFinancePalette();
  const isDark = useIsDarkMode();
  return (
    <div style={{
      background: isDark ? C.oat : '#FFFFFF',
      border: `1px solid ${C.bone}`, borderRadius: 24,
      padding: '48px 32px', textAlign: 'center',
    }}>
      <div style={{
        width: 24, height: 24,
        border: `2px solid ${C.bone}`, borderTopColor: C.ink,
        borderRadius: 9999, margin: '0 auto 12px',
        animation: 'livv-spin .9s linear infinite',
      }} />
      <style>{`@keyframes livv-spin { to { transform: rotate(360deg); } }`}</style>
      <Eyebrow>{label}</Eyebrow>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════
//  INCOME TAB
// ══════════════════════════════════════════════════════════════════════

export interface LivvIncomeTabProps {
  incomes: IncomeEntry[];
  filteredIncomes: IncomeEntry[];
  totalPaidIncome: number;
  totalPendingIncome: number;
  totalOverdueIncome: number;
  overdueInstallmentCount: number;
  incomeSearch: string;
  setIncomeSearch: (v: string) => void;
  incomeStatusFilter: 'all' | 'pending' | 'paid' | 'overdue';
  setIncomeStatusFilter: (v: 'all' | 'pending' | 'paid' | 'overdue') => void;
  incomeDateFrom: string;
  setIncomeDateFrom: (v: string) => void;
  incomeDateTo: string;
  setIncomeDateTo: (v: string) => void;
  expandedIncome: string | null;
  setExpandedIncome: (id: string | null) => void;
  incomesLoading: boolean;
  incomesTimedOut: boolean;
  projectTasksCache: Record<string, { id: string; title: string }[]>;
  fetchProjectTasks: (id: string) => void;
  openEditIncome: (inc: IncomeEntry) => void;
  handleDeleteIncome: (id: string) => void;
  handleMarkInstallmentPaid: (inst: Installment) => void;
  updateInstallment: (id: string, updates: any) => Promise<unknown>;
  openIncomeForm: () => void;
  canCreate: boolean;
  /** Optional: open the AI assistant (file upload / Excel import). */
  onOpenAIAssistant?: () => void;
  /** Optional: open the AI chat. The empty state CTA passes a seed phrase. */
  onOpenAIChat?: (seed?: string) => void;
  /** Optional: deep-link to a project page. Surfaces the project as a
   *  clickable chip in each row so the user can jump from "owe me $X"
   *  to "what's the project status / which milestones are pending". */
  onOpenProject?: (projectId: string) => void;
}

export const LivvIncomeTab: React.FC<LivvIncomeTabProps> = ({
  incomes, filteredIncomes,
  totalPaidIncome, totalPendingIncome, totalOverdueIncome, overdueInstallmentCount,
  incomeSearch, setIncomeSearch,
  incomeStatusFilter, setIncomeStatusFilter,
  incomeDateFrom, setIncomeDateFrom, incomeDateTo, setIncomeDateTo,
  expandedIncome, setExpandedIncome,
  incomesLoading, incomesTimedOut,
  projectTasksCache, fetchProjectTasks,
  openEditIncome, handleDeleteIncome, handleMarkInstallmentPaid, updateInstallment,
  openIncomeForm, canCreate,
  onOpenAIAssistant, onOpenAIChat, onOpenProject,
}) => {
  const C = useFinancePalette();
  const isDark = useIsDarkMode();

  // ─── View / period state ──────────────────────────────────
  // The user asked to stop dumping every invoice into a single flat list:
  // "filtralo por mes a mes, y si ya se marcó todo como cobrado, que aparezca
  //  en otra sección como un historial". So:
  //   • viewMode 'active'  — open work + recent partial collections
  //   • viewMode 'history' — fully-paid incomes archive
  //   • period  'this-month' default — only this month's installments
  const [viewMode, setViewMode] = useState<'active' | 'history'>(
    () => (typeof window !== 'undefined' && (localStorage.getItem('livv:income-view') as any)) || 'active'
  );
  const [period, setPeriod] = useState<'this-month' | 'last-month' | 'quarter' | 'all'>(
    () => (typeof window !== 'undefined' && (localStorage.getItem('livv:income-period') as any)) || 'this-month'
  );
  useEffect(() => { try { localStorage.setItem('livv:income-view', viewMode); } catch {} }, [viewMode]);
  useEffect(() => { try { localStorage.setItem('livv:income-period', period); } catch {} }, [period]);

  // Period date bounds
  const periodBounds = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    if (period === 'this-month') {
      return { from: new Date(y, m, 1), to: new Date(y, m + 1, 0) };
    }
    if (period === 'last-month') {
      return { from: new Date(y, m - 1, 1), to: new Date(y, m, 0) };
    }
    if (period === 'quarter') {
      const qStart = Math.floor(m / 3) * 3;
      return { from: new Date(y, qStart, 1), to: new Date(y, qStart + 3, 0) };
    }
    return null; // 'all'
  }, [period]);

  // Apply view + period filters on top of what the parent already filtered.
  // Semantics differ by view because "this month" means different things:
  //   • Active + this-month  = "work I should collect by end of May"
  //                            → any open installment due ON OR BEFORE
  //                              the period's end (includes overdue from
  //                              earlier months — you still owe it).
  //   • History + this-month = "what I actually collected this month"
  //                            → paid_date inside the window.
  //   • Either + all         = no period gate.
  // Earlier behavior was strict-window for both views, which hid every
  // active income whose installments were due next month, leaving the
  // user with "Showing 0 of 4" even though 4 incomes were active.
  const visibleIncomes = useMemo(() => {
    return filteredIncomes.filter((inc: any) => {
      const insts = inc.installments || [];
      const allPaid = insts.length > 0 && insts.every((i: any) => i.status === 'paid');
      // View-mode gate
      if (viewMode === 'active' && allPaid) return false;
      if (viewMode === 'history' && !allPaid) return false;
      // Period gate (ignored when 'all')
      if (!periodBounds) return true;

      if (viewMode === 'active') {
        // Show if any OPEN (not paid) installment is due by end-of-period.
        // This is cumulative — "by end of this month" covers overdue too.
        const hasDueByEnd = insts.some((i: any) => {
          if (i.status === 'paid') return false;
          const dRef = i.due_date;
          if (!dRef) return true; // no due date → keep, can't filter blindly
          const d = new Date(dRef + 'T12:00:00');
          return d <= periodBounds.to;
        });
        // Income with no installments at all: keep it visible so the user
        // can still see and manage it.
        if (insts.length === 0) return true;
        return hasDueByEnd;
      }

      // History view — paid inside the window.
      return insts.some((i: any) => {
        if (i.status !== 'paid') return false;
        const dRef = i.paid_date || i.due_date;
        if (!dRef) return false;
        const d = new Date(dRef + 'T12:00:00');
        return d >= periodBounds.from && d <= periodBounds.to;
      });
    });
  }, [filteredIncomes, viewMode, periodBounds]);

  // Counts for the segmented control labels
  const counts = useMemo(() => {
    let active = 0, history = 0;
    filteredIncomes.forEach((inc: any) => {
      const insts = inc.installments || [];
      const allPaid = insts.length > 0 && insts.every((i: any) => i.status === 'paid');
      if (allPaid) history++; else active++;
    });
    return { active, history };
  }, [filteredIncomes]);

  const filterCounts = {
    all: incomes.length,
    pending: incomes.filter(i => i.status === 'pending' || i.status === 'partial').length,
    paid: incomes.filter(i => i.status === 'paid').length,
    overdue: incomes.filter(i => i.status === 'overdue').length,
  };

  return (
    <div style={{
      background: C.cream, color: C.ink, fontFamily: 'Inter',
      borderRadius: 24, border: `1px solid ${C.bone}`,
      padding: '36px 32px 40px',
      boxShadow: isDark
        ? '0 1px 2px rgba(0,0,0,0.4), 0 8px 16px -4px rgba(0,0,0,0.5)'
        : '0 2px 4px rgba(0,0,0,0.02), 0 8px 16px -4px rgba(0,0,0,0.04)',
    }}>
      <Hero
        eyebrow="© Income & Receivables"
        title="What's coming in."
        subtitle="See every invoice, milestone, and installment you're owed — and mark them as collected with one click."
        trailing={canCreate && (
          <ActionButton icon={<Plus size={13} />} label="New income" variant="primary" onClick={openIncomeForm} />
        )}
      />

      <MetricStrip items={[
        { label: '© Collected', value: fmt(totalPaidIncome), color: C.income, hint: 'YTD · received' },
        { label: '© Outstanding', value: fmt(totalPendingIncome), color: C.ink, hint: 'Pending across installments' },
        { label: '© Overdue', value: fmt(totalOverdueIncome), color: totalOverdueIncome > 0 ? C.expense : C.ink, hint: overdueInstallmentCount > 0 ? `${overdueInstallmentCount} late installment${overdueInstallmentCount > 1 ? 's' : ''}` : 'On track' },
      ]} />

      {/* View toggle + period selector — high-level slice of the data.
          The user explicitly asked for "filtralo por mes a mes" + "los
          ya cobrados que pasen a un historial". This row is the answer:
          decide what bucket of work (active vs history) AND what time
          window (this month is the default — 99% of daily check-ins). */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        {/* Active / History segmented control */}
        <div style={{
          display: 'inline-flex', padding: 3, borderRadius: 9999,
          background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(90,62,62,0.06)',
        }}>
          {([
            { id: 'active' as const,  label: 'Active',  count: counts.active },
            { id: 'history' as const, label: 'History', count: counts.history },
          ]).map(opt => (
            <button
              key={opt.id}
              onClick={() => setViewMode(opt.id)}
              style={{
                padding: '6px 14px', borderRadius: 9999, border: 'none', cursor: 'pointer',
                background: viewMode === opt.id ? C.ink : 'transparent',
                color: viewMode === opt.id ? C.cream : C.meta,
                fontFamily: 'Inter', fontSize: 11, fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: 6,
                transition: 'all .25s cubic-bezier(.16,1,.3,1)',
              }}
            >
              {opt.label}
              <span style={{
                fontSize: 9, opacity: 0.7, fontFamily: '"JetBrains Mono", monospace',
              }}>{opt.count}</span>
            </button>
          ))}
        </div>

        {/* Period selector */}
        <select
          value={period}
          onChange={e => setPeriod(e.target.value as any)}
          style={{
            padding: '7px 14px', borderRadius: 9999, border: `1px solid ${C.bone}`,
            background: isDark ? C.oat : '#FFFFFF', fontFamily: 'Inter', fontSize: 11, color: C.body,
            outline: 'none', cursor: 'pointer',
          }}
        >
          <option value="this-month">This month</option>
          <option value="last-month">Last month</option>
          <option value="quarter">This quarter</option>
          <option value="all">All time</option>
        </select>

        <span style={{ fontSize: 10, color: C.meta, marginLeft: 'auto' }}>
          Showing {visibleIncomes.length} of {filteredIncomes.length}
        </span>
      </div>

      {/* Filter row (status + search + date) */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
        <FilterPill active={incomeStatusFilter === 'all'} onClick={() => setIncomeStatusFilter('all')} count={filterCounts.all}>All</FilterPill>
        <FilterPill active={incomeStatusFilter === 'pending'} onClick={() => setIncomeStatusFilter('pending')} count={filterCounts.pending}>To collect</FilterPill>
        <FilterPill active={incomeStatusFilter === 'paid'} onClick={() => setIncomeStatusFilter('paid')} count={filterCounts.paid}>Collected</FilterPill>
        <FilterPill active={incomeStatusFilter === 'overdue'} onClick={() => setIncomeStatusFilter('overdue')} count={filterCounts.overdue}>Overdue</FilterPill>
        <Dashed vertical style={{ height: 24, margin: '0 4px' }} />
        <SearchPill value={incomeSearch} onChange={setIncomeSearch} placeholder="Client, project, or concept…" width={260} />
        <input type="date" value={incomeDateFrom} onChange={e => setIncomeDateFrom(e.target.value)}
          style={{
            padding: '7px 12px', borderRadius: 9999, border: `1px solid ${C.bone}`,
            background: isDark ? C.oat : '#FFFFFF', fontFamily: 'Inter', fontSize: 11, color: C.body,
            outline: 'none', cursor: 'pointer',
          }} />
        <span style={{ fontSize: 10, color: C.meta }}>→</span>
        <input type="date" value={incomeDateTo} onChange={e => setIncomeDateTo(e.target.value)}
          style={{
            padding: '7px 12px', borderRadius: 9999, border: `1px solid ${C.bone}`,
            background: isDark ? C.oat : '#FFFFFF', fontFamily: 'Inter', fontSize: 11, color: C.body,
            outline: 'none', cursor: 'pointer',
          }} />
        {(incomeDateFrom || incomeDateTo) && (
          <button onClick={() => { setIncomeDateFrom(''); setIncomeDateTo(''); }}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontFamily: 'Inter', fontSize: 11, color: C.meta,
            }}>Clear</button>
        )}
      </div>

      {/* List */}
      {incomesLoading && !incomesTimedOut ? (
        <Loading label="Loading income…" />
      ) : visibleIncomes.length === 0 ? (
        <StateBlock
          icon={ArrowDownLeft}
          title={
            incomeSearch
              ? 'No matches.'
              : viewMode === 'history'
                ? (period !== 'all' ? 'Nothing collected in this period.' : 'No invoices have been fully collected yet.')
                : (filteredIncomes.length === 0
                    ? 'No income recorded yet.'
                    : (period !== 'all'
                        ? 'Nothing due by the end of this period — switch to All time to see everything open.'
                        : 'Nothing open right now.'))
          }
          subtitle={
            incomeSearch
              ? 'Try clearing filters.'
              : 'Add your first invoice manually, ask the AI to log it for you, or drop a CSV to bulk-import.'
          }
          cta={!incomeSearch && canCreate && (
            <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              <ActionButton icon={<Plus size={13} />} label="Add first invoice" variant="primary" onClick={openIncomeForm} />
              {onOpenAIChat && (
                <ActionButton
                  icon={<Sparkles size={13} />}
                  label="Add with AI"
                  variant="gold"
                  onClick={() => onOpenAIChat('Create a $5,000 invoice for Acme due in 15 days')}
                />
              )}
              {onOpenAIAssistant && (
                <ActionButton icon={<Upload size={13} />} label="Import CSV / Excel" variant="ghost" onClick={onOpenAIAssistant} />
              )}
            </div>
          )}
        />
      ) : (
        <Card padding={0}>
          {visibleIncomes.map((inc, idx) => {
            const paid = (inc.installments || []).filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
            const totalCount = (inc.installments || []).length;
            const paidCount = (inc.installments || []).filter(i => i.status === 'paid').length;
            const isExpanded = expandedIncome === inc.id;
            // Next pending installment — used for the inline "Mark as paid"
            // shortcut so the user can settle the most-due item without
            // expanding the row.
            const nextPending = (inc.installments || [])
              .filter(i => i.status !== 'paid')
              .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))[0];
            return (
              <div key={inc.id} style={{ borderBottom: idx < visibleIncomes.length - 1 ? `1px dashed ${C.dashedSoft}` : 'none' }}>
                <div
                  onClick={() => { setExpandedIncome(isExpanded ? null : inc.id); if (!isExpanded && inc.project_id) fetchProjectTasks(inc.project_id); }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1.5fr) auto auto auto auto',
                    gap: 16, padding: '18px 24px', alignItems: 'center', cursor: 'pointer',
                    transition: 'background .15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.oat)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  className="livv-row"
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontFamily: 'Inter', fontSize: 14, fontWeight: 500, color: C.ink,
                      letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{inc.client_name || 'No client'}</div>
                    <div style={{ fontFamily: 'Inter', fontSize: 11, color: C.meta, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {inc.project_id && onOpenProject ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); onOpenProject(inc.project_id!); }}
                          style={{
                            background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
                            color: C.gold, textDecoration: 'underline',
                            textDecorationThickness: '1px', textUnderlineOffset: '2px',
                            fontFamily: 'Inter', fontSize: 11, fontWeight: 500,
                          }}
                          title={`Open project · ${inc.project_name || 'project'}`}
                        >
                          {inc.project_name || 'Project'}
                        </button>
                      ) : (
                        <span>{inc.project_name || '—'}</span>
                      )}
                      <span>· {inc.concept || '—'}</span>
                    </div>
                  </div>
                  <div style={{
                    fontFamily: 'Inter', fontSize: 12, color: C.meta,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    Due {fmtDate(inc.due_date)}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontFamily: 'Inter', fontSize: 14, fontWeight: 500, color: C.ink,
                      fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em',
                    }}>{fmt(inc.total_amount)}</div>
                    <div style={{
                      fontFamily: '"JetBrains Mono", monospace', fontSize: 9,
                      color: C.income, marginTop: 2, letterSpacing: '0.06em',
                    }}>{fmt(paid)} COLLECTED</div>
                  </div>
                  <div style={{
                    fontFamily: '"JetBrains Mono", monospace', fontSize: 11,
                    color: C.meta, letterSpacing: '0.04em', minWidth: 36, textAlign: 'center',
                  }}>{paidCount}/{totalCount}</div>
                  <StatusBadge status={inc.status} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {/* Inline "Mark as paid" — settles the next pending
                        installment and stamps paid_date = today via the
                        parent handler. Visible on hover so the row stays
                        clean. The user said: "que sea bien fácil
                        marcar como pagado y que nos quede documentado
                        la fecha cuando se cobró". */}
                    {nextPending && (
                      <button
                        className="livv-row-action"
                        onClick={(e) => { e.stopPropagation(); handleMarkInstallmentPaid(nextPending); }}
                        title={`Mark installment ${nextPending.number} as paid (${fmt(nextPending.amount)} · ${fmtDate(nextPending.due_date)})`}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          background: C.income + '18', border: `1px solid ${C.income}40`,
                          color: C.income, fontFamily: 'Inter', fontSize: 10, fontWeight: 600,
                          padding: '4px 8px', borderRadius: 9999, cursor: 'pointer', opacity: 0,
                          transition: 'opacity .15s, transform .15s',
                        }}
                      >
                        <Check size={11} strokeWidth={2.5} />
                        Mark paid
                      </button>
                    )}
                    <button
                      className="livv-row-action"
                      onClick={(e) => { e.stopPropagation(); openEditIncome(inc); }}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        padding: 6, borderRadius: 6, color: C.meta, opacity: 0,
                      }}
                      title="Edit"
                    ><Pencil size={13} /></button>
                    <button
                      className="livv-row-action"
                      onClick={(e) => { e.stopPropagation(); handleDeleteIncome(inc.id); }}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        padding: 6, borderRadius: 6, color: C.expense, opacity: 0,
                      }}
                      title="Delete"
                    ><Trash2 size={13} /></button>
                    <ChevronDown
                      size={14}
                      color={C.meta}
                      style={{
                        transition: 'transform .2s',
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
                      }}
                    />
                  </div>
                </div>

                {isExpanded && (
                  <div style={{
                    background: C.oat, padding: '14px 24px 20px',
                    borderTop: `1px dashed ${C.dashedSoft}`,
                  }}>
                    <Eyebrow>Installments · {totalCount}</Eyebrow>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                      {(inc.installments || []).map(inst => {
                        const Icon =
                          inst.status === 'paid' ? Check :
                          inst.status === 'overdue' ? AlertTriangle : Clock;
                        const iconColor =
                          inst.status === 'paid' ? C.income :
                          inst.status === 'overdue' ? C.expense : C.amber;
                        return (
                          <div key={inst.id} style={{
                            display: 'grid',
                            gridTemplateColumns: 'auto 60px 110px 1fr auto auto',
                            gap: 14, padding: '10px 14px', alignItems: 'center',
                            background: isDark ? C.oat : '#FFFFFF', borderRadius: 12,
                            border: `1px solid ${C.bone}`,
                          }}>
                            <Icon size={14} color={iconColor} />
                            <span style={{ fontFamily: 'Inter', fontSize: 11, color: C.meta }}>Inst. {inst.number}</span>
                            <span style={{
                              fontFamily: 'Inter', fontSize: 13, fontWeight: 500, color: C.ink,
                              fontVariantNumeric: 'tabular-nums',
                            }}>{fmt(inst.amount)}</span>
                            <span style={{ fontFamily: 'Inter', fontSize: 11, color: C.meta }}>
                              Due {fmtDate(inst.due_date)}
                              {inst.paid_date && <span style={{ color: C.income, marginLeft: 8 }}>· Paid {fmtDate(inst.paid_date)}</span>}
                            </span>
                            {inc.project_id && (
                              <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Link2 size={11} color={C.meta} />
                                <select
                                  value={inst.linked_task_id || ''}
                                  onChange={async (e) => {
                                    await updateInstallment(inst.id, { linked_task_id: e.target.value || null } as any);
                                  }}
                                  style={{
                                    fontFamily: 'Inter', fontSize: 10, color: C.meta,
                                    background: 'transparent',
                                    border: `1px solid ${C.bone}`, borderRadius: 6,
                                    padding: '2px 6px', maxWidth: 140, outline: 'none', cursor: 'pointer',
                                  }}
                                >
                                  <option value="">No delivery link</option>
                                  {(projectTasksCache[inc.project_id] || []).map(t => (
                                    <option key={t.id} value={t.id}>{t.title}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                            {inst.status !== 'paid' ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleMarkInstallmentPaid(inst); }}
                                style={{
                                  background: 'rgba(118,146,104,0.12)', color: C.income,
                                  border: 'none', padding: '4px 10px', borderRadius: 9999,
                                  fontFamily: 'Inter', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                                  letterSpacing: '0.02em',
                                }}
                              >Mark received</button>
                            ) : <StatusBadge status="paid" />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <style>{`.livv-row:hover .livv-row-action { opacity: 0.6 !important; } .livv-row .livv-row-action:hover { opacity: 1 !important; background: rgba(0,0,0,0.05) !important; }`}</style>
        </Card>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════
//  EXPENSE TAB
// ══════════════════════════════════════════════════════════════════════

export interface LivvExpenseTabProps {
  expenses: ExpenseEntry[];
  filteredExpenses: ExpenseEntry[];
  expenseSearch: string;
  setExpenseSearch: (v: string) => void;
  expenseCategoryFilter: string;
  setExpenseCategoryFilter: (v: string) => void;
  expenseViewMonth: { year: number; month: number };
  setExpenseViewMonth: (v: { year: number; month: number }) => void;
  setExpenseDateFrom: (v: string) => void;
  setExpenseDateTo: (v: string) => void;
  expenseCustomDateRange: boolean;
  setExpenseCustomDateRange: (v: boolean) => void;
  expensesLoading: boolean;
  expensesTimedOut: boolean;
  expenseCategories: Record<string, { icon: any; color: string }>;
  monthNames: string[];
  getMonthBounds: (year: number, month: number) => { from: string; to: string };
  openExpenseForm: () => void;
  openEditExpense: (exp: ExpenseEntry) => void;
  handleDeleteExpense: (id: string) => void;
  canCreate: boolean;
  /** Optional: open the AI assistant (file upload / Excel import). */
  onOpenAIAssistant?: () => void;
  /** Optional: open the AI chat with a seed phrase. */
  onOpenAIChat?: (seed?: string) => void;
}

export const LivvExpenseTab: React.FC<LivvExpenseTabProps> = ({
  filteredExpenses, expenseSearch, setExpenseSearch,
  expenseCategoryFilter, setExpenseCategoryFilter,
  expenseViewMonth, setExpenseViewMonth, setExpenseDateFrom, setExpenseDateTo,
  expenseCustomDateRange, setExpenseCustomDateRange,
  expensesLoading, expensesTimedOut, expenseCategories, monthNames, getMonthBounds,
  openExpenseForm, openEditExpense, handleDeleteExpense, canCreate,
  onOpenAIAssistant, onOpenAIChat,
}) => {
  const C = useFinancePalette();
  const isDark = useIsDarkMode();
  const filtPaid = filteredExpenses.filter(e => e.status === 'paid').reduce((s, e) => s + e.amount, 0);
  const filtPending = filteredExpenses.filter(e => e.status === 'pending').reduce((s, e) => s + e.amount, 0);
  const filtRecurring = filteredExpenses.filter(e => e.recurring).reduce((s, e) => s + e.amount, 0);
  const monthLabel = !expenseCustomDateRange
    ? `${monthNames[expenseViewMonth.month].slice(0, 3)} ${expenseViewMonth.year}`
    : 'Filtered';

  return (
    <div style={{
      background: C.cream, color: C.ink, fontFamily: 'Inter',
      borderRadius: 24, border: `1px solid ${C.bone}`,
      padding: '36px 32px 40px',
      boxShadow: isDark
        ? '0 1px 2px rgba(0,0,0,0.4), 0 8px 16px -4px rgba(0,0,0,0.5)'
        : '0 2px 4px rgba(0,0,0,0.02), 0 8px 16px -4px rgba(0,0,0,0.04)',
    }}>
      <Hero
        eyebrow="© Expenses & Bills"
        title="What's going out."
        subtitle="Every paid bill, recurring charge, and pending invoice in one place."
        trailing={canCreate && (
          <ActionButton icon={<Plus size={13} />} label="New expense" variant="primary" onClick={openExpenseForm} />
        )}
      />

      <MetricStrip items={[
        { label: `© Total · ${monthLabel}`, value: fmt(filtPaid + filtPending), color: C.ink, hint: 'In selected window' },
        { label: '© Paid', value: fmt(filtPaid), color: C.income },
        { label: '© Pending', value: fmt(filtPending), color: filtPending > 0 ? C.amber : C.ink, hint: filtRecurring > 0 ? `Recurring: ${fmt(filtRecurring)}/mo` : undefined },
      ]} />

      {/* Filter row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <SearchPill value={expenseSearch} onChange={setExpenseSearch} placeholder="Search expenses…" width={260} />
        <Dashed vertical style={{ height: 24, margin: '0 4px' }} />
        {!expenseCustomDateRange ? (
          <>
            <button onClick={() => {
              const prev = new Date(expenseViewMonth.year, expenseViewMonth.month - 1, 1);
              const m = { year: prev.getFullYear(), month: prev.getMonth() };
              setExpenseViewMonth(m);
              const b = getMonthBounds(m.year, m.month);
              setExpenseDateFrom(b.from); setExpenseDateTo(b.to);
            }} style={{
              padding: 7, borderRadius: 9999, background: isDark ? C.oat : '#FFFFFF',
              border: `1px solid ${C.bone}`, cursor: 'pointer', display: 'flex',
            }}><ChevronLeft size={13} color={C.meta} /></button>
            <span style={{
              padding: '7px 14px', background: isDark ? C.oat : '#FFFFFF', borderRadius: 9999,
              border: `1px solid ${C.bone}`, fontFamily: 'Inter', fontSize: 12,
              fontWeight: 500, color: C.ink, minWidth: 130, textAlign: 'center',
            }}>{monthNames[expenseViewMonth.month]} {expenseViewMonth.year}</span>
            <button onClick={() => {
              const next = new Date(expenseViewMonth.year, expenseViewMonth.month + 1, 1);
              const m = { year: next.getFullYear(), month: next.getMonth() };
              setExpenseViewMonth(m);
              const b = getMonthBounds(m.year, m.month);
              setExpenseDateFrom(b.from); setExpenseDateTo(b.to);
            }} style={{
              padding: 7, borderRadius: 9999, background: isDark ? C.oat : '#FFFFFF',
              border: `1px solid ${C.bone}`, cursor: 'pointer', display: 'flex',
            }}><ChevronRight size={13} color={C.meta} /></button>
            <button onClick={() => setExpenseCustomDateRange(true)} style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontFamily: 'Inter', fontSize: 11, color: C.meta,
            }}>Custom range</button>
          </>
        ) : (
          <>
            <button onClick={() => {
              setExpenseCustomDateRange(false);
              const today = new Date();
              const m = { year: today.getFullYear(), month: today.getMonth() };
              setExpenseViewMonth(m);
              const b = getMonthBounds(m.year, m.month);
              setExpenseDateFrom(b.from); setExpenseDateTo(b.to);
            }} style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontFamily: 'Inter', fontSize: 11, color: C.meta,
            }}>← Back to month view</button>
          </>
        )}
      </div>

      {/* Category pills */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24, overflowX: 'auto' }}>
        <FilterPill active={expenseCategoryFilter === 'all'} onClick={() => setExpenseCategoryFilter('all')}>All</FilterPill>
        {Object.keys(expenseCategories).map(cat => (
          <FilterPill key={cat} active={expenseCategoryFilter === cat} onClick={() => setExpenseCategoryFilter(cat)}>
            {cat}
          </FilterPill>
        ))}
      </div>

      {/* List */}
      {expensesLoading && !expensesTimedOut ? (
        <Loading label="Loading expenses…" />
      ) : filteredExpenses.length === 0 ? (
        <StateBlock
          icon={Receipt}
          title={expenseSearch || expenseCategoryFilter !== 'all' ? 'No matches.' : 'No expenses yet.'}
          subtitle={
            expenseSearch || expenseCategoryFilter !== 'all'
              ? 'Try clearing filters.'
              : 'Add your first expense manually, ask the AI to log it for you, or upload a receipt to extract amounts automatically.'
          }
          cta={!expenseSearch && expenseCategoryFilter === 'all' && canCreate && (
            <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              <ActionButton icon={<Plus size={13} />} label="Add expense" variant="primary" onClick={openExpenseForm} />
              {onOpenAIChat && (
                <ActionButton
                  icon={<Sparkles size={13} />}
                  label="Add with AI"
                  variant="gold"
                  onClick={() => onOpenAIChat('Log a $120 Software expense for Figma')}
                />
              )}
              {onOpenAIAssistant && (
                <ActionButton icon={<Upload size={13} />} label="Upload receipt" variant="ghost" onClick={onOpenAIAssistant} />
              )}
            </div>
          )}
        />
      ) : (
        <Card padding={0}>
          {filteredExpenses.map((exp, idx) => {
            const catInfo = expenseCategories[exp.category];
            const CatIcon = catInfo?.icon;
            const isProjected = exp.id.startsWith('proj-');
            return (
              <div key={exp.id} style={{ borderBottom: idx < filteredExpenses.length - 1 ? `1px dashed ${C.dashedSoft}` : 'none' }}>
                <div
                  className="livv-row"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 2fr) auto minmax(0, 1fr) auto auto auto',
                    gap: 16, padding: '16px 24px', alignItems: 'center',
                    transition: 'background .15s',
                    opacity: isProjected ? 0.65 : 1,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.oat)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontFamily: 'Inter', fontSize: 14, fontWeight: 500, color: C.ink,
                      letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      fontStyle: isProjected ? 'italic' : 'normal',
                    }}>{exp.concept}</div>
                    <div style={{ fontFamily: 'Inter', fontSize: 11, color: C.meta, marginTop: 2 }}>
                      {exp.vendor || '—'}
                      {exp.recurring && <span style={{ marginLeft: 8, color: C.income, fontWeight: 600 }}>· REC</span>}
                      {exp.recurring_source_id && !isProjected && <span style={{ marginLeft: 8, color: C.gold, fontWeight: 600 }}>· AUTO</span>}
                      {isProjected && <span style={{ marginLeft: 8, color: C.meta, fontWeight: 600 }}>· PROJECTED</span>}
                    </div>
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {CatIcon && <CatIcon size={12} color={C.meta} />}
                    <span style={{ fontFamily: 'Inter', fontSize: 11, color: C.body }}>{exp.category}</span>
                  </div>
                  <div style={{
                    fontFamily: 'Inter', fontSize: 11, color: C.meta,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{exp.project_name || '—'}</div>
                  <div style={{
                    fontFamily: 'Inter', fontSize: 14, fontWeight: 500, color: C.ink,
                    fontVariantNumeric: 'tabular-nums', textAlign: 'right',
                  }}>{fmtSigned(-exp.amount)}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      fontFamily: '"JetBrains Mono", monospace', fontSize: 10,
                      color: C.meta, letterSpacing: '0.06em', textTransform: 'uppercase',
                    }}>{fmtDate(exp.date)}</span>
                    <StatusBadge status={exp.status} />
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      className="livv-row-action"
                      onClick={() => openEditExpense(exp)}
                      title={isProjected ? 'Materialize and edit this month' : 'Edit'}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        padding: 6, borderRadius: 6, color: C.meta, opacity: 0,
                      }}
                    ><Pencil size={13} /></button>
                    {!isProjected && (
                      <button
                        className="livv-row-action"
                        onClick={() => handleDeleteExpense(exp.id)}
                        style={{
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          padding: 6, borderRadius: 6, color: C.expense, opacity: 0,
                        }}
                      ><Trash2 size={13} /></button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════
//  BUDGETS TAB
// ══════════════════════════════════════════════════════════════════════

export interface LivvBudgetsTabProps {
  budgets: Budget[];
  filteredBudgets: Budget[];
  budgetsLoading: boolean;
  totalAllocated: number;
  totalBudgetSpent: number;
  budgetSearch: string;
  setBudgetSearch: (v: string) => void;
  budgetCategoryFilter: string;
  setBudgetCategoryFilter: (v: string) => void;
  budgetCategories: string[];
  expandedBudgetId: string | null;
  setExpandedBudgetId: (id: string | null) => void;
  budgetSpending: Record<string, { spent: number; count: number }>;
  expenses: ExpenseEntry[];
  openBudgetForm: () => void;
  openEditBudget: (b: Budget) => void;
  handleDeleteBudget: (id: string) => void;
  canCreate: boolean;
  /** Optional: open the AI chat with a seed phrase for budget creation. */
  onOpenAIChat?: (seed?: string) => void;
}

export const LivvBudgetsTab: React.FC<LivvBudgetsTabProps> = ({
  budgets, filteredBudgets, budgetsLoading,
  totalAllocated, totalBudgetSpent,
  budgetSearch, setBudgetSearch,
  budgetCategoryFilter, setBudgetCategoryFilter, budgetCategories,
  expandedBudgetId, setExpandedBudgetId,
  budgetSpending, expenses,
  openBudgetForm, openEditBudget, handleDeleteBudget,
  canCreate,
  onOpenAIChat,
}) => {
  const C = useFinancePalette();
  const isDark = useIsDarkMode();
  const remaining = totalAllocated - totalBudgetSpent;
  return (
    <div style={{
      background: C.cream, color: C.ink, fontFamily: 'Inter',
      borderRadius: 24, border: `1px solid ${C.bone}`,
      padding: '36px 32px 40px',
      boxShadow: isDark
        ? '0 1px 2px rgba(0,0,0,0.4), 0 8px 16px -4px rgba(0,0,0,0.5)'
        : '0 2px 4px rgba(0,0,0,0.02), 0 8px 16px -4px rgba(0,0,0,0.04)',
    }}>
      <Hero
        eyebrow="© Budgets & Caps"
        title="Where you're spending."
        subtitle="Set monthly or quarterly caps per category and watch each one fill up. Get warned before you hit the limit."
        trailing={canCreate && (
          <ActionButton icon={<Plus size={13} />} label="New budget" variant="primary" onClick={openBudgetForm} />
        )}
      />

      <MetricStrip items={[
        { label: '© Allocated', value: fmt(totalAllocated), color: C.ink, hint: 'Across active budgets' },
        { label: '© Spent', value: fmt(totalBudgetSpent), color: C.expense },
        { label: '© Remaining', value: fmt(remaining), color: remaining >= 0 ? C.income : C.expense, hint: remaining < 0 ? 'Over budget' : 'Healthy' },
      ]} />

      {/* Filter row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
        <SearchPill value={budgetSearch} onChange={setBudgetSearch} placeholder="Search budgets…" width={240} />
        <Dashed vertical style={{ height: 24, margin: '0 4px' }} />
        <FilterPill active={budgetCategoryFilter === 'all'} onClick={() => setBudgetCategoryFilter('all')}>All</FilterPill>
        {budgetCategories.map(cat => (
          <FilterPill key={cat} active={budgetCategoryFilter === cat} onClick={() => setBudgetCategoryFilter(cat)}>
            {cat}
          </FilterPill>
        ))}
      </div>

      {/* Budget cards */}
      {budgetsLoading ? (
        <Loading label="Loading budgets…" />
      ) : filteredBudgets.length === 0 ? (
        <StateBlock
          icon={Wallet}
          title={budgets.length === 0 ? 'No budgets yet.' : 'No budgets match this filter.'}
          subtitle={
            budgets.length === 0
              ? 'Set caps per category and we\'ll warn you before you hit the limit. Start with the categories you spend most on.'
              : 'Try clearing the filter or pick another category.'
          }
          cta={budgets.length === 0 && canCreate && (
            <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              <ActionButton icon={<Plus size={13} />} label="Create first budget" variant="primary" onClick={openBudgetForm} />
              {onOpenAIChat && (
                <ActionButton
                  icon={<Sparkles size={13} />}
                  label="Suggest budgets"
                  variant="gold"
                  onClick={() => onOpenAIChat('Suggest reasonable budgets based on my last 3 months of expenses')}
                />
              )}
            </div>
          )}
        />
      ) : (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16,
        }}>
          {filteredBudgets.map(budget => {
            const spending = budgetSpending[budget.id] || { spent: 0, count: 0 };
            const pct = budget.allocated_amount > 0 ? (spending.spent / budget.allocated_amount) * 100 : 0;
            const left = budget.allocated_amount - spending.spent;
            const barColor = pct >= 90 ? C.expense : pct >= 70 ? C.amber : C.income;
            const isExpanded = expandedBudgetId === budget.id;
            const linkedExpenses = isExpanded ? expenses.filter(e => e.budget_id === budget.id) : [];
            return (
              <div key={budget.id} className="livv-card-hover" style={{
                background: isDark ? C.oat : '#FFFFFF', border: `1px solid ${C.bone}`, borderRadius: 18,
                overflow: 'hidden', position: 'relative',
                transition: 'all .25s cubic-bezier(.16,1,.3,1)',
                boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
              }}>
                <div style={{ height: 3, background: budget.color || C.gold }} />
                <div style={{ padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{
                        fontFamily: 'Inter', fontSize: 15, fontWeight: 500, color: C.ink,
                        letterSpacing: '-0.01em',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{budget.name}</div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
                        {budget.category && <Eyebrow>{budget.category}</Eyebrow>}
                        <span style={{
                          fontFamily: 'Inter', fontSize: 10, color: C.meta,
                          textTransform: 'capitalize',
                        }}>· {budget.period}</span>
                      </div>
                    </div>
                    {canCreate && (
                      <div className="livv-card-actions" style={{ display: 'flex', gap: 4, opacity: 0, transition: 'opacity .2s' }}>
                        <button onClick={() => openEditBudget(budget)} style={{
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          padding: 6, borderRadius: 6, color: C.meta,
                        }}><Pencil size={12} /></button>
                        <button onClick={() => handleDeleteBudget(budget.id)} style={{
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          padding: 6, borderRadius: 6, color: C.expense,
                        }}><Trash2 size={12} /></button>
                      </div>
                    )}
                  </div>

                  {budget.description && (
                    <p style={{
                      fontFamily: 'Inter', fontSize: 11, color: C.meta, marginTop: 0, marginBottom: 12,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}>{budget.description}</p>
                  )}

                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{
                      fontFamily: 'Inter', fontWeight: 300, fontSize: 28,
                      letterSpacing: '-0.04em', color: C.ink,
                      fontVariantNumeric: 'tabular-nums', lineHeight: 1,
                    }}>{fmt(budget.allocated_amount)}</span>
                    <span style={{
                      fontFamily: 'Inter', fontSize: 12, fontWeight: 500,
                      color: left >= 0 ? C.income : C.expense,
                    }}>{fmt(left)} left</span>
                  </div>

                  <div style={{
                    height: 6, background: 'rgba(90,62,62,0.08)', borderRadius: 999,
                    overflow: 'hidden', marginBottom: 6,
                  }}>
                    <div style={{
                      width: `${Math.min(pct, 100)}%`, height: '100%', background: barColor,
                      transition: 'width .4s cubic-bezier(.16,1,.3,1)',
                    }} />
                  </div>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    fontFamily: '"JetBrains Mono", monospace', fontSize: 10,
                    letterSpacing: '0.06em', color: C.meta, textTransform: 'uppercase',
                  }}>
                    <span>{fmt(spending.spent)} spent</span>
                    <span>{pct.toFixed(0)}%</span>
                  </div>

                  <button
                    onClick={() => setExpandedBudgetId(isExpanded ? null : budget.id)}
                    style={{
                      marginTop: 12, background: 'transparent', border: 'none', cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      fontFamily: 'Inter', fontSize: 11, color: C.meta,
                      padding: 0,
                    }}
                  >
                    <Receipt size={11} />
                    {spending.count} expense{spending.count !== 1 ? 's' : ''}
                    <ChevronDown size={10} style={{
                      transition: 'transform .2s',
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
                    }} />
                  </button>

                  {isExpanded && linkedExpenses.length > 0 && (
                    <div style={{
                      marginTop: 12, paddingTop: 12,
                      borderTop: `1px dashed ${C.dashedSoft}`,
                      display: 'flex', flexDirection: 'column', gap: 6,
                    }}>
                      {linkedExpenses.slice(0, 8).map(exp => (
                        <div key={exp.id} style={{
                          display: 'flex', justifyContent: 'space-between',
                          fontFamily: 'Inter', fontSize: 11,
                        }}>
                          <span style={{
                            color: C.body, whiteSpace: 'nowrap', overflow: 'hidden',
                            textOverflow: 'ellipsis', flex: 1, marginRight: 8,
                          }}>{exp.concept}</span>
                          <span style={{
                            fontWeight: 500, color: C.ink,
                            fontVariantNumeric: 'tabular-nums',
                          }}>{fmt(exp.amount)}</span>
                        </div>
                      ))}
                      {linkedExpenses.length > 8 && (
                        <span style={{ fontFamily: 'Inter', fontSize: 10, color: C.meta, fontStyle: 'italic' }}>
                          +{linkedExpenses.length - 8} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <style>{`.livv-card-hover:hover .livv-card-actions { opacity: 1 !important; }`}</style>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
