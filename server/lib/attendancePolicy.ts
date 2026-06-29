/**
 * attendancePolicy.ts
 *
 * Policy TZ is the source of truth. Wall-clock ↔ UTC uses Luxon for correct DST behavior.
 * Status priority: HOLIDAY > WEEKEND > LEAVE > attendance rules.
 */

import { DateTime } from "luxon";
import { format, toZonedTime } from "date-fns-tz";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface AttendancePolicy {
  policyTimezone: string;
  workDayStart: string;
  workDayEnd: string;
  graceMinutes: number;
  halfDayThresholdPercent: number;
  workingDays: number[];
}

export interface PolicySnapshot {
  workDayStart: string;
  workDayEnd: string;
  graceMinutes: number;
  halfDayPercent: number;
  policyTimezone?: string;
  workingDays?: number[];
}

export interface OrgTimingExtensions {
  checkinWindowStartOffsetMinutes: number;
  checkinWindowEndOffsetMinutes: number;
  minOvertimeMinutes: number;
  overtimeRequiresApproval: boolean;
  autoCheckoutBufferMinutes: number;
}

export type ResolvedOrgPolicy = AttendancePolicy & OrgTimingExtensions & { policyRowId: string };

export interface PolicyWindow {
  workDate: string;
  startUtc: Date;
  endUtc: Date;
  graceThresholdUtc: Date;
  expectedMs: number;
  halfDayThresholdMs: number;
  isOvernight: boolean;
}

export type PolicyWindowCache = Map<string, PolicyWindow>;

export type AttendanceStatus =
  | "present"
  | "late"
  | "half_day"
  | "absent"
  | "weekend"
  | "holiday"
  | "short_hours"
  | "missed_checkout"
  | "invalid_punch";

