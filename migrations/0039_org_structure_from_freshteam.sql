-- Organization structure tables for FreshTeam sync (branches → location, departments, teams, etc.).
-- Idempotent: CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS branches (
  id varchar(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  freshteam_id varchar(32),
  city text,
  state text,
  country_code varchar(10),
  time_zone text,
  currency varchar(10),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS branches_freshteam_id_idx ON branches (freshteam_id) WHERE freshteam_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS departments (
  id varchar(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  freshteam_id varchar(32),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS departments_freshteam_id_idx ON departments (freshteam_id) WHERE freshteam_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS sub_departments (
  id varchar(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  freshteam_id varchar(32),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sub_departments_freshteam_id_idx ON sub_departments (freshteam_id) WHERE freshteam_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS business_units (
  id varchar(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  freshteam_id varchar(32),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS business_units_freshteam_id_idx ON business_units (freshteam_id) WHERE freshteam_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS teams (
  id varchar(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  freshteam_id varchar(32),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS teams_freshteam_id_idx ON teams (freshteam_id) WHERE freshteam_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS levels (
  id varchar(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  freshteam_id varchar(32),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS levels_freshteam_id_idx ON levels (freshteam_id) WHERE freshteam_id IS NOT NULL;

COMMENT ON TABLE branches IS 'Locations/branches synced from FreshTeam; employees.location can match name';
COMMENT ON TABLE departments IS 'Departments synced from FreshTeam; employees.department can match name';
COMMENT ON TABLE teams IS 'Teams synced from FreshTeam; employees.primary_team can match name';
