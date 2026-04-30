import React, { useState } from 'react'
import { Plus, Trash2, Pencil, Check, X, Calendar, Settings2, Link2 } from 'lucide-react'
import { Modal } from '../ui/Modal'
import {
  useFinance,
  type PaymentCycle,
  type CycleRevenue,
  type CycleCost,
  type CycleDistribution,
} from '../../context/FinanceContext'
import { useClients } from '../../context/ClientsContext'

const fmtMoney = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

const fmtMoneyDec = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v)

const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`

interface Props {
  cycle: PaymentCycle
  isOpen: boolean
  onClose: () => void
}

/**
 * Edit a payment cycle in spreadsheet style: revenue lines, cost lines,
 * distribution lines. Net Revenue / Net Profit / Profit Margin / TO ENEAS
 * / TO LUIS auto-compute via FinanceContext.computeCycleSummary.
 */
export const LivvCycleEditor: React.FC<Props> = ({ cycle, isOpen, onClose }) => {
  const {
    computeCycleSummary,
    updatePaymentCycle,
    createCycleRevenue, updateCycleRevenue, deleteCycleRevenue,
    createCycleCost, updateCycleCost, deleteCycleCost,
    createCycleDistribution, updateCycleDistribution, deleteCycleDistribution,
    partners,
  } = useFinance()
  const { clients } = useClients()

  const summary = computeCycleSummary(cycle)
  const utilidad = summary.distributable

  // Cycle settings draft
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsDraft, setSettingsDraft] = useState({
    label: cycle.label,
    period_description: cycle.period_description,
    processing_fee_rate: cycle.processing_fee_rate,
    marketing_budget: cycle.marketing_budget,
    prior_balance_eneas: cycle.prior_balance_eneas,
    status: cycle.status,
  })

  const onSaveSettings = async () => {
    await updatePaymentCycle(cycle.id, settingsDraft)
    setSettingsOpen(false)
  }

  // ─── Revenues ────────────────────────────────────────────
  const [revAdding, setRevAdding] = useState(false)
  const [revDraft, setRevDraft] = useState<{ client_name: string; client_id: string | null; amount: number; notes: string }>({
    client_name: '', client_id: null, amount: 0, notes: '',
  })
  const [revEditId, setRevEditId] = useState<string | null>(null)
  const [revEditDraft, setRevEditDraft] = useState<Partial<CycleRevenue>>({})

  const onAddRev = async () => {
    if (!revDraft.client_name.trim()) return
    await createCycleRevenue({
      cycle_id: cycle.id,
      client_id: revDraft.client_id,
      client_name: revDraft.client_name.trim(),
      amount: Number(revDraft.amount) || 0,
      notes: revDraft.notes,
      sort_order: (cycle.revenues || []).length,
    })
    setRevDraft({ client_name: '', client_id: null, amount: 0, notes: '' })
    setRevAdding(false)
  }

  // ─── Costs ───────────────────────────────────────────────
  const [costAdding, setCostAdding] = useState(false)
  const [costDraft, setCostDraft] = useState({ tool_name: '', cost: 0, notes: '', externally_covered: false })
  const [costEditId, setCostEditId] = useState<string | null>(null)
  const [costEditDraft, setCostEditDraft] = useState<Partial<CycleCost>>({})

  const onAddCost = async () => {
    if (!costDraft.tool_name.trim()) return
    await createCycleCost({
      cycle_id: cycle.id,
      tool_name: costDraft.tool_name.trim(),
      cost: Number(costDraft.cost) || 0,
      notes: costDraft.notes,
      externally_covered: costDraft.externally_covered,
      sort_order: (cycle.costs || []).length,
    })
    setCostDraft({ tool_name: '', cost: 0, notes: '', externally_covered: false })
    setCostAdding(false)
  }

  // ─── Distributions ───────────────────────────────────────
  const [distAdding, setDistAdding] = useState(false)
  const [distDraft, setDistDraft] = useState({ partner_id: '', partner_name: '', split_percentage: 0, sent_amount: 0, prior_balance: 0 })
  const [distEditId, setDistEditId] = useState<string | null>(null)
  const [distEditDraft, setDistEditDraft] = useState<Partial<CycleDistribution>>({})

  const onAddDist = async () => {
    if (!distDraft.partner_name.trim()) return
    await createCycleDistribution({
      cycle_id: cycle.id,
      partner_id: distDraft.partner_id || null,
      partner_name: distDraft.partner_name.trim(),
      split_percentage: Number(distDraft.split_percentage) || 0,
      sent_amount: Number(distDraft.sent_amount) || 0,
      prior_balance: Number(distDraft.prior_balance) || 0,
      sort_order: (cycle.distributions || []).length,
    })
    setDistDraft({ partner_id: '', partner_name: '', split_percentage: 0, sent_amount: 0, prior_balance: 0 })
    setDistAdding(false)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={cycle.label} size="4xl">
      <div className="space-y-5 max-h-[80vh] overflow-y-auto pr-1">

        {/* Header ── period + settings ───────────────────────── */}
        <div className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-lg">
          <div className="flex items-center gap-3">
            <Calendar size={14} className="text-zinc-400" />
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{cycle.period_description || `Cycle ${cycle.cycle_number}`}</p>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Fee: {(Number(cycle.processing_fee_rate) * 100).toFixed(2)}%
                {Number(cycle.marketing_budget) > 0 && ` · Marketing: ${fmtMoney(Number(cycle.marketing_budget))}`}
                {Number(cycle.prior_balance_eneas) !== 0 && ` · Saldo Eneas: ${fmtMoney(Number(cycle.prior_balance_eneas))}`}
                <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase ${cycle.status === 'closed' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400'}`}>
                  {cycle.status}
                </span>
              </p>
            </div>
          </div>
          <button onClick={() => setSettingsOpen(s => !s)} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md">
            <Settings2 size={12} /> Settings
          </button>
        </div>

        {settingsOpen && (
          <div className="p-3 bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-700 rounded-lg grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <label className="flex flex-col gap-1">
              <span className="text-zinc-500">Label</span>
              <input value={settingsDraft.label} onChange={e => setSettingsDraft(d => ({ ...d, label: e.target.value }))} className="px-2 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-zinc-500">Period description</span>
              <input value={settingsDraft.period_description} onChange={e => setSettingsDraft(d => ({ ...d, period_description: e.target.value }))} className="px-2 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-zinc-500">Processing fee rate (0–1)</span>
              <input type="number" step="0.001" value={settingsDraft.processing_fee_rate} onChange={e => setSettingsDraft(d => ({ ...d, processing_fee_rate: Number(e.target.value) }))} className="px-2 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-zinc-500">Marketing & Comms budget</span>
              <input type="number" step="0.01" value={settingsDraft.marketing_budget} onChange={e => setSettingsDraft(d => ({ ...d, marketing_budget: Number(e.target.value) }))} className="px-2 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-zinc-500">Saldo a favor de Eneas</span>
              <input type="number" step="0.01" value={settingsDraft.prior_balance_eneas} onChange={e => setSettingsDraft(d => ({ ...d, prior_balance_eneas: Number(e.target.value) }))} className="px-2 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-zinc-500">Status</span>
              <select value={settingsDraft.status} onChange={e => setSettingsDraft(d => ({ ...d, status: e.target.value as 'draft' | 'closed' }))} className="px-2 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded">
                <option value="draft">Draft</option>
                <option value="closed">Closed</option>
              </select>
            </label>
            <div className="md:col-span-2 flex items-center gap-2 justify-end">
              <button onClick={() => setSettingsOpen(false)} className="px-3 py-1.5 text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded">Cancel</button>
              <button onClick={onSaveSettings} className="px-3 py-1.5 text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded">Save</button>
            </div>
          </div>
        )}

        {/* REVENUE ────────────────────────────────────────────── */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Revenue</h3>
            {!revAdding && (
              <button onClick={() => setRevAdding(true)} className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded">
                <Plus size={11} /> Client
              </button>
            )}
          </div>
          <div className="bg-white dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="text-left px-3 py-1.5 font-medium">Client</th>
                  <th className="text-right px-3 py-1.5 font-medium">Amount</th>
                  <th className="text-left px-3 py-1.5 font-medium">Notes</th>
                  <th className="px-3 py-1.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {(cycle.revenues || []).map(r => {
                  const isEdit = revEditId === r.id
                  return (
                    <tr key={r.id}>
                      {isEdit ? (
                        <>
                          <td className="px-3 py-1.5"><input value={revEditDraft.client_name ?? r.client_name} onChange={e => setRevEditDraft(d => ({ ...d, client_name: e.target.value }))} className="w-full px-2 py-1 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded" /></td>
                          <td className="px-3 py-1.5"><input type="number" step="0.01" value={Number(revEditDraft.amount ?? r.amount)} onChange={e => setRevEditDraft(d => ({ ...d, amount: Number(e.target.value) }))} className="w-full px-2 py-1 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-right" /></td>
                          <td className="px-3 py-1.5"><input value={revEditDraft.notes ?? r.notes} onChange={e => setRevEditDraft(d => ({ ...d, notes: e.target.value }))} className="w-full px-2 py-1 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded" /></td>
                          <td className="px-3 py-1.5 flex items-center gap-1 justify-end">
                            <button onClick={async () => { await updateCycleRevenue(r.id, revEditDraft); setRevEditId(null); setRevEditDraft({}) }} className="p-0.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded"><Check size={12} /></button>
                            <button onClick={() => { setRevEditId(null); setRevEditDraft({}) }} className="p-0.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"><X size={12} /></button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-1.5 font-medium text-zinc-800 dark:text-zinc-100">
                            <span className="inline-flex items-center gap-1.5">
                              {r.client_name}
                              {r.client_id && <Link2 size={10} className="text-emerald-500" />}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-zinc-700 dark:text-zinc-200">{fmtMoneyDec(Number(r.amount))}</td>
                          <td className="px-3 py-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">{r.notes}</td>
                          <td className="px-3 py-1.5 flex items-center gap-1 justify-end">
                            <button onClick={() => { setRevEditId(r.id); setRevEditDraft({ client_name: r.client_name, amount: r.amount, notes: r.notes }) }} className="p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"><Pencil size={11} /></button>
                            <button onClick={() => deleteCycleRevenue(r.id)} className="p-0.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded"><Trash2 size={11} /></button>
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
                {revAdding && (
                  <tr className="bg-zinc-50/40 dark:bg-zinc-800/20">
                    <td className="px-3 py-1.5">
                      <input
                        autoFocus
                        list="livv-cycle-rev-clients"
                        placeholder="Client (autocompleta)"
                        value={revDraft.client_name}
                        onChange={e => {
                          const name = e.target.value
                          const match = clients.find(c => c.name.toLowerCase().trim() === name.toLowerCase().trim())
                          setRevDraft(d => ({ ...d, client_name: name, client_id: match?.id ?? null }))
                        }}
                        className="w-full px-2 py-1 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded"
                      />
                      <datalist id="livv-cycle-rev-clients">
                        {clients.map(c => <option key={c.id} value={c.name} />)}
                      </datalist>
                    </td>
                    <td className="px-3 py-1.5"><input type="number" step="0.01" placeholder="0" value={revDraft.amount || ''} onChange={e => setRevDraft(d => ({ ...d, amount: Number(e.target.value) }))} className="w-full px-2 py-1 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-right" /></td>
                    <td className="px-3 py-1.5"><input placeholder="Notes" value={revDraft.notes} onChange={e => setRevDraft(d => ({ ...d, notes: e.target.value }))} className="w-full px-2 py-1 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded" /></td>
                    <td className="px-3 py-1.5 flex items-center gap-1 justify-end">
                      <button onClick={onAddRev} className="p-0.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded"><Check size={12} /></button>
                      <button onClick={() => { setRevAdding(false); setRevDraft({ client_name: '', client_id: null, amount: 0, notes: '' }) }} className="p-0.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"><X size={12} /></button>
                    </td>
                  </tr>
                )}
                <tr className="bg-zinc-50 dark:bg-zinc-800/30 font-semibold text-zinc-800 dark:text-zinc-100">
                  <td className="px-3 py-1.5 text-[11px] uppercase tracking-wider">Total Revenue</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoneyDec(summary.totalRevenue)}</td>
                  <td colSpan={2} />
                </tr>
                <tr className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  <td className="px-3 py-1 italic">
                    Net Revenue (after {(Number(cycle.processing_fee_rate) * 100).toFixed(2)}% fee)
                  </td>
                  <td className="px-3 py-1 text-right tabular-nums">{fmtMoneyDec(summary.netRevenue)}</td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* COSTS ───────────────────────────────────────────────── */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Tools / Services</h3>
            {!costAdding && (
              <button onClick={() => setCostAdding(true)} className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded">
                <Plus size={11} /> Tool
              </button>
            )}
          </div>
          <div className="bg-white dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="text-left px-3 py-1.5 font-medium">Tool / Service</th>
                  <th className="text-right px-3 py-1.5 font-medium">Cost</th>
                  <th className="text-left px-3 py-1.5 font-medium">Notes</th>
                  <th className="text-center px-3 py-1.5 font-medium">External</th>
                  <th className="px-3 py-1.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {(cycle.costs || []).map(c => {
                  const isEdit = costEditId === c.id
                  return (
                    <tr key={c.id}>
                      {isEdit ? (
                        <>
                          <td className="px-3 py-1.5"><input value={costEditDraft.tool_name ?? c.tool_name} onChange={e => setCostEditDraft(d => ({ ...d, tool_name: e.target.value }))} className="w-full px-2 py-1 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded" /></td>
                          <td className="px-3 py-1.5"><input type="number" step="0.01" value={Number(costEditDraft.cost ?? c.cost)} onChange={e => setCostEditDraft(d => ({ ...d, cost: Number(e.target.value) }))} className="w-full px-2 py-1 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-right" /></td>
                          <td className="px-3 py-1.5"><input value={costEditDraft.notes ?? c.notes} onChange={e => setCostEditDraft(d => ({ ...d, notes: e.target.value }))} className="w-full px-2 py-1 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded" /></td>
                          <td className="px-3 py-1.5 text-center"><input type="checkbox" checked={costEditDraft.externally_covered ?? c.externally_covered} onChange={e => setCostEditDraft(d => ({ ...d, externally_covered: e.target.checked }))} /></td>
                          <td className="px-3 py-1.5 flex items-center gap-1 justify-end">
                            <button onClick={async () => { await updateCycleCost(c.id, costEditDraft); setCostEditId(null); setCostEditDraft({}) }} className="p-0.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded"><Check size={12} /></button>
                            <button onClick={() => { setCostEditId(null); setCostEditDraft({}) }} className="p-0.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"><X size={12} /></button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-1.5 font-medium text-zinc-800 dark:text-zinc-100">{c.tool_name}</td>
                          <td className={`px-3 py-1.5 text-right tabular-nums ${Number(c.cost) < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-700 dark:text-zinc-200'}`}>
                            {fmtMoneyDec(Number(c.cost))}
                          </td>
                          <td className="px-3 py-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">{c.notes}</td>
                          <td className="px-3 py-1.5 text-center">
                            {c.externally_covered && <span className="text-[10px] uppercase tracking-wider text-violet-600 dark:text-violet-400">Yes</span>}
                          </td>
                          <td className="px-3 py-1.5 flex items-center gap-1 justify-end">
                            <button onClick={() => { setCostEditId(c.id); setCostEditDraft({ tool_name: c.tool_name, cost: c.cost, notes: c.notes, externally_covered: c.externally_covered }) }} className="p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"><Pencil size={11} /></button>
                            <button onClick={() => deleteCycleCost(c.id)} className="p-0.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded"><Trash2 size={11} /></button>
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
                {costAdding && (
                  <tr className="bg-zinc-50/40 dark:bg-zinc-800/20">
                    <td className="px-3 py-1.5"><input autoFocus placeholder="Tool name" value={costDraft.tool_name} onChange={e => setCostDraft(d => ({ ...d, tool_name: e.target.value }))} className="w-full px-2 py-1 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded" /></td>
                    <td className="px-3 py-1.5"><input type="number" step="0.01" placeholder="0" value={costDraft.cost || ''} onChange={e => setCostDraft(d => ({ ...d, cost: Number(e.target.value) }))} className="w-full px-2 py-1 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-right" /></td>
                    <td className="px-3 py-1.5"><input placeholder="Notes" value={costDraft.notes} onChange={e => setCostDraft(d => ({ ...d, notes: e.target.value }))} className="w-full px-2 py-1 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded" /></td>
                    <td className="px-3 py-1.5 text-center"><input type="checkbox" checked={costDraft.externally_covered} onChange={e => setCostDraft(d => ({ ...d, externally_covered: e.target.checked }))} /></td>
                    <td className="px-3 py-1.5 flex items-center gap-1 justify-end">
                      <button onClick={onAddCost} className="p-0.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded"><Check size={12} /></button>
                      <button onClick={() => { setCostAdding(false); setCostDraft({ tool_name: '', cost: 0, notes: '', externally_covered: false }) }} className="p-0.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"><X size={12} /></button>
                    </td>
                  </tr>
                )}
                <tr className="bg-zinc-50 dark:bg-zinc-800/30 font-semibold text-zinc-800 dark:text-zinc-100">
                  <td className="px-3 py-1.5 text-[11px] uppercase tracking-wider">Total Costs</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoneyDec(summary.totalCosts)}</td>
                  <td colSpan={3} />
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* P&L ─────────────────────────────────────────────────── */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-lg">
            <p className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-medium">Net Profit</p>
            <p className="text-lg font-semibold text-emerald-900 dark:text-emerald-300 mt-0.5 tabular-nums">{fmtMoneyDec(summary.netProfit)}</p>
          </div>
          <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 rounded-lg">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Profit Margin</p>
            <p className="text-lg font-semibold text-zinc-800 dark:text-zinc-100 mt-0.5 tabular-nums">{fmtPct(summary.profitMargin)}</p>
          </div>
          <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 rounded-lg">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Marketing & Comms</p>
            <p className="text-lg font-semibold text-zinc-800 dark:text-zinc-100 mt-0.5 tabular-nums">{fmtMoneyDec(Number(cycle.marketing_budget))}</p>
          </div>
          <div className="p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 rounded-lg">
            <p className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400 font-medium">Utilidad a distribuir</p>
            <p className="text-lg font-semibold text-amber-900 dark:text-amber-300 mt-0.5 tabular-nums">{fmtMoneyDec(utilidad)}</p>
          </div>
        </section>

        {/* DISTRIBUTIONS ──────────────────────────────────────── */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Distribution</h3>
            {!distAdding && (
              <button onClick={() => setDistAdding(true)} className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded">
                <Plus size={11} /> Partner
              </button>
            )}
          </div>
          <div className="bg-white dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="text-left px-3 py-1.5 font-medium">Partner</th>
                  <th className="text-right px-3 py-1.5 font-medium">Split %</th>
                  <th className="text-right px-3 py-1.5 font-medium">Entitled</th>
                  <th className="text-right px-3 py-1.5 font-medium">Sent</th>
                  <th className="text-right px-3 py-1.5 font-medium">Pending</th>
                  <th className="px-3 py-1.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {(cycle.distributions || []).map(d => {
                  const splitPct = Number(d.split_percentage) / 100
                  const entitled = utilidad * splitPct + Number(d.prior_balance || 0)
                  const pending = entitled - Number(d.sent_amount || 0)
                  const isEdit = distEditId === d.id
                  return (
                    <tr key={d.id}>
                      {isEdit ? (
                        <>
                          <td className="px-3 py-1.5"><input value={distEditDraft.partner_name ?? d.partner_name} onChange={e => setDistEditDraft(x => ({ ...x, partner_name: e.target.value }))} className="w-full px-2 py-1 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded" /></td>
                          <td className="px-3 py-1.5"><input type="number" step="0.01" value={Number(distEditDraft.split_percentage ?? d.split_percentage)} onChange={e => setDistEditDraft(x => ({ ...x, split_percentage: Number(e.target.value) }))} className="w-full px-2 py-1 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-right" /></td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-zinc-400">—</td>
                          <td className="px-3 py-1.5"><input type="number" step="0.01" value={Number(distEditDraft.sent_amount ?? d.sent_amount)} onChange={e => setDistEditDraft(x => ({ ...x, sent_amount: Number(e.target.value) }))} className="w-full px-2 py-1 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-right" /></td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-zinc-400">—</td>
                          <td className="px-3 py-1.5 flex items-center gap-1 justify-end">
                            <button onClick={async () => { await updateCycleDistribution(d.id, distEditDraft); setDistEditId(null); setDistEditDraft({}) }} className="p-0.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded"><Check size={12} /></button>
                            <button onClick={() => { setDistEditId(null); setDistEditDraft({}) }} className="p-0.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"><X size={12} /></button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-1.5 font-medium text-zinc-800 dark:text-zinc-100">
                            {d.partner_name}
                            {Number(d.prior_balance || 0) !== 0 && (
                              <span className="ml-2 text-[10px] text-zinc-400">(prior {fmtMoneyDec(Number(d.prior_balance))})</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-zinc-700 dark:text-zinc-200">{Number(d.split_percentage).toFixed(2)}%</td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-amber-700 dark:text-amber-400">{fmtMoneyDec(entitled)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-zinc-700 dark:text-zinc-200">{fmtMoneyDec(Number(d.sent_amount))}</td>
                          <td className={`px-3 py-1.5 text-right tabular-nums font-medium ${pending > 0.005 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{fmtMoneyDec(pending)}</td>
                          <td className="px-3 py-1.5 flex items-center gap-1 justify-end">
                            <button onClick={() => { setDistEditId(d.id); setDistEditDraft({ partner_name: d.partner_name, split_percentage: d.split_percentage, sent_amount: d.sent_amount, prior_balance: d.prior_balance }) }} className="p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"><Pencil size={11} /></button>
                            <button onClick={() => deleteCycleDistribution(d.id)} className="p-0.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded"><Trash2 size={11} /></button>
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
                {distAdding && (
                  <tr className="bg-zinc-50/40 dark:bg-zinc-800/20">
                    <td className="px-3 py-1.5">
                      <select value={distDraft.partner_id} onChange={e => {
                        const p = partners.find(x => x.id === e.target.value)
                        setDistDraft(d => ({ ...d, partner_id: e.target.value, partner_name: p?.name ?? d.partner_name, split_percentage: p?.default_split_percentage ?? d.split_percentage }))
                      }} className="w-full px-2 py-1 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded">
                        <option value="">Custom name…</option>
                        {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-1.5"><input type="number" step="0.01" placeholder="%" value={distDraft.split_percentage || ''} onChange={e => setDistDraft(d => ({ ...d, split_percentage: Number(e.target.value) }))} className="w-full px-2 py-1 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-right" /></td>
                    <td className="px-3 py-1.5"><input placeholder="Name (if custom)" value={distDraft.partner_name} onChange={e => setDistDraft(d => ({ ...d, partner_name: e.target.value }))} className="w-full px-2 py-1 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded" /></td>
                    <td className="px-3 py-1.5"><input type="number" step="0.01" placeholder="Sent" value={distDraft.sent_amount || ''} onChange={e => setDistDraft(d => ({ ...d, sent_amount: Number(e.target.value) }))} className="w-full px-2 py-1 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-right" /></td>
                    <td className="px-3 py-1.5"><input type="number" step="0.01" placeholder="Prior" value={distDraft.prior_balance || ''} onChange={e => setDistDraft(d => ({ ...d, prior_balance: Number(e.target.value) }))} className="w-full px-2 py-1 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-right" /></td>
                    <td className="px-3 py-1.5 flex items-center gap-1 justify-end">
                      <button onClick={onAddDist} className="p-0.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded"><Check size={12} /></button>
                      <button onClick={() => { setDistAdding(false); setDistDraft({ partner_id: '', partner_name: '', split_percentage: 0, sent_amount: 0, prior_balance: 0 }) }} className="p-0.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"><X size={12} /></button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Modal>
  )
}
