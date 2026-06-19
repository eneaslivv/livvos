/**
 * Date planning — the code half of the architect.
 *
 * The model never sets dates. This function takes a validated structure
 * plus an optional hard deadline and computes planned_start / planned_end
 * per stage. It is pure and deterministic: same inputs, same output. No
 * Date.now() inside, the caller passes startDate.
 *
 * Rules:
 *   - With a hard deadline, plan backward from it so every stage ends in
 *     time, and keep a buffer so the plan finishes before the deadline,
 *     not on it.
 *   - Without a hard deadline, plan forward from the start date, sizing
 *     the whole span from the task hour estimates.
 *   - Distribute working days across stages by effort_weight.
 *   - Skip weekends. The working calendar is configurable.
 */

import type { ProposedStage } from './types';

export interface PlanOptions {
  /** ISO date 'YYYY-MM-DD' considered the earliest the work can begin. */
  startDate: string;
  /** ISO date the work must be done by, or null to plan forward. */
  hardDeadline?: string | null;
  /** Weekday numbers that count as working days, 0 = Sunday .. 6 = Saturday.
   *  Default is Monday to Friday. */
  workingDays?: number[];
  /** Fraction of available working days the plan may fill when a deadline
   *  exists. 0.8 leaves a 20% cushion. */
  bufferRatio?: number;
  /** Productive hours per working day, used to size the span when there is
   *  no deadline. */
  hoursPerDay?: number;
  /** Smallest number of working days any stage may take. */
  minStageDays?: number;
}

export interface PlannedStage extends ProposedStage {
  planned_start: string;
  planned_end: string;
  working_days: number;
}

export interface PlanResult {
  stages: PlannedStage[];
  planned_start: string | null;
  planned_end: string | null;
  direction: 'forward' | 'backward';
  /** True when a deadline was too close to honor the buffer (or the start),
   *  so the plan was laid forward from the start and may run late. */
  tight: boolean;
}

const DAY_MS = 86_400_000;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

