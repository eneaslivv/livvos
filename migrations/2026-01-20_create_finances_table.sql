-- ========================================
-- CREATE FINANCES TABLE
-- ========================================
-- This migration creates the missing canonical finances table
-- Resolves the duplicate table issue documented in AGENTS.md

-- Create the canonical finances table
CREATE TABLE IF NOT EXISTS finances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  
  -- Financial tracking fields
  total_agreed NUMERIC DEFAULT 0,           -- Total agreed amount with client
  total_collected NUMERIC DEFAULT 0,        -- Total amount actually collected
  direct_expenses NUMERIC DEFAULT 0,        -- Direct costs (materials, software, etc.)
  imputed_expenses NUMERIC DEFAULT 0,       -- Imputed costs (labor, overhead, etc.)
  hours_worked NUMERIC DEFAULT 0,            -- Total hours tracked on project
  
  -- Business model tracking
  business_model TEXT DEFAULT 'fixed',       -- 'fixed', 'hourly', 'retainer'
  hourly_rate NUMERIC,                       -- For hourly projects
  
  -- Financial health calculation
  health TEXT DEFAULT 'break-even',          -- 'profitable', 'break-even', 'loss'
  profit_margin NUMERIC GENERATED ALWAYS AS (
    CASE 
      WHEN total_agreed > 0 THEN 
        ROUND((total_collected - direct_expenses - imputed_expenses) / total_agreed * 100, 2)
      ELSE 0
    END
  ) STORED,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  
  -- Constraints
  CONSTRAINT finances_business_model_check CHECK (business_model IN ('fixed', 'hourly', 'retainer')),
  CONSTRAINT finances_health_check CHECK (health IN ('profitable', 'break-even', 'loss')),
  CONSTRAINT finances_amounts_non_negative CHECK (
    total_agreed >= 0 AND 
    total_collected >= 0 AND 
    direct_expenses >= 0 AND 
    imputed_expenses >= 0 AND 
    hours_worked >= 0
  )
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_finances_project_id ON finances(project_id);
CREATE INDEX IF NOT EXISTS idx_finances_tenant_id ON finances(tenant_id);
CREATE INDEX IF NOT EXISTS idx_finances_health ON finances(health);
CREATE INDEX IF NOT EXISTS idx_finances_business_model ON finances(business_model);

-- Create trigger to auto-update updated_at and calculate health
CREATE OR REPLACE FUNCTION update_finances_health()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the timestamp
  NEW.updated_at = now();
  
  -- Calculate financial health
  IF NEW.total_agreed > 0 THEN
    NEW.health = CASE 
      WHEN (NEW.total_collected - NEW.direct_expenses - NEW.imputed_expenses) > 0 
        THEN 'profitable'
      WHEN (NEW.total_collected - NEW.direct_expenses - NEW.imputed_expenses) = 0 
        THEN 'break-even'
      ELSE 'loss'
    END;
  ELSE
    NEW.health = 'break-even';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER finances_health_trigger
  BEFORE INSERT OR UPDATE ON finances
  FOR EACH ROW EXECUTE FUNCTION update_finances_health();

-- Add helpful comments
COMMENT ON TABLE finances IS 'Canonical financial tracking table for projects';
COMMENT ON COLUMN finances.project_id IS 'Link to the associated project';
COMMENT ON COLUMN finances.tenant_id IS 'Multi-tenant isolation';
COMMENT ON COLUMN finances.total_agreed IS 'Total contract amount agreed with client';
COMMENT ON COLUMN finances.total_collected IS 'Amount actually received from client';
COMMENT ON COLUMN finances.direct_expenses IS 'Direct costs (materials, software licenses, etc.)';
COMMENT ON COLUMN finances.imputed_expenses IS 'Imputed costs (labor, overhead, time)';
COMMENT ON COLUMN finances.hours_worked IS 'Total hours worked on this project';
COMMENT ON COLUMN finances.business_model IS 'Business model: fixed, hourly, or retainer';
COMMENT ON COLUMN finances.health IS 'Financial health: profitable, break-even, or loss';
COMMENT ON COLUMN finances.profit_margin IS 'Automatically calculated profit margin percentage';

-- Row Level Security (already enabled in comprehensive RLS policies migration)
ALTER TABLE finances ENABLE ROW LEVEL SECURITY;

-- Finances: SELECT Policy (will be overridden by comprehensive RLS policies)
CREATE POLICY "finances_select_policy" ON finances
FOR SELECT
USING (
  can_access_tenant(tenant_id) AND
  has_permission('finance', 'view')
);

-- Finances: INSERT/UPDATE/DELETE Policies (will be overridden by comprehensive RLS policies)
CREATE POLICY "finances_modify_policy" ON finances
FOR ALL
USING (
  can_access_tenant(tenant_id) AND
  has_permission('finance', 'edit')
);

-- Grant permissions
GRANT SELECT ON finances TO authenticated;
GRANT INSERT ON finances TO authenticated;
GRANT UPDATE ON finances TO authenticated;
GRANT DELETE ON finances TO authenticated;

-- Create a helpful function for finance summary
CREATE OR REPLACE FUNCTION get_project_financial_summary(p_project_id UUID)
RETURNS JSONB AS $$
DECLARE
  finance_data finances%ROWTYPE;
  summary JSONB;
BEGIN
  SELECT * INTO finance_data FROM finances WHERE project_id = p_project_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'message', 'No financial data found for this project'
    );
  END IF;
  
  summary := jsonb_build_object(
    'project_id', finance_data.project_id,
    'total_agreed', finance_data.total_agreed,
    'total_collected', finance_data.total_collected,
    'direct_expenses', finance_data.direct_expenses,
    'imputed_expenses', finance_data.imputed_expenses,
    'total_expenses', finance_data.direct_expenses + finance_data.imputed_expenses,
    'hours_worked', finance_data.hours_worked,
    'business_model', finance_data.business_model,
    'health', finance_data.health,
    'profit_margin', finance_data.profit_margin,
    'collection_rate', CASE 
      WHEN finance_data.total_agreed > 0 THEN 
        ROUND(finance_data.total_collected / finance_data.total_agreed * 100, 2)
      ELSE 0
    END,
    'effective_hourly_rate', CASE 
      WHEN finance_data.hours_worked > 0 AND finance_data.business_model = 'hourly' THEN 
        finance_data.total_collected / finance_data.hours_worked
      ELSE NULL
    END
  );
  
  RETURN summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;