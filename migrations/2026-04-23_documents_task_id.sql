-- =============================================
-- Link documents to tasks
-- =============================================
-- Adds a task_id FK so a rich-text document can be bound to a specific task.
-- Existing project/client scoping is preserved; task_id is purely additive.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_task_id ON documents(task_id);

NOTIFY pgrst, 'reload config';
