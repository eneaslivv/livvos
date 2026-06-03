import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readMigration = (fileName: string) =>
  readFileSync(resolve(process.cwd(), 'migrations', fileName), 'utf8');

describe('Security migrations', () => {
  it('adds a live RLS risk report for effective policies', () => {
    const sql = readMigration('2026-06-14_rls_policy_risk_report.sql').toLowerCase();

    expect(sql).toContain('create or replace view public.rls_policy_risk_report');
    expect(sql).toContain('from pg_policies');
    expect(sql).toContain('using_true');
    expect(sql).toContain('with_check_true');
    expect(sql).toContain('tenant_null_bypass');
    expect(sql).toContain('missing_tenant_scope');
    expect(sql).toContain('revoke all on public.rls_policy_risk_report from anon, authenticated');
  });

  it('keeps tenant scale indexes defensive for partially migrated databases', () => {
    const sql = readMigration('2026-06-13_tenant_scale_indexes.sql').toLowerCase();

    expect(sql).toContain('to_regclass');
    expect(sql).toContain('information_schema.columns');
    expect(sql).toContain('create index if not exists');
    expect(sql).toContain('idx_projects_tenant_id');
    expect(sql).toContain('idx_tasks_tenant_status');
    expect(sql).toContain('idx_notifications_user_read_created');
  });
});

