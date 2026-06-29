import { AttendanceRepository } from "./AttendanceRepository.js";
import { NotFoundError, ValidationError, ConflictError, ForbiddenError } from "../../core/types/index.js";
import { appendAuditLog, type AuditRequestMeta } from "../../lib/auditAppend.js";
import { memCache } from "../../lib/perf.js";
import { effectiveRegionsFor, getEmployeeRegion } from "../../lib/regionAccess.js";
import { getPolicyForUser } from "./policyResolver.js";
import {
  type AttendancePolicy,
  type PolicySnapshot,
  type ResolvedOrgPolicy,
  attendancePolicyFromSnapshot,
  buildPolicySnapshot,
  checkInWithinAllowedWindow,
  deriveAutoCheckoutClosingStatus,
  deriveStatus,
  getWorkDate,
  getWorkDateNow,
  getPolicyWindow,
  hoursWorked,
  isOvernightShift,
  makePolicyWindowCache,
  overtimeHours,
  shiftDate,
  workingDaysFromWeeklyPattern,
} from "../../lib/attendancePolicy.js";
import { attendanceRowSnapshot } from "../../lib/attendanceRowSnapshot.js";

const POLICY_CACHE_KEY = "timesheet:org-policy-bundle";
const POLICY_CACHE_TTL_MS = 30_000;
const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];

export type AttendanceRegionCtx = {
  isRegionalSuperAdmin?: boolean;
  regionCode?: string | null;
  requestedRegion?: string | null;
};

export type ReportPolicyMode = "snapshot_only" | "current_policy";

export function normalizeReportPolicyMode(raw: string | undefined | null): ReportPolicyMode {
  const s = String(raw || "").toLowerCase().trim();
  if (s === "current_policy") return "current_policy";
  return "snapshot_only";
}

/** Each key: `${employeeId}|${yyyy-mm-dd}` → approved leave day type */
function leaveLookupFromSpans(
  spans: { employee_id: string; start_date: unknown; end_date: unknown; day_type: string }[],
  from: string,
  to: string
): Map<string, "full" | "half"> {
  const m = new Map<string, "full" | "half">();
  const fromD = from.slice(0, 10);
  const toD = to.slice(0, 10);
  for (const s of spans) {
    const startNorm = pgDateToYyyyMmDd(s.start_date);
    const endNorm = pgDateToYyyyMmDd(s.end_date);
    if (!startNorm || !endNorm) continue;
    let d = startNorm;
    const end = endNorm;
    const half = s.day_type === "half";
    while (d <= end) {
      if (d >= fromD && d <= toD) {
        const k = `${s.employee_id}|${d}`;
        if (!m.has(k)) m.set(k, half ? "half" : "full");
      }
      d = shiftDate(d, 1);
    }
  }
  return m;
}

