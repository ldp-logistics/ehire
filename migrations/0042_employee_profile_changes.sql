-- Audit log for employee profile updates (PATCH /api/employees/:id).
-- Timeline uses this to show "Profile updated" events.
CREATE TABLE IF NOT EXISTS employee_profile_changes (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id VARCHAR(255) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by VARCHAR(255) NOT NULL,
  changed_fields JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS employee_profile_changes_employee_id_idx ON employee_profile_changes(employee_id);
CREATE INDEX IF NOT EXISTS employee_profile_changes_changed_at_idx ON employee_profile_changes(changed_at);
