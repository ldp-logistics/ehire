-- Per-user timezone (Settings). IANA name e.g. Asia/Karachi, America/New_York.
ALTER TABLE users ADD COLUMN IF NOT EXISTS time_zone text;
