import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../ui/Icons';
import { Project } from '../../context/ProjectsContext';
import type { AiPreview } from '../../pages/Projects';

export interface TasksTabProps {
  project: Project;
  projectTasks: any[];
  derivedTasksGroups: { name: string; tasks: any[] }[];
  getSubtasksFor: (taskId: string) => any[];
  // Task handlers
  onToggleTask: (groupIdx: number, taskId: string) => void;
  onDeleteTask: (taskId: string, taskTitle: string) => void;
  onAddTask: (groupIdx: number) => void;
  newTaskTitle: Record<number, string>;
  onNewTaskTitleChange: (val: Record<number, string>) => void;
  // Quick task
  quickTaskTitle: string;
  onQuickTaskTitleChange: (val: string) => void;
  onQuickTask: () => void;
  // Subtasks
  expandedTaskId: string | null;
  onSetExpandedTaskId: (id: string | null) => void;
  newSubtaskTitle: string;
  onNewSubtaskTitleChange: (val: string) => void;
  onAddSubtask: (parentTaskId: string) => void;
  onToggleSubtask: (subtaskId: string, currentCompleted: boolean) => void;
  onDeleteSubtask: (subtaskId: string) => void;
  // Phase management
  newGroupName: string;
  onNewGroupNameChange: (val: string) => void;
  onAddGroup: () => void;
  onDeletePhase: (phaseName: string) => void;
  onUpdatePhaseDate: (phaseName: string, field: 'startDate' | 'endDate', value: string) => void;
  // Task dates & payments
  onUpdateTaskDate: (taskId: string, date: string | null) => void;
  taskPayments: Map<string, { amount: number; status: string }>;
  // AI
  aiPrompt: string;
  onAiPromptChange: (val: string) => void;
  aiGenerating: boolean;
  aiPreview: AiPreview | null;
  onAiPreviewChange: (preview: AiPreview) => void;
  aiError: string | null;
  onAiGenerate: () => void;
  onAiAccept: () => void;
  onAiDiscard: () => void;
  // Error
  taskError: string | null;
}

const formatCurrency = (amount: number) =>
  amount >= 1000 ? `$${(amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 1)}k` : `$${amount}`;

