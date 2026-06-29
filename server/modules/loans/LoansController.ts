import type { Request, Response, NextFunction } from "express";
import { LoansService } from "./LoansService.js";
import { ApiResponse } from "../../core/utils/apiResponse.js";
import { regionCtxFromRequest } from "../../lib/moduleRegionCtx.js";
import { resolveUserEmployeeId } from "../../lib/resolveUserEmployeeId.js";

export class LoansController {
  private readonly svc = new LoansService();

  constructor() {
    const c = this as any;
    for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(c))) {
      if (k !== "constructor" && typeof c[k] === "function") c[k] = c[k].bind(c);
    }
  }

  // ── Applications ────────────────────────────────────────────────────────────

  async getAllApplications(req: Request, res: Response, next: NextFunction) {
    try {
      const status = req.query.status as string | undefined;
      ApiResponse.ok(res, await this.svc.getAllApplications(status, regionCtxFromRequest(req)));
    } catch (e) { next(e); }
  }

  async getApplicationById(req: Request, res: Response, next: NextFunction) {
    try {
      ApiResponse.ok(res, await this.svc.getApplicationById(req.params.id, regionCtxFromRequest(req)));
    } catch (e) { next(e); }
  }

  async getMyApplications(req: Request, res: Response, next: NextFunction) {
    try {
      const employeeId = await resolveUserEmployeeId({
        employeeId: req.user!.employeeId,
        email: req.user!.email,
      });
      if (!employeeId) { ApiResponse.ok(res, []); return; }
      ApiResponse.ok(res, await this.svc.getMyApplications(employeeId));
    } catch (e) { next(e); }
  }

  async createApplication(req: Request, res: Response, next: NextFunction) {
    try {
      const employeeId = await resolveUserEmployeeId({
        employeeId: req.user!.employeeId,
        email: req.user!.email,
      });
      if (!employeeId) {
        res.status(400).json({ error: "Only employees linked to an employee record can apply for loans" });
        return;
      }
      ApiResponse.created(res, await this.svc.createApplication(employeeId, req.body));
    } catch (e) { next(e); }
  }

  async approveApplication(req: Request, res: Response, next: NextFunction) {
    try {
      const reviewerEmployeeId = await resolveUserEmployeeId({
        employeeId: req.user!.employeeId,
        email: req.user!.email,
      });
      ApiResponse.ok(res, await this.svc.approveApplication(
        req.params.id,
        req.user!.id,
        req.body,
        regionCtxFromRequest(req),
        reviewerEmployeeId,
      ));
    } catch (e) { next(e); }
  }

  async rejectApplication(req: Request, res: Response, next: NextFunction) {
    try {
      ApiResponse.ok(res, await this.svc.rejectApplication(req.params.id, req.user!.id, req.body, regionCtxFromRequest(req)));
    } catch (e) { next(e); }
  }

  // ── Loan Records ────────────────────────────────────────────────────────────

  async getAllRecords(req: Request, res: Response, next: NextFunction) {
    try {
      const status = req.query.status as string | undefined;
      ApiResponse.ok(res, await this.svc.getAllRecords(status, regionCtxFromRequest(req)));
    } catch (e) { next(e); }
  }

  async getRecordById(req: Request, res: Response, next: NextFunction) {
    try {
      ApiResponse.ok(res, await this.svc.getRecordById(req.params.id, regionCtxFromRequest(req)));
    } catch (e) { next(e); }
  }

  async getMyRecords(req: Request, res: Response, next: NextFunction) {
    try {
      const employeeId = await resolveUserEmployeeId({
        employeeId: req.user!.employeeId,
        email: req.user!.email,
      });
      if (!employeeId) { ApiResponse.ok(res, []); return; }
      ApiResponse.ok(res, await this.svc.getMyRecords(employeeId));
    } catch (e) { next(e); }
  }

  async createRecord(req: Request, res: Response, next: NextFunction) {
    try {
      ApiResponse.created(res, await this.svc.createRecord(req.body, req.user!.id, regionCtxFromRequest(req)));
    } catch (e) { next(e); }
  }

  async updateRecord(req: Request, res: Response, next: NextFunction) {
    try {
      ApiResponse.ok(res, await this.svc.updateRecord(req.params.id, req.body, regionCtxFromRequest(req)));
    } catch (e) { next(e); }
  }

  async deleteRecord(req: Request, res: Response, next: NextFunction) {
    try {
      await this.svc.deleteRecord(req.params.id, regionCtxFromRequest(req));
      ApiResponse.noContent(res);
    } catch (e) { next(e); }
  }

  // ── Payments ────────────────────────────────────────────────────────────────

  async getPayments(req: Request, res: Response, next: NextFunction) {
    try {
      ApiResponse.ok(res, await this.svc.getPayments(req.params.id, regionCtxFromRequest(req)));
    } catch (e) { next(e); }
  }

  async addPayment(req: Request, res: Response, next: NextFunction) {
    try {
      ApiResponse.created(res, await this.svc.addPayment(req.params.id, req.body, req.user!.id, regionCtxFromRequest(req)));
    } catch (e) { next(e); }
  }

  // ── Per-employee (profile tab) ───────────────────────────────────────────────

  async getEmployeeLoans(req: Request, res: Response, next: NextFunction) {
    try {
      ApiResponse.ok(res, await this.svc.getEmployeeLoans(req.params.employeeId, req.user!, regionCtxFromRequest(req)));
    } catch (e) { next(e); }
  }

  // ── Stats ───────────────────────────────────────────────────────────────────

  async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      ApiResponse.ok(res, await this.svc.getStats(regionCtxFromRequest(req)));
    } catch (e) { next(e); }
  }
}
