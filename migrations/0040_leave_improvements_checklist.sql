-- Leave improvements: P0/P1/P2 checklist
-- Concurrency safety, HR override, historical integrity, year-end, holidays

-- P1: HR acting on behalf — who actually acted (approver_id = assigned, acted_by_id = HR when override)
ALTER TABLE leave_approvals
  ADD COLUMN IF NOT EXISTS acted_by_id varchar(255) NULL;
-- FK optional to avoid breaking if employees row missing
-- CREATE INDEX for lookups
CREATE INDEX IF NOT EXISTS leave_approvals_acted_by_id_idx ON leave_approvals (acted_by_id) WHERE acted_by_id IS NOT NULL;
COMMENT ON COLUMN leave_approvals.acted_by_id IS 'Employee who actually acted when HR/Admin acted on behalf of approver_id';

-- P1: Policy snapshot on request (display/report only; logic still uses leave_type_id)
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS policy_snapshot jsonb NULL;
COMMENT ON COLUMN leave_requests.policy_snapshot IS 'Snapshot at apply time: policyName, leaveTypeName, maxBalance, paid, requiresApproval. Display only.';

-- P0 Option B: Attendance sync status for retry (set on approve; NULL for pending requests)
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS attendance_sync_status varchar(20) NULL;
-- Values: synced, failed (NULL = not yet synced or N/A)
CREATE INDEX IF NOT EXISTS leave_requests_attendance_sync_status_idx ON leave_requests (attendance_sync_status) WHERE attendance_sync_status = 'failed';
COMMENT ON COLUMN leave_requests.attendance_sync_status IS 'Set after approval: synced=ok, failed=needs retry. NULL=pending or N/A.';

-- P2: Year-end snapshot (audit/reporting)
CREATE TABLE IF NOT EXISTS leave_year_end_snapshots (
  id varchar(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  employee_id varchar(255) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id varchar(255) NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  year int NOT NULL,
  balance numeric(6,2) NOT NULL DEFAULT 0,
  used numeric(6,2) NOT NULL DEFAULT 0,
  snapshot_at timestamptz NOT NULL DEFAULT NOW(),
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS leave_year_end_snapshots_employee_year_idx ON leave_year_end_snapshots (employee_id, year);
CREATE INDEX IF NOT EXISTS leave_year_end_snapshots_leave_type_year_idx ON leave_year_end_snapshots (leave_type_id, year);
COMMENT ON TABLE leave_year_end_snapshots IS 'Snapshot of balance/used at year-end reset; audit and reporting only';

-- P3: Holiday calendar (business-day calculation)
CREATE TABLE IF NOT EXISTS leave_holidays (
  id varchar(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  date date NOT NULL UNIQUE,
  name text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS leave_holidays_date_key ON leave_holidays (date);
COMMENT ON TABLE leave_holidays IS 'Company holidays; excluded from business-day count for leave';

-- Optional: policy_year for UI
ALTER TABLE leave_policies
  ADD COLUMN IF NOT EXISTS policy_year int NULL;
COMMENT ON COLUMN leave_policies.policy_year IS 'Optional display year e.g. 2025 for Leave Policy 2025';
