-- Migration 0135: Link employees to branches from location text
-- Manual adds set location (branch name) but often leave branch_id NULL,
-- so PK region filter hid them from the directory.

-- 1. Exact match: location text = branch name
UPDATE employees e
SET branch_id = b.id
FROM branches b
WHERE e.branch_id IS NULL
  AND e.location IS NOT NULL
  AND LOWER(TRIM(e.location)) = LOWER(TRIM(b.name));

-- 2. Heuristic backfill (same rules as 0127 — idempotent)
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

UPDATE employees SET branch_id = 'e4708b27-4750-4c75-a66f-120b3d6f40cc'
WHERE branch_id IS NULL AND location ILIKE '%new delhi%' AND location NOT ILIKE '%ashok%';
