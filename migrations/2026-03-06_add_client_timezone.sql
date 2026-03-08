-- Add timezone column to clients table for timezone-aware scheduling
ALTER TABLE clients ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT NULL;
