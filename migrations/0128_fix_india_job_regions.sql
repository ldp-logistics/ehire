-- ============================================================
-- 0128: Fix India job region_code (Moti Nagar → IN-S, not IN-N)
--
-- Migration 0124 incorrectly tagged Moti Nagar / New Delhi Moti Nagar
-- jobs as IN-N. Branches table maps:
--   Ashok Vihar  → IN-N
--   Moti Nagar   → IN-S
--   India Remote → IN-S
--
-- Idempotent — safe to re-run.
-- ============================================================

-- Ashok Vihar is India North
UPDATE job_postings
SET region_code = 'IN-N', updated_at = NOW()
WHERE location ILIKE '%ashok vihar%';

-- India South locations (Moti Nagar, New Delhi, India Remote)
UPDATE job_postings
SET region_code = 'IN-S', updated_at = NOW()
WHERE location ILIKE '%moti nagar%'
   OR location ILIKE '%india remote%'
   OR (location ILIKE '%new delhi%' AND location NOT ILIKE '%ashok vihar%');

-- Re-sync applications from corrected job regions
UPDATE applications a
SET region_code = j.region_code
FROM job_postings j
WHERE a.job_id = j.id
  AND j.region_code IS NOT NULL
  AND a.region_code IS DISTINCT FROM j.region_code;
