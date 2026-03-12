-- Link payments (installments/incomes) to delivery milestones (tasks)
-- Allows synchronizing payment dates with project delivery dates across all views

ALTER TABLE installments ADD COLUMN IF NOT EXISTS linked_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;
ALTER TABLE incomes ADD COLUMN IF NOT EXISTS linked_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_installments_linked_task ON installments(linked_task_id);
CREATE INDEX IF NOT EXISTS idx_incomes_linked_task ON incomes(linked_task_id);
