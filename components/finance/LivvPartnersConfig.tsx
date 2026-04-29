import React, { useState } from 'react'
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import { useFinance, type FinancePartner } from '../../context/FinanceContext'

/**
 * Profit-split settings: list of partners with name + default split %.
 * Used by the LIVV cycle flow to seed cycle distributions automatically.
 * Total split should sum to 100% but is not enforced — users may model
 * marketing/comms or savings as a separate partner if they wish.
 */
export const LivvPartnersConfig: React.FC = () => {
  const { partners, partnersLoading, createPartner, updatePartner, deletePartner } = useFinance()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ name: '', default_split_percentage: 0, color: '#10b981' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Partial<FinancePartner>>({})

  const totalSplit = partners.reduce((s, p) => s + Number(p.default_split_percentage || 0), 0)

  const onAdd = async () => {
    if (!draft.name.trim()) return
    await createPartner({
      name: draft.name.trim(),
      default_split_percentage: draft.default_split_percentage,
      color: draft.color,
    })
    setDraft({ name: '', default_split_percentage: 0, color: '#10b981' })
    setAdding(false)
  }

  const onSaveEdit = async (id: string) => {
    await updatePartner(id, editDraft)
    setEditingId(null)
    setEditDraft({})
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Profit Distribution Partners</h3>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            Default split applied to new cycles. Per-cycle override is allowed.
            <span className={`ml-2 font-medium ${Math.abs(totalSplit - 100) < 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>
              Total: {totalSplit.toFixed(2)}%
            </span>
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md"
          >
            <Plus size={12} /> Add partner
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800 rounded-xl divide-y divide-zinc-100 dark:divide-zinc-800/60">
        {partnersLoading && partners.length === 0 && (
          <div className="p-6 text-center text-xs text-zinc-400">Loading partners...</div>
        )}

        {partners.map(p => {
          const isEditing = editingId === p.id
          return (
            <div key={p.id} className="flex items-center gap-2 p-2.5">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
              {isEditing ? (
                <>
                  <input
                    value={editDraft.name ?? p.name}
                    onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
                    className="flex-1 px-2 py-1 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={editDraft.default_split_percentage ?? p.default_split_percentage}
                    onChange={e => setEditDraft(d => ({ ...d, default_split_percentage: Number(e.target.value) }))}
                    className="w-20 px-2 py-1 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-right"
                  />
                  <span className="text-xs text-zinc-400">%</span>
                  <input
                    type="color"
                    value={editDraft.color ?? p.color}
                    onChange={e => setEditDraft(d => ({ ...d, color: e.target.value }))}
                    className="w-6 h-6 rounded cursor-pointer border border-zinc-200 dark:border-zinc-700"
                  />
                  <button onClick={() => onSaveEdit(p.id)} className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded">
                    <Check size={14} />
                  </button>
                  <button onClick={() => { setEditingId(null); setEditDraft({}) }} className="p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded">
                    <X size={14} />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium text-zinc-800 dark:text-zinc-100">{p.name}</span>
                  <span className="text-sm tabular-nums text-zinc-700 dark:text-zinc-200">{Number(p.default_split_percentage).toFixed(2)}%</span>
                  <button onClick={() => { setEditingId(p.id); setEditDraft({ name: p.name, default_split_percentage: p.default_split_percentage, color: p.color }) }} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded">
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => deletePartner(p.id)} className="p-1 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded">
                    <Trash2 size={12} />
                  </button>
                </>
              )}
            </div>
          )
        })}

        {adding && (
          <div className="flex items-center gap-2 p-2.5 bg-zinc-50/50 dark:bg-zinc-800/30">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: draft.color }} />
            <input
              autoFocus
              placeholder="Partner name"
              value={draft.name}
              onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
              className="flex-1 px-2 py-1 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded"
            />
            <input
              type="number"
              step="0.01"
              placeholder="0"
              value={draft.default_split_percentage || ''}
              onChange={e => setDraft(d => ({ ...d, default_split_percentage: Number(e.target.value) }))}
              className="w-20 px-2 py-1 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-right"
            />
            <span className="text-xs text-zinc-400">%</span>
            <input
              type="color"
              value={draft.color}
              onChange={e => setDraft(d => ({ ...d, color: e.target.value }))}
              className="w-6 h-6 rounded cursor-pointer border border-zinc-200 dark:border-zinc-700"
            />
            <button onClick={onAdd} className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded">
              <Check size={14} />
            </button>
            <button onClick={() => setAdding(false)} className="p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded">
              <X size={14} />
            </button>
          </div>
        )}

        {!partnersLoading && partners.length === 0 && !adding && (
          <div className="p-6 text-center text-xs text-zinc-400">
            No partners yet. Add Eneas / Luis (or any profit-share recipients) to enable cycle distributions.
          </div>
        )}
      </div>
    </div>
  )
}
