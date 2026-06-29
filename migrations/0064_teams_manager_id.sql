-- Team lead / reporting manager for org-structure teams (primary team = team with manager set).
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS manager_id varchar(255) REFERENCES employees (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS teams_manager_id_idx ON teams (manager_id) WHERE manager_id IS NOT NULL;

COMMENT ON COLUMN teams.manager_id IS 'Employee who leads this team; teams with a manager are primary teams for My Teams.';
