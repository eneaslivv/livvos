-- Migration: Add logo_url column to tenants table
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url text DEFAULT '';
