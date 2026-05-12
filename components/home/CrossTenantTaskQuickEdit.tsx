/**
 * CrossTenantTaskQuickEdit — slim modal for editing a task that lives in a
 * connected agency's tenant, WITHOUT forcing the user to switch tenants.
 *
 * Rationale: the home widget MyWorkAcrossAgencies surfaces tasks across
 * every workspace the user belongs to. Clicking one of those used to call
 * switchTenant() + redirect to /calendar — disruptive and slow when all
 * you want is "mark done" or "move due date by a day". This modal lets
 * the user act on the task in place. Writes go straight to `tasks` via
 * Supabase; RLS gates them via tenant_members (the user is a member of
 * both tenants, so the UPDATE is allowed).
 *
 * Out of scope (intentionally): rich-text description, attachments,
 * comments, subtasks. For those the user clicks "Open in <workspace>"
 * which still does the tenant switch + deep-link.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { errorLogger } from '../../lib/errorLogger';
import { Icons } from '../ui/Icons';
import type { CrossTenantTask } from '../../hooks/useCrossTenantTasks';

interface Props {
  task: CrossTenantTask;
  onClose: () => void;
  /** Fired after a successful save so the parent can refresh the list. */
  onSaved?: () => void;
  /** Fires when the user picks "Open in workspace" — parent handles the
   *  tenant-switch + deep-link. */
  onOpenInWorkspace?: (task: CrossTenantTask) => void;
}

type Status = 'todo' | 'in-progress' | 'done' | 'cancelled';
type Priority = 'urgent' | 'high' | 'medium' | 'low';

const STATUS_OPTIONS: { value: Status; label: string; color: string }[] = [
  { value: 'todo',        label: 'To do',       color: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300' },
  { value: 'in-progress', label: 'In progress', color: 'bg-amber-200 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300' },
  { value: 'done',        label: 'Done',        color: 'bg-emerald-200 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300' },
];

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high',   label: 'High'   },
  { value: 'medium', label: 'Medium' },
  { value: 'low',    label: 'Low'    },
];

export const CrossTenantTaskQuickEdit: React.FC<Props> = ({ task, onClose, onSaved, onOpenInWorkspace }) => {
  const [status, setStatus]     = useState<Status>((task.status as Status) || 'todo');
  const [priority, setPriority] = useState<Priority>((task.priority as Priority) || 'medium');
  const [dueDate, setDueDate]   = useState<string>(task.due_date || '');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [savedAt, setSavedAt]   = useState<number | null>(null);

  // Esc closes — same affordance as every other modal in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Dirty check — we only enable Save if SOMETHING changed, otherwise the
  // button looks like a no-op and the user wonders if it worked.
  const dirty =
    status !== (task.status || 'todo') ||
    priority !== (task.priority || 'medium') ||
    (dueDate || '') !== (task.due_date || '');

  const save = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload: any = {
        status,
        priority,
        due_date: dueDate || null,
      };
      // When status flips to 'done' we also set completed=true + completed_at
      // so downstream filters (Calendar "completed" view, Activity feed)
      // catch it immediately. Same logic the regular updateTask uses.
      if (status === 'done' && task.status !== 'done') {
        payload.completed = true;
        payload.completed_at = new Date().toISOString();
      } else if (status !== 'done' && task.status === 'done') {
        payload.completed = false;
        payload.completed_at = null;
      }
      const { error: err } = await supabase
        .from('tasks')
        .update(payload)
        .eq('id', task.task_id);
      if (err) throw err;
      setSavedAt(Date.now());
      onSaved?.();
    } catch (e: any) {
      errorLogger.error('cross-tenant task quick-edit save failed', e);
      setError(e?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }, [saving, status, priority, dueDate, task.task_id, task.status, onSaved]);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header — tenant logo + name so it's unambiguous which workspace
            this task lives in. The whole point of this modal is "you're
            editing a task in another agency". */}
        <header className="px-5 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800/60">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-5 h-5 rounded bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0">
              {task.tenant_logo_url ? (
                <img src={task.tenant_logo_url} alt="" className="w-full h-full object-contain" />
              ) : (
                <span className="text-[8px] font-bold text-zinc-500">
                  {(task.tenant_name || '?').slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 truncate">
              {task.tenant_name}
            </span>
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-700 dark:text-violet-300 uppercase tracking-wider">
              Quick edit
            </span>
            <button
              onClick={onClose}
              className="ml-auto p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              aria-label="Close"
            >
              <Icons.Close size={14} />
            </button>
          </div>
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
            {task.title}
          </h3>
          {task.project_title && (
            <div className="text-[11px] text-zinc-500 mt-0.5 inline-flex items-center gap-1">
              <Icons.Briefcase size={10} /> {task.project_title}
            </div>
          )}
        </header>

        {/* Body — three quick fields */}
        <div className="p-5 space-y-4">
          {/* Status */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
              Status
            </label>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setStatus(opt.value)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                    status === opt.value
                      ? opt.color + ' shadow-sm'
                      : 'bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Priority + Due date inline */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                Priority
              </label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as Priority)}
                className="w-full px-2 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              >
                {PRIORITY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                Due date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full px-2 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
            </div>
          </div>

          {/* Description — read-only preview. Editing rich-text descriptions
              cross-tenant is out of scope of this quick-edit; the user goes
              into the full panel for that. */}
          {task.description && (
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                Description
              </label>
              <p className="text-[12px] text-zinc-600 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap line-clamp-6">
                {task.description}
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-2 rounded-md text-[11px] text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20">
              <Icons.AlertCircle size={12} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center gap-2">
          {onOpenInWorkspace && (
            <button
              onClick={() => onOpenInWorkspace(task)}
              className="text-[11px] font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1"
            >
              Open in {task.tenant_name}
              <Icons.ChevronRight size={12} />
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {savedAt && (
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
                <Icons.Check size={11} /> Saved
              </span>
            )}
            <button
              onClick={onClose}
              className="text-[11px] font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 px-2.5 py-1.5"
            >
              Close
            </button>
            <button
              onClick={save}
              disabled={!dirty || saving}
              className="px-3 py-1.5 rounded-md text-[11px] font-semibold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
};
