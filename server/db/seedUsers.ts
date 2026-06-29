import { config } from "dotenv";
config();

import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL not set");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function seedUsers() {
  try {
    console.log("🌱 Seeding users...\n");

    // Get employee IDs
    const employees = await sql`SELECT id, work_email FROM employees`;
    const emailToId = new Map(employees.map((e: any) => [e.work_email, e.id]));

    // Seed users (linking to employees)
    const usersToCreate = [
      {
        email: "ehire@ldplogistics.com",
        role: "admin",
        employeeId: null, // Admin doesn't need employee record
      },
      {
        email: "hr@admani.com",
        role: "hr",
        employeeId: null,
      },
      {
        email: "sarah@admani.com",
        role: "manager", // Sarah is Product Director
        employeeId: emailToId.get("sarah@admani.com"),
      },
      {
        email: "morpheus@admani.com",
        role: "manager", // Morpheus is VP
        employeeId: emailToId.get("morpheus@admani.com"),
      },
      {
        email: "neo@admani.com",
        role: "employee",
        employeeId: emailToId.get("neo@admani.com"),
      },
      {
        email: "trinity@admani.com",
        role: "employee",
        employeeId: emailToId.get("trinity@admani.com"),
      },
    ];

    for (const user of usersToCreate) {
      try {
        const result = await sql`
          INSERT INTO users (email, role, employee_id, password_hash)
          VALUES (${user.email}, ${user.role}, ${user.employeeId || null}, 'demo_hash')
          ON CONFLICT (email) DO NOTHING
          RETURNING id, email, role
        `;
        
        if (result.length > 0) {
          console.log(`  ✓ Created user: ${user.email} (${user.role})`);
        } else {
          console.log(`  - Skipped: ${user.email} (already exists)`);
        }
      } catch (err) {
        console.log(`  ✗ Failed: ${user.email}`, err);
      }
    }

    await sql`
      UPDATE users SET must_change_password = true
      WHERE LOWER(TRIM(email)) = 'ehire@ldplogistics.com'
    `;

    // Show summary
    const userCount = await sql`SELECT COUNT(*)::int as count FROM users`;
    console.log(`\n✅ Total users: ${userCount[0].count}`);

    // List users with their roles
    const allUsers = await sql`
      SELECT u.id, u.email, u.role, e.first_name || ' ' || e.last_name as name
      FROM users u
      LEFT JOIN employees e ON u.employee_id = e.id
      ORDER BY u.role, u.email
    `;
    
    console.log("\n📋 User List:");
    console.table(allUsers);

    process.exit(0);
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  }
}

seedUsers();
