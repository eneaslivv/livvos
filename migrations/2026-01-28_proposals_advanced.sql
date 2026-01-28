ALTER TABLE proposals ADD COLUMN IF NOT EXISTS project_type TEXT;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS brief_text TEXT;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS portfolio_ids UUID[] DEFAULT '{}';
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS complexity TEXT DEFAULT 'standard';
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS complexity_factor NUMERIC DEFAULT 1.0;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS pricing_total NUMERIC;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS consent_text TEXT;

ALTER TABLE service_pricing ADD COLUMN IF NOT EXISTS simple_factor NUMERIC DEFAULT 0.8;
ALTER TABLE service_pricing ADD COLUMN IF NOT EXISTS standard_factor NUMERIC DEFAULT 1.0;
ALTER TABLE service_pricing ADD COLUMN IF NOT EXISTS advanced_factor NUMERIC DEFAULT 1.3;
ALTER TABLE service_pricing ADD COLUMN IF NOT EXISTS complex_factor NUMERIC DEFAULT 1.6;

CREATE TABLE IF NOT EXISTS proposal_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  project_type TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  sections JSONB DEFAULT '[]'::jsonb,
  tone TEXT DEFAULT 'confident',
  consent_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_templates' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE proposal_templates ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_proposal_templates_tenant_id ON proposal_templates(tenant_id);

