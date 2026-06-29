-- Add optional branch filter to check-in reminder slots.
-- NULL = all branches (default). A JSON array of branch IDs restricts to only those branches.
ALTER TABLE checkin_reminder_settings
  ADD COLUMN IF NOT EXISTS branch_ids jsonb DEFAULT NULL;

COMMENT ON COLUMN checkin_reminder_settings.branch_ids IS
  'NULL = all branches. JSON array of branch id strings to restrict this reminder to specific branches.';
