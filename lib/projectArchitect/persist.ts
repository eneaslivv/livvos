/**
 * Persistence + edit logging.
 *
 * Persistence goes through the create_architect_project RPC so the project,
 * its stages, and their tasks land in one transaction with tenant scoping
 * the client cannot override.
 *
 * Edit logging captures the delta between what the architect proposed and
 * what the user approved. That delta IS the manual edit the user made after
 * the agent proposed the project, written as typed rows to project_edits_log.
 * It is the training signal for later estimation tuning.
 */

import { supabase } from '../supabase';
import type {
  EditableStructure,
  EditableStage,
  EditableTask,
  ProjectEditEvent,
} from './types';

export interface PersistResult {
  ok: boolean;
  projectId?: string;
  error?: string;
}

/** Build the RPC payload from the approved structure. */
const toPayload = (structure: EditableStructure) => ({
  project: {
    name: structure.project.name,
    client: structure.project.client ?? null,
    client_id: structure.project.client_id ?? null,
    type: structure.project.type,
    status: 'discovery',
    start_date: structure.project.start_date ?? null,
    hard_deadline: structure.project.hard_deadline ?? null,
    target_deadline: structure.project.target_deadline ?? null,
    priority: structure.project.priority ?? 'medium',
    risk_level: structure.project.risk_level ?? 'low',
  },
  stages: structure.stages.map((s, i) => ({
    name: s.name,
    order: s.order ?? i + 1,
    effort_weight: s.effort_weight,
    planned_start: s.planned_start ?? null,
    planned_end: s.planned_end ?? null,
    status: 'pending',
    tasks: s.tasks.map((t, j) => ({
      title: t.title,
      estimate_hours: t.estimate_hours,
      depends_on: t.depends_on ?? null,
      task_order: j,
      status: 'todo',
    })),
  })),
});

/** Write the approved project, stages, and tasks in one transaction. */
export async function persistArchitectProject(
  structure: EditableStructure,
): Promise<PersistResult> {
  const { data, error } = await supabase.rpc('create_architect_project', {
    p_payload: toPayload(structure),
  });
  if (error) {
    if (import.meta.env.DEV) console.error('[architect] persist error:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true, projectId: data as string };
}

// ── Edit diffing ─────────────────────────────────────────────────────

const taskByKey = (stage: EditableStage): Map<string, EditableTask> =>
  new Map(stage.tasks.map((t) => [t._key, t]));

/**
 * Compute the typed edit events between the proposed structure and the
 * approved one. Stages and tasks are matched by their stable _key, so a
 * rename reads as a rename, not a delete plus an add.
 */
export function diffStructureToEdits(
  original: EditableStructure,
  edited: EditableStructure,
): ProjectEditEvent[] {
  const events: ProjectEditEvent[] = [];

  const origStages = new Map(original.stages.map((s) => [s._key, s]));
  const editStages = new Map(edited.stages.map((s) => [s._key, s]));

  // Stage adds and removes.
  for (const s of edited.stages) {
    if (!origStages.has(s._key)) {
      events.push({ event_type: 'stage_added', before: null, after: { name: s.name, order: s.order } });
    }
  }
  for (const s of original.stages) {
    if (!editStages.has(s._key)) {
      events.push({ event_type: 'stage_removed', before: { name: s.name, order: s.order }, after: null });
    }
  }

  // Stage reorder — compare the order of stages present in both.
  const commonOrig = original.stages.filter((s) => editStages.has(s._key)).map((s) => s._key);
  const commonEdit = edited.stages.filter((s) => origStages.has(s._key)).map((s) => s._key);
  if (commonOrig.join(',') !== commonEdit.join(',')) {
    events.push({ event_type: 'stage_reordered', before: commonOrig, after: commonEdit });
  }

  // Per-matched-stage: date changes + task-level edits.
  for (const editStage of edited.stages) {
    const origStage = origStages.get(editStage._key);
    if (!origStage) continue;

    if (
      (origStage.planned_start ?? null) !== (editStage.planned_start ?? null) ||
      (origStage.planned_end ?? null) !== (editStage.planned_end ?? null)
    ) {
      events.push({
        event_type: 'date_changed',
        before: { name: origStage.name, planned_start: origStage.planned_start, planned_end: origStage.planned_end },
        after: { name: editStage.name, planned_start: editStage.planned_start, planned_end: editStage.planned_end },
      });
    }

    const origTasks = taskByKey(origStage);
    const editTasks = taskByKey(editStage);

    for (const t of editStage.tasks) {
      const o = origTasks.get(t._key);
      if (!o) {
        events.push({ event_type: 'task_added', before: null, after: { title: t.title, estimate_hours: t.estimate_hours } });
        continue;
      }
      if (o.title !== t.title) {
        events.push({ event_type: 'task_renamed', before: { title: o.title }, after: { title: t.title } });
      }
      if (o.estimate_hours !== t.estimate_hours) {
        events.push({
          event_type: 'estimate_changed',
          before: { title: o.title, estimate_hours: o.estimate_hours },
          after: { title: t.title, estimate_hours: t.estimate_hours },
        });
      }
    }
    for (const o of origStage.tasks) {
      if (!editTasks.has(o._key)) {
        events.push({ event_type: 'task_removed', before: { title: o.title, estimate_hours: o.estimate_hours }, after: null });
      }
    }
  }

  return events;
}

/** Append one edit row. Best-effort: a logging failure never blocks the user. */
export async function logProjectEdit(args: {
  tenantId: string;
  projectId: string;
  event: ProjectEditEvent;
}): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from('project_edits_log').insert({
    tenant_id: args.tenantId,
    project_id: args.projectId,
    event_type: args.event.event_type,
    before: args.event.before ?? null,
    after: args.event.after ?? null,
    created_by: auth?.user?.id ?? null,
  });
  if (error && import.meta.env.DEV) console.warn('[architect] edit log insert failed:', error.message);
}

/**
 * Persist the approved structure, then record what the user changed from the
 * proposal as rows in project_edits_log.
 */
export async function persistAndLogEdits(
  original: EditableStructure,
  edited: EditableStructure,
  tenantId: string,
): Promise<PersistResult> {
  const result = await persistArchitectProject(edited);
  if (!result.ok || !result.projectId) return result;

  const events = diffStructureToEdits(original, edited);
  // Write sequentially and swallow individual failures — the log is a
  // best-effort training signal, not part of the save guarantee.
  for (const event of events) {
    await logProjectEdit({ tenantId, projectId: result.projectId, event });
  }
  return result;
}
