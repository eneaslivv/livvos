/**
 * ProjectRail — Asana-style sub-sidebar shown while a project is open.
 *
 * The landing list is great for scanning, but once you're INSIDE a project
 * switching to a sibling meant going back out. This rail keeps the whole
 * client → projects tree one click away, with the active project marked by
 * a sliding gold indicator (framer-motion layoutId).
 *
 * Collapsible (persisted); desktop-only — the parent hides it on mobile.
 * Pure presentation: navigation and permission gating stay in Projects.tsx.
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../ui/Icons';
import type { Project } from '../../context/ProjectsContext';

export interface RailGroup {
  id: string;
  label: string;
  category: 'client' | 'personal';
  clientAvatar?: string;
  clientIcon?: string | null;
  projects: Project[];
}

const COLLAPSE_KEY = 'eneas-os:project-rail-collapsed';
const EASE_SOFT = [0.16, 1, 0.3, 1] as const;

export const ProjectRail: React.FC<{
  groups: RailGroup[];
  selectedId: string;
  /** open counts per project id — small "3" badge next to the name */
  statsByProject?: Map<string, { open: number }>;
  onSelect: (projectId: string) => void;
  onBackToAll: () => void;
  /** Present only when the user can create projects (RBAC-gated upstream). */
  onNewProject?: () => void;
}> = ({ groups, selectedId, statsByProject, onSelect, onBackToAll, onNewProject }) => {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === 'true'; } catch { return false; }
  });
  const toggleCollapsed = () => {
    setCollapsed(prev => {
      try { localStorage.setItem(COLLAPSE_KEY, String(!prev)); } catch { /* quota */ }
      return !prev;
    });
  };

  return (
    <motion.aside
      animate={{ width: collapsed ? 46 : 224 }}
      transition={{ duration: 0.3, ease: EASE_SOFT }}
      className="hidden md:flex flex-col shrink-0 overflow-hidden"
      style={{
        background: 'var(--os-panel)',
        border: '0.5px solid var(--os-border-2)',
        borderRadius: 16,
        boxShadow: 'var(--shadow-card)',
      }}
    >
      {/* Header — back to all + collapse toggle */}
      <div className={`flex items-center shrink-0 ${collapsed ? 'justify-center py-3' : 'justify-between pl-4 pr-2 py-3'}`}>
        {!collapsed && (
          <button
            onClick={onBackToAll}
            className="flex items-center gap-1.5 transition-opacity hover:opacity-70 min-w-0"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--os-fg-2)' }}
            title="Back to all projects"
          >
            <Icons.ChevronLeft size={12} />
            <span className="truncate">Projects</span>
          </button>
        )}
        <button
          onClick={toggleCollapsed}
          className="p-1.5 rounded-md transition-colors hover:bg-[var(--os-surface)]"
          style={{ color: 'var(--os-fg-3)' }}
          title={collapsed ? 'Expand project list' : 'Collapse project list'}
        >
          <motion.span animate={{ rotate: collapsed ? 180 : 0 }} transition={{ duration: 0.3, ease: EASE_SOFT }} className="flex">
            <Icons.ChevronLeft size={14} />
          </motion.span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain pb-2" style={{ scrollbarWidth: 'thin' }}>
        {groups.map(group => (
          <div key={group.id} className={collapsed ? 'mb-1' : 'mb-3'}>
            {/* Group label */}
            {!collapsed && (
              <div className="flex items-center gap-1.5 px-4 mb-1">
                {group.category === 'client' && group.clientIcon ? (
                  <span className="text-[12px] leading-none">{group.clientIcon}</span>
                ) : group.category === 'client' && group.clientAvatar ? (
                  <img src={group.clientAvatar} alt={group.label} className="w-3.5 h-3.5 rounded object-cover" />
                ) : group.category === 'client' ? (
                  <span
                    className="w-3.5 h-3.5 rounded flex items-center justify-center text-[6px] font-semibold"
                    style={{ background: 'var(--os-surface)', color: 'var(--os-fg-2)' }}
                  >
                    {group.label.substring(0, 2).toUpperCase()}
                  </span>
                ) : (
                  <Icons.Star size={9} style={{ color: 'var(--os-fg-3)' }} />
                )}
                <span
                  className="truncate"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--os-fg-2)' }}
                >
                  {group.label}
                </span>
              </div>
            )}

            {/* Project rows */}
            {group.projects.map(p => {
              const active = p.id === selectedId;
              const open = statsByProject?.get(p.id)?.open ?? 0;
              const dot = p.color || 'var(--os-fg-3)';
              return (
                <button
                  key={p.id}
                  onClick={() => onSelect(p.id)}
                  className={`relative w-full flex items-center transition-colors ${collapsed ? 'justify-center py-2' : 'gap-2.5 pl-4 pr-3 py-[7px]'} ${active ? '' : 'hover:bg-[var(--os-surface)]'}`}
                  style={{ background: active ? 'var(--accent-soft)' : 'transparent' }}
                  title={p.title}
                >
                  {/* Sliding active indicator */}
                  {active && (
                    <motion.span
                      layoutId="project-rail-active"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-full"
                      style={{ background: 'var(--accent)' }}
                    />
                  )}
                  {p.icon ? (
                    <span className="text-[13px] leading-none shrink-0 w-4 text-center">{p.icon}</span>
                  ) : (
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dot }} />
                  )}
                  {!collapsed && (
                    <>
                      <span
                        className="flex-1 min-w-0 truncate text-left text-[12.5px]"
                        style={{ color: active ? 'var(--os-fg-0)' : 'var(--os-fg-1)', fontWeight: active ? 600 : 400 }}
                      >
                        {p.title}
                      </span>
                      {open > 0 && (
                        <span
                          className="shrink-0 tabular-nums text-[9.5px] px-1.5 py-px rounded-full"
                          style={{ fontFamily: 'var(--font-mono)', background: active ? 'var(--accent-strong)' : 'var(--os-surface)', color: active ? 'var(--livv-wine-500)' : 'var(--os-fg-3)' }}
                        >
                          {open}
                        </span>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* New project — only when the role allows creating */}
      {onNewProject && (
        <div className="shrink-0 p-2" style={{ borderTop: '0.5px solid var(--os-divider)' }}>
          <motion.button
            onClick={onNewProject}
            whileTap={{ scale: 0.97 }}
            className={`w-full flex items-center transition-colors hover:bg-[var(--os-surface)] rounded-lg ${collapsed ? 'justify-center py-2' : 'gap-2 px-2.5 py-2'}`}
            style={{ color: 'var(--os-fg-2)' }}
            title="New project"
          >
            <Icons.Plus size={13} />
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-[12px] font-medium whitespace-nowrap"
                >
                  New project
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      )}
    </motion.aside>
  );
};
