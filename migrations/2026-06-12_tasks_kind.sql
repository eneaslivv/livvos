-- =============================================================================
-- tasks.kind — categoría derivada de la tarea
--
-- Hasta hoy una tarea sin project_id y sin client_id se mostraba como
-- "No project · No client" en el detail panel y quedaba visualmente
-- huérfana mezclada con el resto. La realidad es que esas tareas son
-- intencionales — laburo interno del estudio, admin, ops, founder-mode.
-- Esta migración formaliza ese concepto:
--
--   client_work  → tiene project_id (y/o client_id) → trabajo facturable
--   direct       → tiene client_id pero NO project_id → cliente sin proyecto formal
--   internal     → sin client ni project → laburo de estudio / interno
--   personal     → reservado para tareas marcadas a mano por el user (futuro)
--
-- La columna se mantiene auto-sincronizada vía trigger en insert/update
-- cuando el user no la setea explícitamente — así no necesitamos cambiar
-- el frontend para los cientos de paths que crean tareas. Si el user
-- elige a mano "internal" o "personal", respetamos su elección y no la
-- pisamos cuando reasigna project/client después.
--
-- Idempotente. Backfilea todo lo existente en una pasada.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'kind'
  ) THEN
    ALTER TABLE public.tasks ADD COLUMN kind text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tasks_kind_chk'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_kind_chk
      CHECK (kind IS NULL OR kind IN ('client_work','direct','internal','personal'));
  END IF;
END $$;

-- ── Función de derivación ────────────────────────────────────────────
-- Calcula el kind a partir de project_id / client_id. Se usa tanto en
-- el backfill como en el trigger. Mantiene 'personal' si ya estaba
-- seteado (el user lo marcó a mano), no lo sobreescribe.
CREATE OR REPLACE FUNCTION public.derive_task_kind(p_project uuid, p_client uuid, p_current text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_current = 'personal' THEN 'personal'
    WHEN p_project IS NOT NULL THEN 'client_work'
    WHEN p_client  IS NOT NULL THEN 'direct'
    ELSE 'internal'
  END;
$$;

-- ── Trigger: auto-derive en insert/update ────────────────────────────
CREATE OR REPLACE FUNCTION public.tasks_kind_autoderive()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Insert: si el user no especificó kind, derivamos.
  IF TG_OP = 'INSERT' THEN
    NEW.kind := COALESCE(NEW.kind, public.derive_task_kind(NEW.project_id, NEW.client_id, NULL));
    RETURN NEW;
  END IF;

  -- Update: si cambia project_id o client_id y el kind actual NO es
  -- 'personal' (que es el único explícito del user), re-derivamos.
  -- Si el caller cambió kind a mano en el mismo update, respetamos.
  IF TG_OP = 'UPDATE' THEN
    IF NEW.kind IS DISTINCT FROM OLD.kind THEN
      -- El caller cambió kind explícitamente — no tocamos.
      RETURN NEW;
    END IF;
    IF (NEW.project_id IS DISTINCT FROM OLD.project_id)
       OR (NEW.client_id IS DISTINCT FROM OLD.client_id) THEN
      NEW.kind := public.derive_task_kind(NEW.project_id, NEW.client_id, OLD.kind);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_kind_autoderive_trg ON public.tasks;
CREATE TRIGGER tasks_kind_autoderive_trg
  BEFORE INSERT OR UPDATE OF project_id, client_id, kind ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_kind_autoderive();

-- ── Backfill ─────────────────────────────────────────────────────────
UPDATE public.tasks
SET kind = public.derive_task_kind(project_id, client_id, kind)
WHERE kind IS NULL;

-- ── Índice para filtros UI ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS tasks_kind_idx ON public.tasks(kind);

NOTIFY pgrst, 'reload config';
