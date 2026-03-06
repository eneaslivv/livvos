-- Add color column to clients table for visual customization
ALTER TABLE clients ADD COLUMN IF NOT EXISTS color TEXT DEFAULT NULL;
