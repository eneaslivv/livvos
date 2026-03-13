-- Add deploy_hook_url to tenants for CMS deploy-to-production button
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS deploy_hook_url TEXT;
