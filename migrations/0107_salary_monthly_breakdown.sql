-- Monthly salary breakdown: base, allowances, additional allowances (JSONB).
-- Legacy FreshTeam rows keep NULL breakdown columns until HR updates.

ALTER TABLE salary_details
  ADD COLUMN IF NOT EXISTS base_salary_monthly NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS allowances_monthly NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS additional_allowances JSONB NOT NULL DEFAULT '[]'::jsonb;
