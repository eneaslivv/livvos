/**
 * PartnerPayoutsCard — Dashboard card showing partner payouts per period.
 *
 * Surfaces the `partner_payouts` table introduced for LIVV Creative Studio.
 * Each row in the table is one (period × partner) combo; we group them
 * back into period sections in the UI so a quincena like "Apr P1" reads
 * as "Eneas $2,151.90 / Luis $795.10" side-by-side.
 *
 * The card auto-hides when the tenant has zero payout rows — keeps the
 * dashboard clean for tenants that don't run a partner-split model. For
 * tenants that do, the data refreshes via realtime when someone marks a
 * payout as paid (the table is on supabase_realtime publication).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Icons } from '../ui/Icons';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../context/TenantContext';
import { useIsDarkMode } from '../../hooks/useIsDarkMode';

interface PartnerPayoutRow {
  id: string;
  period_label: string;
  period_start: string;
  period_end: string;
  total_revenue: number;
  net_revenue: number;
  total_costs: number;
  marketing_comms: number;
  net_profit: number;
  distributable: number;
  partner_email: string;
  partner_name: string;
  share_pct: number;
  payout_amount: number;
  paid_amount: number;
  balance: number;
  notes: string | null;
}

interface PeriodGroup {
  label: string;
  start: string;
  end: string;
  net_profit: number;
  distributable: number;
  total_costs: number;
  partners: Array<{ name: string; share_pct: number; payout: number; paid: number; balance: number; notes: string | null }>;
  total_balance: number;
}

const fmt = (n: number) =>
  '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export const PartnerPayoutsCard: React.FC = () => {
  const { currentTenant } = useTenant();
  const isDark = useIsDarkMode();
  const [rows, setRows] = useState<PartnerPayoutRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);

  // Load payouts for the active tenant. Order by period_start DESC so the
  // most recent period is at the top — that's the one the user usually
  // wants to act on (mark as paid, adjust amount).
  const load = async () => {
    if (!currentTenant?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('partner_payouts')
        .select('*')
        .eq('tenant_id', currentTenant.id)
        .order('period_start', { ascending: false })
        .order('share_pct', { ascending: false });
      if (!error && data) setRows(data as PartnerPayoutRow[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentTenant?.id]);

  // Realtime: refresh when any partner_payouts row changes for this tenant.
  useEffect(() => {
    if (!currentTenant?.id) return;
    const channel = supabase
      .channel(`partner-payouts-${currentTenant.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'partner_payouts', filter: `tenant_id=eq.${currentTenant.id}` },
        () => { void load(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line
  }, [currentTenant?.id]);

  // Group flat rows back into one section per period. The sort above
  // already gives us most-recent-first + Eneas (higher %) before Luis.
  const periods = useMemo<PeriodGroup[]>(() => {
    const map = new Map<string, PeriodGroup>();
    for (const r of rows) {
      const key = r.period_label;
      const grp = map.get(key) || {
        label: r.period_label,
        start: r.period_start,
        end: r.period_end,
        net_profit: Number(r.net_profit),
        distributable: Number(r.distributable),
        total_costs: Number(r.total_costs),
        partners: [],
        total_balance: 0,
      };
      grp.partners.push({
        name: r.partner_name,
        share_pct: Number(r.share_pct),
        payout: Number(r.payout_amount),
        paid: Number(r.paid_amount),
        balance: Number(r.balance),
        notes: r.notes,
      });
      grp.total_balance += Number(r.balance);
      map.set(key, grp);
    }
    return Array.from(map.values());
  }, [rows]);

  // Mark a payout as fully paid — sets paid_amount = payout_amount.
  // Optimistic update with rollback on error.
  const markPaid = async (rowId: string, payoutAmount: number) => {
    setMarkingPaid(rowId);
    const before = rows;
    setRows(prev => prev.map(r => r.id === rowId
      ? { ...r, paid_amount: payoutAmount, balance: 0 }
      : r));
    try {
      const { error } = await supabase
        .from('partner_payouts')
        .update({ paid_amount: payoutAmount })
        .eq('id', rowId);
      if (error) throw error;
    } catch {
      setRows(before);
    } finally {
      setMarkingPaid(null);
    }
  };

  // Hide the whole card on tenants that don't use partner splits.
  if (!loading && rows.length === 0) return null;

  const totalDistributable = periods.reduce((s, p) => s + p.distributable, 0);
  const totalOutstanding = periods.reduce((s, p) => s + p.total_balance, 0);

  return (
    <div className={`rounded-2xl border ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'} p-5 mt-6`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400 mb-1">
            Partner Payouts
          </div>
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Profit distribution between partners
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Historical share split by period. {periods.length} period{periods.length === 1 ? '' : 's'} on file.
          </p>
        </div>
        <div className="flex items-center gap-3 text-right shrink-0">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-zinc-400">Distributed</div>
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">{fmt(totalDistributable)}</div>
          </div>
          {totalOutstanding > 0 && (
            <div>
              <div className="text-[9px] uppercase tracking-wider text-amber-500">Outstanding</div>
              <div className="text-sm font-semibold text-amber-600 dark:text-amber-400 tabular-nums">{fmt(totalOutstanding)}</div>
            </div>
          )}
        </div>
      </div>

      {/* Periods */}
      <div className="space-y-3">
        {periods.map((p) => (
          <div key={p.label} className={`rounded-xl border ${isDark ? 'bg-zinc-800/40 border-zinc-700/50' : 'bg-zinc-50 border-zinc-100'} p-4`}>
            {/* Period header */}
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  {p.label}
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5">
                  {p.start} → {p.end} · costs {fmt(p.total_costs)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[9px] uppercase tracking-wider text-zinc-400">Distributable</div>
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">{fmt(p.distributable)}</div>
              </div>
            </div>

            {/* Partners side-by-side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {p.partners.map((partner) => {
                const row = rows.find(r => r.period_label === p.label && r.partner_name === partner.name)!;
                const isFullyPaid = partner.balance <= 0;
                return (
                  <div key={partner.name} className={`rounded-lg p-3 ${
                    isDark ? 'bg-zinc-900/60 border border-zinc-800' : 'bg-white border border-zinc-200'
                  }`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{partner.name}</span>
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300">
                        {partner.share_pct.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">{fmt(partner.payout)}</span>
                      {isFullyPaid ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <Icons.Check size={11} /> paid
                        </span>
                      ) : (
                        <button
                          onClick={() => markPaid(row.id, partner.payout)}
                          disabled={markingPaid === row.id}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-80 disabled:opacity-50 transition-opacity"
                        >
                          {markingPaid === row.id ? 'Marking…' : 'Mark as paid'}
                        </button>
                      )}
                    </div>
                    {!isFullyPaid && (
                      <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                        Paid {fmt(partner.paid)} · balance {fmt(partner.balance)}
                      </div>
                    )}
                    {partner.notes && (
                      <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1 italic">
                        {partner.notes}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Helper hint */}
      <p className="text-[10px] text-zinc-400 mt-3">
        To add a new period: insert rows into <code className="font-mono">partner_payouts</code> directly,
        or ask the copilot "build this month's split" once the inline workflow is wired.
      </p>
    </div>
  );
};
