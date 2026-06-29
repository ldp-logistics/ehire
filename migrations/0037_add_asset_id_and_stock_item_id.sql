-- Add human-readable asset_id to stock_items (for QR / display). Backfill existing rows.
ALTER TABLE stock_items
  ADD COLUMN IF NOT EXISTS asset_id varchar(50) NULL;

UPDATE stock_items s
SET asset_id = 'STOCK-' || LPAD(t.rn::text, 5, '0')
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn
  FROM stock_items
) t
WHERE s.id = t.id AND (s.asset_id IS NULL OR s.asset_id = '');

CREATE UNIQUE INDEX IF NOT EXISTS stock_items_asset_id_unique ON stock_items(asset_id) WHERE asset_id IS NOT NULL;

-- Add stock_item_id to assigned_systems so we can link assigned units to stock type when assigning from stock,
-- while using human-readable asset_id (e.g. AST-2026-00001) for display/QR.
ALTER TABLE assigned_systems
  ADD COLUMN IF NOT EXISTS stock_item_id varchar(255) NULL REFERENCES stock_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS assigned_systems_stock_item_id_idx ON assigned_systems(stock_item_id) WHERE stock_item_id IS NOT NULL;

COMMENT ON COLUMN stock_items.asset_id IS 'Human-readable ID for QR/labels, e.g. STOCK-00001. Auto-generated if not set.';
COMMENT ON COLUMN assigned_systems.stock_item_id IS 'Stock item this assignment came from (when assigned from stock). Used with asset_id for display.';
