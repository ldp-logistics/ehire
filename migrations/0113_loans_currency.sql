-- Add currency to loan tables (default PKR for existing rows)
ALTER TABLE loan_applications
  ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'PKR';

ALTER TABLE loan_records
  ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'PKR';
