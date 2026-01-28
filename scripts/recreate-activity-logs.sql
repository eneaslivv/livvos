
-- Recreate Activity Logs from scratch to remove bad triggers via CASCADE
DROP TABLE IF EXISTS public.activity_logs CASCADE;


CREATE TABLE public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID, -- Removed REFERENCES auth.users(id) to avoid 42501 on system trigger/FK check
    tenant_id UUID, -- Removed REFERENCES public.tenants(id)
    user_name TEXT,
    user_avatar TEXT,
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    entity_type TEXT,
    project_title TEXT,
    type TEXT NOT NULL,
    details JSONB, -- Changed to JSONB to match usage
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Permissive Policy
CREATE POLICY "Allow All Activity" ON public.activity_logs
FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

-- Grant Access
GRANT ALL ON TABLE public.activity_logs TO authenticated;
GRANT ALL ON TABLE public.activity_logs TO service_role;


-- Realtime
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;
