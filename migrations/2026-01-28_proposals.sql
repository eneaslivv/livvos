CREATE TABLE IF NOT EXISTS service_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  pricing_model TEXT NOT NULL DEFAULT 'fixed',
  hourly_rate NUMERIC,
  fixed_price NUMERIC,
  estimated_weeks INTEGER DEFAULT 4,
  complexity TEXT DEFAULT 'standard',
  tech_stack TEXT[] DEFAULT '{}',
  deliverables TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_pricing_tenant_id ON service_pricing(tenant_id);

ALTER TABLE service_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_pricing_select" ON service_pricing;
CREATE POLICY "service_pricing_select" ON service_pricing
FOR SELECT
USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "service_pricing_modify" ON service_pricing;
CREATE POLICY "service_pricing_modify" ON service_pricing
FOR ALL
USING (can_access_tenant(tenant_id))
WITH CHECK (can_access_tenant(tenant_id));

CREATE TABLE IF NOT EXISTS proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  content TEXT,
  pricing_snapshot JSONB DEFAULT '{}'::jsonb,
  timeline JSONB DEFAULT '{}'::jsonb,
  currency TEXT DEFAULT 'USD',
  public_token UUID DEFAULT gen_random_uuid(),
  public_enabled BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposals_tenant_id ON proposals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_proposals_lead_id ON proposals(lead_id);
CREATE INDEX IF NOT EXISTS idx_proposals_client_id ON proposals(client_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_public_token ON proposals(public_token);

ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proposals_select" ON proposals;
CREATE POLICY "proposals_select" ON proposals
FOR SELECT
USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "proposals_modify" ON proposals;
CREATE POLICY "proposals_modify" ON proposals
FOR ALL
USING (can_access_tenant(tenant_id))
WITH CHECK (can_access_tenant(tenant_id));

CREATE TABLE IF NOT EXISTS proposal_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID REFERENCES proposals(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_client BOOLEAN DEFAULT FALSE,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_comments_proposal_id ON proposal_comments(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_comments_tenant_id ON proposal_comments(tenant_id);

ALTER TABLE proposal_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proposal_comments_select" ON proposal_comments;
CREATE POLICY "proposal_comments_select" ON proposal_comments
FOR SELECT
USING (can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "proposal_comments_insert" ON proposal_comments;
CREATE POLICY "proposal_comments_insert" ON proposal_comments
FOR INSERT
WITH CHECK (can_access_tenant(tenant_id));

ALTER TABLE leads ADD COLUMN IF NOT EXISTS proposal_status TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_proposal_id UUID REFERENCES proposals(id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS proposal_sent_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS proposal_approved_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.get_public_proposal(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_proposal JSONB;
BEGIN
  SELECT to_jsonb(p.*) INTO v_proposal
  FROM proposals p
  WHERE p.public_token = p_token AND p.public_enabled = true
  LIMIT 1;

  IF v_proposal IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'proposal', v_proposal,
    'comments', (
      SELECT COALESCE(jsonb_agg(to_jsonb(c.*) ORDER BY c.created_at ASC), '[]'::jsonb)
      FROM proposal_comments c
      WHERE c.proposal_id = (v_proposal->>'id')::uuid
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_proposal_feedback(
  p_token UUID,
  p_status TEXT,
  p_comment TEXT DEFAULT NULL
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

  UPDATE leads
  SET proposal_status = p_status,
      last_proposal_id = v_proposal.id,
      proposal_approved_at = CASE WHEN p_status = 'approved' THEN now() ELSE proposal_approved_at END
  WHERE id = v_proposal.lead_id;

  RETURN jsonb_build_object('status', p_status, 'proposal_id', v_proposal.id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_proposal(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_proposal_feedback(UUID, TEXT, TEXT) TO anon, authenticated;
