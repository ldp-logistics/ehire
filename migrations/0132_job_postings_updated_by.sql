-- 0132: Track who last updated a job posting
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_job_postings_updated_by ON job_postings(updated_by) WHERE updated_by IS NOT NULL;

COMMENT ON COLUMN job_postings.updated_by IS 'Auth user id who last updated this job posting (users.id).';
