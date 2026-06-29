-- Clear all existing asset management data.
-- Run this before loading fresh data from CSV.
-- Order respects FKs: ticket_comments → support_tickets → assigned_systems; stock_items and asset_audit_log are independent.

TRUNCATE TABLE ticket_comments;
TRUNCATE TABLE support_tickets;
TRUNCATE TABLE assigned_systems;
TRUNCATE TABLE stock_items;
TRUNCATE TABLE asset_audit_log;
