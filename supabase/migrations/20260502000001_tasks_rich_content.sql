-- ============================================================================
-- Add rich-content columns to tasks
-- ============================================================================
-- The TaskDetailPanel writes:
--   - description_html  (TipTap output, HTML string with inline <img> tags)
--   - attachments       (jsonb array of {id, url, name, size, mime, added_at})
--   - cover_url         (single image URL, currently unused but kept for future)
--
-- Without these columns, the frontend's optimistic-update + missing-column
-- retry loop in CalendarContext.updateTask silently STRIPS the fields,
-- so the user types a description / pastes an image, sees it locally, then
-- loses everything on refresh. This migration unblocks the persistence path.
-- ============================================================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS description_html TEXT,
  ADD COLUMN IF NOT EXISTS attachments      JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cover_url        TEXT;

-- Backfill description_html from plain description for tasks that already
-- have notes — wraps the text in a <p> so the rich editor can render it
-- without losing the existing content.
UPDATE tasks
SET description_html = '<p>' || replace(replace(description, E'\n', '<br/>'), '&', '&amp;') || '</p>'
WHERE description_html IS NULL
  AND description IS NOT NULL
  AND length(trim(description)) > 0;

-- GIN index for searching attachments by id/url later (small impact, defensive).
CREATE INDEX IF NOT EXISTS idx_tasks_attachments_gin ON tasks USING gin (attachments);

-- PostgREST schema reload so the new columns are immediately queryable.
NOTIFY pgrst, 'reload schema';
