import React, { useState, useMemo } from 'react'
import { Plus, Calendar, Trash2, FileText, ChevronRight } from 'lucide-react'
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
 * Main LIVV cycles tab. Lists all monthly payment cycles with a P&L summary
 * card per cycle. Click a card to open the editor (LivvCycleEditor).
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

  // Group by year-month for "Abril → Cycle 1, Cycle 2" rendering.
  const grouped = useMemo(() => {
    const map = new Map<string, PaymentCycle[]>()
    for (const c of paymentCycles) {
      const key = c.period_month
      const list = map.get(key) || []
      list.push(c)
      map.set(key, list)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([k, list]) => ({
        period_month: k,
        cycles: list.slice().sort((a, b) => a.cycle_number - b.cycle_number),
      }))
  }, [paymentCycles])

  // Use the most recent cycle as the "active editor target" so users can keep
  // the modal in sync if data refreshes from realtime.
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
    <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-500">
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

      <div className="space-y-4">
        {grouped.map(group => (
          <div key={group.period_month}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2 px-1">
              {monthLabel(group.period_month)}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {group.cycles.map(cycle => {
                const s = computeCycleSummary(cycle)
                const utilidad = s.distributable
                return (
                  <button
                    key={cycle.id}
                    onClick={() => setEditingCycle(cycle)}
                    className="text-left p-4 bg-white dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800 hover:border-zinc-200 dark:hover:border-zinc-700 hover:shadow-sm rounded-xl transition group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{cycle.label}</h4>
                          <span className="text-[10px] uppercase tracking-wider text-zinc-400">cycle {cycle.cycle_number}</span>
                          <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase ${cycle.status === 'closed' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400'}`}>
                            {cycle.status}
                          </span>
                        </div>
                        {cycle.period_description && (
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">{cycle.period_description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5">
                        <button onClick={(e) => { e.stopPropagation(); onDelete(cycle) }} className="p-1 text-zinc-300 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded">
                          <Trash2 size={12} />
                        </button>
                        <ChevronRight size={14} className="text-zinc-300 group-hover:text-zinc-500" />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-3">
                      <div>
                        <p className="text-[9px] uppercase tracking-wider text-zinc-400">Revenue</p>
                        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 tabular-nums">{fmtMoney(s.totalRevenue)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase tracking-wider text-zinc-400">Net Profit</p>
                        <p className={`text-sm font-semibold tabular-nums ${s.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {fmtMoney(s.netProfit)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase tracking-wider text-zinc-400">Margin</p>
                        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 tabular-nums">{fmtPct(s.profitMargin)}</p>
                      </div>
                    </div>

                    {(cycle.distributions || []).length > 0 && (
                      <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/60">
                        <p className="text-[9px] uppercase tracking-wider text-zinc-400 mb-1.5">Distribution · {fmtMoneyDec(utilidad)}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {(cycle.distributions || []).map(d => {
                            const splitPct = Number(d.split_percentage) / 100
                            const entitled = utilidad * splitPct + Number(d.prior_balance || 0)
                            return (
                              <div key={d.id} className="flex items-center gap-1.5 text-[11px]">
                                <span className="text-zinc-500 dark:text-zinc-400">{d.partner_name}:</span>
                                <span className="font-medium text-zinc-700 dark:text-zinc-200 tabular-nums">{fmtMoneyDec(entitled)}</span>
                                <span className="text-zinc-400">({Number(d.split_percentage).toFixed(1)}%)</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
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

      {/* Editor modal */}
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
