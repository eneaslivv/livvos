import React from 'react'
import { Icons } from './Icons'
import { PageView, NavParams } from '../../types'
import { useAurora } from '../../context/AuroraContext'

interface BottomTabBarProps {
  currentPage: PageView
  onNavigate: (page: PageView, params?: NavParams) => void
  // Kept for backwards-compat with Layout's call; unused by the new design.
  isDarkMode?: boolean
  onToggleTheme?: () => void
  onOpenNewTask?: () => void
  onOpenSearch?: () => void
}

/**
 * Mobile bottom nav — Workspace Mobile design.
 * Home · Tasks · [Aurora raised center] · Projects · Finances.
 * Tasks → calendar (the agenda/tasks surface). Other pages stay reachable
 * via the top bar's search / command palette.
 */
type Tab = { id: PageView; label: string; icon: keyof typeof Icons; match: PageView[] }
const LEFT: Tab[] = [
  { id: 'home', label: 'Home', icon: 'Home', match: ['home'] },
  { id: 'calendar', label: 'Tasks', icon: 'Check', match: ['calendar', 'brief'] },
]
const RIGHT: Tab[] = [
  { id: 'projects', label: 'Projects', icon: 'Layers', match: ['projects'] },
  { id: 'finance', label: 'Finances', icon: 'DollarSign', match: ['finance'] },
]

export const BottomTabBar: React.FC<BottomTabBarProps> = ({ currentPage, onNavigate }) => {
  const { setOpen: setAuroraOpen } = useAurora()

  const TabButton: React.FC<{ tab: Tab }> = ({ tab }) => {
    const active = tab.match.includes(currentPage)
    const Icon = Icons[tab.icon]
    return (
      <button
        onClick={() => onNavigate(tab.id)}
        className="flex-1 flex flex-col items-center gap-1 bg-transparent border-0 cursor-pointer"
        style={{ color: active ? 'var(--os-fg-0)' : 'var(--os-fg-3)' }}
      >
        <Icon size={22} strokeWidth={active ? 2.2 : 1.75} />
        <span className="font-medium" style={{ fontSize: 9.5 }}>{tab.label}</span>
      </button>
    )
  }

  return (
    <div
      className="md:hidden fixed bottom-0 left-0 right-0 z-50"
      style={{
        background: 'var(--os-bg)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: '1px solid var(--os-border-2)',
        padding: '10px 16px',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
      }}
    >
      <div className="flex items-center justify-between">
        {LEFT.map(t => <TabButton key={t.id} tab={t} />)}

        {/* Aurora — raised center launcher */}
        <button
          onClick={() => setAuroraOpen(true)}
          aria-label="Aurora"
          className="flex-1 flex justify-center bg-transparent border-0 cursor-pointer"
        >
          <span
            style={{
              width: 50, height: 50, borderRadius: 999, marginTop: -20,
              background: 'var(--os-ink)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 20px -4px rgba(0,0,0,0.3)',
            }}
          >
            <span
              style={{
                width: 26, height: 26, borderRadius: 999,
                background: 'conic-gradient(from 0deg,#E8BC59,#769268,#6DBEDC,#E8BC59)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Icons.Sparkles size={14} style={{ color: '#09090B' }} />
            </span>
          </span>
        </button>

        {RIGHT.map(t => <TabButton key={t.id} tab={t} />)}
      </div>
    </div>
  )
}
