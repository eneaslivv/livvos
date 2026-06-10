-- Client portal access fixes
-- ─────────────────────────────────────────────────────────────────
-- Found auditing the live DB (2026-06-09): the client portal could not
-- show projects or project tasks to logged-in portal clients, and some
-- clients never got their auth account linked.

-- 1. projects_select_client compared projects.client_id (a clients.id)
--    against auth.uid() (an auth.users id) — different ID spaces, so it
--    never matched and portal clients couldn't see their projects.
DROP POLICY IF EXISTS projects_select_client ON public.projects;
CREATE POLICY projects_select_client ON public.projects FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = projects.client_id
      AND c.auth_user_id = auth.uid()
  )
);

-- 2. Portal clients could only see tasks explicitly tagged with their
--    client_id. The portal renders the project's task list / progress,
--    so the client of a project gets read access to its tasks too.
DROP POLICY IF EXISTS tasks_client_project_select ON public.tasks;
CREATE POLICY tasks_client_project_select ON public.tasks FOR SELECT USING (
  tasks.project_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.projects p
    JOIN public.clients c ON c.id = p.client_id
    WHERE p.id = tasks.project_id
      AND c.auth_user_id = auth.uid()
  )
);

-- 3. Backfill clients.auth_user_id for clients whose email already has
--    an auth account (e.g. invites accepted before accept_invitation
--    linked the client row — Christie King's case). Exact email match only.
UPDATE public.clients c
SET auth_user_id = u.id
FROM auth.users u
WHERE c.auth_user_id IS NULL
  AND c.email IS NOT NULL
  AND c.email <> ''
  AND lower(c.email) = lower(u.email);
