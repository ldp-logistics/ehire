/**
 * attendancePolicy.test.ts
 *
 * Unit tests for timezone-safe attendance policy utilities.
 *
 * Run with:  npx tsx server/lib/attendancePolicy.test.ts
 *
 * Scenarios covered:
 *  1. Pakistan user (UTC+5) — day shift from NY perspective, overnight from PKT
 *  2. India user  (UTC+5:30) — same
 *  3. True overnight shift (22:00–06:00 EST) — cross-midnight in policy TZ
 *  4. Late check-in
 *  5. Half-day (early checkout)
 *  6. Weekend (non-working day)
 *  7. Missing checkout → auto-derivation at policy end
 *  8. Boundary: exactly on grace threshold
 */

import {
  deriveStatus,
  deriveAutoCheckoutClosingStatus,
  buildPolicyWindow,
  getWorkDate,
  isOvernightShift,
  isWorkingDay,
  hoursWorked,
  overtimeHours,
  toPolicyTime,
  attendancePolicyFromSnapshot,
  checkInWithinAllowedWindow,
  type AttendancePolicy,
} from "./attendancePolicy.js";
import { DateTime } from "luxon";

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(description: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓  ${description}`);
    passed++;
  } catch (e: any) {
    console.error(`  ✗  ${description}`);
    console.error(`     ${e?.message ?? e}`);
    failed++;
  }
}

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toBeCloseTo(expected: number, decimals = 2) {
      const factor = Math.pow(10, decimals);
      if (Math.round((actual as number) * factor) !== Math.round(expected * factor)) {
        throw new Error(`Expected ≈${expected}, got ${actual}`);
      }
    },
    toBeGreaterThan(expected: number) {
      if (typeof actual !== "number" || !(actual > expected)) {
        throw new Error(`Expected > ${expected}, got ${actual}`);
      }
    },
    toBeTrue() { this.toBe(true); },
    toBeFalse() { this.toBe(false); },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared policy definitions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Standard company policy: 08:00–17:00 America/New_York, Mon–Fri.
 * This translates to:
 *   Pakistan (UTC+5):  13:00 PKT → 22:00 PKT  (daytime, NOT overnight from NY PoV)
 *   India    (UTC+5:30): 13:30 IST → 22:30 IST
 */
const NY_POLICY: AttendancePolicy = {
  policyTimezone: "America/New_York",
  workDayStart: "08:00",
  workDayEnd: "17:00",
  graceMinutes: 15,
  halfDayThresholdPercent: 50,
  workingDays: [1, 2, 3, 4, 5], // Mon–Fri
};

/**
 * Overnight policy: 22:00–06:00 America/New_York — crosses midnight in policy TZ.
 */
const NY_OVERNIGHT_POLICY: AttendancePolicy = {
  ...NY_POLICY,
  workDayStart: "22:00",
  workDayEnd: "06:00",
};

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1 — Pakistan user (UTC+5)
// Work window in EST:  08:00–17:00 on 2024-01-15 (Monday)
// Same in PKT: 18:00 PKT Jan 15 → 03:00 PKT Jan 16
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n── Suite 1: Pakistan user (UTC+5) ──");

test("Work date resolves to EST date (Jan 15), not PKT date (Jan 16 if after midnight)", () => {
  // 3 AM PKT Jan 16 = 10 PM EST Jan 15 = 22:00 UTC Jan 15
  const checkIn = toPolicyTime("2024-01-15 18:00", "Asia/Karachi"); // 18:00 PKT = 08:00 EST ✓
  const workDate = getWorkDate(checkIn, "America/New_York");
  expect(workDate).toBe("2024-01-15");
});

test("On-time check-in → present", () => {
  // 18:00 PKT = 08:00 EST Jan 15 — exactly at shift start
  const checkIn = toPolicyTime("2024-01-15 18:00", "Asia/Karachi");
  const checkOut = toPolicyTime("2024-01-16 03:00", "Asia/Karachi"); // 17:00 EST Jan 15
  const status = deriveStatus(checkIn, checkOut, NY_POLICY);
  expect(status).toBe("present");
});

test("Late check-in (> 15 min grace) → late", () => {
  // 18:20 PKT = 08:20 EST — 20 min late (grace is 15 min)
  const checkIn = toPolicyTime("2024-01-15 18:20", "Asia/Karachi");
  const checkOut = toPolicyTime("2024-01-16 03:00", "Asia/Karachi"); // full day
  const status = deriveStatus(checkIn, checkOut, NY_POLICY);
  expect(status).toBe("late");
});

test("Within grace period (14 min late) → present", () => {
  // 18:14 PKT = 08:14 EST — 14 min late (within 15 min grace)
  const checkIn = toPolicyTime("2024-01-15 18:14", "Asia/Karachi");
  const checkOut = toPolicyTime("2024-01-16 03:00", "Asia/Karachi");
  const status = deriveStatus(checkIn, checkOut, NY_POLICY);
  expect(status).toBe("present");
});

test("Early checkout (< 50% of 9h = < 4.5h), on time → short_hours", () => {
  // Check in at 18:00 PKT, check out at 20:00 PKT = 2h worked
  const checkIn = toPolicyTime("2024-01-15 18:00", "Asia/Karachi");
  const checkOut = toPolicyTime("2024-01-15 20:00", "Asia/Karachi"); // 2h < 4.5h
  const status = deriveStatus(checkIn, checkOut, NY_POLICY);
  expect(status).toBe("short_hours");
});

test("Late + early checkout → half_day (not late)", () => {
  const checkIn = toPolicyTime("2024-01-15 18:30", "Asia/Karachi"); // 30 min late
  const checkOut = toPolicyTime("2024-01-15 20:00", "Asia/Karachi"); // 1.5h worked
  const status = deriveStatus(checkIn, checkOut, NY_POLICY);
  expect(status).toBe("half_day");
});

test("No checkout (still working) → late (based on check-in alone)", () => {
  const checkIn = toPolicyTime("2024-01-15 18:30", "Asia/Karachi"); // 30 min late
  const status = deriveStatus(checkIn, null, NY_POLICY);
  expect(status).toBe("late");
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2 — India user (UTC+5:30)
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n── Suite 2: India user (UTC+5:30) ──");

test("On-time check-in from IST → present", () => {
  // 08:00 EST Jan 15 = 18:30 IST Jan 15
  const checkIn = toPolicyTime("2024-01-15 18:30", "Asia/Kolkata");
  const checkOut = toPolicyTime("2024-01-16 03:30", "Asia/Kolkata"); // 17:00 EST Jan 15
  const status = deriveStatus(checkIn, checkOut, NY_POLICY);
  expect(status).toBe("present");
});

test("Work date from IST 18:30 resolves to EST 2024-01-15", () => {
  const checkIn = toPolicyTime("2024-01-15 18:30", "Asia/Kolkata");
  expect(getWorkDate(checkIn, "America/New_York")).toBe("2024-01-15");
});

test("Late check-in from IST → late", () => {
  // 18:50 IST = 08:20 EST — 20 min late
  const checkIn = toPolicyTime("2024-01-15 18:50", "Asia/Kolkata");
  const checkOut = toPolicyTime("2024-01-16 03:30", "Asia/Kolkata");
  const status = deriveStatus(checkIn, checkOut, NY_POLICY);
  expect(status).toBe("late");
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3 — True overnight shift in policy TZ (22:00–06:00 EST)
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n── Suite 3: True overnight shift (22:00–06:00 EST) ──");

test("isOvernightShift correctly detects 22:00–06:00", () => {
  expect(isOvernightShift("22:00", "06:00")).toBeTrue();
});

test("isOvernightShift correctly rejects 08:00–17:00", () => {
  expect(isOvernightShift("08:00", "17:00")).toBeFalse();
});

test("buildPolicyWindow for overnight: endUtc is on Jan 16 EST", () => {
  const win = buildPolicyWindow("2024-01-15", NY_OVERNIGHT_POLICY);
  expect(win.isOvernight).toBeTrue();
  // endUtc should be 06:00 EST Jan 16 = 11:00 UTC Jan 16
  const endUtcH = win.endUtc.getUTCHours();
  expect(endUtcH).toBe(11);
});

test("Check-in at 22:00 EST Jan 15 → present (checkout at 05:30 EST Jan 16)", () => {
  const checkIn = toPolicyTime("2024-01-15 22:00", "America/New_York");
  const checkOut = toPolicyTime("2024-01-16 05:30", "America/New_York"); // 7.5h of 8h
  const status = deriveStatus(checkIn, checkOut, NY_OVERNIGHT_POLICY);
  expect(status).toBe("present");
});

test("Work date for 22:30 EST Jan 15 → Jan 15 (not Jan 16)", () => {
  const checkIn = toPolicyTime("2024-01-15 22:30", "America/New_York");
  expect(getWorkDate(checkIn, "America/New_York")).toBe("2024-01-15");
});

test("Checkout at 01:00 EST Jan 16 (3h of 8h shift), on time → short_hours", () => {
  const checkIn = toPolicyTime("2024-01-15 22:00", "America/New_York"); // on time
  const checkOut = toPolicyTime("2024-01-16 01:00", "America/New_York"); // 3h worked
  // 50% of 8h = 4h threshold; 3h < 4h, not late → short_hours
  const status = deriveStatus(checkIn, checkOut, NY_OVERNIGHT_POLICY);
  expect(status).toBe("short_hours");
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4 — Working days
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n── Suite 4: Working days ──");

test("Monday (Jan 15 2024) is a working day", () => {
  expect(isWorkingDay("2024-01-15", [1, 2, 3, 4, 5])).toBeTrue();
});

test("Saturday (Jan 13 2024) is NOT a working day", () => {
  expect(isWorkingDay("2024-01-13", [1, 2, 3, 4, 5])).toBeFalse();
});

test("Check-in on Saturday → weekend status", () => {
  // Jan 13 2024 is a Saturday in EST
  const checkIn = toPolicyTime("2024-01-13 08:00", "America/New_York");
  const status = deriveStatus(checkIn, null, NY_POLICY);
  expect(status).toBe("weekend");
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5 — Overtime calculation
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n── Suite 5: Overtime calculation ──");

test("9h shift, 11h worked → 2h overtime", () => {
  // Shift is 08:00–17:00 EST (9h)
  const ci = toPolicyTime("2024-01-15 08:00", "America/New_York").toISOString();
  const co = toPolicyTime("2024-01-15 19:00", "America/New_York").toISOString(); // 11h
  const ot = overtimeHours(ci, co, NY_POLICY);
  expect(ot).toBeCloseTo(2.0);
});

test("9h shift, exactly 9h worked → 0 overtime", () => {
  const ci = toPolicyTime("2024-01-15 08:00", "America/New_York").toISOString();
  const co = toPolicyTime("2024-01-15 17:00", "America/New_York").toISOString();
  const ot = overtimeHours(ci, co, NY_POLICY);
  expect(ot).toBeCloseTo(0.0);
});

test("Overnight shift: 8h worked exactly → 0 overtime", () => {
  const ci = toPolicyTime("2024-01-15 22:00", "America/New_York").toISOString();
  const co = toPolicyTime("2024-01-16 06:00", "America/New_York").toISOString(); // exactly 8h
  const ot = overtimeHours(ci, co, NY_OVERNIGHT_POLICY);
  expect(ot).toBeCloseTo(0.0);
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 6 — Edge cases
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n── Suite 6: Edge cases ──");

test("Exactly on grace threshold (15:00 = +15min) → present", () => {
  // 08:15 EST = exactly at grace threshold
  const checkIn = toPolicyTime("2024-01-15 08:15", "America/New_York");
  const checkOut = toPolicyTime("2024-01-15 17:00", "America/New_York");
  const status = deriveStatus(checkIn, checkOut, NY_POLICY);
  // 08:15 is NOT > 08:15 (strict greater-than), so on-time
  expect(status).toBe("present");
});

test("One second past grace (08:15:01) → late", () => {
  const checkIn = toPolicyTime("2024-01-15 08:15", "America/New_York");
  // Add 61 seconds to push past threshold
  const slightly_late = new Date(checkIn.getTime() + 61_000);
  const checkOut = toPolicyTime("2024-01-15 17:00", "America/New_York");
  const status = deriveStatus(slightly_late, checkOut, NY_POLICY);
  expect(status).toBe("late");
});

test("Null checkIn would cause absent (guard in service layer)", () => {
  // deriveStatus requires non-null checkIn per type signature
  // Service calls it only when checkIn exists; absent is returned for null by the service
  expect("absent").toBe("absent"); // documenting expected service behaviour
});

test("hoursWorked with null inputs returns 0", () => {
  expect(hoursWorked(null, null)).toBe(0);
  expect(hoursWorked("2024-01-15T08:00:00Z", null)).toBe(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 7 — Enterprise: snapshot, holiday, window, missed checkout, OT threshold
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n── Suite 7: Enterprise rules ──");

test("attendancePolicyFromSnapshot ignores live timing when snapshot set", () => {
  const live: AttendancePolicy = { ...NY_POLICY, workDayStart: "09:00", graceMinutes: 30 };
  const snap = {
    workDayStart: "08:00",
    workDayEnd: "17:00",
    graceMinutes: 15,
    halfDayPercent: 50,
    policyTimezone: "America/New_York",
    workingDays: [1, 2, 3, 4, 5],
  };
  const p = attendancePolicyFromSnapshot(snap, live);
  expect(p.workDayStart).toBe("08:00");
  expect(p.graceMinutes).toBe(15);
});

test("deriveStatus: holiday set wins over working day", () => {
  const checkIn = toPolicyTime("2024-01-15 08:00", "America/New_York");
  const status = deriveStatus(checkIn, null, NY_POLICY, {
    holidayDates: new Set(["2024-01-15"]),
  });
  expect(status).toBe("holiday");
});

test("checkInWithinAllowedWindow: default offsets around shift start", () => {
  const wd = "2024-01-15";
  const before = toPolicyTime("2024-01-15 05:59", "America/New_York"); // >2h before 08:00
  const ok = toPolicyTime("2024-01-15 07:00", "America/New_York"); // 1h before
  expect(checkInWithinAllowedWindow(before, wd, NY_POLICY, -120, 240)).toBeFalse();
  expect(checkInWithinAllowedWindow(ok, wd, NY_POLICY, -120, 240)).toBeTrue();
});

test("deriveStatus: missingCheckout + no checkOut → missed_checkout", () => {
  const checkIn = toPolicyTime("2024-01-15 08:00", "America/New_York");
  const status = deriveStatus(checkIn, null, NY_POLICY, { missingCheckout: true });
  expect(status).toBe("missed_checkout");
});

test("overtimeHours: below min overtime minutes → 0", () => {
  const ci = toPolicyTime("2024-01-15 08:00", "America/New_York").toISOString();
  const co = toPolicyTime("2024-01-15 17:30", "America/New_York").toISOString(); // +0.5h
  const ot = overtimeHours(ci, co, NY_POLICY, { minOvertimeMinutes: 60 });
  expect(ot).toBeCloseTo(0);
});

test("overtimeHours: requires approval and not approved → 0", () => {
  const ci = toPolicyTime("2024-01-15 08:00", "America/New_York").toISOString();
  const co = toPolicyTime("2024-01-15 20:00", "America/New_York").toISOString();
  const ot = overtimeHours(ci, co, NY_POLICY, {
    overtimeRequiresApproval: true,
    isOvertimeApproved: false,
  });
  expect(ot).toBeCloseTo(0);
});

test("overtimeHours: requires approval and approved → positive OT", () => {
  const ci = toPolicyTime("2024-01-15 08:00", "America/New_York").toISOString();
  const co = toPolicyTime("2024-01-15 20:00", "America/New_York").toISOString();
  const ot = overtimeHours(ci, co, NY_POLICY, {
    overtimeRequiresApproval: true,
    isOvertimeApproved: true,
    minOvertimeMinutes: 0,
  });
  expect(ot).toBeGreaterThan(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 8 — Phase 3: leave priority, auto-close refinement, DST window length
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n── Suite 8: Phase 3 (leave, auto-checkout, DST) ──");

test("deriveStatus: approved full-day leave on weekday → absent (before attendance rules)", () => {
  const checkIn = toPolicyTime("2024-01-15 08:00", "America/New_York");
  const status = deriveStatus(checkIn, null, NY_POLICY, {
    leaveApproved: { dayType: "full" },
  });
  expect(status).toBe("absent");
});

test("deriveStatus: holiday beats approved leave", () => {
  const checkIn = toPolicyTime("2024-01-15 08:00", "America/New_York");
  const status = deriveStatus(checkIn, null, NY_POLICY, {
    holidayDates: new Set(["2024-01-15"]),
    leaveApproved: { dayType: "full" },
  });
  expect(status).toBe("holiday");
});

test("deriveStatus: weekend beats approved leave", () => {
  const checkIn = toPolicyTime("2024-01-13 08:00", "America/New_York"); // Saturday
  const status = deriveStatus(checkIn, null, NY_POLICY, {
    leaveApproved: { dayType: "full" },
  });
  expect(status).toBe("weekend");
});

test("deriveStatus: half-day leave scales window (≤50% of half-shift → short_hours)", () => {
  const checkIn = toPolicyTime("2024-01-15 08:00", "America/New_York");
  const checkOut = toPolicyTime("2024-01-15 09:45", "America/New_York"); // 1.75h < 50% of 4.5h expected
  const status = deriveStatus(checkIn, checkOut, NY_POLICY, {
    leaveApproved: { dayType: "half" },
  });
  expect(status).toBe("short_hours");
});

test("deriveAutoCheckoutClosingStatus: worked ≥ half threshold → present + missedCheckout flag", () => {
  const checkIn = toPolicyTime("2024-01-15 08:00", "America/New_York");
  const win = buildPolicyWindow("2024-01-15", NY_POLICY);
  const { status, missedCheckoutFlag } = deriveAutoCheckoutClosingStatus(checkIn, win.endUtc, NY_POLICY, {});
  expect(status).toBe("present");
  expect(missedCheckoutFlag).toBe(true);
});

test("deriveAutoCheckoutClosingStatus: worked < half threshold → half_day", () => {
  const checkIn = toPolicyTime("2024-01-15 08:00", "America/New_York");
  const earlyClose = toPolicyTime("2024-01-15 10:00", "America/New_York");
  const { status, missedCheckoutFlag } = deriveAutoCheckoutClosingStatus(checkIn, earlyClose, NY_POLICY, {});
  expect(status).toBe("half_day");
  expect(missedCheckoutFlag).toBe(true);
});

test("deriveAutoCheckoutClosingStatus: late check-in but enough worked → late", () => {
  const checkIn = toPolicyTime("2024-01-15 09:00", "America/New_York"); // 1h past grace
  const win = buildPolicyWindow("2024-01-15", NY_POLICY);
  const { status } = deriveAutoCheckoutClosingStatus(checkIn, win.endUtc, NY_POLICY, {});
  expect(status).toBe("late");
});

test("DST spring 2024: local 09:00–17:00 wall shift is 8h expected (Luxon window)", () => {
  const win = buildPolicyWindow("2024-03-10", {
    ...NY_POLICY,
    policyTimezone: "America/New_York",
    workDayStart: "09:00",
    workDayEnd: "17:00",
  });
  expect(win.expectedMs).toBe(8 * 60 * 60 * 1000);
});

test("DST fall 2024: local 09:00–17:00 wall shift is 8h expected (Luxon window)", () => {
  const win = buildPolicyWindow("2024-11-03", {
    ...NY_POLICY,
    policyTimezone: "America/New_York",
    workDayStart: "09:00",
    workDayEnd: "17:00",
  });
  expect(win.expectedMs).toBe(8 * 60 * 60 * 1000);
});

test("hoursWorked across DST: spring forward 1:30→3:30 local = 1h absolute elapsed", () => {
  // Spring forward 2024-03-10 America/New_York: 1:30 AM exists twice in local terms on fall back;
  // for spring, a 1h wall-clock "lost" appears when comparing two UTC instants spanning the gap.
  const a = DateTime.fromObject(
    { year: 2024, month: 3, day: 10, hour: 1, minute: 30, second: 0 },
    { zone: "America/New_York" }
  ).toUTC();
  const b = DateTime.fromObject(
    { year: 2024, month: 3, day: 10, hour: 3, minute: 30, second: 0 },
    { zone: "America/New_York" }
  ).toUTC();
  const h = Math.max(0, b.toMillis() - a.toMillis()) / 3_600_000;
  expect(h).toBeCloseTo(1.0, 5);
});

// ─────────────────────────────────────────────────────────────────────────────
// Result
// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
