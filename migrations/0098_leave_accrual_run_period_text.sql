-- Widen period column to TEXT so EL gate keys ("el:YYYY-MM", 10 chars) fit alongside
-- existing monthly keys ("YYYY-MM", 7 chars). VARCHAR(7) caused startup-accrual to fail.
ALTER TABLE leave_accrual_run ALTER COLUMN period TYPE text;
