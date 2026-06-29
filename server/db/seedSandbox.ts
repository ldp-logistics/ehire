/**
 * Sandbox Test Data Seed
 * Creates a realistic organization with proper relationships for end-to-end testing.
 * 
 * SAFE: Uses ON CONFLICT to avoid duplicates. Does NOT delete any existing data.
 * SAFE: Does NOT touch asset data.
 * 
 * Run: npx tsx server/db/seedSandbox.ts
 * Then: npx tsx server/db/setDemoPasswords.ts  (to set password123 for all users)
 * 
 * Org structure:
 *   Admin (ehire@ldplogistics.com) — System Administrator, Human Resources
 *   HR Manager (hr@admani.com) — HR Manager, Human Resources
 *   Engineering Manager (morpheus@admani.com) — VP of Operations (manages Neo, Trinity)
 *   Product Director (sarah@admani.com) — Product Director (no direct reports yet)
 *   Senior Engineer (neo@admani.com) — Lead Engineer, Engineering (managed by Morpheus)
 *   Junior Engineer (trinity@admani.com) — Senior Designer, Design (managed by Neo)
 */

import { config } from "dotenv";
config();

import { neon } from "@neondatabase/serverless";
import bcrypt from "bcrypt";

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL not set");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const PASSWORD = "password123";

// ==================== EMPLOYEES ====================

const EMPLOYEES = [
  {
    employeeId: "ADM-001",
    workEmail: "ehire@ldplogistics.com",
    firstName: "Admin",
    lastName: "Admani",
    jobTitle: "System Administrator",
    department: "Human Resources",
    grade: "L9",
    location: "Head Office",
    employmentStatus: "active",
    employeeType: "full_time",
    joinDate: "2019-01-01",
    managerEmail: null as string | null,
  },
  {
    employeeId: "HR-001",
    workEmail: "hr@admani.com",
    firstName: "Fatima",
    lastName: "Khan",
    jobTitle: "HR Manager",
    department: "Human Resources",
    grade: "L7",
    location: "Head Office",
    employmentStatus: "active",
    employeeType: "full_time",
    joinDate: "2019-06-15",
    managerEmail: "ehire@ldplogistics.com",
  },
  {
    employeeId: "EMP-003",
    workEmail: "morpheus@admani.com",
    firstName: "Morpheus",
    lastName: "King",
    jobTitle: "Engineering Manager",
    department: "Engineering",
    grade: "L8",
    location: "London",
    employmentStatus: "active",
    employeeType: "full_time",
    joinDate: "2019-06-01",
    managerEmail: "ehire@ldplogistics.com",
  },
  {
    employeeId: "EMP-004",
    workEmail: "sarah@admani.com",
    firstName: "Sarah",
    lastName: "Connor",
    jobTitle: "Product Director",
    department: "Product",
    grade: "L6",
    location: "San Francisco",
    employmentStatus: "active",
    employeeType: "full_time",
    joinDate: "2020-10-12",
    managerEmail: "ehire@ldplogistics.com",
  },
  {
    employeeId: "EMP-005",
    workEmail: "neo@admani.com",
    firstName: "Neo",
    lastName: "Anderson",
    jobTitle: "Senior Engineer",
    department: "Engineering",
    grade: "L5",
    location: "Remote",
    employmentStatus: "active",
    employeeType: "full_time",
    joinDate: "2021-03-15",
    managerEmail: "morpheus@admani.com",
  },
  {
    employeeId: "EMP-006",
    workEmail: "trinity@admani.com",
    firstName: "Trinity",
    lastName: "Moss",
    jobTitle: "Junior Engineer",
    department: "Engineering",
    grade: "L3",
    location: "Berlin",
    employmentStatus: "active",
    employeeType: "full_time",
    joinDate: "2022-01-10",
    managerEmail: "neo@admani.com",
  },
  {
    employeeId: "EMP-007",
    workEmail: "sales.mgr@admani.com",
    firstName: "Omar",
    lastName: "Farooq",
    jobTitle: "Sales Manager",
    department: "Sales",
    grade: "L6",
    location: "Dubai",
    employmentStatus: "active",
    employeeType: "full_time",
    joinDate: "2020-04-01",
    managerEmail: "ehire@ldplogistics.com",
  },
  {
    employeeId: "EMP-008",
    workEmail: "sales.exec@admani.com",
    firstName: "Aisha",
    lastName: "Malik",
    jobTitle: "Sales Executive",
    department: "Sales",
    grade: "L3",
    location: "Dubai",
    employmentStatus: "active",
    employeeType: "full_time",
    joinDate: "2023-09-01",
    managerEmail: "sales.mgr@admani.com",
  },
];

