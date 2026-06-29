-- Remove Billing (procurement), Received, and Invoices modules from asset management.
-- Run this after deploying the backend/frontend that no longer use these tables.

DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS received_items CASCADE;
DROP TABLE IF EXISTS procurement_items CASCADE;

-- Drop enums that were only used by these tables (Postgres keeps enum types after table drop)
DROP TYPE IF EXISTS invoice_status CASCADE;
DROP TYPE IF EXISTS procurement_status CASCADE;
