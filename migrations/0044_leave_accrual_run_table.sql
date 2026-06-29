-- Track when monthly accrual (non–Earned Leave types) was last run — once per month.
-- Earned Leave uses 15-day blocks from join and runs whenever leave is viewed.

CREATE TABLE IF NOT EXISTS leave_accrual_run (
  period varchar(7) PRIMARY KEY,
  run_at timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE leave_accrual_run IS 'Last run of monthly accrual (non-EL types) per YYYY-MM. Earned Leave accrues by 15-day blocks on view.';
