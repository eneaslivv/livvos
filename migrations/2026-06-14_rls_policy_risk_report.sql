-- Live RLS policy audit report.
-- This reports risky effective policies from pg_policies after all migrations
-- have been applied. It does not change access rules by itself.

CREATE OR REPLACE VIEW public.rls_policy_risk_report AS
WITH policy_scan AS (
  SELECT
    schemaname,
    tablename,
    policyname,
    cmd,
    roles,
    qual,
    with_check,
    lower(coalesce(qual, '')) AS qual_lc,
    lower(coalesce(with_check, '')) AS check_lc
  FROM pg_policies
  WHERE schemaname = 'public'
),
risk_scan AS (
  SELECT
    schemaname,
    tablename,
    policyname,
    cmd,
    roles,
    qual,
    with_check,
    array_remove(ARRAY[
      CASE
        WHEN qual_lc IN ('true', '(true)')
          OR qual_lc LIKE '%using (true)%'
          OR qual_lc LIKE '%using ( true )%'
        THEN 'using_true'
      END,
      CASE
        WHEN check_lc IN ('true', '(true)')
          OR check_lc LIKE '%with check (true)%'
          OR check_lc LIKE '%with check ( true )%'
        THEN 'with_check_true'
      END,
      CASE
        WHEN qual_lc LIKE '%tenant_id is null%'
          OR check_lc LIKE '%tenant_id is null%'
        THEN 'tenant_null_bypass'
      END,
      CASE
        WHEN tablename = ANY (ARRAY[
          'projects',
          'tasks',
          'milestones',
          'activities',
          'activity_logs',
          'leads',
          'clients',
          'client_messages',
          'client_tasks',
          'documents',
          'files',
          'finances',
          'incomes',
          'expenses',
          'calendar_events',
          'calendar_tasks',
          'notifications',
          'messages',
          'project_credentials',
          'client_credentials',
          'passwords'
        ])
        AND qual_lc NOT LIKE '%tenant%'
        AND check_lc NOT LIKE '%tenant%'
        THEN 'missing_tenant_scope'
      END
    ], NULL) AS risk_flags
  FROM policy_scan
)
SELECT *
FROM risk_scan
WHERE array_length(risk_flags, 1) IS NOT NULL;

COMMENT ON VIEW public.rls_policy_risk_report IS
  'Reports effective public RLS policies with broad true checks, tenant_id null bypasses, or missing tenant scope on sensitive tables.';

REVOKE ALL ON public.rls_policy_risk_report FROM anon, authenticated;

