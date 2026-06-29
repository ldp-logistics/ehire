/**
 * Probe FT applicant list for a job (with/without status filters).
 * Run: npx tsx server/scripts/probeFtJobApplicants.ts 5000145187
 */
import { config } from "dotenv";
import {
  isFreshTeamConfigured,
  listApplicantsForJob,
  FRESHTEAM_APPLICANT_STATUSES,
  sleep,
  getFreshTeamDelayMs,
} from "../lib/freshteamApi.js";

config();

const ftJobId = parseInt(process.argv[2] ?? "5000145187", 10);

async function main() {
  if (!isFreshTeamConfigured()) {
    console.error("FT not configured");
    process.exit(1);
  }
  const delay = getFreshTeamDelayMs();

  console.log("Job FT id:", ftJobId);

  const noFilter = await listApplicantsForJob(ftJobId, 1, 50, true);
  await sleep(delay);
  console.log("\nWithout status filter:");
  console.log("  count:", noFilter.applicants.length);
  console.log("  meta:", noFilter.meta);

  const withFilter = await listApplicantsForJob(ftJobId, 1, 50, true, {
    statuses: [...FRESHTEAM_APPLICANT_STATUSES],
  });
  await sleep(delay);
  console.log("\nWith all FRESHTEAM_APPLICANT_STATUSES:");
  console.log("  count:", withFilter.applicants.length);
  console.log("  meta:", withFilter.meta);

  if (noFilter.applicants[0]) {
    console.log("\nSample applicant keys:", Object.keys(noFilter.applicants[0]));
    console.log("Sample:", JSON.stringify(noFilter.applicants[0], null, 2).slice(0, 500));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
