-- Delete all existing (dummy) employees and related data.
-- Run this before importing fresh employee data (active + old) from CSV.
--
-- Order:
-- 1. Unlink user accounts from employees so user logins remain but no longer point to employees.
-- 2. Clear change_requests (reference employees; clean slate).
-- 3. Clear compensation-related tables (no FK to employees; avoid orphan rows).
-- 4. Delete employees → CASCADE removes probation_reminders, employee_documents, leave_*,
--    attendance_*, offboarding_*, etc. SET NULL on assigned_systems.user_id, support_tickets,
--    ticket_comments, recruitment, onboarding.

UPDATE users SET employee_id = NULL WHERE employee_id IS NOT NULL;

DELETE FROM change_requests;

DELETE FROM dependents;
DELETE FROM emergency_contacts;
DELETE FROM stock_grants;
DELETE FROM bonuses;
DELETE FROM banking_details;
DELETE FROM salary_details;

DELETE FROM employees;
