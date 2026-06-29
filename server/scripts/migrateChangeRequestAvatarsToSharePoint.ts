/**
 * One-time migration: change_requests avatar old_value/new_value base64 → SharePoint URLs.
 * Run: npm run db:migrate-change-request-avatars-sharepoint
 * Requires same SharePoint .env as employee avatar migration.
 */

import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../.env") });

import { ChangeRequestService } from "../modules/change-requests/ChangeRequestService.js";

async function main() {
  const svc = new ChangeRequestService();
  const result = await svc.migrateAvatarsToSharePoint();
  console.log("Change request avatar migration:", result);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
