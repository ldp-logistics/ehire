-- Leave year-end reset: last_reset_at on employee_leave_balances for idempotent reset.
-- leave_audit_log already has: entity_type, entity_id, action, performed_by, metadata (supports YEAR_END_RESET, CARRY_FORWARD_APPLIED, LEAVE_ENCASHED).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employee_leave_balances' AND column_name = 'last_reset_at'
  ) THEN
    ALTER TABLE employee_leave_balances ADD COLUMN last_reset_at timestamp with time zone NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leave_balances_last_reset_at ON employee_leave_balances(last_reset_at) WHERE last_reset_at IS NOT NULL;
