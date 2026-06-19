import { describe, it, expect } from 'vitest';
import { planStageDates } from '../lib/projectArchitect/datePlanner';
import type { ProposedStage } from '../lib/projectArchitect/types';

// Helper: build a stage with a single task carrying the hour estimate.
const stage = (name: string, order: number, weight: number, hours: number): ProposedStage => ({
  name,
  order,
  effort_weight: weight,
  tasks: [{ title: `${name} work`, estimate_hours: hours, depends_on: null }],
});

const dow = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
const isWeekday = (iso: string) => dow(iso) >= 1 && dow(iso) <= 5;

describe('planStageDates — forward planning (no deadline)', () => {
  it('lays stages forward from the start date, sized by hour estimates', () => {
    // 2026-06-01 is a Monday. Two equal stages, 12h each, at 6h/day = 4 working
    // days total, split 2 + 2.
    const stages = [stage('design', 1, 0.5, 12), stage('build', 2, 0.5, 12)];
    const result = planStageDates(stages, { startDate: '2026-06-01' });

    expect(result.direction).toBe('forward');
    expect(result.tight).toBe(false);
    expect(result.stages[0].planned_start).toBe('2026-06-01');
    expect(result.stages[0].planned_end).toBe('2026-06-02');
    expect(result.stages[1].planned_start).toBe('2026-06-03');
    expect(result.stages[1].planned_end).toBe('2026-06-04');
    expect(result.planned_start).toBe('2026-06-01');
    expect(result.planned_end).toBe('2026-06-04');
  });

  it('skips weekends when a stage spans across one', () => {
    // 2026-06-05 is a Friday. One 12h stage = 2 working days: Fri then Mon.
    const stages = [stage('build', 1, 1, 12)];
    const result = planStageDates(stages, { startDate: '2026-06-05' });

    expect(result.stages[0].planned_start).toBe('2026-06-05');
    expect(result.stages[0].planned_end).toBe('2026-06-08'); // jumps over Sat/Sun
  });

  it('never places a planned date on a weekend', () => {
    const stages = [
      stage('discovery', 1, 0.2, 8),
      stage('design', 2, 0.3, 20),
      stage('build', 3, 0.4, 30),
      stage('qa', 4, 0.1, 6),
    ];
    const result = planStageDates(stages, { startDate: '2026-06-04' });
    for (const s of result.stages) {
      expect(isWeekday(s.planned_start)).toBe(true);
      expect(isWeekday(s.planned_end)).toBe(true);
    }
  });
});

describe('planStageDates — backward planning (with deadline)', () => {
  it('finishes before the deadline with buffer slack and starts on the start date', () => {
    // 2026-06-01 Mon .. 2026-06-30 Tue = 22 working days. Buffer 0.8 -> 17
    // usable, 5 days slack, so the plan ends 5 working days before 06-30.
    const stages = [
      stage('discovery', 1, 0.1, 8),
      stage('design', 2, 0.4, 24),
      stage('build', 3, 0.4, 24),
      stage('qa', 4, 0.1, 8),
    ];
    const result = planStageDates(stages, {
      startDate: '2026-06-01',
      hardDeadline: '2026-06-30',
    });

    expect(result.direction).toBe('backward');
    expect(result.tight).toBe(false);
    expect(result.planned_start).toBe('2026-06-01');
    expect(result.planned_end).toBe('2026-06-23'); // 5 working days before the deadline
    // Buffer: the plan ends strictly before the deadline.
    expect(result.planned_end < '2026-06-30').toBe(true);
  });

  it('keeps stages ordered, contiguous, and non-overlapping', () => {
    const stages = [
      stage('discovery', 1, 0.15, 8),
      stage('design', 2, 0.35, 24),
      stage('build', 3, 0.35, 24),
      stage('handoff', 4, 0.15, 6),
    ];
    const result = planStageDates(stages, {
      startDate: '2026-06-01',
      hardDeadline: '2026-07-31',
    });
    for (let i = 0; i < result.stages.length; i++) {
      const s = result.stages[i];
      expect(s.planned_start <= s.planned_end).toBe(true);
      if (i > 0) {
        expect(result.stages[i - 1].planned_end < s.planned_start).toBe(true);
      }
    }
  });

  it('flags a deadline too close to fit every stage minimum as tight', () => {
    // 2026-06-25 Thu .. 2026-06-26 Fri = 2 working days, but 5 stages need 5.
    const stages = [
      stage('a', 1, 0.2, 2),
      stage('b', 2, 0.2, 2),
      stage('c', 3, 0.2, 2),
      stage('d', 4, 0.2, 2),
      stage('e', 5, 0.2, 2),
    ];
    const result = planStageDates(stages, {
      startDate: '2026-06-25',
      hardDeadline: '2026-06-26',
    });
    expect(result.tight).toBe(true);
    expect(result.planned_end <= '2026-06-26').toBe(true);
  });

  it('treats a deadline before the start date as no deadline (forward)', () => {
    const stages = [stage('build', 1, 1, 12)];
    const result = planStageDates(stages, {
      startDate: '2026-06-10',
      hardDeadline: '2026-06-01',
    });
    expect(result.direction).toBe('forward');
  });
});

describe('planStageDates — distribution and determinism', () => {
  it('gives heavier stages more working days', () => {
    const stages = [
      stage('light', 1, 0.1, 40),
      stage('heavy', 2, 0.9, 40),
    ];
    const result = planStageDates(stages, { startDate: '2026-06-01' });
    expect(result.stages[1].working_days).toBeGreaterThan(result.stages[0].working_days);
  });

  it('falls back to equal weights when all effort weights are zero', () => {
    const stages = [stage('a', 1, 0, 12), stage('b', 2, 0, 12)];
    const result = planStageDates(stages, { startDate: '2026-06-01' });
    expect(result.stages[0].working_days).toBe(result.stages[1].working_days);
  });

  it('is deterministic — same input, same output', () => {
    const stages = [
      stage('discovery', 1, 0.2, 8),
      stage('design', 2, 0.5, 24),
      stage('build', 3, 0.3, 16),
    ];
    const opts = { startDate: '2026-06-01', hardDeadline: '2026-08-15' };
    const a = planStageDates(stages, opts);
    const b = planStageDates(stages, opts);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('honors a custom working calendar (six-day week)', () => {
    // Include Saturday (6); 2026-06-05 Fri, one 18h = 3 working days: Fri, Sat, Mon.
    const stages = [stage('build', 1, 1, 18)];
    const result = planStageDates(stages, {
      startDate: '2026-06-05',
      workingDays: [1, 2, 3, 4, 5, 6],
    });
    expect(result.stages[0].planned_start).toBe('2026-06-05');
    expect(result.stages[0].planned_end).toBe('2026-06-08'); // Fri -> Sat -> Mon
  });

  it('returns empty plan for no stages', () => {
    const result = planStageDates([], { startDate: '2026-06-01' });
    expect(result.stages).toEqual([]);
    expect(result.planned_start).toBeNull();
    expect(result.planned_end).toBeNull();
  });
});
