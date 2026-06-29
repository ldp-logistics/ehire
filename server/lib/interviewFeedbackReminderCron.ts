/**
 * Sends interview feedback reminder emails automatically when a round ends.
 * Uses the same template as HR manual "Send Reminder" (recruit.interview_feedback_reminder).
 *
 * Disable: INTERVIEW_FEEDBACK_REMINDER_CRON=false
 */
import cron from "node-cron";
import { RecruitmentRepository } from "../modules/recruitment/RecruitmentRepository.js";
import { notifyEmail, resolvePublicAppUrlForTemplates } from "./emailNotifications.js";
import { recruitmentApplicantDeepLink } from "../../shared/notificationDeepLinks.js";
import { emitRefreshAll } from "./notificationEvents.js";

export async function processAutoInterviewFeedbackReminders(): Promise<{ sent: number; failed: number }> {
  const repo = new RecruitmentRepository();
  const rows = (await repo.listInterviewFeedbackAutoReminderCandidates(40)) as Array<{
    feedback_id: string;
    history_id: string;
    application_id: string;
    reviewer_email: string;
    reviewer_name: string | null;
    job_id: string;
    first_name: string | null;
    last_name: string | null;
    job_title: string | null;
  }>;

  if (!rows.length) return { sent: 0, failed: 0 };

  const appUrl = (resolvePublicAppUrlForTemplates() ?? "").replace(/\/$/, "");
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const email = (row.reviewer_email ?? "").trim();
    if (!email) continue;
    const candidateName = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "the candidate";
    const deepLink = `${appUrl}${recruitmentApplicantDeepLink(row.job_id, row.application_id)}`;
    try {
      await notifyEmail(
        "recruit.interview_feedback_reminder",
        {
          reviewer_name: row.reviewer_name || email,
          candidate_name: candidateName,
          app_url: deepLink,
          recipient_name: row.reviewer_name || email,
          job_title: row.job_title ?? "",
        },
        [{ email, name: row.reviewer_name || email }],
      );
      await repo.markFeedbackReminderSentByIds([row.feedback_id]);
      sent++;
    } catch (e) {
      failed++;
      console.error(
        `[interview-feedback-reminder] feedback_id=${row.feedback_id} failed:`,
        String((e as Error)?.message || e),
      );
    }
  }

  if (sent > 0) emitRefreshAll();
  return { sent, failed };
}

export function startInterviewFeedbackReminderCron(): void {
  if (process.env.INTERVIEW_FEEDBACK_REMINDER_CRON === "false") {
    return;
  }

  cron.schedule(
    "* * * * *",
    async () => {
      try {
        const { sent, failed } = await processAutoInterviewFeedbackReminders();
        if (sent > 0 || failed > 0) {
          console.log(`[interview-feedback-reminder] sent=${sent} failed=${failed}`);
        }
      } catch (e) {
        console.error("[interview-feedback-reminder] tick failed:", e);
      }
    },
    { timezone: "UTC" },
  );

  console.log(
    "[interview-feedback-reminder] cron every minute (UTC); set INTERVIEW_FEEDBACK_REMINDER_CRON=false to disable",
  );
}
