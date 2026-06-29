/**
 * Instant timestamps (applied_at, decided_at) with explicit timezone across UI & emails.
 * Uses IANA zones (Asia/Karachi, America/New_York) — not ambiguous "EST" without region.
 */

/** True when value is a calendar date only (no meaningful time-of-day). */
export function isDateOnlyValue(value: string | null | undefined): boolean {
  if (value == null || value === "") return true;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return true;
  if (/^\d{4}-\d{2}-\d{2}T00:00:00(\.0+)?(Z|[+-]00:00)?$/i.test(raw)) return true;
  return false;
}

function isUsDateOrder(dateFormatPattern?: string | null): boolean {
  const p = dateFormatPattern?.trim();
  return !!(p && (/^mm\//i.test(p) || /month first/i.test(p.toLowerCase())));
}

export function timezoneCityLabel(iana: string | null | undefined): string {
  if (!iana?.trim()) return "UTC";
  const s = iana.trim();
  return s.split("/").pop()?.replace(/_/g, " ") ?? s;
}

/** Short zone name at instant, e.g. PKT, EST, IST (Intl; may be GMT+5 in some runtimes). */
export function timezoneAbbr(iana: string | null | undefined, refDate = new Date()): string {
  const tz = iana?.trim() || "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(refDate);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? tz;
  } catch {
    return tz;
  }
}

function offsetMinutesEast(iana: string, refDate: Date): number {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: iana,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = f.formatToParts(refDate);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const wallAsUtcMs = Date.UTC(
    n("year"),
    n("month") - 1,
    n("day"),
    n("hour"),
    n("minute"),
    n("second"),
  );
  return Math.round((wallAsUtcMs - refDate.getTime()) / 60000);
}

function gmtParenthesesFromMinutes(totalMinutes: number): string {
  const sign = totalMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(totalMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `GMT${sign}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** e.g. "(GMT+05:00) Karachi - PKT" */
export function formatTimezoneContextLabel(iana: string | null | undefined, refDate = new Date()): string {
  const tz = iana?.trim() || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(refDate);
  } catch {
    return "UTC";
  }
  const gmt = gmtParenthesesFromMinutes(offsetMinutesEast(tz, refDate));
  const city = timezoneCityLabel(tz);
  const abbr = timezoneAbbr(tz, refDate);
  return `(${gmt}) ${city} - ${abbr}`;
}

/**
 * Full applied/submitted instant: date, 12h time, abbrev + IANA city.
 * e.g. "02 June 2026, 3:45 PM (PKT · Karachi)" with Asia/Karachi
 */
export function formatLeaveAppliedAt(
  value: string | Date | null | undefined,
  timeZone?: string | null,
  dateFormatPattern?: string | null,
): string {
  if (value == null || value === "") return "—";
  const d = value instanceof Date ? value : new Date(String(value).trim());
  if (Number.isNaN(d.getTime())) return "—";
  const tz = timeZone?.trim() || "UTC";
  const useUS = isUsDateOrder(dateFormatPattern);
  const when = d.toLocaleString(useUS ? "en-US" : "en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: tz,
  });
  const abbr = timezoneAbbr(tz, d);
  const city = timezoneCityLabel(tz);
  return `${when} (${abbr} · ${city})`;
}

/** Alias for system-wide instant display (same as leave applied_at). */
export const formatInstantDisplay = formatLeaveAppliedAt;

/**
 * Narrow list rows / cards: short date, 12h time, zone abbrev only.
 * e.g. "29 May, 7:24 PM · PKT"
 */
export function formatDateTimeCompact(
  value: string | Date | null | undefined,
  timeZone?: string | null,
  dateFormatPattern?: string | null,
): string {
  if (value == null || value === "") return "—";
  const d = value instanceof Date ? value : new Date(String(value).trim());
  if (Number.isNaN(d.getTime())) return "—";
  const tz = timeZone?.trim() || "UTC";
  const useUS = isUsDateOrder(dateFormatPattern);
  const now = new Date();
  const yearOpts = { year: "numeric" as const, timeZone: tz };
  const sameYear =
    d.toLocaleString("en-US", yearOpts) === now.toLocaleString("en-US", yearOpts);
  const datePart = d.toLocaleString(useUS ? "en-US" : "en-GB", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: tz,
  });
  const timePart = d.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: tz,
  });
  return `${datePart}, ${timePart} · ${timezoneAbbr(tz, d)}`;
}

/**
 * Time-of-day only with AM/PM and zone label.
 * e.g. "3:45 PM (PKT · Karachi)"
 */
export function formatTimeOnlyDisplay(
  value: string | Date | null | undefined,
  timeZone?: string | null,
): string {
  if (value == null || value === "") return "—";
  const d = value instanceof Date ? value : new Date(String(value).trim());
  if (Number.isNaN(d.getTime())) return "—";
  const tz = timeZone?.trim() || "UTC";
  const time = d.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: tz,
  });
  const abbr = timezoneAbbr(tz, d);
  const city = timezoneCityLabel(tz);
  return `${time} (${abbr} · ${city})`;
}
