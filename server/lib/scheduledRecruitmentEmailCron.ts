/**
 * Sends queued recruitment emails when send_at is reached (e.g. candidate rejection at a chosen time).
 * Runs every minute; lightweight SELECT + notifyEmail.
 *
 * Disable: SCHEDULED_RECRUITMENT_EMAIL_CRON=false
 */
import cron from "node-cron";
import { RecruitmentRepository } from "../modules/recruitment/RecruitmentRepository.js";
import { notifyEmail } from "./emailNotifications.js";
import type { NotifyContext } from "./emailNotifications.js";

let missingTableWarned = false;

function isMissingScheduledEmailTableError(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  if (err?.code === "42P01") return true; // undefined_table (Postgres)
  return typeof err?.message === "string" && err.message.toLowerCase().includes("scheduled_recruitment_emails");
}

export async function processDueScheduledRecruitmentEmails(): Promise<{ processed: number; failed: number }> {
  const repo = new RecruitmentRepository();
  let rows: Array<{
    id: string;
    event_key: string;
    recipient_email: string;
    recipient_name: string | null;
    context_json: Record<string, unknown>;
  }> = [];
  try {
    rows = (await repo.listDueScheduledRecruitmentEmails(30)) as typeof rows;
    if (rows.length > 0) missingTableWarned = false;
  } catch (e) {
    if (isMissingScheduledEmailTableError(e)) {
      if (!missingTableWarned) {
        missingTableWarned = true;
        console.warn(
          "[scheduled-recruitment-email] skipped: table scheduled_recruitment_emails not found. Run migration 0101_scheduled_recruitment_emails.sql.",
        );
      }
      return { processed: 0, failed: 0 };
    }
    throw e;
  }

  let processed = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const ctx = row.context_json as NotifyContext;
      await notifyEmail(row.event_key, ctx, [
        { email: row.recipient_email, name: row.recipient_name ?? undefined },
      ]);
      await repo.markScheduledRecruitmentEmailSent(row.id);
      processed++;
    } catch (e) {
      const msg = String((e as Error)?.message || e);
      console.error(`[scheduled-recruitment-email] id=${row.id} failed:`, msg);
      await repo.markScheduledRecruitmentEmailFailed(row.id, msg.slice(0, 2000));
      failed++;
    }
  }

  return { processed, failed };
}

export function startScheduledRecruitmentEmailCron(): void {
  if (process.env.SCHEDULED_RECRUITMENT_EMAIL_CRON === "false") {
    return;
  }

  cron.schedule(
    "* * * * *",
    async () => {
      try {
        const { processed, failed } = await processDueScheduledRecruitmentEmails();
        if (processed > 0 || failed > 0) {
          console.log(`[scheduled-recruitment-email] processed=${processed} failed=${failed}`);
        }
      } catch (e) {
        console.error("[scheduled-recruitment-email] tick failed:", e);
      }
    },
    { timezone: "UTC" },
  );

  console.log("[scheduled-recruitment-email] cron every minute (UTC); set SCHEDULED_RECRUITMENT_EMAIL_CRON=false to disable");
}
