/**
 * Run migration 0134_candidates_region.sql
 * Usage: node scripts/apply-migration-0134.mjs
 */
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config();
const sql = neon(process.env.DATABASE_URL);

console.log("Applying migration 0134: candidates.region_code …");

await sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS region_code VARCHAR(10)`;
console.log("  ✓ column region_code");

await sql`CREATE INDEX IF NOT EXISTS candidates_region_code_idx ON candidates (region_code)`;
console.log("  ✓ index candidates_region_code_idx");

const fromJobs = await sql`
  UPDATE candidates c
  SET region_code = sub.region_code
  FROM (
    SELECT DISTINCT ON (a.candidate_id)
      a.candidate_id,
      j.region_code
    FROM applications a
    INNER JOIN job_postings j ON j.id = a.job_id
    WHERE j.region_code IS NOT NULL
    ORDER BY a.candidate_id, a.applied_at DESC
  ) sub
  WHERE c.id = sub.candidate_id
    AND c.region_code IS NULL
  RETURNING c.id
`;
console.log(`  ✓ backfill from job applications: ${fromJobs.length} row(s)`);

const poolOnly = await sql`
  UPDATE candidates c
  SET region_code = CASE
    WHEN regexp_replace(trim(COALESCE(c.phone, '')), '\\D', '', 'g') ~ '^92' THEN 'PK'
    WHEN COALESCE(c.country, '') ILIKE '%pakistan%' OR upper(trim(COALESCE(c.country, ''))) = 'PK' THEN 'PK'
    WHEN regexp_replace(trim(COALESCE(c.phone, '')), '\\D', '', 'g') ~ '^1' THEN 'US'
    WHEN COALESCE(c.country, '') ILIKE ANY(ARRAY['%united states%', '%usa%', '%u.s.%'])
      OR upper(trim(COALESCE(c.country, ''))) = 'US' THEN 'US'
    WHEN regexp_replace(trim(COALESCE(c.phone, '')), '\\D', '', 'g') ~ '^91' THEN
      CASE
        WHEN COALESCE(c.state, '') ILIKE ANY(ARRAY['%karnataka%', '%tamil%', '%telangana%', '%kerala%', '%andhra%'])
          OR COALESCE(c.city, '') ILIKE ANY(ARRAY['%bangalore%', '%bengaluru%', '%chennai%', '%hyderabad%', '%kochi%'])
        THEN 'IN-S'
        ELSE 'IN-N'
      END
    WHEN COALESCE(c.country, '') ILIKE '%india%' OR upper(trim(COALESCE(c.country, ''))) = 'IN' THEN
      CASE
        WHEN COALESCE(c.state, '') ILIKE ANY(ARRAY['%karnataka%', '%tamil%', '%telangana%', '%kerala%', '%andhra%'])
          OR COALESCE(c.city, '') ILIKE ANY(ARRAY['%bangalore%', '%bengaluru%', '%chennai%', '%hyderabad%', '%kochi%'])
        THEN 'IN-S'
        ELSE 'IN-N'
      END
    ELSE NULL
  END
  WHERE c.region_code IS NULL
    AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.candidate_id = c.id)
  RETURNING c.id
`;
console.log(`  ✓ backfill pool-only (phone/country): ${poolOnly.length} row(s)`);

const summary = await sql`
  SELECT region_code, COUNT(*)::int AS n
  FROM candidates
  GROUP BY region_code
  ORDER BY region_code NULLS LAST
`;
console.log("\nCandidates by region:", summary);
console.log("\nMigration 0134 complete.");
