import React, { useState } from 'react'
import { Layers, Target, PieChart } from 'lucide-react'
import { LivvCyclesView } from './LivvCyclesView'
import { LivvSalesPipeline } from './LivvSalesPipeline'
import { LivvExpenseSummary } from './LivvExpenseSummary'

type LivvSection = 'cycles' | 'pipeline' | 'summary'

const SECTIONS: { id: LivvSection; label: string; icon: typeof Layers }[] = [
  { id: 'cycles',   label: 'Cycles',   icon: Layers   },
  { id: 'pipeline', label: 'Pipeline', icon: Target   },
  { id: 'summary',  label: 'Summary',  icon: PieChart },
]

/**
 * Single consolidated LIVV finance view.
 * Three sub-tabs replace the previous three top-level Finance tabs.
 */
export const LivvFinanceView: React.FC = () => {
  const [section, setSection] = useState<LivvSection>('cycles')

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex overflow-x-auto no-scrollbar gap-0.5 p-0.5 bg-zinc-100/60 dark:bg-zinc-900/60 rounded-lg w-fit">
        {SECTIONS.map(s => {
          const active = section === s.id
          const Icon = s.icon
          return (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all duration-200 font-medium text-xs whitespace-nowrap
                ${active
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
                }`}
            >
              <Icon size={13} strokeWidth={active ? 2 : 1.5} />
              <span>{s.label}</span>
            </button>
          )
        })}
      </div>

      {section === 'cycles'   && <LivvCyclesView   />}
      {section === 'pipeline' && <LivvSalesPipeline />}
      {section === 'summary'  && <LivvExpenseSummary />}
    </div>
  )
}
