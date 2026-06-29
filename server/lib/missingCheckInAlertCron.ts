/**
 * Configurable check-in reminder cron.
 *
 * Reads reminder slots from checkin_reminder_settings (managed via Settings → Timesheet → Reminders).
 * Each slot has a wall-clock time (policy TZ), enabled flag, notifyHr, notifyEmployee.
 *
 * Enable: ENABLE_MISSING_CHECKIN_HR_ALERT=true
 * Optional extra HR recipients: MISSING_CHECKIN_HR_ALERT_EXTRA_EMAILS=a@b.com,c@d.com
 *
 * Idempotency: checkin_reminder_sent(reminder_id, work_date) — one send per slot per day.
 * Falls back to old migration-0102 table for the legacy slot if the new tables don't exist yet.
 *
 * Runs every minute UTC.
 */

import cron from "node-cron";
import { DateTime } from "luxon";
import { AttendanceRepository } from "../modules/attendance/AttendanceRepository.js";
import { isWorkingDay } from "./attendancePolicy.js";
import { normalizeCountryToIso } from "./countryNormalize.js";
import { sendEmail, isEmailConfigured } from "./email.js";
import { getEmailsByRolesForRegions } from "./emailNotifications.js";

type MissingEmployee = {
  employee_id: string;
  emp_code: string | null;
  first_name: string | null;
  last_name: string | null;
  department: string | null;
  branch_name: string | null;
  country_hint: string | null;
  work_email?: string | null;
};

