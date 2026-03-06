import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../ui/Icons';
import { Project, ProjectStatus } from '../../context/ProjectsContext';
import { Client } from '../../context/ClientsContext';
import { colorToBg } from '../ui/ColorPalette';

/* ─── Reused small components ─── */
const StatusBadge = ({ status }: { status: ProjectStatus }) => {
  const colors = {
    [ProjectStatus.Active]: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
    [ProjectStatus.Pending]: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
    [ProjectStatus.Review]: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400',
    [ProjectStatus.Completed]: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
    [ProjectStatus.Archived]: 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${colors[status]}`}>
      {status}
    </span>
  );
};

const ProgressRing = ({ progress, size = 28, stroke = 2.5, color }: { progress: number; size?: number; stroke?: number; color?: string }) => {
  const radius = (size - stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke}
        className="stroke-zinc-100 dark:stroke-zinc-800" />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke}
        strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
        className={color ? undefined : (progress === 100 ? 'stroke-emerald-500' : 'stroke-zinc-900 dark:stroke-zinc-300')}
        style={{ transition: 'stroke-dashoffset 0.6s ease', ...(color ? { stroke: color } : {}) }} />
    </svg>
  );
};

/* ─── Types ─── */
type ProjectCategory = 'client' | 'personal';

interface SidebarGroup {
  id: string;
  label: string;
  category: ProjectCategory;
  clientId?: string;
  clientAvatar?: string;
  clientEmail?: string;
  projects: Project[];
}

export interface ProjectSidebarProps {
  projects: Project[];
  filteredGroups: SidebarGroup[];
  sidebarGroups: SidebarGroup[];
  selectedId: string | null;
  onSelectProject: (id: string) => void;
  sidebarFilter: 'all' | 'client' | 'personal';
  onFilterChange: (filter: 'all' | 'client' | 'personal') => void;
  // Create form
  isCreating: boolean;
  onToggleCreating: () => void;
  newProjectTitle: string;
  onNewProjectTitleChange: (val: string) => void;
  newProjectClient: string;
  onNewProjectClientChange: (val: string) => void;
  newProjectDeadline: string;
  onNewProjectDeadlineChange: (val: string) => void;
  newProjectDesc: string;
  onNewProjectDescChange: (val: string) => void;
  isSubmittingProject: boolean;
  createError: string | null;
  onCreateProject: () => void;
  onCancelCreate: () => void;
  clients: Client[];
}

export const ProjectSidebar: React.FC<ProjectSidebarProps> = ({
  projects,
  filteredGroups,
  sidebarGroups,
  selectedId,
  onSelectProject,
  sidebarFilter,
  onFilterChange,
  isCreating,
  onToggleCreating,
  newProjectTitle,
  onNewProjectTitleChange,
  newProjectClient,
  onNewProjectClientChange,
  newProjectDeadline,
  onNewProjectDeadlineChange,
  newProjectDesc,
  onNewProjectDescChange,
  isSubmittingProject,
  createError,
  onCreateProject,
  onCancelCreate,
  clients,
}) => {
  const clientCount = sidebarGroups.filter(g => g.category === 'client').length;
  const personalCount = sidebarGroups.filter(g => g.category === 'personal').reduce((a, g) => a + g.projects.length, 0);

  return (
    <div className="w-[280px] shrink-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex flex-col overflow-hidden">
      {/* Sidebar header */}
      <div className="px-4 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">Projects</h2>
          <button
            onClick={onToggleCreating}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 transition-colors"
          >
            <Icons.Plus size={14} />
          </button>
        </div>

        {/* New project form */}
        <AnimatePresence>
          {isCreating && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="space-y-2 pb-3">
                <input
                  autoFocus
                  value={newProjectTitle}
                  onChange={e => onNewProjectTitleChange(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && newProjectTitle.trim()) onCreateProject(); if (e.key === 'Escape') onCancelCreate(); }}
                  placeholder="Project name..."
                  className="w-full px-2.5 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                />
                <select
                  value={newProjectClient}
                  onChange={e => onNewProjectClientChange(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600 text-zinc-900 dark:text-zinc-100"
                >
                  <option value="">No client</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name || c.company || c.email}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={newProjectDeadline}
                  onChange={e => onNewProjectDeadlineChange(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600 text-zinc-900 dark:text-zinc-100"
                />
                <textarea
                  value={newProjectDesc}
                  onChange={e => onNewProjectDescChange(e.target.value)}
                  placeholder="Description (optional)..."
                  rows={2}
                  className="w-full px-2.5 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 resize-none"
                />
                {createError && (
                  <p className="text-[10px] text-rose-500 px-0.5">{createError}</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={onCreateProject}
                    disabled={!newProjectTitle.trim() || isSubmittingProject}
                    className="flex-1 py-1.5 text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-1.5"
                  >
                    {isSubmittingProject ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Icons.Plus size={12} />}
                    Create
                  </button>
                  <button
                    onClick={onCancelCreate}
                    className="px-2.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Category filter pills */}
        <div className="flex items-center gap-1">
          {([
            { id: 'all' as const, label: 'All', count: projects.length },
            { id: 'client' as const, label: 'Clients', count: clientCount },
            { id: 'personal' as const, label: 'Own', count: personalCount },
          ]).map(f => (
            <button
              key={f.id}
              onClick={() => onFilterChange(f.id)}
              className={`px-2.5 py-1 text-[10px] font-semibold rounded-full transition-all duration-200 ${
                sidebarFilter === f.id
                  ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                  : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              {f.label}{f.count > 0 ? ` · ${f.count}` : ''}
            </button>
          ))}
        </div>
      </div>

      {/* Sidebar body */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {filteredGroups.length === 0 && (
          <div className="px-3 py-8 text-center">
            <div className="text-zinc-300 dark:text-zinc-600 mb-2"><Icons.Folder size={28} className="mx-auto" /></div>
            <p className="text-xs text-zinc-400">No projects in this category</p>
          </div>
        )}

        {filteredGroups.map(group => (
          <div key={group.id}>
            {/* Group header */}
            <div className="flex items-center gap-2 px-2 pt-3 pb-1.5">
              {group.category === 'client' && group.clientAvatar ? (
                <img src={group.clientAvatar} alt={group.label} className="w-4 h-4 rounded object-cover" />
              ) : group.category === 'client' ? (
                <div className="w-4 h-4 rounded bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-[7px] font-bold text-white">
                  {group.label.substring(0, 2).toUpperCase()}
                </div>
              ) : (
                <div className="w-4 h-4 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                  <Icons.Star size={8} className="text-white" />
                </div>
              )}
              <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider truncate">
                {group.label}
              </span>
              <span className="text-[10px] text-zinc-300 dark:text-zinc-600 ml-auto">{group.projects.length}</span>
            </div>

            {/* Project cards */}
            {group.projects.map(p => {
              const isSelected = selectedId === p.id;
              return (
                <motion.button
                  key={p.id}
                  onClick={() => onSelectProject(p.id)}
                  whileTap={{ scale: 0.98 }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all duration-200 group ${
                    isSelected
                      ? 'bg-zinc-100 dark:bg-zinc-800/80'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: colorToBg(p.color || '#3b82f6', 0.12) }}
                    >
                      <ProgressRing progress={p.progress} size={22} stroke={2} color={p.color || '#3b82f6'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-[13px] font-medium truncate transition-colors ${
                        isSelected ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-400'
                      }`}>
                        {p.title}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <StatusBadge status={p.status} />
                      </div>
                    </div>
                    <span className={`text-[10px] font-mono tabular-nums transition-colors ${
                      isSelected ? 'text-zinc-500 dark:text-zinc-400' : 'text-zinc-300 dark:text-zinc-600'
                    }`}>
                      {p.progress}%
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
