-- Clear all existing asset management data before loading new CSVs.
-- Run this before importing your new asset/stock CSV files.
-- CASCADE truncates dependent tables (e.g. ticket_comments) so FK order is handled by PostgreSQL.

TRUNCATE TABLE ticket_comments, support_tickets, assigned_systems, stock_items, asset_audit_log CASCADE;
