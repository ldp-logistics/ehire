import type { Request, Response, NextFunction } from "express";
import { OffboardingService } from "./OffboardingService.js";
import { ApiResponse } from "../../core/utils/apiResponse.js";
import { getRequestTz, todayInTz } from "../../lib/timezone.js";
import { neon } from "@neondatabase/serverless";
import { AuthRepository } from "../auth/AuthRepository.js";
import { getEmployeeRegion } from "../../lib/regionAccess.js";

export class OffboardingController {
  private readonly svc = new OffboardingService();
  private readonly authRepo = new AuthRepository();
  constructor() { const b = (c: any) => { for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(c))) if (k !== "constructor" && typeof c[k] === "function") c[k] = c[k].bind(c); }; b(this); }

  private regionCtx(user: any, req: Request) {
    return {
      regionCode: user?.regionCode ?? null,
      isRegionalSuperAdmin: user?.isRegionalSuperAdmin,
      requestedRegion: (req.query.region as string) ?? null,
    };
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const role = (user?.role ?? "").toLowerCase();
      if (role === "admin" || role === "hr") {
        ApiResponse.ok(res, await this.svc.list(req.query.status as string, { regionCode: user?.regionCode ?? null, isRegionalSuperAdmin: user?.isRegionalSuperAdmin, requestedRegion: (req.query.region as string) ?? null }));
        return;
      }
      let employeeId = user?.employeeId ?? null;
      if (!employeeId && user?.email) {
        const emp = await this.authRepo.findEmployeeByEmail(String(user.email).toLowerCase().trim());
        employeeId = emp?.id ?? null;
      }
      if (!employeeId) {
        ApiResponse.ok(res, []);
        return;
      }
      ApiResponse.ok(res, await this.svc.listWhereAssignee(employeeId));
    } catch (e) { next(e); }
  }
  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const employeeId = await this.resolveEmployeeId(user);
      const ok = await this.svc.canAccessRecord(req.params.id, user?.role ?? "", employeeId, this.regionCtx(user, req));
      if (!ok) { ApiResponse.error(res, 403, "Forbidden", "FORBIDDEN"); return; }
      ApiResponse.ok(res, await this.svc.getById(req.params.id));
    } catch (e) { next(e); }
  }
  async getDetailsByEmployee(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const employeeId = await this.resolveEmployeeId(user);
      const ok = await this.svc.canAccessRecordByEmployeeId(req.params.employeeId, user?.role ?? "", employeeId, this.regionCtx(user, req));
      if (!ok) { ApiResponse.error(res, 403, "Forbidden", "FORBIDDEN"); return; }
      ApiResponse.ok(res, await this.svc.getDetailsByEmployeeId(req.params.employeeId));
    } catch (e) { next(e); }
  }

  private async resolveEmployeeId(user: any): Promise<string | null> {
    if (!user) return null;
    if (user.employeeId) return user.employeeId;
    if (!user.email) return null;
    const emp = await this.authRepo.findEmployeeByEmail(String(user.email).toLowerCase().trim());
    return emp?.id ?? null;
  }

  /** Employee id when linked or found by email; else auth user id (for audit FK + display joins). */
  private async auditActorId(req: Request): Promise<string> {
    const user = (req as any).user;
    if (!user?.id) return "system";
    const empId = await this.resolveEmployeeId(user);
    return empId ?? String(user.id);
  }

  async initiate(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      // Region isolation: a regional admin may only offboard their own region's employees.
      if (user && !user.isRegionalSuperAdmin) {
        const targetEmployeeId = req.body?.employeeId ?? req.body?.employee_id;
        if (targetEmployeeId) {
          const empRegion = await getEmployeeRegion(targetEmployeeId);
          if (!user.regionCode || !empRegion || empRegion !== user.regionCode) {
            ApiResponse.error(res, 403, "This employee belongs to a different region.", "FORBIDDEN");
            return;
          }
        }
      }
      const sql = neon(process.env.DATABASE_URL!);
      const tz = await getRequestTz(req, sql);
      const todayStr = todayInTz(tz);
      const initiatedBy = await this.auditActorId(req);
      ApiResponse.created(res, await this.svc.initiate(req.body, initiatedBy, todayStr));
    } catch (e) { next(e); }
  }

  async updateExitDate(req: Request, res: Response, next: NextFunction) {
    try {
      const { exitDate, reason } = req.body;
      if (!exitDate) { ApiResponse.error(res, 400, "exitDate is required", "VALIDATION_ERROR"); return; }
      ApiResponse.ok(res, await this.svc.updateExitDate(req.params.id, exitDate, reason, await this.auditActorId(req)));
    } catch (e) { next(e); }
  }

  async updateResignationDate(req: Request, res: Response, next: NextFunction) {
    try {
      const { resignationDate, reason } = req.body;
      ApiResponse.ok(res, await this.svc.updateResignationDate(req.params.id, resignationDate ?? null, reason, await this.auditActorId(req)));
    } catch (e) { next(e); }
  }

  async cancel(req: Request, res: Response, next: NextFunction) {
    try { ApiResponse.ok(res, await this.svc.cancel(req.params.id, req.body.reason, req.user!.employeeId || req.user!.id)); } catch (e) { next(e); }
  }

  async complete(req: Request, res: Response, next: NextFunction) {
    try {
      const sql = neon(process.env.DATABASE_URL!);
      const tz = await getRequestTz(req, sql);
      const todayStr = todayInTz(tz);
      ApiResponse.ok(res, await this.svc.complete(req.params.id, todayStr, await this.auditActorId(req)));
    } catch (e) { next(e); }
  }

  async updateTask(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const employeeId = await this.resolveEmployeeId(user);
      const ok = await this.svc.canUpdateTask(req.params.taskId, user?.role ?? "", employeeId, this.regionCtx(user, req));
      if (!ok) { ApiResponse.error(res, 403, "Forbidden", "FORBIDDEN"); return; }
      ApiResponse.ok(res, await this.svc.updateTask(req.params.taskId, req.body, await this.auditActorId(req)));
    } catch (e) { next(e); }
  }

  async getTasks(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const employeeId = await this.resolveEmployeeId(user);
      const ok = await this.svc.canAccessRecord(req.params.id, user?.role ?? "", employeeId, this.regionCtx(user, req));
      if (!ok) { ApiResponse.error(res, 403, "Forbidden", "FORBIDDEN"); return; }
      ApiResponse.ok(res, await this.svc.getTasks(req.params.id));
    } catch (e) { next(e); }
  }
  async getAuditLog(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const employeeId = await this.resolveEmployeeId(user);
      const ok = await this.svc.canAccessRecord(req.params.id, user?.role ?? "", employeeId, this.regionCtx(user, req));
      if (!ok) { ApiResponse.error(res, 403, "Forbidden", "FORBIDDEN"); return; }
      ApiResponse.ok(res, await this.svc.getAuditLog(req.params.id));
    } catch (e) { next(e); }
  }

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      await this.svc.delete(req.params.id);
      res.status(204).end();
    } catch (e) { next(e); }
  }
}
