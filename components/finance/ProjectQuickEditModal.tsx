import React, { useEffect, useMemo, useState } from 'react';
import { SlidePanel } from '../ui/SlidePanel';
import { PremiumSelect } from '../ui/PremiumSelect';
import { Icons } from '../ui/Icons';
import { useProjects, type Project, ProjectStatus } from '../../context/ProjectsContext';
import { useFinance, type Installment } from '../../context/FinanceContext';
import { supabase } from '../../lib/supabase';
import { errorLogger } from '../../lib/errorLogger';

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
  const { incomes, updateInstallment, refreshIncomes, createIncome } = useFinance();
  const project = useMemo(() => projects.find(p => p.id === projectId) || null, [projects, projectId]);

  // Flatten this project's installments across all its incomes into one
  // chronological list — this is what the user thinks of as "milestones".
  const projectMilestones = useMemo(() => {
    if (!projectId) return [] as Array<Installment & { income_concept: string; income_id: string }>;
    const out: Array<Installment & { income_concept: string; income_id: string }> = [];
    for (const inc of incomes) {
      if (inc.project_id !== projectId) continue;
      for (const inst of (inc.installments || [])) {
        out.push({ ...inst, income_concept: inc.concept || inc.client_name || 'Income', income_id: inc.id });
      }
    }
    return out.sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
  }, [incomes, projectId]);

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

  // ─── Milestone (installment) mutations ─────────────────────────────
  const setMilestoneAmount = async (milestone: { id: string; amount: number }, raw: string) => {
    const next = Number(raw);
    if (Number.isNaN(next) || next < 0) return;
    if (next === milestone.amount) return;
    setSaveState('saving');
    try {
      await updateInstallment(milestone.id, { amount: Math.round(next * 100) / 100 });
      setSaveState('saved');
      setTimeout(() => setSaveState(s => (s === 'saved' ? 'idle' : s)), 1500);
    } catch (err: any) {
      setSaveState('error'); setSaveError(err?.message || 'Save failed');
    }
  };
  const setMilestoneDueDate = async (milestone: { id: string; due_date: string }, v: string) => {
    if (v === milestone.due_date) return;
    setSaveState('saving');
    try {
      await updateInstallment(milestone.id, { due_date: v });
      setSaveState('saved');
      setTimeout(() => setSaveState(s => (s === 'saved' ? 'idle' : s)), 1500);
    } catch (err: any) {
      setSaveState('error'); setSaveError(err?.message || 'Save failed');
    }
  };
  const toggleMilestonePaid = async (milestone: { id: string; status: string }) => {
    const next = milestone.status === 'paid' ? 'pending' : 'paid';
    setSaveState('saving');
    try {
      await updateInstallment(milestone.id, {
        status: next as Installment['status'],
        paid_date: next === 'paid' ? new Date().toISOString().split('T')[0] : null,
      });
      setSaveState('saved');
      setTimeout(() => setSaveState(s => (s === 'saved' ? 'idle' : s)), 1500);
    } catch (err: any) {
      setSaveState('error'); setSaveError(err?.message || 'Save failed');
    }
  };
  const removeMilestone = async (id: string) => {
    if (!confirm('Remove this milestone? The income will recompute its total.')) return;
    setSaveState('saving');
    try {
      const { error } = await supabase.from('installments').delete().eq('id', id);
      if (error) throw error;
      await refreshIncomes();
      setSaveState('saved');
      setTimeout(() => setSaveState(s => (s === 'saved' ? 'idle' : s)), 1500);
    } catch (err: any) {
      errorLogger.error('milestone delete', err);
      setSaveState('error'); setSaveError(err?.message || 'Delete failed');
    }
  };
  // Add a new milestone — appends an installment to the project's most
  // recent income, or creates a fresh income if there isn't one yet.
  const addMilestone = async () => {
    if (!project) return;
    setSaveState('saving');
    try {
      const projectIncomes = incomes.filter(i => i.project_id === project.id);
      const target = projectIncomes[projectIncomes.length - 1];
      if (target) {
        const nextNumber = (target.installments?.length || 0) + 1;
        const dueDate = new Date(); dueDate.setMonth(dueDate.getMonth() + 1);
        const { error } = await supabase.from('installments').insert({
          income_id: target.id,
          number: nextNumber,
          amount: 0,
          due_date: dueDate.toISOString().split('T')[0],
          status: 'pending',
        });
        if (error) throw error;
      } else {
        // No income exists for this project yet — create one with a single milestone.
        const today = new Date();
        await createIncome({
          concept: project.title,
          total_amount: 0,
          client_id: project.client_id || null,
          client_name: project.clientName || '',
          project_id: project.id,
          project_name: project.title,
          due_date: today.toISOString().split('T')[0],
          num_installments: 1,
          currency: project.currency || 'USD',
        } as any);
      }
      await refreshIncomes();
      setSaveState('saved');
      setTimeout(() => setSaveState(s => (s === 'saved' ? 'idle' : s)), 1500);
    } catch (err: any) {
      errorLogger.error('milestone add', err);
      setSaveState('error'); setSaveError(err?.message || 'Could not add milestone');
    }
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

          {/* ─── Milestones (income installments tied to this project) ─── */}
          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/60">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Icons.Flag size={12} className="text-zinc-400 dark:text-zinc-500" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
                  Milestones
                </span>
                {projectMilestones.length > 0 && (
                  <span className="text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500">
                    · {projectMilestones.length}
                  </span>
                )}
              </div>
              <button
                onClick={addMilestone}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-zinc-50 px-2 py-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors"
              >
                <Icons.Plus size={11} /> Add
              </button>
            </div>
            {projectMilestones.length === 0 ? (
              <div className="text-[12px] text-zinc-400 dark:text-zinc-500 italic px-1 py-3">
                No milestones yet — add one to track payments or deliverables.
              </div>
            ) : (
              <div className="space-y-1">
                {projectMilestones.map(m => {
                  const isPaid = m.status === 'paid';
                  const isOverdue = !isPaid && m.due_date && new Date(m.due_date + 'T12:00:00') < new Date();
                  return (
                    <div
                      key={m.id}
                      className={`group/m grid grid-cols-[auto_120px_1fr_auto_auto] items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${
                        isPaid
                          ? 'bg-emerald-50/40 dark:bg-emerald-500/5'
                          : isOverdue
                            ? 'bg-rose-50/40 dark:bg-rose-500/5'
                            : 'bg-zinc-50/40 dark:bg-zinc-800/20 hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                      }`}
                    >
                      {/* Status toggle dot */}
                      <button
                        onClick={() => toggleMilestonePaid(m)}
                        title={isPaid ? 'Mark as pending' : 'Mark as paid'}
                        className="shrink-0"
                      >
                        {isPaid ? (
                          <Icons.CheckCircle size={14} className="text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <span className={`w-3.5 h-3.5 inline-block rounded-full border-2 transition-colors ${
                            isOverdue
                              ? 'border-rose-400 hover:border-rose-500'
                              : 'border-zinc-300 dark:border-zinc-600 hover:border-zinc-500 dark:hover:border-zinc-400'
                          }`} />
                        )}
                      </button>

                      {/* Amount */}
                      <input
                        type="number"
                        defaultValue={m.amount}
                        onBlur={(e) => setMilestoneAmount(m, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        className="w-full px-2 py-1 rounded-md bg-white/60 dark:bg-zinc-900/40 border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 focus:border-zinc-300 dark:focus:border-zinc-600 outline-none text-[12.5px] font-medium text-zinc-900 dark:text-zinc-100 transition-colors tabular-nums"
                        step="0.01"
                        min="0"
                      />

                      {/* Concept (read-only context) */}
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                        {m.income_concept} · #{m.number}
                      </span>

                      {/* Due date */}
                      <input
                        type="date"
                        defaultValue={m.due_date}
                        onBlur={(e) => setMilestoneDueDate(m, e.target.value)}
                        className="px-2 py-1 rounded-md bg-white/60 dark:bg-zinc-900/40 border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 focus:border-zinc-300 dark:focus:border-zinc-600 outline-none text-[11px] text-zinc-600 dark:text-zinc-300 transition-colors tabular-nums"
                      />

                      {/* Remove */}
                      <button
                        onClick={() => removeMilestone(m.id)}
                        className="opacity-0 group-hover/m:opacity-100 p-1 rounded-md text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all"
                        title="Remove milestone"
                      >
                        <Icons.Trash size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
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
