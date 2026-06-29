-- Organization structure tables for FreshTeam sync (branches, departments, teams, etc.).
-- Idempotent: safe to run multiple times.

-- Branches (locations)
CREATE TABLE IF NOT EXISTS branches (
  id varchar(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  freshteam_id varchar(32),
  city text,
  state text,
  country_code varchar(10),
  time_zone varchar(64),
  currency varchar(10),
  main_office text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS branches_freshteam_id_key ON branches (freshteam_id) WHERE freshteam_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS branches_freshteam_id_idx ON branches (freshteam_id) WHERE freshteam_id IS NOT NULL;

-- Departments
CREATE TABLE IF NOT EXISTS departments (
  id varchar(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  freshteam_id varchar(32),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS departments_freshteam_id_key ON departments (freshteam_id) WHERE freshteam_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS departments_freshteam_id_idx ON departments (freshteam_id) WHERE freshteam_id IS NOT NULL;

-- Sub-departments
CREATE TABLE IF NOT EXISTS sub_departments (
  id varchar(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  freshteam_id varchar(32),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS sub_departments_freshteam_id_key ON sub_departments (freshteam_id) WHERE freshteam_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sub_departments_freshteam_id_idx ON sub_departments (freshteam_id) WHERE freshteam_id IS NOT NULL;

-- Business units
CREATE TABLE IF NOT EXISTS business_units (
  id varchar(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  freshteam_id varchar(32),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS business_units_freshteam_id_key ON business_units (freshteam_id) WHERE freshteam_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS business_units_freshteam_id_idx ON business_units (freshteam_id) WHERE freshteam_id IS NOT NULL;

-- Teams
CREATE TABLE IF NOT EXISTS teams (
  id varchar(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  freshteam_id varchar(32),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS teams_freshteam_id_key ON teams (freshteam_id) WHERE freshteam_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS teams_freshteam_id_idx ON teams (freshteam_id) WHERE freshteam_id IS NOT NULL;

-- Levels (job bands / grades)
CREATE TABLE IF NOT EXISTS levels (
  id varchar(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  freshteam_id varchar(32),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS levels_freshteam_id_key ON levels (freshteam_id) WHERE freshteam_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS levels_freshteam_id_idx ON levels (freshteam_id) WHERE freshteam_id IS NOT NULL;

COMMENT ON TABLE branches IS 'Branches/locations from FreshTeam for org structure sync';
COMMENT ON TABLE departments IS 'Departments from FreshTeam for org structure sync';
COMMENT ON TABLE sub_departments IS 'Sub-departments from FreshTeam for org structure sync';
COMMENT ON TABLE business_units IS 'Business units from FreshTeam for org structure sync';
COMMENT ON TABLE teams IS 'Teams from FreshTeam for org structure sync';
COMMENT ON TABLE levels IS 'Levels/grades from FreshTeam for org structure sync';