function timeStr(t: string | null | undefined): string {
  if (!t) return "09:00";
  const s = String(t);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

/** PG `date` / Neon may return string or Date — normalize for `yyyy-mm-dd` comparisons. */
function pgDateToYyyyMmDd(v: unknown): string | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v === "string") return v.slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function parseHHMM(raw: string): string {
  const parts = raw.trim().split(":");
  if (parts.length < 2 || parts.length > 3) throw new ValidationError("Time must be HH:mm (24-hour)");
  const h = parseInt(parts[0].trim(), 10);
  const m = parseInt(parts[1].trim(), 10);
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    throw new ValidationError("Invalid time; use 0–23 hours and 0–59 minutes");
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function normaliseWorkingDays(raw: unknown): number[] {
  if (!Array.isArray(raw) || raw.length === 0) return [...DEFAULT_WORKING_DAYS];
  return (raw as unknown[])
    .map(Number)
    .filter((n) => !Number.isNaN(n) && n >= 0 && n <= 6);
}

function normalisePolicyRow(row: Record<string, unknown> | null): AttendancePolicy {
  if (!row) {
    return {
      policyTimezone: "UTC",
      workDayStart: "09:00",
      workDayEnd: "18:00",
      graceMinutes: 15,
      halfDayThresholdPercent: 50,
      workingDays: [...DEFAULT_WORKING_DAYS],
    };
  }
  return {
    policyTimezone: (row.policy_timezone as string | null)?.trim() || "UTC",
    workDayStart: timeStr(row.work_day_start as string),
    workDayEnd: timeStr(row.work_day_end as string),
    graceMinutes: Number(row.grace_minutes ?? 15),
    halfDayThresholdPercent: Number(row.half_day_threshold_percent ?? 50),
    workingDays: normaliseWorkingDays(row.working_days),
  };
}

export class AttendanceService {
  private readonly repo = new AttendanceRepository();

  private regionsFor(ctx?: AttendanceRegionCtx): string[] | null {
    return ctx ? effectiveRegionsFor(ctx, ctx.requestedRegion) : null;
  }

  private async assertEmployeeInScope(ctx: AttendanceRegionCtx | undefined, employeeId: string): Promise<void> {
    if (!ctx) return;
    const regions = this.regionsFor(ctx);
    if (regions === null) return;
    const empRegion = await getEmployeeRegion(employeeId);
    if (regions.length === 0 || !empRegion || !regions.includes(empRegion)) {
      throw new ForbiddenError("This employee belongs to a different region.");
    }
  }

  private async assertRecordInScope(ctx: AttendanceRegionCtx | undefined, recordId: string): Promise<void> {
    const row = await this.repo.getRecordById(recordId);
    if (!row?.employee_id) return;
    await this.assertEmployeeInScope(ctx, String(row.employee_id));
  }

  private normaliseExtendedPolicyRow(row: Record<string, unknown> | null): ResolvedOrgPolicy {
    const base = normalisePolicyRow(row);
    if (!row) {
      return {
        ...base,
        policyRowId: "1",
        checkinWindowStartOffsetMinutes: -120,
        checkinWindowEndOffsetMinutes: 240,
        minOvertimeMinutes: 0,
        overtimeRequiresApproval: false,
        autoCheckoutBufferMinutes: 60,
      };
    }
    return {
      ...base,
      policyRowId: "1",
      checkinWindowStartOffsetMinutes: Number(row.checkin_window_start_offset_minutes ?? -120),
      checkinWindowEndOffsetMinutes: Number(row.checkin_window_end_offset_minutes ?? 240),
      minOvertimeMinutes: Number(row.min_overtime_minutes ?? 0),
      overtimeRequiresApproval: Boolean(row.overtime_requires_approval),
      autoCheckoutBufferMinutes: Number(row.auto_checkout_buffer_minutes ?? 60),
    };
  }

  private async getCachedPolicyBundle(): Promise<ResolvedOrgPolicy> {
    const hit = memCache.get<ResolvedOrgPolicy>(POLICY_CACHE_KEY);
    if (hit) return hit;
    await this.repo.ensureOrgTimesheetPolicyRow();
    const row = await this.repo.getOrgTimesheetPolicy();
    const bundle = this.normaliseExtendedPolicyRow(row as Record<string, unknown> | null);
    memCache.set(POLICY_CACHE_KEY, bundle, POLICY_CACHE_TTL_MS);
    return bundle;
  }

  /** Multi-policy hook: pass employee id so future mapping can differ per user. */
  private async resolveOrgPolicyForUser(principalId: string): Promise<ResolvedOrgPolicy> {
    return getPolicyForUser(principalId, this.repo, (r) => this.normaliseExtendedPolicyRow(r));
  }

  /**
   * Effective timing policy for punches: org policy, or shift times when assign.use_shift_override.
   */
  private async resolveEffectiveAttendancePolicy(
    employeeId: string,
    workDate: string,
    live: ResolvedOrgPolicy
  ): Promise<AttendancePolicy> {
    const asg = await this.repo.getShiftAssignmentForEmployee(employeeId, workDate);
    if (asg?.use_shift_override && asg.start_time && asg.end_time) {
      let pattern: boolean[] | undefined;
      try {
        pattern =
          typeof asg.weekly_pattern === "string"
            ? JSON.parse(asg.weekly_pattern)
            : asg.weekly_pattern;
      } catch {
        pattern = undefined;
      }
      return {
        ...live,
        workDayStart: timeStr(String(asg.start_time)),
        workDayEnd: timeStr(String(asg.end_time)),
        graceMinutes: Number(asg.grace_minutes ?? live.graceMinutes),
        workingDays: workingDaysFromWeeklyPattern(pattern),
      };
    }
    return live;
  }

  private async holidaySetForWorkDate(employeeId: string, workDate: string): Promise<Set<string> | undefined> {
    const cc = await this.repo.getEmployeeCountryCode(employeeId);
    const isHol = await this.repo.isHolidayForDate(workDate, cc);
    return isHol ? new Set([workDate]) : undefined;
  }

  async getOrgTimesheetPolicyApi() {
    await this.repo.ensureOrgTimesheetPolicyRow();
    const row = await this.repo.getOrgTimesheetPolicy();
    const p = this.normaliseExtendedPolicyRow(row as Record<string, unknown> | null);
    return {
      policyTimezone: p.policyTimezone,
      workDayStart: p.workDayStart,
      workDayEnd: p.workDayEnd,
      graceMinutes: p.graceMinutes,
      halfDayThresholdPercent: p.halfDayThresholdPercent,
      workingDays: p.workingDays,
      checkinWindowStartOffsetMinutes: p.checkinWindowStartOffsetMinutes,
      checkinWindowEndOffsetMinutes: p.checkinWindowEndOffsetMinutes,
      minOvertimeMinutes: p.minOvertimeMinutes,
      overtimeRequiresApproval: p.overtimeRequiresApproval,
      autoCheckoutBufferMinutes: p.autoCheckoutBufferMinutes,
      updatedAt: row?.updated_at ?? null,
      updatedByUserId: row?.updated_by_user_id ?? null,
    };
  }

  async updateOrgTimesheetPolicy(
    body: {
      policyTimezone?: string | null;
      workDayStart?: string;
      workDayEnd?: string;
      graceMinutes?: number;
      halfDayThresholdPercent?: number;
      workingDays?: number[];
      checkinWindowStartOffsetMinutes?: number;
      checkinWindowEndOffsetMinutes?: number;
      minOvertimeMinutes?: number;
      overtimeRequiresApproval?: boolean;
      autoCheckoutBufferMinutes?: number;
    },
    userId: string,
    meta?: AuditRequestMeta
  ) {
    await this.repo.ensureOrgTimesheetPolicyRow();
    const before = await this.getOrgTimesheetPolicyApi();
    const current = this.normaliseExtendedPolicyRow(await this.repo.getOrgTimesheetPolicy());

    const workDayStart = parseHHMM((body.workDayStart ?? current.workDayStart).trim());
    const workDayEnd = parseHHMM((body.workDayEnd ?? current.workDayEnd).trim());
    const graceMinutes = Math.min(240, Math.max(0, Number(body.graceMinutes ?? current.graceMinutes)));
    let halfDayThresholdPercent = Number(body.halfDayThresholdPercent ?? current.halfDayThresholdPercent);
    if (Number.isNaN(halfDayThresholdPercent)) halfDayThresholdPercent = 50;
    halfDayThresholdPercent = Math.min(100, Math.max(1, Math.round(halfDayThresholdPercent)));
    const policyTimezone =
      body.policyTimezone === undefined ? current.policyTimezone : body.policyTimezone?.trim() || "UTC";
    const workingDays =
      body.workingDays !== undefined ? normaliseWorkingDays(body.workingDays) : current.workingDays;
    let checkinWindowStartOffsetMinutes = Number(
      body.checkinWindowStartOffsetMinutes ?? current.checkinWindowStartOffsetMinutes
    );
    let checkinWindowEndOffsetMinutes = Number(
      body.checkinWindowEndOffsetMinutes ?? current.checkinWindowEndOffsetMinutes
    );
    if (Number.isNaN(checkinWindowStartOffsetMinutes)) checkinWindowStartOffsetMinutes = -120;
    if (Number.isNaN(checkinWindowEndOffsetMinutes)) checkinWindowEndOffsetMinutes = 240;
    checkinWindowStartOffsetMinutes = Math.max(-24 * 60, Math.min(0, Math.round(checkinWindowStartOffsetMinutes)));
    checkinWindowEndOffsetMinutes = Math.max(0, Math.min(24 * 60, Math.round(checkinWindowEndOffsetMinutes)));
    if (checkinWindowEndOffsetMinutes <= checkinWindowStartOffsetMinutes) {
      checkinWindowEndOffsetMinutes = Math.min(24 * 60, checkinWindowStartOffsetMinutes + 30);
    }
    let minOvertimeMinutes = Number(body.minOvertimeMinutes ?? current.minOvertimeMinutes);
    if (Number.isNaN(minOvertimeMinutes) || minOvertimeMinutes < 0) minOvertimeMinutes = 0;
    minOvertimeMinutes = Math.min(24 * 60, minOvertimeMinutes);
    const overtimeRequiresApproval =
      body.overtimeRequiresApproval !== undefined
        ? Boolean(body.overtimeRequiresApproval)
        : current.overtimeRequiresApproval;
    let autoCheckoutBufferMinutes = Number(
      body.autoCheckoutBufferMinutes ?? current.autoCheckoutBufferMinutes
    );
    if (Number.isNaN(autoCheckoutBufferMinutes) || autoCheckoutBufferMinutes < 0) autoCheckoutBufferMinutes = 60;
    autoCheckoutBufferMinutes = Math.min(24 * 60, autoCheckoutBufferMinutes);

    await this.repo.updateOrgTimesheetPolicy(
      {
        policyTimezone,
        workDayStart,
        workDayEnd,
        graceMinutes,
        halfDayThresholdPercent,
        workingDays,
        checkinWindowStartOffsetMinutes,
        checkinWindowEndOffsetMinutes,
        minOvertimeMinutes,
        overtimeRequiresApproval,
        autoCheckoutBufferMinutes,
      },
      userId
    );
    memCache.invalidate(POLICY_CACHE_KEY);

    const after = await this.getOrgTimesheetPolicyApi();
    const keys = [
      "policyTimezone",
      "workDayStart",
      "workDayEnd",
      "graceMinutes",
      "halfDayThresholdPercent",
      "workingDays",
      "checkinWindowStartOffsetMinutes",
      "checkinWindowEndOffsetMinutes",
      "minOvertimeMinutes",
      "overtimeRequiresApproval",
      "autoCheckoutBufferMinutes",
    ] as const;
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const k of keys) {
      if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) changes[k] = { from: before[k], to: after[k] };
    }
    if (Object.keys(changes).length > 0) {
      await appendAuditLog({
        entityType: "org_settings",
        entityId: "timesheet_policy",
        action: "TIMESHEET_POLICY_UPDATE",
        performedBy: userId,
        details: { changes },
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      });
    }
    return after;
  }

  private enrichRowForDisplay(row: Record<string, unknown> | null, live: ResolvedOrgPolicy) {
    if (!row) return row;
    const merged = attendancePolicyFromSnapshot(row.policy_snapshot as PolicySnapshot | null, live);
    return {
      ...row,
      shift_start: merged.workDayStart,
      shift_end: merged.workDayEnd,
      grace_minutes: merged.graceMinutes,
      using_org_timesheet_policy: true,
    };
  }

  /** OT baseline: frozen snapshot (default) vs live org shift timings for the report window. */
  private policyForReportOvertime(
    mergedFromSnapshot: AttendancePolicy,
    live: ResolvedOrgPolicy,
    mode: ReportPolicyMode
  ): AttendancePolicy {
    if (mode !== "current_policy") return mergedFromSnapshot;
    return {
      ...mergedFromSnapshot,
      workDayStart: live.workDayStart,
      workDayEnd: live.workDayEnd,
      graceMinutes: live.graceMinutes,
      halfDayThresholdPercent: live.halfDayThresholdPercent,
      workingDays: [...live.workingDays],
    };
  }

  private mapReportRow(
    r: Record<string, unknown>,
    live: ResolvedOrgPolicy,
    winCache: ReturnType<typeof makePolicyWindowCache>,
    opts: {
      reportPolicyMode: ReportPolicyMode;
      leaveLookup?: Map<string, "full" | "half">;
      holidayDates?: Set<string>;
    }
  ) {
    const merged = attendancePolicyFromSnapshot(r.policy_snapshot as PolicySnapshot | null, live);
    const policyOt = this.policyForReportOvertime(merged, live, opts.reportPolicyMode);
    const enriched = this.enrichRowForDisplay(r, live) as Record<string, unknown>;
    const empId = String(r.employee_id);
    const d = String(r.date).slice(0, 10);
    const leaveDay = opts.leaveLookup?.get(`${empId}|${d}`);
    const leaveHalfDay = leaveDay === "half";
    const isHoliday =
      opts.holidayDates?.has(d) === true || String(r.status ?? enriched.status ?? "") === "holiday";
    const checkIn = r.check_in_time as string | null;
    const checkOut = r.check_out_time as string | null;
    return {
      ...enriched,
      status: isHoliday ? "holiday" : enriched.status ?? r.status,
      shift_start: merged.workDayStart,
      shift_end: merged.workDayEnd,
      grace_minutes: merged.graceMinutes,
      hours_worked: isHoliday ? 0 : hoursWorked(checkIn, checkOut),
      overtime: isHoliday
        ? 0
        : overtimeHours(checkIn, checkOut, policyOt, {
            minOvertimeMinutes: live.minOvertimeMinutes,
            overtimeRequiresApproval: live.overtimeRequiresApproval,
            isOvertimeApproved: Boolean(r.is_overtime_approved),
            cache: winCache,
            leaveHalfDay,
          }),
    };
  }

  private async appendLegalAudit(entry: {
    attendanceId: string;
    action: "create" | "update" | "auto_checkout" | "manual_edit";
    oldValue: Record<string, unknown> | null;
    newValue: Record<string, unknown> | null;
    changedByUserId: string | null;
  }) {
    await this.repo.insertAttendanceAuditLog(entry);
  }

  async listShifts() {
    return (
      memCache.get<any[]>("shifts:list") ??
      (async () => {
        const r = await this.repo.listShifts();
        memCache.set("shifts:list", r, 30_000);
        return r;
      })()
    );
  }
  async createShift(data: any) {
    if (!data.name || !data.startTime || !data.endTime)
      throw new ValidationError("name, startTime, endTime are required");
    const r = await this.repo.createShift(data);
    memCache.invalidate("shifts:");
    return r;
  }
  async updateShift(id: string, data: any) {
    const r = await this.repo.updateShift(id, data);
    if (!r) throw new NotFoundError("Shift", id);
    memCache.invalidate("shifts:");
    return r;
  }
  async deleteShift(id: string) {
    await this.repo.deleteShift(id);
    memCache.invalidate("shifts:");
  }

  async listEmployeeShifts(ctx?: AttendanceRegionCtx) {
    return this.repo.listEmployeeShifts(this.regionsFor(ctx));
  }
  async assignShift(
    employeeId: string,
    shiftId: string,
    effectiveFrom: string,
    effectiveTo?: string | null,
    useShiftOverride = false,
    ctx?: AttendanceRegionCtx,
  ) {
    if (!employeeId || !shiftId || !effectiveFrom)
      throw new ValidationError("employeeId, shiftId, effectiveFrom required");
    await this.assertEmployeeInScope(ctx, employeeId);
    const emp = await this.repo.getEmployeeById(employeeId);
    if (!emp) throw new NotFoundError("Employee", employeeId);
    await this.repo.endOverlappingAssignments(employeeId, effectiveFrom);
    return this.repo.createEmployeeShift(employeeId, shiftId, effectiveFrom, effectiveTo ?? null, useShiftOverride);
  }
  async removeEmployeeShift(id: string, ctx?: AttendanceRegionCtx) {
    const row = await this.repo.getEmployeeShiftById(id);
    if (row?.employee_id) await this.assertEmployeeInScope(ctx, String(row.employee_id));
    await this.repo.deleteEmployeeShift(id);
  }

  async checkIn(employeeId: string, _userTz: string, userId: string) {
    const now = new Date();
    const live = await this.resolveOrgPolicyForUser(employeeId);
    const workDate = getWorkDate(now, live.policyTimezone);
    const effective = await this.resolveEffectiveAttendancePolicy(employeeId, workDate, live);
    const winCache = makePolicyWindowCache();

    const [empInfo, leaveApproved] = await Promise.all([
      this.repo.getEmployeeInfo(employeeId),
      this.repo.getApprovedLeaveForDate(employeeId, workDate),
    ]);

    if (!empInfo) throw new NotFoundError("Employee", employeeId);
    if ((empInfo as { employment_status?: string }).employment_status === "offboarded")
      throw new ValidationError("Cannot check in after offboarding");

    const exitYmd = pgDateToYyyyMmDd((empInfo as { exit_date?: unknown }).exit_date);
    if (exitYmd && workDate > exitYmd) throw new ValidationError("Cannot check in after exit date");

    const joinYmd = pgDateToYyyyMmDd((empInfo as { join_date?: unknown }).join_date);
    if (joinYmd && workDate < joinYmd) throw new ValidationError("Cannot check in before joining date");

    if (leaveApproved?.dayType === "full") {
      throw new ValidationError("Cannot check in on a full-day approved leave");
    }

    if (
      !checkInWithinAllowedWindow(
        now,
        workDate,
        effective,
        live.checkinWindowStartOffsetMinutes,
        live.checkinWindowEndOffsetMinutes,
        winCache
      )
    ) {
      throw new ValidationError(
        "INVALID_PUNCH: Check-in is outside the allowed time window for this shift."
      );
    }

    const holidayDates = await this.holidaySetForWorkDate(employeeId, workDate);
    const status = deriveStatus(now, null, effective, { holidayDates, leaveApproved });
    const snapshot = buildPolicySnapshot(effective);
    const row = await this.repo.createCheckIn(
      employeeId,
      workDate,
      now,
      status,
      userId,
      snapshot as unknown as Record<string, unknown>
    );
    await this.appendLegalAudit({
      attendanceId: row.id as string,
      action: "create",
      oldValue: null,
      newValue: attendanceRowSnapshot(row as Record<string, unknown>),
      changedByUserId: userId,
    });
    return row;
  }

  async checkOut(employeeId: string, _userTz: string, userId: string) {
    const now = new Date();
    const live = await this.resolveOrgPolicyForUser(employeeId);
    const checkoutWorkDate = getWorkDate(now, live.policyTimezone);

    if (!(await this.repo.getEmployeeInfo(employeeId))) throw new NotFoundError("Employee", employeeId);

    const effectiveAtCheckout = await this.resolveEffectiveAttendancePolicy(employeeId, checkoutWorkDate, live);
    let existing = await this.repo.getTodayRecord(employeeId, checkoutWorkDate);
    if (
      !existing?.check_in_time &&
      isOvernightShift(effectiveAtCheckout.workDayStart, effectiveAtCheckout.workDayEnd)
    ) {
      const prevWorkDate = shiftDate(checkoutWorkDate, -1);
      existing = await this.repo.getTodayRecord(employeeId, prevWorkDate);
    }

    if (!existing?.check_in_time) throw new ValidationError("No check-in found for today");
    if (existing.check_out_time) throw new ConflictError("Already checked out today");

    const fullBefore = await this.repo.getRecordById(existing.id as string);
    if (!fullBefore) throw new ValidationError("No check-in found for today");

    const checkIn = new Date(existing.check_in_time as string);
    const snap = existing.policy_snapshot as PolicySnapshot | null | undefined;
    const merged = attendancePolicyFromSnapshot(snap, live);
    const workDate = getWorkDate(checkIn, merged.policyTimezone);
    const [holidayDates, leaveApproved] = await Promise.all([
      this.holidaySetForWorkDate(employeeId, workDate),
      this.repo.getApprovedLeaveForDate(employeeId, workDate),
    ]);

    const status = deriveStatus(checkIn, now, merged, { holidayDates, leaveApproved });
    const updated = await this.repo.updateCheckOut(existing.id as string, now, status, {
      missedCheckout: false,
    });
    await this.appendLegalAudit({
      attendanceId: existing.id as string,
      action: "update",
      oldValue: attendanceRowSnapshot(fullBefore as Record<string, unknown>),
      newValue: attendanceRowSnapshot(updated as Record<string, unknown>),
      changedByUserId: userId,
    });
    return updated;
  }

  async listRecords(filters: any, ctx?: AttendanceRegionCtx) {
    return this.repo.listRecords({ ...filters, regions: this.regionsFor(ctx) });
  }

  async manualUpsert(employeeId: string, date: string, data: any, userId: string, ctx?: AttendanceRegionCtx) {
    await this.assertEmployeeInScope(ctx, employeeId);
    const live = await this.resolveOrgPolicyForUser(employeeId);
    const effective = await this.resolveEffectiveAttendancePolicy(employeeId, date, live);
    let status = data.status;
    let snap: PolicySnapshot | undefined;
    const [holidayDates, leaveApproved] = await Promise.all([
      this.holidaySetForWorkDate(employeeId, date),
      this.repo.getApprovedLeaveForDate(employeeId, date.slice(0, 10)),
    ]);
    if (data.checkInTime) {
      const ci = new Date(data.checkInTime);
      const co = data.checkOutTime ? new Date(data.checkOutTime) : null;
      snap = buildPolicySnapshot(effective);
      status = deriveStatus(ci, co, effective, { holidayDates, leaveApproved });
    }
    const prior = await this.repo.getActiveRecordByEmployeeAndDate(employeeId, date.slice(0, 10));
    const row = await this.repo.manualUpsert(
      employeeId,
      date,
      { ...data, status: status || "present", policySnapshot: snap },
      userId
    );
    await this.appendLegalAudit({
      attendanceId: row.id as string,
      action: "manual_edit",
      oldValue: attendanceRowSnapshot(prior as Record<string, unknown> | null),
      newValue: attendanceRowSnapshot(row as Record<string, unknown>),
      changedByUserId: userId,
    });
    return row;
  }

  async listAudit(attendanceId: string, ctx?: AttendanceRegionCtx) {
    await this.assertRecordInScope(ctx, attendanceId);
    return this.repo.listAudit(attendanceId);
  }

  async listLegalAuditLogs(attendanceId: string, ctx?: AttendanceRegionCtx) {
    await this.assertRecordInScope(ctx, attendanceId);
    return this.repo.listAttendanceAuditLogs(attendanceId);
  }

  async getToday(employeeId: string, _userTz: string) {
    const live = await this.resolveOrgPolicyForUser(employeeId);
    const workDate = getWorkDateNow(live);
    const row = await this.repo.getTodayWithShift(employeeId, workDate);
    return this.enrichRowForDisplay(row as Record<string, unknown> | null, live);
  }

  async getStats(_userTz?: string, ctx?: AttendanceRegionCtx) {
    void _userTz;
    const live = await this.getCachedPolicyBundle();
    const today = getWorkDateNow(live);
    return this.repo.getStats(today, this.regionsFor(ctx));
  }

  async getEmployeeRecords(
    employeeId: string,
    from: string,
    to: string,
    reportPolicyMode: ReportPolicyMode = "snapshot_only",
    ctx?: AttendanceRegionCtx,
  ) {
    await this.assertEmployeeInScope(ctx, employeeId);
    const f = from.slice(0, 10);
    const t = to.slice(0, 10);
    const [rows, live, spans, holidayList] = await Promise.all([
      this.repo.getEmployeeRecords(employeeId, from, to),
      this.getCachedPolicyBundle(),
      this.repo.listApprovedLeaveSpansOverlapping(f, t),
      this.repo.listLeaveHolidayDatesBetween(f, t),
    ]);
    const winCache = makePolicyWindowCache();
    const leaveLookup = leaveLookupFromSpans(spans, f, t);
    const holidayDates = new Set(holidayList);
    return rows.map((r) =>
      this.mapReportRow(r as Record<string, unknown>, live, winCache, {
        reportPolicyMode,
        leaveLookup,
        holidayDates,
      })
    );
  }

  async getReport(
    from: string,
    to: string,
    department?: string,
    reportPolicyMode: ReportPolicyMode = "snapshot_only",
    ctx?: AttendanceRegionCtx,
  ) {
    const f = from.slice(0, 10);
    const t = to.slice(0, 10);
    const [rows, live, spans, holidayList] = await Promise.all([
      this.repo.getReport(f, t, department, this.regionsFor(ctx)),
      this.getCachedPolicyBundle(),
      this.repo.listApprovedLeaveSpansOverlapping(f, t),
      this.repo.listLeaveHolidayDatesBetween(f, t),
    ]);
    const winCache = makePolicyWindowCache();
    const leaveLookup = leaveLookupFromSpans(spans, f, t);
    const holidayDates = new Set(holidayList);
    return rows.map((r) =>
      this.mapReportRow(r as Record<string, unknown>, live, winCache, {
        reportPolicyMode,
        leaveLookup,
        holidayDates,
      })
    );
  }

  async updateRecord(
    id: string,
    data: { checkInTime?: string | null; checkOutTime?: string | null; remarks?: string | null },
    _userTz: string,
    userId: string,
    ctx?: AttendanceRegionCtx,
  ) {
    void _userTz;
    await this.assertRecordInScope(ctx, id);
    return this.updateRecordInternal(id, data, userId);
  }

  private async updateRecordInternal(
    id: string,
    data: { checkInTime?: string | null; checkOutTime?: string | null; remarks?: string | null },
    userId: string
  ) {
    const [row, live] = await Promise.all([this.repo.getRecordById(id), this.getCachedPolicyBundle()]);
    if (!row) return null;

    const merged = attendancePolicyFromSnapshot(row.policy_snapshot as PolicySnapshot | null, live);
    const ci =
      data.checkInTime != null
        ? data.checkInTime
          ? new Date(data.checkInTime)
          : null
        : row.check_in_time
          ? new Date(row.check_in_time as string)
          : null;
    const co =
      data.checkOutTime != null
        ? data.checkOutTime
          ? new Date(data.checkOutTime)
          : null
        : row.check_out_time
          ? new Date(row.check_out_time as string)
          : null;

    const workDate = ci ? getWorkDate(ci, merged.policyTimezone) : String(row.date).slice(0, 10);
    const holidayDates = row.employee_id
      ? await this.holidaySetForWorkDate(String(row.employee_id), workDate)
      : undefined;
    const leaveApproved = row.employee_id
      ? await this.repo.getApprovedLeaveForDate(String(row.employee_id), workDate)
      : null;

    const status = ci ? deriveStatus(ci, co, merged, { holidayDates, leaveApproved }) : "absent";
    const updated = await this.repo.updateRecord(
      id,
      data,
      status,
      userId,
      data.remarks || "Edit from report",
      row
    );
    if (updated) {
      await this.appendLegalAudit({
        attendanceId: id,
        action: "manual_edit",
        oldValue: attendanceRowSnapshot(row as Record<string, unknown>),
        newValue: attendanceRowSnapshot(updated as Record<string, unknown>),
        changedByUserId: userId,
      });
    }
    return updated;
  }

  async deleteRecord(id: string, userId: string, ctx?: AttendanceRegionCtx) {
    await this.assertRecordInScope(ctx, id);
    const row = await this.repo.getRecordById(id);
    if (!row) return false;
    const deleted = await this.repo.softDeleteRecord(id, userId);
    if (!deleted) return false;
    await this.appendLegalAudit({
      attendanceId: id,
      action: "manual_edit",
      oldValue: attendanceRowSnapshot(row as Record<string, unknown>),
      newValue: attendanceRowSnapshot(deleted as Record<string, unknown>),
      changedByUserId: userId,
    });
    return true;
  }

  async restoreAttendanceRecord(id: string, userId: string, ctx?: AttendanceRegionCtx) {
    await this.assertRecordInScope(ctx, id);
    const row = await this.repo.getRecordByIdIncludingDeleted(id);
    if (!row || !row.deleted_at) return null;
    const restored = await this.repo.restoreAttendanceRecord(id);
    if (restored) {
      await this.appendLegalAudit({
        attendanceId: id,
        action: "manual_edit",
        oldValue: attendanceRowSnapshot(row as Record<string, unknown>),
        newValue: attendanceRowSnapshot(restored as Record<string, unknown>),
        changedByUserId: userId,
      });
    }
    return restored;
  }

  async getDailySummary(date: string, ctx?: AttendanceRegionCtx) {
    return this.repo.getDailySummary(date, this.regionsFor(ctx));
  }

  async getPolicyWorkDateNow(): Promise<string> {
    const live = await this.getCachedPolicyBundle();
    return getWorkDateNow(live);
  }

  /**
   * Close long-running open attendance using frozen snapshot end + org buffer.
   * Idempotent per row; safe to run on a schedule.
   */
  async runAutoCheckoutSweep(limit = 2000): Promise<{ closed: number }> {
    const live = await this.getCachedPolicyBundle();
    const rows = await this.repo.listOpenAttendanceRecords(limit);
    const now = Date.now();
    let closed = 0;

    for (const row of rows) {
      const snap = row.policy_snapshot as PolicySnapshot | null | undefined;
      const merged = attendancePolicyFromSnapshot(snap, live);
      const workDate = String(row.date).slice(0, 10);
      const employeeId = String(row.employee_id);
      const [holidayDates, leaveApproved] = await Promise.all([
        (async () => {
          const isHol = await this.repo.isHolidayForDate(workDate, await this.repo.getEmployeeCountryCode(employeeId));
          return isHol ? new Set<string>([workDate]) : undefined;
        })(),
        this.repo.getApprovedLeaveForDate(employeeId, workDate),
      ]);
      const leaveHalf = leaveApproved?.dayType === "half";
      const win = getPolicyWindow(workDate, merged, undefined, leaveHalf);
      const bufferMs = live.autoCheckoutBufferMinutes * 60_000;
      if (now <= win.endUtc.getTime() + bufferMs) continue;

      const checkIn = new Date(row.check_in_time as string);
      const { status, missedCheckoutFlag } = deriveAutoCheckoutClosingStatus(checkIn, win.endUtc, merged, {
        holidayDates,
        leaveApproved,
      });
      const fullBefore = await this.repo.getRecordById(row.id as string);
      const updated = await this.repo.updateCheckOut(row.id as string, win.endUtc, status, {
        isAuto: true,
        missedCheckout: missedCheckoutFlag,
      });
      if (fullBefore && updated) {
        await this.appendLegalAudit({
          attendanceId: row.id as string,
          action: "auto_checkout",
          oldValue: attendanceRowSnapshot(fullBefore as Record<string, unknown>),
          newValue: attendanceRowSnapshot(updated as Record<string, unknown>),
          changedByUserId: null,
        });
        closed++;
      }
    }

    return { closed };
  }

  // ── Holidays (admin) ─────────────────────────────────────────────────────
  async listHolidays(from?: string, to?: string) {
    return this.repo.listOrgHolidays(from, to);
  }
  async addHoliday(body: { holidayDate: string; countryCode?: string | null; name: string }, _userId: string) {
    if (!body.holidayDate || !body.name?.trim()) throw new ValidationError("holidayDate and name are required");
    return this.repo.insertOrgHoliday({
      holidayDate: body.holidayDate.slice(0, 10),
      countryCode: body.countryCode ?? null,
      name: body.name.trim(),
    });
  }
  async removeHoliday(id: string) {
    await this.repo.deleteOrgHoliday(id);
  }

  // ── Check-in reminder settings ──────────────────────────────────────────

  async listCheckinReminders() {
    try {
      return await this.repo.listCheckinReminders();
    } catch (e: any) {
      if (String(e?.message).includes("checkin_reminder_settings")) return [];
      throw e;
    }
  }

  async upsertCheckinReminder(body: Record<string, unknown>) {
    const sendTime = String(body.sendTime ?? "").trim();
    if (!/^\d{2}:\d{2}$/.test(sendTime)) throw new ValidationError("sendTime must be HH:MM (24-hour)");
    const [h, m] = sendTime.split(":").map(Number);
    if (h < 0 || h > 23 || m < 0 || m > 59) throw new ValidationError("sendTime out of range");

    // undefined = leave unchanged on PATCH; null/[] = all branches
    let branchIds: string[] | null | undefined = undefined;
    if (body.branchIds !== undefined) {
      branchIds =
        Array.isArray(body.branchIds) && body.branchIds.length > 0
          ? (body.branchIds as unknown[]).map(String).filter(Boolean)
          : null;
    }

    return this.repo.upsertCheckinReminder({
      id: body.id ? String(body.id) : null,
      sendTime,
      enabled: body.enabled !== false,
      notifyHr: body.notifyHr !== false,
      notifyEmployee: body.notifyEmployee === true,
      label: body.label ? String(body.label).slice(0, 100) : null,
      sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : 0,
      branchIds,
    });
  }

  async deleteCheckinReminder(id: string) {
    await this.repo.deleteCheckinReminder(id);
  }
}
