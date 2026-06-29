-- ============================================================
-- 0070: Support tables for new roles: recruiter, hiring_manager,
--        onboarding_specialist, limited_hr, limited_recruiter.
--
-- These roles are stored in users.roles JSONB (grant model).
-- Primary stored role stays 'employee' for baseline policy.
-- ============================================================

-- job_assignments: links users to specific job postings as
-- hiring_manager or limited_recruiter (per-job scoping).
CREATE TABLE IF NOT EXISTS job_assignments (
  id           VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id      VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id       VARCHAR(255) NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  role         VARCHAR(50) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, job_id, role)
);

CREATE INDEX IF NOT EXISTS idx_job_assignments_user ON job_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_job_assignments_job  ON job_assignments(job_id);

-- user_scopes: limits limited_hr to a set of departments / office locations.
CREATE TABLE IF NOT EXISTS user_scopes (
  id           VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id      VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope_type   VARCHAR(50) NOT NULL,
  scope_value  TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, scope_type, scope_value)
);

CREATE INDEX IF NOT EXISTS idx_user_scopes_user ON user_scopes(user_id);

COMMENT ON TABLE job_assignments IS
  'Per-job role assignments: hiring_manager and limited_recruiter.
   hiring_manager: can view/advance pipeline and approve offers for this job.
   limited_recruiter: recruiter powers only on candidates within this job.';

COMMENT ON TABLE user_scopes IS
  'Scope restrictions for limited_hr: this user can only act on employees
   whose department/office matches one of their scopes.';