// ==================== USERS ====================

const USERS: { email: string; role: string; roles?: string[] }[] = [
  { email: "ehire@ldplogistics.com", role: "admin" },
  { email: "hr@admani.com", role: "hr" },
  { email: "morpheus@admani.com", role: "manager" },
  { email: "sarah@admani.com", role: "manager" },
  { email: "neo@admani.com", role: "employee", roles: ["manager"] },
  { email: "trinity@admani.com", role: "employee" },
  { email: "sales.mgr@admani.com", role: "manager" },
  { email: "sales.exec@admani.com", role: "employee" },
];

// ==================== MAIN ====================

async function seedSandbox() {
  console.log("🌱 Seeding sandbox test data...\n");
  const hash = await bcrypt.hash(PASSWORD, 10);
  const emailToId = new Map<string, string>();

  // Step 1: Upsert employees
  console.log("📋 Step 1: Employees");
  for (const emp of EMPLOYEES) {
    // Check if employee already exists by work_email
    const existing = await sql`SELECT id FROM employees WHERE work_email = ${emp.workEmail}`;
    let empId: string;

    if (existing.length > 0) {
      empId = existing[0].id;
      // Update key fields to ensure consistency
      await sql`
        UPDATE employees SET
          employee_id = ${emp.employeeId},
          first_name = ${emp.firstName},
          last_name = ${emp.lastName},
          job_title = ${emp.jobTitle},
          department = ${emp.department},
          grade = ${emp.grade},
          location = ${emp.location},
          employment_status = ${emp.employmentStatus},
          employee_type = ${emp.employeeType},
          updated_at = NOW()
        WHERE id = ${empId}
      `;
      console.log(`  ↻ Updated: ${emp.firstName} ${emp.lastName} (${emp.workEmail})`);
    } else {
      const rows = await sql`
        INSERT INTO employees (
          employee_id, work_email, first_name, last_name,
          job_title, department, grade, location,
          employment_status, employee_type, join_date, source
        ) VALUES (
          ${emp.employeeId}, ${emp.workEmail}, ${emp.firstName}, ${emp.lastName},
          ${emp.jobTitle}, ${emp.department}, ${emp.grade}, ${emp.location},
          ${emp.employmentStatus}, ${emp.employeeType}, ${emp.joinDate}, 'manual'
        ) RETURNING id
      `;
      empId = rows[0].id;
      console.log(`  ✓ Created: ${emp.firstName} ${emp.lastName} (${emp.workEmail})`);
    }
    emailToId.set(emp.workEmail, empId);
  }

  // Step 2: Set manager relationships
  console.log("\n📊 Step 2: Manager relationships");
  for (const emp of EMPLOYEES) {
    if (!emp.managerEmail) continue;
    const myId = emailToId.get(emp.workEmail);
    const mgrId = emailToId.get(emp.managerEmail);
    if (!myId || !mgrId) {
      console.log(`  ⚠ Skipping ${emp.workEmail}: manager ${emp.managerEmail} not found`);
      continue;
    }
    await sql`UPDATE employees SET manager_id = ${mgrId}, updated_at = NOW() WHERE id = ${myId}`;
    console.log(`  ✓ ${emp.firstName} → ${emp.managerEmail}`);
  }

  // Step 3: Upsert users with employee_id links
  console.log("\n👤 Step 3: Users (with employee links)");
  for (const user of USERS) {
    const empId = emailToId.get(user.email) || null;
    const existing = await sql`SELECT id, employee_id FROM users WHERE email = ${user.email}`;

    const rolesJson = user.roles && user.roles.length > 0 ? JSON.stringify(user.roles) : null;
    if (existing.length > 0) {
      // Update role, optional roles, and employee_id link
      if (rolesJson !== null) {
        await sql`
          UPDATE users SET
            role = ${user.role},
            roles = ${rolesJson}::jsonb,
            employee_id = ${empId},
            password_hash = ${hash},
            is_active = true
          WHERE id = ${existing[0].id}
        `;
      } else {
        await sql`
          UPDATE users SET
            role = ${user.role},
            employee_id = ${empId},
            password_hash = ${hash},
            is_active = true
          WHERE id = ${existing[0].id}
        `;
      }
      console.log(`  ↻ Updated: ${user.email} (${user.role}${user.roles?.length ? `, roles: [${user.roles.join(",")}]` : ""}) → employee_id=${empId ? "linked" : "null"}`);
    } else {
      if (rolesJson !== null) {
        await sql`
          INSERT INTO users (email, role, roles, employee_id, password_hash, is_active)
          VALUES (${user.email}, ${user.role}, ${rolesJson}::jsonb, ${empId}, ${hash}, true)
        `;
      } else {
        await sql`
          INSERT INTO users (email, role, employee_id, password_hash, is_active)
          VALUES (${user.email}, ${user.role}, ${empId}, ${hash}, true)
        `;
      }
      console.log(`  ✓ Created: ${user.email} (${user.role}${user.roles?.length ? `, roles: [${user.roles.join(",")}]` : ""}) → employee_id=${empId ? "linked" : "null"}`);
    }
  }

  // Step 4: Verify
  console.log("\n🔍 Step 4: Verification");

  const userList = await sql`
    SELECT u.email, u.role, u.employee_id IS NOT NULL as has_employee,
      e.first_name || ' ' || e.last_name as name, e.department, e.job_title,
      (SELECT e2.first_name || ' ' || e2.last_name FROM employees e2 WHERE e2.id = e.manager_id) as manager
    FROM users u
    LEFT JOIN employees e ON u.employee_id = e.id
    WHERE u.email LIKE '%admani.com'
    ORDER BY u.role, u.email
  `;
  console.log("\n📋 User ↔ Employee ↔ Manager mapping:");
  console.table(userList);

  // Integrity checks
  const usersWithoutEmployee = await sql`
    SELECT email, role FROM users WHERE employee_id IS NULL AND role IN ('admin', 'hr', 'manager', 'employee') AND is_active = true AND email LIKE '%admani.com'
  `;
  if (usersWithoutEmployee.length > 0) {
    console.error("\n❌ INTEGRITY WARNING: These active users have no employee_id:");
    console.table(usersWithoutEmployee);
  } else {
    console.log("\n✅ All active users have employee_id linked.");
  }

  const managersWithoutReports = await sql`
    SELECT u.email, e.first_name || ' ' || e.last_name as name
    FROM users u
    INNER JOIN employees e ON u.employee_id = e.id
    WHERE u.role = 'manager'
      AND NOT EXISTS (SELECT 1 FROM employees e2 WHERE e2.manager_id = e.id)
  `;
  if (managersWithoutReports.length > 0) {
    console.log("\n⚠ Managers without direct reports (they won't see team requests):");
    console.table(managersWithoutReports);
  }

  console.log(`\n✅ Sandbox seed complete. Login with any email + password: ${PASSWORD}`);
  console.log("\n🔑 Test accounts:");
  console.log("  ehire@ldplogistics.com / password123  → Admin (full access)");
  console.log("  hr@admani.com / password123     → HR Manager");
  console.log("  morpheus@admani.com / password123 → Engineering Manager (manages Neo, Trinity)");
  console.log("  sarah@admani.com / password123   → Product Director");
  console.log("  neo@admani.com / password123     → Senior Engineer + Manager role (approves Trinity's leave)");
  console.log("  trinity@admani.com / password123 → Junior Engineer (managed by Neo)");
  console.log("  sales.mgr@admani.com / password123 → Sales Manager (manages Aisha)");
  console.log("  sales.exec@admani.com / password123 → Sales Executive (managed by Omar)");

  process.exit(0);
}

seedSandbox().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