function timeStr(t: string | null | undefined): string {
  if (!t) return "09:00";
  const s = String(t);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

function normaliseWorkingDays(raw: unknown): number[] {
  const DEFAULT = [1, 2, 3, 4, 5];
  if (!Array.isArray(raw) || raw.length === 0) return [...DEFAULT];
  return (raw as unknown[]).map(Number).filter((n) => !Number.isNaN(n) && n >= 0 && n <= 6);
}

function parseExtraEmails(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter((s) => s.includes("@"));
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmt12(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = parseInt(hStr ?? "0", 10);
  const m = parseInt(mStr ?? "0", 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// ─── Email Templates ──────────────────────────────────────────────────────────

function buildHrEmailHtml(opts: {
  missing: MissingEmployee[];
  workDate: string;
  sendTime: string;
  zone: string;
  companyName: string;
  reminderLabel: string | null;
  branchFilter: string[] | null;
}): string {
  const { missing, workDate, sendTime, zone, companyName, reminderLabel, branchFilter } = opts;
  const title = reminderLabel ? esc(reminderLabel) : "Check-In Reminder";
  const time12 = fmt12(sendTime);
  const count = missing.length;
  const hasBranch = missing.some((m) => m.branch_name);

  const tableRows = missing
    .map(
      (m, i) => `
      <tr style="background:${i % 2 === 0 ? "#ffffff" : "#f8fafc"}">
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;font-family:monospace;font-size:12px">${esc(m.emp_code ?? "—")}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-weight:500;color:#1e293b">${esc([m.first_name, m.last_name].filter(Boolean).join(" ") || "—")}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#64748b">${esc(m.department ?? "—")}</td>
        ${hasBranch ? `<td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;color:#64748b">${esc(m.branch_name ?? "—")}</td>` : ""}
      </tr>`,
    )
    .join("");

  const branchNote = branchFilter && branchFilter.length > 0
    ? `<p style="margin:0 0 16px;font-size:12px;color:#64748b;background:#f0f9ff;border-left:3px solid #38bdf8;padding:8px 12px;border-radius:0 6px 6px 0">
        Filtered to <strong>${branchFilter.length} branch${branchFilter.length !== 1 ? "es" : ""}</strong> only.
      </p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Check-In Alert</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);padding:28px 32px">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <p style="margin:0;font-size:11px;color:#94a3b8;letter-spacing:.08em;text-transform:uppercase;font-weight:600">${esc(companyName)}</p>
                  <h1 style="margin:6px 0 0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-.3px">${title}</h1>
                </td>
                <td align="right">
                  <div style="background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.3);border-radius:8px;padding:8px 14px;display:inline-block">
                    <p style="margin:0;font-size:22px;font-weight:800;color:#f87171">${count}</p>
                    <p style="margin:2px 0 0;font-size:10px;color:#fca5a5;text-transform:uppercase;letter-spacing:.05em">Not Checked In</p>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Meta strip -->
        <tr>
          <td style="background:#f8fafc;padding:12px 32px;border-bottom:1px solid #e2e8f0">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:24px">
                  <p style="margin:0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em">Date</p>
                  <p style="margin:2px 0 0;font-size:13px;font-weight:600;color:#1e293b">${esc(workDate)}</p>
                </td>
                <td style="padding-right:24px">
                  <p style="margin:0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em">Reminder Time</p>
                  <p style="margin:2px 0 0;font-size:13px;font-weight:600;color:#1e293b">${esc(time12)}</p>
                </td>
                <td>
                  <p style="margin:0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em">Timezone</p>
                  <p style="margin:2px 0 0;font-size:13px;font-weight:600;color:#1e293b">${esc(zone)}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px">
            <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6">
              The following <strong style="color:#1e293b">${count} employee${count !== 1 ? "s" : ""}</strong> with an active account
              ${count !== 1 ? "have" : "has"} not checked in yet as of <strong style="color:#1e293b">${esc(time12)}</strong>.
              They are not on full-day approved leave today.
            </p>

            ${branchNote}

            <!-- Table -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-size:13px">
              <thead>
                <tr style="background:#f1f5f9">
                  <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #e2e8f0">Emp ID</th>
                  <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #e2e8f0">Name</th>
                  <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #e2e8f0">Department</th>
                  ${hasBranch ? `<th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #e2e8f0">Branch</th>` : ""}
                </tr>
              </thead>
              <tbody>${tableRows}</tbody>
            </table>

            <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;line-height:1.5">
              Employees on half-day approved leave are included. Employees on full-day leave are excluded. Holiday exclusions are applied per employee country.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0">
            <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.5">
              Automated attendance alert &middot; ${esc(companyName)} HR System<br>
              To change reminder times, go to <strong>Settings → Timesheet Policy → Check-in Reminders</strong>.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildEmployeeEmailHtml(opts: {
  firstName: string;
  workDate: string;
  sendTime: string;
  zone: string;
  companyName: string;
  reminderLabel: string | null;
}): string {
  const { firstName, workDate, sendTime, zone, companyName, reminderLabel } = opts;
  const time12 = fmt12(sendTime);
  const title = reminderLabel ? esc(reminderLabel) : "Check-In Reminder";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Check-In Reminder</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);padding:28px 32px;text-align:center">
            <!-- Clock icon -->
            <div style="width:52px;height:52px;background:rgba(251,191,36,.15);border:2px solid rgba(251,191,36,.4);border-radius:50%;margin:0 auto 14px;display:flex;align-items:center;justify-content:center;font-size:24px;line-height:52px;text-align:center">⏰</div>
            <h1 style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-.3px">${title}</h1>
            <p style="margin:6px 0 0;font-size:12px;color:#94a3b8">${esc(companyName)}</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 32px 24px">
            <p style="margin:0 0 16px;font-size:15px;color:#1e293b;font-weight:500">Hi ${esc(firstName)},</p>
            <p style="margin:0 0 16px;font-size:14px;color:#475569;line-height:1.7">
              It looks like you haven&rsquo;t <strong style="color:#1e293b">checked in</strong> yet today
              (<strong style="color:#1e293b">${esc(workDate)}</strong>).
              It&rsquo;s currently <strong style="color:#1e293b">${esc(time12)}</strong> in ${esc(zone)}.
            </p>

            <!-- Callout -->
            <div style="background:#fefce8;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:14px 16px;margin:20px 0">
              <p style="margin:0;font-size:13px;color:#92400e;font-weight:500">
                🕐 Please open the HR portal and clock in as soon as you arrive at your desk.
              </p>
            </div>

            <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6">
              If you have already checked in or are working remotely and this doesn&rsquo;t apply, please ignore this message.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center">
            <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.5">
              Automated reminder &middot; ${esc(companyName)} HR System
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Main Cron ────────────────────────────────────────────────────────────────

export function startMissingCheckInHrAlertCron(): void {
  if (process.env.ENABLE_MISSING_CHECKIN_HR_ALERT !== "true") return;

  const repo = new AttendanceRepository();
  const companyName = (process.env.COMPANY_NAME ?? "").trim() || "Your Company";

  cron.schedule(
    "* * * * *",
    async () => {
      try {
        if (!isEmailConfigured()) return;

        await repo.ensureOrgTimesheetPolicyRow();
        const policyRow = (await repo.getOrgTimesheetPolicy()) as Record<string, unknown> | null;
        const zone = ((policyRow?.policy_timezone as string) ?? "").trim() || "UTC";
        const workingDays = normaliseWorkingDays(policyRow?.working_days);

        const now = DateTime.now().setZone(zone);
        const workDate = now.toFormat("yyyy-MM-dd");
        if (!isWorkingDay(workDate, workingDays)) return;

        // Load enabled reminder slots
        let reminders: Awaited<ReturnType<typeof repo.listCheckinReminders>> = [];
        try {
          reminders = (await repo.listCheckinReminders()).filter((r) => r.enabled);
        } catch {
          // Migration not run yet — skip silently
          return;
        }
        if (reminders.length === 0) return;

        // Check each slot: does current policy-TZ time fall in [sendTime, sendTime+1min)?
        const nowHHMM = now.toFormat("HH:mm");
        const dueSlots = reminders.filter((r) => timeStr(r.send_time) === nowHHMM);
        if (dueSlots.length === 0) return;

        console.log(
          `[checkin-reminder] tick due workDate=${workDate} policyTz=${zone} now=${nowHHMM} slots=${dueSlots.map((s) => timeStr(s.send_time)).join(",")}`,
        );

        // Build holiday map once (country → isHoliday)
        const allCandidates = await repo.listEmployeesMissingCheckInForHrAlert(workDate);
        const countryKeys = new Set<string | null>();
        for (const c of allCandidates) countryKeys.add(normalizeCountryToIso(c.country_hint ?? null) ?? null);
        const onHoliday = new Map<string | null, boolean>();
        for (const k of Array.from(countryKeys)) {
          onHoliday.set(k, await repo.isHolidayForDate(workDate, k));
        }
        const allMissing = allCandidates.filter((c) => !onHoliday.get(normalizeCountryToIso(c.country_hint ?? null) ?? null));

        if (allMissing.length === 0) {
          console.log(
            `[checkin-reminder] skipped send at ${nowHHMM} (${zone}): no employees missing check-in (or all on leave/holiday)`,
          );
          return;
        }

        // Process each due slot
        for (const slot of dueSlots) {
          const sendTime = timeStr(slot.send_time);

          // Determine branch filter for this slot
          let slotBranchIds: string[] | null = null;
          if (slot.branch_ids != null) {
            try {
              const raw = slot.branch_ids;
              const parsed = typeof raw === "string" ? (JSON.parse(raw) as string[]) : raw;
              if (Array.isArray(parsed) && parsed.length > 0) {
                slotBranchIds = parsed.map(String).filter(Boolean);
              }
            } catch {
              console.warn(`[checkin-reminder] slot ${slot.id}: invalid branch_ids JSON`);
            }
          }

          // If branch-filtered: re-query with restriction and re-apply holiday filter
          let slotMissing: typeof allMissing;
          if (slotBranchIds) {
            const filtered = await repo.listEmployeesMissingCheckInForHrAlert(workDate, slotBranchIds);
            slotMissing = filtered.filter((c) => !onHoliday.get(normalizeCountryToIso(c.country_hint ?? null) ?? null));
          } else {
            slotMissing = allMissing;
          }

          if (slotMissing.length === 0) {
            if (slotBranchIds) {
              console.warn(
                `[checkin-reminder] slot ${slot.id} at ${sendTime}: ${allMissing.length} missing org-wide but 0 in selected branch(es). ` +
                  `Check employee Branch/Location matches org branch names, or clear branch filter in Settings.`,
              );
            } else {
              console.log(`[checkin-reminder] slot ${slot.id} at ${sendTime}: no missing employees for this slot`);
            }
            continue;
          }

          // Claim only when we will actually send (avoids blocking retries when filter matches 0)
          const claimed = await repo.tryClaimCheckinReminderSent(slot.id, workDate);
          if (!claimed) {
            console.log(`[checkin-reminder] slot ${slot.id} already sent for ${workDate}`);
            continue;
          }

          // ── HR digest ──
          if (slot.notify_hr) {
            const regions = [...new Set(slotMissing.map((m) => m.region_code).filter(Boolean))] as string[];
            const hrRecips = regions.length > 0
              ? await getEmailsByRolesForRegions(["hr", "limited_hr"], regions)
              : [];
            const seen = new Set<string>();
            const to: string[] = [];
            for (const r of hrRecips) {
              const e = r.email.trim().toLowerCase();
              if (e && !seen.has(e)) { seen.add(e); to.push(r.email.trim()); }
            }
            for (const e of parseExtraEmails(process.env.MISSING_CHECKIN_HR_ALERT_EXTRA_EMAILS)) {
              if (!seen.has(e)) { seen.add(e); to.push(e); }
            }

            if (to.length === 0) {
              console.warn(
                `[checkin-reminder] slot ${slot.id}: ${slotMissing.length} missing but no HR recipients (need active user with role hr or limited_hr, or MISSING_CHECKIN_HR_ALERT_EXTRA_EMAILS)`,
              );
            } else {
              const subject = `[Attendance] ${slotMissing.length} not checked in — ${workDate} · ${fmt12(sendTime)}`;
              const html = buildHrEmailHtml({ missing: slotMissing, workDate, sendTime, zone, companyName, reminderLabel: slot.label, branchFilter: slotBranchIds });
              const text = `${slotMissing.length} employee(s) without check-in as of ${sendTime} (${zone}) on ${workDate}:\n` +
                slotMissing.map((m) => `- ${m.emp_code ?? "?"} ${[m.first_name, m.last_name].filter(Boolean).join(" ")} (${m.department ?? ""}${m.branch_name ? " · " + m.branch_name : ""})`).join("\n");
              const from = (process.env.EMAIL_FROM_NOTIFICATIONS ?? process.env.EMAIL_FROM ?? "").trim() || undefined;
              const r = await sendEmail({ to, subject, html, text, ...(from ? { from } : {}) });
              if (!r.ok) console.error(`[checkin-reminder] HR send failed slot=${slot.id}: ${r.message}`);
              else console.log(`[checkin-reminder] HR digest sent slot=${slot.id} time=${sendTime} missing=${slotMissing.length} to=${to.length}`);
            }
          }

          // ── Employee nudge ──
          if (slot.notify_employee) {
            let empWithEmails: (MissingEmployee & { work_email: string | null })[] = [];
            try {
              empWithEmails = await (repo as any).sql`
                SELECT e.id AS employee_id, e.work_email
                FROM employees e
                WHERE e.id = ANY(${slotMissing.map((m) => m.employee_id)}::uuid[])
              ` as any[];
            } catch { /* ignore */ }
            const emailMap = new Map(empWithEmails.map((r) => [r.employee_id, r.work_email]));

            const from = (process.env.EMAIL_FROM_NOTIFICATIONS ?? process.env.EMAIL_FROM ?? "").trim() || undefined;
            let sent = 0;
            for (const m of slotMissing) {
              const email = emailMap.get(m.employee_id);
              if (!email?.includes("@")) continue;
              const firstName = m.first_name ?? "there";
              const subject = `Reminder: You haven't checked in yet — ${workDate}`;
              const html = buildEmployeeEmailHtml({ firstName, workDate, sendTime, zone, companyName, reminderLabel: slot.label });
              const text = `Hi ${firstName},\n\nThis is a reminder that you haven't checked in yet today (${workDate}). It's currently ${fmt12(sendTime)} in ${zone}.\n\nPlease log in and clock in as soon as possible.\n\n${companyName} HR`;
              const r = await sendEmail({ to: email, subject, html, text, ...(from ? { from } : {}) });
              if (r.ok) sent++;
              else console.error(`[checkin-reminder] employee nudge failed empId=${m.employee_id}: ${r.message}`);
            }
            console.log(`[checkin-reminder] employee nudges sent slot=${slot.id} sent=${sent}/${slotMissing.length}`);
          }
        }
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        if (msg.includes("checkin_reminder") || msg.includes("does not exist")) {
          console.warn("[checkin-reminder] table missing — run migration 0104_checkin_reminder_settings.sql");
          return;
        }
        console.error("[checkin-reminder] tick failed:", e);
      }
    },
    { timezone: "UTC" },
  );

  console.log("[checkin-reminder] scheduled every minute UTC (ENABLE_MISSING_CHECKIN_HR_ALERT=true); slots loaded from DB");
}
