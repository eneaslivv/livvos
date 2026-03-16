-- Add document_id to tasks for linking checklist items to documents
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES documents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_document_id ON tasks(document_id);
