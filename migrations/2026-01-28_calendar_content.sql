ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS content_status TEXT DEFAULT 'draft';
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS content_channel TEXT;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS content_asset_type TEXT;

CREATE INDEX IF NOT EXISTS idx_calendar_events_content_status ON calendar_events(content_status);
