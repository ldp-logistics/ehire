-- Align assigned_systems.user_name with employee pseudonym (nickname) when present.
-- Fixes rows saved as legal name after nickname/real-name swap (e.g. Owais vs Liam Brooks).

UPDATE assigned_systems a
SET user_name = TRIM(e.nickname),
    updated_at = NOW()
FROM employees e
WHERE a.user_id = e.id
  AND e.nickname IS NOT NULL
  AND TRIM(e.nickname) <> ''
  AND TRIM(COALESCE(a.user_name, '')) <> TRIM(e.nickname)
  AND TRIM(COALESCE(a.user_name, '')) = TRIM(
    CONCAT(COALESCE(e.first_name, ''), ' ', COALESCE(e.last_name, ''))
  );
