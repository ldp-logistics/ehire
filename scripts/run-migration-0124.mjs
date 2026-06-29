import { config } from "dotenv";
import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";

config();
const sql = neon(process.env.DATABASE_URL);
const migration = readFileSync("migrations/0124_multi_region_job_backfill.sql", "utf8");

// Run each statement (split on semicolons, skip comments-only blocks).
const statements = migration
  .split(";")
  .map((s) => s.replace(/^--[^\n]*\n?/gm, "").trim())
  .filter((s) => s.length > 0 && !s.startsWith("="));

for (const stmt of statements) {
  console.log("Running:", stmt.slice(0, 80).replace(/\s+/g, " ") + "...");
  await sql(stmt);
}

// Fix main admin: assign PK branch + super region grant.
const karachiBranch = "2573b84c-04d9-4415-93cf-6849ec6cfbcf";
const adminId = "4b62ab90-960d-42d4-8a5e-51a08db1480d";

await sql`
  UPDATE users
  SET branch_id = ${karachiBranch},
      roles = CASE
        WHEN roles @> '["regional_super_admin"]'::jsonb THEN roles
        ELSE roles || '["regional_super_admin"]'::jsonb
      END
  WHERE id = ${adminId}
`;

const verify = await sql`
  SELECT region_code, COUNT(*)::int as cnt FROM job_postings GROUP BY region_code ORDER BY cnt DESC
`;
console.log("Jobs after backfill:", verify);

const user = await sql`
  SELECT u.email, u.branch_id, u.roles, b.region_code, b.name as branch_name
  FROM users u
  LEFT JOIN branches b ON b.id = u.branch_id
  WHERE u.id = ${adminId}
`;
console.log("Admin user after fix:", user[0]);
