-- Org-wide timesheet / attendance rules (Settings → Admin/HR).
-- Used when an employee has no shift assignment, and for half-day thresholds when a shift exists.
CREATE TABLE IF NOT EXISTS org_timesheet_policy (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  policy_timezone TEXT,
  work_day_start TIME NOT NULL DEFAULT '09:00',
  work_day_end TIME NOT NULL DEFAULT '18:00',
  grace_minutes INTEGER NOT NULL DEFAULT 15,
  half_day_threshold_percent SMALLINT NOT NULL DEFAULT 50
    CHECK (half_day_threshold_percent >= 1 AND half_day_threshold_percent <= 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id VARCHAR(255)
);

INSERT INTO org_timesheet_policy (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE org_timesheet_policy IS 'Single-row policy: default work window for timesheets when no shift; late/half-day rules apply org-wide.';
