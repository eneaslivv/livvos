import React, { useEffect, useMemo, useState } from 'react';
import { SlidePanel } from '../ui/SlidePanel';
import { PremiumSelect } from '../ui/PremiumSelect';
import { Icons } from '../ui/Icons';
import { useProjects, type Project, ProjectStatus } from '../../context/ProjectsContext';

interface Props {
  /** Open the panel for this project id. Pass null to close. */
  projectId: string | null;
  onClose: () => void;
  /** Optional: when the user wants to dive deeper, navigate to the full
   *  project page. The modal closes after dispatching. */
  onOpenFullPage?: (projectId: string) => void;
}

const STATUS_OPTS = [
  { value: ProjectStatus.Active,    label: 'Active',    color: 'bg-emerald-500' },
  { value: ProjectStatus.Pending,   label: 'Pending',   color: 'bg-amber-500' },
  { value: ProjectStatus.Review,    label: 'In review', color: 'bg-violet-500' },
  { value: ProjectStatus.Completed, label: 'Completed', color: 'bg-blue-500' },
  { value: ProjectStatus.Archived,  label: 'Archived',  color: 'bg-zinc-500' },
];

const CURRENCY_OPTS = [
  { value: 'USD', label: 'USD' },
  { value: 'ARS', label: 'ARS' },
  { value: 'EUR', label: 'EUR' },
];

/**
 * ProjectQuickEditModal — focused single-project editor that opens as a
 * right-side slide panel from anywhere (Income tab, Expense rows, etc.).
 * Lets the user fix the project's title/status/deadline/budget/description
 * without leaving the current page or seeing the full project list.
 *
 * Auto-saves on blur (debounced via setTimeout) so closing the panel never
 * leaves work unsaved. The "Open full page" link in the footer is for
 * users who actually want the deep view (tasks, finance, files, etc.).
 */
export const ProjectQuickEditModal: React.FC<Props> = ({ projectId, onClose, onOpenFullPage }) => {
  const { projects, updateProject } = useProjects();
  const project = useMemo(() => projects.find(p => p.id === projectId) || null, [projects, projectId]);

  // Local edit buffer — mirrors the project until the user blurs.
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<ProjectStatus>(ProjectStatus.Active);
  const [deadline, setDeadline] = useState('');
  const [budget, setBudget] = useState<string>('');
  const [currency, setCurrency] = useState('USD');
  const [description, setDescription] = useState('');

  // 4-state save indicator: idle / saving / saved / error.
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!project) return;
    setTitle(project.title || '');
    setStatus(project.status);
    setDeadline(project.deadline || '');
    setBudget(project.budget != null ? String(project.budget) : '');
    setCurrency(project.currency || 'USD');
    setDescription(project.description || '');
    setSaveState('idle');
    setSaveError(null);
  }, [project?.id]); // re-init when switching projects

  const isOpen = !!projectId;

  const persist = async (patch: Partial<Project>) => {
    if (!project) return;
    setSaveState('saving');
    try {
      await updateProject(project.id, patch);
      setSaveState('saved');
      setTimeout(() => setSaveState(s => (s === 'saved' ? 'idle' : s)), 1500);
    } catch (err: any) {
      setSaveState('error');
      setSaveError(err?.message || 'Save failed');
    }
  };

  const saveTitle = () => {
    const v = title.trim();
    if (!project || v === (project.title || '')) return;
    persist({ title: v });
  };
  const saveDeadline = () => {
    if (!project || deadline === (project.deadline || '')) return;
    persist({ deadline: deadline || null as any });
  };
  const saveDescription = () => {
    if (!project || description === (project.description || '')) return;
    persist({ description });
  };
  const saveBudget = () => {
    if (!project) return;
    const num = budget === '' ? 0 : Number(budget);
    if (Number.isNaN(num)) return;
    if (num === (project.budget || 0)) return;
    persist({ budget: num });
  };
  const saveStatus = (v: string) => {
    if (!project) return;
    setStatus(v as ProjectStatus);
    if (v !== project.status) persist({ status: v as ProjectStatus });
  };
  const saveCurrency = (v: string) => {
    if (!project) return;
    setCurrency(v);
    if (v !== (project.currency || 'USD')) persist({ currency: v });
  };

  const SaveBadge = () => {
    if (saveState === 'idle') return null;
    if (saveState === 'saving') return (
      <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> Saving…
      </span>
    );
    if (saveState === 'saved') return (
      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
        <Icons.Check size={11} /> Saved
      </span>
    );
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400" title={saveError || ''}>
        <Icons.AlertCircle size={11} /> Error
      </span>
    );
  };

  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={onClose}
      width="lg"
      title={project ? project.title : 'Project'}
      subtitle={project?.clientName ? `for ${project.clientName}` : undefined}
      headerRight={<SaveBadge />}
      footer={onOpenFullPage && project ? (
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
            Quick edit · changes save automatically
          </span>
          <button
            onClick={() => { onOpenFullPage(project.id); onClose(); }}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
          >
            Open full page
            <Icons.External size={12} />
          </button>
        </div>
      ) : undefined}
    >
      {!project ? (
        <div className="p-6 text-[13px] text-zinc-500 dark:text-zinc-400">
          Project not found.
        </div>
      ) : (
        <div className="p-6 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-700/40 focus:border-zinc-300 dark:focus:border-zinc-600 outline-none text-[14px] text-zinc-900 dark:text-zinc-100 transition-colors"
            />
          </div>

          {/* Status + Deadline grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">
                Status
              </label>
              <PremiumSelect
                value={status}
                showDot
                options={STATUS_OPTS}
                onChange={saveStatus}
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">
                Deadline
              </label>
              <input
                type="date"
                value={deadline}
                onChange={e => setDeadline(e.target.value)}
                onBlur={saveDeadline}
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-700/40 focus:border-zinc-300 dark:focus:border-zinc-600 outline-none text-[13px] text-zinc-900 dark:text-zinc-100 transition-colors tabular-nums"
              />
            </div>
          </div>

          {/* Budget + Currency */}
          <div className="grid grid-cols-[1fr_120px] gap-4">
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">
                Budget
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-zinc-400 dark:text-zinc-500">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={budget}
                  onChange={e => setBudget(e.target.value)}
                  onBlur={saveBudget}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  className="w-full pl-7 pr-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-700/40 focus:border-zinc-300 dark:focus:border-zinc-600 outline-none text-[13px] text-zinc-900 dark:text-zinc-100 transition-colors tabular-nums"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">
                Currency
              </label>
              <PremiumSelect
                value={currency}
                options={CURRENCY_OPTS}
                onChange={saveCurrency}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              onBlur={saveDescription}
              rows={4}
              className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-700/40 focus:border-zinc-300 dark:focus:border-zinc-600 outline-none text-[13px] text-zinc-700 dark:text-zinc-200 transition-colors resize-y leading-relaxed"
              placeholder="What is this project about?"
            />
          </div>

          {/* Quick stats — read-only summary */}
          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/60 grid grid-cols-3 gap-3">
            <Stat label="Progress" value={`${project.progress ?? 0}%`} />
            <Stat label="Created" value={
              project.createdAt
                ? new Date(project.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
                : '—'
            } />
            <Stat label="Color" value={
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full" style={{ background: project.color || '#3b82f6' }} />
                <span className="text-[12px] font-mono text-zinc-500">{project.color || '—'}</span>
              </span>
            } />
          </div>
        </div>
      )}
    </SlidePanel>
  );
};

const Stat: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div>
    <div className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">{label}</div>
    <div className="text-[13px] font-medium text-zinc-700 dark:text-zinc-200">{value}</div>
  </div>
);
