
-- Drop table if we want to reset (optional, but safer for "does not exist" errors)
-- DROP TABLE IF EXISTS public.activity_logs CASCADE;

CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id),
    tenant_id UUID REFERENCES public.tenants(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_activity_logs_tenant_id ON activity_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);

-- RLS Policies
DROP POLICY IF EXISTS "activity_logs_select_policy" ON activity_logs;

CREATE POLICY "activity_logs_select_policy" ON activity_logs
FOR SELECT
USING (
    tenant_id IN (
        SELECT p.tenant_id 
        FROM public.profiles p 
        WHERE p.id = auth.uid()
    ) OR
    auth.uid() IN (
        SELECT t.owner_id 
        FROM public.tenants t 
        WHERE t.id = activity_logs.tenant_id
    )
);

DROP POLICY IF EXISTS "activity_logs_insert_policy" ON activity_logs;
CREATE POLICY "activity_logs_insert_policy" ON activity_logs
FOR INSERT
WITH CHECK (
    auth.uid() = user_id
);

GRANT SELECT, INSERT ON public.activity_logs TO authenticated;
GRANT SELECT, INSERT ON public.activity_logs TO service_role;

-- Insert permissions safely
INSERT INTO public.permissions (module, action, description)
VALUES 
    ('activity', 'view', 'View activity logs'),
    ('activity', 'create', 'Create activity logs')
ON CONFLICT (module, action) DO NOTHING;
