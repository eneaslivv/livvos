/**
 * AiMetricsPanel — dashboard for the agent_metrics rollup.
 *
 * Renders inside System → AI Metrics. Tenant-scoped: shows only the
 * current tenant's rows (RLS enforces this on the SELECT, plus the
 * explicit .eq('tenant_id') filter belt-and-suspenders).
 *
 * Sections:
 *   1. Period selector (7d / 30d / 90d) — drives all queries below.
 *   2. Tenant-wide overview: 4 stat cards (total turns, approve rate,
 *      thumbs %, avg LLM latency).
 *   3. Per-agent breakdown: one card per agent_id with its own
 *      sparkline + counters. Sorted by activity desc.
 *   4. Empty state when no rows fell in the period — explains the
 *      data path so the operator knows it'll populate naturally.
 *
 * Where the data comes from:
 *   • agent_conversations writes → orchestrator.ts logConversationTurn
 *     → increment_agent_metric RPC bumps the day's row.
 *   • agent_feedback writes → memory/feedback.ts recordFeedback →
 *     bump_feedback_metric RPC bumps thumbs_up / thumbs_down /
 *     actions_confirmed / actions_skipped / re_asks.
 *
 * So if a metric reads zero, it's not the dashboard — it's that the
 * underlying surface hasn't produced that signal yet.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import { Icons } from '../ui/Icons';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../context/TenantContext';
import { SPRING_ENTER, SPRING_TAP } from '../../lib/ui/motion';

interface MetricRow {
  tenant_id: string;
  agent_id: string;
  day: string;
  turns: number;
  thumbs_up: number;
  thumbs_down: number;
  re_asks: number;
  actions_confirmed: number;
  actions_skipped: number;
  avg_ms_total: number | null;
  avg_ms_skills: number | null;
  avg_ms_llm: number | null;
  skill_no_data_rate: number | null;
}

type Period = '7d' | '30d' | '90d';

const PERIOD_DAYS: Record<Period, number> = { '7d': 7, '30d': 30, '90d': 90 };

const fmtPct = (num: number, den: number): string =>
  den === 0 ? '—' : `${Math.round((num / den) * 100)}%`;

const fmtMs = (ms: number | null | undefined): string => {
  if (!ms) return '—';
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
};

export const AiMetricsPanel: React.FC = () => {
  const { currentTenant } = useTenant();
  const [period, setPeriod] = useState<Period>('30d');
  const [rows, setRows] = useState<MetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentTenant?.id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const sinceIso = new Date(Date.now() - PERIOD_DAYS[period] * 86400000)
      .toISOString().slice(0, 10);
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from('agent_metrics')
          .select('*')
          .eq('tenant_id', currentTenant.id)
          .gte('day', sinceIso)
          .order('day', { ascending: true });
        if (err) throw err;
        if (!cancelled) setRows((data || []) as MetricRow[]);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load metrics');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentTenant?.id, period]);

  // ── Tenant-wide totals over the period ─────────────────────────────
  const totals = useMemo(() => {
    const acc = {
      turns: 0, thumbs_up: 0, thumbs_down: 0, re_asks: 0,
      actions_confirmed: 0, actions_skipped: 0,
      ms_llm_sum: 0, ms_llm_count: 0,
    };
    for (const r of rows) {
      acc.turns             += r.turns || 0;
      acc.thumbs_up         += r.thumbs_up || 0;
      acc.thumbs_down       += r.thumbs_down || 0;
      acc.re_asks           += r.re_asks || 0;
      acc.actions_confirmed += r.actions_confirmed || 0;
      acc.actions_skipped   += r.actions_skipped || 0;
      if (r.avg_ms_llm) {
        acc.ms_llm_sum   += Number(r.avg_ms_llm) * (r.turns || 1);
        acc.ms_llm_count += r.turns || 1;
      }
    }
    return {
      ...acc,
      avg_ms_llm: acc.ms_llm_count > 0 ? acc.ms_llm_sum / acc.ms_llm_count : 0,
    };
  }, [rows]);

  // ── Group rows by agent for the per-agent cards ───────────────────
  const byAgent = useMemo(() => {
    const m = new Map<string, MetricRow[]>();
    for (const r of rows) {
      const cur = m.get(r.agent_id) || [];
      cur.push(r);
      m.set(r.agent_id, cur);
    }
    // Sort agents by total turns desc — most active first.
    return Array.from(m.entries())
      .map(([agentId, agentRows]) => ({
        agentId,
        rows: agentRows,
        totalTurns: agentRows.reduce((s, r) => s + (r.turns || 0), 0),
      }))
      .sort((a, b) => b.totalTurns - a.totalTurns);
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">AI Metrics</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Per-agent quality + latency rollup, populated by Brief / AiAdvisor turns.
          </p>
        </div>
        {/* Period selector — 3-state segmented control */}
        <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5 bg-zinc-50 dark:bg-zinc-900">
          {(['7d', '30d', '90d'] as Period[]).map(p => (
            <motion.button
              key={p}
              onClick={() => setPeriod(p)}
              whileTap={{ scale: 0.96, transition: SPRING_TAP }}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                period === p
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              {p}
            </motion.button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Icons.Loader className="animate-spin text-zinc-400" size={20} />
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* ── Tenant-wide overview cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <StatCard
              label="Total turns"
              value={totals.turns}
              hint={`${period}`}
              tone="zinc"
            />
            <StatCard
              label="Approve rate"
              value={fmtPct(totals.actions_confirmed, totals.actions_confirmed + totals.actions_skipped)}
              hint={`${totals.actions_confirmed} of ${totals.actions_confirmed + totals.actions_skipped}`}
              tone={totals.actions_confirmed + totals.actions_skipped > 0
                && totals.actions_confirmed / (totals.actions_confirmed + totals.actions_skipped) < 0.5
                ? 'rose' : 'emerald'}
            />
            <StatCard
              label="Thumbs"
              value={`${totals.thumbs_up}↑ ${totals.thumbs_down}↓`}
              hint={`${totals.re_asks} re-asks`}
              tone={totals.thumbs_down > totals.thumbs_up ? 'rose' : 'emerald'}
            />
            <StatCard
              label="Avg LLM latency"
              value={fmtMs(totals.avg_ms_llm)}
              hint="per turn"
              tone={totals.avg_ms_llm > 4000 ? 'amber' : 'zinc'}
            />
          </div>

          {/* ── Empty state ── */}
          {rows.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={SPRING_ENTER}
              className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-700 p-8 text-center"
            >
              <Icons.Activity size={28} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-2" />
              <p className="text-sm text-zinc-600 dark:text-zinc-300 font-medium">
                No agent activity in the last {PERIOD_DAYS[period]} days yet.
              </p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 max-w-md mx-auto">
                Metrics populate automatically as people use Brief or the floating AI
                advisor. Thumbs feedback and action approve/skip rates feed into
                this rollup too.
              </p>
            </motion.div>
          )}

          {/* ── Per-agent breakdown ── */}
          {byAgent.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
                By agent
              </div>
              <div className="space-y-2">
                <AnimatePresence initial={false}>
                  {byAgent.map((a, idx) => (
                    <AgentCard key={a.agentId} agentId={a.agentId} rows={a.rows} idx={idx} />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ── Stat card (mini) ────────────────────────────────────────────────
const TONE: Record<string, string> = {
  zinc:    'text-zinc-800 dark:text-zinc-200',
  emerald: 'text-emerald-600 dark:text-emerald-400',
  rose:    'text-rose-600 dark:text-rose-400',
  amber:   'text-amber-600 dark:text-amber-400',
};

const StatCard: React.FC<{ label: string; value: string | number; hint?: string; tone: keyof typeof TONE }> = ({
  label, value, hint, tone,
}) => (
  <motion.div
    initial={{ opacity: 0, y: 6, scale: 0.97 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={SPRING_ENTER}
    className="px-3 py-2.5 rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900"
  >
    <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{label}</div>
    <div className={`text-[18px] leading-none font-semibold tabular-nums mt-1 ${TONE[tone]}`}>{value}</div>
    {hint && <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">{hint}</div>}
  </motion.div>
);

// ── Per-agent card ──────────────────────────────────────────────────
// One row per agent_id. Sparkline of turns/day on the right + key
// numbers on the left. Color-codes the approve-rate and skill_no_data
// pill so issues stand out at a glance.
const AgentCard: React.FC<{ agentId: string; rows: MetricRow[]; idx: number }> = ({ agentId, rows, idx }) => {
  // Pre-compute per-day series for the sparkline + per-agent totals.
  const sum = rows.reduce((s, r) => ({
    turns:             s.turns + (r.turns || 0),
    thumbs_up:         s.thumbs_up + (r.thumbs_up || 0),
    thumbs_down:       s.thumbs_down + (r.thumbs_down || 0),
    actions_confirmed: s.actions_confirmed + (r.actions_confirmed || 0),
    actions_skipped:   s.actions_skipped + (r.actions_skipped || 0),
    re_asks:           s.re_asks + (r.re_asks || 0),
    ms_llm:            s.ms_llm + Number(r.avg_ms_llm || 0) * (r.turns || 0),
    ms_skills:         s.ms_skills + Number(r.avg_ms_skills || 0) * (r.turns || 0),
    no_data_sum:       s.no_data_sum + Number(r.skill_no_data_rate || 0) * (r.turns || 0),
    weight:            s.weight + (r.turns || 0),
  }), {
    turns: 0, thumbs_up: 0, thumbs_down: 0, actions_confirmed: 0,
    actions_skipped: 0, re_asks: 0, ms_llm: 0, ms_skills: 0,
    no_data_sum: 0, weight: 0,
  });

  const approveRate    = sum.actions_confirmed + sum.actions_skipped > 0
    ? sum.actions_confirmed / (sum.actions_confirmed + sum.actions_skipped) : null;
  const noDataRate     = sum.weight > 0 ? sum.no_data_sum / sum.weight : 0;
  const avgMsLlm       = sum.weight > 0 ? sum.ms_llm / sum.weight : 0;
  const sparklineData  = rows.map(r => ({ day: r.day, turns: r.turns || 0 }));

  // Display name: strip the "-agent" suffix that all our agent_ids
  // carry so the labels read clean ("tasks" instead of "tasks-agent").
  const displayName = agentId.replace(/-agent$/, '');

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING_ENTER, delay: idx * 0.04 }}
      className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3"
    >
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-semibold text-zinc-900 dark:text-zinc-100 capitalize">
              {displayName}
            </span>
            <span className="text-[10px] text-zinc-400 tabular-nums">
              {sum.turns} turn{sum.turns === 1 ? '' : 's'}
            </span>
          </div>
          {/* Inline pills row */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {approveRate !== null && (
              <Pill
                label="Approve"
                value={`${Math.round(approveRate * 100)}%`}
                tone={approveRate >= 0.7 ? 'emerald' : approveRate >= 0.4 ? 'amber' : 'rose'}
              />
            )}
            <Pill
              label="Thumbs"
              value={`${sum.thumbs_up}↑ ${sum.thumbs_down}↓`}
              tone={sum.thumbs_down > sum.thumbs_up ? 'rose' : 'emerald'}
            />
            {sum.re_asks > 0 && (
              <Pill
                label="Re-asks"
                value={String(sum.re_asks)}
                tone={sum.re_asks / Math.max(sum.turns, 1) > 0.15 ? 'rose' : 'amber'}
              />
            )}
            {noDataRate > 0 && (
              <Pill
                label="No data"
                value={`${Math.round(noDataRate * 100)}%`}
                tone={noDataRate > 0.3 ? 'rose' : noDataRate > 0.15 ? 'amber' : 'zinc'}
              />
            )}
            <Pill label="LLM" value={fmtMs(avgMsLlm)} tone={avgMsLlm > 4000 ? 'amber' : 'zinc'} />
          </div>
        </div>
        {/* Sparkline — turns per day across the selected period.
            Plain line on a transparent background, no axes or grid,
            so it reads as a trend at a glance without competing with
            the numeric pills. */}
        <div className="w-[140px] h-[44px] shrink-0">
          {sparklineData.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparklineData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as { day: string; turns: number };
                    return (
                      <div className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[10px] px-2 py-1 rounded-md shadow">
                        <div className="font-mono tabular-nums">{p.day}</div>
                        <div className="font-semibold">{p.turns} turn{p.turns === 1 ? '' : 's'}</div>
                      </div>
                    );
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="turns"
                  stroke="currentColor"
                  className="text-violet-500"
                  strokeWidth={1.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="w-full h-full flex items-center justify-end text-[10px] text-zinc-300 dark:text-zinc-700 italic">
              not enough data
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

const Pill: React.FC<{ label: string; value: string; tone: keyof typeof TONE }> = ({ label, value, tone }) => (
  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] tabular-nums border ${
    tone === 'rose'    ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-200/60 dark:border-rose-500/30 text-rose-700 dark:text-rose-300' :
    tone === 'amber'   ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200/60 dark:border-amber-500/30 text-amber-700 dark:text-amber-300' :
    tone === 'emerald' ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200/60 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300' :
                         'bg-zinc-50 dark:bg-zinc-800 border-zinc-200/70 dark:border-zinc-700/70 text-zinc-600 dark:text-zinc-300'
  }`}>
    <span className="text-zinc-400 dark:text-zinc-500 font-medium uppercase tracking-wider text-[8.5px]">{label}</span>
    <span className="font-semibold">{value}</span>
  </span>
);
