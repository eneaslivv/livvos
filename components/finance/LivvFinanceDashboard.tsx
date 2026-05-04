/**
 * LivvFinanceDashboard — Editorial overview for the Finance module.
 *
 * Adapted from the Livv "Direction A · Editorial Cinematic" mock
 * (claude.ai/design handoff, May 2026). Cream canvas, dashed dividers,
 * gold accent, sage/wine for income/expense. Reuses every existing data
 * source and handler from pages/Finance.tsx — no new business logic.
 *
 * Sub-tabs (Overview · Activity · Projects) live INSIDE this dashboard
 * tab; they don't replace the page-level Finance tabs (Income / Expenses
 * / Budgets / etc) which keep working as before.
 */

import React, { useState, useMemo, useRef } from 'react';
import {
  Sparkles, ArrowDownLeft, ArrowUpRight, Split, Download, Plus,
  CornerDownLeft, Mic, Paperclip, Check, ArrowUpRight as TrendUp, Flame,
} from 'lucide-react';
import type {
  IncomeEntry, Installment, ExpenseEntry, Budget,
} from '../../context/FinanceContext';

// ──────────────────────────────────────────────────────────────────────
//  Types from the parent page
// ──────────────────────────────────────────────────────────────────────

export interface LiquidityPoint {
  month: string;
  ingresos: number;
  gastos: number;
  balance: number;
}

interface ProjectPnLEntry {
  name: string;
  income: number;
  expenses: number;
  profit: number;
  margin: number;
  health: 'profitable' | 'break-even' | 'loss';
}

export interface LivvFinanceDashboardProps {
  // Data
  incomes: IncomeEntry[];
  expenses: ExpenseEntry[];
  budgets: Budget[];
  liquidityData: LiquidityPoint[];
  projectPnL: ProjectPnLEntry[];

  // Aggregates
  currentBalance: number;
  projection90d: number;
  margin: number;
  totalPaidIncome: number;
  totalExpensesPaid: number;
  totalExpensesPending: number;

  // Handlers (provided by Finance page)
  onAddIncome: () => void;
  onAddExpense: () => void;
  onOpenAIAssistant: () => void;
  onOpenAIChat: () => void;
  onMarkInstallmentPaid: (inst: Installment) => Promise<void> | void;
  onMarkExpensePaid?: (exp: ExpenseEntry) => Promise<void> | void;
  onJumpToTab: (tab: 'ingresos' | 'gastos' | 'proyectos' | 'budgets') => void;

  // Permissions
  canCreate: boolean;
}

// ──────────────────────────────────────────────────────────────────────
//  Palette (matches livv design system colors_and_type.css)
// ──────────────────────────────────────────────────────────────────────

const C = {
  cream:    '#FDFBF7',
  oat:      '#F5F2EB',
  bone:     '#E6E2D8',
  sand:     '#D6D1C7',
  ink:      '#09090B',
  body:     'rgba(90,62,62,0.7)',
  meta:     'rgba(90,62,62,0.55)',
  dashed:   'rgba(90,62,62,0.22)',
  dashedSoft: 'rgba(90,62,62,0.15)',
  gold:     '#C4A35A',
  goldHi:   '#E8BC59',
  income:   '#769268',
  expense:  '#C4504A',
  wine:     '#7a4038',
  pink:     '#F1ADD8',
};

// ──────────────────────────────────────────────────────────────────────
//  Format helpers
// ──────────────────────────────────────────────────────────────────────

const fmt = (n: number) => {
  const sign = n < 0 ? '-' : '';
  return sign + '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
};
const fmtDate = (s?: string | null) => {
  if (!s) return '—';
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
};

// ──────────────────────────────────────────────────────────────────────
//  Primitives
// ──────────────────────────────────────────────────────────────────────

const Eyebrow: React.FC<{ children: React.ReactNode; gold?: boolean; style?: React.CSSProperties }> = ({ children, gold, style }) => (
  <span style={{
    fontFamily: 'Inter', fontSize: 10, fontWeight: 500,
    letterSpacing: '0.22em', textTransform: 'uppercase',
    color: gold ? C.gold : C.meta, ...style,
  }}>{children}</span>
);

const Dashed: React.FC<{ vertical?: boolean; style?: React.CSSProperties }> = ({ vertical, style }) =>
  vertical
    ? <div style={{ width: 1, alignSelf: 'stretch', borderLeft: `1px dashed ${C.dashed}`, ...style }} />
    : <div style={{ height: 1, width: '100%', borderTop: `1px dashed ${C.dashed}`, ...style }} />;

const Metric: React.FC<{ label: string; value: string; delta?: number; hint?: string; big?: boolean }> = ({ label, value, delta, hint, big }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <Eyebrow>{label}</Eyebrow>
    <div style={{
      fontFamily: 'Inter', fontWeight: 300,
      fontSize: big ? 56 : 40, lineHeight: 1, letterSpacing: '-0.04em',
      color: C.ink, fontVariantNumeric: 'tabular-nums',
      display: 'flex', alignItems: 'baseline', gap: 10,
    }}>
      {value}
      {delta !== undefined && (
        <span style={{ fontSize: 12, fontWeight: 500, color: delta > 0 ? C.income : C.wine }}>
          {delta > 0 ? '+' : ''}{delta}%
        </span>
      )}
    </div>
    {hint && (
      <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.meta }}>
        {hint}
      </div>
    )}
  </div>
);

