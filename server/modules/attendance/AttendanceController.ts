import type { Request, Response, NextFunction } from "express";
import { getClientAuditMeta } from "../../lib/auditAppend.js";
import { AttendanceService, normalizeReportPolicyMode, type AttendanceRegionCtx } from "./AttendanceService.js";
import { ApiResponse } from "../../core/utils/apiResponse.js";
import { getRequestTz } from "../../lib/timezone.js";
import { neon } from "@neondatabase/serverless";

/** ISO date strings; if from > to (e.g. client bug or locale confusion), swap so the range is never empty by ordering. */
function normalizeAttendanceRange(from: string, to: string): { from: string; to: string } {
  const f = from.slice(0, 10);
  const t = to.slice(0, 10);
  if (f <= t) return { from: f, to: t };
  return { from: t, to: f };
}

export class AttendanceController {
  private readonly svc = new AttendanceService();

  private regionCtx(req: Request): AttendanceRegionCtx | undefined {
    const u = req.user;
    if (!u) return undefined;
    return {
      regionCode: u.regionCode ?? null,
      isRegionalSuperAdmin: u.isRegionalSuperAdmin,
      requestedRegion: (req.query.region as string) ?? null,
    };
  }

  constructor() {
    // Auto-bind all prototype methods so they can be passed as route handlers
    const proto = Object.getPrototypeOf(this);
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key !== "constructor" && typeof (this as any)[key] === "function") {
        (this as any)[key] = (this as any)[key].bind(this);
      }
    }
  }

  // ── Shifts ─────────────────────────────────────────────────────────────────

  async listShifts(_: Request, res: Response, next: NextFunction) {
    try { ApiResponse.ok(res, await this.svc.listShifts()); } catch (e) { next(e); }
  }
  async createShift(req: Request, res: Response, next: NextFunction) {
    try { ApiResponse.created(res, await this.svc.createShift(req.body)); } catch (e) { next(e); }
  }
  async updateShift(req: Request, res: Response, next: NextFunction) {
    try { ApiResponse.ok(res, await this.svc.updateShift(req.params.id, req.body)); } catch (e) { next(e); }
  }
  async deleteShift(req: Request, res: Response, next: NextFunction) {
    try { await this.svc.deleteShift(req.params.id); ApiResponse.ok(res, { success: true }); } catch (e) { next(e); }
  }

  // ── Employee Shifts ────────────────────────────────────────────────────────

  async listEmployeeShifts(req: Request, res: Response, next: NextFunction) {
    try { ApiResponse.ok(res, await this.svc.listEmployeeShifts(this.regionCtx(req))); } catch (e) { next(e); }
  }
  async assignShift(req: Request, res: Response, next: NextFunction) {
    try {
      ApiResponse.created(res, await this.svc.assignShift(
        req.body.employeeId,
        req.body.shiftId,
        req.body.effectiveFrom,
        req.body.effectiveTo,
        Boolean(req.body.useShiftOverride),
        this.regionCtx(req),
      ));
    } catch (e) { next(e); }
  }
  async removeEmployeeShift(req: Request, res: Response, next: NextFunction) {
    try { await this.svc.removeEmployeeShift(req.params.id, this.regionCtx(req)); ApiResponse.ok(res, { success: true }); } catch (e) { next(e); }
  }

  // ── Clock-in / Clock-out ───────────────────────────────────────────────────

  async checkIn(req: Request, res: Response, next: NextFunction) {
    try {
      const employeeId = req.user!.employeeId;
      if (!employeeId) { ApiResponse.error(res, 400, "No employee profile linked", "VALIDATION_ERROR"); return; }
      const sql = neon(process.env.DATABASE_URL!);
      // userTz is passed through but business logic uses policyTz internally
      const tz = await getRequestTz(req, sql);
      ApiResponse.created(res, await this.svc.checkIn(employeeId, tz, req.user!.id));
    } catch (e) { next(e); }
  }

  async checkOut(req: Request, res: Response, next: NextFunction) {
    try {
      const employeeId = req.user!.employeeId;
      if (!employeeId) { ApiResponse.error(res, 400, "No employee profile linked", "VALIDATION_ERROR"); return; }
      const sql = neon(process.env.DATABASE_URL!);
      const tz = await getRequestTz(req, sql);
      ApiResponse.ok(res, await this.svc.checkOut(employeeId, tz, req.user!.id));
    } catch (e) { next(e); }
  }

  // ── Records ────────────────────────────────────────────────────────────────

  async listRecords(req: Request, res: Response, next: NextFunction) {
    try {
      ApiResponse.ok(res, await this.svc.listRecords({
        employeeId: req.query.employeeId as string,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        status: req.query.status as string,
        limit: Math.min(parseInt(req.query.limit as string) || 100, 500),
        offset: parseInt(req.query.offset as string) || 0,
      }, this.regionCtx(req)));
    } catch (e) { next(e); }
  }

  async manualUpsert(req: Request, res: Response, next: NextFunction) {
    try {
      const { employeeId, date, ...data } = req.body;
      ApiResponse.ok(res, await this.svc.manualUpsert(employeeId, date, data, req.user!.id, this.regionCtx(req)));
    } catch (e) { next(e); }
  }

  async listAudit(req: Request, res: Response, next: NextFunction) {
    try { ApiResponse.ok(res, await this.svc.listAudit(req.params.id, this.regionCtx(req))); } catch (e) { next(e); }
  }

  async listLegalAudit(req: Request, res: Response, next: NextFunction) {
    try {
      ApiResponse.ok(res, await this.svc.listLegalAuditLogs(req.params.id, this.regionCtx(req)));
    } catch (e) {
      next(e);
    }
  }

  async restoreAttendanceRecord(req: Request, res: Response, next: NextFunction) {
    try {
      const row = await this.svc.restoreAttendanceRecord(req.params.id, req.user!.id, this.regionCtx(req));
      if (!row) {
        res.status(404).json({ error: "Attendance record not found or not deleted" });
        return;
      }
      res.status(200).json(row);
    } catch (e) {
      next(e);
    }
  }

  // ── Frontend raw-JSON endpoints ────────────────────────────────────────────

  /** Today's attendance card. Work date resolved via policy TZ. */
  async getToday(req: Request, res: Response, next: NextFunction) {
    try {
      const employeeId = req.user!.employeeId;
      if (!employeeId) { res.status(200).json(null); return; }
      const sql = neon(process.env.DATABASE_URL!);
      const tz = await getRequestTz(req, sql);
      res.status(200).json(await this.svc.getToday(employeeId, tz));
    } catch (e) { next(e); }
  }

  /**
   * Org-wide attendance stats.
   * "Today" is always derived from policy timezone — not from the requesting user's TZ.
   */
  async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      res.status(200).json(await this.svc.getStats(undefined, this.regionCtx(req)));
    } catch (e) { next(e); }
  }

  async getEmployeeRecords(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      if (req.user!.role === "employee" && req.user!.employeeId !== id) {
        res.status(403).json({ error: "You can only view your own attendance records" });
        return;
      }
      // Use policy-TZ today as the default upper bound so records are never
      // truncated because the caller's UTC clock is behind the policy timezone.
      const policyToday = await this.svc.getPolicyWorkDateNow();
      const utcToday = new Date().toISOString().slice(0, 10);
      const defaultFrom = (() => {
        const d = new Date(utcToday + "T12:00:00Z");
        d.setUTCDate(d.getUTCDate() - 30);
        return d.toISOString().slice(0, 10);
      })();
      const rawFrom = (req.query.from as string) || defaultFrom;
      let to = (req.query.to as string) || policyToday;
      // Cap future dates only — do not expand past `to` (breaks single-day historical reports).
      if (to.slice(0, 10) > policyToday) to = policyToday;
      const { from, to: toNorm } = normalizeAttendanceRange(rawFrom, to);

      res.status(200).json(await this.svc.getEmployeeRecords(id, from, toNorm, undefined, this.regionCtx(req)));
    } catch (e) { next(e); }
  }

  async getReport(req: Request, res: Response, next: NextFunction) {
    try {
      const policyToday = await this.svc.getPolicyWorkDateNow();
      const utcToday = new Date().toISOString().slice(0, 10);
      const defaultFrom = (() => {
        const d = new Date(utcToday + "T12:00:00Z");
        d.setUTCDate(d.getUTCDate() - 30);
        return d.toISOString().slice(0, 10);
      })();
      const rawFrom = (req.query.from as string) || defaultFrom;
      let to = (req.query.to as string) || policyToday;
      if (to.slice(0, 10) > policyToday) to = policyToday;
      const { from, to: toNorm } = normalizeAttendanceRange(rawFrom, to);

      const reportPolicyMode = normalizeReportPolicyMode(req.query.reportPolicyMode as string | undefined);
      res
        .status(200)
        .json(
          await this.svc.getReport(from, toNorm, req.query.department as string | undefined, reportPolicyMode, this.regionCtx(req))
        );
    } catch (e) { next(e); }
  }

  async updateRecord(req: Request, res: Response, next: NextFunction) {
    try {
      const { checkInTime, checkOutTime, remarks } = req.body;
      const sql = neon(process.env.DATABASE_URL!);
      const tz = await getRequestTz(req, sql);
      const row = await this.svc.updateRecord(
        req.params.id,
        { checkInTime, checkOutTime, remarks },
        tz,
        req.user!.id,
        this.regionCtx(req),
      );
      if (!row) { res.status(404).json({ error: "Attendance record not found" }); return; }
      res.status(200).json(row);
    } catch (e) { next(e); }
  }

  async deleteRecord(req: Request, res: Response, next: NextFunction) {
    try {
      const found = await this.svc.deleteRecord(req.params.id, req.user!.id, this.regionCtx(req));
      if (!found) { res.status(404).json({ error: "Attendance record not found" }); return; }
      res.status(200).json({ success: true });
    } catch (e) { next(e); }
  }

  async getDailySummary(req: Request, res: Response, next: NextFunction) {
    try {
      const date = (req.query.date as string) || (await this.svc.getPolicyWorkDateNow());
      res.status(200).json({ date, records: await this.svc.getDailySummary(date, this.regionCtx(req)) });
    } catch (e) { next(e); }
  }

  // ── Timesheet policy ───────────────────────────────────────────────────────

  async getTimesheetPolicy(_req: Request, res: Response, next: NextFunction) {
    try { res.status(200).json(await this.svc.getOrgTimesheetPolicyApi()); } catch (e) { next(e); }
  }

  async patchTimesheetPolicy(req: Request, res: Response, next: NextFunction) {
    try {
      res.status(200).json(
        await this.svc.updateOrgTimesheetPolicy(req.body ?? {}, req.user!.id, getClientAuditMeta(req))
      );
    } catch (e) { next(e); }
  }

  // ── Holidays + scheduled jobs ─────────────────────────────────────────────

  async listOrgHolidays(req: Request, res: Response, next: NextFunction) {
    try {
      res.status(200).json(
        await this.svc.listHolidays(req.query.from as string | undefined, req.query.to as string | undefined)
      );
    } catch (e) { next(e); }
  }

  async addOrgHoliday(req: Request, res: Response, next: NextFunction) {
    try {
      res.status(201).json(
        await this.svc.addHoliday(
          {
            holidayDate: req.body.holidayDate,
            countryCode: req.body.countryCode ?? null,
            name: req.body.name,
          },
          req.user!.id
        )
      );
    } catch (e) { next(e); }
  }

  async removeOrgHoliday(req: Request, res: Response, next: NextFunction) {
    try {
      await this.svc.removeHoliday(req.params.id);
      res.status(200).json({ success: true });
    } catch (e) { next(e); }
  }

  // ── Check-in reminder settings ────────────────────────────────────────────

  async listCheckinReminders(req: Request, res: Response, next: NextFunction) {
    try {
      const rows = await this.svc.listCheckinReminders();
      res.json(rows);
    } catch (e) { next(e); }
  }

  async upsertCheckinReminder(req: Request, res: Response, next: NextFunction) {
    try {
      const body = { ...(req.body ?? {}), ...(req.params.id ? { id: req.params.id } : {}) };
      const row = await this.svc.upsertCheckinReminder(body);
      res.json(row);
    } catch (e) { next(e); }
  }

  async deleteCheckinReminder(req: Request, res: Response, next: NextFunction) {
    try {
      await this.svc.deleteCheckinReminder(req.params.id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  }

  /** POST with header x-attendance-cron-secret matching ATTENDANCE_CRON_SECRET. No session auth. */
  async runAutoCheckoutCron(req: Request, res: Response, next: NextFunction) {
    try {
      const secret = process.env.ATTENDANCE_CRON_SECRET?.trim();
      if (!secret || req.header("x-attendance-cron-secret") !== secret) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const limit = Math.min(Math.max(parseInt(String(req.query.limit || "2000"), 10) || 2000, 1), 5000);
      res.status(200).json(await this.svc.runAutoCheckoutSweep(limit));
    } catch (e) { next(e); }
  }
}
