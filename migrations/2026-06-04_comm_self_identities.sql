-- ============================================================================
-- Communications — self-identity linking
-- ============================================================================
-- Problem: the inbox ingests messages the LIVV OS user wrote themselves from a
-- DIFFERENT external account (e.g. their personal Slack "Eneas" or an alternate
-- mail) and shows them as inbound "follow-ups / unopened" — because the system
-- has no way to know those external identities belong to the account owner.
--
-- slack-sync already marks messages from KNOWN team members (profiles.slack_user_id)
-- as handled; the gap is purely that the user's own identities were never linked.
--
-- This migration:
--   1. Adds per-profile arrays of "this external identity is me" (slack ids + emails).
--   2. Adds link_comm_self_identity(): one RPC the authed client calls to record an
--      identity AND retroactively re-tag existing inbox rows as outbound + already-seen,
--      so the user's own past messages immediately drop out of unopened / follow-up.
-- Idempotent.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS comm_self_slack_ids text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS comm_self_emails    text[] NOT NULL DEFAULT '{}';

-- SECURITY DEFINER so it can re-tag communication_messages, but it verifies the
-- caller is a member of p_tenant first, and only ever touches that tenant's rows
-- and the caller's own profile — so it is safe to expose to `authenticated`.
CREATE OR REPLACE FUNCTION public.link_comm_self_identity(
  p_tenant      uuid,
  p_platform    text,                  -- 'slack' | 'gmail' (informational; matching is by id/email)
  p_external_id text DEFAULT NULL,     -- slack user id, e.g. U0ATTQ1EU0L
  p_email       text DEFAULT NULL,     -- email address
  p_unlink      boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_affected int  := 0;
  v_rows     int  := 0;
  v_email    text := lower(nullif(btrim(p_email), ''));
  v_ext      text := nullif(btrim(p_external_id), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members WHERE tenant_id = p_tenant AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'not a member of tenant %', p_tenant;
  END IF;

  IF p_unlink THEN
    IF v_ext IS NOT NULL THEN
      UPDATE public.profiles
        SET comm_self_slack_ids = array_remove(coalesce(comm_self_slack_ids, '{}'), v_ext)
        WHERE id = v_uid;
      -- Only resurrect rows still considered "ours" and not otherwise actioned.
      UPDATE public.communication_messages
        SET direction = 'inbound', replied_in_platform = false
        WHERE tenant_id = p_tenant AND platform = 'slack' AND from_id = v_ext
          AND direction = 'outbound' AND status = 'pending';
      GET DIAGNOSTICS v_rows = ROW_COUNT; v_affected := v_affected + v_rows;
    END IF;
    IF v_email IS NOT NULL THEN
      UPDATE public.profiles
        SET comm_self_emails = array_remove(coalesce(comm_self_emails, '{}'), v_email)
        WHERE id = v_uid;
      UPDATE public.communication_messages
        SET direction = 'inbound', replied_in_platform = false
        WHERE tenant_id = p_tenant AND platform = 'gmail' AND lower(from_email) = v_email
          AND direction = 'outbound' AND status = 'pending';
      GET DIAGNOSTICS v_rows = ROW_COUNT; v_affected := v_affected + v_rows;
    END IF;
    RETURN jsonb_build_object('unlinked', true, 'messages_updated', v_affected);
  END IF;

  -- LINK ----------------------------------------------------------------------
  IF v_ext IS NOT NULL THEN
    UPDATE public.profiles
      SET comm_self_slack_ids = (
            SELECT array(SELECT DISTINCT e FROM unnest(coalesce(comm_self_slack_ids, '{}') || ARRAY[v_ext]) e)
          ),
          -- adopt as the primary slack id too if the user never linked one,
          -- so task-assignee DMs and "you replied in Slack" detection work.
          slack_user_id = coalesce(nullif(slack_user_id, ''), v_ext)
      WHERE id = v_uid;
    UPDATE public.communication_messages
      SET direction = 'outbound',
          replied_in_platform = true,
          opened_at = coalesce(opened_at, received_at, now()),
          read_at   = coalesce(read_at, received_at, now())
      WHERE tenant_id = p_tenant AND platform = 'slack' AND from_id = v_ext;
    GET DIAGNOSTICS v_rows = ROW_COUNT; v_affected := v_affected + v_rows;
  END IF;

  IF v_email IS NOT NULL THEN
    UPDATE public.profiles
      SET comm_self_emails = (
            SELECT array(SELECT DISTINCT e FROM unnest(coalesce(comm_self_emails, '{}') || ARRAY[v_email]) e)
          )
      WHERE id = v_uid;
    UPDATE public.communication_messages
      SET direction = 'outbound',
          replied_in_platform = true,
          opened_at = coalesce(opened_at, received_at, now()),
          read_at   = coalesce(read_at, received_at, now())
      WHERE tenant_id = p_tenant AND platform = 'gmail' AND lower(from_email) = v_email;
    GET DIAGNOSTICS v_rows = ROW_COUNT; v_affected := v_affected + v_rows;
  END IF;

  RETURN jsonb_build_object('linked', true, 'messages_updated', v_affected);
END $$;

GRANT EXECUTE ON FUNCTION public.link_comm_self_identity(uuid, text, text, text, boolean) TO authenticated;

-- ============================================================================
-- BEFORE INSERT trigger — tag self-authored messages at the data layer.
-- ============================================================================
-- Rather than editing every ingest function (slack-sync, gmail-sync,
-- slack-events, gmail-events, ...), a single trigger guarantees that any newly
-- inserted message whose author matches a tenant member's linked identity is
-- marked outbound + already-seen. One source of truth, every path covered.
--   slack: from_id  == profiles.slack_user_id OR ∈ comm_self_slack_ids
--   gmail: from_email == profiles.email OR ∈ comm_self_emails OR a connected mailbox
CREATE OR REPLACE FUNCTION public.tag_self_authored_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_self boolean := false;
BEGIN
  -- Respect an explicit outbound (e.g. gmail-send) — nothing to do.
  IF coalesce(NEW.direction, 'inbound') = 'outbound' THEN
    RETURN NEW;
  END IF;

  IF NEW.platform = 'slack' AND NEW.from_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      JOIN public.profiles p ON p.id = tm.user_id
      WHERE tm.tenant_id = NEW.tenant_id
        AND (
          NEW.from_id = p.slack_user_id
          OR NEW.from_id = ANY (coalesce(p.comm_self_slack_ids, '{}'))
        )
    ) INTO v_is_self;
  ELSIF NEW.platform = 'gmail' AND NEW.from_email IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      JOIN public.profiles p ON p.id = tm.user_id
      WHERE tm.tenant_id = NEW.tenant_id
        AND (
          lower(NEW.from_email) = lower(coalesce(p.email, ''))
          OR lower(NEW.from_email) = ANY (
            SELECT lower(e) FROM unnest(coalesce(p.comm_self_emails, '{}')) e
          )
        )
    ) INTO v_is_self;

    IF NOT v_is_self THEN
      -- A connected mailbox's own address = our own sent mail.
      SELECT EXISTS (
        SELECT 1 FROM public.integration_tokens it
        WHERE it.tenant_id = NEW.tenant_id
          AND it.platform = 'gmail'
          AND lower(coalesce(it.gmail_email, '')) = lower(NEW.from_email)
      ) INTO v_is_self;
    END IF;
  END IF;

  IF v_is_self THEN
    NEW.direction          := 'outbound';
    NEW.replied_in_platform := true;
    NEW.opened_at          := coalesce(NEW.opened_at, NEW.received_at, now());
    NEW.read_at            := coalesce(NEW.read_at, NEW.received_at, now());
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Identity tagging must never break message ingestion.
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tag_self_authored ON public.communication_messages;
CREATE TRIGGER trg_tag_self_authored
  BEFORE INSERT ON public.communication_messages
  FOR EACH ROW EXECUTE FUNCTION public.tag_self_authored_message();

NOTIFY pgrst, 'reload schema';
