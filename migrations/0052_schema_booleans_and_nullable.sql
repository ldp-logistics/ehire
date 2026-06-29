-- Convert text boolean columns to real boolean; allow candidates.resume_url to be null.
-- Run this after deploying the updated Drizzle schema.
-- Drop default first so PostgreSQL can change type (text default cannot be cast to boolean).

-- users.is_active
ALTER TABLE users ALTER COLUMN is_active DROP DEFAULT;
ALTER TABLE users ALTER COLUMN is_active TYPE boolean USING (is_active = 'true');
ALTER TABLE users ALTER COLUMN is_active SET DEFAULT true;

-- salary_details.is_current
ALTER TABLE salary_details ALTER COLUMN is_current DROP DEFAULT;
ALTER TABLE salary_details ALTER COLUMN is_current TYPE boolean USING (is_current = 'true');
ALTER TABLE salary_details ALTER COLUMN is_current SET DEFAULT true;

-- banking_details.is_primary
ALTER TABLE banking_details ALTER COLUMN is_primary DROP DEFAULT;
ALTER TABLE banking_details ALTER COLUMN is_primary TYPE boolean USING (is_primary = 'true');
ALTER TABLE banking_details ALTER COLUMN is_primary SET DEFAULT true;

-- ticket_comments.is_status_update (nullable, default false)
ALTER TABLE ticket_comments ALTER COLUMN is_status_update DROP DEFAULT;
ALTER TABLE ticket_comments ALTER COLUMN is_status_update TYPE boolean USING (COALESCE(is_status_update, 'false') = 'true');
ALTER TABLE ticket_comments ALTER COLUMN is_status_update SET DEFAULT false;

-- onboarding_tasks.completed
ALTER TABLE onboarding_tasks ALTER COLUMN completed DROP DEFAULT;
ALTER TABLE onboarding_tasks ALTER COLUMN completed TYPE boolean USING (COALESCE(completed, 'false') = 'true');
ALTER TABLE onboarding_tasks ALTER COLUMN completed SET DEFAULT false;

-- candidates.resume_url: allow null (for manual add / email applicants)
ALTER TABLE candidates
  ALTER COLUMN resume_url DROP NOT NULL;
