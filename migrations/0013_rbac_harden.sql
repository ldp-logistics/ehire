-- =====================================================================
-- 0013: Harden RBAC – add 'it' role, auth_provider, unique employee_id
-- Migration-safe: every statement uses IF NOT EXISTS / DO $$ blocks
-- =====================================================================

-- 1. Add 'it' value to user_role enum (must run outside transaction; use IF NOT EXISTS on PG 9.1+)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'it';

-- 2. Add auth_provider enum if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'auth_provider') THEN
    CREATE TYPE auth_provider AS ENUM ('local', 'microsoft');
  END IF;
END $$;

-- 3. Add auth_provider column if missing (default 'local')
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_provider auth_provider NOT NULL DEFAULT 'local';

-- 4. Add allowed_modules column if missing
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS allowed_modules jsonb NOT NULL DEFAULT '[]';

-- 5. Partial unique index on employee_id (only when NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS users_employee_id_unique
  ON users (employee_id) WHERE employee_id IS NOT NULL;

-- 6. Backfill auth_provider = 'microsoft' for users who logged in via SSO
UPDATE users SET auth_provider = 'microsoft'
WHERE sso_provider = 'microsoft' AND auth_provider = 'local';
