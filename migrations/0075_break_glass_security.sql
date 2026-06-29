-- Break-glass (baseline local admin) hardening: forced password rotation + TOTP + recovery codes.
-- Run after 0074 (or any prior users migration).

ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_pending_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_recovery_codes_hash JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Force baseline admin to change seed password on next login (after migration).
UPDATE users
SET must_change_password = true
WHERE LOWER(TRIM(email)) IN ('admin@admani.com', 'ehire@ldplogistics.com');
