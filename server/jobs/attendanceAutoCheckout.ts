/**
 * Scheduled worker: close stale open attendance rows (forgot to check out).
 *
 * Run after migrations 0079 + 0080. Example:
 *   npx tsx server/jobs/attendanceAutoCheckout.ts
 *
 * Or call POST /api/attendance/internal/auto-checkout-sweep with header
 *   x-attendance-cron-secret: <ATTENDANCE_CRON_SECRET>
 */
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env") });

import { AttendanceService } from "../modules/attendance/AttendanceService.js";

async function main() {
  const svc = new AttendanceService();
  const result = await svc.runAutoCheckoutSweep();
  console.log(JSON.stringify({ ok: true, ...result }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
