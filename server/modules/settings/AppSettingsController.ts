import type { Request, Response, NextFunction } from "express";
import { AppSettingsService, type EmailBrandingDTO } from "./AppSettingsService.js";
import { ValidationError } from "../../core/types/index.js";
import { appendAuditLog, getClientAuditMeta } from "../../lib/auditAppend.js";

export class AppSettingsController {
  private readonly svc = new AppSettingsService();

  /** Proxied image bytes (SharePoint → app); use in CSS/img so cookies / Graph work like avatars. */
  getEmployeeProfileBannerImage = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.svc.getEmployeeProfileBannerBinary();
      if (!result) {
        res.status(404).end();
        return;
      }
      res.setHeader("Content-Type", result.contentType);
      res.setHeader("Cache-Control", "private, max-age=300");
      res.send(result.buffer);
    } catch (e) {
      next(e);
    }
  };

  getEmployeeProfileBanner = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = await this.svc.getEmployeeProfileBannerDto();
      res.json(dto);
    } catch (e) {
      next(e);
    }
  };

  putEmployeeProfileBanner = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const image = req.body?.image;
      if (typeof image !== "string" || !image.trim()) {
        throw new ValidationError("image (data URL) is required");
      }
      const dto = await this.svc.setEmployeeProfileBannerFromDataUrl(image);
      res.json({ ...dto, message: "Banner updated" });
    } catch (e) {
      next(e);
    }
  };

  deleteEmployeeProfileBanner = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.svc.clearEmployeeProfileBanner();
      const userId = (req as { user?: { id: string } }).user?.id;
      if (userId) {
        await appendAuditLog({
          entityType: "app_settings",
          entityId: "employee_profile_banner",
          action: "DELETE",
          performedBy: userId,
          details: { key: "employee_profile_banner" },
          ...getClientAuditMeta(req),
        });
      }
      res.json({ bannerUrl: null, updatedAt: null, message: "Banner removed" });
    } catch (e) {
      next(e);
    }
  };

  // ── Email branding ────────────────────────────────────────────────────────

  getEmailBranding = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.svc.getEmailBranding());
    } catch (e) { next(e); }
  };

  putEmailBranding = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const patch: Partial<EmailBrandingDTO> = req.body ?? {};
      const dto = await this.svc.updateEmailBranding(patch);
      res.json(dto);
    } catch (e) { next(e); }
  };

  resetEmailBranding = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = await this.svc.resetEmailBranding();
      const userId = (req as { user?: { id: string } }).user?.id;
      if (userId) {
        await appendAuditLog({
          entityType: "app_settings",
          entityId: "email_branding",
          action: "RESET",
          performedBy: userId,
          ...getClientAuditMeta(req),
        });
      }
      res.json(dto);
    } catch (e) { next(e); }
  };

  listPublicLogos = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.svc.listPublicLogos());
    } catch (e) { next(e); }
  };

  // ── Onsite interview locations ────────────────────────────────────────────

  getInterviewOnsiteLocations = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ locations: await this.svc.getInterviewOnsiteLocations() });
    } catch (e) { next(e); }
  };

  putInterviewOnsiteLocations = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { locations } = req.body ?? {};
      if (!Array.isArray(locations)) throw new ValidationError("locations must be an array");
      const saved = await this.svc.setInterviewOnsiteLocations(locations);
      res.json({ locations: saved });
    } catch (e) { next(e); }
  };

}
