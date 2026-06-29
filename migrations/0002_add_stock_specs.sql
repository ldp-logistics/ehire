-- Add product_type and specs columns to stock_items for product-specific specifications
ALTER TABLE "stock_items" ADD COLUMN IF NOT EXISTS "product_type" varchar(50);
ALTER TABLE "stock_items" ADD COLUMN IF NOT EXISTS "specs" jsonb;
