/**
 * Formats interview/meeting times for email templates using an explicit IANA timezone.
 * Interview scheduling passes the zone chosen in the schedule dialog (PKT / US Eastern / IST).
 */

import { DateTime } from "luxon";

/** Allowed IANA zones for recruitment interview scheduling (UI + API validation). */
export const INTERVIEW_SCHEDULE_IANA_OPTIONS = [
  { value: "Asia/Karachi", label: "Pakistan (PKT)" },
  { value: "America/New_York", label: "US Eastern (ET)" },
  { value: "Asia/Kolkata", label: "India (IST)" },
] as const;

const INTERVIEW_IANA_SET = new Set<string>(INTERVIEW_SCHEDULE_IANA_OPTIONS.map((o) => o.value));

export type InterviewScheduleIana = (typeof INTERVIEW_SCHEDULE_IANA_OPTIONS)[number]["value"];

export function resolveInterviewScheduleIana(raw: string | undefined | null): InterviewScheduleIana {
  const t = (raw ?? "").trim();
  if (INTERVIEW_IANA_SET.has(t)) return t as InterviewScheduleIana;
  return "Asia/Karachi";
}

/** Outlook/Teams Graph events use US Eastern wall-clock (org default); emails keep scheduler-selected zone. */
export const INTERVIEW_OUTLOOK_CALENDAR_IANA =
  (process.env.INTERVIEW_CALENDAR_OUTLOOK_IANA?.trim() || "America/New_York") as InterviewScheduleIana;

const DEFAULT_INTERVIEW_DURATION_MS = 60 * 60 * 1000;

function parseWallDateTime(wallDate: string, wallTime: string, iana: InterviewScheduleIana): Date | null {
  const timePart = wallTime.length === 5 ? `${wallTime}:00` : wallTime;
  const dt = DateTime.fromISO(`${wallDate}T${timePart}`, { zone: iana });
  if (!dt.isValid) return null;
  return dt.toUTC().toJSDate();
}

/**
 * Parses wall date + start/end times in the given IANA zone, or falls back to legacy `scheduledAt` ISO.
 * When end time is omitted, defaults to start + 1 hour.
 */
export function tryParseInterviewScheduleInstant(input: {
  scheduledWallDate?: string | undefined;
  scheduledWallTime?: string | undefined;
  scheduledWallTimeEnd?: string | undefined;
  ianaTimezone?: string | undefined;
  scheduledAt?: string | undefined;
}): { start: Date; end: Date; iana: InterviewScheduleIana } | null {
  const wallDate = input.scheduledWallDate?.trim();
  const wallTime = input.scheduledWallTime?.trim();
  const wallTimeEnd = input.scheduledWallTimeEnd?.trim();
  const iana = resolveInterviewScheduleIana(input.ianaTimezone);

  if (wallDate && wallTime) {
    const start = parseWallDateTime(wallDate, wallTime, iana);
    if (!start) return null;
    if (wallTimeEnd) {
      const end = parseWallDateTime(wallDate, wallTimeEnd, iana);
      if (!end) return null;
      return { start, end, iana };
    }
    return { start, end: new Date(start.getTime() + DEFAULT_INTERVIEW_DURATION_MS), iana };
  }

  const legacy = input.scheduledAt?.trim();
  if (legacy) {
    const d = new Date(legacy);
    if (Number.isNaN(d.getTime())) return null;
    return { start: d, end: new Date(d.getTime() + DEFAULT_INTERVIEW_DURATION_MS), iana };
  }

  return null;
}

export function assertInterviewScheduleEndAfterStart(parsed: { start: Date; end: Date }): string | null {
  if (parsed.end.getTime() <= parsed.start.getTime()) {
    return "End time must be after start time.";
  }
  return null;
}

function formatTimeZoneShort(d: Date, iana: string): string {
  for (const style of ["shortGeneric", "short"] as const) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: iana, timeZoneName: style }).formatToParts(d);
      const v = parts.find((p) => p.type === "timeZoneName")?.value;
      if (v) return v;
    } catch {
      /* ignore */
    }
  }
  return iana.split("/").pop()?.replace(/_/g, " ") ?? iana;
}

function formatTimeZoneLong(d: Date, iana: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: iana, timeZoneName: "long" }).formatToParts(d);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? iana;
  } catch {
    return iana;
  }
}

function formatWallTimeOnly(d: Date, tz: string): string {
  return d.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: tz,
  });
}

/** Fields for recruitment interview email placeholders (notify + template preview). */
export function buildInterviewScheduleTimeFields(start: Date, end: Date, ianaTimeZone: string): Record<string, string> {
  const tz = (ianaTimeZone || "UTC").trim() || "UTC";
  const o = { timeZone: tz } as const;
  const tzShort = formatTimeZoneShort(start, tz);
  const tzLong = formatTimeZoneLong(start, tz);

  const year = start.toLocaleString("en-US", { year: "numeric", ...o });
  const month = start.toLocaleString("en-US", { month: "short", ...o }).toUpperCase();
  const day = start.toLocaleString("en-US", { day: "numeric", ...o });
  const weekday = start.toLocaleString("en-US", { weekday: "short", ...o });
  const timeStart = formatWallTimeOnly(start, tz);
  const timeEnd = formatWallTimeOnly(end, tz);
  const timeRange = `${timeStart} – ${timeEnd} (${tzShort})`;

  const dateLong = start.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    ...o,
  });
  const interview_datetime = `${dateLong}, ${timeStart} – ${timeEnd} (${tzShort})`;

  return {
    interview_year: year,
    interview_month: month,
    interview_day: day,
    interview_weekday: weekday,
    interview_time: timeRange,
    interview_time_start: `${timeStart} (${tzShort})`,
    interview_time_end: `${timeEnd} (${tzShort})`,
    interview_time_range: timeRange,
    interview_datetime,
    interview_timezone: `${tzLong} (${tzShort})`,
    interview_timezone_short: tzShort,
    interview_timezone_long: tzLong,
    interview_timezone_iana: tz,
  };
}

/** Same shape for company.meeting.* templates. */
export function buildMeetingTimeFields(start: Date, ianaTimeZone: string): Record<string, string> {
  const tz = (ianaTimeZone || "UTC").trim() || "UTC";
  const o = { timeZone: tz } as const;
  const tzShort = formatTimeZoneShort(start, tz);
  const tzLong = formatTimeZoneLong(start, tz);

  const year = start.toLocaleString("en-US", { year: "numeric", ...o });
  const month = start.toLocaleString("en-US", { month: "short", ...o }).toUpperCase();
  const day = start.toLocaleString("en-US", { day: "numeric", ...o });
  const weekday = start.toLocaleString("en-US", { weekday: "short", ...o });
  const timeOnly = start.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    ...o,
  });

  const meeting_datetime =
    start.toLocaleString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      ...o,
    }) + ` (${tzShort})`;

  return {
    meeting_year: year,
    meeting_month: month,
    meeting_day: day,
    meeting_weekday: weekday,
    meeting_time: `${timeOnly} (${tzShort})`,
    meeting_datetime,
    meeting_timezone: `${tzLong} (${tzShort})`,
    meeting_timezone_short: tzShort,
    meeting_timezone_long: tzLong,
    meeting_timezone_iana: tz,
  };
}
