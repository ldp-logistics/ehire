-- ============================================================
-- 0131: Per-region IT stock inventory (region_code on stock_items)
--
-- Existing stock is Pakistan HQ inventory — backfill PK.
-- New items inherit creator region (or ?region= for super admin).
-- Idempotent.
-- ============================================================

ALTER TABLE stock_items
  ADD COLUMN IF NOT EXISTS region_code VARCHAR(10);

UPDATE stock_items
SET region_code = 'PK'
WHERE region_code IS NULL;

ALTER TABLE stock_items
  ALTER COLUMN region_code SET NOT NULL;

CREATE INDEX IF NOT EXISTS stock_items_region_code_idx ON stock_items (region_code);
