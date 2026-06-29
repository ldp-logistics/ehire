/**
 * Timezone resolution: employee branch → branches.time_zone → DEFAULT_TIMEZONE → UTC.
 * Personal users.time_zone is no longer used for API "today" / leave / attendance.
 */
import { format } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

const DEFAULT_TZ = "UTC";
const DEFAULT_DATE_FORMAT = "dd/MM/yyyy";

export function getDefaultTz(): string {
  const tz = process.env.DEFAULT_TIMEZONE?.trim();
  return tz && tz.length > 0 ? tz : DEFAULT_TZ;
}

/** Default branch-style date pattern when job has no hiring-manager branch (aligns with migration default). */
export function getDefaultDateFormat(): string {
  const df = process.env.DEFAULT_DATE_FORMAT?.trim();
  return df && df.length > 0 ? df : DEFAULT_DATE_FORMAT;
}

/** Resolved display settings for unauthenticated (public) pages from optional branch columns. */
export function publicDisplayFromBranch(
  branchTz: string | null | undefined,
  branchDateFormat: string | null | undefined
): { displayTimeZone: string; displayDateFormat: string } {
  const tz = typeof branchTz === "string" ? branchTz.trim() : "";
  const df = typeof branchDateFormat === "string" ? branchDateFormat.trim() : "";
  return {
    displayTimeZone: tz.length > 0 ? tz : getDefaultTz(),
    displayDateFormat: df.length > 0 ? df : getDefaultDateFormat(),
  };
}

/** @deprecated Use branch / getRequestTz; kept for rare call sites. */
export function resolveUserTz(userTimeZone: string | null | undefined): string {
  const tz = userTimeZone?.trim();
  return tz && tz.length > 0 ? tz : getDefaultTz();
}

/** Branch time zone + date display pattern for the signed-in user (via employee → branch). */
export async function getRequestBranchDisplay(
  req: { user?: { id?: string } },
  sql: (strings: TemplateStringsArray, ...values: any[]) => Promise<any[]>
): Promise<{ timeZone: string; dateFormat: string }> {
  const userId = req?.user?.id;
  if (!userId) {
    return { timeZone: getDefaultTz(), dateFormat: getDefaultDateFormat() };
  }
  const rows = await sql`
    SELECT b.time_zone AS branch_tz, b.date_format AS branch_df
    FROM users u
    LEFT JOIN employees e ON e.id = u.employee_id
    LEFT JOIN branches b ON b.id = e.branch_id
    WHERE u.id = ${userId}
    LIMIT 1
  `;
  const row = rows[0] as { branch_tz?: string | null; branch_df?: string | null } | undefined;
  const tz = typeof row?.branch_tz === "string" ? row.branch_tz.trim() : "";
  const df = typeof row?.branch_df === "string" ? row.branch_df.trim() : "";
  return {
    timeZone: tz.length > 0 ? tz : getDefaultTz(),
    dateFormat: df.length > 0 ? df : getDefaultDateFormat(),
  };
}

/**
 * Effective IANA timezone for the current request: linked employee's branch, else server default.
 * Used by attendance, leave, dashboard, notifications, offboarding, etc.
 */
export async function getRequestTz(
  req: { user?: { id?: string } },
  sql: (strings: TemplateStringsArray, ...values: any[]) => Promise<any[]>
): Promise<string> {
  const { timeZone } = await getRequestBranchDisplay(req, sql);
  return timeZone;
}

export function todayInTz(tz: string): string {
  const safeTz = tz?.trim() || getDefaultTz();
  const now = new Date();
  const zoned = toZonedTime(now, safeTz);
  return format(zoned, "yyyy-MM-dd");
}

/** Previous calendar day as YYYY-MM-DD (Gregorian). */
export function yesterdayYmdFromTodayYmd(todayYmd: string): string {
  const [y, m, d] = todayYmd.split("-").map(Number);
  const u = new Date(Date.UTC(y, m - 1, d));
  u.setUTCDate(u.getUTCDate() - 1);
  return u.toISOString().slice(0, 10);
}

export function addCalendarDaysYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const u = new Date(Date.UTC(y, m - 1, d));
  u.setUTCDate(u.getUTCDate() + deltaDays);
  return u.toISOString().slice(0, 10);
}

/** Inclusive calendar-day count from startYmd through endYmd (YYYY-MM-DD). */
export function diffCalendarDaysInclusive(startYmd: string, endYmd: string): number {
  const [ys, ms, ds] = startYmd.split("-").map(Number);
  const [ye, me, de] = endYmd.split("-").map(Number);
  const s = Date.UTC(ys, ms - 1, ds);
  const e = Date.UTC(ye, me - 1, de);
  if (e < s) return 0;
  return Math.floor((e - s) / 86400000) + 1;
}

export function dateInTz(utcDate: Date, tz: string): string {
  const safeTz = tz?.trim() || getDefaultTz();
  const zoned = toZonedTime(utcDate, safeTz);
  return format(zoned, "yyyy-MM-dd");
}

/** Parse local date+time in the given timezone → UTC Date. */
export function parseLocalToUtc(dateStr: string, timeStr: string, tz: string): Date {
  const safeTz = tz?.trim() || getDefaultTz();
  const [y, m, d] = dateStr.split("-").map(Number);
  const parts = (timeStr || "00:00").split(":");
  const h = Number(parts[0]) || 0;
  const min = Number(parts[1]) || 0;
  const sec = Number(parts[2]) || 0;
  const localAsIf = new Date(y, m - 1, d, h, min, sec);
  return fromZonedTime(localAsIf, safeTz);
}

/**
 * Postgres DATE / JS Date / string → calendar YYYY-MM-DD (UTC components for Date-at-midnight from DB).
 * Avoids `${date}` in templates which would use Date#toString() in notifications.
 */
export function toYmdDateOnly(raw: unknown): string {
  if (raw == null || raw === "") return "";
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getUTCFullYear();
    const m = String(raw.getUTCMonth() + 1).padStart(2, "0");
    const d = String(raw.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(raw).trim();
  const head = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(head)) return head;
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return toYmdDateOnly(parsed);
  return s;
}

/** Format YYYY-MM-DD for user-visible message copy (branch date_format). */
export function formatYmdForUserMessage(ymd: string, dateFormatPattern?: string | null): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd || "";
  const [y, m, d] = ymd.split("-").map(Number);
  const p = (dateFormatPattern || getDefaultDateFormat()).trim().toLowerCase();
  if (p.startsWith("yyyy") || p.includes("yyyy-mm")) {
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  if (/^m{1,2}[/.\\-]d/.test(p) || p.includes("mm-dd") || p.includes("month first")) {
    return `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}/${y}`;
  }
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

/** "30/03/2026 – 02/04/2026" style range for notification body text. */
export function formatNotificationDateRange(
  start: unknown,
  end: unknown,
  dateFormatPattern?: string | null
): string {
  const a = formatYmdForUserMessage(toYmdDateOnly(start), dateFormatPattern);
  const b = formatYmdForUserMessage(toYmdDateOnly(end), dateFormatPattern);
  if (!a && !b) return "";
  if (!a) return b;
  if (!b) return a;
  return `${a} – ${b}`;
}
