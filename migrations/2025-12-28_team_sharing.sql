-- Profiles table to look up users by email
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id uuid PRIMARY KEY,
  email text UNIQUE,
  name text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
-- Allow all authenticated users to read profiles to enable sharing by email
CREATE POLICY "profiles_read_all" ON public.profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);
-- Allow users to upsert their own profile
CREATE POLICY "profiles_upsert_self" ON public.profiles
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE USING (user_id = auth.uid());

-- Project members table
CREATE TABLE IF NOT EXISTS public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  member_id uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
-- Owners can manage members of their projects
CREATE POLICY "project_members_manage_by_owner" ON public.project_members
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.owner_id = auth.uid())
  );
-- Members can read their membership entries
CREATE POLICY "project_members_read_self" ON public.project_members
  FOR SELECT USING (member_id = auth.uid());

-- Extend project policies to include memberships
DROP POLICY IF EXISTS "projects_select_own" ON public.projects;
CREATE POLICY "projects_select_own_or_member" ON public.projects
  FOR SELECT USING (
    owner_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.project_members pm WHERE pm.project_id = id AND pm.member_id = auth.uid())
  );

DROP POLICY IF EXISTS "projects_update_own" ON public.projects;
CREATE POLICY "projects_update_own_or_member" ON public.projects
  FOR UPDATE USING (
    owner_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.project_members pm WHERE pm.project_id = id AND pm.member_id = auth.uid())
  );

