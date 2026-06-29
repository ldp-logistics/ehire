import type { Request, Response, NextFunction } from "express";
import { OnboardingTemplateService } from "./OnboardingTemplateService.js";
import { ApiResponse } from "../../../core/utils/apiResponse.js";

export class OnboardingTemplateController {
  private readonly svc = new OnboardingTemplateService();
  constructor() {
    this.list          = this.list.bind(this);
    this.getById       = this.getById.bind(this);
    this.create        = this.create.bind(this);
    this.update        = this.update.bind(this);
    this.remove        = this.remove.bind(this);
    this.addSection    = this.addSection.bind(this);
    this.updateSection = this.updateSection.bind(this);
    this.removeSection = this.removeSection.bind(this);
    this.addTask       = this.addTask.bind(this);
    this.updateTask    = this.updateTask.bind(this);
    this.removeTask    = this.removeTask.bind(this);
    this.addSectionAssignee    = this.addSectionAssignee.bind(this);
    this.removeSectionAssignee = this.removeSectionAssignee.bind(this);
  }

  async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try { ApiResponse.ok(res, await this.svc.listAll()); } catch (e) { next(e); }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { ApiResponse.ok(res, await this.svc.getById(req.params.id)); } catch (e) { next(e); }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const createdById = req.user?.employeeId ?? null;
      ApiResponse.created(res, await this.svc.create(req.body, createdById));
    } catch (e) { next(e); }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { ApiResponse.ok(res, await this.svc.update(req.params.id, req.body)); } catch (e) { next(e); }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { await this.svc.remove(req.params.id); ApiResponse.noContent(res); } catch (e) { next(e); }
  }

  async addSection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { ApiResponse.created(res, await this.svc.addSection(req.params.id, req.body)); } catch (e) { next(e); }
  }

  async updateSection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { ApiResponse.ok(res, await this.svc.updateSection(req.params.id, req.params.sectionId, req.body)); } catch (e) { next(e); }
  }

  async removeSection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { await this.svc.removeSection(req.params.id, req.params.sectionId); ApiResponse.noContent(res); } catch (e) { next(e); }
  }

  async addTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { ApiResponse.created(res, await this.svc.addTask(req.params.id, req.params.sectionId, req.body)); } catch (e) { next(e); }
  }

  async updateTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { ApiResponse.ok(res, await this.svc.updateTask(req.params.id, req.params.sectionId, req.params.taskId, req.body)); } catch (e) { next(e); }
  }

  async removeTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try { await this.svc.removeTask(req.params.id, req.params.sectionId, req.params.taskId); ApiResponse.noContent(res); } catch (e) { next(e); }
  }

  async addSectionAssignee(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      ApiResponse.created(res, await this.svc.addSectionAssignee(req.params.id, req.params.sectionId, req.body.employeeId));
    } catch (e) { next(e); }
  }

  async removeSectionAssignee(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.svc.removeSectionAssignee(req.params.id, req.params.sectionId, req.params.employeeId);
      ApiResponse.noContent(res);
    } catch (e) { next(e); }
  }
}
