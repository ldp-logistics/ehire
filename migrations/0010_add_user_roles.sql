-- Multiple roles per user (e.g. employee + manager, or employee + hr)
-- When empty, primary role (users.role) is used. When set, user has all listed roles.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS roles jsonb NOT NULL DEFAULT '[]';

COMMENT ON COLUMN users.roles IS 'Additional roles: e.g. ["manager","hr"]. Primary role is in users.role. User is allowed if allowedRoles includes role OR any of roles.';
