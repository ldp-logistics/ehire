import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config();
const sql = neon(process.env.DATABASE_URL);

const all = await sql`
  SELECT o.id, o.status, e.first_name, e.last_name, e.branch_id,
         b.name as branch_name, b.region_code as branch_region
  FROM offboarding_records o
  JOIN employees e ON e.id = o.employee_id
  LEFT JOIN branches b ON b.id = e.branch_id
  ORDER BY o.created_at DESC
  LIMIT 30
`;
console.log("All offboarding (sample):", all);

const missingBranch = await sql`
  SELECT COUNT(*)::int as cnt FROM offboarding_records o
  JOIN employees e ON e.id = o.employee_id
  WHERE e.branch_id IS NULL
`;
console.log("Offboarding employees with NULL branch_id:", missingBranch[0]?.cnt);

const missingRegion = await sql`
  SELECT o.id, o.status, e.first_name, e.last_name, b.name as branch_name, b.region_code
  FROM offboarding_records o
  JOIN employees e ON e.id = o.employee_id
  LEFT JOIN branches b ON b.id = e.branch_id
  WHERE b.region_code IS NULL OR e.branch_id IS NULL
`;
console.log("Offboarding with missing region resolution:", missingRegion);

const inN = await sql`
  SELECT o.id, o.status, e.first_name, e.last_name, b.name as branch_name, b.region_code
  FROM offboarding_records o
  JOIN employees e ON e.id = o.employee_id
  LEFT JOIN branches b ON b.id = e.branch_id
  WHERE b.region_code = 'IN-N'
`;
console.log("IN-N offboarding:", inN);

const branchesNoRegion = await sql`
  SELECT b.id, b.name, b.region_code, COUNT(e.id)::int as employee_count
  FROM branches b
  LEFT JOIN employees e ON e.branch_id = b.id
  WHERE b.region_code IS NULL
  GROUP BY b.id, b.name, b.region_code
  HAVING COUNT(e.id) > 0
  ORDER BY employee_count DESC
`;
console.log("Branches with employees but no region_code:", branchesNoRegion);

const offboardEmps = await sql`
  SELECT e.id, e.first_name, e.last_name, e.location, e.country, e.branch_id, b.name, b.region_code
  FROM employees e
  LEFT JOIN branches b ON b.id = e.branch_id
  WHERE EXISTS (SELECT 1 FROM offboarding_records o WHERE o.employee_id = e.id)
`;
console.log("Employees with offboarding records:", offboardEmps);

const inNEmpsNoBranch = await sql`
  SELECT e.id, e.first_name, e.last_name, e.location, e.country
  FROM employees e
  WHERE e.branch_id IS NULL
    AND (e.location ILIKE '%delhi%' OR e.location ILIKE '%moti nagar%' OR e.location ILIKE '%ashok%' OR e.country ILIKE '%india%')
  LIMIT 20
`;
console.log("IN-N hint employees without branch:", inNEmpsNoBranch);
