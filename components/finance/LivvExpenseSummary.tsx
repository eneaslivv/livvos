import React, { useMemo } from 'react'
import { Receipt } from 'lucide-react'
import { useFinance } from '../../context/FinanceContext'

const MONTH_LABELS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
]

const fmtMoney = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

/**
 * "Gastos Totales" — aggregates Total Costs across all LIVV payment cycles
 * by month. Mirrors the spreadsheet's summary tab.
 */
export const LivvExpenseSummary: React.FC = () => {
  const { paymentCycles, paymentCyclesLoading } = useFinance()

  const rows = useMemo(() => {
    const map = new Map<string, { month: string; year: number; monthIndex: number; total: number; cycles: number }>()

    for (const cycle of paymentCycles) {
      // period_month is YYYY-MM-DD (first of month)
      const d = new Date(cycle.period_month + 'T12:00:00')
      const year = d.getFullYear()
      const monthIndex = d.getMonth()
      const key = `${year}-${monthIndex}`
      const cycleTotal = (cycle.costs || []).reduce((s, c) => s + Number(c.cost || 0), 0)

      const existing = map.get(key)
      if (existing) {
        existing.total += cycleTotal
        existing.cycles += 1
      } else {
        map.set(key, {
          month: MONTH_LABELS[monthIndex],
          year,
          monthIndex,
          total: cycleTotal,
          cycles: 1,
        })
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      b.year !== a.year ? b.year - a.year : b.monthIndex - a.monthIndex
    )
  }, [paymentCycles])

  const grandTotal = rows.reduce((s, r) => s + r.total, 0)
  const totalCycles = rows.reduce((s, r) => s + r.cycles, 0)

  return (
    <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-500">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <Receipt size={16} className="text-amber-500" />
          Gastos Totales
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Aggregated tool / service costs across all payment cycles.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-4 bg-white dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800 rounded-xl">
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">Total Expenses</p>
          <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mt-1 tabular-nums">{fmtMoney(grandTotal)}</p>
          <p className="text-[11px] text-zinc-400 mt-1">Across {totalCycles} cycle{totalCycles === 1 ? '' : 's'}</p>
        </div>
        <div className="p-4 bg-white dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800 rounded-xl">
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">Months Tracked</p>
          <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mt-1 tabular-nums">{rows.length}</p>
        </div>
        <div className="p-4 bg-white dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800 rounded-xl">
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">Avg / Month</p>
          <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mt-1 tabular-nums">
            {rows.length > 0 ? fmtMoney(grandTotal / rows.length) : fmtMoney(0)}
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800/40 text-[10px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Month</th>
              <th className="text-left px-4 py-2 font-medium">Year</th>
              <th className="text-right px-4 py-2 font-medium">Cycles</th>
              <th className="text-right px-4 py-2 font-medium">Total Expenses</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {paymentCyclesLoading && rows.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-xs text-zinc-400">Loading...</td></tr>
            )}
            {!paymentCyclesLoading && rows.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-xs text-zinc-400">No payment cycles yet.</td></tr>
            )}
            {rows.map(r => (
              <tr key={`${r.year}-${r.monthIndex}`} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                <td className="px-4 py-2.5 font-medium text-zinc-800 dark:text-zinc-100">{r.month}</td>
                <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-400">{r.year}</td>
                <td className="px-4 py-2.5 text-right text-zinc-500 dark:text-zinc-400 tabular-nums">{r.cycles}</td>
                <td className="px-4 py-2.5 text-right font-medium text-zinc-900 dark:text-zinc-100 tabular-nums">{fmtMoney(r.total)}</td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="bg-zinc-50/60 dark:bg-zinc-800/30 font-semibold">
                <td className="px-4 py-2.5 text-zinc-800 dark:text-zinc-100" colSpan={2}>Total</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">{totalCycles}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-900 dark:text-zinc-100">{fmtMoney(grandTotal)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
