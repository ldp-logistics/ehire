-- Extend org_timesheet_policy with working-days support.
-- Values: JS day-of-week integers (0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat).
-- Default: Monday–Friday = {1,2,3,4,5}
ALTER TABLE org_timesheet_policy
  ADD COLUMN IF NOT EXISTS working_days INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5}';

COMMENT ON COLUMN org_timesheet_policy.working_days
  IS '0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat — working days for attendance rules';
