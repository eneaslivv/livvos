CREATE OR REPLACE FUNCTION public.get_public_portfolio(p_token UUID)
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
    RETURN NULL;
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(to_jsonb(p.*)), '[]'::jsonb)
    FROM portfolio_items p
    WHERE p.id = ANY(v_proposal.portfolio_ids)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_portfolio(UUID) TO anon, authenticated;
