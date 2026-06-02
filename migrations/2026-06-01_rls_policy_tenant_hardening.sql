-- ============================================================================
-- Pre-sale RLS hardening — close cross-tenant / anon table leaks
-- ============================================================================
-- Idempotent. Only the genuinely-leaky policies are touched; the large family
-- of `{public}` policies gated on can_access_tenant()/has_permission()/auth.uid()
-- already enforce tenant isolation (those helpers return false for anon) and are
-- left as-is.
-- ============================================================================

-- payment_processors: holds api_key + secret_key and had a `qual = true` public
-- SELECT policy → its secret keys were readable with the anon key (table is
-- empty today, so this is a landmine, not yet a live leak). Restrict all access
-- to platform admins. (Table has no tenant_id — it's platform-level config.)
DROP POLICY IF EXISTS payment_processors_select    ON public.payment_processors;
DROP POLICY IF EXISTS payment_processors_admin_all ON public.payment_processors;
CREATE POLICY payment_processors_admin_all ON public.payment_processors
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- calendar_tasks: "View Tasks Policy" was gated only on the referenced project
-- EXISTING somewhere (no tenant scope). Because RLS OR's SELECT policies, it
-- overrode the 3 correctly-scoped siblings and let any authenticated user read
-- ANOTHER tenant's tasks. The scoped siblings (calendar_tasks_select_policy,
-- "Users can view own tasks", "View Tasks Optimized") cover all legitimate
-- access — drop the leak.
DROP POLICY IF EXISTS "View Tasks Policy" ON public.calendar_tasks;

-- leads: remove the dead, self-contradictory "OR (tenant_id IS NULL)" branch.
-- The outer `tenant_id IS NOT NULL` already makes it unreachable; rewriting
-- removes the confusing NULL-tenant escape hatch the audit flagged.
DROP POLICY IF EXISTS leads_insert_policy ON public.leads;
CREATE POLICY leads_insert_policy ON public.leads
  FOR INSERT
  WITH CHECK (tenant_id IS NOT NULL AND public.can_access_tenant(tenant_id));

NOTIFY pgrst, 'reload schema';
