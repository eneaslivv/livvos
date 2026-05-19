import React, { useMemo } from 'react';
import { Icons } from '../ui/Icons';
import type { Lead } from '../../types';

/**
 * Sales Pipeline Stats — 4 KPI tiles with sparklines + delta indicators.
 * Computed from the live leads list, not seed data.
 *
 *   Pipeline value   = sum of impl + 6*mrr for non-lost leads
 *   Won this month   = sum of impl + 6*mrr for leads marked won in current month
 *   Win rate (30d)   = won / (won + lost) over the last 30 days
 *   Avg cycle        = average days between created_at and won_at for last 10 wins
 *
 * Sparklines show last 8 weeks of pipeline value movement.
 * Deltas compare to the previous period.
 */

interface SalesPipelineStatsProps {
  leads: Lead[];
}

function fmtK(n: number): string {
  if (!isFinite(n) || n === 0) return '$0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function fmtPct(n: number): string {
  if (!isFinite(n)) return '—';
  return `${n.toFixed(1)}%`;
}

export const SalesPipelineStats: React.FC<SalesPipelineStatsProps> = ({ leads }) => {
  const stats = useMemo(() => {
    const now = new Date();
    const ms30 = 30 * 24 * 60 * 60 * 1000;
    const ms60 = 60 * 24 * 60 * 60 * 1000;
    const ms7 = 7 * 24 * 60 * 60 * 1000;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();

    const leadValue = (l: any) => (l.deal_value_implementation || 0) + 6 * (l.deal_value_monthly || 0);

    // 1) Pipeline value — open leads only (not won/lost)
    const openLeads = leads.filter(l => l.status !== 'won' && l.status !== 'lost');
    const pipelineValue = openLeads.reduce((s, l) => s + leadValue(l), 0);

    // Pipeline value last week (open leads as of 7 days ago — approximation
    // using created_at — gives an indicative trend, not a perfect snapshot)
    const lastWeekOpen = leads.filter(l => {
      const created = l.created_at ? new Date(l.created_at).getTime() : 0;
      return created < now.getTime() - ms7 && l.status !== 'won' && l.status !== 'lost';
    });
    const pipelineLastWeek = lastWeekOpen.reduce((s, l) => s + leadValue(l), 0);
    const pipelineDelta = pipelineLastWeek > 0
      ? ((pipelineValue - pipelineLastWeek) / pipelineLastWeek) * 100
      : 0;

    // 2) Won this month
    const wonThisMonth = leads.filter(l => {
      if (l.status !== 'won') return false;
      const ts = (l as any).updated_at ? new Date((l as any).updated_at).getTime() : 0;
      return ts >= startOfMonth;
    });
    const wonValue = wonThisMonth.reduce((s, l) => s + leadValue(l), 0);
    const wonLastMonth = leads.filter(l => {
      if (l.status !== 'won') return false;
      const ts = (l as any).updated_at ? new Date((l as any).updated_at).getTime() : 0;
      return ts >= startOfLastMonth && ts < startOfMonth;
    });
    const wonLastValue = wonLastMonth.reduce((s, l) => s + leadValue(l), 0);
    const wonDelta = wonLastValue > 0 ? ((wonValue - wonLastValue) / wonLastValue) * 100 : 0;

    // 3) Win rate (last 30 days)
    const closedLast30 = leads.filter(l => {
      const ts = (l as any).updated_at ? new Date((l as any).updated_at).getTime() : 0;
      return (l.status === 'won' || l.status === 'lost') && ts >= now.getTime() - ms30;
    });
    const wonLast30 = closedLast30.filter(l => l.status === 'won').length;
    const winRate = closedLast30.length > 0 ? (wonLast30 / closedLast30.length) * 100 : 0;
    const closedPrev30 = leads.filter(l => {
      const ts = (l as any).updated_at ? new Date((l as any).updated_at).getTime() : 0;
      return (l.status === 'won' || l.status === 'lost') && ts >= now.getTime() - ms60 && ts < now.getTime() - ms30;
    });
    const wonPrev30 = closedPrev30.filter(l => l.status === 'won').length;
    const winRatePrev = closedPrev30.length > 0 ? (wonPrev30 / closedPrev30.length) * 100 : 0;
    const winRateDelta = winRate - winRatePrev;

    // 4) Avg cycle — last 10 wins
    const recentWins = leads
      .filter(l => l.status === 'won' && l.created_at && (l as any).updated_at)
      .sort((a, b) => new Date((b as any).updated_at).getTime() - new Date((a as any).updated_at).getTime())
      .slice(0, 10);
    const avgCycle = recentWins.length > 0
      ? recentWins.reduce((s, l) => {
          const d = (new Date((l as any).updated_at).getTime() - new Date(l.created_at!).getTime()) / (1000 * 60 * 60 * 24);
          return s + d;
        }, 0) / recentWins.length
      : 0;
    // Prior 10 wins (11–20) for delta
    const olderWins = leads
      .filter(l => l.status === 'won' && l.created_at && (l as any).updated_at)
      .sort((a, b) => new Date((b as any).updated_at).getTime() - new Date((a as any).updated_at).getTime())
      .slice(10, 20);
    const avgCyclePrev = olderWins.length > 0
      ? olderWins.reduce((s, l) => {
          const d = (new Date((l as any).updated_at).getTime() - new Date(l.created_at!).getTime()) / (1000 * 60 * 60 * 24);
          return s + d;
        }, 0) / olderWins.length
      : 0;
    const cycleDelta = avgCyclePrev > 0 ? avgCycle - avgCyclePrev : 0; // negative is good (faster)

    // Sparklines — 8 weekly buckets for each metric, derived from
    // created_at distribution + win timing
    const buckets = (filter: (l: any) => boolean, dateField: 'created_at' | 'updated_at') => {
      const out = new Array(8).fill(0);
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      for (const l of leads) {
        if (!filter(l)) continue;
        const ts = (l as any)[dateField] ? new Date((l as any)[dateField]).getTime() : 0;
        if (!ts) continue;
        const weeksAgo = Math.floor((now.getTime() - ts) / weekMs);
        if (weeksAgo >= 0 && weeksAgo < 8) out[7 - weeksAgo] += 1;
      }
      return out;
    };

    return {
      pipelineValue,
      pipelineDelta,
      pipelineSpark: buckets(l => l.status !== 'won' && l.status !== 'lost', 'created_at'),
      wonValue,
      wonDelta,
      wonSpark: buckets(l => l.status === 'won', 'updated_at'),
      winRate,
      winRateDelta,
      winRateSpark: buckets(l => l.status === 'won' || l.status === 'lost', 'updated_at'),
      avgCycle,
      cycleDelta,
      cycleSpark: buckets(l => l.status === 'won', 'updated_at'),
    };
  }, [leads]);

  const renderSpark = (data: number[]) => {
    const max = Math.max(1, ...data);
    return (
      <div className="spd-stat-spark" aria-hidden>
        {data.map((v, i) => (
          <span
            key={i}
            className={`bar ${i === data.length - 1 ? 'peak' : ''}`}
            style={{ height: `${Math.max(15, (v / max) * 100)}%` }}
          />
        ))}
      </div>
    );
  };

  const tiles = [
    {
      lbl: 'Pipeline value',
      icon: <Icons.DollarSign size={11} />,
      v: fmtK(stats.pipelineValue),
      target: 'open · 6mo arr',
      delta: stats.pipelineDelta,
      spark: stats.pipelineSpark,
    },
    {
      lbl: 'Won this month',
      icon: <Icons.CheckCircle size={11} />,
      v: fmtK(stats.wonValue),
      target: 'closed',
      delta: stats.wonDelta,
      spark: stats.wonSpark,
    },
    {
      lbl: 'Win rate · 30d',
      icon: <Icons.Activity size={11} />,
      v: fmtPct(stats.winRate),
      target: 'won / closed',
      delta: stats.winRateDelta,
      // Win rate delta is points, render as raw number not %
      deltaFmt: (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}pt`,
      spark: stats.winRateSpark,
    },
    {
      lbl: 'Avg cycle',
      icon: <Icons.Clock size={11} />,
      v: stats.avgCycle > 0 ? `${Math.round(stats.avgCycle)} d` : '—',
      target: 'last 10 wins',
      delta: -stats.cycleDelta, // invert: shorter cycle is "up"
      deltaFmt: (n: number) => `${n >= 0 ? '−' : '+'}${Math.abs(Math.round(stats.cycleDelta))}d`,
      spark: stats.cycleSpark,
    },
  ];

  return (
    <div className="spd-stats">
      {tiles.map((t, i) => {
        const dir = t.delta > 0.5 ? 'up' : t.delta < -0.5 ? 'down' : 'flat';
        const deltaText = t.deltaFmt
          ? t.deltaFmt(t.delta)
          : `${t.delta >= 0 ? '+' : ''}${t.delta.toFixed(0)}%`;
        return (
          <div key={i} className="spd-stat">
            <div className="spd-stat-head">
              <span className="spd-stat-lbl">
                <span className="ic">{t.icon}</span>
                {t.lbl}
              </span>
              <span className={`spd-stat-delta ${dir}`}>
                {dir === 'up' && '↑'}
                {dir === 'down' && '↓'}
                {dir === 'flat' && '→'}
                {deltaText}
              </span>
            </div>
            <div className="spd-stat-row">
              <span className="spd-stat-v">{t.v}</span>
              <span className="spd-stat-target">{t.target}</span>
            </div>
            {renderSpark(t.spark)}
          </div>
        );
      })}
    </div>
  );
};
