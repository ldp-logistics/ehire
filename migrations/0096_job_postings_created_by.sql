-- Auth user who created this job posting (applicants table "Owner" column).
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS created_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_job_postings_created_by ON job_postings(created_by) WHERE created_by IS NOT NULL;

COMMENT ON COLUMN job_postings.created_by IS 'User id who created this job posting (auth users.id).';
