-- ==========================================
-- GET /applications list query: composite indexes for ORDER BY applied_at
-- Query: FROM applications a ... WHERE a.job_id = ? OR a.candidate_id = ? OR (no filter)
--        ORDER BY a.applied_at DESC LIMIT n OFFSET m
-- These allow index scan in sort order when filtering by job_id or candidate_id.
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_applications_job_id_applied_at
  ON applications (job_id, applied_at DESC);

CREATE INDEX IF NOT EXISTS idx_applications_candidate_id_applied_at
  ON applications (candidate_id, applied_at DESC);
