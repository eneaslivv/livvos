-- ==============================================================================
-- DANGEROUS: EXEC SQL FUNCTION
-- ONLY FOR DEVELOPMENT/REPAIR PURPOSES
-- Allows executing arbitrary SQL from the frontend to fix schema issues
-- ==============================================================================

CREATE OR REPLACE FUNCTION exec_sql(sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql;
END;
$$;
