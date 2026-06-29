-- Employee role from FreshTeam (display/sync; auth roles stay in users table).
-- Roles table for FT role list; employees.role stores the primary role name.
-- Idempotent: safe to run multiple times.

-- Roles from FreshTeam (for dropdown and employee.role sync)
CREATE TABLE IF NOT EXISTS roles (
  id varchar(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  freshteam_id varchar(32),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS roles_freshteam_id_key ON roles (freshteam_id) WHERE freshteam_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS roles_freshteam_id_idx ON roles (freshteam_id) WHERE freshteam_id IS NOT NULL;

-- Employee primary role (from FreshTeam roles array; single role name for display)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS role text;

COMMENT ON TABLE roles IS 'Roles from FreshTeam for employee profile and org sync';
COMMENT ON COLUMN employees.role IS 'Primary role name from FreshTeam (display only; auth is in users.role)';
