-- Compensation leave: manual HR/manager credit when employee works on a holiday/off day.
-- No accrual, no carry forward, no encashment; balance starts at 0 and is topped up via Leave Admin.

ALTER TABLE leave_types
  ADD COLUMN IF NOT EXISTS is_compensation_leave boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN leave_types.is_compensation_leave IS
  'When true: no auto accrual, balance credited manually by HR/manager, not carried forward at year-end.';
