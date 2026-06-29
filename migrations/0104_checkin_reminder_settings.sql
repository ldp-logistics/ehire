-- Configurable check-in reminder slots.
-- Each row = one reminder time (HH:MM in policy timezone) + who gets it + whether it also nudges the employee.
CREATE TABLE IF NOT EXISTS checkin_reminder_settings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  send_time        time NOT NULL,           -- wall-clock time in org policy timezone, e.g. '09:16'
  enabled          boolean NOT NULL DEFAULT true,
  notify_hr        boolean NOT NULL DEFAULT true,  -- send digest to HR/limited_hr
  notify_employee  boolean NOT NULL DEFAULT false, -- send individual nudge to unchecked employees
  label            text,                    -- optional display label, e.g. "Morning reminder"
  sort_order       integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Idempotency: one send per (reminder_id, work_date)
CREATE TABLE IF NOT EXISTS checkin_reminder_sent (
  reminder_id  uuid NOT NULL REFERENCES checkin_reminder_settings(id) ON DELETE CASCADE,
  work_date    date NOT NULL,
  sent_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY  (reminder_id, work_date)
);
