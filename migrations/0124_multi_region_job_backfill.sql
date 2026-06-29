-- ============================================================
-- 0124: Backfill job_postings.region_code from location string
--
-- Migration 0123 backfilled jobs via created_by → users.branch_id,
-- but all legacy jobs have created_by = NULL. Location strings
-- embed the branch name (e.g. "Karachi, Sindh, PK, PK Karachi Bahadurabad")
-- so we derive region_code from branches.name matches.
-- Idempotent: only updates rows where region_code IS NULL.
-- ============================================================

-- PK branches
UPDATE job_postings j
SET region_code = 'PK'
WHERE j.region_code IS NULL
  AND (
    j.location ILIKE '%karachi%'
    OR j.location ILIKE '%pakistan remote%'
    OR j.location ILIKE '%uae remote%'
    OR j.location ILIKE '%PK Karachi Bahadurabad%'
  );

-- US branches
UPDATE job_postings j
SET region_code = 'US'
WHERE j.region_code IS NULL
  AND (
    j.location ILIKE '%washington rd%'
    OR j.location ILIKE '%us remote%'
    OR j.location ILIKE '%sayreville%'
    OR j.location ILIKE '%US NJ%'
  );

-- India North (Ashok Vihar only)
UPDATE job_postings j
SET region_code = 'IN-N'
WHERE j.region_code IS NULL
  AND j.location ILIKE '%ashok vihar%';

-- India South (Moti Nagar, New Delhi, India Remote — matches branches.region_code)
UPDATE job_postings j
SET region_code = 'IN-S'
WHERE j.region_code IS NULL
  AND (
    j.location ILIKE '%moti nagar%'
    OR j.location ILIKE '%new delhi%'
    OR j.location ILIKE '%india remote%'
  );

-- Remaining legacy rows with no location hint → default PK (original system home region).
UPDATE job_postings
SET region_code = 'PK'
WHERE region_code IS NULL;

-- Re-sync applications from their job.
UPDATE applications a
SET region_code = j.region_code
FROM job_postings j
WHERE a.job_id = j.id
  AND a.region_code IS NULL
  AND j.region_code IS NOT NULL;
