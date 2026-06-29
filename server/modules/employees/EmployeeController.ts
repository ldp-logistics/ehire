import type { Request, Response, NextFunction } from "express";
import { EmployeeService } from "./EmployeeService.js";
import { ApiResponse } from "../../core/utils/apiResponse.js";
import { getClientAuditMeta } from "../../lib/auditAppend.js";

export class EmployeeController {
  private readonly svc = new EmployeeService();
  constructor() { const b=(c:any)=>{for(const k of Object.getOwnPropertyNames(Object.getPrototypeOf(c)))if(k!=="constructor"&&typeof c[k]==="function")c[k]=c[k].bind(c)};b(this); }

  async list(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.list(req.query as any, req.user)); } catch (e) { next(e); } }
  async getById(req: Request, res: Response, next: NextFunction) {
    try { res.json(await this.svc.getById(req.params.id, req.user!.role, req.user!.employeeId, req.user)); }
    catch (e: any) { if (e?.statusCode) return res.status(e.statusCode).json({ error: e.message }); next(e); }
  }
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const audit = { userId: req.user!.id, ...getClientAuditMeta(req) };
      ApiResponse.created(res, await this.svc.create(req.body, req.user!.role, audit));
    } catch (e) { next(e); }
  }
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const audit = { userId: req.user!.id, ...getClientAuditMeta(req) };
      res.json({ message:"Employee updated successfully", employee: await this.svc.update(req.params.id, req.body, req.user!.id, req.user!.role, req.user, audit) });
    }
    catch (e: any) { if (e?.statusCode) return res.status(e.statusCode).json({ error: e.message }); next(e); }
  }
  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await this.svc.delete(req.params.id, { userId: req.user!.id, ...getClientAuditMeta(req) });
      res.json({ message:"Employee deleted successfully" });
    } catch (e) { next(e); }
  }
  async getDepartments(_: Request, res: Response, next: NextFunction) { try { res.json({ departments: await this.svc.getDepartments() }); } catch (e) { next(e); } }
  async getSuggestedId(_: Request, res: Response, next: NextFunction) { try { res.json({ suggestedId: await this.svc.getSuggestedId() }); } catch (e) { next(e); } }

  async sendWelcomeInvitation(req: Request, res: Response, next: NextFunction) {
    try {
      const audit = { userId: req.user!.id, ...getClientAuditMeta(req) };
      res.json(await this.svc.sendWelcomeInvitation(req.params.id, audit));
    } catch (e) { next(e); }
  }

  async getAvatar(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await this.svc.getAvatar(req.params.id, req.user);
      if (!result) { res.status(404).end(); return; }
      res.setHeader("Content-Type", result.contentType);
      res.setHeader("Cache-Control", "private, max-age=86400");
      res.send(result.buffer);
    } catch (e) { next(e); }
  }

  async getDocumentFile(req: Request, res: Response, next: NextFunction) {
    try {
      const doc = await this.svc.getDocumentFile(req.params.docId, req.user!.role, req.user!.employeeId);
      if (!doc.file_url) { res.status(404).json({ error:"No file for this document" }); return; }
      if (doc.file_url.startsWith("data:")) {
        const match = doc.file_url.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) { res.status(400).json({ error:"Invalid file data" }); return; }
        res.setHeader("Content-Type", match[1]);
        res.setHeader("Content-Disposition", `inline; filename="${(doc.file_name||"document").replace(/"/g,"%22")}"`);
        res.setHeader("Cache-Control", "private, max-age=3600");
        res.send(Buffer.from(match[2],"base64")); return;
      }
      res.redirect(302, doc.file_url);
    } catch (e) { next(e); }
  }

  async listDocuments(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.listDocuments(req.params.id)); } catch (e) { next(e); } }
  async uploadDocument(req: Request, res: Response, next: NextFunction) { try { ApiResponse.created(res, await this.svc.uploadDocument(req.params.id, req.body.fileUrl, req.body.fileName, req.body.documentType, req.body.displayName)); } catch (e) { next(e); } }
  async deleteDocument(req: Request, res: Response, next: NextFunction) { try { await this.svc.deleteDocument(req.params.docId); res.json({ message:"Deleted" }); } catch (e) { next(e); } }
  async getTimeline(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.getTimeline(req.params.id)); } catch (e) { next(e); } }
  async syncTentativeDocuments(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.syncTentativeDocuments(req.params.id)); } catch (e) { next(e); } }

  async migrateAvatarsFromUrls(_: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.migrateAvatarsFromUrls()); } catch (e) { next(e); } }
  async migrateAvatarsToSharePoint(_: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.migrateAvatarsToSharePoint()); } catch (e) { next(e); } }
  async importFreshteamCsv(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.importFreshteamCsv(req.body?.csv)); } catch (e) { next(e); } }
  async importFreshteamExtras(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.importFreshteamExtras(req.body)); } catch (e) { next(e); } }

  async getDependents(req: Request, res: Response, next: NextFunction) {
    try { ApiResponse.ok(res, await this.svc.getDependents(req.params.id)); } catch (e) { next(e); }
  }
  async createDependent(req: Request, res: Response, next: NextFunction) {
    try { ApiResponse.created(res, await this.svc.createDependent(req.params.id, req.body ?? {})); } catch (e) { next(e); }
  }
  async updateDependent(req: Request, res: Response, next: NextFunction) {
    try { ApiResponse.ok(res, await this.svc.updateDependent(req.params.depId, req.body ?? {})); } catch (e) { next(e); }
  }
  async deleteDependent(req: Request, res: Response, next: NextFunction) {
    try { await this.svc.deleteDependent(req.params.depId); ApiResponse.ok(res, { message: "Deleted" }); } catch (e) { next(e); }
  }

  async getEmergencyContacts(req: Request, res: Response, next: NextFunction) {
    try { ApiResponse.ok(res, await this.svc.getEmergencyContacts(req.params.id)); } catch (e) { next(e); }
  }
  async createEmergencyContact(req: Request, res: Response, next: NextFunction) {
    try { ApiResponse.created(res, await this.svc.createEmergencyContact(req.params.id, req.body ?? {})); } catch (e) { next(e); }
  }
  async updateEmergencyContact(req: Request, res: Response, next: NextFunction) {
    try { ApiResponse.ok(res, await this.svc.updateEmergencyContact(req.params.contactId, req.body ?? {})); } catch (e) { next(e); }
  }
  async deleteEmergencyContact(req: Request, res: Response, next: NextFunction) {
    try { await this.svc.deleteEmergencyContact(req.params.contactId); ApiResponse.ok(res, { message: "Deleted" }); } catch (e) { next(e); }
  }
}