// ──────────────────────────────────────────────────────────────────────
//  AI bar
// ──────────────────────────────────────────────────────────────────────

const AIBar: React.FC<{
  value: string; setValue: (v: string) => void;
  onSubmit: (text: string) => void;
  onOpenAssistant: () => void;
  onOpenChat: () => void;
  suggestions: string[];
}> = ({ value, setValue, onSubmit, onOpenAssistant, onOpenChat, suggestions }) => {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        background: '#FFFFFF', border: `1px solid ${C.bone}`,
        borderRadius: 9999, padding: '8px 8px 8px 22px',
        boxShadow: focused
          ? '0 12px 32px rgba(0,0,0,0.08), 0 0 0 4px rgba(232,188,89,0.15)'
          : '0 2px 6px rgba(0,0,0,0.03)',
        transition: 'all .3s cubic-bezier(.16,1,.3,1)',
      }}>
        <Sparkles size={16} color={C.gold} strokeWidth={1.5} />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => { if (e.key === 'Enter' && value.trim()) { onSubmit(value); setValue(''); } }}
          placeholder="Ask anything, or log a transaction…"
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            fontFamily: 'Inter', fontSize: 14, fontWeight: 400,
            color: C.ink, letterSpacing: '-0.01em',
          }}
        />
        <button
          type="button"
          title="Pegar archivo / Upload Excel"
          onClick={onOpenAssistant}
          style={{
            width: 32, height: 32, borderRadius: 9999, background: 'transparent',
            border: 'none', cursor: 'pointer', color: C.meta,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Paperclip size={15} />
        </button>
        <button
          type="button"
          title="Preguntale al AI"
          onClick={onOpenChat}
          style={{
            width: 32, height: 32, borderRadius: 9999, background: 'transparent',
            border: 'none', cursor: 'pointer', color: C.meta,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Mic size={15} />
        </button>
        <button
          onClick={() => { if (value.trim()) { onSubmit(value); setValue(''); } }}
          style={{
            height: 38, padding: '0 16px 0 18px', borderRadius: 9999,
            background: C.ink, color: C.cream,
            border: 'none', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontFamily: 'Inter', fontSize: 12, fontWeight: 500, letterSpacing: '0.02em',
          }}
        >
          Log <CornerDownLeft size={13} />
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingLeft: 6 }}>
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => setValue(s)}
            style={{
              padding: '6px 12px', borderRadius: 9999, border: '1px solid rgba(90,62,62,0.18)',
              background: 'transparent', color: 'rgba(42,24,24,0.7)',
              fontFamily: 'Inter', fontSize: 11, fontWeight: 400, letterSpacing: '0.01em',
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <Sparkles size={11} color={C.gold} /> {s}
          </button>
        ))}
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────
//  Action button (Income / Expense / Split / Export)
// ──────────────────────────────────────────────────────────────────────

const ActionButton: React.FC<{
  icon: React.ReactNode; label: string;
  onClick?: () => void;
  variant?: 'ghost' | 'income' | 'expense' | 'primary' | 'gold';
}> = ({ icon, label, onClick, variant = 'ghost' }) => {
  const [hover, setHover] = useState(false);
  const styles: Record<string, React.CSSProperties> = {
    ghost:   { background: '#FFFFFF', color: C.ink,     border: `1px solid ${C.bone}` },
    income:  { background: '#FFFFFF', color: C.income,  border: '1px solid rgba(118,146,104,0.35)' },
    expense: { background: '#FFFFFF', color: C.expense, border: '1px solid rgba(196,80,74,0.35)' },
    primary: { background: C.ink,     color: C.cream,   border: `1px solid ${C.ink}` },
    gold:    { background: C.goldHi,  color: C.ink,     border: `1px solid ${C.goldHi}` },
  };
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...styles[variant],
        padding: '10px 16px', borderRadius: 9999, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 8,
        fontFamily: 'Inter', fontSize: 13, fontWeight: 500, letterSpacing: '-0.005em',
        transform: hover ? 'translateY(-1px)' : 'translateY(0)',
        boxShadow: hover ? '0 6px 14px rgba(0,0,0,0.08)' : '0 2px 4px rgba(0,0,0,0.02)',
        transition: 'all .25s cubic-bezier(.16,1,.3,1)',
      }}
    >
      {icon}{label}
    </button>
  );
};

// ──────────────────────────────────────────────────────────────────────
//  Chart toggle
// ──────────────────────────────────────────────────────────────────────

type ChartVariant = 'bars' | 'lines' | 'area';

const ChartToggle: React.FC<{ variant: ChartVariant; setVariant: (v: ChartVariant) => void }> = ({ variant, setVariant }) => (
  <div style={{ display: 'inline-flex', padding: 3, background: 'rgba(90,62,62,0.06)', borderRadius: 9999 }}>
    {(['bars', 'lines', 'area'] as ChartVariant[]).map(v => (
      <button
        key={v}
        onClick={() => setVariant(v)}
        style={{
          padding: '6px 14px', borderRadius: 9999, border: 'none', cursor: 'pointer',
          background: variant === v ? C.ink : 'transparent',
          color: variant === v ? C.cream : 'rgba(90,62,62,0.6)',
          fontFamily: 'Inter', fontSize: 11, fontWeight: 500,
          letterSpacing: '0.04em', textTransform: 'capitalize',
          transition: 'all .25s cubic-bezier(.16,1,.3,1)',
        }}
      >{v}</button>
    ))}
  </div>
);

