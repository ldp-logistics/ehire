-- Enterprise attendance extensions: snapshots, shift overrides, window guard, OT, holidays, statuses.

-- ── attendance_status enum (additive; keep existing values) ─────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'attendance_status' AND e.enumlabel = 'weekend'
  ) THEN ALTER TYPE attendance_status ADD VALUE 'weekend'; END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'attendance_status' AND e.enumlabel = 'holiday'
  ) THEN ALTER TYPE attendance_status ADD VALUE 'holiday'; END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'attendance_status' AND e.enumlabel = 'short_hours'
  ) THEN ALTER TYPE attendance_status ADD VALUE 'short_hours'; END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'attendance_status' AND e.enumlabel = 'missed_checkout'
  ) THEN ALTER TYPE attendance_status ADD VALUE 'missed_checkout'; END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'attendance_status' AND e.enumlabel = 'invalid_punch'
  ) THEN ALTER TYPE attendance_status ADD VALUE 'invalid_punch'; END IF;
END $$;

-- ── attendance_records: immutable policy snapshot + auto-checkout + OT approval ──
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS policy_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS is_auto_checkout BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_checkout_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_overtime_approved BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN attendance_records.policy_snapshot IS 'Frozen org/shift timing rules at check-in; checkout/status use this when present.';

-- ── employee_shifts: optional override to use shift times instead of org policy ──
ALTER TABLE employee_shifts
  ADD COLUMN IF NOT EXISTS use_shift_override BOOLEAN NOT NULL DEFAULT false;

-- ── org_timesheet_policy: punch window, OT rules, auto-checkout buffer ───────────
ALTER TABLE org_timesheet_policy
  ADD COLUMN IF NOT EXISTS checkin_window_start_offset_minutes INTEGER NOT NULL DEFAULT -120,
  ADD COLUMN IF NOT EXISTS checkin_window_end_offset_minutes INTEGER NOT NULL DEFAULT 240,
  ADD COLUMN IF NOT EXISTS min_overtime_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_requires_approval BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_checkout_buffer_minutes INTEGER NOT NULL DEFAULT 60;

COMMENT ON COLUMN org_timesheet_policy.checkin_window_start_offset_minutes IS 'Minutes relative to shift start; earliest allowed check-in (e.g. -120 = 2h before).';
COMMENT ON COLUMN org_timesheet_policy.checkin_window_end_offset_minutes IS 'Minutes relative to shift start; latest allowed check-in (e.g. 240 = 4h after).';

-- ── org_holidays (global + per-country) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_holidays (
  id VARCHAR(255) PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  holiday_date DATE NOT NULL,
  country_code VARCHAR(2),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_holidays_date ON org_holidays (holiday_date);
CREATE INDEX IF NOT EXISTS idx_org_holidays_date_country ON org_holidays (holiday_date, country_code);

COMMENT ON TABLE org_holidays IS 'Org-wide holidays; country_code NULL means all regions.';
