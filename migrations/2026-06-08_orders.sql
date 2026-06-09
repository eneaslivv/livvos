-- ============================================================================
-- orders (pedidos) — client-submitted requests that flow into the agency
-- ============================================================================
-- A client logged into their portal can submit a "pedido" (order / work
-- request). It lands in the owning agency's workspace as an inbox item the
-- team can triage, change status on, and eventually turn into a project/task.
--
-- Tenancy & access model:
--   • Every order is hard-scoped to a tenant_id (the agency that owns the
--     client relationship — e.g. CK Studio).
--   • AGENCY STAFF (rows in tenant_members for that tenant — this includes
--     connected partners like Livv working inside CK) get full control.
--   • The CLIENT (a portal auth user matched via clients.auth_user_id) can
--     CREATE their own orders and READ their own orders — nothing else, and
--     never other clients' orders. We deliberately key the client policies on
--     client ownership, NOT can_access_tenant(), so a client whose profile
--     happens to point at the agency tenant can't see the whole tenant.
-- ============================================================================

CREATE TABLE IF NOT EXISTS orders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
  client_id    UUID NOT NULL REFERENCES clients(id)  ON DELETE CASCADE,
  project_id   UUID REFERENCES projects(id)          ON DELETE SET NULL,
  created_by   UUID REFERENCES auth.users(id)        ON DELETE SET NULL,

  title        TEXT NOT NULL,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'new'
                 CHECK (status IN ('new','in_review','accepted','in_progress','done','rejected','cancelled')),
  priority     TEXT NOT NULL DEFAULT 'medium'
                 CHECK (priority IN ('low','medium','high','urgent')),
  attachments  JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{ name, url, size }]
  amount       NUMERIC,                              -- optional quoted/requested amount
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_tenant         ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_status  ON orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_client         ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at     ON orders(created_at DESC);

-- ── updated_at trigger ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION orders_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Agency staff (native members + connected partners) — full control of their
-- tenant's orders. Membership in tenant_members is the precise "is staff" test;
-- clients are never in tenant_members, so this cleanly excludes them.
DROP POLICY IF EXISTS orders_staff_all ON orders;
CREATE POLICY orders_staff_all ON orders
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM tenant_members tm
      WHERE tm.tenant_id = orders.tenant_id AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenant_members tm
      WHERE tm.tenant_id = orders.tenant_id AND tm.user_id = auth.uid()
    )
  );

-- Client: can create an order for THEIR OWN client record (and only inside the
-- agency that owns them). created_by must be themselves.
DROP POLICY IF EXISTS orders_client_insert ON orders;
CREATE POLICY orders_client_insert ON orders
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = orders.client_id
        AND c.tenant_id = orders.tenant_id
        AND c.auth_user_id = auth.uid()
    )
  );

-- Client: can read only their own orders.
DROP POLICY IF EXISTS orders_client_select ON orders;
CREATE POLICY orders_client_select ON orders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = orders.client_id
        AND c.auth_user_id = auth.uid()
    )
  );

-- ── Notify all agency staff on a new pedido ─────────────────────────────────
-- Delivers the order to EVERY member of the owning tenant — the native owner
-- (Christie) AND connected partners (Livv/Eneas, once shared into CK) — so it
-- reaches "both of us" without anyone polling. Best-effort: a notification
-- failure must never block the client from submitting their pedido.
CREATE OR REPLACE FUNCTION orders_notify_staff()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client_name TEXT;
  v_member RECORD;
BEGIN
  SELECT name INTO v_client_name FROM clients WHERE id = NEW.client_id;
  BEGIN
    FOR v_member IN
      SELECT user_id FROM tenant_members WHERE tenant_id = NEW.tenant_id
    LOOP
      PERFORM create_notification(
        v_member.user_id,
        'task',                                              -- valid notifications.type
        'Nuevo pedido de ' || COALESCE(v_client_name, 'un cliente'),
        NEW.title,
        NULL,
        jsonb_build_object('kind', 'order', 'order_id', NEW.id,
                           'client_id', NEW.client_id, 'project_id', NEW.project_id),
        NEW.tenant_id
      );
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- never block the pedido on a notification hiccup
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_notify_staff ON orders;
CREATE TRIGGER trg_orders_notify_staff
  AFTER INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_notify_staff();

-- ── Realtime ────────────────────────────────────────────────────────────────
-- The dashboard inbox + portal list subscribe via postgres_changes, so the
-- table must be in the supabase_realtime publication (guarded for idempotency).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE orders;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
