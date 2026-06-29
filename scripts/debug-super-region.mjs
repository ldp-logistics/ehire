import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config();
const sql = neon(process.env.DATABASE_URL);

const ehire = await sql`
  SELECT u.id, u.email, u.role, u.roles, u.branch_id, b.region_code, b.name AS branch_name
  FROM users u
  LEFT JOIN employees e ON e.id = u.employee_id
  LEFT JOIN branches b ON b.id = COALESCE(u.branch_id, e.branch_id)
  WHERE u.email ILIKE 'ehire@ldplogistics.com'
`;
console.log("EHIRE:", JSON.stringify(ehire[0], null, 2));

const admins = await sql`
  SELECT u.id, u.email, u.role, u.roles, b.region_code,
    (u.role = 'admin' OR u.roles::jsonb @> '["admin"]'::jsonb) AS is_admin
  FROM users u
  LEFT JOIN employees e ON e.id = u.employee_id
  LEFT JOIN branches b ON b.id = COALESCE(u.branch_id, e.branch_id)
  WHERE u.role = 'admin' OR u.roles::jsonb @> '["admin"]'::jsonb
  ORDER BY u.email
  LIMIT 20
`;
console.log("\nADMINS:", admins);