// ──────────────────────────────────────────────────────────────────────
//  Liquidity chart (rich SVG with hover tooltip)
// ──────────────────────────────────────────────────────────────────────

const LiquidityChart: React.FC<{ data: LiquidityPoint[]; variant: ChartVariant; height?: number }> = ({ data, variant, height = 280 }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const W = 720, H = height, padX = 48, padY = 32, padBottom = 52;
  const innerW = W - padX * 2;
  const innerH = H - padY - padBottom;
  const safe = data.length > 0 ? data : [{ month: '—', ingresos: 0, gastos: 0, balance: 0 }];
  const maxRaw = Math.max(...safe.flatMap(d => [d.ingresos, d.gastos]));
  const max = (maxRaw > 0 ? maxRaw : 1) * 1.15;
  const x = (i: number) => padX + (innerW / Math.max(1, safe.length - 1)) * i;
  const yI = (v: number) => padY + innerH - (v / max) * innerH;
  const balPts = safe.map((d, i) => [x(i), yI(d.ingresos - d.gastos)] as [number, number]);
  const incPts = safe.map((d, i) => [x(i), yI(d.ingresos)] as [number, number]);
  const expPts = safe.map((d, i) => [x(i), yI(d.gastos)] as [number, number]);
  const smooth = (pts: [number, number][]) => {
    if (pts.length < 2) return `M ${pts[0]?.[0] || 0} ${pts[0]?.[1] || 0}`;
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
      const cx = (x1 + x2) / 2;
      d += ` C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
    }
    return d;
  };
  const incCurve = smooth(incPts);
  const expCurve = smooth(expPts);
  const incArea = incCurve + ` L ${x(safe.length - 1)} ${padY + innerH} L ${x(0)} ${padY + innerH} Z`;

  const ticks = 4;
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => max * (i / ticks));

  return (
    <div style={{ position: 'relative', width: '100%' }} onMouseLeave={() => setHoverIdx(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id="livv-incGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={C.income} stopOpacity="0.32" />
            <stop offset="100%" stopColor={C.income} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="livv-incBar" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={C.income} stopOpacity="1" />
            <stop offset="100%" stopColor={C.income} stopOpacity="0.7" />
          </linearGradient>
          <linearGradient id="livv-expBar" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={C.expense} stopOpacity="0.95" />
            <stop offset="100%" stopColor={C.expense} stopOpacity="0.65" />
          </linearGradient>
          <linearGradient id="livv-goldStroke" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={C.gold} />
            <stop offset="50%" stopColor={C.goldHi} />
            <stop offset="100%" stopColor={C.gold} />
          </linearGradient>
        </defs>

        {/* Y grid + labels */}
        {tickVals.map((v, i) => (
          <g key={i}>
            <line x1={padX} x2={W - padX} y1={yI(v)} y2={yI(v)} stroke="rgba(90,62,62,0.08)" strokeDasharray={i === 0 ? '' : '2 4'} />
            <text x={padX - 12} y={yI(v) + 3} fontSize="10" fontFamily="JetBrains Mono" fill={C.meta} textAnchor="end" letterSpacing="0.05em">
              ${(v / 1000).toFixed(0)}k
            </text>
          </g>
        ))}

        {/* Soft area wash always visible */}
        <path d={incArea} fill="url(#livv-incGrad)" />

        {/* Bars */}
        {variant === 'bars' && safe.map((d, i) => {
          const bw = 16, gap = 4;
          const baseX = x(i) - bw - gap / 2;
          const inH = (d.ingresos / max) * innerH;
          const exH = (d.gastos / max) * innerH;
          const isHover = hoverIdx === i;
          return (
            <g key={i} style={{ transition: 'opacity .2s' }} opacity={hoverIdx === null || isHover ? 1 : 0.45}>
              <rect x={baseX} y={padY + innerH - inH} width={bw} height={inH} rx="4" fill="url(#livv-incBar)" />
              <rect x={baseX + bw + gap} y={padY + innerH - exH} width={bw} height={exH} rx="4" fill="url(#livv-expBar)" />
            </g>
          );
        })}

        {/* Lines / Area */}
        {(variant === 'lines' || variant === 'area') && (
          <>
            {variant === 'area' && <path d={incArea} fill="url(#livv-incGrad)" opacity="0.6" />}
            <path d={incCurve} fill="none" stroke={C.income} strokeWidth="2" strokeLinejoin="round" />
            <path d={expCurve} fill="none" stroke={C.expense} strokeWidth="2" strokeLinejoin="round" opacity="0.85" />
          </>
        )}

        {/* Net (gold) line on top */}
        <path d={smooth(balPts)} fill="none" stroke="url(#livv-goldStroke)" strokeWidth="2.5" strokeLinejoin="round" strokeDasharray={variant === 'bars' ? '0' : '4 4'} opacity="0.9" />

        {/* Hover columns + dot */}
        {safe.map((d, i) => {
          const isHover = hoverIdx === i;
          const bal = d.ingresos - d.gastos;
          return (
            <g key={'h' + i}>
              <rect
                x={x(i) - innerW / (safe.length * 2)}
                y={padY}
                width={innerW / safe.length}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
                style={{ cursor: 'crosshair' }}
              />
              {isHover && (
                <line x1={x(i)} x2={x(i)} y1={padY} y2={padY + innerH} stroke={C.goldHi} strokeWidth="1" strokeDasharray="2 3" opacity="0.6" />
              )}
              <circle
                cx={x(i)} cy={yI(bal)}
                r={isHover ? 6 : 3.5}
                fill={C.cream}
                stroke={C.goldHi}
                strokeWidth={isHover ? 2.5 : 1.8}
                style={{ transition: 'r .2s' }}
              />
            </g>
          );
        })}

        {/* X labels */}
        {safe.map((d, i) => (
          <text
            key={'l' + i} x={x(i)} y={H - 24}
            fontSize="10" fontFamily="JetBrains Mono"
            fill={hoverIdx === i ? C.ink : C.meta}
            textAnchor="middle" letterSpacing="0.12em"
            fontWeight={hoverIdx === i ? 600 : 400}
          >{d.month.toUpperCase()}</text>
        ))}
      </svg>

      {/* Tooltip */}
      {hoverIdx !== null && (() => {
        const d = safe[hoverIdx];
        const bal = d.ingresos - d.gastos;
        const xPct = (x(hoverIdx) / W) * 100;
        const flip = xPct > 70;
        return (
          <div style={{
            position: 'absolute', top: 8, left: `calc(${xPct}% + ${flip ? -180 : 16}px)`,
            background: C.ink, color: C.cream,
            borderRadius: 12, padding: '12px 14px', minWidth: 160,
            boxShadow: '0 12px 32px rgba(0,0,0,0.18)', fontFamily: 'Inter',
            pointerEvents: 'none', zIndex: 5,
          }}>
            <div style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', opacity: 0.55, marginBottom: 8, fontFamily: 'JetBrains Mono' }}>
              {d.month}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 6 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, opacity: 0.7 }}>
                <span style={{ width: 6, height: 6, borderRadius: 9999, background: C.income }} />Income
              </span>
              <span style={{ fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{fmt(d.ingresos)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, opacity: 0.7 }}>
                <span style={{ width: 6, height: 6, borderRadius: 9999, background: C.expense }} />Expenses
              </span>
              <span style={{ fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{fmt(-d.gastos)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, paddingTop: 8, borderTop: '1px solid rgba(253,251,247,0.15)' }}>
              <span style={{ fontSize: 11, color: C.goldHi }}>Net</span>
              <span style={{ fontSize: 14, fontWeight: 500, color: C.goldHi, fontVariantNumeric: 'tabular-nums' }}>{fmt(bal)}</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────
//  Activity rows (unified income installments + expenses, sorted by date)
// ──────────────────────────────────────────────────────────────────────

interface ActivityItem {
  id: string;
  kind: 'income' | 'expense';
  name: string;
  sub: string;
  amount: number; // positive = income, negative = expense
  date: string;
  status: 'paid' | 'pending' | 'overdue';
  source: { kind: 'installment'; data: Installment } | { kind: 'expense'; data: ExpenseEntry };
}

const ActivityRow: React.FC<{
  item: ActivityItem;
  compact?: boolean;
  onTogglePaid?: (item: ActivityItem) => void;
}> = ({ item, compact, onTogglePaid }) => {
  const isPaid = item.status === 'paid';
  const isOverdue = item.status === 'overdue';
  const pos = item.amount > 0;
  const dotColor = isPaid ? C.income : isOverdue ? C.expense : pos ? C.income : C.gold;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: compact ? '12px 0' : '16px 0',
      borderBottom: `1px ${compact ? 'solid' : 'dashed'} ${C.dashedSoft}`,
    }}>
      <button
        onClick={() => onTogglePaid?.(item)}
        title={isPaid ? 'Already settled' : pos ? 'Mark as received' : 'Mark as paid'}
        style={{
          width: 24, height: 24, borderRadius: 9999,
          border: `1.5px solid ${isPaid ? C.income : dotColor}`,
          background: isPaid ? C.income : 'transparent',
          cursor: 'pointer', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: C.cream, padding: 0,
          transition: 'all .25s cubic-bezier(.16,1,.3,1)',
        }}
      >
        {isPaid && <Check size={13} strokeWidth={2.5} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'Inter', fontSize: 14, fontWeight: 500,
          color: C.ink, letterSpacing: '-0.01em',
          textDecoration: isPaid ? 'line-through' : 'none',
          opacity: isPaid ? 0.45 : 1,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{item.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
          <span style={{ fontFamily: 'Inter', fontSize: 11, color: C.meta, letterSpacing: '0.02em' }}>{item.sub}</span>
          {isOverdue && (
            <span style={{
              fontFamily: 'JetBrains Mono', fontSize: 9, padding: '2px 6px',
              background: 'rgba(196,80,74,0.12)', color: C.expense,
              borderRadius: 4, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600,
            }}>Overdue</span>
          )}
          {pos && !isPaid && !isOverdue && (
            <span style={{
              fontFamily: 'JetBrains Mono', fontSize: 9, padding: '2px 6px',
              background: 'rgba(118,146,104,0.12)', color: C.income,
              borderRadius: 4, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600,
            }}>Incoming</span>
          )}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{
          fontFamily: 'Inter', fontSize: 14, fontWeight: 500,
          color: pos ? C.income : C.ink, fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.01em',
        }}>{pos ? '+' : ''}{fmt(item.amount)}</div>
        <div style={{
          fontFamily: 'JetBrains Mono', fontSize: 10,
          color: isOverdue ? C.expense : C.meta,
          letterSpacing: '0.06em', marginTop: 3, textTransform: 'uppercase',
        }}>{fmtDate(item.date)}</div>
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────
//  Project P&L card
// ──────────────────────────────────────────────────────────────────────

const ProjectCard: React.FC<{ p: ProjectPnLEntry }> = ({ p }) => {
  const margin = p.income > 0 ? Math.round(((p.income - p.expenses) / p.income) * 100) : 0;
  const isAtRisk = p.health === 'loss' && p.income > 0;
  const isClosed = p.health === 'break-even' && p.income === 0 && p.expenses === 0;
  const total = Math.max(1, p.income + p.expenses);
  const accentColor = p.health === 'profitable' ? C.income : p.health === 'loss' ? C.expense : C.gold;
  return (
    <div style={{
      textAlign: 'left', background: '#FFFFFF', border: `1px solid ${C.bone}`,
      borderRadius: 18, padding: 18, display: 'flex', flexDirection: 'column', gap: 14,
      transition: 'all .25s cubic-bezier(.16,1,.3,1)',
      position: 'relative', overflow: 'hidden',
      boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
      opacity: isClosed ? 0.7 : 1,
    }}>
      <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: accentColor }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontFamily: 'Inter', fontSize: 15, fontWeight: 500, color: C.ink,
            letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{p.name}</div>
          <div style={{ fontFamily: 'Inter', fontSize: 11, color: C.meta, marginTop: 2 }}>
            {p.health === 'profitable' ? 'Healthy' : p.health === 'loss' ? 'Burning' : 'Even'}
          </div>
        </div>
        {isAtRisk && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontFamily: 'JetBrains Mono', fontSize: 9, padding: '3px 7px',
            background: 'rgba(196,80,74,0.12)', color: C.expense, borderRadius: 4,
            letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600,
          }}>
            <Flame size={10} />At risk
          </span>
        )}
        {!isAtRisk && !isClosed && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontFamily: 'JetBrains Mono', fontSize: 9, padding: '3px 7px',
            background: 'rgba(118,146,104,0.12)', color: C.income, borderRadius: 4,
            letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600,
          }}>● Active</span>
        )}
      </div>
      <div>
        <div style={{
          fontFamily: 'Inter', fontWeight: 300, fontSize: 32, letterSpacing: '-0.04em',
          color: C.ink, fontVariantNumeric: 'tabular-nums', lineHeight: 1,
        }}>{fmt(p.profit)}</div>
        <div style={{
          fontFamily: 'JetBrains Mono', fontSize: 10, color: C.meta,
          letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 6,
        }}>Profit · {margin}% margin</div>
      </div>
      <div>
        <div style={{ display: 'flex', height: 6, borderRadius: 999, overflow: 'hidden', background: 'rgba(90,62,62,0.08)' }}>
          <div style={{ width: `${(p.income / total) * 100}%`, background: C.income }} />
          <div style={{ width: `${(p.expenses / total) * 100}%`, background: C.expense, opacity: 0.85 }} />
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', marginTop: 8,
          fontFamily: 'Inter', fontSize: 11, color: 'rgba(90,62,62,0.65)',
        }}>
          <span>Rev <strong style={{ color: C.ink, fontWeight: 500 }}>{fmt(p.income)}</strong></span>
          <span>Costs <strong style={{ color: C.ink, fontWeight: 500 }}>{fmt(p.expenses)}</strong></span>
        </div>
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────
//  Toast (lightweight, dismisses itself)
// ──────────────────────────────────────────────────────────────────────

const Toast: React.FC<{ msg: string; onDone: () => void }> = ({ msg, onDone }) => {
  React.useEffect(() => {
    if (!msg) return;
    const t = window.setTimeout(onDone, 2400);
    return () => window.clearTimeout(t);
  }, [msg, onDone]);
  if (!msg) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
      background: C.ink, color: C.cream, padding: '12px 20px', borderRadius: 9999,
      fontFamily: 'Inter', fontSize: 13, fontWeight: 500, letterSpacing: '-0.01em',
      boxShadow: '0 12px 32px rgba(0,0,0,0.2)',
      display: 'flex', alignItems: 'center', gap: 10,
      zIndex: 999,
    }}>
      <Sparkles size={14} color={C.goldHi} /> {msg}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────
//  Best month helper (for the stat strip below the chart)
// ──────────────────────────────────────────────────────────────────────

const bestMonth = (data: LiquidityPoint[]) => {
  if (data.length === 0) return { label: '—', value: 0 };
  let best = data[0];
  for (const d of data) if (d.balance > best.balance) best = d;
  return { label: best.month, value: best.balance };
};

// ──────────────────────────────────────────────────────────────────────
//  MAIN COMPONENT
// ──────────────────────────────────────────────────────────────────────

type SubTab = 'Overview' | 'Activity' | 'Projects';

export const LivvFinanceDashboard: React.FC<LivvFinanceDashboardProps> = ({
  incomes, expenses, liquidityData, projectPnL,
  currentBalance, projection90d, margin,
  totalPaidIncome, totalExpensesPaid, totalExpensesPending,
  onAddIncome, onAddExpense, onOpenAIAssistant, onOpenAIChat, onMarkInstallmentPaid,
  onMarkExpensePaid, onJumpToTab, canCreate,
}) => {
  const [aiValue, setAiValue] = useState('');
  const [tab, setTab] = useState<SubTab>('Overview');
  const [chartVariant, setChartVariant] = useState<ChartVariant>('bars');
  const [toast, setToast] = useState('');

  // Build the unified activity feed from real data — pending installments
  // + expenses, sorted by date DESC (most-recent-first). Capped at 50 rows
  // for the Activity tab; the Overview block shows the first 4.
  const activity: ActivityItem[] = useMemo(() => {
    const items: ActivityItem[] = [];
    incomes.forEach(inc => {
      (inc.installments || []).forEach(inst => {
        items.push({
          id: 'i:' + inst.id,
          kind: 'income',
          name: inc.concept || inc.client_name || 'Income',
          sub: [inc.client_name, inc.project_name].filter(Boolean).join(' · ') || 'Income',
          amount: inst.amount,
          date: inst.due_date || inc.due_date || inc.created_at?.split('T')[0] || '',
          status: inst.status === 'paid' ? 'paid' : inst.status === 'overdue' ? 'overdue' : 'pending',
          source: { kind: 'installment', data: inst },
        });
      });
    });
    expenses.forEach(exp => {
      items.push({
        id: 'e:' + exp.id,
        kind: 'expense',
        name: exp.concept || 'Expense',
        sub: [exp.vendor, exp.category].filter(Boolean).join(' · ') || 'Expense',
        amount: -exp.amount,
        date: exp.date,
        status: exp.status === 'paid' ? 'paid' : 'pending',
        source: { kind: 'expense', data: exp },
      });
    });
    // Sort: overdue/pending first by date DESC, then paid by date DESC
    items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return items.slice(0, 50);
  }, [incomes, expenses]);

  const togglePaid = async (item: ActivityItem) => {
    if (item.status === 'paid') return; // Reverting is not part of this surface
    if (item.source.kind === 'installment') {
      try {
        await onMarkInstallmentPaid(item.source.data);
        setToast(item.amount > 0 ? 'Marked as received ✓' : 'Marked as paid ✓');
      } catch { setToast('Could not update'); }
    } else if (item.source.kind === 'expense' && onMarkExpensePaid) {
      try {
        await onMarkExpensePaid(item.source.data);
        setToast('Marked as paid ✓');
      } catch { setToast('Could not update'); }
    } else if (item.source.kind === 'expense') {
      setToast('Use the Expenses tab to settle this');
    }
  };

  // Parse a free-text AI prompt locally — opens the assistant pre-flight
  // for anything more complex. Mirrors the design's quick-log behaviour.
  const handleAI = (text: string) => {
    const t = text.toLowerCase();
    const isExpense = /pay|paid|spend|spent|expense|bought|bill|gasto|pagué|paga/.test(t);
    if (isExpense) onAddExpense();
    else onAddIncome();
    setToast('Opening form…');
    // Stash the text on window so the form can pre-fill if it wants to.
    (window as any).__livvAILastPrompt = text;
  };

  const ytdIncome = totalPaidIncome;
  const ytdExpenses = totalExpensesPaid;
  const netYTD = ytdIncome - ytdExpenses;
  const best = bestMonth(liquidityData);

  return (
    <div style={{
      background: C.cream, color: C.ink, fontFamily: 'Inter',
      borderRadius: 24, border: `1px solid ${C.bone}`,
      padding: '40px 36px 48px',
      position: 'relative',
      boxShadow: '0 2px 4px rgba(0,0,0,0.02), 0 8px 16px -4px rgba(0,0,0,0.04)',
    }}>
      {/* ─── Hero ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <Eyebrow style={{ marginBottom: 10, display: 'block' }}>© Finance Module</Eyebrow>
          <h1 style={{
            fontFamily: 'Inter', fontWeight: 300, fontSize: 56, lineHeight: 1,
            letterSpacing: '-0.05em', margin: 0, color: C.ink,
          }}>Money, in motion.</h1>
          <p style={{
            fontFamily: 'Inter', fontSize: 14, fontWeight: 400,
            color: C.body, marginTop: 12, maxWidth: 480, letterSpacing: '-0.005em',
          }}>Track income, expenses, project profitability, and team splits — all in one place.</p>
        </div>
        {canCreate && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <ActionButton icon={<ArrowDownLeft size={14} />} label="Income" variant="income" onClick={onAddIncome} />
            <ActionButton icon={<ArrowUpRight size={14} />} label="Expense" variant="expense" onClick={onAddExpense} />
            <ActionButton icon={<Split size={14} />} label="Split" variant="ghost" onClick={onAddExpense} />
            <Dashed vertical style={{ height: 24, margin: '0 4px' }} />
            <ActionButton icon={<Download size={14} />} label="Export" variant="ghost" />
          </div>
        )}
      </div>

      {/* ─── AI bar ─── */}
      {canCreate && (
        <div style={{ marginBottom: 48 }}>
          <AIBar
            value={aiValue} setValue={setAiValue}
            onSubmit={handleAI}
            onOpenAssistant={onOpenAIAssistant}
            onOpenChat={onOpenAIChat}
            suggestions={[
              'Paid $180 to AWS',
              'Acme Co. invoice $4500 due May 15',
              'Split $1,200 with Mariana',
              "What's my margin this month?",
            ]}
          />
        </div>
      )}

      {/* ─── 3 hero metrics with dashed dividers ─── */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr auto 1fr auto 1fr',
        borderTop: `1px dashed ${C.dashed}`, borderBottom: `1px dashed ${C.dashed}`,
        padding: '32px 0',
      }}>
        <div style={{ paddingRight: 32 }}>
          <Metric big label="© Cash on Hand" value={fmt(currentBalance)}
            delta={incomes.length > 0 ? +12.4 : undefined}
            hint="USD · Reconciled today" />
        </div>
        <Dashed vertical />
        <div style={{ padding: '0 32px' }}>
          <Metric big label="© 90-Day Forecast" value={fmt(projection90d)}
            hint="Projected net inflow" />
        </div>
        <Dashed vertical />
        <div style={{ paddingLeft: 32 }}>
          <Metric big label="© Operating Margin" value={`${margin.toFixed(1)}%`}
            delta={incomes.length > 0 ? +3.1 : undefined}
            hint={margin > 50 ? 'Above target · 75%' : 'Below target'} />
        </div>
      </div>

      {/* ─── Sub-tabs ─── */}
      <div style={{ display: 'flex', marginTop: 28, borderBottom: `1px dashed ${C.dashed}` }}>
        {(['Overview', 'Activity', 'Projects'] as SubTab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '14px 24px', background: 'transparent', border: 'none', cursor: 'pointer',
              fontFamily: 'Inter', fontSize: 13, fontWeight: 500, letterSpacing: '-0.005em',
              color: tab === t ? C.ink : 'rgba(90,62,62,0.5)',
              borderBottom: tab === t ? `1px solid ${C.ink}` : '1px solid transparent',
              marginBottom: -1,
            }}
          >
            {t}{tab === t && (
              <span style={{
                marginLeft: 8, fontFamily: 'JetBrains Mono', fontSize: 9,
                color: C.gold, letterSpacing: '0.1em',
              }}>●</span>
            )}
          </button>
        ))}
      </div>

      {/* ─── Overview ─── */}
      {tab === 'Overview' && (
        <>
          <div style={{
            marginTop: 28, background: '#FFFFFF', border: `1px solid ${C.bone}`,
            borderRadius: 24, padding: 28,
            boxShadow: '0 2px 4px rgba(0,0,0,0.02), 0 8px 16px -4px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <Eyebrow gold>● Live</Eyebrow>
                <h3 style={{
                  fontFamily: 'Inter', fontWeight: 300, fontSize: 30,
                  letterSpacing: '-0.04em', margin: '8px 0 4px', color: C.ink,
                }}>Liquidity timeline</h3>
                <p style={{ fontFamily: 'Inter', fontSize: 13, color: C.body, margin: 0 }}>
                  Hover any month to see income, expenses and net.
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
                <ChartToggle variant={chartVariant} setVariant={setChartVariant} />
                <div style={{ display: 'flex', gap: 14, fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: '0.1em', color: C.meta, textTransform: 'uppercase' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 9999, background: C.income }} />Income
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 9999, background: C.expense }} />Expenses
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 14, height: 2, background: 'linear-gradient(90deg, #C4A35A, #E8BC59, #C4A35A)' }} />Net
                  </span>
                </div>
              </div>
            </div>
            <LiquidityChart data={liquidityData} variant={chartVariant} height={260} />
            {/* Stat strip */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0,
              marginTop: 24, paddingTop: 20, borderTop: `1px dashed ${C.dashedSoft}`,
            }}>
              {[
                { l: 'YTD income',   v: fmt(ytdIncome),                      c: C.income },
                { l: 'YTD expenses', v: fmt(ytdExpenses),                    c: C.expense },
                { l: 'Net YTD',      v: fmt(netYTD),                         c: C.ink },
                { l: 'Best month',   v: best.value > 0 ? `${best.label} · ${fmt(best.value)}` : '—', c: C.gold },
              ].map((s, i) => (
                <div key={i} style={{
                  paddingLeft: i ? 24 : 0, paddingRight: i < 3 ? 24 : 0,
                  borderLeft: i ? `1px dashed ${C.dashedSoft}` : 'none',
                }}>
                  <Eyebrow>{s.l}</Eyebrow>
                  <div style={{
                    fontFamily: 'Inter', fontWeight: 400, fontSize: 20,
                    letterSpacing: '-0.02em', color: s.c, marginTop: 6,
                    fontVariantNumeric: 'tabular-nums',
                  }}>{s.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Activity preview + Top projects */}
          <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
            <div style={{ background: '#FFFFFF', border: `1px solid ${C.bone}`, borderRadius: 24, padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <h3 style={{ fontFamily: 'Inter', fontWeight: 500, fontSize: 16, letterSpacing: '-0.02em', margin: 0 }}>
                  Upcoming &amp; recent
                </h3>
                <button
                  onClick={() => setTab('Activity')}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontFamily: 'Inter', fontSize: 12, fontWeight: 500, color: C.ink,
                  }}
                >View all <TrendUp size={12} /></button>
              </div>
              {activity.length > 0 ? activity.slice(0, 4).map(p => (
                <ActivityRow key={p.id} item={p} compact onTogglePaid={togglePaid} />
              )) : (
                <p style={{ fontFamily: 'Inter', fontSize: 13, color: C.meta, textAlign: 'center', padding: '24px 0' }}>
                  No activity yet. Add income or expenses to see them here.
                </p>
              )}
            </div>
            <div style={{ background: '#FFFFFF', border: `1px solid ${C.bone}`, borderRadius: 24, padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <h3 style={{ fontFamily: 'Inter', fontWeight: 500, fontSize: 16, letterSpacing: '-0.02em', margin: 0 }}>
                  Top projects
                </h3>
                <button
                  onClick={() => onJumpToTab('proyectos')}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontFamily: 'Inter', fontSize: 12, fontWeight: 500, color: C.ink,
                  }}
                >All P&amp;L <TrendUp size={12} /></button>
              </div>
              {projectPnL.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {projectPnL.slice(0, 4).map(p => {
                    const m = p.income > 0 ? Math.round((p.profit / p.income) * 100) : 0;
                    const accent = p.health === 'profitable' ? C.income : p.health === 'loss' ? C.expense : C.gold;
                    return (
                      <div key={p.name} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '8px 0', borderBottom: `1px dashed ${C.dashedSoft}`,
                      }}>
                        <span style={{ width: 8, height: 8, borderRadius: 9999, background: accent, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontFamily: 'Inter', fontSize: 13, fontWeight: 500, color: C.ink,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>{p.name}</div>
                          <div style={{
                            height: 3, background: 'rgba(90,62,62,0.08)',
                            borderRadius: 999, marginTop: 6, overflow: 'hidden',
                          }}>
                            <div style={{
                              width: `${Math.max(0, Math.min(100, p.income > 0 ? (p.profit / p.income) * 100 : 0))}%`,
                              height: '100%', background: accent,
                            }} />
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{
                            fontFamily: 'Inter', fontSize: 13, fontWeight: 500, color: C.ink,
                            fontVariantNumeric: 'tabular-nums',
                          }}>{fmt(p.profit)}</div>
                          <div style={{
                            fontFamily: 'JetBrains Mono', fontSize: 9, color: C.meta,
                            letterSpacing: '0.08em', textTransform: 'uppercase',
                          }}>{m}% margin</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ fontFamily: 'Inter', fontSize: 13, color: C.meta, textAlign: 'center', padding: '24px 0' }}>
                  Link incomes and expenses to projects to see margins here.
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {/* ─── Activity ─── */}
      {tab === 'Activity' && (
        <div style={{
          marginTop: 28, background: '#FFFFFF', border: `1px solid ${C.bone}`,
          borderRadius: 24, padding: 28,
        }}>
          <h3 style={{ fontFamily: 'Inter', fontWeight: 500, fontSize: 18, letterSpacing: '-0.02em', margin: 0 }}>
            All activity
          </h3>
          <Eyebrow style={{ marginTop: 4, display: 'block' }}>
            Tap the circle to mark received / paid
          </Eyebrow>
          <div style={{ marginTop: 16 }}>
            {activity.length > 0 ? activity.map(p => (
              <ActivityRow key={p.id} item={p} onTogglePaid={togglePaid} />
            )) : (
              <p style={{ fontFamily: 'Inter', fontSize: 13, color: C.meta, textAlign: 'center', padding: '32px 0' }}>
                Nothing to show yet.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ─── Projects ─── */}
      {tab === 'Projects' && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18 }}>
            <div>
              <Eyebrow gold>© Project P&amp;L プロジェクト</Eyebrow>
              <h3 style={{
                fontFamily: 'Inter', fontWeight: 300, fontSize: 26,
                letterSpacing: '-0.04em', margin: '6px 0 0',
              }}>Profitability by project</h3>
            </div>
            <ActionButton icon={<Plus size={14} />} label="New project" variant="primary"
              onClick={() => onJumpToTab('proyectos')} />
          </div>
          {projectPnL.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
              {projectPnL.map(p => <ProjectCard key={p.name} p={p} />)}
            </div>
          ) : (
            <div style={{
              background: '#FFFFFF', border: `1px solid ${C.bone}`, borderRadius: 24,
              padding: 40, textAlign: 'center', color: C.meta, fontSize: 13,
            }}>
              Assign income or expenses to a project to see its P&amp;L here.
            </div>
          )}
        </div>
      )}

      <Toast msg={toast} onDone={() => setToast('')} />
    </div>
  );
};