ALTER TABLE proposal_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proposal_templates_select" ON proposal_templates;
CREATE POLICY "proposal_templates_select" ON proposal_templates
FOR SELECT
USING (tenant_id IS NULL OR can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "proposal_templates_modify" ON proposal_templates;
CREATE POLICY "proposal_templates_modify" ON proposal_templates
FOR ALL
USING (can_access_tenant(tenant_id))
WITH CHECK (can_access_tenant(tenant_id));

CREATE TABLE IF NOT EXISTS portfolio_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  cover_url TEXT,
  project_type TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'portfolio_items' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE portfolio_items ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_portfolio_items_tenant_id ON portfolio_items(tenant_id);

ALTER TABLE portfolio_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portfolio_items_select" ON portfolio_items;
CREATE POLICY "portfolio_items_select" ON portfolio_items
FOR SELECT
USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "portfolio_items_modify" ON portfolio_items;
CREATE POLICY "portfolio_items_modify" ON portfolio_items
FOR ALL
USING (can_access_tenant(tenant_id))
WITH CHECK (can_access_tenant(tenant_id));

CREATE TABLE IF NOT EXISTS proposal_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID REFERENCES proposals(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  ip_address TEXT,
  consent_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposal_signatures' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE proposal_signatures ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_proposal_signatures_proposal_id ON proposal_signatures(proposal_id);

ALTER TABLE proposal_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proposal_signatures_select" ON proposal_signatures;
CREATE POLICY "proposal_signatures_select" ON proposal_signatures
FOR SELECT
USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "proposal_signatures_insert" ON proposal_signatures;
CREATE POLICY "proposal_signatures_insert" ON proposal_signatures
FOR INSERT
WITH CHECK (true);

INSERT INTO proposal_templates (tenant_id, project_type, language, sections, tone, consent_text)
SELECT NULL, v.project_type, v.language, v.sections, 'confident', v.consent_text
FROM (
  VALUES
    ('web', 'en', '["Business Snapshot","Project Goals","Scope / Deliverables","Timeline","Pricing","Portfolio References","Terms & Signature"]'::jsonb, 'By approving, you agree to the scope, timeline, and pricing outlined above.'),
    ('branding', 'en', '["Business Snapshot","Brand Objectives","Scope / Deliverables","Timeline","Pricing","Portfolio References","Terms & Signature"]'::jsonb, 'By approving, you agree to the scope, timeline, and pricing outlined above.'),
    ('saas', 'en', '["Business Snapshot","Product Goals","Scope / Deliverables","Timeline","Pricing","Portfolio References","Terms & Signature"]'::jsonb, 'By approving, you agree to the scope, timeline, and pricing outlined above.'),
    ('ecommerce', 'en', '["Business Snapshot","Commerce Goals","Scope / Deliverables","Timeline","Pricing","Portfolio References","Terms & Signature"]'::jsonb, 'By approving, you agree to the scope, timeline, and pricing outlined above.'),
    ('automation', 'en', '["Business Snapshot","Automation Goals","Scope / Deliverables","Timeline","Pricing","Portfolio References","Terms & Signature"]'::jsonb, 'By approving, you agree to the scope, timeline, and pricing outlined above.'),
    ('animation', 'en', '["Business Snapshot","Creative Direction","Scope / Deliverables","Timeline","Pricing","Portfolio References","Terms & Signature"]'::jsonb, 'By approving, you agree to the scope, timeline, and pricing outlined above.'),
    ('content', 'en', '["Business Snapshot","Content Strategy","Scope / Deliverables","Timeline","Pricing","Portfolio References","Terms & Signature"]'::jsonb, 'By approving, you agree to the scope, timeline, and pricing outlined above.'),
    ('web', 'es', '["Resumen del negocio","Objetivos del proyecto","Alcance / Entregables","Timeline","Pricing","Portfolio","Términos y Firma"]'::jsonb, 'Al aprobar, aceptas el alcance, cronograma y precios detallados arriba.'),
    ('branding', 'es', '["Resumen del negocio","Objetivos de marca","Alcance / Entregables","Timeline","Pricing","Portfolio","Términos y Firma"]'::jsonb, 'Al aprobar, aceptas el alcance, cronograma y precios detallados arriba.'),
    ('saas', 'es', '["Resumen del negocio","Objetivos del producto","Alcance / Entregables","Timeline","Pricing","Portfolio","Términos y Firma"]'::jsonb, 'Al aprobar, aceptas el alcance, cronograma y precios detallados arriba.'),
    ('ecommerce', 'es', '["Resumen del negocio","Objetivos eCommerce","Alcance / Entregables","Timeline","Pricing","Portfolio","Términos y Firma"]'::jsonb, 'Al aprobar, aceptas el alcance, cronograma y precios detallados arriba.'),
    ('automation', 'es', '["Resumen del negocio","Objetivos de automatización","Alcance / Entregables","Timeline","Pricing","Portfolio","Términos y Firma"]'::jsonb, 'Al aprobar, aceptas el alcance, cronograma y precios detallados arriba.'),
    ('animation', 'es', '["Resumen del negocio","Dirección creativa","Alcance / Entregables","Timeline","Pricing","Portfolio","Términos y Firma"]'::jsonb, 'Al aprobar, aceptas el alcance, cronograma y precios detallados arriba.'),
    ('content', 'es', '["Resumen del negocio","Estrategia de contenido","Alcance / Entregables","Timeline","Pricing","Portfolio","Términos y Firma"]'::jsonb, 'Al aprobar, aceptas el alcance, cronograma y precios detallados arriba.')
) AS v(project_type, language, sections, consent_text)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.submit_proposal_feedback(
  p_token UUID,
  p_status TEXT,
  p_comment TEXT DEFAULT NULL,
  p_full_name TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_consent_text TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_proposal proposals%ROWTYPE;
BEGIN
  SELECT * INTO v_proposal
  FROM proposals
  WHERE public_token = p_token AND public_enabled = true
  LIMIT 1;

  IF v_proposal.id IS NULL THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;

  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  UPDATE proposals
  SET status = p_status,
      approved_at = CASE WHEN p_status = 'approved' THEN now() ELSE approved_at END,
      rejected_at = CASE WHEN p_status = 'rejected' THEN now() ELSE rejected_at END,
      updated_at = now()
  WHERE id = v_proposal.id;

  IF p_comment IS NOT NULL AND length(trim(p_comment)) > 0 THEN
    INSERT INTO proposal_comments (proposal_id, tenant_id, is_client, comment)
    VALUES (v_proposal.id, v_proposal.tenant_id, true, p_comment);
  END IF;

  IF p_status = 'approved' AND p_full_name IS NOT NULL AND p_email IS NOT NULL THEN
    INSERT INTO proposal_signatures (proposal_id, tenant_id, full_name, email, consent_text)
    VALUES (v_proposal.id, v_proposal.tenant_id, p_full_name, p_email, p_consent_text);
  END IF;

  UPDATE leads
  SET proposal_status = p_status,
      last_proposal_id = v_proposal.id,
      proposal_approved_at = CASE WHEN p_status = 'approved' THEN now() ELSE proposal_approved_at END
  WHERE id = v_proposal.lead_id;

  RETURN jsonb_build_object('status', p_status, 'proposal_id', v_proposal.id);
END;
$$;
