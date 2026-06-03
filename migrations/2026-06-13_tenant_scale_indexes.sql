-- Scale indexes for tenant-scoped SaaS workloads.
-- This migration is intentionally defensive: it only creates an index when
-- both the table and the required columns exist in the target database.

DO $$
DECLARE
  idx RECORD;
BEGIN
  FOR idx IN
    SELECT *
    FROM (VALUES
      ('projects',            'idx_projects_tenant_id',              ARRAY['tenant_id']),
      ('projects',            'idx_projects_tenant_status',          ARRAY['tenant_id', 'status']),
      ('projects',            'idx_projects_tenant_updated_at',      ARRAY['tenant_id', 'updated_at']),
      ('tasks',               'idx_tasks_tenant_id',                 ARRAY['tenant_id']),
      ('tasks',               'idx_tasks_tenant_status',             ARRAY['tenant_id', 'status']),
      ('tasks',               'idx_tasks_tenant_assigned_to',        ARRAY['tenant_id', 'assigned_to']),
      ('tasks',               'idx_tasks_project_status',            ARRAY['project_id', 'status']),
      ('leads',               'idx_leads_tenant_id',                 ARRAY['tenant_id']),
      ('leads',               'idx_leads_tenant_status',             ARRAY['tenant_id', 'status']),
      ('leads',               'idx_leads_tenant_owner_status',       ARRAY['tenant_id', 'owner_id', 'status']),
      ('clients',             'idx_clients_tenant_id',               ARRAY['tenant_id']),
      ('clients',             'idx_clients_tenant_owner_id',         ARRAY['tenant_id', 'owner_id']),
      ('finances',            'idx_finances_tenant_id',              ARRAY['tenant_id']),
      ('finances',            'idx_finances_project_id',             ARRAY['project_id']),
      ('documents',           'idx_documents_tenant_id',             ARRAY['tenant_id']),
      ('files',               'idx_files_tenant_id',                 ARRAY['tenant_id']),
      ('activity_logs',       'idx_activity_logs_tenant_created_at', ARRAY['tenant_id', 'created_at']),
      ('activities',          'idx_activities_tenant_created_at',    ARRAY['tenant_id', 'created_at']),
      ('calendar_events',     'idx_calendar_events_tenant_start',    ARRAY['tenant_id', 'start_date']),
      ('calendar_tasks',      'idx_calendar_tasks_tenant_start',     ARRAY['tenant_id', 'start_date']),
      ('notifications',       'idx_notifications_user_read_created', ARRAY['user_id', 'read', 'created_at']),
      ('user_roles',          'idx_user_roles_user_id',              ARRAY['user_id']),
      ('user_roles',          'idx_user_roles_role_id',              ARRAY['role_id']),
      ('tenant_members',      'idx_tenant_members_user_tenant',      ARRAY['user_id', 'tenant_id']),
      ('tenant_members',      'idx_tenant_members_tenant_status',    ARRAY['tenant_id', 'status']),
      ('invitations',         'idx_invitations_tenant_status',       ARRAY['tenant_id', 'status']),
      ('invitations',         'idx_invitations_token',               ARRAY['token']),
      ('project_credentials', 'idx_project_credentials_project_type', ARRAY['project_id', 'service_type']),
      ('client_messages',     'idx_client_messages_client_created',  ARRAY['client_id', 'created_at']),
      ('client_tasks',        'idx_client_tasks_client_status',      ARRAY['client_id', 'status']),
      ('client_history',      'idx_client_history_client_created',   ARRAY['client_id', 'created_at'])
    ) AS v(table_name, index_name, columns)
  LOOP
    IF to_regclass(format('public.%I', idx.table_name)) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM unnest(idx.columns) AS c(column_name)
         WHERE NOT EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = idx.table_name
             AND column_name = c.column_name
         )
       )
    THEN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON public.%I (%s)',
        idx.index_name,
        idx.table_name,
        (SELECT string_agg(format('%I', c.column_name), ', ') FROM unnest(idx.columns) AS c(column_name))
      );
    END IF;
  END LOOP;
END $$;

