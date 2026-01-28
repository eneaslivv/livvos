
-- Fix RLS Permissions for Core Authorization (No Transaction Block)


-- 1. Profiles
DROP POLICY IF EXISTS "Users can see own profile" ON public.profiles;
CREATE POLICY "Users can see own profile" ON public.profiles
FOR SELECT USING (auth.uid() = id);

-- 2. User Roles
DROP POLICY IF EXISTS "Users can see own roles" ON public.user_roles;
CREATE POLICY "Users can see own roles" ON public.user_roles
FOR SELECT USING (auth.uid() = user_id);

-- 3. Roles
DROP POLICY IF EXISTS "Auth users can read roles" ON public.roles;
CREATE POLICY "Auth users can read roles" ON public.roles
FOR SELECT TO authenticated USING (true);

-- 4. Activity Logs
DROP POLICY IF EXISTS "Users can insert activity" ON public.activity_logs;
DROP POLICY IF EXISTS "Users can see activity" ON public.activity_logs;

CREATE POLICY "Users can insert activity" ON public.activity_logs
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can see activity" ON public.activity_logs
FOR SELECT TO authenticated USING (
    tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
);

-- 5. Tenants
DROP POLICY IF EXISTS "Users can see own tenant" ON public.tenants;
CREATE POLICY "Users can see own tenant" ON public.tenants
FOR SELECT USING (
    id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
);
