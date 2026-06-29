/**
 * Apply migration: create email_notification_settings and email_notification_logs tables.
 * Run: npx tsx server/db/run-email-notification-migration.ts
 */
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const migrationPath = resolve(__dirname, "../../migrations/0071_email_notification_settings.sql");
  const migrationSql = readFileSync(migrationPath, "utf-8");

  const statements = migrationSql
    .split(/;/)
    .map((s) => s.replace(/--[^\n]*/g, "").trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    try {
      await sql(stmt);
      console.log("  ✓", stmt.slice(0, 80).replace(/\n/g, " ") + (stmt.length > 80 ? "…" : ""));
    } catch (e: any) {
      if (e.code === "42710" || e.message?.includes("already exists")) {
        console.log("  ↻ Already applied:", stmt.slice(0, 80).replace(/\n/g, " "));
      } else {
        console.error("  ✗ Error:", e.message || e);
      }
    }
  }

  console.log("\n✅ Email notification migration complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
