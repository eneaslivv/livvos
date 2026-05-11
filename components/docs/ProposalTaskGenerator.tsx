/**
 * ProposalTaskGenerator — turns an accepted/drafted proposal into a
 * structured project plan: phases → tasks → subtasks, all inserted
 * under a chosen (or freshly created) project.
 *
 * Flow:
 *   1. Pick a project (auto-suggests projects for the same client; can
 *      also create a new one in-line).
 *   2. Click "Generar con IA" → calls gemini 'tasks_bulk' with the
 *      proposal's brief + content + tier scope + service deliverables.
 *   3. Preview the phase/task/subtask tree, edit if needed (lightweight
 *      — only remove/keep, since deeper edits happen in the project
 *      page after acceptance).
 *   4. Click "Crear todo" → inserts phases on the project's tasksGroups
 *      + tasks with group_name set + subtasks linked to their parents.
 *
 * Trigger: a button in ProposalChatEditor's header.
 *
 * The generation logic mirrors pages/Projects.tsx handleAiGenerate /
 * handleAiAccept — extracted enough context that the AI emits the
 * same shape, and we use the same insert pattern + date distribution.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { SlidePanel } from '../ui/SlidePanel';
import { Icons } from '../ui/Icons';
import { supabase } from '../../lib/supabase';
import { errorLogger } from '../../lib/errorLogger';
import { useProjects, ProjectStatus, type Project } from '../../context/ProjectsContext';
import { useTeam } from '../../context/TeamContext';
import { useAuth } from '../../hooks/useAuth';
import { useTenant } from '../../context/TenantContext';

// AI 'tasks_bulk' response shape — matches what gemini/prompts.ts emits.
interface AiSubtask { title: string; dueDate?: string }
interface AiTask {
  title: string;
  priority?: 'low' | 'medium' | 'high';
  dueDate?: string;
  assignee?: string | null;
  subtasks?: AiSubtask[];
}
interface AiPhase {
  name: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
  tasks: AiTask[];
}
interface AiPreview { phases: AiPhase[] }

interface Props {
  isOpen: boolean;
  onClose: () => void;
  proposal: any;
  /** Called after tasks are inserted with the resulting projectId so
   *  the parent can route the user to the project page if desired. */
  onComplete?: (projectId: string, counts: { phases: number; tasks: number; subtasks: number }) => void;
}

