import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
config();
const sql = neon(process.env.DATABASE_URL);

const noBranch = await sql`
  SELECT COUNT(*)::int as cnt FROM employees e
  WHERE e.branch_id IS NULL AND e.employment_status IN ('active','onboarding','on_leave')
`;
console.log("Active employees without branch:", noBranch[0]);

const inNWithAttendance = await sql`
  SELECT e.id, e.first_name, e.last_name, e.location, e.branch_id, b.region_code,
         COUNT(ar.id)::int as attendance_rows
  FROM employees e
  LEFT JOIN branches b ON b.id = e.branch_id
  LEFT JOIN attendance_records ar ON ar.employee_id = e.id AND ar.deleted_at IS NULL
  WHERE (b.region_code = 'IN-N' OR e.location ILIKE '%ashok vihar%' OR e.location ILIKE '%moti nagar%')
  GROUP BY e.id, e.first_name, e.last_name, e.location, e.branch_id, b.region_code
  HAVING COUNT(ar.id) > 0
  ORDER BY attendance_rows DESC
  LIMIT 15
`;
console.log("IN-N-ish employees with attendance:", inNWithAttendance);

const hiddenFromInN = await sql`
  SELECT e.id, e.first_name, e.last_name, e.location, e.branch_id,
         COUNT(ar.id)::int as attendance_rows
  FROM employees e
  LEFT JOIN branches b ON b.id = e.branch_id
  JOIN attendance_records ar ON ar.employee_id = e.id AND ar.deleted_at IS NULL
  WHERE e.branch_id IS NULL
  GROUP BY e.id, e.first_name, e.last_name, e.location, e.branch_id
  LIMIT 20
`;
console.log("Attendance for employees WITHOUT branch (hidden from regional):", hiddenFromInN);
