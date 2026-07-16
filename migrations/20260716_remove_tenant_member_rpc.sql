-- remove_tenant_member: server-side member removal, scoped to ONE tenant.
--
-- Why: TeamContext.removeMember used to try client-side writes that were
-- either blocked by RLS (updating another user's profile row) or dangerously
-- global (unassigning the member's tasks across ALL tenants, suspending the
-- whole account). tenant_members has no client DELETE policy, so membership
-- was never actually removed. This RPC does the removal atomically and only
-- within the target tenant.

CREATE OR REPLACE FUNCTION public.remove_tenant_member(p_tenant_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Caller must be an owner/admin member of the tenant, or the tenant owner.
  IF NOT EXISTS (
        SELECT 1 FROM tenant_members tm
        WHERE tm.tenant_id = p_tenant_id
          AND tm.user_id = auth.uid()
          AND tm.role IN ('owner', 'admin')
      )
     AND NOT EXISTS (
        SELECT 1 FROM tenants t
        WHERE t.id = p_tenant_id AND t.owner_id = auth.uid()
      )
  THEN
    RAISE EXCEPTION 'Not authorized to remove members from this tenant';
  END IF;

  -- The tenant owner cannot be removed.
  IF EXISTS (SELECT 1 FROM tenants t WHERE t.id = p_tenant_id AND t.owner_id = p_user_id) THEN
    RAISE EXCEPTION 'Cannot remove the tenant owner';
  END IF;

  -- Drop membership.
  DELETE FROM tenant_members
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id;

  -- Unassign their tasks in THIS tenant only (never touch other workspaces).
  UPDATE tasks SET assignee_id = NULL
  WHERE tenant_id = p_tenant_id AND assignee_id = p_user_id;

  UPDATE tasks SET assignee_ids = array_remove(assignee_ids, p_user_id)
  WHERE tenant_id = p_tenant_id AND assignee_ids @> ARRAY[p_user_id];

  -- Drop project memberships for projects of this tenant.
  DELETE FROM project_members pm
  USING projects pr
  WHERE pm.project_id = pr.id
    AND pr.tenant_id = p_tenant_id
    AND pm.user_id = p_user_id;

  -- If their active workspace pointed at this tenant, park them on another
  -- membership (or NULL, which triggers re-provisioning on next login).
  UPDATE profiles
  SET tenant_id = (
        SELECT tm.tenant_id FROM tenant_members tm
        WHERE tm.user_id = p_user_id
        LIMIT 1
      )
  WHERE id = p_user_id AND tenant_id = p_tenant_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.remove_tenant_member(uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.remove_tenant_member(uuid, uuid) FROM anon;
