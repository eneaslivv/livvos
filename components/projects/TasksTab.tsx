import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from '../ui/Icons';
import { Project } from '../../context/ProjectsContext';
import type { AiPreview } from '../../pages/Projects';
import { parseLocalDate, todayLocal } from '../../lib/dateUtils';

export interface TasksTabProps {
  project: Project;
  projectTasks: any[];
  derivedTasksGroups: { name: string; tasks: any[] }[];
  getSubtasksFor: (taskId: string) => any[];
  // Task handlers
  onToggleTask: (groupIdx: number, taskId: string) => void;
  onDeleteTask: (taskId: string, taskTitle: string) => void;
  onAddTask: (groupIdx: number) => void;
  /** Open the full task detail panel (same as clicking a board card). */
  onOpenTask?: (taskId: string) => void;
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
  /** Role gates — structural edits (add/edit phases & tasks). Completing a
   *  task stays always-on: assignment-scoped RLS enforces it server-side. */
  canEdit?: boolean;
  canDelete?: boolean;
  /** Drag-to-reorder — receives the dragged id, the stage it was dropped
   *  into, and the full displayed id sequence of that stage. Absent =
   *  dragging disabled (viewers, mobile callers). */
  onReorderTask?: (taskId: string, targetGroupName: string, orderedIds: string[]) => void;
}

const formatCurrency = (amount: number) =>
  amount >= 1000 ? `$${(amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 1)}k` : `$${amount}`;

/* Signature motion curve for every micro-interaction in this tab. */
const EASE_SOFT = [0.16, 1, 0.3, 1] as const;

/* ── Animated check circle — the Asana moment ─────────────────────
   Spring pop on tap, SVG path draw on complete, and a one-shot pulse
   ring so finishing a task feels like an event, not a state change. */
