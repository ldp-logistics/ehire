import { config } from "dotenv";
import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";

config();
const sql = neon(process.env.DATABASE_URL);

const before = await sql`
  SELECT o.id, o.region_code as record_region, b.region_code as branch_region,
         e.first_name, e.last_name, e.department, b.name as branch_name, o.status
  FROM onboarding_records o
  JOIN employees e ON e.id = o.employee_id
  LEFT JOIN branches b ON b.id = e.branch_id
  WHERE b.region_code = 'IN-N' OR o.region_code = 'IN-N'
  ORDER BY o.created_at DESC
  LIMIT 20
`;
console.log("IN-N onboarding (before):", before);

const nullRegion = await sql`
  SELECT COUNT(*)::int as cnt FROM onboarding_records o
  JOIN employees e ON e.id = o.employee_id
  JOIN branches b ON b.id = e.branch_id
  WHERE o.region_code IS NULL AND b.region_code IS NOT NULL
`;
console.log("NULL record region but branch has region:", nullRegion[0]?.cnt ?? 0);

const migration = readFileSync("migrations/0125_onboarding_region_backfill.sql", "utf8");
for (const stmt of migration
  .split(";")
  .map((s) => s.replace(/^--[^\n]*\n?/gm, "").trim())
  .filter((s) => s.length > 0 && !s.startsWith("="))) {
  console.log("Running:", stmt.slice(0, 90).replace(/\s+/g, " ") + "...");
  await sql(stmt);
}

const after = await sql`
  SELECT o.id, o.region_code as record_region, b.region_code as branch_region,
         e.first_name, e.last_name, b.name as branch_name, o.status
  FROM onboarding_records o
  JOIN employees e ON e.id = o.employee_id
  LEFT JOIN branches b ON b.id = e.branch_id
  WHERE b.region_code = 'IN-N' OR o.region_code = 'IN-N'
  ORDER BY o.created_at DESC
  LIMIT 20
`;
console.log("IN-N onboarding (after):", after);
