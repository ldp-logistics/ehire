/**
 * Pool-only candidate region backfill (0134 step 2).
 * Safe to re-run — only updates rows where region_code IS NULL.
 * Usage: node scripts/apply-candidates-region-backfill.mjs
 */
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config();
const sql = neon(process.env.DATABASE_URL);

const updated = await sql`
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
  RETURNING id
`;
console.log(`Backfilled region on ${updated.length} pool-only candidate(s).`);
