-- Add owner_id to all tables
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.web_analytics ADD COLUMN IF NOT EXISTS owner_id uuid;

-- Enable RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_analytics ENABLE ROW LEVEL SECURITY;

-- Policies: authenticated users can CRUD their own rows
CREATE POLICY "projects_select_own" ON public.projects
  FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "projects_insert_own" ON public.projects
  FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "projects_update_own" ON public.projects
  FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "projects_delete_own" ON public.projects
  FOR DELETE USING (owner_id = auth.uid());

CREATE POLICY "ideas_select_own" ON public.ideas
  FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "ideas_insert_own" ON public.ideas
  FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "ideas_update_own" ON public.ideas
  FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "ideas_delete_own" ON public.ideas
  FOR DELETE USING (owner_id = auth.uid());

CREATE POLICY "leads_select_own" ON public.leads
  FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "leads_insert_own" ON public.leads
  FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "leads_update_own" ON public.leads
  FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "leads_delete_own" ON public.leads
  FOR DELETE USING (owner_id = auth.uid());

CREATE POLICY "activity_select_own" ON public.activity_logs
  FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "activity_insert_own" ON public.activity_logs
  FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "activity_update_block" ON public.activity_logs
  FOR UPDATE USING (false);
CREATE POLICY "activity_delete_own" ON public.activity_logs
  FOR DELETE USING (owner_id = auth.uid());

CREATE POLICY "analytics_select_own" ON public.web_analytics
  FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "analytics_insert_own" ON public.web_analytics
  FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "analytics_update_own" ON public.web_analytics
  FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "analytics_delete_own" ON public.web_analytics
  FOR DELETE USING (owner_id = auth.uid());
