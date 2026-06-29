import type { Request, Response, NextFunction } from "express";
import { BenefitsService } from "./BenefitsService.js";
import { ApiResponse } from "../../core/utils/apiResponse.js";
import { regionCtxFromRequest } from "../../lib/moduleRegionCtx.js";

export class BenefitsController {
  private readonly svc = new BenefitsService();

  constructor() {
    const c = this as any;
    for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(c))) {
      if (k !== "constructor" && typeof c[k] === "function") c[k] = c[k].bind(c);
    }
  }

  async listCards(req: Request, res: Response, next: NextFunction) {
    try {
      const includeInactive = req.query.includeInactive === "true";
      ApiResponse.ok(res, await this.svc.listCards(includeInactive, regionCtxFromRequest(req)));
    } catch (e) { next(e); }
  }

  async getCard(req: Request, res: Response, next: NextFunction) {
    try {
      ApiResponse.ok(res, await this.svc.getCard(req.params.id, regionCtxFromRequest(req)));
    } catch (e) { next(e); }
  }

  async createCard(req: Request, res: Response, next: NextFunction) {
    try {
      ApiResponse.created(res, await this.svc.createCard(req.body, req.user!.id, regionCtxFromRequest(req)));
    } catch (e) { next(e); }
  }

  async updateCard(req: Request, res: Response, next: NextFunction) {
    try {
      ApiResponse.ok(res, await this.svc.updateCard(req.params.id, req.body, regionCtxFromRequest(req)));
    } catch (e) { next(e); }
  }

  async deleteCard(req: Request, res: Response, next: NextFunction) {
    try {
      await this.svc.deleteCard(req.params.id, regionCtxFromRequest(req));
      ApiResponse.noContent(res);
    } catch (e) { next(e); }
  }

  async getCardAssignments(req: Request, res: Response, next: NextFunction) {
    try {
      ApiResponse.ok(res, await this.svc.getCardAssignments(req.params.id, regionCtxFromRequest(req)));
    } catch (e) { next(e); }
  }

  async addAssignment(req: Request, res: Response, next: NextFunction) {
    try {
      ApiResponse.created(res, await this.svc.addAssignment(req.params.id, req.body, req.user!.id, regionCtxFromRequest(req)));
    } catch (e) { next(e); }
  }

  async updateAssignment(req: Request, res: Response, next: NextFunction) {
    try {
      ApiResponse.ok(res, await this.svc.updateAssignment(req.params.assignmentId, req.body, regionCtxFromRequest(req)));
    } catch (e) { next(e); }
  }

  async removeAssignment(req: Request, res: Response, next: NextFunction) {
    try {
      await this.svc.removeAssignment(req.params.assignmentId, regionCtxFromRequest(req));
      ApiResponse.noContent(res);
    } catch (e) { next(e); }
  }

  async getMyBenefits(req: Request, res: Response, next: NextFunction) {
    try {
      const employeeId = req.user!.employeeId;
      if (!employeeId) {
        ApiResponse.ok(res, []);
        return;
      }
      ApiResponse.ok(res, await this.svc.getEmployeeBenefits(employeeId));
    } catch (e) { next(e); }
  }

  async getEmployeeBenefits(req: Request, res: Response, next: NextFunction) {
    try {
      ApiResponse.ok(
        res,
        await this.svc.getEmployeeBenefitsForUser(req.params.employeeId, req.user!, regionCtxFromRequest(req)),
      );
    } catch (e) { next(e); }
  }
}
