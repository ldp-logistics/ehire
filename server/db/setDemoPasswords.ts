/**
 * Set a known password for all users (for local/testing only).
 * Run: npx tsx server/db/setDemoPasswords.ts
 * Then log in with any seeded user email and password: password123
 *
 * Skips the break-glass email (see BREAK_GLASS_PRIMARY_EMAIL / default ehire@ldplogistics.com).
 */
import { config } from "dotenv";
config();

import { neon } from "@neondatabase/serverless";
import bcrypt from "bcrypt";
import { getPrimaryAdminBaselineExceptionEmail } from "../../shared/roleCatalog.js";

const DEMO_PASSWORD = "password123";

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL not set");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function setDemoPasswords() {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const breakGlass = getPrimaryAdminBaselineExceptionEmail().toLowerCase();
  await sql`
    UPDATE users SET password_hash = ${hash}
    WHERE is_active = true AND LOWER(TRIM(email)) <> ${breakGlass}
  `;
  console.log(`✅ Active users (except ${breakGlass}) can log in with password: ${DEMO_PASSWORD}`);
  console.log(`⏭️  Skipped ${breakGlass} — configure break-glass password + 2FA separately.`);
  process.exit(0);
}

setDemoPasswords().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
