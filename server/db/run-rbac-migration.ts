/**
 * One-off: apply RBAC migration (add 'it' role, auth_provider, unique employee_id, allowed_modules).
 * Run: npx tsx server/db/run-rbac-migration.ts
 */
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import { resolve } from "path";

config();
const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const migrationPath = resolve(__dirname, "../../migrations/0013_rbac_harden.sql");
  const migrationSql = readFileSync(migrationPath, "utf-8");

  // Split by semicolons and filter out empty statements
  const statements = migrationSql
    .split(/;(?=\s*(?:--|DO|ALTER|CREATE|UPDATE|$))/i)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const stmt of statements) {
    try {
      await sql(stmt);
      console.log("  ✓ Executed:", stmt.slice(0, 80).replace(/\n/g, " ") + (stmt.length > 80 ? "…" : ""));
    } catch (e: any) {
      // Some statements may fail if already applied (e.g. duplicate enum value)
      if (e.code === "42710" || e.message?.includes("already exists")) {
        console.log("  ↻ Already applied:", stmt.slice(0, 80).replace(/\n/g, " "));
      } else {
        console.error("  ✗ Error:", e.message || e);
        console.error("    Statement:", stmt.slice(0, 200));
      }
    }
  }

  console.log("\n✅ RBAC migration complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
