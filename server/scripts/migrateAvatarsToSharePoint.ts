/**
 * One-time migration: upload base64 avatars to SharePoint and save URLs in DB.
 * Run: npm run db:migrate-avatars-sharepoint
 * .env: DATABASE_URL + MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, SHAREPOINT_SITE_ID, SHAREPOINT_DRIVE_ID, SHAREPOINT_FOLDER_PATH
 */

import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../.env") });

import { neon } from "@neondatabase/serverless";
import {
  uploadAvatarToSharePoint,
  isSharePointAvatarConfigured,
  getMissingSharePointEnvVars,
  parseDataUrl,
} from "../lib/sharepoint";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL not set");
    process.exitCode = 1;
    return;
  }
  if (!isSharePointAvatarConfigured()) {
    const missing = getMissingSharePointEnvVars();
    console.error("❌ SharePoint not configured. Missing in .env:", missing.join(", "));
    process.exitCode = 1;
    return;
  }

  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql`
    SELECT id, avatar FROM employees
    WHERE avatar IS NOT NULL AND TRIM(avatar) != '' AND (avatar LIKE 'data:%')
  ` as { id: string; avatar: string }[];

  console.log(`Found ${rows.length} employee(s) with base64 avatars.`);

  let updated = 0;
  let failed = 0;
  for (const row of rows) {
    const parsed = parseDataUrl(row.avatar);
    if (!parsed) {
      failed++;
      continue;
    }
    try {
      const url = await uploadAvatarToSharePoint(row.id, parsed.buffer, parsed.contentType);
      if (url) {
        await sql`UPDATE employees SET avatar = ${url}, updated_at = NOW() WHERE id = ${row.id}`;
        updated++;
        console.log(`  ✓ ${row.id}`);
      } else {
        failed++;
      }
    } catch (err) {
      console.warn(`  ✗ ${row.id}:`, (err as Error)?.message);
      failed++;
    }
  }

  console.log(`Done. Updated: ${updated}, Failed: ${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
