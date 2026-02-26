-- =============================================
-- Fix Client Portal RLS Policies
-- The root cause: clients table RLS only allows owner_id = auth.uid()
-- but portal clients have their auth ID in auth_user_id, not owner_id.
-- This blocks the entire data chain (projects, tasks, finances, etc.)
--
-- PostgreSQL OR-combines same-operation policies, so adding new policies
-- does NOT break existing tenant-member access.
-- =============================================

-- 1. CLIENTS: Allow client to read their own record via auth_user_id
DROP POLICY IF EXISTS "client_self_select" ON clients;
CREATE POLICY "client_self_select" ON clients
FOR SELECT USING (auth_user_id = auth.uid());

-- 2. PROJECTS: Client can read projects linked to their client record
-- (recreate to ensure it works with the clients policy above)
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "client_projects_select" ON projects';
  EXECUTE 'CREATE POLICY "client_projects_select" ON projects FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = projects.client_id
      AND c.auth_user_id = auth.uid()
    )
  )';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 3. TASKS: Client can read tasks via client_id or project chain
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "client_tasks_select" ON tasks';
  EXECUTE 'CREATE POLICY "client_tasks_select" ON tasks FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = tasks.client_id
      AND c.auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM projects p
      JOIN clients c ON c.id = p.client_id
      WHERE p.id = tasks.project_id
      AND c.auth_user_id = auth.uid()
    )
  )';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 4. FINANCES: Client can read finances for their projects
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "client_finances_select" ON finances';
  EXECUTE 'CREATE POLICY "client_finances_select" ON finances FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN clients c ON c.id = p.client_id
      WHERE p.id = finances.project_id
      AND c.auth_user_id = auth.uid()
    )
  )';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 5. INCOMES: Client can read incomes linked to their client or projects
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'incomes') THEN
    EXECUTE 'DROP POLICY IF EXISTS "client_incomes_select" ON incomes';
    EXECUTE 'CREATE POLICY "client_incomes_select" ON incomes FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM clients c
        WHERE c.id = incomes.client_id
        AND c.auth_user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM projects p
        JOIN clients c ON c.id = p.client_id
        WHERE p.id = incomes.project_id
        AND c.auth_user_id = auth.uid()
      )
    )';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 6. INSTALLMENTS: Client can read installments for their incomes
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'installments') THEN
    EXECUTE 'DROP POLICY IF EXISTS "client_installments_select" ON installments';
    EXECUTE 'CREATE POLICY "client_installments_select" ON installments FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM incomes i
        JOIN clients c ON c.id = i.client_id
        WHERE i.id = installments.income_id
        AND c.auth_user_id = auth.uid()
      )
    )';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 7. FILES: Client can read files for their client or projects
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'files') THEN
    EXECUTE 'DROP POLICY IF EXISTS "client_files_select" ON files';
    EXECUTE 'CREATE POLICY "client_files_select" ON files FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM clients c
        WHERE c.id = files.client_id
        AND c.auth_user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM projects p
        JOIN clients c ON c.id = p.client_id
        WHERE p.id = files.project_id
        AND c.auth_user_id = auth.uid()
      )
    )';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 8. ACTIVITY_LOGS: Client can read logs for their projects
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "client_logs_select" ON activity_logs';
  EXECUTE 'CREATE POLICY "client_logs_select" ON activity_logs FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN clients c ON c.id = p.client_id
      WHERE p.title = activity_logs.project_title
      AND c.auth_user_id = auth.uid()
    )
  )';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 9. CLIENT_MESSAGES: Client can read and send their own messages
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "client_messages_self_select" ON client_messages';
  EXECUTE 'CREATE POLICY "client_messages_self_select" ON client_messages FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = client_messages.client_id
      AND c.auth_user_id = auth.uid()
    )
  )';

  EXECUTE 'DROP POLICY IF EXISTS "client_messages_self_insert" ON client_messages';
  EXECUTE 'CREATE POLICY "client_messages_self_insert" ON client_messages FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = client_messages.client_id
      AND c.auth_user_id = auth.uid()
    )
    AND sender_type = ''client''
  )';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 10. CLIENT_DOCUMENTS & CLIENT_CREDENTIALS: Already have auth_user_id policies
