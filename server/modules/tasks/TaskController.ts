import type { Request, Response, NextFunction } from "express";
import { TaskService } from "./TaskService.js";
import { CreateTaskSchema, UpdateTaskSchema, CreateTaskCommentSchema } from "./Task.validators.js";
import { ApiResponse } from "../../core/utils/apiResponse.js";
import { regionCtxFromRequest } from "../../lib/moduleRegionCtx.js";

export class TaskController {
  private readonly service = new TaskService();

  constructor() {
    this.list = this.list.bind(this);
    this.stats = this.stats.bind(this);
    this.getById = this.getById.bind(this);
    this.create = this.create.bind(this);
    this.update = this.update.bind(this);
    this.remove = this.remove.bind(this);
    this.addComment = this.addComment.bind(this);
    this.removeComment = this.removeComment.bind(this);
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const ctx = regionCtxFromRequest(req);
      const tasks = await this.service.listTasks(
        { userId: user.id, role: user.role, employeeId: user.employeeId, roles: user.roles },
        {
          status: req.query.status as string,
          priority: req.query.priority as string,
          category: req.query.category as string,
          assigneeId: req.query.assigneeId as string,
          search: req.query.search as string,
          createdByMe: req.query.createdByMe === "true" || req.query.createdByMe === "1",
          limit: Math.min(parseInt(req.query.limit as string) || 200, 500),
          offset: parseInt(req.query.offset as string) || 0,
        },
        ctx,
      );
      ApiResponse.ok(res, tasks);
    } catch (err) { next(err); }
  }

  async stats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const data = await this.service.getStats({ userId: user.id, role: user.role, employeeId: user.employeeId, roles: user.roles }, regionCtxFromRequest(req));
      ApiResponse.ok(res, data);
    } catch (err) { next(err); }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      ApiResponse.ok(res, await this.service.getTask(req.params.id, regionCtxFromRequest(req)));
    } catch (err) { next(err); }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = CreateTaskSchema.safeParse(req.body);
      if (!parsed.success) { ApiResponse.error(res, 400, parsed.error.errors.map(e => e.message).join("; "), "VALIDATION_ERROR"); return; }
      ApiResponse.created(res, await this.service.createTask(parsed.data, req.user!.id, regionCtxFromRequest(req)));
    } catch (err) { next(err); }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = UpdateTaskSchema.safeParse(req.body);
      if (!parsed.success) { ApiResponse.error(res, 400, parsed.error.errors.map(e => e.message).join("; "), "VALIDATION_ERROR"); return; }
      ApiResponse.ok(res, await this.service.updateTask(req.params.id, parsed.data, req.user!.id, regionCtxFromRequest(req)));
    } catch (err) { next(err); }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.service.deleteTask(req.params.id, { id: req.user!.id, role: req.user!.role }, regionCtxFromRequest(req));
      ApiResponse.noContent(res);
    } catch (err) { next(err); }
  }

  async addComment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = CreateTaskCommentSchema.safeParse(req.body);
      if (!parsed.success) { ApiResponse.error(res, 400, parsed.error.errors.map(e => e.message).join("; "), "VALIDATION_ERROR"); return; }
      ApiResponse.created(res, await this.service.addComment(req.params.id, req.user!.id, parsed.data, regionCtxFromRequest(req)));
    } catch (err) { next(err); }
  }

  async removeComment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.service.deleteComment(req.params.id, req.params.commentId, { id: req.user!.id, role: req.user!.role }, regionCtxFromRequest(req));
      ApiResponse.noContent(res);
    } catch (err) { next(err); }
  }
}
