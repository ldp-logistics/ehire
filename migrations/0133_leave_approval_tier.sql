-- Migration 0133: 3-way leave approval support
-- Adds leave_approval_tier to employees (standard | three_step)
-- and extends leave_approver_role enum with 'second_manager'

-- 1. New enum value for the skip-level manager step
ALTER TYPE leave_approver_role ADD VALUE IF NOT EXISTS 'second_manager';

-- 2. Tier column on employees (null = standard, same as existing behaviour)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS leave_approval_tier TEXT NOT NULL DEFAULT 'standard'
    CHECK (leave_approval_tier IN ('standard', 'three_step'));

COMMENT ON COLUMN employees.leave_approval_tier IS
  'standard = Manager → HR (current default). three_step = Manager → Skip-level Manager → HR.';

-- 3. Fast lookup for approvals query
CREATE INDEX IF NOT EXISTS employees_leave_approval_tier_idx
  ON employees (leave_approval_tier)
  WHERE leave_approval_tier = 'three_step';
