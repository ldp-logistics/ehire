import { config } from "dotenv";
import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";

config();
const sql = neon(process.env.DATABASE_URL);

const migration = readFileSync("migrations/0127_employee_branch_timesheets.sql", "utf8");
for (const stmt of migration
  .split(";")
  .map((s) => s.replace(/^--[^\n]*\n?/gm, "").trim())
  .filter((s) => s.length > 0 && !s.startsWith("="))) {
  console.log("Running:", stmt.slice(0, 80).replace(/\s+/g, " ") + "...");
  await sql(stmt);
}

const summary = await sql`
  SELECT COALESCE(b.region_code, CASE
    WHEN e.location ILIKE '%ashok vihar%' THEN 'IN-N'
    WHEN e.location ILIKE '%moti nagar%' THEN 'IN-S'
    WHEN e.location ILIKE '%karachi%' THEN 'PK'
    ELSE 'unknown'
  END) as region,
  COUNT(DISTINCT e.id)::int as employees,
  COUNT(ar.id)::int as attendance_rows
  FROM employees e
  LEFT JOIN branches b ON b.id = e.branch_id
  LEFT JOIN attendance_records ar ON ar.employee_id = e.id AND ar.deleted_at IS NULL
  WHERE e.employment_status IN ('active','onboarding','on_leave')
  GROUP BY 1
  ORDER BY attendance_rows DESC
`;
console.log("Active employees + attendance by effective region:", summary);
