/**
 * Output validation for the architect's structured object.
 *
 * The repo deliberately keeps zod out of the client bundle and validates
 * AI output with hand-rolled guards (see lib/ai.ts and the note in
 * lib/agents/types.ts). This mirrors that style: a strict check that
 * rejects malformed output so the propose pipeline can re-prompt, with
 * light coercion for harmless gaps (a missing order, a null depends_on).
 *
 * The model decides structure. This never adds tasks or stages, it only
 * accepts or rejects what came back and fills in safe defaults.
 */

import type {
  ProposedStructure,
  ProposedStage,
  ProposedTask,
  ProposedProject,
} from './types';
import { PROJECT_TYPES } from './types';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type ValidationResult =
  | { ok: true; value: ProposedStructure }
  | { ok: false; errors: string[] };

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

const isFiniteNonNeg = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Coerce a date-ish value to an ISO date string or null. Rejects garbage
 *  by returning null rather than throwing — a bad date is "missing", not
 *  a hard failure, because dates are the code's job anyway. */
const toIsoDateOrNull = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  return ISO_DATE_RE.test(s) ? s : null;
};

/**
 * Validate (and lightly normalize) the raw object returned by the model.
 * Returns { ok: true, value } when usable, or { ok: false, errors } with
 * specific reasons the caller can feed back into a re-prompt.
 */
export function validateProposedStructure(raw: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isObject(raw)) {
    return { ok: false, errors: ['Output is not a JSON object.'] };
  }

  // ── project ─────────────────────────────────────────────────────
  const rawProject = raw.project;
  if (!isObject(rawProject)) {
    errors.push('Missing "project" object.');
  }
  const projectName = isObject(rawProject) ? rawProject.name : undefined;
  if (!isNonEmptyString(projectName)) {
    errors.push('project.name is required and must be a non-empty string.');
  }

  // ── stages ──────────────────────────────────────────────────────
  const rawStages = raw.stages;
  if (!Array.isArray(rawStages) || rawStages.length === 0) {
    errors.push('"stages" must be a non-empty array.');
  }

  const stages: ProposedStage[] = [];
  if (Array.isArray(rawStages)) {
    rawStages.forEach((s, i) => {
      if (!isObject(s)) {
        errors.push(`stages[${i}] is not an object.`);
        return;
      }
      if (!isNonEmptyString(s.name)) {
        errors.push(`stages[${i}].name is required.`);
      }
      if (!Array.isArray(s.tasks)) {
        errors.push(`stages[${i}].tasks must be an array.`);
      }

      const tasks: ProposedTask[] = [];
      if (Array.isArray(s.tasks)) {
        s.tasks.forEach((t, j) => {
          if (!isObject(t)) {
            errors.push(`stages[${i}].tasks[${j}] is not an object.`);
            return;
          }
          if (!isNonEmptyString(t.title)) {
            errors.push(`stages[${i}].tasks[${j}].title is required.`);
            return;
          }
          // estimate_hours: coerce a numeric string, default 0, reject negatives.
          let est = t.estimate_hours;
          if (typeof est === 'string' && est.trim() !== '' && Number.isFinite(Number(est))) {
            est = Number(est);
          }
          if (est == null) est = 0;
          if (!isFiniteNonNeg(est)) {
            errors.push(`stages[${i}].tasks[${j}].estimate_hours must be a number >= 0.`);
            return;
          }
          tasks.push({
            title: (t.title as string).trim(),
            estimate_hours: est,
            depends_on: isNonEmptyString(t.depends_on) ? (t.depends_on as string).trim() : null,
          });
        });
      }

      // effort_weight: coerce, default 0 (the planner normalizes weights).
      let weight = s.effort_weight;
      if (typeof weight === 'string' && weight.trim() !== '' && Number.isFinite(Number(weight))) {
        weight = Number(weight);
      }
      if (weight == null) weight = 0;
      if (!isFiniteNonNeg(weight)) {
        errors.push(`stages[${i}].effort_weight must be a number >= 0.`);
      }

      const order = Number.isFinite(Number(s.order)) ? Number(s.order) : i + 1;

      stages.push({
        name: isNonEmptyString(s.name) ? (s.name as string).trim() : `Stage ${i + 1}`,
        order,
        effort_weight: isFiniteNonNeg(weight) ? weight : 0,
        tasks,
      });
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // ── assemble the validated value ────────────────────────────────
  const p = rawProject as Record<string, unknown>;
  const type = isNonEmptyString(p.type) ? (p.type as string).trim() : '';
  const project: ProposedProject = {
    name: (p.name as string).trim(),
    client: isNonEmptyString(p.client) ? (p.client as string).trim() : null,
    // Keep the model's type even if it is outside the known set; the caller
    // can decide whether to flag it. Persistence defaults unknowns safely.
    type: (PROJECT_TYPES as readonly string[]).includes(type) ? type : (type || 'own_product'),
    hard_deadline: toIsoDateOrNull(p.hard_deadline),
    target_deadline: toIsoDateOrNull(p.target_deadline),
    priority: isNonEmptyString(p.priority) ? (p.priority as string).trim() : undefined,
    risk_level: isNonEmptyString(p.risk_level) ? (p.risk_level as string).trim() : undefined,
  };

  const missing_info = Array.isArray(raw.missing_info)
    ? raw.missing_info.filter(isNonEmptyString).map((s) => (s as string).trim())
    : [];

  // Order stages by their stated order so downstream date planning is stable.
  stages.sort((a, b) => a.order - b.order);

  return { ok: true, value: { project, stages, missing_info } };
}
