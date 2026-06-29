-- ============================================================
-- 0069: Baseline employee primary + grants in users.roles
--
-- All accounts except admin@admani.com use users.role = 'employee'.
-- Prior primary admin/hr/it are merged into users.roles JSONB.
-- admin@admani.com keeps users.role = 'admin' (exception).
-- ============================================================

UPDATE users u
SET
  role = 'employee'::user_role,
  roles = COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(v))
      FROM (
        SELECT DISTINCT gv
        FROM (
          SELECT jsonb_array_elements_text(COALESCE(u.roles, '[]'::jsonb)) AS gv
          UNION ALL
          SELECT u.role::text AS gv
        ) z
        WHERE z.gv IN ('admin', 'hr', 'it')
      ) AS m(v)
    ),
    '[]'::jsonb
  ),
  updated_at = NOW()
WHERE LOWER(TRIM(u.email)) <> LOWER('admin@admani.com')
  AND u.role::text IN ('admin', 'hr', 'it');

COMMENT ON COLUMN users.role IS
  'Baseline: almost always employee. Privileges (admin, hr, it) live in users.roles JSONB.
   Exception: admin@admani.com may remain admin. Manager is org-derived.';
