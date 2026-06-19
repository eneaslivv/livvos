/**
 * Project Architect — shared types and constants.
 *
 * The architect splits responsibility cleanly: the model decides what a
 * project contains and how it decomposes (stages + tasks + estimates),
 * the code decides when (stage dates) and persists. These types are the
 * contract between those halves.
 *
 * Keep PROJECT_TYPES in sync with the CHECK constraints in
 * migrations/2026-06-18_project_architect.sql and the gemini prompt in
 * supabase/functions/gemini/prompts.ts.
 */

export const PROJECT_TYPES = [
  'web_webflow',
  'web_framer',
  'app_react_native',
  'app_flutter',
  'ai_integration',
  'own_product',
] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number];

export const PROJECT_STATUSES = [
  'discovery',
  'in_progress',
  'in_review',
  'blocked',
  'delivered',
  'on_hold',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** A task as the model proposes it (no ids, no dates — those come later).
 *  depends_on, when present, is the TITLE of another task in the same
 *  project; persistence resolves it to a task id. */
export interface ProposedTask {
  title: string;
  estimate_hours: number;
  depends_on: string | null;
}

/** A stage as the model proposes it. planned_start / planned_end are added
 *  by the date planner, never by the model. */
export interface ProposedStage {
  name: string;
  order: number;
  effort_weight: number;
  tasks: ProposedTask[];
  planned_start?: string | null;
  planned_end?: string | null;
}

export interface ProposedProject {
  name: string;
  client: string | null;
  type: ProjectType | string;
  hard_deadline: string | null;
  /** Optional fields the model may fill from the brief. */
  target_deadline?: string | null;
  priority?: string;
  risk_level?: string;
  client_id?: string | null;
}

/** The strict object the architect returns. Validated before anything
 *  touches the database. */
export interface ProposedStructure {
  project: ProposedProject;
  stages: ProposedStage[];
  missing_info: string[];
}

/** A single stored blueprint row. */
export interface Blueprint {
  id: string;
  tenant_id: string | null;
  type: ProjectType | string;
  name: string;
  stages: BlueprintStage[];
  is_active?: boolean;
}

export interface BlueprintStage {
  name: string;
  order: number;
  effort_weight: number;
  default_tasks: ProposedTask[];
}

/** Edit events written to project_edits_log. */
export type ProjectEditType =
  | 'stage_added'
  | 'stage_removed'
  | 'task_added'
  | 'task_removed'
  | 'task_renamed'
  | 'estimate_changed'
  | 'date_changed'
  | 'stage_reordered';

export interface ProjectEditEvent {
  event_type: ProjectEditType;
  before: unknown;
  after: unknown;
}

/** The model the preview UI edits. Stable _key on every stage and task so
 *  the diff can tell a rename from a remove-plus-add. */
export interface EditableTask {
  _key: string;
  title: string;
  estimate_hours: number;
  depends_on: string | null;
}

export interface EditableStage {
  _key: string;
  name: string;
  order: number;
  effort_weight: number;
  planned_start: string | null;
  planned_end: string | null;
  working_days?: number;
  tasks: EditableTask[];
}

export interface EditableStructure {
  project: ProposedProject & { start_date?: string | null };
  stages: EditableStage[];
  missing_info: string[];
}
