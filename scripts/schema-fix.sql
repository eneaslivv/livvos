
-- 1. FIX NOTIFICATIONS TABLE
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notifications' AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE public.notifications ADD COLUMN tenant_id UUID REFERENCES public.tenants(id);
        CREATE INDEX IF NOT EXISTS idx_notifications_tenant_id ON public.notifications(tenant_id);
    END IF;
END
$$;

-- 2. ENSURE LEADS TABLE HAS OWNER_ID AND TENANT_ID
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leads' AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE public.leads ADD COLUMN tenant_id UUID REFERENCES public.tenants(id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leads' AND column_name = 'owner_id'
    ) THEN
        ALTER TABLE public.leads ADD COLUMN owner_id UUID REFERENCES public.profiles(id);
    END IF;
END
$$;

-- 3. ENSURE CLIENTS TABLE HAS OWNER_ID AND TENANT_ID
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'clients' AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE public.clients ADD COLUMN tenant_id UUID REFERENCES public.tenants(id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'clients' AND column_name = 'owner_id'
    ) THEN
        ALTER TABLE public.clients ADD COLUMN owner_id UUID REFERENCES public.profiles(id);
    END IF;
END
$$;

-- 4. VERIFY/FIX RPC is_admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = auth.uid()
        AND (r.name = 'admin' OR r.name = 'owner')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;

-- 5. ENSURE PERMISSIONS EXIST WITH UNIQUE CONSTRAINT
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'permissions_module_action_key'
    ) THEN
        ALTER TABLE public.permissions ADD CONSTRAINT permissions_module_action_key UNIQUE (module, action);
    END IF;
END
$$;

INSERT INTO public.permissions (module, action, description)
VALUES 
    ('sales', 'view_all', 'View all leads and sales data'),
    ('sales', 'edit', 'Edit leads and sales data'),
    ('sales', 'create', 'Create new leads'),
    ('team', 'view_all', 'View all team members'),
    ('projects', 'view_all', 'View all projects')
ON CONFLICT (module, action) DO NOTHING;
