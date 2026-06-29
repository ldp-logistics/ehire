-- ============================================================
-- 0129: Per-region benefit cards (region_code on benefit_cards)
--
-- Existing cards were created under Pakistan HR — backfill PK.
-- New cards inherit the creator's region (or ?region= for super admin).
-- Idempotent.
-- ============================================================

ALTER TABLE benefit_cards
  ADD COLUMN IF NOT EXISTS region_code VARCHAR(10);

-- Prefer creator's branch region when available.
UPDATE benefit_cards bc
SET region_code = b.region_code
FROM users u
LEFT JOIN employees e ON e.id = u.employee_id
LEFT JOIN branches b ON b.id = COALESCE(u.branch_id, e.branch_id)
WHERE bc.created_by = u.id
  AND bc.region_code IS NULL
  AND b.region_code IS NOT NULL;

-- Legacy rows without creator region → Pakistan (existing data).
UPDATE benefit_cards
SET region_code = 'PK'
WHERE region_code IS NULL;

ALTER TABLE benefit_cards
  ALTER COLUMN region_code SET NOT NULL;

CREATE INDEX IF NOT EXISTS benefit_cards_region_code_idx ON benefit_cards (region_code);
