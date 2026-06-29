/**
 * One-off: add allowed_modules column to users if missing.
 * Run: npx tsx server/db/run-allowed-modules-migration.ts
 */
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config();

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  await sql`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS allowed_modules jsonb NOT NULL DEFAULT '[]'
  `;
  console.log("Column users.allowed_modules added (or already exists).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
