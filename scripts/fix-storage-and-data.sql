
-- 1. Create Storage Buckets
INSERT INTO storage.buckets (id, name, public)
VALUES 
    ('documents', 'documents', true),
    ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage Policies (Simplified for Owner Access)
-- Drop existing to avoid conflict
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view documents" ON storage.objects;

CREATE POLICY "Authenticated users can upload documents" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id IN ('documents', 'avatars'));

CREATE POLICY "Authenticated users can view documents" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id IN ('documents', 'avatars'));

-- 3. Fix Orphaned Data (Assign to Eneas Tenant)
DO $$
DECLARE
    v_tenant_id UUID;
    v_user_id UUID;
BEGIN
    -- Get target user and tenant
    SELECT id, tenant_id INTO v_user_id, v_tenant_id
    FROM public.profiles
    WHERE email = 'hola@livv.systems';

    IF v_tenant_id IS NOT NULL THEN
        -- Projects
        UPDATE public.projects 
        SET tenant_id = v_tenant_id, owner_id = v_user_id
        WHERE tenant_id IS NULL OR owner_id IS NULL;
        
        -- Tasks
        UPDATE public.tasks 
        SET tenant_id = v_tenant_id 
        WHERE tenant_id IS NULL;

        -- Documents (Metadata Table)
        UPDATE public.documents 
        SET tenant_id = v_tenant_id, owner_id = v_user_id
        WHERE tenant_id IS NULL;

        -- Leads
        UPDATE public.leads 
        SET tenant_id = v_tenant_id, owner_id = v_user_id
        WHERE tenant_id IS NULL;

        -- Clients
        UPDATE public.clients 
        SET tenant_id = v_tenant_id, owner_id = v_user_id
        WHERE tenant_id IS NULL;

         -- Activity Logs
        UPDATE public.activity_logs
        SET tenant_id = v_tenant_id
        WHERE tenant_id IS NULL;
        
        RAISE NOTICE 'Fixed data for tenant: %', v_tenant_id;
    END IF;
END
$$;
