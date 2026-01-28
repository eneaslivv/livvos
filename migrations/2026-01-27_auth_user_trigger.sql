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
      tenant_id,
      branding,
      features,
      resource_limits,
      security_settings,
      integrations,
      created_at,
      updated_at
    )
    VALUES (
      v_tenant_id,
      '{}'::jsonb,
      jsonb_build_object(
        'sales_module', true,
        'team_management', true,
        'client_portal', false,
        'notifications', true,
        'ai_assistant', false,
        'analytics', true,
        'calendar_integration', false,
        'document_versioning', false,
        'advanced_permissions', false
      ),
      jsonb_build_object(
        'max_users', 5,
        'max_projects', 20,
        'max_storage_mb', 1024,
        'max_api_calls_per_month', 10000
      ),
      jsonb_build_object(
        'require_2fa', false,
        'session_timeout_minutes', 480,
        'password_min_length', 8,
        'allow_public_sharing', false
      ),
      jsonb_build_object(
        'email_provider', null,
        'calendar_provider', null,
        'payment_processor', null,
        'ai_service', null
      ),
      now(),
      now()
    );
  END IF;

  INSERT INTO public.profiles (id, email, name, status, tenant_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(v_name, 'User'),
    'active',
    v_tenant_id
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      name = EXCLUDED.name,
      tenant_id = COALESCE(EXCLUDED.tenant_id, profiles.tenant_id);

  IF v_invitation.id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (NEW.id, v_invitation.role_id)
    ON CONFLICT DO NOTHING;

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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
