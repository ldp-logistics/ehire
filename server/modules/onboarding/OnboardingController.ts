import type { Request, Response, NextFunction } from "express";
import { OnboardingService } from "./OnboardingService.js";
import { ApiResponse } from "../../core/utils/apiResponse.js";

export class OnboardingController {
  private readonly service = new OnboardingService();
  constructor() {
    this.list              = this.list.bind(this);
    this.getById           = this.getById.bind(this);
    this.getByEmployee     = this.getByEmployee.bind(this);
    this.create            = this.create.bind(this);
    this.initiate          = this.initiate.bind(this);
    this.update            = this.update.bind(this);
    this.remove            = this.remove.bind(this);
    this.addTask           = this.addTask.bind(this);
    this.updateTask        = this.updateTask.bind(this);
    this.removeTask        = this.removeTask.bind(this);
    this.addAssignee       = this.addAssignee.bind(this);
    this.removeAssignee    = this.removeAssignee.bind(this);
    this.reopenChecklist   = this.reopenChecklist.bind(this);
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = req.user ? { role: req.user.role, employeeId: req.user.employeeId ?? null, roles: req.user.roles ?? [], regionCode: req.user.regionCode ?? null, isRegionalSuperAdmin: req.user.isRegionalSuperAdmin, requestedRegion: (req.query.region as string) ?? null } : null;
      ApiResponse.ok(res, await this.service.listAll(actor));
    } catch (e) { next(e); }
  }
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = req.user ? { role: req.user.role, employeeId: req.user.employeeId ?? null, roles: req.user.roles ?? [], regionCode: req.user.regionCode ?? null, isRegionalSuperAdmin: req.user.isRegionalSuperAdmin, requestedRegion: (req.query.region as string) ?? null } : null;
      ApiResponse.ok(res, await this.service.getRecord(req.params.id, actor));
    } catch (e) { next(e); }
  }
  async getByEmployee(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { ApiResponse.ok(res, await this.service.getByEmployee(req.params.employeeId)); } catch (e) { next(e); }
  }
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const employeeId = req.body.employeeId ?? req.body.employee_id;
      if (!employeeId) { ApiResponse.error(res, 400, "employee_id is required", "VALIDATION_ERROR"); return; }
      const actor = req.user ? { role: req.user.role, employeeId: req.user.employeeId ?? null, roles: req.user.roles ?? [], regionCode: req.user.regionCode ?? null, isRegionalSuperAdmin: req.user.isRegionalSuperAdmin } : null;
      ApiResponse.created(res, await this.service.createRecord(employeeId, req.user!.id, actor));
    } catch (e) { next(e); }
  }
  async initiate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = req.user ? { role: req.user.role, employeeId: req.user.employeeId ?? null, roles: req.user.roles ?? [], regionCode: req.user.regionCode ?? null, isRegionalSuperAdmin: req.user.isRegionalSuperAdmin } : null;
      ApiResponse.created(res, await this.service.initiateOnboarding(req.body, req.user!.id, actor));
    } catch (e) { next(e); }
  }
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const status = req.body.status;
      const completedAt = req.body.completedAt ?? req.body.completed_at;
      ApiResponse.ok(res, await this.service.updateRecord(req.params.id, status, completedAt));
    } catch (e) { next(e); }
  }
  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { await this.service.deleteRecord(req.params.id); ApiResponse.noContent(res); } catch (e) { next(e); }
  }
  async addTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const taskName = req.body.taskName ?? req.body.task_name;
      const sectionId = req.body.sectionId ?? req.body.section_id ?? null;
      const requiresAssignment = req.body.requiresAssignment ?? req.body.requires_assignment ?? false;
      ApiResponse.created(res, await this.service.addTask(req.params.id, taskName, sectionId, requiresAssignment));
    } catch (e) { next(e); }
  }
  async updateTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { completed, assignmentDetails } = req.body;
      const actor = req.user
        ? { id: req.user.id, role: req.user.role, employeeId: req.user.employeeId ?? null, roles: req.user.roles }
        : null;
      ApiResponse.ok(res, await this.service.updateTask(req.params.id, req.params.taskId, completed, assignmentDetails, actor));
    } catch (e) { next(e); }
  }
  async removeTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { await this.service.deleteTask(req.params.id, req.params.taskId); ApiResponse.noContent(res); } catch (e) { next(e); }
  }
  async addAssignee(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const employeeId = req.body.employeeId ?? req.body.employee_id;
      await this.service.addSectionAssignee(req.params.id, req.params.sectionId, employeeId, req.user?.id);
      ApiResponse.noContent(res);
    } catch (e) { next(e); }
  }
  async removeAssignee(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.service.removeSectionAssignee(req.params.id, req.params.sectionId, req.params.employeeId);
      ApiResponse.noContent(res);
    } catch (e) { next(e); }
  }

  async reopenChecklist(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      ApiResponse.ok(res, await this.service.reopenChecklist(req.params.id));
    } catch (e) { next(e); }
  }
}
