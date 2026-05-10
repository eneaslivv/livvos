-- Persisted weekly recaps per member, used by the Activity →
-- MemberWeeklySummaryPanel. Lets the panel show past summaries, lets
-- the AI reference trends ("best week in 6 weeks", "output dropped vs
-- last week"), and gives us a foundation for richer team-performance
-- analytics down the road.
--
-- Unique on (tenant, user, period, period_from) so re-running the AI
-- for the same window UPSERTs instead of duplicating.

CREATE TABLE IF NOT EXISTS member_performance_summaries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  period          text NOT NULL,                              -- 'this_week' | 'last_week' | 'this_month'
  period_label    text NOT NULL,                              -- 'Esta semana' / 'Semana pasada' / 'Este mes'
  period_from     date NOT NULL,
  period_to       date NOT NULL,
  -- Raw stats snapshot (so summaries are reproducible without re-fetching tasks)
  completed_count int  NOT NULL DEFAULT 0,
  open_count      int  NOT NULL DEFAULT 0,
  overdue_count   int  NOT NULL DEFAULT 0,
  delegated_count int  NOT NULL DEFAULT 0,
  login_count     int  NOT NULL DEFAULT 0,
  activity_count  int  NOT NULL DEFAULT 0,
  -- AI output
  headline        text,
  wins            jsonb NOT NULL DEFAULT '[]'::jsonb,
  blockers        jsonb NOT NULL DEFAULT '[]'::jsonb,
  next_focus      jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Computed signals the AI was given (vs_last_week_pct, best_day_of_week, etc).
  -- Stored so we can show them in the UI without recomputing.
  signals         jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_by    uuid REFERENCES profiles(id),
  generated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mps_unique_per_window UNIQUE (tenant_id, user_id, period, period_from)
);

CREATE INDEX IF NOT EXISTS idx_mps_user_period
  ON member_performance_summaries (tenant_id, user_id, period_from DESC);

ALTER TABLE member_performance_summaries ENABLE ROW LEVEL SECURITY;

-- Anyone in the tenant can read the summaries (visible from Activity page).
DROP POLICY IF EXISTS mps_read_tenant ON member_performance_summaries;
CREATE POLICY mps_read_tenant ON member_performance_summaries
  FOR SELECT USING (can_access_tenant(tenant_id));

-- Anyone in the tenant can write (the panel saves summaries on generate).
DROP POLICY IF EXISTS mps_write_tenant ON member_performance_summaries;
CREATE POLICY mps_write_tenant ON member_performance_summaries
  FOR ALL USING (can_access_tenant(tenant_id))
            WITH CHECK (can_access_tenant(tenant_id));