export const ProposalTaskGenerator: React.FC<Props> = ({ isOpen, onClose, proposal, onComplete }) => {
  const { projects, createProject } = useProjects();
  const { members } = useTeam();
  const { user: currentUser } = useAuth();
  const { currentTenant } = useTenant();

  // Project picker state. If the proposal has a client_id we suggest
  // projects for that client; else fall back to all projects sorted by
  // most-recently-active.
  const sameClientProjects = useMemo(() => {
    if (!proposal?.client_id) return [] as Project[];
    return projects.filter(p => (p as any).client_id === proposal.client_id);
  }, [projects, proposal?.client_id]);

  const [mode, setMode] = useState<'pick' | 'new'>(sameClientProjects.length > 0 ? 'pick' : 'new');
  const [projectId, setProjectId] = useState<string>(sameClientProjects[0]?.id || '');
  const [newProjectTitle, setNewProjectTitle] = useState<string>(proposal?.title || '');
  const [newProjectDeadline, setNewProjectDeadline] = useState<string>('');

  // Generation state.
  const [phase, setPhaseState] = useState<'idle' | 'generating' | 'preview' | 'creating' | 'done' | 'error'>('idle');
  const [preview, setPreview] = useState<AiPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keepMap, setKeepMap] = useState<Record<string, boolean>>({});
  const [counts, setCounts] = useState<{ phases: number; tasks: number; subtasks: number }>({ phases: 0, tasks: 0, subtasks: 0 });
  const [resultProjectId, setResultProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    // Re-derive defaults when the panel opens.
    setMode(sameClientProjects.length > 0 ? 'pick' : 'new');
    setProjectId(sameClientProjects[0]?.id || '');
    setNewProjectTitle(proposal?.title || '');
    setNewProjectDeadline('');
    setPhaseState('idle');
    setPreview(null);
    setError(null);
    setKeepMap({});
    setResultProjectId(null);
  }, [isOpen, proposal?.id, sameClientProjects.length]);

  const isWorking = phase === 'generating' || phase === 'creating';

  // Build the prompt for gemini tasks_bulk. We feed the proposal brief,
  // generated content, tier scope (when accepted), deliverables, and
  // today's date so the AI can produce a real plan, not generic phases.
  const buildPrompt = (): string => {
    const doc = proposal?.pricing_snapshot?.document || {};
    const acceptedTier = Array.isArray(doc.tiers)
      ? doc.tiers.find((t: any) => t.id === doc.acceptedTierId) || doc.tiers.find((t: any) => t.featured) || doc.tiers[0]
      : null;
    const tierLines = acceptedTier
      ? [
          `Selected tier: ${acceptedTier.name} · ${acceptedTier.amount} ${proposal.currency || 'USD'}`,
          acceptedTier.duration ? `Duration: ${acceptedTier.duration}` : '',
          acceptedTier.platform ? `Platform: ${acceptedTier.platform}` : '',
          acceptedTier.features?.length ? `Features: ${acceptedTier.features.join('; ')}` : '',
        ].filter(Boolean).join('\n')
      : '';

    const phasesFromDoc = Array.isArray(doc.phases) && doc.phases.length > 0
      ? `Proposal phases reference:\n${doc.phases.map((p: any) => `- ${p.name}${p.duration ? ` (${p.duration})` : ''}${p.deliverables?.length ? `: ${p.deliverables.join(', ')}` : ''}`).join('\n')}`
      : '';

    const projectTitle = mode === 'pick'
      ? projects.find(p => p.id === projectId)?.title || proposal.title
      : newProjectTitle || proposal.title;

    const teamNames = members.filter(m => m.status === 'active').map(m => m.name || m.email).filter(Boolean);

    return [
      `Project: ${projectTitle}`,
      `Today: ${new Date().toISOString().slice(0, 10)}`,
      proposal.brief_text ? `Original brief from client:\n${proposal.brief_text}` : '',
      proposal.content ? `\nProposal content (for context):\n${String(proposal.content).slice(0, 2500)}` : '',
      tierLines ? `\n${tierLines}` : '',
      phasesFromDoc ? `\n${phasesFromDoc}` : '',
      teamNames.length > 0 ? `\nTeam: ${teamNames.join(', ')}` : '',
      '',
      'Task request: Break this proposal into a complete delivery plan with 3-6 phases, 3-5 tasks per phase, and 2-4 subtasks per task. Dates should span realistically based on the tier duration if known, starting from today. Assign tasks to team members by name when their skills match obvious work types (e.g. designers for design tasks).',
    ].filter(Boolean).join('\n');
  };

  const handleGenerate = async () => {
    setError(null);
    setPhaseState('generating');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gemini`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ type: 'tasks_bulk', input: buildPrompt() }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'AI generation failed');
      if (!json.result?.phases?.length) throw new Error("The AI didn't return phases — try adding more detail to the brief.");
      setPreview(json.result as AiPreview);

      // Initialize keep map: everything ON by default.
      const keep: Record<string, boolean> = {};
      (json.result.phases as AiPhase[]).forEach((ph, pi) => {
        keep[`p-${pi}`] = true;
        ph.tasks?.forEach((t, ti) => {
          keep[`t-${pi}-${ti}`] = true;
          t.subtasks?.forEach((_, si) => { keep[`s-${pi}-${ti}-${si}`] = true; });
        });
      });
      setKeepMap(keep);
      setPhaseState('preview');
    } catch (err: any) {
      errorLogger.error('proposal tasks AI generate', err);
      setError(err?.message || 'Error generando');
      setPhaseState('error');
    }
  };

  // Resolve "assignee name" → member id (fuzzy, same as Projects.tsx).
  const resolveAssignee = (name?: string | null): string | null => {
    if (!name) return currentUser?.id || null;
    const lower = name.toLowerCase();
    for (const m of members) {
      const keys = [m.name?.toLowerCase(), m.email?.toLowerCase()].filter(Boolean) as string[];
      for (const k of keys) {
        if (k === lower || k.includes(lower) || lower.includes(k)) return m.id;
      }
    }
    return currentUser?.id || null;
  };

  const distributeDate = (phaseStart: string | undefined, phaseEnd: string | undefined, index: number, total: number): string => {
    const fallback = new Date().toISOString().slice(0, 10);
    const start = phaseStart || phaseEnd || fallback;
    const end = phaseEnd || phaseStart || fallback;
    const startMs = new Date(start + 'T00:00:00').getTime();
    const endMs = new Date(end + 'T00:00:00').getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs || total <= 1) return start;
    const spanDays = Math.floor((endMs - startMs) / (1000 * 60 * 60 * 24));
    const step = spanDays / Math.max(total - 1, 1);
    const dayOffset = Math.round(step * index);
    return new Date(startMs + dayOffset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  };

  const handleAccept = async () => {
    if (!preview) return;
    setPhaseState('creating');
    setError(null);
    try {
      // 1. Resolve the target project — create new if mode='new'.
      let targetProjectId = projectId;
      let targetProject: Project | undefined;
      if (mode === 'new') {
        if (!newProjectTitle.trim()) {
          setError('Give the project a title.');
          setPhaseState('preview');
          return;
        }
        const created = await createProject({
          title: newProjectTitle.trim(),
          status: ProjectStatus.Active,
          progress: 0,
          deadline: newProjectDeadline || null as any,
          client_id: proposal?.client_id || null,
          description: proposal?.brief_text?.slice(0, 600) || '',
        } as any);
        targetProjectId = (created as any).id;
        targetProject = created as Project;
      } else {
        targetProject = projects.find(p => p.id === targetProjectId);
      }
      if (!targetProjectId) throw new Error("Couldn't resolve the project");

      // 2. Merge phases into the project's tasksGroups (don't duplicate).
      const existingGroups: any[] = (targetProject as any)?.tasksGroups || [];
      const existingNames = new Set(existingGroups.map((g: any) => g.name));
      const filteredPhases = preview.phases.filter((_, pi) => keepMap[`p-${pi}`] !== false);
      const newGroups = filteredPhases
        .filter(p => !existingNames.has(p.name))
        .map(p => ({ name: p.name, startDate: p.startDate || undefined, endDate: p.endDate || undefined, tasks: [] }));
      if (newGroups.length > 0) {
        // updateProject via supabase directly to keep this self-contained.
        const merged = [...existingGroups, ...newGroups];
        await supabase.from('projects').update({ tasksGroups: merged } as any).eq('id', targetProjectId);
      }

      // 3. Insert tasks + subtasks.
      let totalTasks = 0, totalSubtasks = 0, totalPhases = filteredPhases.length;
      for (let pi = 0; pi < filteredPhases.length; pi++) {
        const ph = filteredPhases[pi];
        const tasksKept = (ph.tasks || []).filter((_, ti) => keepMap[`t-${pi}-${ti}`] !== false);
        for (let ti = 0; ti < tasksKept.length; ti++) {
          const t = tasksKept[ti];
          const taskAssignee = resolveAssignee(t.assignee);
          const taskDueDate = t.dueDate || distributeDate(ph.startDate, ph.endDate, ti, tasksKept.length);
          const { data: insertedTask, error: insErr } = await supabase.from('tasks').insert({
            title: t.title,
            completed: false,
            project_id: targetProjectId,
            client_id: (targetProject as any)?.client_id || null,
            assignee_id: taskAssignee,
            priority: t.priority || 'medium',
            group_name: ph.name,
            start_date: taskDueDate,
            due_date: taskDueDate,
            tenant_id: currentTenant?.id || null,
            owner_id: currentUser?.id || null,
          }).select('id').single();
          if (insErr) {
            errorLogger.error('proposal task insert', insErr);
            continue;
          }
          totalTasks++;

          const subsKept = (t.subtasks || []).filter((_, si) => keepMap[`s-${pi}-${ti}-${si}`] !== false);
          if (subsKept.length > 0 && insertedTask?.id) {
            const parentMs = new Date(taskDueDate + 'T00:00:00').getTime();
            const endMs = ph.endDate ? new Date(ph.endDate + 'T00:00:00').getTime() : null;
            const subRows = subsKept.map((sub, si) => {
              let subDate: string = sub.dueDate || '';
              if (!subDate) {
                const stepped = parentMs + si * 24 * 60 * 60 * 1000;
                const bounded = endMs && stepped > endMs ? endMs : stepped;
                subDate = new Date(bounded).toISOString().slice(0, 10);
              }
              return {
                title: sub.title,
                completed: false,
                project_id: targetProjectId,
                parent_task_id: insertedTask.id,
                priority: 'medium',
                status: 'todo',
                assignee_id: taskAssignee,
                group_name: null,
                start_date: subDate,
                due_date: subDate,
                tenant_id: currentTenant?.id || null,
                owner_id: currentUser?.id || null,
              };
            });
            const { error: subErr } = await supabase.from('tasks').insert(subRows);
            if (subErr) {
              errorLogger.error('proposal subtasks insert', subErr);
            } else {
              totalSubtasks += subRows.length;
            }
          }
        }
      }

      setCounts({ phases: totalPhases, tasks: totalTasks, subtasks: totalSubtasks });
      setResultProjectId(targetProjectId);
      setPhaseState('done');
      onComplete?.(targetProjectId, { phases: totalPhases, tasks: totalTasks, subtasks: totalSubtasks });
    } catch (err: any) {
      errorLogger.error('proposal task generator', err);
      setError(err?.message || 'Error creating tasks');
      setPhaseState('preview');
    }
  };

  const totalCounts = useMemo(() => {
    if (!preview) return { p: 0, t: 0, s: 0 };
    let p = 0, t = 0, s = 0;
    preview.phases.forEach((ph, pi) => {
      if (keepMap[`p-${pi}`] === false) return;
      p++;
      (ph.tasks || []).forEach((tk, ti) => {
        if (keepMap[`t-${pi}-${ti}`] === false) return;
        t++;
        (tk.subtasks || []).forEach((_, si) => {
          if (keepMap[`s-${pi}-${ti}-${si}`] === false) return;
          s++;
        });
      });
    });
    return { p, t, s };
  }, [preview, keepMap]);

  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={onClose}
      width="3xl"
      title="Generate project tasks"
      subtitle="The AI turns this proposal into a delivery plan with phases, tasks, and subtasks."
    >
      <div className="p-6 space-y-5">
        {/* Project picker */}
        {phase === 'idle' || phase === 'error' ? (
          <>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 space-y-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Which project should the tasks go into?
              </div>
              <div className="flex gap-1 p-0.5 bg-zinc-100 dark:bg-zinc-800/60 rounded-md text-[11px]">
                <button
                  onClick={() => setMode('pick')}
                  className={`flex-1 px-3 py-1.5 rounded font-medium ${mode === 'pick'
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-900'}`}
                >
                  Existing project ({projects.length})
                </button>
                <button
                  onClick={() => setMode('new')}
                  className={`flex-1 px-3 py-1.5 rounded font-medium ${mode === 'new'
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-900'}`}
                >
                  + Create new
                </button>
              </div>

              {mode === 'pick' ? (
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-[13px] text-zinc-900 dark:text-zinc-100"
                >
                  <option value="">— pick a project —</option>
                  {sameClientProjects.length > 0 && (
                    <optgroup label="Same client">
                      {sameClientProjects.map(p => (
                        <option key={p.id} value={p.id}>{p.title}</option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="All">
                    {projects.filter(p => !sameClientProjects.includes(p)).map(p => (
                      <option key={p.id} value={p.id}>
                        {p.title}{(p as any).clientName ? ` · ${(p as any).clientName}` : ''}
                      </option>
                    ))}
                  </optgroup>
                </select>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={newProjectTitle}
                    onChange={(e) => setNewProjectTitle(e.target.value)}
                    placeholder="Project title"
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-[13px]"
                  />
                  <input
                    type="date"
                    value={newProjectDeadline}
                    onChange={(e) => setNewProjectDeadline(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-[12px] tabular-nums"
                  />
                </div>
              )}
            </div>

            {error && (
              <div className="text-[12px] text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border border-rose-200/60 dark:border-rose-500/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={(mode === 'pick' && !projectId) || (mode === 'new' && !newProjectTitle.trim())}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[13px] font-semibold hover:opacity-90 disabled:opacity-40"
            >
              <Icons.Sparkles size={14} />
              Generate tasks with AI
            </button>
          </>
        ) : phase === 'generating' ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Icons.RefreshCw size={20} className="animate-spin text-amber-500" />
            <p className="text-[13px] text-zinc-700 dark:text-zinc-200 font-medium">Building the plan…</p>
            <p className="text-[11px] text-zinc-400 text-center max-w-xs">
              The AI is reading the proposal, the tier, the deliverables and building phases with tasks + subtasks assigned to the team.
            </p>
          </div>
        ) : phase === 'preview' && preview ? (
          <>
            <div className="flex items-baseline justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Plan generated · {totalCounts.p} phases · {totalCounts.t} tasks · {totalCounts.s} subtasks
              </div>
              <button
                onClick={() => setPhaseState('idle')}
                className="text-[10px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                ← change project
              </button>
            </div>

            <div className="space-y-2">
              {preview.phases.map((ph, pi) => {
                const phaseKept = keepMap[`p-${pi}`] !== false;
                return (
                  <div
                    key={pi}
                    className={`rounded-lg border ${phaseKept
                      ? 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950'
                      : 'border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/40 dark:bg-zinc-900/30 opacity-60'}`}
                  >
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-100 dark:border-zinc-800/60">
                      <input
                        type="checkbox"
                        checked={phaseKept}
                        onChange={() => setKeepMap(prev => ({ ...prev, [`p-${pi}`]: !phaseKept }))}
                        className="shrink-0"
                      />
                      <span className="text-[12.5px] font-semibold text-zinc-900 dark:text-zinc-100">
                        {ph.name}
                      </span>
                      {(ph.startDate || ph.endDate) && (
                        <span className="text-[10px] text-zinc-400 tabular-nums">
                          · {ph.startDate || '?'} → {ph.endDate || '?'}
                        </span>
                      )}
                      <span className="text-[10px] tabular-nums text-zinc-400 ml-auto">
                        {(ph.tasks || []).length} tasks
                      </span>
                    </div>
                    {phaseKept && (ph.tasks || []).map((tk, ti) => {
                      const taskKept = keepMap[`t-${pi}-${ti}`] !== false;
                      return (
                        <div key={ti} className={`px-3 py-1.5 ${ti > 0 ? 'border-t border-zinc-50 dark:border-zinc-800/40' : ''}`}>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={taskKept}
                              onChange={() => setKeepMap(prev => ({ ...prev, [`t-${pi}-${ti}`]: !taskKept }))}
                              className="shrink-0"
                            />
                            <span className={`text-[12px] flex-1 truncate ${taskKept ? 'text-zinc-800 dark:text-zinc-200' : 'line-through text-zinc-400'}`}>
                              {tk.title}
                            </span>
                            {tk.priority && tk.priority !== 'medium' && (
                              <span className={`text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded ${
                                tk.priority === 'high' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' : 'bg-zinc-100 text-zinc-500'
                              }`}>{tk.priority}</span>
                            )}
                            {tk.assignee && (
                              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate max-w-[100px]">
                                → {tk.assignee}
                              </span>
                            )}
                            {tk.dueDate && (
                              <span className="text-[9px] tabular-nums text-zinc-400">{tk.dueDate.slice(5)}</span>
                            )}
                          </div>
                          {taskKept && (tk.subtasks || []).length > 0 && (
                            <div className="ml-6 mt-1 space-y-0.5">
                              {tk.subtasks!.map((sub, si) => {
                                const subKept = keepMap[`s-${pi}-${ti}-${si}`] !== false;
                                return (
                                  <div key={si} className="flex items-center gap-2 text-[11px]">
                                    <input
                                      type="checkbox"
                                      checked={subKept}
                                      onChange={() => setKeepMap(prev => ({ ...prev, [`s-${pi}-${ti}-${si}`]: !subKept }))}
                                      className="shrink-0 scale-90"
                                    />
                                    <span className={`flex-1 truncate ${subKept ? 'text-zinc-600 dark:text-zinc-400' : 'line-through text-zinc-300'}`}>
                                      ↳ {sub.title}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <button
                onClick={handleGenerate}
                disabled={isWorking}
                className="text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 px-2 py-1 inline-flex items-center gap-1"
              >
                <Icons.RefreshCw size={11} /> Regenerate
              </button>
              <button
                onClick={handleAccept}
                disabled={isWorking || totalCounts.t === 0}
                className="px-3 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[12px] font-semibold hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-1.5"
              >
                {isWorking ? <Icons.RefreshCw size={11} className="animate-spin" /> : <Icons.Check size={11} />}
                Create {totalCounts.t} tasks in the project
              </button>
            </div>
          </>
        ) : phase === 'done' ? (
          <div className="space-y-4 py-6 text-center">
            <div className="inline-flex p-3 rounded-full bg-emerald-50 dark:bg-emerald-500/10">
              <Icons.Check size={20} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">Done!</p>
              <p className="text-[12px] text-zinc-500 mt-1">
                Created <strong>{counts.phases} phases</strong>, <strong>{counts.tasks} tasks</strong> and <strong>{counts.subtasks} subtasks</strong> in the project.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => {
                  if (resultProjectId) {
                    window.dispatchEvent(new CustomEvent('app-navigate', {
                      detail: { page: 'projects', params: { projectId: resultProjectId } },
                    }));
                  }
                  onClose();
                }}
                className="px-3 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[12px] font-semibold hover:opacity-90 inline-flex items-center gap-1"
              >
                <Icons.External size={11} /> Open in project
              </button>
              <button
                onClick={onClose}
                className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
              >
                Close
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </SlidePanel>
  );
};
