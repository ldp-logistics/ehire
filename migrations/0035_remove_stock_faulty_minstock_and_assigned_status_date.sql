-- Remove faulty, min_stock from stock_items; remove status, assigned_date from assigned_systems.
-- Indexes on dropped columns are dropped automatically.

ALTER TABLE stock_items
  DROP COLUMN IF EXISTS faulty,
  DROP COLUMN IF EXISTS min_stock;

ALTER TABLE assigned_systems
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS assigned_date;

-- Remove enum type that was only used by assigned_systems.status
DROP TYPE IF EXISTS system_status CASCADE;
