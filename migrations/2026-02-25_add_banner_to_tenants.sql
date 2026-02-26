-- Add banner_url column to tenants table
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS banner_url text;
