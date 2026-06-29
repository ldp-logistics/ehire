import { config } from "dotenv";
import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";

config();
const sql = neon(process.env.DATABASE_URL);

const migration = readFileSync("migrations/0128_fix_india_job_regions.sql", "utf8");
for (const stmt of migration
  .split(";")
  .map((s) => s.replace(/^--[^\n]*\n?/gm, "").trim())
  .filter((s) => s.length > 0 && !s.startsWith("="))) {
  console.log("Running:", stmt.slice(0, 90).replace(/\s+/g, " ") + "...");
  await sql(stmt);
}

const byRegion = await sql`
  SELECT region_code, COUNT(*)::int as cnt FROM job_postings
  WHERE location ILIKE '%delhi%' OR location ILIKE '%moti%' OR location ILIKE '%india remote%'
  GROUP BY region_code ORDER BY region_code
`;
console.log("India jobs by region after fix:", byRegion);
