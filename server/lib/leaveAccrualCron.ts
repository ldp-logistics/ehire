/**
 * Optional scheduled leave accrual (Earned Leave + other monthly types, 1st of month).
 * Enable on deploy: ENABLE_LEAVE_ACCRUAL_CRON=true
 *
 * Env:
 *   ENABLE_LEAVE_ACCRUAL_CRON=true   — required to run
 *   LEAVE_ACCRUAL_CRON="0 0 1 * *"    — optional; default = 00:00 on day 1 of each month (node-cron)
 *   DEFAULT_TIMEZONE=Asia/Karachi    — “month start” is midnight on the 1st in this IANA zone (fallback UTC)
 *
 * Override examples:
 *   LEAVE_ACCRUAL_CRON=0 2 1 * *   — 02:00 on the 1st only
 *   LEAVE_ACCRUAL_CRON=0 2 * * *   — every day at 02:00 (old behaviour)
 */
import cron from "node-cron";
import { LeaveService } from "../modules/leave/LeaveService.js";

export function startLeaveAccrualCron(): void {
  if (process.env.ENABLE_LEAVE_ACCRUAL_CRON !== "true") {
    return;
  }

  const tz = process.env.DEFAULT_TIMEZONE?.trim() || "UTC";
  const expression = (process.env.LEAVE_ACCRUAL_CRON || "0 0 1 * *").trim();

  if (!cron.validate(expression)) {
    console.error(
      `[leave-accrual-cron] Invalid LEAVE_ACCRUAL_CRON="${expression}" — cron disabled.`,
    );
    return;
  }

  const svc = new LeaveService();
  cron.schedule(
    expression,
    async () => {
      try {
        const r = await svc.runAccrual();
        console.log(
          `[leave-accrual-cron] ok accruedCount=${r.accruedCount ?? 0} earnedLeaveAccrued=${r.earnedLeaveAccrued ?? 0}`,
        );
      } catch (e) {
        console.error("[leave-accrual-cron] run failed:", e);
      }
    },
    { timezone: tz },
  );

  console.log(
    `[leave-accrual-cron] scheduled "${expression}" timezone=${tz} (ENABLE_LEAVE_ACCRUAL_CRON=true)`,
  );
}