const parseISO = (iso: string): number => {
  if (!ISO_RE.test(iso)) throw new Error(`invalid_date: ${iso}`);
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

const formatISO = (ms: number): string => {
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const dayOfWeek = (ms: number): number => new Date(ms).getUTCDay();

const normalizeWorkingDays = (wd?: number[]): number[] => {
  const set = (wd && wd.length ? wd : [1, 2, 3, 4, 5]).filter((d) => d >= 0 && d <= 6);
  return set.length ? Array.from(new Set(set)) : [0, 1, 2, 3, 4, 5, 6];
};

const isWorkingDay = (ms: number, workingDays: number[]): boolean =>
  workingDays.includes(dayOfWeek(ms));

/** Move to the nearest working day in the given direction (+1 / -1). */
const clampToWorkingDay = (ms: number, dir: 1 | -1, workingDays: number[]): number => {
  let cur = ms;
  while (!isWorkingDay(cur, workingDays)) cur += dir * DAY_MS;
  return cur;
};

/** Step n working days from a date in a direction. n = 0 just clamps. */
const stepWorkingDays = (ms: number, n: number, dir: 1 | -1, workingDays: number[]): number => {
  let cur = clampToWorkingDay(ms, dir, workingDays);
  for (let i = 0; i < n; i++) {
    cur += dir * DAY_MS;
    cur = clampToWorkingDay(cur, dir, workingDays);
  }
  return cur;
};

/** Inclusive count of working days between two dates. */
const countWorkingDays = (startMs: number, endMs: number, workingDays: number[]): number => {
  if (startMs > endMs) return 0;
  let count = 0;
  for (let cur = startMs; cur <= endMs; cur += DAY_MS) {
    if (isWorkingDay(cur, workingDays)) count++;
  }
  return count;
};

/**
 * Split `target` working days across stages by normalized weight, giving
 * each at least `minPer` where the budget allows. The returned array sums
 * to exactly `target`, so a backward plan lands precisely on its anchor.
 */
const allocateDays = (weights: number[], target: number, minPer: number): number[] => {
  const n = weights.length;
  if (n === 0) return [];
  const total = weights.reduce((a, b) => a + b, 0);
  const norm = total > 0 ? weights.map((w) => w / total) : weights.map(() => 1 / n);

  // If the budget cannot give everyone `minPer`, lower the floor (may be 0).
  let mp = minPer;
  if (n * mp > target) mp = Math.max(0, Math.floor(target / n));

  const days = norm.map(() => mp);
  let remaining = target - n * mp;
  if (remaining > 0) {
    const ideal = norm.map((w) => remaining * w);
    const floors = ideal.map((v) => Math.floor(v));
    const assigned = floors.reduce((a, b) => a + b, 0);
    let leftover = remaining - assigned;
    const byFrac = ideal
      .map((v, i) => ({ i, frac: v - Math.floor(v) }))
      .sort((a, b) => b.frac - a.frac);
    for (let k = 0; k < leftover && k < byFrac.length; k++) floors[byFrac[k].i] += 1;
    // Any rounding remainder beyond one pass goes to the heaviest stage.
    leftover -= Math.min(leftover, byFrac.length);
    if (leftover > 0) floors[byFrac[0].i] += leftover;
    for (let i = 0; i < n; i++) days[i] += floors[i];
  }
  return days;
};

/** Lay stages forward from a start date, each spanning its allocated days. */
const layForward = (
  startMs: number,
  dayCounts: number[],
  workingDays: number[],
): Array<{ start: number; end: number }> => {
  const out: Array<{ start: number; end: number }> = [];
  let cursor = clampToWorkingDay(startMs, 1, workingDays);
  for (const d of dayCounts) {
    const span = Math.max(1, d);
    const start = cursor;
    const end = stepWorkingDays(start, span - 1, 1, workingDays);
    out.push({ start, end });
    cursor = stepWorkingDays(end, 1, 1, workingDays); // next working day after this stage
  }
  return out;
};

/** Lay stages backward so the last stage ends on `anchorEndMs`. */
const layBackward = (
  anchorEndMs: number,
  dayCounts: number[],
  workingDays: number[],
): Array<{ start: number; end: number }> => {
  const out: Array<{ start: number; end: number }> = new Array(dayCounts.length);
  let endCursor = clampToWorkingDay(anchorEndMs, -1, workingDays);
  for (let i = dayCounts.length - 1; i >= 0; i--) {
    const span = Math.max(1, dayCounts[i]);
    const end = endCursor;
    const start = stepWorkingDays(end, span - 1, -1, workingDays);
    out[i] = { start, end };
    endCursor = stepWorkingDays(start, 1, -1, workingDays); // working day before this stage
  }
  return out;
};

export function planStageDates(stages: ProposedStage[], options: PlanOptions): PlanResult {
  const workingDays = normalizeWorkingDays(options.workingDays);
  const bufferRatio = options.bufferRatio ?? 0.8;
  const hoursPerDay = options.hoursPerDay && options.hoursPerDay > 0 ? options.hoursPerDay : 6;
  const minStageDays = options.minStageDays && options.minStageDays > 0 ? options.minStageDays : 1;

  if (!stages.length) {
    return { stages: [], planned_start: null, planned_end: null, direction: 'forward', tight: false };
  }

  const startMs = parseISO(options.startDate);
  const weights = stages.map((s) => (s.effort_weight > 0 ? s.effort_weight : 0));
  const n = stages.length;

  const hasDeadline =
    !!options.hardDeadline &&
    ISO_RE.test(options.hardDeadline) &&
    parseISO(options.hardDeadline) >= startMs;

  let layout: Array<{ start: number; end: number }>;
  let direction: 'forward' | 'backward';
  let tight = false;
  let dayCounts: number[];

  if (hasDeadline) {
    direction = 'backward';
    const deadlineMs = parseISO(options.hardDeadline as string);
    const firstWD = clampToWorkingDay(startMs, 1, workingDays);
    const lastWD = clampToWorkingDay(deadlineMs, -1, workingDays);
    const available = countWorkingDays(firstWD, lastWD, workingDays);

    // Fill at most bufferRatio of the available days; keep the rest as slack
    // before the deadline. Never below the stage footprint when it fits.
    let usable = Math.floor(available * bufferRatio);
    usable = Math.max(usable, Math.min(available, n * minStageDays));
    usable = Math.min(usable, available);
    usable = Math.max(usable, 1);
    const slack = Math.max(0, available - usable);

    // Laying `usable` working days back from `slack` before the deadline puts
    // the first stage exactly on the start date, so the plan never runs into
    // the past. The deadline is only "tight" when the window cannot fit each
    // stage's minimum, which forces some stages to compress.
    tight = n * minStageDays > available;

    dayCounts = allocateDays(weights, usable, minStageDays);
    const anchorEnd = stepWorkingDays(lastWD, slack, -1, workingDays);
    layout = layBackward(anchorEnd, dayCounts, workingDays);
  } else {
    direction = 'forward';
    const totalHours = stages.reduce(
      (sum, s) => sum + s.tasks.reduce((a, t) => a + (t.estimate_hours || 0), 0),
      0,
    );
    const fromHours = Math.ceil(totalHours / hoursPerDay);
    const target = Math.max(fromHours, n * minStageDays);
    dayCounts = allocateDays(weights, target, minStageDays);
    layout = layForward(startMs, dayCounts, workingDays);
  }

  const plannedStages: PlannedStage[] = stages.map((s, i) => ({
    ...s,
    planned_start: formatISO(layout[i].start),
    planned_end: formatISO(layout[i].end),
    working_days: Math.max(1, dayCounts[i]),
  }));

  return {
    stages: plannedStages,
    planned_start: plannedStages[0].planned_start,
    planned_end: plannedStages[plannedStages.length - 1].planned_end,
    direction,
    tight,
  };
}
