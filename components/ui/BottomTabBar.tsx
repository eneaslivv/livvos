import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Icons } from './Icons'
import { PageView, NavParams } from '../../types'

interface BottomTabBarProps {
  currentPage: PageView
  onNavigate: (page: PageView, params?: NavParams) => void
  isDarkMode: boolean
  onToggleTheme: () => void
}

const TABS: { id: PageView; label: string; icon: keyof typeof Icons }[] = [
  { id: 'home', label: 'Home', icon: 'Home' },
  { id: 'projects', label: 'Projects', icon: 'Briefcase' },
  { id: 'calendar', label: 'Calendar', icon: 'Calendar' },
  { id: 'team_clients', label: 'Clients', icon: 'Users' },
]

const MORE_ITEMS: { id: PageView | 'theme'; label: string; icon: keyof typeof Icons }[] = [
  { id: 'activity', label: 'Activity', icon: 'Activity' },
  { id: 'docs', label: 'Documents', icon: 'Docs' },
  { id: 'finance', label: 'Finance', icon: 'DollarSign' },
  { id: 'tenant_settings', label: 'Settings', icon: 'Settings' },
  { id: 'theme', label: 'Theme', icon: 'Moon' },
]

const TAB_COLORS: Record<string, string> = {
  home: 'text-zinc-900 dark:text-zinc-100',
  projects: 'text-emerald-600 dark:text-emerald-400',
  calendar: 'text-orange-600 dark:text-orange-400',
  team_clients: 'text-blue-600 dark:text-blue-400',
}

export const BottomTabBar: React.FC<BottomTabBarProps> = ({
  currentPage,
  onNavigate,
  isDarkMode,
  onToggleTheme,
}) => {
  const [showMore, setShowMore] = useState(false)

  const isActive = (id: PageView) =>
    currentPage === id ||
    (id === 'team_clients' && (currentPage === 'team' || currentPage === 'clients'))

  const isMoreActive = MORE_ITEMS.some(
    item => item.id !== 'theme' && currentPage === item.id
  )

  return (
    <>
      {/* More menu overlay */}
      <AnimatePresence>
        {showMore && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-sm"
              onClick={() => setShowMore(false)}
            />
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-[61] bg-white dark:bg-zinc-900 rounded-t-3xl shadow-2xl border-t border-zinc-200 dark:border-zinc-800"
              style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700" />
              </div>

              <div className="px-4 pb-4 grid grid-cols-4 gap-2">
                {MORE_ITEMS.map(item => {
                  const IconComponent = Icons[item.icon === 'Moon' && isDarkMode ? 'Sun' : item.icon]
                  const active = item.id !== 'theme' && currentPage === (item.id as PageView)
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        if (item.id === 'theme') {
                          onToggleTheme()
                        } else {
                          onNavigate(item.id as PageView)
                        }
                        setShowMore(false)
                      }}
                      className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl transition-all ${
                        active
                          ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                          : 'text-zinc-500 dark:text-zinc-400 active:bg-zinc-50 dark:active:bg-zinc-800/50'
                      }`}
                    >
                      <IconComponent size={22} strokeWidth={active ? 2.5 : 1.8} />
                      <span className="text-[11px] font-medium">{item.id === 'theme' ? (isDarkMode ? 'Light' : 'Dark') : item.label}</span>
                    </button>
                  )
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bottom Tab Bar */}
      <div
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-t border-zinc-200/60 dark:border-zinc-800/60"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-center justify-around h-16 px-2">
          {TABS.map(tab => {
            const active = isActive(tab.id)
            const IconComponent = Icons[tab.icon]
            const colorClass = active ? TAB_COLORS[tab.id] || TAB_COLORS.home : 'text-zinc-400 dark:text-zinc-500'

            return (
              <button
                key={tab.id}
                onClick={() => onNavigate(tab.id)}
                className={`relative flex flex-col items-center justify-center gap-0.5 min-w-[56px] min-h-[44px] transition-all ${colorClass}`}
              >
                <IconComponent size={22} strokeWidth={active ? 2.5 : 1.8} />
                <span className={`text-[10px] font-medium ${active ? 'font-semibold' : ''}`}>
                  {tab.label}
                </span>
                {active && (
                  <motion.div
                    layoutId="bottomTabIndicator"
                    className="absolute -top-0.5 w-5 h-0.5 rounded-full bg-current"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            )
          })}

          {/* More button */}
          <button
            onClick={() => setShowMore(true)}
            className={`relative flex flex-col items-center justify-center gap-0.5 min-w-[56px] min-h-[44px] transition-all ${
              isMoreActive
                ? 'text-zinc-900 dark:text-zinc-100'
                : 'text-zinc-400 dark:text-zinc-500'
            }`}
          >
            <Icons.MoreHorizontal size={22} strokeWidth={isMoreActive ? 2.5 : 1.8} />
            <span className={`text-[10px] font-medium ${isMoreActive ? 'font-semibold' : ''}`}>
              More
            </span>
            {isMoreActive && (
              <motion.div
                layoutId="bottomTabIndicator"
                className="absolute -top-0.5 w-5 h-0.5 rounded-full bg-current"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        </div>
      </div>
    </>
  )
}
