-- ============================================================================
-- Add folder_id to documents
-- ============================================================================
-- Rich-text documents (the ones authored via the in-app TipTap editor) lived
-- in a flat list at the root of the Documents page. Uploaded `files` already
-- had a `folder_id` and could be organized into folders, but the rich-text
-- docs couldn't — so a user with a few dozen docs ended up with everything
-- piled at the root with no way to group them.
--
-- This migration mirrors the `files.folder_id` column on `documents`:
--   - Nullable (a document may live at the root)
--   - ON DELETE SET NULL so deleting a folder demotes its docs to the root
--     instead of cascading them away
-- ============================================================================

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id);

NOTIFY pgrst, 'reload schema';