const CheckCircle: React.FC<{
  done: boolean;
  size?: number;
  onToggle: () => void;
}> = ({ done, size = 20, onToggle }) => {
  const [burst, setBurst] = useState(0);
  return (
    <motion.button
      onClick={(e) => {
        e.stopPropagation();
        if (!done) setBurst(b => b + 1);
        onToggle();
      }}
      whileTap={{ scale: 0.8 }}
      whileHover={{ scale: 1.08 }}
      transition={{ type: 'spring', stiffness: 500, damping: 22 }}
      className="relative flex items-center justify-center shrink-0 rounded-full group/check"
      style={{
        width: size, height: size,
        border: done ? '1.5px solid var(--ok)' : '1.5px solid var(--os-border-2)',
        background: done ? 'var(--ok)' : 'transparent',
        transition: 'background 0.25s cubic-bezier(0.16,1,0.3,1), border-color 0.25s',
        cursor: 'pointer',
      }}
      title={done ? 'Reopen task' : 'Mark complete'}
    >
      {/* Pulse ring on completion */}
      <AnimatePresence>
        {burst > 0 && done && (
          <motion.span
            key={burst}
            initial={{ scale: 0.6, opacity: 0.7 }}
            animate={{ scale: 2.1, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{ border: '1.5px solid var(--ok)' }}
          />
        )}
      </AnimatePresence>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none">
        <motion.path
          d="M5 13l4 4L19 7"
          stroke={done ? '#fff' : 'var(--ok)'}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className={done ? '' : 'group-hover/check:!opacity-40'}
        />
      </svg>
    </motion.button>
  );
};

/* ── Priority dot — warm editorial palette ── */
const priorityColor = (p?: string) =>
  p === 'urgent' ? 'var(--err)'
  : p === 'high' ? 'var(--warn)'
  : p === 'low' ? 'var(--os-fg-3)'
  : 'var(--sky)';

export const TasksTab: React.FC<TasksTabProps> = ({
  project,
  projectTasks,
  derivedTasksGroups,
  getSubtasksFor,
  onToggleTask,
  onDeleteTask,
  onAddTask,
  onOpenTask,
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
  canEdit = true,
  canDelete = true,
  onReorderTask,
}) => {
  // ── Steps structure ──────────────────────────────────────────
  // Phases read as numbered, collapsible steps. Fully-completed phases
  // start collapsed so the CURRENT step is what you land on.
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set());
  const collapseInitRef = useRef(false);
  useEffect(() => {
    if (collapseInitRef.current || derivedTasksGroups.length === 0) return;
    collapseInitRef.current = true;
    const doneNames = derivedTasksGroups
      .filter((g: any) => g.tasks.length > 0 && g.tasks.every((t: any) => t.done))
      .map((g: any) => g.name);
    if (doneNames.length) setCollapsedPhases(new Set(doneNames));
  }, [derivedTasksGroups]);
  const togglePhase = (name: string) =>
    setCollapsedPhases(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });

  // ── Optimistic completion ────────────────────────────────────
  // The server round-trip (update + realtime/refresh) takes ~1s; the check
  // must react NOW. We keep a local override per task id and drop it once
  // props catch up with the intended value.
  const [pendingDone, setPendingDone] = useState<Map<string, boolean>>(new Map());
  useEffect(() => {
    if (pendingDone.size === 0) return;
    const settled: string[] = [];
    for (const g of derivedTasksGroups) {
      for (const t of g.tasks) {
        const want = pendingDone.get(t.id);
        if (want !== undefined && !!t.done === want) settled.push(t.id);
        for (const s of getSubtasksFor(t.id)) {
          const sWant = pendingDone.get(s.id);
          if (sWant !== undefined && !!s.completed === sWant) settled.push(s.id);
        }
      }
    }
    if (settled.length) {
      setPendingDone(prev => {
        const next = new Map(prev);
        settled.forEach(id => next.delete(id));
        return next;
      });
    }
  }, [derivedTasksGroups, pendingDone, getSubtasksFor]);
  const effectiveDone = (t: any) => pendingDone.get(t.id) ?? !!t.done;
  const handleToggle = (gIdx: number, task: any) => {
    const next = !effectiveDone(task);
    setPendingDone(prev => new Map(prev).set(task.id, next));
    onToggleTask(gIdx, task.id);
    // Safety net: if the server rejects the write (RLS) the props never
    // settle — drop the override so the row snaps back to server truth.
    scheduleOptimisticExpiry(task.id);
  };
  const scheduleOptimisticExpiry = (id: string) => {
    setTimeout(() => {
      setPendingDone(prev => {
        if (!prev.has(id)) return prev;
        const cleaned = new Map(prev);
        cleaned.delete(id);
        return cleaned;
      });
    }, 5000);
  };
  const handleToggleSub = (sub: any) => {
    const next = !(pendingDone.get(sub.id) ?? !!sub.completed);
    setPendingDone(prev => new Map(prev).set(sub.id, next));
    onToggleSubtask(sub.id, sub.completed);
    scheduleOptimisticExpiry(sub.id);
  };

  // ── Drag-to-reorder ──────────────────────────────────────────
  // HTML5 DnD armed from the grip handle only (so row clicks/inputs never
  // start an accidental drag). Optimistic: `orderOverride` renders the new
  // sequence instantly while the parent renumbers order_index server-side;
  // `pendingGroupMove` relocates a cross-stage task until group_name lands.
  const [dragArmedId, setDragArmedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ group: string; index: number } | null>(null);
  const [orderOverride, setOrderOverride] = useState<Map<string, string[]>>(new Map());
  const [pendingGroupMove, setPendingGroupMove] = useState<Map<string, string>>(new Map());

  // Settle: drop the overrides once server truth matches what we rendered.
  useEffect(() => {
    if (orderOverride.size === 0 && pendingGroupMove.size === 0) return;
    const byId = new Map<string, any>();
    const groupOf = new Map<string, string>();
    for (const g of derivedTasksGroups) {
      for (const t of g.tasks) { byId.set(t.id, t); groupOf.set(t.id, g.name); }
    }
    setPendingGroupMove(prev => {
      let changed = false;
      const next = new Map(prev);
      for (const [id, target] of prev) {
        if (groupOf.get(id) === target) { next.delete(id); changed = true; }
      }
      return changed ? next : prev;
    });
    setOrderOverride(prev => {
      let changed = false;
      const next = new Map(prev);
      for (const [groupName, ids] of prev) {
        const settled = ids.every((id, idx) => {
          const t = byId.get(id);
          return t && (t.order ?? 0) === (idx + 1) * 1000;
        });
        if (settled) { next.delete(groupName); changed = true; }
      }
      return changed ? next : prev;
    });
  }, [derivedTasksGroups, orderOverride, pendingGroupMove]);

  // Groups as rendered: cross-stage pending moves relocate the task NOW,
  // not after the server round-trip.
  const renderGroups = React.useMemo(() => {
    if (pendingGroupMove.size === 0) return derivedTasksGroups;
    const all: Array<{ from: string; task: any }> = [];
    for (const g of derivedTasksGroups) for (const t of g.tasks) all.push({ from: g.name, task: t });
    return derivedTasksGroups.map(g => ({
      ...g,
      tasks: [
        ...g.tasks.filter((t: any) => (pendingGroupMove.get(t.id) ?? g.name) === g.name),
        ...all.filter(e => e.from !== g.name && pendingGroupMove.get(e.task.id) === g.name).map(e => e.task),
      ],
    }));
  }, [derivedTasksGroups, pendingGroupMove]);

  const completeDrop = (targetGroup: string, opens: any[], dones: any[]) => {
    if (!draggingId || !dropTarget || !onReorderTask) return;
    const openIds = opens.map(t => t.id);
    const fromIdx = openIds.indexOf(draggingId);
    let insertAt = Math.max(0, Math.min(dropTarget.index, openIds.length));
    const without = openIds.filter(id => id !== draggingId);
    if (fromIdx !== -1 && fromIdx < insertAt) insertAt -= 1;
    const newOpenIds = [...without.slice(0, insertAt), draggingId, ...without.slice(insertAt)];
    if (fromIdx !== -1 && newOpenIds.join() === openIds.join()) {
      // Same-group no-op drop.
      setDraggingId(null); setDragArmedId(null); setDropTarget(null);
      return;
    }
    setOrderOverride(prev => new Map(prev).set(targetGroup, newOpenIds));
    if (fromIdx === -1) setPendingGroupMove(prev => new Map(prev).set(draggingId, targetGroup));
    onReorderTask(draggingId, targetGroup, [...newOpenIds, ...dones.map(t => t.id)]);
    // Fallback: never leave stale overrides if the writes are rejected.
    const droppedId = draggingId;
    setTimeout(() => {
      setOrderOverride(prev => { if (!prev.has(targetGroup)) return prev; const n = new Map(prev); n.delete(targetGroup); return n; });
      setPendingGroupMove(prev => { if (!prev.has(droppedId)) return prev; const n = new Map(prev); n.delete(droppedId); return n; });
    }, 6000);
    setDraggingId(null); setDragArmedId(null); setDropTarget(null);
  };

  // First phase with open work = the step the project is ON.
  const currentStepIdx = derivedTasksGroups.findIndex((g: any) => g.tasks.some((t: any) => !effectiveDone(t)));
  const doneTotal = projectTasks.filter((t: any) => pendingDone.get(t.id) ?? t.completed).length;

  // The AI generator is great on an empty project but eats half the
  // viewport once real phases exist — collapse it to a slim trigger.
  const [aiOpen, setAiOpen] = useState(false);
  const showAiBlock = canEdit && (aiOpen || !!aiPreview || projectTasks.length === 0);

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
    <div className="space-y-5">

      {/* AI Task Generator — full block on empty projects / when opened;
          slim trigger once real tasks exist so the steps own the page. */}
      {canEdit && !showAiBlock && (
        <motion.button
          onClick={() => setAiOpen(true)}
          whileTap={{ scale: 0.99 }}
          className="w-full flex items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-[var(--accent-soft)]"
          style={{ borderRadius: 12, border: '1px dashed var(--accent-strong)', color: 'var(--fg-gold)' }}
        >
          <Icons.Sparkles size={13} />
          <span className="text-xs font-semibold uppercase tracking-wider">AI Task Generator</span>
          <span className="text-[11px] normal-case font-normal" style={{ color: 'var(--os-fg-3)' }}>— describe work, get phases &amp; tasks</span>
          <Icons.ChevronDown size={13} className="ml-auto" />
        </motion.button>
      )}
      {showAiBlock && (
      <div className="overflow-hidden" style={{ borderRadius: 14, border: '0.5px solid var(--accent-strong)', background: 'var(--os-panel)', boxShadow: 'var(--shadow-card)' }}>
        <div className="px-5 py-3.5 flex items-center gap-2" style={{ borderBottom: '0.5px solid var(--os-divider)', background: 'var(--accent-soft)' }}>
          <Icons.Sparkles size={14} style={{ color: 'var(--fg-gold)' }} />
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--fg-gold)' }}>AI Task Generator</span>
        </div>
        <div className="p-5 space-y-3">
          <textarea
            value={aiPrompt}
            onChange={e => onAiPromptChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onAiGenerate(); } }}
            placeholder="Describe the work to be done and AI will break it into phases and tasks..."
            rows={2}
            className="w-full px-4 py-3 text-sm focus:outline-none resize-none"
            style={{ background: 'var(--os-surface)', border: '0.5px solid var(--os-border-2)', borderRadius: 12, color: 'var(--os-fg-0)' }}
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px]" style={{ color: 'var(--os-fg-3)' }}>Ctrl+Enter to generate</span>
            <motion.button
              onClick={onAiGenerate}
              disabled={aiGenerating || !aiPrompt.trim()}
              whileTap={{ scale: 0.96 }}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'var(--os-ink)', color: 'var(--livv-cream-50)', borderRadius: 999 }}
            >
              {aiGenerating ? (
                <><Icons.Loader size={13} className="animate-spin" /> Generating...</>
              ) : (
                <><Icons.Sparkles size={13} /> Generate tasks</>
              )}
            </motion.button>
          </div>
          {aiError && (
            <div className="flex items-center gap-2 text-xs px-3 py-2" style={{ color: 'var(--err)', background: 'rgba(239,68,68,0.07)', borderRadius: 10 }}>
              <Icons.AlertCircle size={13} /> {aiError}
            </div>
          )}
        </div>
        {/* AI Preview — fully editable */}
        {aiPreview && (
          <div style={{ borderTop: '0.5px solid var(--os-divider)' }}>
            <div className="px-5 py-3 flex items-center justify-between" style={{ background: 'var(--accent-soft)' }}>
              <span className="text-xs font-semibold" style={{ color: 'var(--fg-gold)' }}>
                {aiPreview.phases.reduce((s, p) => s + p.tasks.length, 0)} tasks
                {(() => { const st = aiPreview.phases.reduce((s, p) => s + p.tasks.reduce((ss, t) => ss + (t.subtasks?.length || 0), 0), 0); return st > 0 ? ` + ${st} subtasks` : ''; })()}
                {' '}in {aiPreview.phases.length} phases
                {aiPreview.phases.some(p => p.budget) && (
                  <span className="ml-2" style={{ color: 'var(--ok)' }}>
                    · ${aiPreview.phases.reduce((s, p) => s + (p.budget || 0), 0).toLocaleString()}
                  </span>
                )}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={onAiDiscard} className="px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-70" style={{ color: 'var(--os-fg-2)' }}>
                  Discard
                </button>
                <motion.button
                  onClick={onAiAccept}
                  disabled={aiGenerating || aiPreview.phases.length === 0}
                  whileTap={{ scale: 0.96 }}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-50"
                  style={{ background: 'var(--ok)', color: '#fff', borderRadius: 999 }}
                >
                  {aiGenerating ? <Icons.Loader size={12} className="animate-spin" /> : <Icons.Check size={12} />}
                  Accept and create
                </motion.button>
              </div>
            </div>
            <div className="p-5 space-y-5">
              {aiPreview.phases.map((phase, pIdx) => (
                <div key={pIdx} className="overflow-hidden" style={{ borderRadius: 12, border: '0.5px solid var(--os-border-2)' }}>
                  {/* Phase header — editable */}
                  <div className="px-4 py-3 space-y-2" style={{ background: 'var(--os-surface)' }}>
                    <div className="flex items-center gap-2">
                      <input
                        value={phase.name}
                        onChange={e => updatePreviewPhase(pIdx, { name: e.target.value })}
                        className="flex-1 text-[11px] font-bold uppercase tracking-wider bg-transparent border-b border-transparent focus:outline-none px-0 py-0.5"
                        style={{ color: 'var(--os-fg-1)' }}
                      />
                      <button
                        onClick={() => deletePreviewPhase(pIdx)}
                        className="p-1 transition-colors hover:!text-[var(--err)]"
                        style={{ color: 'var(--os-fg-3)' }}
                        title="Remove phase"
                      >
                        <Icons.X size={12} />
                      </button>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Icons.Calendar size={10} style={{ color: 'var(--os-fg-3)' }} />
                        <input
                          type="date"
                          value={phase.startDate || ''}
                          onChange={e => updatePreviewPhase(pIdx, { startDate: e.target.value || undefined })}
                          className="text-[11px] bg-transparent border-b border-dashed focus:outline-none px-1 py-0.5 w-[130px] cursor-pointer"
                          style={{ color: 'var(--os-fg-2)', borderColor: 'var(--os-border-2)' }}
                        />
                        <span className="text-[10px]" style={{ color: 'var(--os-fg-3)' }}>—</span>
                        <input
                          type="date"
                          value={phase.endDate || ''}
                          onChange={e => updatePreviewPhase(pIdx, { endDate: e.target.value || undefined })}
                          className="text-[11px] bg-transparent border-b border-dashed focus:outline-none px-1 py-0.5 w-[130px] cursor-pointer"
                          style={{ color: 'var(--os-fg-2)', borderColor: 'var(--os-border-2)' }}
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px]" style={{ color: 'var(--os-fg-3)' }}>$</span>
                        <input
                          type="number"
                          value={phase.budget || ''}
                          onChange={e => updatePreviewPhase(pIdx, { budget: Number(e.target.value) || 0 })}
                          className="w-20 text-[10px] bg-transparent border-b border-dashed focus:outline-none px-0.5 py-0 tabular-nums"
                          style={{ color: 'var(--os-fg-2)', borderColor: 'var(--os-border-2)' }}
                          placeholder="Budget"
                        />
                      </div>
                    </div>
                  </div>
                  {/* Tasks + Subtasks — editable */}
                  <div>
                    {phase.tasks.map((task, tIdx) => (
                      <div key={tIdx} style={{ borderTop: tIdx > 0 ? '0.5px solid var(--os-divider)' : undefined }}>
                        {/* Parent task row */}
                        <div className="group/aitask flex items-center gap-2 px-4 py-2 transition-colors hover:bg-[var(--os-surface)]">
                          <div className="w-4 h-4 rounded-full shrink-0" style={{ border: '1.5px solid var(--os-border-2)' }} />
                          <input
                            value={task.title}
                            onChange={e => updatePreviewTask(pIdx, tIdx, { title: e.target.value })}
                            className="flex-1 text-sm bg-transparent border-b border-transparent focus:outline-none px-0 py-0.5"
                            style={{ color: 'var(--os-fg-0)' }}
                          />
                          {(task as any).dueDate && (
                            <input
                              type="date"
                              value={(task as any).dueDate}
                              onChange={e => updatePreviewTask(pIdx, tIdx, { dueDate: e.target.value } as any)}
                              className="text-[10px] bg-transparent border-b border-dashed focus:outline-none px-0.5 py-0 w-24"
                              style={{ color: 'var(--os-fg-3)', borderColor: 'var(--os-border-2)' }}
                            />
                          )}
                          {(task as any).assignee && (
                            <span className="text-[9px] px-1.5 py-0.5 truncate max-w-[80px]" style={{ borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--fg-gold)' }} title={(task as any).assignee}>
                              {(task as any).assignee}
                            </span>
                          )}
                          <select
                            value={task.priority}
                            onChange={e => updatePreviewTask(pIdx, tIdx, { priority: e.target.value })}
                            className="text-[10px] px-1.5 py-0.5 font-medium border-0 cursor-pointer focus:outline-none"
                            style={{ borderRadius: 999, background: 'var(--os-surface)', color: priorityColor(task.priority) }}
                          >
                            <option value="high">high</option>
                            <option value="medium">medium</option>
                            <option value="low">low</option>
                          </select>
                          <button
                            onClick={() => addPreviewSubtask(pIdx, tIdx)}
                            className="p-0.5 opacity-0 group-hover/aitask:opacity-100 transition-all hover:!text-[var(--fg-gold)]"
                            style={{ color: 'var(--os-fg-3)' }}
                            title="Add subtask"
                          >
                            <Icons.Plus size={11} />
                          </button>
                          <button
                            onClick={() => deletePreviewTask(pIdx, tIdx)}
                            className="p-0.5 opacity-0 group-hover/aitask:opacity-100 transition-all hover:!text-[var(--err)]"
                            style={{ color: 'var(--os-fg-3)' }}
                          >
                            <Icons.X size={11} />
                          </button>
                        </div>
                        {/* Subtask rows */}
                        {task.subtasks && task.subtasks.length > 0 && (
                          <div className="ml-6" style={{ borderLeft: '2px solid var(--os-divider)' }}>
                            {task.subtasks.map((sub, sIdx) => (
                              <div key={sIdx} className="group/aisub flex items-center gap-2 pl-4 pr-4 py-1.5 transition-colors hover:bg-[var(--os-surface)]">
                                <div className="w-3 h-3 rounded shrink-0" style={{ border: '1px solid var(--os-border-2)' }} />
                                <input
                                  value={sub.title}
                                  onChange={e => updatePreviewSubtask(pIdx, tIdx, sIdx, { title: e.target.value })}
                                  placeholder="Subtask title..."
                                  autoFocus={!sub.title}
                                  className="flex-1 text-xs bg-transparent border-b border-transparent focus:outline-none px-0 py-0.5"
                                  style={{ color: 'var(--os-fg-1)' }}
                                />
                                <button
                                  onClick={() => deletePreviewSubtask(pIdx, tIdx, sIdx)}
                                  className="p-0.5 opacity-0 group-hover/aisub:opacity-100 transition-all hover:!text-[var(--err)]"
                                  style={{ color: 'var(--os-fg-3)' }}
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
        {/* Collapse back to the slim trigger (only when it was opened
            manually — empty projects keep it pinned). */}
        {projectTasks.length > 0 && !aiPreview && (
          <button
            onClick={() => setAiOpen(false)}
            className="w-full px-5 py-2 text-[10px] font-medium transition-colors hover:opacity-70"
            style={{ color: 'var(--os-fg-3)', borderTop: '0.5px solid var(--os-divider)' }}
          >
            Hide generator
          </button>
        )}
      </div>
      )}

      {/* Error banner */}
      <AnimatePresence>
        {taskError && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="px-4 py-2 text-xs"
            style={{ background: 'rgba(239,68,68,0.07)', border: '0.5px solid rgba(239,68,68,0.25)', borderRadius: 12, color: 'var(--err)' }}
          >
            {taskError}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Summary bar */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold" style={{ color: 'var(--os-fg-0)' }}>{projectTasks.length} tasks</span>
          {projectTasks.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--os-surface)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: 'var(--ok)' }}
                  animate={{ width: `${projectTasks.length ? Math.round(doneTotal / projectTasks.length * 100) : 0}%` }}
                  transition={{ duration: 0.5, ease: EASE_SOFT }}
                />
              </div>
              <span className="text-[10px] tabular-nums" style={{ fontFamily: 'var(--font-mono)', color: 'var(--os-fg-3)' }}>
                {doneTotal}/{projectTasks.length}
              </span>
            </div>
          )}
        </div>
        {/* Where the project is right now */}
        {currentStepIdx >= 0 && derivedTasksGroups.length > 0 && (
          <span className="text-[11px]" style={{ color: 'var(--os-fg-2)' }}>
            <span className="font-semibold tabular-nums" style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-gold)' }}>
              Step {String(currentStepIdx + 1).padStart(2, '0')}/{String(derivedTasksGroups.length).padStart(2, '0')}
            </span>
            {' · '}
            <span className="font-medium" style={{ color: 'var(--os-fg-1)' }}>{derivedTasksGroups[currentStepIdx].name}</span>
          </span>
        )}
      </div>

      {/* Quick task (pinned) */}
      {canEdit && (
      <div
        className="flex items-center gap-3 px-4 py-3 transition-shadow focus-within:shadow-[var(--shadow-sm)]"
        style={{ background: 'var(--os-panel)', border: '0.5px solid var(--os-border-2)', borderRadius: 14, boxShadow: 'var(--shadow-card)' }}
      >
        <Icons.Plus size={16} style={{ color: 'var(--os-fg-3)' }} className="shrink-0" />
        <input
          value={quickTaskTitle}
          onChange={e => onQuickTaskTitleChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onQuickTask()}
          placeholder="Quick task... (Enter to create)"
          className="flex-1 bg-transparent text-sm focus:outline-none"
          style={{ color: 'var(--os-fg-0)' }}
        />
        <AnimatePresence>
          {quickTaskTitle.trim() && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              whileTap={{ scale: 0.94 }}
              onClick={onQuickTask}
              className="px-3 py-1.5 text-[11px] font-semibold"
              style={{ background: 'var(--os-ink)', color: 'var(--livv-cream-50)', borderRadius: 999 }}
            >
              Create
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      )}

      {/* Phase groups — numbered, collapsible steps */}
      {renderGroups.map((group: any, gIdx: number) => {
        const doneCount = group.tasks.filter((t: any) => effectiveDone(t)).length;
        const totalCount = group.tasks.length;
        const phasePct = totalCount ? Math.round(doneCount / totalCount * 100) : 0;
        const phaseData = project.tasksGroups.find(g => g.name === group.name);
        const isCollapsed = collapsedPhases.has(group.name);
        const isCurrent = gIdx === currentStepIdx;
        const isDone = totalCount > 0 && doneCount === totalCount;
        // Open work first (manual order, or the optimistic drag override);
        // finished tasks sink to the bottom of the step.
        const override = orderOverride.get(group.name);
        let opens = group.tasks.filter((t: any) => !effectiveDone(t));
        const dones = group.tasks.filter((t: any) => effectiveDone(t));
        if (override) {
          const pos = new Map(override.map((id: string, i: number) => [id, i]));
          opens = [...opens].sort((a: any, b: any) => (pos.get(a.id) ?? 999) - (pos.get(b.id) ?? 999));
        }
        const orderedTasks = [...opens, ...dones];
        const isDropGroup = dropTarget?.group === group.name && !!draggingId;
        return (
          <div
            key={group.name}
            className="group overflow-hidden"
            style={{
              background: 'var(--os-panel)',
              border: isCurrent ? '0.5px solid var(--accent-strong)' : '0.5px solid var(--os-border-2)',
              borderRadius: 14,
              boxShadow: isCurrent ? '0 0 0 3px var(--accent-soft), var(--shadow-card)' : 'var(--shadow-card)',
              transition: 'border-color 0.3s, box-shadow 0.3s',
            }}
          >
            {/* Phase header — click anywhere to collapse/expand; also a drop
                target so a task can be dragged onto a collapsed stage. */}
            <div
              onClick={() => togglePhase(group.name)}
              onDragOver={(e) => {
                if (!draggingId || !onReorderTask) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDropTarget({ group: group.name, index: Number.MAX_SAFE_INTEGER });
              }}
              onDrop={(e) => { e.preventDefault(); completeDrop(group.name, opens, dones); }}
              className="px-5 py-3.5 cursor-pointer select-none transition-colors hover:bg-[var(--os-surface)]"
              style={{
                borderBottom: isCollapsed ? undefined : '0.5px solid var(--os-divider)',
                background: isDropGroup && isCollapsed ? 'var(--accent-soft)' : isCurrent ? 'var(--accent-soft)' : 'var(--os-surface-2)',
                boxShadow: isDropGroup && isCollapsed ? 'inset 0 0 0 1.5px var(--accent-strong)' : undefined,
              }}
            >
              <div className="flex items-center gap-3">
                <motion.span
                  animate={{ rotate: isCollapsed ? -90 : 0 }}
                  transition={{ duration: 0.25, ease: EASE_SOFT }}
                  className="shrink-0 flex"
                  style={{ color: 'var(--os-fg-3)' }}
                >
                  <Icons.ChevronDown size={14} />
                </motion.span>
                {/* Step number — editorial mono */}
                <span
                  className="text-[11px] font-semibold tabular-nums shrink-0"
                  style={{ fontFamily: 'var(--font-mono)', color: isDone ? 'var(--ok)' : isCurrent ? 'var(--fg-gold)' : 'var(--os-fg-3)' }}
                >
                  {String(gIdx + 1).padStart(2, '0')}
                </span>
                <h3 className="text-sm font-bold truncate" style={{ color: isDone ? 'var(--os-fg-3)' : 'var(--os-fg-0)' }}>
                  {group.name}
                </h3>
                {isCurrent && (
                  <span
                    className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 shrink-0"
                    style={{ borderRadius: 999, background: 'var(--accent-strong)', color: 'var(--livv-wine-500)' }}
                  >
                    Current
                  </span>
                )}
                {isDone && <Icons.Check size={13} strokeWidth={3} className="shrink-0" style={{ color: 'var(--ok)' }} />}

                <div className="ml-auto flex items-center gap-3 shrink-0">
                  {totalCount > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1 rounded-full overflow-hidden hidden sm:block" style={{ background: 'var(--os-surface)' }}>
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: isDone ? 'var(--ok)' : 'var(--accent)' }}
                          animate={{ width: `${phasePct}%` }}
                          transition={{ duration: 0.5, ease: EASE_SOFT }}
                        />
                      </div>
                      <span className="text-[10px] tabular-nums" style={{ fontFamily: 'var(--font-mono)', color: 'var(--os-fg-3)' }}>{doneCount}/{totalCount}</span>
                    </div>
                  )}
                  {canDelete && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeletePhase(group.name); }}
                      className="p-1 transition-all opacity-0 group-hover:opacity-100 hover:!text-[var(--err)]"
                      style={{ color: 'var(--os-fg-3)' }}
                      title="Delete phase"
                    >
                      <Icons.X size={14} />
                    </button>
                  )}
                </div>
              </div>
              {/* Phase date range — only when expanded */}
              {!isCollapsed && (
                <div className="flex items-center gap-2 mt-2 ml-12" onClick={e => e.stopPropagation()}>
                  <Icons.Calendar size={11} style={{ color: 'var(--os-fg-3)' }} className="shrink-0" />
                  <input
                    type="date"
                    value={phaseData?.startDate || ''}
                    onChange={e => onUpdatePhaseDate(group.name, 'startDate', e.target.value)}
                    disabled={!canEdit}
                    className="text-[10px] bg-transparent border-b border-dashed focus:outline-none px-1 py-0.5 w-[110px] disabled:cursor-default"
                    style={{ color: 'var(--os-fg-2)', borderColor: 'var(--os-border-2)' }}
                    title="Phase start date"
                  />
                  <span className="text-[10px]" style={{ color: 'var(--os-fg-3)' }}>—</span>
                  <input
                    type="date"
                    value={phaseData?.endDate || ''}
                    onChange={e => onUpdatePhaseDate(group.name, 'endDate', e.target.value)}
                    disabled={!canEdit}
                    className="text-[10px] bg-transparent border-b border-dashed focus:outline-none px-1 py-0.5 w-[110px] disabled:cursor-default"
                    style={{ color: 'var(--os-fg-2)', borderColor: 'var(--os-border-2)' }}
                    title="Phase end date"
                  />
                </div>
              )}
            </div>

            {/* Tasks — animated collapse + layout-animated rows */}
            <AnimatePresence initial={false}>
              {!isCollapsed && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: EASE_SOFT }}
                  className="overflow-hidden"
                  onDragOver={(e) => {
                    if (!draggingId || !onReorderTask) return;
                    e.preventDefault();
                    // Empty space fallback — rows overwrite this with a
                    // precise index via their own onDragOver.
                    if (!dropTarget || dropTarget.group !== group.name) {
                      setDropTarget({ group: group.name, index: opens.length });
                    }
                  }}
                  onDrop={(e) => { e.preventDefault(); completeDrop(group.name, opens, dones); }}
                >
              {orderedTasks.map((task: any, rowIdx: number) => {
                const done = effectiveDone(task);
                const subs = getSubtasksFor(task.id);
                const subsCompleted = subs.filter((s: any) => pendingDone.get(s.id) ?? s.completed).length;
                const isExpanded = expandedTaskId === task.id;
                const payment = taskPayments.get(task.id);
                const showDropLineAbove = isDropGroup && (
                  (rowIdx < opens.length && dropTarget!.index === rowIdx) ||
                  (rowIdx === opens.length && dropTarget!.index >= opens.length)
                );
                return (
                  <motion.div
                    key={task.id}
                    layout="position"
                    transition={{ layout: { duration: 0.35, ease: EASE_SOFT } }}
                    style={{ borderTop: '0.5px solid var(--os-divider)', opacity: draggingId === task.id ? 0.35 : 1 }}
                  >
                    {showDropLineAbove && (
                      <div className="relative h-0 pointer-events-none">
                        <div className="absolute left-4 right-4 -top-px h-[2.5px] rounded-full z-10" style={{ background: 'var(--accent)', boxShadow: '0 0 8px var(--accent-strong)' }} />
                      </div>
                    )}
                    <div
                      className={`group/task relative flex items-center gap-3 px-5 py-2.5 transition-colors ${onOpenTask ? 'cursor-pointer' : ''} hover:bg-[var(--os-surface)]`}
                      onClick={() => onOpenTask?.(task.id)}
                      title={onOpenTask ? 'Open task' : undefined}
                      draggable={dragArmedId === task.id && !!onReorderTask && !done}
                      onDragStart={(e) => {
                        if (dragArmedId !== task.id) { e.preventDefault(); return; }
                        setDraggingId(task.id);
                        e.dataTransfer.effectAllowed = 'move';
                        try { e.dataTransfer.setData('text/plain', task.id); } catch { /* older browsers */ }
                      }}
                      onDragEnd={() => { setDraggingId(null); setDragArmedId(null); setDropTarget(null); }}
                      onDragOver={(e) => {
                        if (!draggingId || !onReorderTask) return;
                        e.preventDefault();
                        // Rows own their dragover — without this the container's
                        // empty-space fallback (running in the same bubble with
                        // stale state) clobbers the precise index.
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = 'move';
                        const rect = e.currentTarget.getBoundingClientRect();
                        const before = e.clientY < rect.top + rect.height / 2;
                        const idx = done ? opens.length : rowIdx + (before ? 0 : 1);
                        setDropTarget(prev => (prev && prev.group === group.name && prev.index === idx) ? prev : { group: group.name, index: idx });
                      }}
                      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); completeDrop(group.name, opens, dones); }}
                    >
                      {/* Drag grip — hover-reveal, arms the row for dragging */}
                      {onReorderTask && !done && (
                        <span
                          className="absolute left-1 opacity-0 group-hover/task:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
                          style={{ color: 'var(--os-fg-3)' }}
                          onMouseDown={(e) => { e.stopPropagation(); setDragArmedId(task.id); }}
                          onMouseUp={() => { if (!draggingId) setDragArmedId(null); }}
                          onClick={(e) => e.stopPropagation()}
                          title="Drag to reorder"
                        >
                          <Icons.Drag size={12} />
                        </span>
                      )}
                      <CheckCircle done={done} onToggle={() => handleToggle(gIdx, task)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="relative text-sm truncate transition-colors" style={{ color: done ? 'var(--os-fg-3)' : 'var(--os-fg-0)' }}>
                            {task.title}
                            {/* Animated strike-through */}
                            <motion.span
                              className="absolute left-0 top-1/2 h-px w-full pointer-events-none"
                              style={{ background: 'var(--os-fg-3)', originX: 0 }}
                              initial={false}
                              animate={{ scaleX: done ? 1 : 0 }}
                              transition={{ duration: 0.3, ease: EASE_SOFT }}
                            />
                          </span>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: priorityColor(task.priority) }} />
                          {payment && (
                            <span
                              className="text-[9px] px-1.5 py-0.5 font-semibold shrink-0"
                              style={{
                                borderRadius: 999,
                                background: payment.status === 'paid' ? 'rgba(118,146,104,0.12)' : payment.status === 'overdue' ? 'rgba(239,68,68,0.08)' : 'var(--accent-soft)',
                                color: payment.status === 'paid' ? 'var(--ok)' : payment.status === 'overdue' ? 'var(--err)' : 'var(--warn)',
                              }}
                            >
                              {formatCurrency(payment.amount)} · {payment.status}
                            </span>
                          )}
                        </div>
                        {subs.length > 0 && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <div className="w-12 h-1 rounded-full overflow-hidden" style={{ background: 'var(--os-surface)' }}>
                              <div className="h-full rounded-full transition-all" style={{ background: 'var(--ok)', width: `${subs.length ? Math.round(subsCompleted / subs.length * 100) : 0}%` }} />
                            </div>
                            <span className="text-[9px] tabular-nums" style={{ fontFamily: 'var(--font-mono)', color: 'var(--os-fg-3)' }}>{subsCompleted}/{subs.length}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                        <DatePickerButton
                          value={task.dueDate || null}
                          onChange={(date) => onUpdateTaskDate(task.id, date)}
                          done={done}
                          disabled={!canEdit}
                        />
                        <button
                          onClick={() => onSetExpandedTaskId(isExpanded ? null : task.id)}
                          className="p-1 rounded-md transition-all"
                          style={isExpanded
                            ? { color: 'var(--fg-gold)', background: 'var(--accent-soft)' }
                            : { color: 'var(--os-fg-3)' }}
                          title="Subtasks"
                        >
                          <motion.span animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }} className="flex">
                            <Icons.ChevronDown size={13} />
                          </motion.span>
                        </button>
                        {canDelete && (
                          <button
                            onClick={() => onDeleteTask(task.id, task.title)}
                            className="p-1 transition-all opacity-0 group-hover/task:opacity-100 hover:!text-[var(--err)]"
                            style={{ color: 'var(--os-fg-3)' }}
                          >
                            <Icons.Trash size={13} />
                          </button>
                        )}
                        {/* Open-detail affordance — appears on hover, Asana-style */}
                        {onOpenTask && (
                          <button
                            onClick={() => onOpenTask(task.id)}
                            className="p-1 transition-all opacity-0 group-hover/task:opacity-100 hover:!text-[var(--os-fg-0)]"
                            style={{ color: 'var(--os-fg-3)' }}
                            title="Open details"
                          >
                            <Icons.ChevronRight size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Subtasks panel */}
                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: EASE_SOFT }}
                          className="overflow-hidden"
                        >
                          <div className="pl-12 pr-5 pb-3 space-y-1">
                            {subs.map((sub: any) => {
                              const subDone = pendingDone.get(sub.id) ?? !!sub.completed;
                              return (
                              <div key={sub.id} className="flex items-center gap-2 group/sub py-1">
                                <CheckCircle done={subDone} size={16} onToggle={() => handleToggleSub(sub)} />
                                <span className="flex-1 text-xs" style={{ color: subDone ? 'var(--os-fg-3)' : 'var(--os-fg-1)', textDecoration: subDone ? 'line-through' : 'none' }}>
                                  {sub.title}
                                </span>
                                {canDelete && (
                                  <button
                                    onClick={() => onDeleteSubtask(sub.id)}
                                    className="p-0.5 opacity-0 group-hover/sub:opacity-100 transition-all hover:!text-[var(--err)]"
                                    style={{ color: 'var(--os-fg-3)' }}
                                  >
                                    <Icons.X size={10} />
                                  </button>
                                )}
                              </div>
                              );
                            })}
                            {/* Add subtask input */}
                            {canEdit && (
                              <div className="flex items-center gap-2 pt-1">
                                <div className="w-4 h-4 rounded shrink-0" style={{ border: '1.5px dashed var(--os-border-2)' }} />
                                <input
                                  value={expandedTaskId === task.id ? newSubtaskTitle : ''}
                                  onChange={e => onNewSubtaskTitleChange(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') onAddSubtask(task.id); }}
                                  placeholder="Add subtask..."
                                  className="flex-1 bg-transparent text-xs focus:outline-none"
                                  style={{ color: 'var(--os-fg-1)' }}
                                />
                                {newSubtaskTitle.trim() && (
                                  <button
                                    onClick={() => onAddSubtask(task.id)}
                                    className="px-2 py-0.5 text-[10px] font-semibold transition-opacity hover:opacity-90"
                                    style={{ background: 'var(--os-ink)', color: 'var(--livv-cream-50)', borderRadius: 8 }}
                                  >
                                    +
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}

              {/* End-of-list drop line — only needed when no done rows exist
                  to carry the "above first done row" indicator. */}
              {isDropGroup && dones.length === 0 && dropTarget!.index >= opens.length && (
                <div className="relative h-0 pointer-events-none">
                  <div className="absolute left-4 right-4 -top-px h-[2.5px] rounded-full z-10" style={{ background: 'var(--accent)', boxShadow: '0 0 8px var(--accent-strong)' }} />
                </div>
              )}

              {/* Add task input — ghost row, Asana-style */}
              {canEdit && (
                <div
                  className="flex items-center gap-2 px-5 py-2.5 transition-colors focus-within:bg-[var(--os-surface)]"
                  style={{ borderTop: '0.5px solid var(--os-divider)' }}
                >
                  <div className="w-5 h-5 rounded-full shrink-0" style={{ border: '1.5px dashed var(--os-border-2)' }} />
                  <input
                    value={newTaskTitle[gIdx] ?? ''}
                    onChange={e => onNewTaskTitleChange({ ...newTaskTitle, [gIdx]: e.target.value })}
                    onKeyDown={e => e.key === 'Enter' && onAddTask(gIdx)}
                    placeholder="Add task..."
                    className="flex-1 bg-transparent text-sm focus:outline-none py-1"
                    style={{ color: 'var(--os-fg-0)' }}
                  />
                  <AnimatePresence>
                    {(newTaskTitle[gIdx] ?? '').trim() && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        whileTap={{ scale: 0.94 }}
                        onClick={() => onAddTask(gIdx)}
                        className="px-3 py-1 text-[11px] font-semibold"
                        style={{ background: 'var(--os-ink)', color: 'var(--livv-cream-50)', borderRadius: 999 }}
                      >
                        Add
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
              )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}

      {/* Add phase */}
      {canEdit && (
        <div className="flex items-center gap-2">
          <input
            value={newGroupName}
            onChange={e => onNewGroupNameChange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onAddGroup()}
            placeholder="New phase..."
            className="px-4 py-2.5 text-sm bg-transparent focus:outline-none transition-colors"
            style={{ border: '1px dashed var(--os-border-2)', borderRadius: 12, color: 'var(--os-fg-0)' }}
          />
          <AnimatePresence>
            {newGroupName.trim() && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                whileTap={{ scale: 0.94 }}
                onClick={onAddGroup}
                className="px-4 py-2.5 text-xs font-semibold"
                style={{ background: 'var(--os-ink)', color: 'var(--livv-cream-50)', borderRadius: 12 }}
              >
                + Add Phase
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Empty state */}
      {derivedTasksGroups.length === 0 && projectTasks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--os-surface)' }}>
            <Icons.CheckCircle size={24} style={{ color: 'var(--os-fg-3)' }} />
          </div>
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--os-fg-2)' }}>No tasks yet</p>
          <p className="text-xs max-w-xs" style={{ color: 'var(--os-fg-3)' }}>
            {canEdit
              ? 'Use the AI generator to create tasks automatically or add phases manually.'
              : 'Tasks will appear here once the team adds them.'}
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
  disabled?: boolean;
}> = ({ value, onChange, done, disabled }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => { setLocalValue(value); }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value || null;
    setLocalValue(newDate);
    onChange(newDate);
  };

  const parsedDate = parseLocalDate(localValue);
  const today = parseLocalDate(todayLocal());
  const isOverdue = !!(parsedDate && today && parsedDate < today && !done);

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && inputRef.current?.showPicker()}
        className="text-[10px] px-2 py-0.5 transition-colors"
        style={{
          fontFamily: 'var(--font-mono)',
          borderRadius: 999,
          cursor: disabled ? 'default' : 'pointer',
          background: isOverdue ? 'rgba(239,68,68,0.08)' : 'var(--os-surface)',
          color: isOverdue ? 'var(--err)' : 'var(--os-fg-3)',
          fontWeight: isOverdue ? 600 : 400,
        }}
      >
        {parsedDate
          ? parsedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
          : disabled ? '—' : 'Set date'}
      </button>
      {!disabled && (
        <input
          ref={inputRef}
          type="date"
          value={localValue || ''}
          onChange={handleChange}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          tabIndex={-1}
        />
      )}
    </div>
  );
};
