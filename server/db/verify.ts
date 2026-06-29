import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

// Load .env BEFORE importing db/index.ts
config();

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL not found in .env file");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function verify() {
  try {
    console.log("🔍 Checking database connection...\n");

    // Check if employees table exists
    const tableExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'employees'
      )
    `;

    const exists = tableExists[0]?.exists;
    console.log("✅ Table 'employees' exists:", exists);

    if (!exists) {
      console.log("❌ Table not found!");
      process.exit(1);
    }

    // Get table structure
    const columns = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'employees'
      ORDER BY ordinal_position
    `;

    console.log("\n📋 Table structure:");
    console.table(columns);

    // Count records
    const count = await sql`SELECT COUNT(*) as total FROM employees`;
    console.log(`\n📊 Total employees: ${count[0]?.total || 0}`);

    // Check indexes
    const indexes = await sql`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'employees'
    `;

    console.log("\n🔑 Indexes:");
    indexes.forEach((idx: any) => {
      console.log(`  - ${idx.indexname}`);
    });

    // Check enums
    const enums = await sql`
      SELECT typname 
      FROM pg_type 
      WHERE typtype = 'e' 
      AND typname IN ('employee_source', 'employment_status')
    `;

    console.log("\n📝 Enums:");
    enums.forEach((e: any) => {
      console.log(`  - ${e.typname}`);
    });

    console.log("\n✅ Database verification complete!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

verify();
