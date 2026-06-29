import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config();

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  // Extend leave_approver_role enum with 'second_manager' for skip-level step
  await sql`ALTER TYPE leave_approver_role ADD VALUE IF NOT EXISTS 'second_manager'`;

  // Add leave_approval_tier to employees
  await sql`
    ALTER TABLE employees
      ADD COLUMN IF NOT EXISTS leave_approval_tier TEXT NOT NULL DEFAULT 'standard'
        CHECK (leave_approval_tier IN ('standard', 'three_step'))
  `;

  // Index for fast lookup (only three_step employees are a small subset)
  await sql`
    CREATE INDEX IF NOT EXISTS employees_leave_approval_tier_idx
      ON employees (leave_approval_tier)
      WHERE leave_approval_tier = 'three_step'
  `;

  console.log("Migration 0133 applied: leave_approval_tier column + second_manager enum value");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
