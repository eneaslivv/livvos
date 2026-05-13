-- Project brand image — uploaded logo (vs the existing emoji `icon` column).
-- The sidebar tree renders logoUrl > icon > color, in that priority.
-- Stored under tenant-assets bucket at project-logos/<project_id>.<ext>.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMENT ON COLUMN projects.logo_url IS
  'Public URL of an uploaded brand image for this project. Falls back to '
  'icon, then color, when empty.';
