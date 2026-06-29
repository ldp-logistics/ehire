-- Phase 3: legal audit trail, concurrency, soft delete, auto-checkout refinement flag.

-- ── attendance_audit_logs (append-only; separate from legacy attendance_audit) ──
DO $$ BEGIN
  CREATE TYPE attendance_audit_log_action AS ENUM (
    'create',
    'update',
    'auto_checkout',
    'manual_edit'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS attendance_audit_logs (
  id VARCHAR(255) PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  attendance_id VARCHAR(255) NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
  action attendance_audit_log_action NOT NULL,
  old_value JSONB,
  new_value JSONB,
  changed_by_user_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_audit_logs_attendance
  ON attendance_audit_logs (attendance_id, created_at);

COMMENT ON TABLE attendance_audit_logs IS 'Legal / payroll audit: immutable rows with deep JSON snapshots.';

-- ── attendance_records refinements ───────────────────────────────────────────
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS missed_checkout BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by_user_id VARCHAR(255);

COMMENT ON COLUMN attendance_records.missed_checkout IS 'True when employee did not punch out (including auto-close path); status may still be present/late/half_day.';

-- At most one active (non-deleted) row per employee per calendar date
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_employee_date_active
  ON attendance_records (employee_id, date)
  WHERE deleted_at IS NULL;