export type DeriveStatusOptions = {
  holidayDates?: Set<string>;
  missingCheckout?: boolean;
  /** Approved leave from leave_requests (single row per day); FULL_DAY blocks normal attendance semantics */
  leaveApproved?: { dayType: "full" | "half" } | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// SNAPSHOT ↔ POLICY
// ─────────────────────────────────────────────────────────────────────────────

function timeStr(t: string | null | undefined): string {
  if (!t) return "09:00";
  const s = String(t);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

export function buildPolicySnapshot(policy: AttendancePolicy): PolicySnapshot {
  return {
    workDayStart: policy.workDayStart,
    workDayEnd: policy.workDayEnd,
    graceMinutes: policy.graceMinutes,
    halfDayPercent: policy.halfDayThresholdPercent,
    policyTimezone: policy.policyTimezone,
    workingDays: [...policy.workingDays],
  };
}

export function attendancePolicyFromSnapshot(
  snapshot: PolicySnapshot | null | undefined,
  live: AttendancePolicy
): AttendancePolicy {
  if (!snapshot) return live;
  const wd = snapshot.workingDays;
  return {
    policyTimezone: snapshot.policyTimezone?.trim() || live.policyTimezone,
    workDayStart: timeStr(snapshot.workDayStart),
    workDayEnd: timeStr(snapshot.workDayEnd),
    graceMinutes: Number(snapshot.graceMinutes ?? live.graceMinutes),
    halfDayThresholdPercent: Number(
      snapshot.halfDayPercent ?? live.halfDayThresholdPercent
    ),
    workingDays:
      Array.isArray(wd) && wd.length > 0 ? wd.map(Number).filter((n) => n >= 0 && n <= 6) : live.workingDays,
  };
}

export function makePolicyWindowCache(): PolicyWindowCache {
  return new Map();
}

function cacheKey(workDate: string, pol: AttendancePolicy, leaveHalf: boolean): string {
  return `${workDate}\t${pol.policyTimezone}\t${pol.workDayStart}\t${pol.workDayEnd}\t${pol.graceMinutes}\t${pol.halfDayThresholdPercent}\t${leaveHalf ? "h" : "f"}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DATE / WINDOW (Luxon — DST-safe)
// ─────────────────────────────────────────────────────────────────────────────

export function getWorkDate(utcInstant: Date, policyTz: string): string {
  const d = DateTime.fromJSDate(utcInstant, { zone: "utc" }).setZone(policyTz);
  return d.toISODate() ?? "";
}

export function getWorkDateNow(policy: Pick<AttendancePolicy, "policyTimezone">): string {
  return getWorkDate(new Date(), policy.policyTimezone);
}

export function shiftDate(dateStr: string, days: number): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const dt = DateTime.utc(y, mo, d).plus({ days });
  return dt.toISODate() ?? dateStr;
}

export function isOvernightShift(workDayStart: string, workDayEnd: string): boolean {
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };
  return toMin(workDayEnd) <= toMin(workDayStart);
}

export function isWorkingDay(workDate: string, workingDays: number[]): boolean {
  const [y, mo, d] = workDate.split("-").map(Number);
  const luxDow = DateTime.utc(y, mo, d).weekday; // Mon=1 … Sun=7
  const jsDow = luxDow === 7 ? 0 : luxDow;
  return workingDays.includes(jsDow);
}

export function workingDaysFromWeeklyPattern(pattern: boolean[] | null | undefined): number[] {
  if (!Array.isArray(pattern) || pattern.length < 7) return [1, 2, 3, 4, 5];
  const order = [1, 2, 3, 4, 5, 6, 0];
  const out: number[] = [];
  for (let i = 0; i < 7; i++) if (pattern[i]) out.push(order[i]);
  return out.length ? out.sort((a, b) => a - b) : [1, 2, 3, 4, 5];
}

/** Expected window in policy zone; duration uses Luxon diff (DST-safe). */
export function buildPolicyWindow(workDate: string, policy: AttendancePolicy): PolicyWindow {
  const zone = policy.policyTimezone;
  const [y, m, d] = workDate.split("-").map(Number);
  const [sh, sm] = policy.workDayStart.split(":").map(Number);
  const [eh, em] = policy.workDayEnd.split(":").map(Number);
  let start = DateTime.fromObject(
    { year: y, month: m, day: d, hour: sh, minute: sm, second: 0 },
    { zone }
  );
  let end = DateTime.fromObject(
    { year: y, month: m, day: d, hour: eh, minute: em, second: 0 },
    { zone }
  );
  const overnight = end <= start;
  if (overnight) end = end.plus({ days: 1 });
  const expectedMs = end.toMillis() - start.toMillis();
  const halfDayThresholdMs = (policy.halfDayThresholdPercent / 100) * expectedMs;
  const graceThresholdUtc = start
    .plus({ minutes: Math.max(0, policy.graceMinutes) })
    .toUTC()
    .toJSDate();
  return {
    workDate,
    startUtc: start.toUTC().toJSDate(),
    endUtc: end.toUTC().toJSDate(),
    graceThresholdUtc,
    expectedMs,
    halfDayThresholdMs,
    isOvernight: overnight,
  };
}

/** Half-day approved leave → 50% expected duration (threshold & OT baseline scale). */
export function scaleWindowForHalfDayLeave(win: PolicyWindow, policy: AttendancePolicy): PolicyWindow {
  const expectedMs = win.expectedMs * 0.5;
  return {
    ...win,
    expectedMs,
    halfDayThresholdMs: (policy.halfDayThresholdPercent / 100) * expectedMs,
  };
}

export function getPolicyWindow(
  workDate: string,
  policy: AttendancePolicy,
  cache?: PolicyWindowCache,
  leaveHalf = false
): PolicyWindow {
  const base = buildPolicyWindow(workDate, policy);
  const w = leaveHalf ? scaleWindowForHalfDayLeave(base, policy) : base;
  const key = cacheKey(workDate, policy, leaveHalf);
  if (cache?.has(key)) return cache.get(key)!;
  cache?.set(key, w);
  return w;
}

export function checkInWithinAllowedWindow(
  checkInUtc: Date,
  workDate: string,
  policy: AttendancePolicy,
  startOffsetMin: number,
  endOffsetMin: number,
  cache?: PolicyWindowCache
): boolean {
  const win = getPolicyWindow(workDate, policy, cache, false);
  const startLux = DateTime.fromJSDate(win.startUtc, { zone: "utc" });
  const earliest = startLux.plus({ minutes: startOffsetMin }).toJSDate();
  const latest = startLux.plus({ minutes: endOffsetMin }).toJSDate();
  return checkInUtc >= earliest && checkInUtc <= latest;
}

// ─────────────────────────────────────────────────────────────────────────────
// deriveStatus — priority HOLIDAY > WEEKEND > LEAVE > rules
// ─────────────────────────────────────────────────────────────────────────────

export function deriveStatus(
  checkIn: Date,
  checkOut: Date | null,
  policy: AttendancePolicy,
  options?: DeriveStatusOptions
): AttendanceStatus {
  const workDate = getWorkDate(checkIn, policy.policyTimezone);
  const holidays = options?.holidayDates;
  if (holidays?.has(workDate)) return "holiday";
  if (!isWorkingDay(workDate, policy.workingDays)) return "weekend";
  if (options?.leaveApproved?.dayType === "full") return "absent";

  const leaveHalf = options?.leaveApproved?.dayType === "half";

  if (options?.missingCheckout === true && checkOut == null) return "missed_checkout";

  const win = getPolicyWindow(workDate, policy, undefined, leaveHalf);
  const workedMs =
    checkOut != null ? Math.max(0, checkOut.getTime() - checkIn.getTime()) : 0;
  const isLate = checkIn > win.graceThresholdUtc;
  const isShortDay = checkOut != null && workedMs < win.halfDayThresholdMs;

  if (isLate && isShortDay) return "half_day";
  if (!isLate && isShortDay) return "short_hours";
  if (isLate) return "late";
  return "present";
}

/**
 * Auto-close at policy end: payroll-friendly status (not hard-coded missed_checkout),
 * with missedCheckoutFlag stored on row.
 */
export function deriveAutoCheckoutClosingStatus(
  checkIn: Date,
  closingUtc: Date,
  policy: AttendancePolicy,
  options?: DeriveStatusOptions
): { status: AttendanceStatus; missedCheckoutFlag: boolean } {
  const workDate = getWorkDate(checkIn, policy.policyTimezone);
  const holidays = options?.holidayDates;
  if (holidays?.has(workDate)) return { status: "holiday", missedCheckoutFlag: true };
  if (!isWorkingDay(workDate, policy.workingDays)) return { status: "weekend", missedCheckoutFlag: true };
  if (options?.leaveApproved?.dayType === "full") return { status: "absent", missedCheckoutFlag: true };

  const leaveHalf = options?.leaveApproved?.dayType === "half";
  let win = getPolicyWindow(workDate, policy, undefined, leaveHalf);
  const workedMs = Math.max(0, closingUtc.getTime() - checkIn.getTime());
  if (workedMs >= win.halfDayThresholdMs) {
    const isLate = checkIn > win.graceThresholdUtc;
    return { status: isLate ? "late" : "present", missedCheckoutFlag: true };
  }
  return { status: "half_day", missedCheckoutFlag: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORTING (Luxon diff for duration)
// ─────────────────────────────────────────────────────────────────────────────

/** Neon/pg may return `timestamptz` as JS Date; JSON uses ISO strings. Luxon needs a string or JSDate. */
function coerceUtcInstant(v: string | Date | null | undefined): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  return null;
}

export function hoursWorked(
  checkIn: string | Date | null | undefined,
  checkOut: string | Date | null | undefined
): number {
  const aIso = coerceUtcInstant(checkIn);
  const bIso = coerceUtcInstant(checkOut);
  if (!aIso || !bIso) return 0;
  const a = DateTime.fromISO(aIso, { zone: "utc" });
  const b = DateTime.fromISO(bIso, { zone: "utc" });
  if (!a.isValid || !b.isValid) return 0;
  return Math.max(0, b.diff(a, "hours").hours);
}

export function overtimeHours(
  checkIn: string | Date | null | undefined,
  checkOut: string | Date | null | undefined,
  policy: AttendancePolicy,
  opts?: {
    minOvertimeMinutes?: number;
    overtimeRequiresApproval?: boolean;
    isOvertimeApproved?: boolean;
    cache?: PolicyWindowCache;
    /** Approved half-day leave → expected shift length halved for OT baseline */
    leaveHalfDay?: boolean;
  }
): number {
  if (!checkIn || !checkOut) return 0;
  const minOtMin = opts?.minOvertimeMinutes ?? 0;
  const requiresApproval = opts?.overtimeRequiresApproval ?? false;
  const approved = opts?.isOvertimeApproved ?? false;
  if (requiresApproval && !approved) return 0;

  const worked = hoursWorked(checkIn, checkOut);
  const workDate = getWorkDate(new Date(checkIn), policy.policyTimezone);
  const win = getPolicyWindow(workDate, policy, opts?.cache, opts?.leaveHalfDay === true);
  const shiftH = win.expectedMs / 3_600_000;
  const rawOt = Math.max(0, worked - shiftH);
  const minOtH = minOtMin / 60;
  if (rawOt > 0 && rawOt < minOtH) return 0;
  return rawOt;
}

export function formatForDisplay(
  utcDate: Date | string | null | undefined,
  displayTz: string,
  fmt = "hh:mm a"
): string {
  if (utcDate == null || utcDate === "") return "—";
  const d = typeof utcDate === "string" ? new Date(utcDate) : utcDate;
  if (isNaN(d.getTime())) return "—";
  const zoned = toZonedTime(d, displayTz);
  return format(zoned, fmt);
}

/** Test helper: wall clock in zone → UTC Date (Luxon). */
export function toPolicyTime(wallClock: string, timezone: string): Date {
  const normalised = wallClock.replace(" ", "T").replace(/T(\d:\d)$/, "T0$1");
  const [datePart, timePart] = normalised.split("T");
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, m] = timePart.split(":").map(Number);
  const dt = DateTime.fromObject(
    { year: y, month: mo, day: d, hour: h, minute: m, second: 0 },
    { zone: timezone }
  );
  return dt.toUTC().toJSDate();
}
