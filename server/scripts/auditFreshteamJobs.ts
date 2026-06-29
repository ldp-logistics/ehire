/**
 * Compare FreshTeam job postings vs HRMS job_postings (freshteam_job_id links).
 * Run: npx tsx server/scripts/auditFreshteamJobs.ts
 */
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import {
  isFreshTeamConfigured,
  listJobPostings,
  getJobPosting,
  sleep,
  getFreshTeamDelayMs,
  isFreshTeamJobPublishedStatus,
} from "../lib/freshteamApi.js";

config();

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  if (!isFreshTeamConfigured()) {
    console.error("Set FRESHTEAM_DOMAIN and FRESHTEAM_API_KEY in .env");
    process.exit(1);
  }

  const hrmsRows = (await sql`
    SELECT id, title, status, freshteam_job_id, region_code, location
    FROM job_postings
    ORDER BY title
  `) as Array<{
    id: string;
    title: string;
    status: string;
    freshteam_job_id: string | null;
    region_code: string | null;
    location: string | null;
  }>;

  const linkedByFtId = new Map<string, (typeof hrmsRows)[0]>();
  const noFtLink: typeof hrmsRows = [];
  for (const r of hrmsRows) {
    const ft = r.freshteam_job_id?.trim();
    if (ft) linkedByFtId.set(ft, r);
    else noFtLink.push(r);
  }

  const delayMs = getFreshTeamDelayMs();
  const ftSummaries: Array<{ id: number; title?: string; status?: string }> = [];
  let page = 1;
  while (true) {
    const list = await listJobPostings(page, 30);
    await sleep(delayMs);
    for (const s of list) {
      if (s.id != null) ftSummaries.push({ id: Number(s.id), title: s.title, status: s.status });
    }
    if (list.length < 30) break;
    page++;
  }

  const missingInHrms: Array<{ ftId: string; title: string; status: string }> = [];
  const publishedMissing: Array<{ ftId: string; title: string; status: string }> = [];
  const notPublishedUnlinked: Array<{ ftId: string; title: string; status: string }> = [];

  for (const s of ftSummaries) {
    const ftIdStr = String(s.id);
    if (linkedByFtId.has(ftIdStr)) continue;
    const status = (s.status ?? "").trim() || "(no status on list)";
    const row = { ftId: ftIdStr, title: s.title ?? "?", status };
    missingInHrms.push(row);
    if (isFreshTeamJobPublishedStatus(s.status)) publishedMissing.push(row);
    else notPublishedUnlinked.push(row);
  }

  console.log("\n=== FreshTeam vs HRMS job audit ===\n");
  console.log(`FT jobs (list API):     ${ftSummaries.length}`);
  console.log(`HRMS jobs (total):      ${hrmsRows.length}`);
  console.log(`HRMS with FT link:      ${linkedByFtId.size}`);
  console.log(`HRMS without FT link:   ${noFtLink.length}`);
  console.log(`FT not in HRMS:         ${missingInHrms.length}`);
  console.log(`  → published/open:     ${publishedMissing.length}`);
  console.log(`  → other status:       ${notPublishedUnlinked.length}`);

  if (publishedMissing.length > 0) {
    console.log("\n--- Published in FT but NOT linked in HRMS (should migrate) ---");
    for (const r of publishedMissing) {
      console.log(`  FT ${r.ftId}  [${r.status}]  ${r.title}`);
    }
  }

  if (notPublishedUnlinked.length > 0) {
    console.log("\n--- In FT but not linked (not open/published — skipped by migrate) ---");
    for (const r of notPublishedUnlinked.slice(0, 30)) {
      console.log(`  FT ${r.ftId}  [${r.status}]  ${r.title}`);
    }
    if (notPublishedUnlinked.length > 30) console.log(`  ... and ${notPublishedUnlinked.length - 30} more`);
  }

  if (noFtLink.length > 0) {
    console.log("\n--- HRMS jobs with NO freshteam_job_id (manual / orphan) ---");
    for (const r of noFtLink.slice(0, 20)) {
      console.log(`  ${r.id.slice(0, 8)}…  [${r.status}]  ${r.title}`);
    }
    if (noFtLink.length > 20) console.log(`  ... and ${noFtLink.length - 20} more`);
  }

  // Detail-fetch published gaps (catches list vs detail status mismatch)
  if (publishedMissing.length > 0 && publishedMissing.length <= 15) {
    console.log("\n--- Detail check for published gaps ---");
    for (const r of publishedMissing) {
      try {
        const job = await getJobPosting(Number(r.ftId));
        await sleep(delayMs);
        const deleted = (job as { deleted?: boolean }).deleted === true;
        const note = deleted ? " → SKIP (deleted in FT)" : " → should import on next migrate";
        console.log(
          `  FT ${r.ftId}: list=${r.status} detail=${job.status ?? "?"} deleted=${deleted} title=${job.title}${note}`
        );
      } catch (e: unknown) {
        console.log(`  FT ${r.ftId}: detail fetch FAILED — ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  const privateWithApplicantsHint = notPublishedUnlinked.filter((r) =>
    ["private", "on_hold"].includes(r.status.toLowerCase())
  );
  if (privateWithApplicantsHint.length > 0) {
    console.log("\n--- Note: private/on_hold jobs are skipped by migrate (link freshteam_job_id manually if needed) ---");
    for (const r of privateWithApplicantsHint.slice(0, 8)) {
      console.log(`  FT ${r.ftId}  [${r.status}]  ${r.title}`);
    }
  }

  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
