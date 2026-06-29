-- ============================================================
-- 0126: Offboarding region backfill + employee branch from location
--
-- Offboarding list filters by employee branch region. Legacy employees
-- often have branch_id NULL (location string only) so regional admins
-- fail-closed and see no records.
--
-- Steps:
--   1. region_code on offboarding_records (explicit, like onboarding)
--   2. Backfill employees.branch_id from location → branches.name
--   3. Backfill offboarding_records.region_code from branch
--   4. Location fallback for rows still without branch
--
-- Idempotent: safe to run multiple times.
-- ============================================================

ALTER TABLE offboarding_records ADD COLUMN IF NOT EXISTS region_code TEXT;
CREATE INDEX IF NOT EXISTS offboarding_records_region_code_idx ON offboarding_records (region_code);

-- ── 2. Employee branch from location (mirrors job location backfill) ────────

UPDATE employees SET branch_id = '2573b84c-04d9-4415-93cf-6849ec6cfbcf'
WHERE branch_id IS NULL
  AND (location ILIKE '%karachi bahadurabad%' OR location ILIKE '%PK Karachi%');

UPDATE employees SET branch_id = '050e85bb-f119-4ce7-b778-30d1889fbc2a'
WHERE branch_id IS NULL AND location ILIKE '%ashok vihar%';

UPDATE employees SET branch_id = 'e4708b27-4750-4c75-a66f-120b3d6f40cc'
WHERE branch_id IS NULL AND location ILIKE '%moti nagar%';

UPDATE employees SET branch_id = '0ff5780d-812c-4ec4-a499-711493ce07c8'
WHERE branch_id IS NULL AND location ILIKE '%india remote%';

UPDATE employees SET branch_id = '4085d308-832d-4fab-a59a-ba7d15b82b12'
WHERE branch_id IS NULL
  AND (location ILIKE '%washington rd%' OR location ILIKE '%sayreville%' OR location ILIKE '%US NJ%');

UPDATE employees SET branch_id = '818ea2af-8060-4d52-924e-a7f72dd4187c'
WHERE branch_id IS NULL AND location ILIKE '%pakistan remote%';

UPDATE employees SET branch_id = '67ea500b-af6a-498f-bdb7-0d48315ca863'
WHERE branch_id IS NULL AND location ILIKE '%uae remote%';

UPDATE employees SET branch_id = '57f2d797-f82f-4216-a3b8-a9af53974a20'
WHERE branch_id IS NULL AND location ILIKE '%us remote%';

-- New Delhi (non Moti Nagar / Ashok Vihar)
UPDATE employees SET branch_id = 'e4708b27-4750-4c75-a66f-120b3d6f40cc'
WHERE branch_id IS NULL AND location ILIKE '%new delhi%' AND location NOT ILIKE '%ashok%';

-- ── 3. Offboarding region from employee branch ───────────────────────────────

UPDATE offboarding_records o
SET region_code = b.region_code,
    updated_at  = NOW()
FROM employees e
JOIN branches b ON b.id = e.branch_id
WHERE o.employee_id = e.id
  AND b.region_code IS NOT NULL
  AND (o.region_code IS NULL OR o.region_code IS DISTINCT FROM b.region_code);

-- ── 4. Location fallback when branch still unresolved ────────────────────────

UPDATE offboarding_records o
SET region_code = 'PK', updated_at = NOW()
FROM employees e
WHERE o.employee_id = e.id AND o.region_code IS NULL
  AND (e.location ILIKE '%karachi%' OR e.location ILIKE '%pakistan remote%' OR e.location ILIKE '%uae remote%'
       OR e.country ILIKE 'PK' OR e.country ILIKE '%pakistan%');

UPDATE offboarding_records o
SET region_code = 'US', updated_at = NOW()
FROM employees e
WHERE o.employee_id = e.id AND o.region_code IS NULL
  AND (e.location ILIKE '%washington rd%' OR e.location ILIKE '%us remote%' OR e.location ILIKE '%sayreville%'
       OR e.country ILIKE 'US' OR e.country ILIKE '%united states%');

UPDATE offboarding_records o
SET region_code = 'IN-N', updated_at = NOW()
FROM employees e
WHERE o.employee_id = e.id AND o.region_code IS NULL
  AND e.location ILIKE '%ashok vihar%';

UPDATE offboarding_records o
SET region_code = 'IN-S', updated_at = NOW()
FROM employees e
WHERE o.employee_id = e.id AND o.region_code IS NULL
  AND (e.location ILIKE '%moti nagar%' OR e.location ILIKE '%new delhi%' OR e.location ILIKE '%india remote%'
       OR (e.country ILIKE 'IN' AND e.location NOT ILIKE '%ashok vihar%'));

COMMENT ON COLUMN offboarding_records.region_code IS 'Region owning this offboarding record (multi-region access control)';
