import { config } from "dotenv";
import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";

config();
const sql = neon(process.env.DATABASE_URL);

const migration = readFileSync("migrations/0126_offboarding_region_backfill.sql", "utf8");
for (const stmt of migration
  .split(";")
  .map((s) => s.replace(/^--[^\n]*\n?/gm, "").trim())
  .filter((s) => s.length > 0 && !s.startsWith("="))) {
  console.log("Running:", stmt.slice(0, 90).replace(/\s+/g, " ") + "...");
  await sql(stmt);
}

const after = await sql`
  SELECT o.id, o.status, o.region_code as record_region, e.first_name, e.last_name,
         e.location, e.branch_id, b.name as branch_name, b.region_code as branch_region
  FROM offboarding_records o
  JOIN employees e ON e.id = o.employee_id
  LEFT JOIN branches b ON b.id = e.branch_id
  ORDER BY o.created_at DESC
`;
console.log("Offboarding after backfill:", after);

const inN = await sql`
  SELECT o.id, e.first_name, e.last_name, COALESCE(o.region_code, b.region_code) as effective_region
  FROM offboarding_records o
  JOIN employees e ON e.id = o.employee_id
  LEFT JOIN branches b ON b.id = e.branch_id
  WHERE COALESCE(o.region_code, b.region_code) = 'IN-N'
`;
console.log("IN-N offboarding after fix:", inN);
