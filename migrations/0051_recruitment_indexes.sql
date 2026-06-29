-- Recruitment module performance indexes
-- Run once; all are CREATE INDEX IF NOT EXISTS so safe to re-run.

-- 1. Composite index supporting per-job application lists sorted by rating then applied_at.
--    Covers: WHERE job_id = $1 ORDER BY rating DESC NULLS LAST, applied_at DESC
CREATE INDEX IF NOT EXISTS idx_applications_job_rating_applied
  ON applications (job_id, rating DESC NULLS LAST, applied_at DESC);

-- 2. Index on candidate_id for the aggregated application_count JOIN in listCandidates.
CREATE INDEX IF NOT EXISTS idx_applications_candidate_id
  ON applications (candidate_id);

-- 3. Trigram indexes on candidates for fast ILIKE search (first_name, last_name, email).
--    Requires pg_trgm extension (available on Neon/Postgres 14+).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_candidates_first_name_trgm
  ON candidates USING gin (first_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_candidates_last_name_trgm
  ON candidates USING gin (last_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_candidates_email_trgm
  ON candidates USING gin (email gin_trgm_ops);
