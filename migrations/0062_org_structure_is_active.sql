-- Add is_active to all organization structure tables for soft-delete and restore.
-- Idempotent: safe to run multiple times.

ALTER TABLE departments       ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE sub_departments   ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE business_units    ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE teams             ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE levels           ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE branches         ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE work_shifts       ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE roles             ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE job_categories    ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS departments_is_active_idx ON departments (is_active);
CREATE INDEX IF NOT EXISTS sub_departments_is_active_idx ON sub_departments (is_active);
CREATE INDEX IF NOT EXISTS business_units_is_active_idx ON business_units (is_active);
CREATE INDEX IF NOT EXISTS teams_is_active_idx ON teams (is_active);
CREATE INDEX IF NOT EXISTS levels_is_active_idx ON levels (is_active);
CREATE INDEX IF NOT EXISTS branches_is_active_idx ON branches (is_active);
CREATE INDEX IF NOT EXISTS work_shifts_is_active_idx ON work_shifts (is_active);
CREATE INDEX IF NOT EXISTS roles_is_active_idx ON roles (is_active);
CREATE INDEX IF NOT EXISTS job_categories_is_active_idx ON job_categories (is_active);

COMMENT ON COLUMN departments.is_active IS 'When false, hidden from dropdowns; can be restored';
COMMENT ON COLUMN sub_departments.is_active IS 'When false, hidden from dropdowns; can be restored';
COMMENT ON COLUMN business_units.is_active IS 'When false, hidden from dropdowns; can be restored';
COMMENT ON COLUMN teams.is_active IS 'When false, hidden from dropdowns; can be restored';
COMMENT ON COLUMN levels.is_active IS 'When false, hidden from dropdowns; can be restored';
COMMENT ON COLUMN branches.is_active IS 'When false, hidden from dropdowns; can be restored';
COMMENT ON COLUMN work_shifts.is_active IS 'When false, hidden from dropdowns; can be restored';
COMMENT ON COLUMN roles.is_active IS 'When false, hidden from dropdowns; can be restored';
COMMENT ON COLUMN job_categories.is_active IS 'When false, hidden from dropdowns; can be restored';