-- from 2026-01-29_client_portal_data.sql — no changes needed

-- 11. Fix handle_new_user trigger: guard against NULL role_id
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_invitation invitations%ROWTYPE;
  v_role_id UUID;
  v_tenant_id UUID;
  v_name TEXT;
  v_slug TEXT;
BEGIN
  SELECT * INTO v_invitation
  FROM invitations
  WHERE email = NEW.email AND status = 'pending'
  LIMIT 1;

  v_name := COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));

  IF v_invitation.id IS NOT NULL THEN
    v_tenant_id := v_invitation.tenant_id;
  ELSE
    v_slug := regexp_replace(lower(COALESCE(v_name, 'tenant')), '[^a-z0-9]+', '-', 'g');
    v_slug := trim(both '-' from v_slug);
    IF v_slug = '' THEN
      v_slug := 'tenant';
    END IF;
    v_slug := v_slug || '-' || substring(NEW.id::text, 1, 6);

    INSERT INTO tenants (name, slug, owner_id, status, created_at, updated_at)
    VALUES (COALESCE(v_name, 'My Workspace'), v_slug, NEW.id, 'active', now(), now())
    RETURNING id INTO v_tenant_id;

    INSERT INTO tenant_config (
      tenant_id, branding, features, resource_limits,
      security_settings, integrations, created_at, updated_at
    )
    VALUES (
      v_tenant_id, '{}'::jsonb,
      jsonb_build_object(
        'sales_module', true, 'team_management', true,
        'client_portal', false, 'notifications', true,
        'ai_assistant', false, 'analytics', true,
        'calendar_integration', false, 'document_versioning', false,
        'advanced_permissions', false
      ),
      jsonb_build_object(
        'max_users', 5, 'max_projects', 20,
        'max_storage_mb', 1024, 'max_api_calls_per_month', 10000
      ),
      jsonb_build_object(
        'require_2fa', false, 'session_timeout_minutes', 480,
        'password_min_length', 8, 'allow_public_sharing', false
      ),
      jsonb_build_object(
        'email_provider', null, 'calendar_provider', null,
        'payment_processor', null, 'ai_service', null
      ),
      now(), now()
    );
  END IF;

  INSERT INTO public.profiles (id, email, name, status, tenant_id)
  VALUES (NEW.id, NEW.email, COALESCE(v_name, 'User'), 'active', v_tenant_id)
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      name = EXCLUDED.name,
      tenant_id = COALESCE(EXCLUDED.tenant_id, profiles.tenant_id);

  IF v_invitation.id IS NOT NULL THEN
    -- Assign role: use invitation's role_id, fallback to 'client' role if NULL
    IF v_invitation.role_id IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role_id)
      VALUES (NEW.id, v_invitation.role_id)
      ON CONFLICT DO NOTHING;
    ELSIF v_invitation.type = 'client' THEN
      SELECT id INTO v_role_id FROM public.roles
      WHERE name = 'client' AND (is_system = true OR store_id IS NULL)
      LIMIT 1;
      IF v_role_id IS NOT NULL THEN
        INSERT INTO public.user_roles (user_id, role_id)
        VALUES (NEW.id, v_role_id)
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;

    -- Link client record to auth user
    IF v_invitation.client_id IS NOT NULL THEN
      UPDATE clients
      SET auth_user_id = NEW.id
      WHERE id = v_invitation.client_id;
    END IF;

    UPDATE public.invitations
    SET status = 'accepted', updated_at = now()
    WHERE id = v_invitation.id;
  ELSE
    SELECT id INTO v_role_id FROM public.roles WHERE name = 'owner' LIMIT 1;
    IF v_role_id IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role_id)
      VALUES (NEW.id, v_role_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
