import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config();

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  await sql`ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL`;
  await sql`CREATE INDEX IF NOT EXISTS idx_job_postings_updated_by ON job_postings(updated_by) WHERE updated_by IS NOT NULL`;
  console.log("Migration 0132 applied: job_postings.updated_by");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
