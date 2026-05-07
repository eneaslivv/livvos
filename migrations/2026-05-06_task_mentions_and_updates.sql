-- ============================================================================
-- Task @mentions + task UPDATE notifications
-- ============================================================================
-- The user wanted three things on top of existing comment notifications:
--   (1) @mentioning a teammate inside a comment fires a 'mention' notification
--       to that user (priority=high, distinct from the regular comment ping).
--   (2) Task UPDATE events (status change, assignee change, due_date change,
--       reactivation from done → todo/in-progress) fire a 'task' notification
--       to the assignee + owner so they don't miss being re-pulled into work.
--   (3) Notifications carry a deep-link including ?task=<id> so clicking them
--       opens the task drawer directly (Calendar.tsx already reads ?task=).
--
-- The mention format used by the frontend MentionPicker is `@[Name](user-id)`
-- — easy to parse with a single regex, easy to render as a styled chip in
-- the comment body, and idempotent (the id never changes if the name does).
-- ============================================================================

-- ── 1. Helper: extract mentioned user_ids from a comment ────────────────────
-- Returns the set of user-ids found in `@[Name](uuid)` markup that ALSO
-- belong to the same tenant as the task. The tenant filter is the key
-- safety bit — a malicious commenter can't ping users from other tenants
-- by hand-crafting the markup.
CREATE OR REPLACE FUNCTION extract_mentioned_user_ids(
  p_comment   TEXT,
  p_tenant_id UUID
)
RETURNS UUID[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids       UUID[] := ARRAY[]::UUID[];
  v_match     TEXT;
  v_uuid      UUID;
BEGIN
  IF p_comment IS NULL OR p_tenant_id IS NULL THEN
    RETURN v_ids;
  END IF;

  -- Walk every `@[…](uuid)` token. The inner uuid is what matters.
  FOR v_match IN
    SELECT (regexp_matches(p_comment, '@\[[^\]]+\]\(([0-9a-fA-F-]{36})\)', 'g'))[1]
  LOOP
    BEGIN
      v_uuid := v_match::uuid;
    EXCEPTION WHEN others THEN
      CONTINUE;  -- malformed uuid in markup; skip
    END;
    -- Only keep ids that are real members of the tenant
    IF EXISTS (
      SELECT 1 FROM tenant_members
      WHERE user_id = v_uuid AND tenant_id = p_tenant_id
    ) THEN
      v_ids := v_ids || v_uuid;
    END IF;
  END LOOP;

  RETURN v_ids;
END;
$$;

GRANT EXECUTE ON FUNCTION extract_mentioned_user_ids(TEXT, UUID) TO authenticated;

-- ── 2. Replace notify_on_task_comment to include mentions + deep-link ──────
CREATE OR REPLACE FUNCTION notify_on_task_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title          TEXT;
  v_owner          UUID;
  v_assignee       UUID;
  v_preview        TEXT;
  v_link           TEXT;
  v_mentions       UUID[];
  v_uid            UUID;
  v_already        UUID[] := ARRAY[]::UUID[];
BEGIN
  SELECT title, owner_id, assignee_id
  INTO v_title, v_owner, v_assignee
  FROM tasks WHERE id = NEW.task_id;

  -- Strip @[Name](uuid) markup from the preview so notifications read
  -- naturally ("you got pinged on: ok let's ship this @Luis" → "you got
  -- pinged on: ok let's ship this @Luis").
  v_preview := regexp_replace(NEW.comment, '@\[([^\]]+)\]\([0-9a-fA-F-]{36}\)', '@\1', 'g');
  v_preview := LEFT(v_preview, 120) ||
    CASE WHEN LENGTH(v_preview) > 120 THEN '…' ELSE '' END;

  v_link := '/calendar?task=' || NEW.task_id::text;

  -- ── A. Mentioned users — highest priority, distinct type ──
  v_mentions := extract_mentioned_user_ids(NEW.comment, NEW.tenant_id);

  FOREACH v_uid IN ARRAY v_mentions LOOP
    -- Don't ping the commenter even if they self-mention.
    IF v_uid = NEW.user_id THEN CONTINUE; END IF;
    PERFORM create_notification(
      v_uid,
      'mention',
      COALESCE(NEW.user_name, 'Someone') || ' mentioned you in: ' || COALESCE(v_title, 'a task'),
      v_preview,
      v_link,
      jsonb_build_object(
        'task_id',    NEW.task_id,
        'comment_id', NEW.id,
        'is_internal', NEW.is_internal,
        'kind',       'mention'
      )
    );
    v_already := v_already || v_uid;
  END LOOP;

  -- ── B. Task owner (skip if commenter or already mentioned) ──
  IF v_owner IS NOT NULL
     AND v_owner != NEW.user_id
     AND NOT (v_owner = ANY(v_already))
  THEN
    PERFORM create_notification(
      v_owner,
      'task',
      COALESCE(NEW.user_name, 'Someone') || ' commented on: ' || COALESCE(v_title, 'a task'),
      v_preview,
      v_link,
      jsonb_build_object(
        'task_id',    NEW.task_id,
        'comment_id', NEW.id,
        'is_internal', NEW.is_internal,
        'kind',       'comment'
      )
    );
    v_already := v_already || v_owner;
  END IF;

  -- ── C. Assignee (skip if same as owner / commenter / already pinged) ──
  IF v_assignee IS NOT NULL
     AND v_assignee != NEW.user_id
     AND NOT (v_assignee = ANY(v_already))
  THEN
    PERFORM create_notification(
      v_assignee,
      'task',
      COALESCE(NEW.user_name, 'Someone') || ' commented on: ' || COALESCE(v_title, 'a task'),
      v_preview,
      v_link,
      jsonb_build_object(
        'task_id',    NEW.task_id,
        'comment_id', NEW.id,
        'is_internal', NEW.is_internal,
        'kind',       'comment'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger already exists from the original comments migration; CREATE OR
-- REPLACE on the function is enough to upgrade behavior in place.

-- ── 3. Task UPDATE notification trigger ────────────────────────────────────
-- Fires when a task gets reassigned, status flips, or due_date moves. The
-- assignee (and the owner, if different) get pinged so they know the work
-- they own just changed under them.
CREATE OR REPLACE FUNCTION notify_on_task_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link        TEXT;
  v_actor       UUID;
  v_actor_name  TEXT;
  v_recipients  UUID[] := ARRAY[]::UUID[];
  v_uid         UUID;
  v_summary     TEXT := NULL;
  v_priority    TEXT := 'medium';
  v_was_done    BOOLEAN;
  v_now_done    BOOLEAN;
BEGIN
  -- The actor is whoever wrote the row. Fall back to NEW.owner_id if
  -- auth.uid() is null (e.g. service-role updates from edge fns).
  v_actor := COALESCE(auth.uid(), NEW.owner_id);

  -- Resolve a friendly name for the actor (best-effort). The profiles
  -- table uses `name` (not full_name); fall back to email then a constant.
  IF v_actor IS NOT NULL THEN
    SELECT COALESCE(NULLIF(TRIM(p.name), ''), p.email, 'Someone')
    INTO v_actor_name
    FROM profiles p WHERE p.id = v_actor;
  END IF;
  v_actor_name := COALESCE(v_actor_name, 'Someone');

  v_link := '/calendar?task=' || NEW.id::text;

  v_was_done := (OLD.status = 'done');
  v_now_done := (NEW.status = 'done');

  -- ── Reactivation: done → not done. Highest signal, top priority. ──
  IF v_was_done AND NOT v_now_done THEN
    v_summary  := v_actor_name || ' reactivated this task — now ' || COALESCE(NEW.status, 'open');
    v_priority := 'high';
  -- ── Status flip (any other transition that's not just done→done) ──
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    v_summary  := v_actor_name || ' moved this task to ' || COALESCE(NEW.status, 'unknown');
    v_priority := CASE WHEN NEW.status = 'done' THEN 'low' ELSE 'medium' END;
  -- ── Reassign ── (NEW assignee is told first-class below)
  ELSIF OLD.assignee_id IS DISTINCT FROM NEW.assignee_id THEN
    v_summary  := v_actor_name || ' assigned this task to you';
    v_priority := 'high';
  -- ── Due date moved ──
  ELSIF OLD.due_date IS DISTINCT FROM NEW.due_date THEN
    v_summary  := v_actor_name || ' moved the due date to ' ||
                  COALESCE(to_char(NEW.due_date, 'Mon DD'), 'no date');
    v_priority := 'medium';
  END IF;

  -- Nothing relevant changed → no-op.
  IF v_summary IS NULL THEN RETURN NEW; END IF;

  -- Build the recipient set. The actor is excluded — they already know
  -- what they did.
  IF NEW.assignee_id IS NOT NULL AND NEW.assignee_id != v_actor THEN
    v_recipients := v_recipients || NEW.assignee_id;
  END IF;
  IF NEW.owner_id IS NOT NULL
     AND NEW.owner_id != v_actor
     AND NOT (NEW.owner_id = ANY(v_recipients))
  THEN
    v_recipients := v_recipients || NEW.owner_id;
  END IF;
  -- For reassign, also notify the OLD assignee that they've been removed.
  IF OLD.assignee_id IS DISTINCT FROM NEW.assignee_id
     AND OLD.assignee_id IS NOT NULL
     AND OLD.assignee_id != v_actor
     AND NOT (OLD.assignee_id = ANY(v_recipients))
  THEN
    PERFORM create_notification(
      OLD.assignee_id,
      'task',
      v_actor_name || ' reassigned: ' || COALESCE(NEW.title, 'a task'),
      'You are no longer the assignee on this task.',
      v_link,
      jsonb_build_object('task_id', NEW.id, 'kind', 'unassigned')
    );
  END IF;

  FOREACH v_uid IN ARRAY v_recipients LOOP
    PERFORM create_notification(
      v_uid,
      'task',
      'Update: ' || COALESCE(NEW.title, 'a task'),
      v_summary,
      v_link,
      jsonb_build_object(
        'task_id',  NEW.id,
        'kind',     CASE
                      WHEN v_was_done AND NOT v_now_done THEN 'reactivated'
                      WHEN OLD.status IS DISTINCT FROM NEW.status THEN 'status_change'
                      WHEN OLD.assignee_id IS DISTINCT FROM NEW.assignee_id THEN 'reassigned'
                      WHEN OLD.due_date IS DISTINCT FROM NEW.due_date THEN 'date_change'
                      ELSE 'updated'
                    END
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_task_update ON tasks;
CREATE TRIGGER trigger_notify_task_update
  AFTER UPDATE ON tasks
  FOR EACH ROW
  WHEN (
    OLD.status      IS DISTINCT FROM NEW.status
    OR OLD.assignee_id IS DISTINCT FROM NEW.assignee_id
    OR OLD.due_date    IS DISTINCT FROM NEW.due_date
  )
  EXECUTE FUNCTION notify_on_task_update();

-- ── 4. Reload PostgREST schema so RPCs above are immediately callable ──
NOTIFY pgrst, 'reload schema';
