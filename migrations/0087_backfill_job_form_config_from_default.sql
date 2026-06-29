-- One-time: copy the current default application form to every job posting.
-- If this updates 0 rows, check: (1) application_form_configs has id = 'default', (2) you ran against the same DB as the app.
-- Prefer POST /api/recruitment/application-form/sync-to-all-jobs (admin/hr) — uses the live default via the app connection.

UPDATE job_postings
SET form_config = (SELECT config FROM application_form_configs WHERE id = 'default' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM application_form_configs WHERE id = 'default');
