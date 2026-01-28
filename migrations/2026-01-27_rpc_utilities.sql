DROP FUNCTION IF EXISTS is_admin(UUID);

CREATE OR REPLACE FUNCTION is_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin BOOLEAN := FALSE;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = p_user_id AND r.name IN ('owner', 'admin')
  ) INTO v_is_admin;

  RETURN v_is_admin;
END;
$$;

CREATE OR REPLACE FUNCTION calculate_tenant_storage_usage(p_tenant_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bytes BIGINT := 0;
  v_exists BOOLEAN := FALSE;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'objects'
  ) INTO v_exists;

  IF NOT v_exists THEN
    RETURN 0;
  END IF;

  EXECUTE
    'SELECT COALESCE(SUM(
      CASE
        WHEN (metadata->>''size'') ~ ''^[0-9]+$'' THEN (metadata->>''size'')::BIGINT
        WHEN (metadata->>''content_length'') ~ ''^[0-9]+$'' THEN (metadata->>''content_length'')::BIGINT
        ELSE 0
      END
    ), 0)
    FROM storage.objects
    WHERE (metadata->>''tenant_id'')::UUID = $1'
  INTO v_bytes USING p_tenant_id;

  RETURN COALESCE(v_bytes, 0);
END;
$$;
