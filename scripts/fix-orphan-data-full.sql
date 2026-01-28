
-- Fix Orphaned Data AND Schema
DO $$
DECLARE
    v_tenant_id UUID;
    v_user_id UUID;
BEGIN
    -- 1. Ensure Columns Exist
    -- Projects
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'tenant_id') THEN
        ALTER TABLE public.projects ADD COLUMN tenant_id UUID REFERENCES public.tenants(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'owner_id') THEN
        ALTER TABLE public.projects ADD COLUMN owner_id UUID REFERENCES public.profiles(id);
    END IF;

    -- Tasks
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'tenant_id') THEN
        ALTER TABLE public.tasks ADD COLUMN tenant_id UUID REFERENCES public.tenants(id);
    END IF;

    -- Documents
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'tenant_id') THEN
        ALTER TABLE public.documents ADD COLUMN tenant_id UUID REFERENCES public.tenants(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'owner_id') THEN
        ALTER TABLE public.documents ADD COLUMN owner_id UUID REFERENCES public.profiles(id);
    END IF;

    -- Leads (already checked but safe to repeat)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'tenant_id') THEN
        ALTER TABLE public.leads ADD COLUMN tenant_id UUID REFERENCES public.tenants(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'owner_id') THEN
        ALTER TABLE public.leads ADD COLUMN owner_id UUID REFERENCES public.profiles(id);
    END IF;
    
    -- Clients
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'tenant_id') THEN
        ALTER TABLE public.clients ADD COLUMN tenant_id UUID REFERENCES public.tenants(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'owner_id') THEN
        ALTER TABLE public.clients ADD COLUMN owner_id UUID REFERENCES public.profiles(id);
    END IF;

    -- 2. Get User & Tenant
    SELECT id, tenant_id INTO v_user_id, v_tenant_id
    FROM public.profiles
    WHERE email = 'hola@livv.systems';

    IF v_tenant_id IS NOT NULL THEN
        -- 3. Update Data
        UPDATE public.projects 
        SET tenant_id = v_tenant_id, owner_id = v_user_id
        WHERE tenant_id IS NULL OR owner_id IS NULL;
        
        UPDATE public.tasks 
        SET tenant_id = v_tenant_id 
        WHERE tenant_id IS NULL;

        UPDATE public.documents 
        SET tenant_id = v_tenant_id, owner_id = v_user_id
        WHERE tenant_id IS NULL;

        UPDATE public.leads 
        SET tenant_id = v_tenant_id, owner_id = v_user_id
        WHERE tenant_id IS NULL;

        UPDATE public.clients 
        SET tenant_id = v_tenant_id, owner_id = v_user_id
        WHERE tenant_id IS NULL;

         -- Activity Logs (already fixed schema, just data)
        UPDATE public.activity_logs
        SET tenant_id = v_tenant_id
        WHERE tenant_id IS NULL;
        
        RAISE NOTICE 'Fixed schema and data for tenant: %', v_tenant_id;
    END IF;
END
$$;
