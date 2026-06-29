/**
 * ResourceController — thin HTTP adapter.
 *
 * Rules:
 *  • Validate → call service → respond. Nothing else.
 *  • All errors go to next(err) for the global error handler.
 *  • No SQL, no business logic.
 */

import type { Request, Response, NextFunction } from "express";
import { ResourceService } from "./ResourceService.js";
import { CreateResourceSchema, UpdateResourceSchema } from "./Resource.validators.js";
import { ApiResponse } from "../../core/utils/apiResponse.js";
import { parsePagination } from "../../core/utils/pagination.js";

export class ResourceController {
  private readonly service: ResourceService;

  constructor() {
    this.service = new ResourceService();
    this.list    = this.list.bind(this);
    this.getById = this.getById.bind(this);
    this.create  = this.create.bind(this);
    this.update  = this.update.bind(this);
    this.remove  = this.remove.bind(this);
  }

  /** GET /api/resources?page=&limit=&search= */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const params = parsePagination(req.query as Record<string, unknown>);
      const result = await this.service.listResources(params);
      ApiResponse.paginated(res, result);
    } catch (err) { next(err); }
  }

  /** GET /api/resources/:id */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const resource = await this.service.getResource(req.params.id);
      ApiResponse.ok(res, resource);
    } catch (err) { next(err); }
  }

  /** POST /api/resources */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = CreateResourceSchema.safeParse(req.body);
      if (!parsed.success) {
        ApiResponse.error(res, 400, parsed.error.errors.map((e) => e.message).join("; "), "VALIDATION_ERROR");
        return;
      }
      const resource = await this.service.createResource(parsed.data);
      ApiResponse.created(res, resource, "Resource created");
    } catch (err) { next(err); }
  }

  /** PUT /api/resources/:id */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = UpdateResourceSchema.safeParse(req.body);
      if (!parsed.success) {
        ApiResponse.error(res, 400, parsed.error.errors.map((e) => e.message).join("; "), "VALIDATION_ERROR");
        return;
      }
      const resource = await this.service.updateResource(req.params.id, parsed.data);
      ApiResponse.ok(res, resource, "Resource updated");
    } catch (err) { next(err); }
  }

  /** DELETE /api/resources/:id */
  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.service.deleteResource(req.params.id);
      ApiResponse.noContent(res);
    } catch (err) { next(err); }
  }
}
