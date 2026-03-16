-- Add dark mode logo variant to tenants
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url_dark text DEFAULT '';
