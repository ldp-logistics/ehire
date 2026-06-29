-- FreshTeam export: pseudonym in first/last; legal name often in "Nickname" (stored here for directory suffix).
ALTER TABLE employees ADD COLUMN IF NOT EXISTS nickname text;
COMMENT ON COLUMN employees.nickname IS 'Optional pseudonym / office name; display: legal first+last (nickname)';
