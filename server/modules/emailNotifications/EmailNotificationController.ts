import type { Request, Response, NextFunction } from "express";
import { EmailNotificationService } from "./EmailNotificationService.js";
import { appendAuditLog, getClientAuditMeta } from "../../lib/auditAppend.js";

export class EmailNotificationController {
  private readonly svc = new EmailNotificationService();

  listGrouped = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.svc.listGrouped();
      res.json(data);
    } catch (e) { next(e); }
  };

  getOne = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.svc.getOne(req.params.eventKey);
      res.json(data);
    } catch (e) { next(e); }
  };

  setEnabled = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { enabled } = req.body;
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "enabled must be a boolean" });
      }
      const data = await this.svc.setEnabled(req.params.eventKey, enabled);
      res.json(data);
    } catch (e) { next(e); }
  };

  updateTemplate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { subjectTemplate, bodyTemplate } = req.body;
      const data = await this.svc.updateTemplate(
        req.params.eventKey,
        subjectTemplate,
        bodyTemplate,
      );
      const userId = (req as { user?: { id: string } }).user?.id;
      if (userId) {
        await appendAuditLog({
          entityType: "email_notification",
          entityId: req.params.eventKey,
          action: "UPDATE_TEMPLATE",
          performedBy: userId,
          details: {
            subjectPreview: typeof subjectTemplate === "string" ? subjectTemplate.slice(0, 120) : "",
            bodyChars: typeof bodyTemplate === "string" ? bodyTemplate.length : 0,
          },
          ...getClientAuditMeta(req),
        });
      }
      res.json(data);
    } catch (e) { next(e); }
  };

  resetToDefault = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.svc.resetToDefault(req.params.eventKey);
      const userId = (req as { user?: { id: string } }).user?.id;
      if (userId) {
        await appendAuditLog({
          entityType: "email_notification",
          entityId: req.params.eventKey,
          action: "RESET_TEMPLATE",
          performedBy: userId,
          details: {},
          ...getClientAuditMeta(req),
        });
      }
      res.json(data);
    } catch (e) { next(e); }
  };

  getLogs = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const eventKey = typeof req.query.eventKey === "string" ? req.query.eventKey : undefined;
      const limit = Math.min(parseInt(String(req.query.limit ?? 100), 10) || 100, 500);
      const offset = parseInt(String(req.query.offset ?? 0), 10) || 0;
      const data = await this.svc.getLogs(eventKey, limit, offset);
      res.json(data);
    } catch (e) { next(e); }
  };
}
