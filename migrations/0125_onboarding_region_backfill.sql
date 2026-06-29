-- ============================================================
-- 0125: Backfill onboarding_records.region_code from employee branch
--
-- Legacy onboarding rows may have region_code NULL even when the
-- employee's branch is assigned (e.g. created before 0123 or
-- branch assigned after onboarding started). Regional admins then
-- fail-closed and cannot see the record.
--
-- Idempotent: safe to run multiple times.
-- ============================================================

UPDATE onboarding_records o
SET region_code = b.region_code,
    updated_at  = NOW()
FROM employees e
JOIN branches b ON b.id = e.branch_id
WHERE o.employee_id = e.id
  AND o.region_code IS NULL
  AND b.region_code IS NOT NULL;

-- Also repair rows where stored region_code disagrees with current employee branch.
UPDATE onboarding_records o
SET region_code = b.region_code,
    updated_at  = NOW()
FROM employees e
JOIN branches b ON b.id = e.branch_id
WHERE o.employee_id = e.id
  AND b.region_code IS NOT NULL
  AND o.region_code IS DISTINCT FROM b.region_code;
