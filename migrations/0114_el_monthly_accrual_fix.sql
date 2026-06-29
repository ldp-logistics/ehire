-- Fix: June 2026 accrual ran with wrong 15-day-block engine and empty EL updates.
-- Clear gates so the corrected monthly engine can credit June EL (+1 day / pro-rate).
DELETE FROM leave_accrual_run WHERE period IN ('el:2026-06', '2026-06');

COMMENT ON TABLE leave_accrual_run IS 'Monthly accrual gate per YYYY-MM (Earned Leave + other monthly types). Legacy el:YYYY-MM keys may exist from older runs.';
