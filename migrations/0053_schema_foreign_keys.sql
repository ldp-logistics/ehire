-- Add missing foreign key constraints to match Drizzle schema.
-- Idempotent: skips adding constraint if it already exists.
--
-- Uses NOT VALID so existing rows are not checked (no data deleted, migration always succeeds).
-- New inserts/updates are still enforced. To enforce on existing rows later, fix any orphan
-- data then run: ALTER TABLE <table> VALIDATE CONSTRAINT <constraint_name>;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'change_requests_requester_id_fkey') THEN
    ALTER TABLE change_requests ADD CONSTRAINT change_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'change_requests_employee_id_fkey') THEN
    ALTER TABLE change_requests ADD CONSTRAINT change_requests_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'change_requests_reviewed_by_fkey') THEN
    ALTER TABLE change_requests ADD CONSTRAINT change_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_profile_changes_changed_by_fkey') THEN
    ALTER TABLE employee_profile_changes ADD CONSTRAINT employee_profile_changes_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_created_by_fkey') THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_assignee_id_fkey') THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES employees(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_comments_author_id_fkey') THEN
    ALTER TABLE task_comments ADD CONSTRAINT task_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'salary_details_employee_id_fkey') THEN
    ALTER TABLE salary_details ADD CONSTRAINT salary_details_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'banking_details_employee_id_fkey') THEN
    ALTER TABLE banking_details ADD CONSTRAINT banking_details_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bonuses_employee_id_fkey') THEN
    ALTER TABLE bonuses ADD CONSTRAINT bonuses_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_grants_employee_id_fkey') THEN
    ALTER TABLE stock_grants ADD CONSTRAINT stock_grants_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'emergency_contacts_employee_id_fkey') THEN
    ALTER TABLE emergency_contacts ADD CONSTRAINT emergency_contacts_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dependents_employee_id_fkey') THEN
    ALTER TABLE dependents ADD CONSTRAINT dependents_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
