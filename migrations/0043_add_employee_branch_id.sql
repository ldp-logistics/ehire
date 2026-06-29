-- Link employees to branch for timezone (method 4: branch-based timezone).
-- Set branch_id per employee; branch.time_zone is then used for "today" and shift logic.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS branch_id varchar(255) REFERENCES branches(id);
CREATE INDEX IF NOT EXISTS employees_branch_id_idx ON employees (branch_id) WHERE branch_id IS NOT NULL;
