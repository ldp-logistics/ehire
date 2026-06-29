-- Extend leave day type: first half / second half for partial days
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'first_half' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'leave_day_type')) THEN
    ALTER TYPE leave_day_type ADD VALUE 'first_half';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'second_half' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'leave_day_type')) THEN
    ALTER TYPE leave_day_type ADD VALUE 'second_half';
  END IF;
END $$;

-- Store employee IDs to notify when leave is applied (for "Notify others" in apply form)
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS notify_employee_ids jsonb DEFAULT NULL;
