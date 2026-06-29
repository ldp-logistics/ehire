import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
config();
const sql = neon(process.env.DATABASE_URL);

const byRegion = await sql`
  SELECT region_code, COUNT(*)::int as cnt
  FROM job_postings GROUP BY region_code ORDER BY cnt DESC
`;
console.log("Jobs by region_code:", byRegion);

const indiaJobs = await sql`
  SELECT region_code, location, COUNT(*)::int as cnt
  FROM job_postings
  WHERE location ILIKE '%india%' OR location ILIKE '%delhi%' OR location ILIKE '%moti%'
     OR location ILIKE '%ashok%' OR location ILIKE '%nagar%'
  GROUP BY region_code, location
  ORDER BY region_code, cnt DESC
`;
console.log("\nIndia-related jobs by region + location:", indiaJobs);

const inSasInN = await sql`
  SELECT id, title, location, region_code
  FROM job_postings
  WHERE region_code = 'IN-N'
    AND (
      location ILIKE '%india remote%'
      OR location ILIKE '%new delhi%'
      OR (location ILIKE '%moti nagar%' AND location NOT ILIKE '%ashok%')
    )
  LIMIT 20
`;
console.log("\nLikely IN-S jobs wrongly tagged IN-N:", inSasInN.length, inSasInN.slice(0, 5));

const branches = await sql`SELECT name, region_code FROM branches WHERE region_code IN ('IN-N','IN-S') ORDER BY name`;
console.log("\nIndia branches:", branches);
