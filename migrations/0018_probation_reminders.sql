-- Probation reminder tracking: one row per (employee, reminder_type) to prevent duplicate sends.
-- reminder_type: 'day_7', 'day_3', 'day_1'
CREATE TABLE IF NOT EXISTS probation_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id varchar(255) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  reminder_type text NOT NULL CHECK (reminder_type IN ('day_7', 'day_3', 'day_1')),
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(employee_id, reminder_type)
);

CREATE INDEX IF NOT EXISTS idx_probation_reminders_employee ON probation_reminders(employee_id);
CREATE INDEX IF NOT EXISTS idx_probation_reminders_sent_at ON probation_reminders(sent_at);

-- Optional: probation_status for explicit tracking (nullable for backward compatibility).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'probation_status'
  ) THEN
    ALTER TABLE employees ADD COLUMN probation_status text;
  END IF;
END $$;
