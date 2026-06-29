-- ============================================================
-- 0068: Org-derived manager (Freshteam-style)
--
-- "Manager" is no longer a role you assign to a user.
-- It is derived at runtime from org structure:
--   - A user whose linked employee has direct reports → effectiveRole = 'manager'
--   - Stored users.role is used only for admin, hr, employee, it
--
-- We backfill all existing users whose stored role = 'manager'
-- to 'employee' so the stored role column is clean.
-- The effectiveRole returned by /api/auth/me and used by all
-- server-side checks will still come back as 'manager' for these
-- users because getEffectiveRole() queries employees.manager_id.
-- ============================================================

-- 1. Backfill: anyone stored as 'manager' becomes 'employee'.
--    Their effective role is unchanged because getEffectiveRole()
--    now infers from org data, not from users.role.
UPDATE users
SET role = 'employee', updated_at = NOW()
WHERE role = 'manager';

-- 2. Add a comment on the column so the intent is documented.
COMMENT ON COLUMN users.role IS
  'Stored role: admin | hr | employee | it.
   "manager" is no longer stored here – it is derived at runtime from
   employees.manager_id (having direct reports). Do not write "manager"
   into this column.';
