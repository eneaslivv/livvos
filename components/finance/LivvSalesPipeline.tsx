import React, { useMemo, useState } from 'react'
import { Plus, Trash2, Pencil, Target, Check, X } from 'lucide-react'
import { useFinance, type PipelineProject } from '../../context/FinanceContext'

const fmtMoney = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`

const STATUS_LABELS: Record<PipelineProject['status'], string> = {
  open: 'Open',
  in_progress: 'In progress',
  closed: 'Closed',
  lost: 'Lost',
}

const STATUS_STYLES: Record<PipelineProject['status'], string> = {
  open:        'bg-zinc-100  text-zinc-600  dark:bg-zinc-800/60 dark:text-zinc-300',
  in_progress: 'bg-blue-50   text-blue-600  dark:bg-blue-500/10 dark:text-blue-400',
  closed:      'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  lost:        'bg-rose-50   text-rose-600  dark:bg-rose-500/10 dark:text-rose-400',
}

interface DraftRow {
  client_group: string
  client_name: string
  project_name: string
  total_amount: number
  collected_amount: number
  status: PipelineProject['status']
  notes: string
}

const EMPTY_DRAFT: DraftRow = {
  client_group: 'Otros Clientes',
  client_name: '',
  project_name: '',
  total_amount: 0,
  collected_amount: 0,
  status: 'open',
  notes: '',
}

/**
 * "Ventas & Utilidades" — project-level sales pipeline grouped by client_group.
 * Mirrors the spreadsheet's Christie/Otros Clientes sections with totals,
 * collected, and pending columns plus rolled-up summary metrics.
 */
export const LivvSalesPipeline: React.FC = () => {
  const {
    pipelineProjects, pipelineProjectsLoading,
    createPipelineProject, updatePipelineProject, deletePipelineProject,
    paymentCycles,
  } = useFinance()

  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<DraftRow>(EMPTY_DRAFT)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Partial<PipelineProject>>({})

  // Group totals
  const grouped = useMemo(() => {
    const map = new Map<string, PipelineProject[]>()
    for (const p of pipelineProjects) {
      const list = map.get(p.client_group) || []
      list.push(p)
      map.set(p.client_group, list)
    }
    return Array.from(map.entries()).map(([group, items]) => ({
      group,
      items,
      total: items.reduce((s, i) => s + Number(i.total_amount || 0), 0),
      collected: items.reduce((s, i) => s + Number(i.collected_amount || 0), 0),
      pending: items.reduce((s, i) => s + Number(i.pending_amount || 0), 0),
    }))
  }, [pipelineProjects])

  // Spreadsheet "summary rows"
  const closed = pipelineProjects.filter(p => p.status === 'closed')
  const totalClosed = closed.reduce((s, p) => s + Number(p.total_amount || 0), 0)
  const totalCollected = pipelineProjects.reduce((s, p) => s + Number(p.collected_amount || 0), 0)
  const totalConfirmed = pipelineProjects
    .filter(p => p.status !== 'lost')
    .reduce((s, p) => s + Number(p.total_amount || 0), 0)

  // Total expenses across all payment cycles
  const totalExpenses = paymentCycles.reduce(
    (s, c) => s + (c.costs || []).reduce((cs, x) => cs + Number(x.cost || 0), 0),
    0
  )
  const expenseRatioOnCollected = totalCollected > 0 ? totalExpenses / totalCollected : 0
  const totalProjected = pipelineProjects.reduce((s, p) => s + Number(p.pending_amount || 0), 0)
  const expenseRatioOnProjected = totalProjected > 0 ? totalExpenses / totalProjected : 0

  const onAdd = async () => {
    if (!draft.client_name.trim() || !draft.project_name.trim()) return
    await createPipelineProject({
      client_group: draft.client_group.trim() || 'Otros Clientes',
      client_name: draft.client_name.trim(),
      project_name: draft.project_name.trim(),
      total_amount: Number(draft.total_amount) || 0,
      collected_amount: Number(draft.collected_amount) || 0,
      status: draft.status,
      notes: draft.notes,
    })
    setDraft(EMPTY_DRAFT)
    setAdding(false)
  }

  const onSaveEdit = async (id: string) => {
    await updatePipelineProject(id, editDraft)
    setEditingId(null)
    setEditDraft({})
  }

  return (
    <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Target size={16} className="text-violet-500" />
            Ventas & Utilidades
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Project-level sales pipeline grouped by client.
          </p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 rounded-md"
        >
          <Plus size={12} /> New project
        </button>
      </div>

      {/* Group tables */}
      <div className="space-y-4">
        {pipelineProjectsLoading && grouped.length === 0 && (
          <div className="p-6 text-center text-xs text-zinc-400">Loading pipeline...</div>
        )}

        {grouped.map(g => (
          <div key={g.group} className="bg-white dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-800/40 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                Proyectos de {g.group}
              </h3>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums flex items-center gap-3">
                <span>Total: <strong className="text-zinc-700 dark:text-zinc-200">{fmtMoney(g.total)}</strong></span>
                <span>Cobrado: <strong className="text-emerald-600 dark:text-emerald-400">{fmtMoney(g.collected)}</strong></span>
                <span>Pendiente: <strong className="text-amber-600 dark:text-amber-400">{fmtMoney(g.pending)}</strong></span>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Project</th>
                  <th className="text-left px-4 py-2 font-medium">Client</th>
                  <th className="text-right px-4 py-2 font-medium">Total</th>
                  <th className="text-right px-4 py-2 font-medium">Cobrado</th>
                  <th className="text-right px-4 py-2 font-medium">Pendiente</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {g.items.map(item => {
                  const isEditing = editingId === item.id
                  return (
                    <tr key={item.id} className="hover:bg-zinc-50/40 dark:hover:bg-zinc-800/20">
                      {isEditing ? (
                        <>
                          <td className="px-4 py-1.5">
                            <input value={editDraft.project_name ?? item.project_name} onChange={e => setEditDraft(d => ({ ...d, project_name: e.target.value }))} className="w-full px-2 py-1 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded" />
                          </td>
                          <td className="px-4 py-1.5">
                            <input value={editDraft.client_name ?? item.client_name} onChange={e => setEditDraft(d => ({ ...d, client_name: e.target.value }))} className="w-full px-2 py-1 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded" />
                          </td>
                          <td className="px-4 py-1.5">
                            <input type="number" step="0.01" value={Number(editDraft.total_amount ?? item.total_amount)} onChange={e => setEditDraft(d => ({ ...d, total_amount: Number(e.target.value) }))} className="w-24 px-2 py-1 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-right" />
                          </td>
                          <td className="px-4 py-1.5">
                            <input type="number" step="0.01" value={Number(editDraft.collected_amount ?? item.collected_amount)} onChange={e => setEditDraft(d => ({ ...d, collected_amount: Number(e.target.value) }))} className="w-24 px-2 py-1 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-right" />
                          </td>
                          <td className="px-4 py-1.5 text-right tabular-nums text-zinc-400">
                            {fmtMoney(Math.max(Number(editDraft.total_amount ?? item.total_amount) - Number(editDraft.collected_amount ?? item.collected_amount), 0))}
                          </td>
                          <td className="px-4 py-1.5">
                            <select value={editDraft.status ?? item.status} onChange={e => setEditDraft(d => ({ ...d, status: e.target.value as PipelineProject['status'] }))} className="px-2 py-1 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded">
                              {(Object.keys(STATUS_LABELS) as PipelineProject['status'][]).map(s => (
                                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-1.5 flex items-center gap-1">
                            <button onClick={() => onSaveEdit(item.id)} className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded">
                              <Check size={14} />
                            </button>
                            <button onClick={() => { setEditingId(null); setEditDraft({}) }} className="p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded">
                              <X size={14} />
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-2 font-medium text-zinc-800 dark:text-zinc-100">{item.project_name}</td>
                          <td className="px-4 py-2 text-zinc-500 dark:text-zinc-400">{item.client_name}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-200">{fmtMoney(Number(item.total_amount))}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{fmtMoney(Number(item.collected_amount))}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-amber-600 dark:text-amber-400">{fmtMoney(Number(item.pending_amount))}</td>
                          <td className="px-4 py-2">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_STYLES[item.status]}`}>
                              {STATUS_LABELS[item.status]}
                            </span>
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-1 justify-end">
                              <button onClick={() => { setEditingId(item.id); setEditDraft({ project_name: item.project_name, client_name: item.client_name, total_amount: item.total_amount, collected_amount: item.collected_amount, status: item.status }) }} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded">
                                <Pencil size={12} />
                              </button>
                              <button onClick={() => deletePipelineProject(item.id)} className="p-1 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded">
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}

        {/* Add row */}
        {adding && (
          <div className="bg-white dark:bg-zinc-900/60 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl p-3">
            <div className="grid grid-cols-1 md:grid-cols-7 gap-2 items-center">
              <input placeholder="Group" value={draft.client_group} onChange={e => setDraft(d => ({ ...d, client_group: e.target.value }))} className="px-2 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded" />
              <input placeholder="Client" value={draft.client_name} onChange={e => setDraft(d => ({ ...d, client_name: e.target.value }))} className="px-2 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded" />
              <input placeholder="Project" value={draft.project_name} onChange={e => setDraft(d => ({ ...d, project_name: e.target.value }))} className="px-2 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded" />
              <input type="number" step="0.01" placeholder="Total" value={draft.total_amount || ''} onChange={e => setDraft(d => ({ ...d, total_amount: Number(e.target.value) }))} className="px-2 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-right" />
              <input type="number" step="0.01" placeholder="Cobrado" value={draft.collected_amount || ''} onChange={e => setDraft(d => ({ ...d, collected_amount: Number(e.target.value) }))} className="px-2 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-right" />
              <select value={draft.status} onChange={e => setDraft(d => ({ ...d, status: e.target.value as PipelineProject['status'] }))} className="px-2 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded">
                {(Object.keys(STATUS_LABELS) as PipelineProject['status'][]).map(s => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
              <div className="flex items-center gap-1 justify-end">
                <button onClick={onAdd} className="px-2 py-1 text-xs font-medium bg-emerald-500 text-white rounded hover:bg-emerald-600">Add</button>
                <button onClick={() => { setAdding(false); setDraft(EMPTY_DRAFT) }} className="px-2 py-1 text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700">Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Summary metrics — mirrors spreadsheet bottom rows */}
      {pipelineProjects.length > 0 && (
        <div className="bg-white dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800 rounded-xl p-4 space-y-2">
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="flex items-center justify-between p-2 bg-zinc-50 dark:bg-zinc-800/40 rounded">
              <span className="text-zinc-500 dark:text-zinc-400">Proyectos Concretados</span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-100 tabular-nums">{fmtMoney(totalClosed)}</span>
            </div>
            <div className="flex items-center justify-between p-2 bg-zinc-50 dark:bg-zinc-800/40 rounded">
              <span className="text-zinc-500 dark:text-zinc-400">Total Cobrado</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{fmtMoney(totalCollected)}</span>
            </div>
            <div className="flex items-center justify-between p-2 bg-zinc-50 dark:bg-zinc-800/40 rounded">
              <span className="text-zinc-500 dark:text-zinc-400">Total Confirmado</span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-100 tabular-nums">{fmtMoney(totalConfirmed)}</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
            <div className="flex items-center justify-between p-2 bg-amber-50/40 dark:bg-amber-500/5 rounded">
              <span className="text-zinc-500 dark:text-zinc-400">Total Cobrado + Gastos · ratio</span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-100 tabular-nums">
                {fmtMoney(totalCollected)} · {fmtMoney(totalExpenses)} · {fmtPct(expenseRatioOnCollected)}
              </span>
            </div>
            <div className="flex items-center justify-between p-2 bg-amber-50/40 dark:bg-amber-500/5 rounded">
              <span className="text-zinc-500 dark:text-zinc-400">Total Proyectado · ratio</span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-100 tabular-nums">
                {fmtMoney(totalProjected)} · {fmtPct(expenseRatioOnProjected)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
