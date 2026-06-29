/**
 * Apply employee branch backfill (0135).
 * Usage: node scripts/apply-0135.mjs
 */
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

config();
const sql = neon(process.env.DATABASE_URL);

function stripLineComments(block) {
  return block
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .trim();
}

const mig = readFileSync("migrations/0135_employee_branch_from_location.sql", "utf8");
for (const raw of mig.split(";").map((s) => stripLineComments(s)).filter(Boolean)) {
  await sql(raw);
}

const rows = await sql`
  SELECT COUNT(*)::int AS linked
  FROM employees
  WHERE branch_id IS NOT NULL AND location IS NOT NULL
`;
console.log("Employees with branch_id + location:", rows);
