-- Per-user module access: admin assigns which modules (sidebar items) each user can see.
-- Empty array = use role-based visibility. Non-empty = only those modules are shown.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS allowed_modules jsonb NOT NULL DEFAULT '[]';

COMMENT ON COLUMN users.allowed_modules IS 'Module keys user can access (e.g. ["dashboard","recruitment"]). Empty = role-based access.';
