-- TeamContext now sources the member list from tenant_members (via
-- get_tenant_members RPC) and subscribes to postgres_changes on it, so the
-- table must be in the realtime publication (house rule: every table with a
-- postgres_changes listener belongs to supabase_realtime).
ALTER PUBLICATION supabase_realtime ADD TABLE public.tenant_members;
