ALTER TABLE folders ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE files ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_files_project_id ON files(project_id);
CREATE INDEX IF NOT EXISTS idx_folders_project_id ON folders(project_id);

DROP POLICY IF EXISTS "client_files_project_select" ON files;
CREATE POLICY "client_files_project_select" ON files
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM projects p
    JOIN clients c ON c.id = p.client_id
    WHERE p.id = files.project_id
      AND c.auth_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "client_folders_project_select" ON folders;
CREATE POLICY "client_folders_project_select" ON folders
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM projects p
    JOIN clients c ON c.id = p.client_id
    WHERE p.id = folders.project_id
      AND c.auth_user_id = auth.uid()
  )
);
