-- ============================================================
-- 0059: Onboarding task optional assignment (requires_assignment)
-- ============================================================
-- When false: task can be marked complete without assignment details.
-- When true: assignment details required before completion (current behavior).

ALTER TABLE onboarding_template_tasks
  ADD COLUMN IF NOT EXISTS requires_assignment BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE onboarding_tasks
  ADD COLUMN IF NOT EXISTS requires_assignment BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN onboarding_template_tasks.requires_assignment IS 'If true, assignee must enter assignment details before marking task complete.';
COMMENT ON COLUMN onboarding_tasks.requires_assignment IS 'If true, assignment details required before completion.';