export const TasksTab: React.FC<TasksTabProps> = ({
  project,
  projectTasks,
  derivedTasksGroups,
  getSubtasksFor,
  onToggleTask,
  onDeleteTask,
  onAddTask,
  newTaskTitle,
  onNewTaskTitleChange,
  quickTaskTitle,
  onQuickTaskTitleChange,
  onQuickTask,
  expandedTaskId,
  onSetExpandedTaskId,
  newSubtaskTitle,
  onNewSubtaskTitleChange,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  newGroupName,
  onNewGroupNameChange,
  onAddGroup,
  onDeletePhase,
  onUpdatePhaseDate,
  onUpdateTaskDate,
  taskPayments,
  aiPrompt,
  onAiPromptChange,
  aiGenerating,
  aiPreview,
  onAiPreviewChange,
  aiError,
  onAiGenerate,
  onAiAccept,
  onAiDiscard,
  taskError,
}) => {
  // AI preview edit helpers
  const updatePreviewPhase = (pIdx: number, patch: Partial<AiPreview['phases'][0]>) => {
    if (!aiPreview) return;
    const updated = { ...aiPreview, phases: aiPreview.phases.map((p, i) => i === pIdx ? { ...p, ...patch } : p) };
    onAiPreviewChange(updated);
  };
  const updatePreviewTask = (pIdx: number, tIdx: number, patch: Partial<AiPreview['phases'][0]['tasks'][0]>) => {
    if (!aiPreview) return;
    const phases = aiPreview.phases.map((p, i) => {
      if (i !== pIdx) return p;
      return { ...p, tasks: p.tasks.map((t, j) => j === tIdx ? { ...t, ...patch } : t) };
    });
    onAiPreviewChange({ ...aiPreview, phases });
  };
  const deletePreviewTask = (pIdx: number, tIdx: number) => {
    if (!aiPreview) return;
    const phases = aiPreview.phases.map((p, i) => {
      if (i !== pIdx) return p;
      return { ...p, tasks: p.tasks.filter((_, j) => j !== tIdx) };
    }).filter(p => p.tasks.length > 0);
    onAiPreviewChange({ ...aiPreview, phases });
  };
  const deletePreviewPhase = (pIdx: number) => {
    if (!aiPreview) return;
    onAiPreviewChange({ ...aiPreview, phases: aiPreview.phases.filter((_, i) => i !== pIdx) });
  };
  const updatePreviewSubtask = (pIdx: number, tIdx: number, sIdx: number, patch: { title: string }) => {
    if (!aiPreview) return;
    const phases = aiPreview.phases.map((p, i) => {
      if (i !== pIdx) return p;
      return { ...p, tasks: p.tasks.map((t, j) => {
        if (j !== tIdx || !t.subtasks) return t;
        return { ...t, subtasks: t.subtasks.map((s, k) => k === sIdx ? { ...s, ...patch } : s) };
      }) };
    });
    onAiPreviewChange({ ...aiPreview, phases });
  };
  const deletePreviewSubtask = (pIdx: number, tIdx: number, sIdx: number) => {
    if (!aiPreview) return;
    const phases = aiPreview.phases.map((p, i) => {
      if (i !== pIdx) return p;
      return { ...p, tasks: p.tasks.map((t, j) => {
        if (j !== tIdx || !t.subtasks) return t;
        return { ...t, subtasks: t.subtasks.filter((_, k) => k !== sIdx) };
      }) };
    });
    onAiPreviewChange({ ...aiPreview, phases });
  };
  const addPreviewSubtask = (pIdx: number, tIdx: number) => {
    if (!aiPreview) return;
    const phases = aiPreview.phases.map((p, i) => {
      if (i !== pIdx) return p;
      return { ...p, tasks: p.tasks.map((t, j) => {
        if (j !== tIdx) return t;
        return { ...t, subtasks: [...(t.subtasks || []), { title: '' }] };
      }) };
    });
    onAiPreviewChange({ ...aiPreview, phases });
  };
  return (
    <div className="space-y-6">

      {/* AI Task Generator */}
      <div className="rounded-xl border border-violet-100 dark:border-violet-900/30 bg-gradient-to-br from-violet-50/50 to-white dark:from-violet-950/20 dark:to-zinc-950 overflow-hidden">
        <div className="px-5 py-3.5 flex items-center gap-2 border-b border-violet-100/50 dark:border-violet-900/20">
          <Icons.Sparkles size={14} className="text-violet-500" />
          <span className="text-xs font-bold text-violet-700 dark:text-violet-400 uppercase tracking-wider">AI Task Generator</span>
        </div>
        <div className="p-5 space-y-3">
          <textarea
            value={aiPrompt}
            onChange={e => onAiPromptChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onAiGenerate(); } }}
            placeholder="Describe the work to be done and AI will break it into phases and tasks..."
            rows={2}
            className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 dark:focus:ring-violet-800 resize-none placeholder:text-zinc-400 text-zinc-800 dark:text-zinc-200"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-400">Ctrl+Enter to generate</span>
            <button
              onClick={onAiGenerate}
              disabled={aiGenerating || !aiPrompt.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            >
              {aiGenerating ? (
                <><Icons.Loader size={13} className="animate-spin" /> Generating...</>
              ) : (
                <><Icons.Sparkles size={13} /> Generate tasks</>
              )}
            </button>
          </div>
          {aiError && (
            <div className="flex items-center gap-2 text-xs text-red-500 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded-lg">
              <Icons.AlertCircle size={13} /> {aiError}
            </div>
          )}
        </div>
        {/* AI Preview — fully editable */}
        {aiPreview && (
          <div className="border-t border-violet-100/50 dark:border-violet-900/20">
            <div className="px-5 py-3 flex items-center justify-between bg-violet-50/50 dark:bg-violet-950/10">
              <span className="text-xs font-semibold text-violet-700 dark:text-violet-400">
                {aiPreview.phases.reduce((s, p) => s + p.tasks.length, 0)} tasks
                {(() => { const st = aiPreview.phases.reduce((s, p) => s + p.tasks.reduce((ss, t) => ss + (t.subtasks?.length || 0), 0), 0); return st > 0 ? ` + ${st} subtasks` : ''; })()}
                {' '}in {aiPreview.phases.length} phases
                {aiPreview.phases.some(p => p.budget) && (
                  <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                    · ${aiPreview.phases.reduce((s, p) => s + (p.budget || 0), 0).toLocaleString()}
                  </span>
                )}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={onAiDiscard} className="px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors">
                  Discard
                </button>
                <button
                  onClick={onAiAccept}
                  disabled={aiGenerating || aiPreview.phases.length === 0}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-all disabled:opacity-50 active:scale-95"
                >
                  {aiGenerating ? <Icons.Loader size={12} className="animate-spin" /> : <Icons.Check size={12} />}
                  Accept and create
                </button>
              </div>
            </div>
            <div className="p-5 space-y-5 max-h-[500px] overflow-y-auto">
              {aiPreview.phases.map((phase, pIdx) => (
                <div key={pIdx} className="rounded-lg border border-zinc-100 dark:border-zinc-800 overflow-hidden">
                  {/* Phase header — editable */}
                  <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-900/50 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        value={phase.name}
                        onChange={e => updatePreviewPhase(pIdx, { name: e.target.value })}
                        className="flex-1 text-[11px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider bg-transparent border-b border-transparent hover:border-zinc-300 dark:hover:border-zinc-600 focus:border-violet-400 focus:outline-none px-0 py-0.5"
                      />
                      <button
                        onClick={() => deletePreviewPhase(pIdx)}
                        className="p-1 text-zinc-300 hover:text-red-400 transition-colors"
                        title="Remove phase"
                      >
                        <Icons.X size={12} />
                      </button>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Icons.Calendar size={10} className="text-zinc-400" />
                        <input
                          type="date"
                          value={phase.startDate || ''}
                          onChange={e => updatePreviewPhase(pIdx, { startDate: e.target.value || undefined })}
                          className="text-[10px] text-zinc-500 dark:text-zinc-400 bg-transparent border-b border-dashed border-zinc-200 dark:border-zinc-700 focus:border-violet-400 focus:outline-none px-0.5 py-0 w-[100px]"
                          placeholder="Start"
                        />
                        <span className="text-[10px] text-zinc-300">—</span>
                        <input
                          type="date"
                          value={phase.endDate || ''}
                          onChange={e => updatePreviewPhase(pIdx, { endDate: e.target.value || undefined })}
                          className="text-[10px] text-zinc-500 dark:text-zinc-400 bg-transparent border-b border-dashed border-zinc-200 dark:border-zinc-700 focus:border-violet-400 focus:outline-none px-0.5 py-0 w-[100px]"
                          placeholder="End"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-zinc-400">$</span>
                        <input
                          type="number"
                          value={phase.budget || ''}
                          onChange={e => updatePreviewPhase(pIdx, { budget: Number(e.target.value) || 0 })}
                          className="w-20 text-[10px] text-zinc-500 dark:text-zinc-400 bg-transparent border-b border-dashed border-zinc-200 dark:border-zinc-700 focus:border-emerald-400 focus:outline-none px-0.5 py-0 tabular-nums"
                          placeholder="Budget"
                        />
                      </div>
                    </div>
                  </div>
                  {/* Tasks + Subtasks — editable */}
                  <div className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
                    {phase.tasks.map((task, tIdx) => (
                      <div key={tIdx}>
                        {/* Parent task row */}
                        <div className="group/aitask flex items-center gap-2 px-4 py-2 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/10">
                          <div className="w-4 h-4 rounded-full border-2 border-zinc-200 dark:border-zinc-700 shrink-0" />
                          <input
                            value={task.title}
                            onChange={e => updatePreviewTask(pIdx, tIdx, { title: e.target.value })}
                            className="flex-1 text-sm text-zinc-800 dark:text-zinc-200 bg-transparent border-b border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 focus:border-violet-400 focus:outline-none px-0 py-0.5"
                          />
                          <select
                            value={task.priority}
                            onChange={e => updatePreviewTask(pIdx, tIdx, { priority: e.target.value })}
                            className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border-0 cursor-pointer focus:outline-none ${
                              task.priority === 'high' ? 'bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400'
                                : task.priority === 'medium' ? 'bg-amber-50 text-amber-500 dark:bg-amber-500/10 dark:text-amber-400'
                                : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                            }`}
                          >
                            <option value="high">high</option>
                            <option value="medium">medium</option>
                            <option value="low">low</option>
                          </select>
                          <button
                            onClick={() => addPreviewSubtask(pIdx, tIdx)}
                            className="p-0.5 text-zinc-300 hover:text-violet-500 opacity-0 group-hover/aitask:opacity-100 transition-all"
                            title="Add subtask"
                          >
                            <Icons.Plus size={11} />
                          </button>
                          <button
                            onClick={() => deletePreviewTask(pIdx, tIdx)}
                            className="p-0.5 text-zinc-300 hover:text-red-400 opacity-0 group-hover/aitask:opacity-100 transition-all"
                          >
                            <Icons.X size={11} />
                          </button>
                        </div>
                        {/* Subtask rows */}
                        {task.subtasks && task.subtasks.length > 0 && (
                          <div className="ml-6 border-l-2 border-zinc-100 dark:border-zinc-800">
                            {task.subtasks.map((sub, sIdx) => (
                              <div key={sIdx} className="group/aisub flex items-center gap-2 pl-4 pr-4 py-1.5 hover:bg-zinc-50/30 dark:hover:bg-zinc-800/5">
                                <div className="w-3 h-3 rounded border border-zinc-200 dark:border-zinc-700 shrink-0" />
                                <input
                                  value={sub.title}
                                  onChange={e => updatePreviewSubtask(pIdx, tIdx, sIdx, { title: e.target.value })}
                                  placeholder="Subtask title..."
                                  autoFocus={!sub.title}
                                  className="flex-1 text-xs text-zinc-600 dark:text-zinc-400 bg-transparent border-b border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 focus:border-violet-400 focus:outline-none px-0 py-0.5"
                                />
                                <button
                                  onClick={() => deletePreviewSubtask(pIdx, tIdx, sIdx)}
                                  className="p-0.5 text-zinc-300 hover:text-red-400 opacity-0 group-hover/aisub:opacity-100 transition-all"
                                >
                                  <Icons.X size={10} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error banner */}
      {taskError && (
        <div className="px-4 py-2 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl text-xs text-rose-600 dark:text-rose-400">
          {taskError}
        </div>
      )}

      {/* Summary bar */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{projectTasks.length} tasks</span>
          {projectTasks.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-24 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${projectTasks.length ? Math.round(projectTasks.filter((t: any) => t.completed).length / projectTasks.length * 100) : 0}%` }}
                />
              </div>
              <span className="text-[10px] text-zinc-400 tabular-nums">
                {projectTasks.filter((t: any) => t.completed).length}/{projectTasks.length}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Quick task (pinned) */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-zinc-900/50 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-sm">
        <Icons.Plus size={16} className="text-zinc-400 shrink-0" />
        <input
          value={quickTaskTitle}
          onChange={e => onQuickTaskTitleChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onQuickTask()}
          placeholder="Quick task... (Enter to create)"
          className="flex-1 bg-transparent text-sm text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none"
        />
        {quickTaskTitle.trim() && (
          <button
            onClick={onQuickTask}
            className="px-3 py-1.5 text-[11px] font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:opacity-90 transition-opacity active:scale-95"
          >
            Create
          </button>
        )}
      </div>

      {/* Phase groups */}
      {derivedTasksGroups.map((group: any, gIdx: number) => {
        const doneCount = group.tasks.filter((t: any) => t.done).length;
        const totalCount = group.tasks.length;
        const phasePct = totalCount ? Math.round(doneCount / totalCount * 100) : 0;
        const phaseData = project.tasksGroups.find(g => g.name === group.name);
        return (
          <div key={gIdx} className="group rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 overflow-hidden shadow-sm">
            {/* Phase header */}
            <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${phasePct === 100 && totalCount > 0 ? 'bg-emerald-500' : phasePct > 0 ? 'bg-amber-400' : 'bg-zinc-300 dark:bg-zinc-600'}`} />
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{group.name}</h3>
                  {totalCount > 0 && (
                    <span className="text-[10px] text-zinc-400 tabular-nums bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">{doneCount}/{totalCount}</span>
                  )}
                </div>
                <button
                  onClick={() => onDeletePhase(group.name)}
                  className="p-1 text-zinc-300 dark:text-zinc-600 hover:text-red-400 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                  title="Delete phase"
                >
                  <Icons.X size={14} />
                </button>
              </div>
              {/* Phase date range */}
              <div className="flex items-center gap-2 mt-2 ml-5">
                <Icons.Calendar size={11} className="text-zinc-400 shrink-0" />
                <input
                  type="date"
                  value={phaseData?.startDate || ''}
                  onChange={e => onUpdatePhaseDate(group.name, 'startDate', e.target.value)}
                  className="text-[10px] text-zinc-500 dark:text-zinc-400 bg-transparent border-b border-dashed border-zinc-200 dark:border-zinc-700 focus:border-blue-400 focus:outline-none px-1 py-0.5 w-[110px]"
                  title="Phase start date"
                />
                <span className="text-[10px] text-zinc-300 dark:text-zinc-600">—</span>
                <input
                  type="date"
                  value={phaseData?.endDate || ''}
                  onChange={e => onUpdatePhaseDate(group.name, 'endDate', e.target.value)}
                  className="text-[10px] text-zinc-500 dark:text-zinc-400 bg-transparent border-b border-dashed border-zinc-200 dark:border-zinc-700 focus:border-blue-400 focus:outline-none px-1 py-0.5 w-[110px]"
                  title="Phase end date"
                />
              </div>
            </div>

            {/* Tasks */}
            <div className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
              {group.tasks.map((task: any) => {
                const subs = getSubtasksFor(task.id);
                const subsCompleted = subs.filter((s: any) => s.completed).length;
                const isExpanded = expandedTaskId === task.id;
                const priorityColor = task.priority === 'urgent' ? 'bg-red-500' : task.priority === 'high' ? 'bg-amber-500' : task.priority === 'medium' ? 'bg-blue-500' : 'bg-emerald-500';
                const payment = taskPayments.get(task.id);
                return (
                  <div key={task.id}>
                    <div className="group/task flex items-center gap-3 px-5 py-3 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/20 transition-colors">
                      <button
                        onClick={() => onToggleTask(gIdx, task.id)}
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                          task.done
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : 'border-zinc-300 dark:border-zinc-600 hover:border-emerald-400 text-transparent'
                        }`}
                      >
                        <Icons.Check size={11} strokeWidth={3} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm transition-colors truncate ${task.done ? 'line-through text-zinc-400 dark:text-zinc-500' : 'text-zinc-800 dark:text-zinc-200'}`}>
                            {task.title}
                          </span>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityColor}`} />
                          {payment && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 ${
                              payment.status === 'paid'
                                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                                : payment.status === 'overdue'
                                ? 'bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400'
                                : 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400'
                            }`}>
                              {formatCurrency(payment.amount)} · {payment.status}
                            </span>
                          )}
                        </div>
                        {subs.length > 0 && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <div className="w-12 h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${subs.length ? Math.round(subsCompleted / subs.length * 100) : 0}%` }} />
                            </div>
                            <span className="text-[9px] text-zinc-400 tabular-nums">{subsCompleted}/{subs.length}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <DatePickerButton
                          value={task.dueDate || null}
                          onChange={(date) => onUpdateTaskDate(task.id, date)}
                          done={task.done}
                        />
                        <button
                          onClick={() => onSetExpandedTaskId(isExpanded ? null : task.id)}
                          className={`p-1 rounded-md transition-all ${isExpanded ? 'text-blue-500 bg-blue-50 dark:bg-blue-500/10' : 'text-zinc-300 dark:text-zinc-600 hover:text-zinc-500'}`}
                          title="Subtasks"
                        >
                          <Icons.ChevronDown size={13} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                        <button
                          onClick={() => onDeleteTask(task.id, task.title)}
                          className="p-1 text-zinc-300 dark:text-zinc-600 hover:text-red-400 dark:hover:text-red-400 transition-colors opacity-0 group-hover/task:opacity-100"
                        >
                          <Icons.Trash size={13} />
                        </button>
                      </div>
                    </div>
                    {/* Subtasks panel */}
                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="overflow-hidden"
                        >
                          <div className="pl-12 pr-5 pb-3 space-y-1">
                            {subs.map((sub: any) => (
                              <div key={sub.id} className="flex items-center gap-2 group/sub py-1">
                                <button
                                  onClick={() => onToggleSubtask(sub.id, sub.completed)}
                                  className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                                    sub.completed
                                      ? 'bg-emerald-500 border-emerald-500'
                                      : 'border-zinc-300 dark:border-zinc-600 hover:border-emerald-400'
                                  }`}
                                >
                                  {sub.completed && <Icons.Check size={9} className="text-white" strokeWidth={3} />}
                                </button>
                                <span className={`flex-1 text-xs ${sub.completed ? 'line-through text-zinc-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                                  {sub.title}
                                </span>
                                <button
                                  onClick={() => onDeleteSubtask(sub.id)}
                                  className="p-0.5 text-zinc-300 hover:text-red-400 opacity-0 group-hover/sub:opacity-100 transition-all"
                                >
                                  <Icons.X size={10} />
                                </button>
                              </div>
                            ))}
                            {/* Add subtask input */}
                            <div className="flex items-center gap-2 pt-1">
                              <div className="w-4 h-4 rounded border-2 border-dashed border-zinc-200 dark:border-zinc-700 shrink-0" />
                              <input
                                value={expandedTaskId === task.id ? newSubtaskTitle : ''}
                                onChange={e => onNewSubtaskTitleChange(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') onAddSubtask(task.id); }}
                                placeholder="Add subtask..."
                                className="flex-1 bg-transparent text-xs text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400 focus:outline-none"
                              />
                              {newSubtaskTitle.trim() && (
                                <button
                                  onClick={() => onAddSubtask(task.id)}
                                  className="px-2 py-0.5 text-[10px] font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md hover:opacity-90 transition-opacity"
                                >
                                  +
                                </button>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}

              {/* Add task input */}
              <div className="flex items-center gap-2 px-5 py-2.5">
                <div className="w-5 h-5 rounded-full border-2 border-dashed border-zinc-200 dark:border-zinc-700 shrink-0" />
                <input
                  value={newTaskTitle[gIdx] ?? ''}
                  onChange={e => onNewTaskTitleChange({ ...newTaskTitle, [gIdx]: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && onAddTask(gIdx)}
                  placeholder="Add task..."
                  className="flex-1 bg-transparent text-sm text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none py-1"
                />
                {(newTaskTitle[gIdx] ?? '').trim() && (
                  <button onClick={() => onAddTask(gIdx)} className="px-3 py-1 text-[11px] font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:opacity-90 transition-opacity active:scale-95">
                    Add
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Add phase */}
      <div className="flex items-center gap-2">
        <input
          value={newGroupName}
          onChange={e => onNewGroupNameChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onAddGroup()}
          placeholder="New phase..."
          className="px-4 py-2.5 border border-dashed border-zinc-200 dark:border-zinc-700 rounded-xl text-sm bg-transparent focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 transition-colors"
        />
        {newGroupName.trim() && (
          <button onClick={onAddGroup} className="px-4 py-2.5 text-xs font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl hover:opacity-90 transition-opacity active:scale-95">
            + Add Phase
          </button>
        )}
      </div>

      {/* Empty state */}
      {derivedTasksGroups.length === 0 && projectTasks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
            <Icons.CheckCircle size={24} className="text-zinc-300 dark:text-zinc-600" />
          </div>
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">No tasks yet</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 max-w-xs">
            Use the AI generator to create tasks automatically or add phases manually.
          </p>
        </div>
      )}
    </div>
  );
};

/* ── Inline date picker button ── */
const DatePickerButton: React.FC<{
  value: string | null;
  onChange: (date: string | null) => void;
  done: boolean;
}> = ({ value, onChange, done }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const isOverdue = value && new Date(value) < new Date(new Date().toISOString().slice(0, 10)) && !done;

  return (
    <div className="relative">
      <button
        onClick={() => inputRef.current?.showPicker()}
        className={`text-[10px] px-2 py-0.5 rounded-full font-mono transition-colors ${
          !value
            ? 'text-zinc-400 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            : isOverdue
            ? 'text-red-500 bg-red-50 dark:bg-red-500/10 font-semibold'
            : 'text-zinc-400 bg-zinc-100 dark:bg-zinc-800'
        }`}
      >
        {value
          ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
          : 'Set date'}
      </button>
      <input
        ref={inputRef}
        type="date"
        value={value || ''}
        onChange={e => onChange(e.target.value || null)}
        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        tabIndex={-1}
      />
    </div>
  );
};
