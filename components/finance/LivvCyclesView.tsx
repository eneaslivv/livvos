import React, { useState, useMemo } from 'react'
import { Plus, Calendar, Trash2, FileText, ChevronRight, TrendingUp, TrendingDown, Wallet, Users } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { useFinance, type PaymentCycle } from '../../context/FinanceContext'
import { LivvCycleEditor } from './LivvCycleEditor'

const fmtMoney = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

const fmtMoneyDec = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v)

const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`

const monthLabel = (iso: string) => {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

const todayMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// Stable color per partner name so chips stay consistent across cycles.
const PARTNER_COLORS = [
  { bg: 'bg-emerald-500', soft: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  { bg: 'bg-sky-500',     soft: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  { bg: 'bg-violet-500',  soft: 'bg-violet-500/15 text-violet-700 dark:text-violet-300' },
  { bg: 'bg-amber-500',   soft: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  { bg: 'bg-rose-500',    soft: 'bg-rose-500/15 text-rose-700 dark:text-rose-300' },
  { bg: 'bg-indigo-500',  soft: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300' },
]
const partnerColor = (name: string) => {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return PARTNER_COLORS[h % PARTNER_COLORS.length]
}
const initials = (name: string) =>
  name.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase()

interface NewCycleDraft {
  label: string
  period_month: string
  cycle_number: 1 | 2
  period_description: string
  processing_fee_rate: number
  marketing_budget: number
}

const EMPTY_NEW: NewCycleDraft = {
  label: '',
  period_month: todayMonth(),
  cycle_number: 1,
  period_description: '',
  processing_fee_rate: 0.047,
  marketing_budget: 0,
}

/**
 * Main LIVV cycles tab. Top KPI strip with YTD totals, then compact cycle
 * rows grouped by month with a visual cost/profit bar and partner chips.
 */
export const LivvCyclesView: React.FC = () => {
  const {
    paymentCycles, paymentCyclesLoading,
    createPaymentCycle, deletePaymentCycle,
    computeCycleSummary,
  } = useFinance()

  const [editingCycle, setEditingCycle] = useState<PaymentCycle | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<NewCycleDraft>(EMPTY_NEW)

  const grouped = useMemo(() => {
    const map = new Map<string, PaymentCycle[]>()
    for (const c of paymentCycles) {
      const list = map.get(c.period_month) || []
      list.push(c)
      map.set(c.period_month, list)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([k, list]) => ({
        period_month: k,
        cycles: list.slice().sort((a, b) => a.cycle_number - b.cycle_number),
      }))
  }, [paymentCycles])

  // YTD totals + per-partner totals across all cycles in the current calendar year.
  const totals = useMemo(() => {
    const year = new Date().getFullYear()
    let revenue = 0, profit = 0, costs = 0, marketing = 0, count = 0
    const partners = new Map<string, number>()
    for (const c of paymentCycles) {
      if (!c.period_month.startsWith(String(year))) continue
      const s = computeCycleSummary(c)
      revenue += s.totalRevenue
      profit  += s.netProfit
      costs   += s.totalCosts + s.processingFee
      marketing += Number(c.marketing_budget || 0)
      count += 1
      const utilidad = s.distributable
      for (const d of (c.distributions || [])) {
        const split = Number(d.split_percentage) / 100
        const entitled = utilidad * split + Number(d.prior_balance || 0)
        partners.set(d.partner_name, (partners.get(d.partner_name) || 0) + entitled)
      }
    }
    const margin = revenue > 0 ? profit / revenue : 0
    const partnerList = Array.from(partners.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
    return { revenue, profit, costs, marketing, margin, count, partners: partnerList }
  }, [paymentCycles, computeCycleSummary])

  const activeCycle = editingCycle
    ? paymentCycles.find(c => c.id === editingCycle.id) ?? editingCycle
    : null

  const onCreate = async () => {
    if (!draft.label.trim()) return
    const created = await createPaymentCycle({
      label: draft.label.trim(),
      period_month: draft.period_month,
      cycle_number: draft.cycle_number,
      period_description: draft.period_description,
      processing_fee_rate: draft.processing_fee_rate,
      marketing_budget: draft.marketing_budget,
    })
    setDraft(EMPTY_NEW)
    setCreating(false)
    if (created) setEditingCycle(created)
  }

  const onDelete = async (cycle: PaymentCycle) => {
    if (!confirm(`Delete cycle "${cycle.label}"? Revenue, costs, and distributions will be removed.`)) return
    await deletePaymentCycle(cycle.id)
  }

  return (
    <div className="space-y-5 animate-in slide-in-from-bottom-2 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <FileText size={16} className="text-emerald-500" />
            LIVV Payment Cycles
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Monthly payment cycles with revenue, tool costs, and partner distribution.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 rounded-md"
        >
          <Plus size={12} /> New cycle
        </button>
      </div>

      {/* YTD KPI strip */}
      {totals.count > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <KpiTile
            icon={<Wallet size={12} />}
            label="Revenue YTD"
            value={fmtMoney(totals.revenue)}
            sub={`${totals.count} cycle${totals.count === 1 ? '' : 's'}`}
          />
          <KpiTile
            icon={<TrendingUp size={12} />}
            label="Net Profit YTD"
            value={fmtMoney(totals.profit)}
            sub={fmtPct(totals.margin) + ' avg margin'}
            accent={totals.profit >= 0 ? 'emerald' : 'rose'}
          />
          <KpiTile
            icon={<TrendingDown size={12} />}
            label="Costs YTD"
            value={fmtMoney(totals.costs)}
            sub={totals.marketing > 0 ? `+ ${fmtMoney(totals.marketing)} marketing` : 'tools + fees'}
          />
          <KpiTile
            icon={<Users size={12} />}
            label="Distributed"
            value={
              <div className="flex items-center gap-2 flex-wrap">
                {totals.partners.length === 0 && (
                  <span className="text-sm text-zinc-400">—</span>
                )}
                {totals.partners.map(p => {
                  const c = partnerColor(p.name)
                  return (
                    <span key={p.name} className="flex items-center gap-1.5">
                      <span className={`w-5 h-5 rounded-full ${c.bg} text-white text-[9px] font-bold flex items-center justify-center`}>
                        {initials(p.name)}
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">{fmtMoney(p.amount)}</span>
                    </span>
                  )
                })}
              </div>
            }
            sub={`${totals.partners.length} partner${totals.partners.length === 1 ? '' : 's'}`}
          />
        </div>
      )}

      {paymentCyclesLoading && grouped.length === 0 && (
        <div className="p-6 text-center text-xs text-zinc-400">Loading cycles...</div>
      )}

      {!paymentCyclesLoading && grouped.length === 0 && (
        <div className="p-12 text-center bg-white dark:bg-zinc-900/60 border border-dashed border-zinc-200 dark:border-zinc-700 rounded-xl">
          <Calendar size={28} className="mx-auto text-zinc-300 dark:text-zinc-600" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-3">No payment cycles yet.</p>
          <p className="text-[11px] text-zinc-400 mt-1">Create a cycle (e.g. "1er pago Febrero") to start tracking.</p>
        </div>
      )}

      {/* Month groups */}
      <div className="space-y-5">
        {grouped.map(group => {
          const monthRevenue = group.cycles.reduce((s, c) => s + computeCycleSummary(c).totalRevenue, 0)
          const monthProfit  = group.cycles.reduce((s, c) => s + computeCycleSummary(c).netProfit, 0)
          return (
            <div key={group.period_month}>
              <div className="flex items-baseline justify-between px-1 mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  {monthLabel(group.period_month)}
                </h3>
                {monthRevenue > 0 && (
                  <span className="text-[11px] text-zinc-400 tabular-nums">
                    {fmtMoney(monthRevenue)} rev · <span className="text-emerald-600 dark:text-emerald-400 font-medium">{fmtMoney(monthProfit)} net</span>
                  </span>
                )}
              </div>

              <div className="bg-white dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {group.cycles.map(cycle => {
                  const s = computeCycleSummary(cycle)
                  const utilidad = s.distributable
                  const totalDeductions = s.totalCosts + s.processingFee + Number(cycle.marketing_budget || 0)
                  const denom = Math.max(s.totalRevenue, 1)
                  const costPct = Math.min(100, (totalDeductions / denom) * 100)
                  const profitPct = Math.max(0, 100 - costPct)
                  const isEmpty = s.totalRevenue === 0 && s.totalCosts === 0
                  const isDraft = cycle.status !== 'closed'

                  return (
                    <button
                      key={cycle.id}
                      onClick={() => setEditingCycle(cycle)}
                      className={`w-full text-left px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition group ${isEmpty ? 'opacity-60' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Status dot */}
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            isDraft ? 'bg-amber-400' : 'bg-emerald-500'
                          }`}
                          title={cycle.status}
                        />

                        {/* Label + period */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                              {cycle.label}
                            </h4>
                            <span className="text-[10px] uppercase tracking-wider text-zinc-400 shrink-0">
                              c{cycle.cycle_number}
                            </span>
                            {isDraft && (
                              <span className="text-[9px] uppercase font-semibold text-amber-600 dark:text-amber-400 shrink-0">
                                draft
                              </span>
                            )}
                          </div>
                          {cycle.period_description && (
                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                              {cycle.period_description}
                            </p>
                          )}
                        </div>

                        {/* Inline metrics */}
                        <div className="hidden sm:flex items-center gap-5 shrink-0 tabular-nums">
                          <div className="text-right">
                            <p className="text-[9px] uppercase tracking-wider text-zinc-400">Revenue</p>
                            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{fmtMoney(s.totalRevenue)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[9px] uppercase tracking-wider text-zinc-400">Net</p>
                            <p className={`text-sm font-semibold ${s.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                              {fmtMoney(s.netProfit)}
                            </p>
                          </div>
                          <div className="text-right w-12">
                            <p className="text-[9px] uppercase tracking-wider text-zinc-400">Margin</p>
                            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{fmtPct(s.profitMargin)}</p>
                          </div>
                        </div>

                        {/* Partner chips */}
                        {(cycle.distributions || []).length > 0 && !isEmpty && (
                          <div className="hidden md:flex items-center -space-x-1 shrink-0">
                            {(cycle.distributions || []).map(d => {
                              const c = partnerColor(d.partner_name)
                              const splitPct = Number(d.split_percentage) / 100
                              const entitled = utilidad * splitPct + Number(d.prior_balance || 0)
                              return (
                                <span
                                  key={d.id}
                                  title={`${d.partner_name}: ${fmtMoneyDec(entitled)} (${Number(d.split_percentage).toFixed(1)}%)`}
                                  className={`w-6 h-6 rounded-full ${c.bg} text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-zinc-900`}
                                >
                                  {initials(d.partner_name)}
                                </span>
                              )
                            })}
                          </div>
                        )}

                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); onDelete(cycle) }}
                            className="p-1 text-zinc-300 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded opacity-0 group-hover:opacity-100 transition"
                          >
                            <Trash2 size={12} />
                          </button>
                          <ChevronRight size={14} className="text-zinc-300 group-hover:text-zinc-500" />
                        </div>
                      </div>

                      {/* Mobile metrics row */}
                      <div className="sm:hidden flex items-center gap-3 mt-2 tabular-nums text-xs">
                        <span className="text-zinc-500">{fmtMoney(s.totalRevenue)}</span>
                        <span className="text-zinc-300">→</span>
                        <span className={`font-semibold ${s.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {fmtMoney(s.netProfit)}
                        </span>
                        <span className="text-zinc-400">({fmtPct(s.profitMargin)})</span>
                      </div>

                      {/* Cost / profit bar */}
                      {!isEmpty && (
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden flex">
                            <div className="h-full bg-zinc-300 dark:bg-zinc-700" style={{ width: `${costPct}%` }} title={`Costs: ${fmtMoney(totalDeductions)}`} />
                            <div className={`h-full ${s.netProfit >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${profitPct}%` }} title={`Net: ${fmtMoney(s.netProfit)}`} />
                          </div>
                          {(cycle.distributions || []).length > 0 && (
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-zinc-500 dark:text-zinc-400 shrink-0">
                              {(cycle.distributions || []).map(d => {
                                const c = partnerColor(d.partner_name)
                                const splitPct = Number(d.split_percentage) / 100
                                const entitled = utilidad * splitPct + Number(d.prior_balance || 0)
                                return (
                                  <span key={d.id} className={`px-1.5 py-0.5 rounded-full ${c.soft} font-medium tabular-nums`}>
                                    {d.partner_name.split(' ')[0]} {fmtMoneyDec(entitled)}
                                  </span>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Create modal */}
      <Modal isOpen={creating} onClose={() => setCreating(false)} title="New payment cycle" size="md">
        <div className="space-y-3 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-zinc-500">Label</span>
            <input autoFocus placeholder="1er pago Febrero" value={draft.label} onChange={e => setDraft(d => ({ ...d, label: e.target.value }))} className="px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-zinc-500">Month</span>
              <input type="month" value={draft.period_month.slice(0, 7)} onChange={e => setDraft(d => ({ ...d, period_month: `${e.target.value}-01` }))} className="px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-zinc-500">Cycle number</span>
              <select value={draft.cycle_number} onChange={e => setDraft(d => ({ ...d, cycle_number: Number(e.target.value) as 1 | 2 }))} className="px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded">
                <option value={1}>1 — first payment</option>
                <option value={2}>2 — second payment</option>
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-zinc-500">Period description</span>
            <input placeholder='Period: Amount up to April 6' value={draft.period_description} onChange={e => setDraft(d => ({ ...d, period_description: e.target.value }))} className="px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-zinc-500">Processing fee rate</span>
              <input type="number" step="0.001" value={draft.processing_fee_rate} onChange={e => setDraft(d => ({ ...d, processing_fee_rate: Number(e.target.value) }))} className="px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-zinc-500">Marketing & Comms</span>
              <input type="number" step="0.01" value={draft.marketing_budget} onChange={e => setDraft(d => ({ ...d, marketing_budget: Number(e.target.value) }))} className="px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded" />
            </label>
          </div>
          <div className="flex items-center gap-2 justify-end pt-2">
            <button onClick={() => { setCreating(false); setDraft(EMPTY_NEW) }} className="px-3 py-1.5 text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded">Cancel</button>
            <button onClick={onCreate} className="px-3 py-1.5 text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded">Create cycle</button>
          </div>
        </div>
      </Modal>

      {activeCycle && (
        <LivvCycleEditor
          cycle={activeCycle}
          isOpen={!!activeCycle}
          onClose={() => setEditingCycle(null)}
        />
      )}
    </div>
  )
}

interface KpiTileProps {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  sub?: string
  accent?: 'emerald' | 'rose'
}

const KpiTile: React.FC<KpiTileProps> = ({ icon, label, value, sub, accent }) => {
  const valueColor =
    accent === 'emerald' ? 'text-emerald-600 dark:text-emerald-400'
    : accent === 'rose'  ? 'text-rose-600 dark:text-rose-400'
    : 'text-zinc-900 dark:text-zinc-100'
  return (
    <div className="px-3 py-2.5 bg-white dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800 rounded-xl">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        <span className="text-zinc-400">{icon}</span>
        <span>{label}</span>
      </div>
      <div className={`mt-1 text-base font-semibold tabular-nums ${valueColor}`}>{value}</div>
      {sub && <div className="text-[10px] text-zinc-400 mt-0.5 tabular-nums">{sub}</div>}
    </div>
  )
}
