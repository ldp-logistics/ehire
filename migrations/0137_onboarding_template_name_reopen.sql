-- Snapshot template name on record + track checklist reopen after completion.

ALTER TABLE onboarding_records
  ADD COLUMN IF NOT EXISTS template_name TEXT,
  ADD COLUMN IF NOT EXISTS checklist_reopened_at TIMESTAMPTZ;

UPDATE onboarding_records r
SET template_name = t.name
FROM onboarding_templates t
WHERE r.template_id = t.id
  AND (r.template_name IS NULL OR TRIM(r.template_name) = '');
