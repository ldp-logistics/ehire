import { config } from "dotenv";
config();

import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL not set");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

// Maps frontend status to DB enum
const statusMap: Record<string, string> = {
  "Active": "active",
  "On Leave": "on_leave",
  "Terminated": "terminated",
  "Resigned": "resigned",
};

// Maps frontend employeeType to DB enum
const typeMap: Record<string, string> = {
  "Full Time": "full_time",
  "Part Time": "part_time",
  "Contractor": "contractor",
  "Intern": "intern",
  "Temporary": "temporary",
};

const MOCK_EMPLOYEES = [
  { 
    employeeId: "EMP001",
    workEmail: "sarah@admani.com",
    firstName: "Sarah",
    lastName: "Connor",
    avatar: "https://github.com/shadcn.png",
    jobTitle: "Product Director",
    department: "Product",
    grade: "L6",
    location: "San Francisco",
    managerEmail: null as string | null,
    employmentStatus: "active",
    employeeType: "full_time",
    city: "San Francisco",
    state: "CA",
    country: "USA",
    joinDate: "2020-10-12",
    exitDate: null as string | null,
    exitType: null as string | null,
    resignationReason: null as string | null,
    eligibleForRehire: null as string | null,
    source: "manual",
  },
  { 
    employeeId: "EMP002",
    workEmail: "neo@admani.com",
    firstName: "Neo",
    lastName: "Anderson",
    avatar: "https://github.com/shadcn.png",
    jobTitle: "Lead Engineer",
    department: "Engineering",
    grade: "L5",
    location: "Remote",
    managerEmail: "morpheus@admani.com",
    employmentStatus: "active",
    employeeType: "full_time",
    city: "Chicago",
    state: "IL",
    country: "USA",
    joinDate: "2021-03-15",
    exitDate: null as string | null,
    exitType: null as string | null,
    resignationReason: null as string | null,
    eligibleForRehire: null as string | null,
    source: "manual",
  },
  { 
    employeeId: "EMP003",
    workEmail: "morpheus@admani.com",
    firstName: "Morpheus",
    lastName: "King",
    avatar: "https://github.com/shadcn.png",
    jobTitle: "VP of Operations",
    department: "Operations",
    grade: "L8",
    location: "London",
    managerEmail: null as string | null,
    employmentStatus: "on_leave",
    employeeType: "full_time",
    city: "London",
    state: null as string | null,
    country: "UK",
    joinDate: "2019-06-01",
    exitDate: null as string | null,
    exitType: null as string | null,
    resignationReason: null as string | null,
    eligibleForRehire: null as string | null,
    source: "manual",
  },
  { 
    employeeId: "EMP004",
    workEmail: "trinity@admani.com",
    firstName: "Trinity",
    lastName: "Moss",
    avatar: "https://github.com/shadcn.png",
    jobTitle: "Senior Designer",
    department: "Design",
    grade: "L5",
    location: "Berlin",
    managerEmail: "neo@admani.com",
    employmentStatus: "active",
    employeeType: "full_time",
    city: "Berlin",
    state: null as string | null,
    country: "Germany",
    joinDate: "2022-01-10",
    exitDate: null as string | null,
    exitType: null as string | null,
    resignationReason: null as string | null,
    eligibleForRehire: null as string | null,
    source: "manual",
  },
  { 
    employeeId: "EMP005",
    workEmail: "john@admani.com",
    firstName: "John",
    lastName: "Wick",
    avatar: "https://github.com/shadcn.png",
    jobTitle: "Security Analyst",
    department: "Security",
    grade: "L4",
    location: "New York",
    managerEmail: null as string | null,
    employmentStatus: "terminated",
    employeeType: "full_time",
    city: null as string | null,
    state: null as string | null,
    country: null as string | null,
    joinDate: "2023-05-20",
    exitDate: "2024-01-15",
    exitType: "Involuntary",
    resignationReason: "Violation of Policy",
    eligibleForRehire: "No",
    source: "manual",
  },
];

async function seed() {
  try {
    console.log("🌱 Seeding employees into Neon...\n");

    const emailToId = new Map<string, string>();

    // First pass: Insert all employees without manager_id
    for (const row of MOCK_EMPLOYEES) {
      const rows = await sql`
        INSERT INTO employees (
          employee_id, work_email, first_name, last_name, avatar,
          job_title, department, grade, location,
          employment_status, employee_type,
          city, state, country,
          join_date, exit_date, exit_type, resignation_reason, eligible_for_rehire,
          source
        )
        VALUES (
          ${row.employeeId}, ${row.workEmail}, ${row.firstName}, ${row.lastName}, ${row.avatar},
          ${row.jobTitle}, ${row.department}, ${row.grade}, ${row.location},
          ${row.employmentStatus}, ${row.employeeType},
          ${row.city}, ${row.state}, ${row.country},
          ${row.joinDate}, ${row.exitDate}, ${row.exitType}, ${row.resignationReason}, ${row.eligibleForRehire},
          ${row.source}
        )
        RETURNING id
      `;

      const id = (rows as { id: string }[])[0]?.id;
      if (id) {
        emailToId.set(row.workEmail, id);
        console.log(`  ✓ Inserted ${row.firstName} ${row.lastName} (${row.employeeId})`);
      }
    }

    // Second pass: Update manager_id references
    console.log("\n📊 Setting manager relationships...");
    for (const row of MOCK_EMPLOYEES) {
      if (!row.managerEmail) continue;
      const managerId = emailToId.get(row.managerEmail);
      const myId = emailToId.get(row.workEmail);
      if (!myId || !managerId) {
        console.log(`  ⚠ Manager not found for ${row.firstName}: ${row.managerEmail}`);
        continue;
      }

      await sql`UPDATE employees SET manager_id = ${managerId}, updated_at = NOW() WHERE id = ${myId}`;
      console.log(`  ✓ Set ${row.firstName}'s manager`);
    }

    const count = await sql`SELECT COUNT(*)::int as total FROM employees`;
    const total = (count as { total: number }[])[0]?.total ?? 0;
    console.log(`\n✅ Inserted ${total} employees.\nDone.`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  }
}

seed();
