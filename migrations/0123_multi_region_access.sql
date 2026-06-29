-- ============================================================
-- 0123: Multi-region access control (Step 1)
--
-- Builds on the existing `branches` table (no multi-tenant rewrite):
--   * branches.region_code         — 'PK' | 'US' | 'IN-N' | 'IN-S'
--   * users.branch_id              — direct branch link (was only via employee)
--   * job_postings.region_code     — explicit region per job
--   * applications.region_code     — explicit region per applicant
--   * onboarding_records.region_code
--
-- Region resolution at runtime happens in extractUser() (per-request DB read).
-- Enforcement (WHERE-injection) is added per repository in later steps.
--
-- Idempotent: safe to run multiple times.
-- ============================================================

-- ── 1a. region_code on branches ─────────────────────────────────────────────
ALTER TABLE branches ADD COLUMN IF NOT EXISTS region_code TEXT;
CREATE INDEX IF NOT EXISTS branches_region_code_idx ON branches (region_code);

-- Explicit per-branch assignment by NAME (only 8 branches; country_code may be
-- unset, so we do not rely on it). Verify the current list first:
--   SELECT id, name, city, state, country_code, region_code FROM branches ORDER BY name;

-- Pakistan
UPDATE branches SET region_code = 'PK'   WHERE name ILIKE '%karachi%'        AND region_code IS NULL;
UPDATE branches SET region_code = 'PK'   WHERE name ILIKE 'pakistan remote%' AND region_code IS NULL;

-- United States
UPDATE branches SET region_code = 'US'   WHERE name ILIKE '%washington rd%'  AND region_code IS NULL;
UPDATE branches SET region_code = 'US'   WHERE name ILIKE 'us remote%'       AND region_code IS NULL;

-- India — two isolated sub-regions, matched by NAME (both are in Delhi):
UPDATE branches SET region_code = 'IN-N' WHERE name ILIKE '%moti nagar%'     AND region_code IS NULL;
UPDATE branches SET region_code = 'IN-S' WHERE name ILIKE 'new delhi%'       AND region_code IS NULL;

-- Remote branches (per business rules):
--   * "India Remote" → IN-S (grouped with New Delhi).
--   * "UAE Remote"   → PK   (managed under Pakistan).
UPDATE branches SET region_code = 'IN-S' WHERE name ILIKE 'india remote%' AND region_code IS NULL;
UPDATE branches SET region_code = 'PK'   WHERE name ILIKE 'uae remote%'   AND region_code IS NULL;

-- ── 1b. direct branch link on users ─────────────────────────────────────────
-- VARCHAR(255) to match branches.id (gen_random_uuid()), NOT integer.
ALTER TABLE users ADD COLUMN IF NOT EXISTS branch_id varchar(255) REFERENCES branches(id);
CREATE INDEX IF NOT EXISTS users_branch_id_idx ON users (branch_id) WHERE branch_id IS NOT NULL;

-- Backfill from the linked employee's branch.
UPDATE users u
SET branch_id = e.branch_id
FROM employees e
WHERE u.employee_id = e.id
  AND u.branch_id IS NULL
  AND e.branch_id IS NOT NULL;

-- ── 1c. regional_super_admin grant (convention in users.roles JSONB) ─────────
-- No enum / schema change. Pakistan super admins carry "regional_super_admin"
-- in users.roles and bypass region filters. Set manually, e.g.:
--   UPDATE users SET roles = roles || '["regional_super_admin"]'::jsonb
--   WHERE email = 'pakistan.admin@company.com';

-- ── 1d. explicit region_code on scoped entities (Option 1) ──────────────────
ALTER TABLE job_postings      ADD COLUMN IF NOT EXISTS region_code TEXT;
ALTER TABLE applications      ADD COLUMN IF NOT EXISTS region_code TEXT;
ALTER TABLE onboarding_records ADD COLUMN IF NOT EXISTS region_code TEXT;

CREATE INDEX IF NOT EXISTS job_postings_region_code_idx       ON job_postings (region_code);
CREATE INDEX IF NOT EXISTS applications_region_code_idx       ON applications (region_code);
CREATE INDEX IF NOT EXISTS onboarding_records_region_code_idx ON onboarding_records (region_code);

-- Best-effort backfill. Rows that can't be resolved stay NULL and are visible
-- only to regional_super_admin (fail-closed) until assigned a region.

-- Jobs: from the creating user's branch region.
UPDATE job_postings j
SET region_code = b.region_code
FROM users u
JOIN branches b ON b.id = u.branch_id
WHERE j.created_by = u.id
  AND j.region_code IS NULL
  AND b.region_code IS NOT NULL;

-- Applications: inherit from their job (run after jobs backfill above).
UPDATE applications a
SET region_code = j.region_code
FROM job_postings j
WHERE a.job_id = j.id
  AND a.region_code IS NULL
  AND j.region_code IS NOT NULL;

-- Onboarding: from the linked employee's branch region (pre-employee rows stay NULL).
UPDATE onboarding_records o
SET region_code = b.region_code
FROM employees e
JOIN branches b ON b.id = e.branch_id
WHERE o.employee_id = e.id
  AND o.region_code IS NULL
  AND b.region_code IS NOT NULL;

COMMENT ON COLUMN branches.region_code IS 'Region key for access control: PK | US | IN-N | IN-S';
COMMENT ON COLUMN users.branch_id IS 'Direct branch link (region resolution); backfilled from employees.branch_id';
COMMENT ON COLUMN job_postings.region_code IS 'Region owning this job (multi-region access control)';
COMMENT ON COLUMN applications.region_code IS 'Region owning this applicant (multi-region access control)';
COMMENT ON COLUMN onboarding_records.region_code IS 'Region owning this onboarding record (multi-region access control)';
