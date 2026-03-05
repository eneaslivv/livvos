-- Migrate remaining client_tasks into the unified tasks table
-- Only migrate tasks that don't already exist (by title+client_id+created_at match)

INSERT INTO tasks (title, description, completed, priority, status, owner_id, client_id, due_date, created_at, updated_at)
SELECT
  ct.title,
  ct.description,
  ct.completed,
  COALESCE(ct.priority, 'medium'),
  CASE WHEN ct.completed THEN 'done' ELSE 'todo' END,
  ct.owner_id,
  ct.client_id,
  ct.due_date,
  ct.created_at,
  COALESCE(ct.updated_at, ct.created_at)
FROM client_tasks ct
WHERE NOT EXISTS (
  SELECT 1 FROM tasks t
  WHERE t.client_id = ct.client_id
    AND t.title = ct.title
    AND t.created_at = ct.created_at
);
