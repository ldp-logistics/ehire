/**
 * FeedController — thin HTTP adapter for company feed.
 * Validate → call service → respond. Nothing else.
 */

import type { Request, Response, NextFunction } from "express";
import { FeedService } from "./FeedService.js";
import { CreatePostSchema, ToggleReactionSchema } from "./Feed.validators.js";
import { ApiResponse } from "../../core/utils/apiResponse.js";

export class FeedController {
  private readonly svc: FeedService;

  constructor() {
    this.svc  = new FeedService();
    this.list          = this.list.bind(this);
    this.create        = this.create.bind(this);
    this.remove        = this.remove.bind(this);
    this.toggleReaction = this.toggleReaction.bind(this);
    this.getAttachmentContent = this.getAttachmentContent.bind(this);
    this.mentionable         = this.mentionable.bind(this);
  }

  /** GET /api/feed/mentionable?q= */
  async mentionable(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q = String(req.query.q ?? "").trim();
      const users = await this.svc.listMentionable(q);
      ApiResponse.ok(res, users);
    } catch (err) { next(err); }
  }

  /** GET /api/feed/attachments/:attachmentId/content — proxied bytes for images/files */
  async getAttachmentContent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.svc.getAttachmentBinary(req.params.attachmentId);
      if (!result) {
        res.status(404).end();
        return;
      }
      res.setHeader("Content-Type", result.contentType);
      res.setHeader("Cache-Control", "private, max-age=300");
      const safeName = result.fileName.replace(/[^\w.\-() ]+/g, "_");
      res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);
      res.send(result.buffer);
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/feed?page=1&limit=20 */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page  = Math.max(1, parseInt(String(req.query.page  ?? "1"), 10)  || 1);
      const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));
      const result = await this.svc.listPosts(page, limit);
      ApiResponse.ok(res, result);
    } catch (err) { next(err); }
  }

  /** POST /api/feed */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = CreatePostSchema.safeParse(req.body);
      if (!parsed.success) {
        ApiResponse.error(res, 400, parsed.error.errors.map((e) => e.message).join("; "), "VALIDATION_ERROR");
        return;
      }

      const employeeId = req.user!.employeeId;
      if (!employeeId) {
        ApiResponse.error(res, 400, "No employee profile linked to this account", "NO_EMPLOYEE");
        return;
      }

      const post = await this.svc.createPost(
        employeeId,
        req.user!.role,
        parsed.data,
      );
      ApiResponse.created(res, post, "Post created");
    } catch (err) { next(err); }
  }

  /** DELETE /api/feed/:id */
  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const employeeId = req.user!.employeeId ?? "";
      await this.svc.deletePost(req.params.id, employeeId, req.user!.role);
      ApiResponse.noContent(res);
    } catch (err) { next(err); }
  }

  /** POST /api/feed/:id/reactions */
  async toggleReaction(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = ToggleReactionSchema.safeParse(req.body);
      if (!parsed.success) {
        ApiResponse.error(res, 400, parsed.error.errors.map((e) => e.message).join("; "), "VALIDATION_ERROR");
        return;
      }

      const employeeId = req.user!.employeeId;
      if (!employeeId) {
        ApiResponse.error(res, 400, "No employee profile linked to this account", "NO_EMPLOYEE");
        return;
      }

      const result = await this.svc.toggleReaction(req.params.id, employeeId, parsed.data.emoji);
      ApiResponse.ok(res, result);
    } catch (err) { next(err); }
  }
}
