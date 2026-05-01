-- Add emoji icon column for fast visual diff in tasks/sidebars.
-- Used to mark a client or project with a single emoji that's surfaced in
-- list/sidebar/task views alongside (or instead of) the avatar / color.
ALTER TABLE clients  ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS icon TEXT;
