-- Work shifts and job categories from FreshTeam for org structure sync and employee profile.
-- Idempotent: safe to run multiple times.

-- Work shifts (FT shift names for employee.shift label; distinct from attendance.shifts)
CREATE TABLE IF NOT EXISTS work_shifts (
  id varchar(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  freshteam_id varchar(32),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS work_shifts_freshteam_id_key ON work_shifts (freshteam_id) WHERE freshteam_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS work_shifts_freshteam_id_idx ON work_shifts (freshteam_id) WHERE freshteam_id IS NOT NULL;

-- Job categories (for employee.job_category)
CREATE TABLE IF NOT EXISTS job_categories (
  id varchar(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  freshteam_id varchar(32),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS job_categories_freshteam_id_key ON job_categories (freshteam_id) WHERE freshteam_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS job_categories_freshteam_id_idx ON job_categories (freshteam_id) WHERE freshteam_id IS NOT NULL;

COMMENT ON TABLE work_shifts IS 'Shift names from FreshTeam for employee profile (shift dropdown)';
COMMENT ON TABLE job_categories IS 'Job categories from FreshTeam for employee profile';
