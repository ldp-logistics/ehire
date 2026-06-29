import {
  formatDateTimeCompact,
  formatLeaveAppliedAt,
  formatTimeOnlyDisplay,
  isDateOnlyValue,
} from "@shared/dateTimeFormat";

/**
 * Format a date-only value (e.g. join_date, dob) without timezone shift.
 * DB stores these as midnight UTC; parsing as Date and using toLocaleDateString
 * would show the previous day in timezones behind UTC. This parses YYYY-MM-DD
 * and formats that calendar date so "2025-03-07" always shows as 07 March 2025.
 */

const LONG_DATE_GB: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "long",
  year: "numeric",
};

const LONG_DATE_US: Intl.DateTimeFormatOptions = {
  month: "long",
  day: "2-digit",
  year: "numeric",
};

/** Branch MM/dd preference → month-first long date; otherwise day-first (04 April 2026). */
function isUsDateOrder(dateFormatPattern?: string | null): boolean {
  const p = dateFormatPattern?.trim();
  return !!(p && (/^mm\//i.test(p) || /month first/i.test(p.toLowerCase())));
}

/** Human-readable calendar date, e.g. "04 April 2026" (or "April 04, 2026" for US order). */
export function formatLongCalendarDate(
  y: number,
  m: number,
  d: number,
  dateFormatPattern?: string | null
): string {
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return "—";
  const useUS = isUsDateOrder(dateFormatPattern);
  return dt.toLocaleDateString(useUS ? "en-US" : "en-GB", useUS ? LONG_DATE_US : LONG_DATE_GB);
}

export function formatDateOnly(dateStr?: string | null, dateFormatPattern?: string | null): string | null {
  if (!dateStr) return null;
  const s = String(dateStr).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return formatLeaveDisplayDate(String(dateStr), undefined, dateFormatPattern);
  }
  const [y, m, d] = s.split("-").map(Number);
  return formatLongCalendarDate(y, m, d, dateFormatPattern);
}

/** Postgres `date` often JSON-serializes as midnight UTC — still a calendar day, not an instant to shift. */
function calendarYmdFromDateOnlyValue(raw: string): { y: number; m: number; d: number } | null {
  const ymd = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  if (raw.length === 10) {
    const [y, m, d] = ymd.split("-").map(Number);
    return { y, m, d };
  }
  const tail = raw.slice(10);
  if (/^T00:00:00(\.0+)?(Z|[+-]00:00)?$/i.test(tail)) {
    const [y, m, d] = ymd.split("-").map(Number);
    return { y, m, d };
  }
  return null;
}

function formatCalendarYmdParts(
  y: number,
  m: number,
  d: number,
  dateFormatPattern?: string | null
): string {
  return formatLongCalendarDate(y, m, d, dateFormatPattern);
}

/**
 * Leave start/end (period) dates — avoid "wrong day" from mixing DATE vs timestamptz:
 * - `YYYY-MM-DD` from Postgres DATE: treat as that calendar day.
 * - `YYYY-MM-DDT00:00:00.000Z` from JSON DATE: same — do not shift to previous day in US TZ.
 * - Full ISO from timestamptz (non-midnight): show the calendar date in `timeZone`.
 * - `dateFormatPattern`: branch setting — only affects US vs day-first long format.
 */
export function formatLeaveDisplayDate(
  value: string | null | undefined,
  timeZone?: string | null,
  dateFormatPattern?: string | null
): string {
  if (value == null || value === "") return "—";
  const raw = String(value).trim();
  const cal = calendarYmdFromDateOnlyValue(raw);
  if (cal) {
    return formatCalendarYmdParts(cal.y, cal.m, cal.d, dateFormatPattern);
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  const tz = timeZone?.trim() || undefined;
  const useUS = isUsDateOrder(dateFormatPattern);
  return d.toLocaleDateString(useUS ? "en-US" : "en-GB", {
    ...(useUS ? LONG_DATE_US : LONG_DATE_GB),
    ...(tz ? { timeZone: tz } : {}),
  });
}

/** Calendar YYYY-MM-DD in `timeZone` (branch IANA) for comparing "today" vs an instant. */
export function formatCalendarYmdInTz(date: Date | string, timeZone?: string | null): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  const tz = timeZone?.trim();
  if (!tz) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !day) return "";
  return `${y}-${m}-${day}`;
}

function daysBetweenYmd(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
}

/** ISO timestamps — long date, 12h time, and zone label in branch TZ. */
export function formatDateTimeDisplay(
  value: string | null | undefined,
  timeZone?: string | null,
  dateFormatPattern?: string | null,
): string {
  return formatLeaveAppliedAt(value, timeZone, dateFormatPattern);
}

/** Date-only vs instant: calendar date or full timestamp with zone. */
export function formatAutoDisplay(
  value: string | null | undefined,
  timeZone?: string | null,
  dateFormatPattern?: string | null,
): string {
  if (value == null || value === "") return "—";
  if (isDateOnlyValue(String(value).trim())) {
    return formatLeaveDisplayDate(value, timeZone, dateFormatPattern);
  }
  return formatLeaveAppliedAt(value, timeZone, dateFormatPattern);
}

export { formatDateTimeCompact, formatTimeOnlyDisplay, isDateOnlyValue };

/** Applied / decided timestamps with AM·PM and zone label (PKT · Karachi). */
export function formatDateTimeWithTimezone(
  value: string | null | undefined,
  timeZone?: string | null,
  dateFormatPattern?: string | null,
): string {
  return formatLeaveAppliedAt(value, timeZone, dateFormatPattern);
}

/** Submitter's branch TZ when available; else viewer branch (from /api/auth/me). */
export function formatAppliedAtForEmployee(
  appliedAt: string | null | undefined,
  employeeBranchTz?: string | null,
  employeeBranchDf?: string | null,
  viewerTz?: string | null,
  viewerDf?: string | null,
): string {
  return formatLeaveAppliedAt(
    appliedAt,
    employeeBranchTz?.trim() || viewerTz || undefined,
    employeeBranchDf?.trim() || viewerDf || undefined,
  );
}

/** Change-request old/new values: date-only YYYY-MM-DD or parseable datetimes use branch TZ + format. */
export function formatChangeRequestValue(
  value: string | null | undefined,
  timeZone?: string | null,
  dateFormatPattern?: string | null,
  maxLen = 50
): string {
  if (value == null || value === "") return "—";
  const s = String(value).trim();
  if (!s) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return formatLeaveDisplayDate(s, timeZone, dateFormatPattern);
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return formatLeaveAppliedAt(s, timeZone, dateFormatPattern);
  }
  return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
}

/** Recruitment pipeline card: "Today" / "Yesterday" / relative vs branch calendar; else branch-formatted date. */
export function formatRelativeAppliedDate(
  iso: string,
  timeZone?: string | null,
  dateFormatPattern?: string | null
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const ymdApp = formatCalendarYmdInTz(d, timeZone);
  const ymdNow = formatCalendarYmdInTz(new Date(), timeZone);
  if (!ymdApp || !ymdNow) return formatLeaveDisplayDate(iso, timeZone, dateFormatPattern);
  const elapsed = daysBetweenYmd(ymdApp, ymdNow);
  if (elapsed < 0) return formatLeaveDisplayDate(iso, timeZone, dateFormatPattern);
  if (elapsed === 0) return "Today";
  if (elapsed === 1) return "Yesterday";
  if (elapsed < 7) return `${elapsed}d ago`;
  if (elapsed < 30) return `${Math.floor(elapsed / 7)}w ago`;
  return formatLeaveDisplayDate(iso, timeZone, dateFormatPattern);
}
