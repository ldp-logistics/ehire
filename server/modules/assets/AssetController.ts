import type { Request, Response, NextFunction } from "express";
import { AssetService } from "./AssetService.js";
import { getAvatarContentBySharingUrl, parseDataUrl } from "../../lib/sharepoint.js";
import { regionCtxFromRequest } from "../../lib/moduleRegionCtx.js";

const adminHRIT = (role: string) => ["admin","hr","it"].includes(role);
const adminIT = (role: string) => ["admin","it"].includes(role);

function getBaseInfo(req: Request) { return { host: req.get("host")||"localhost", protocol: req.protocol||"https" }; }

export class AssetController {
  private readonly svc = new AssetService();
  constructor() { const b=(c:any)=>{for(const k of Object.getOwnPropertyNames(Object.getPrototypeOf(c)))if(k!=="constructor"&&typeof c[k]==="function")c[k]=c[k].bind(c)};b(this); }

  // ── Public ────────────────────────────────────────────────────────────────────
  async publicView(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.getPublicAsset(req.params.assetId, req.get("host")||"", req.protocol)); } catch (e) { next(e); } }

  // ── Stock ────────────────────────────────────────────────────────────────────
  async listStock(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.listStock(parseInt(req.query.limit as string)||100, parseInt(req.query.offset as string)||0, regionCtxFromRequest(req))); } catch (e) { next(e); } }
  async getStockById(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.getStockById(req.params.id, regionCtxFromRequest(req))); } catch (e) { next(e); } }
  async createStock(req: Request, res: Response, next: NextFunction) { try { res.status(201).json(await this.svc.createStock(req.body, req.user?.id, req.user?.email, regionCtxFromRequest(req))); } catch (e: any) { if (e?.name==="ZodError") { res.status(400).json({error:"Validation failed",details:e.errors}); return; } next(e); } }
  async updateStock(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.updateStock(req.params.id, req.body, req.user?.id, req.user?.email, regionCtxFromRequest(req))); } catch (e) { next(e); } }
  async deleteStock(req: Request, res: Response, next: NextFunction) { try { await this.svc.deleteStock(req.params.id, req.user?.id, req.user?.email, regionCtxFromRequest(req)); res.json({message:"Stock item deleted"}); } catch (e) { next(e); } }
  async stockQR(req: Request, res: Response, next: NextFunction) { try { const buf = await this.svc.getStockQR(req.params.id, parseInt(req.query.size as string)||256, req.get("host")||"", req.protocol, regionCtxFromRequest(req)); res.setHeader("Content-Type","image/png"); res.setHeader("Cache-Control","private, max-age=300"); res.send(buf); } catch (e) { next(e); } }

  // ── Systems ──────────────────────────────────────────────────────────────────
  async listSystems(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.listSystems(regionCtxFromRequest(req))); } catch (e) { next(e); } }
  async getSystemById(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.getSystemById(req.params.id, regionCtxFromRequest(req))); } catch (e) { next(e); } }
  async getSystemsByUser(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.getSystemsByUser(req.params.userId)); } catch (e) { next(e); } }
  async getMySystems(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.getMySystems(req.user?.employeeId, req.user?.email)); } catch (e) { next(e); } }
  async createSystem(req: Request, res: Response, next: NextFunction) { try { res.status(201).json(await this.svc.createSystem(req.body, req.user?.id, req.user?.email, regionCtxFromRequest(req))); } catch (e: any) { if (e?.name==="ZodError") { res.status(400).json({error:"Validation failed",details:e.errors}); return; } next(e); } }
  async updateSystem(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.updateSystem(req.params.id, req.body, req.user?.id, req.user?.email, regionCtxFromRequest(req))); } catch (e) { next(e); } }
  async deleteSystem(req: Request, res: Response, next: NextFunction) { try { await this.svc.deleteSystem(req.params.id, req.user?.id, req.user?.email, regionCtxFromRequest(req)); res.json({message:"System deleted"}); } catch (e) { next(e); } }
  async assignFromStock(req: Request, res: Response, next: NextFunction) { try { res.status(201).json(await this.svc.assignFromStock(req.body, req.user?.id, req.user?.email, regionCtxFromRequest(req))); } catch (e) { next(e); } }
  async systemQR(req: Request, res: Response, next: NextFunction) { try { const buf = await this.svc.getSystemQR(req.params.id, parseInt(req.query.size as string)||256, req.get("host")||"", req.protocol); res.setHeader("Content-Type","image/png"); res.setHeader("Cache-Control","private, max-age=300"); res.send(buf); } catch (e) { next(e); } }

  // ── Tickets ──────────────────────────────────────────────────────────────────
  async listTickets(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.listTickets(adminHRIT(req.user!.role), req.user?.employeeId)); } catch (e) { next(e); } }
  async listItAssignees(_req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.listItAssigneeCandidates()); } catch (e) { next(e); } }
  async getMyTickets(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.getMyTickets(req.user?.employeeId)); } catch (e) { next(e); } }
  async getTicketById(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.getTicketById(req.params.id, adminHRIT(req.user!.role), req.user?.employeeId)); } catch (e) { next(e); } }
  async getTicketAttachment(req: Request, res: Response, next: NextFunction) {
    try {
      const { url, name } = await this.svc.getTicketAttachmentMeta(
        req.params.id,
        adminHRIT(req.user!.role),
        req.user?.employeeId,
      );
      const fileName = name.replace(/"/g, "%22");
      const disposition = `inline; filename="${fileName}"`;

      if (url.startsWith("data:")) {
        const parsed = parseDataUrl(url);
        if (parsed) {
          res.setHeader("Content-Type", parsed.contentType);
          res.setHeader("Content-Disposition", disposition);
          return res.send(parsed.buffer);
        }
      }
      if (url.startsWith("https://") || url.startsWith("http://")) {
        const isSharePoint = /sharepoint\.com|onedrive\.live\.com/i.test(url);
        if (isSharePoint) {
          const result = await getAvatarContentBySharingUrl(url);
          if (result) {
            res.setHeader("Content-Type", result.contentType || "application/octet-stream");
            res.setHeader("Content-Disposition", disposition);
            return res.send(result.buffer);
          }
        } else {
          const fetchRes = await fetch(url, { headers: { Accept: "*/*" } });
          if (fetchRes.ok) {
            const contentType = fetchRes.headers.get("Content-Type") || "application/octet-stream";
            const buffer = Buffer.from(await fetchRes.arrayBuffer());
            res.setHeader("Content-Type", contentType);
            res.setHeader("Content-Disposition", disposition);
            return res.send(buffer);
          }
        }
      }
      res.status(404).json({ error: "Attachment not found" });
    } catch (e) { next(e); }
  }
  async createTicket(req: Request, res: Response, next: NextFunction) { try { res.status(201).json(await this.svc.createTicket(req.body, req.user!)); } catch (e: any) { if (e?.name==="ZodError") { res.status(400).json({error:"Validation failed",details:e.errors}); return; } next(e); } }
  async updateTicket(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.updateTicket(req.params.id, req.body, adminHRIT(req.user!.role), req.user?.employeeId, req.user?.id, req.user?.email)); } catch (e) { next(e); } }
  async deleteTicket(req: Request, res: Response, next: NextFunction) { try { await this.svc.deleteTicket(req.params.id, req.user?.id, req.user?.email); res.json({message:"Ticket deleted"}); } catch (e) { next(e); } }
  async getTicketComments(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.getTicketComments(req.params.ticketId, adminHRIT(req.user!.role), req.user?.employeeId)); } catch (e) { next(e); } }
  async addComment(req: Request, res: Response, next: NextFunction) { try { res.status(201).json(await this.svc.addComment(req.params.ticketId, req.body, req.user!)); } catch (e: any) { if (e?.name==="ZodError") { res.status(400).json({error:"Validation failed",details:e.errors}); return; } next(e); } }
  async updateTicketStatus(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.updateTicketStatus(req.params.ticketId, req.body.status, req.body.comment, req.user!)); } catch (e) { next(e); } }

  // ── Audit / Invoices / Stats ──────────────────────────────────────────────────
  async getAuditLog(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.getAuditLog(req.query.entityType as string, req.query.entityId as string, Number(req.query.limit)||100, Number(req.query.offset)||0)); } catch (e) { next(e); } }
  async listInvoices(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.listInvoices(parseInt(req.query.limit as string)||100, parseInt(req.query.offset as string)||0)); } catch (e) { next(e); } }
  async getInvoiceById(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.getInvoiceById(req.params.id)); } catch (e) { next(e); } }
  async getInvoiceFile(req: Request, res: Response, next: NextFunction) {
    try {
      const f = await this.svc.getInvoiceFile(req.params.id);
      const path = (f.file_path ?? "").trim();
      const fileName = (f.file_name || "invoice.pdf").replace(/"/g, "%22");
      const disposition = `inline; filename="${fileName}"`;

      if (path.startsWith("data:application/pdf;base64,")) {
        const buf = Buffer.from(path.slice("data:application/pdf;base64,".length), "base64");
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", disposition);
        return res.send(buf);
      }
      if (path.startsWith("https://") || path.startsWith("http://")) {
        const isSharePoint = /sharepoint\.com|onedrive\.live\.com/i.test(path);
        if (isSharePoint) {
          const result = await getAvatarContentBySharingUrl(path);
          if (result) {
            res.setHeader("Content-Type", result.contentType || "application/pdf");
            res.setHeader("Content-Disposition", disposition);
            return res.send(result.buffer);
          }
        } else {
          const fetchRes = await fetch(path, { headers: { Accept: "*/*" } });
          if (fetchRes.ok) {
            const contentType = fetchRes.headers.get("Content-Type") || "application/pdf";
            const buffer = Buffer.from(await fetchRes.arrayBuffer());
            res.setHeader("Content-Type", contentType);
            res.setHeader("Content-Disposition", disposition);
            return res.send(buffer);
          }
        }
      }
      res.status(404).json({ error: "No PDF file attached" });
    } catch (e) { next(e); }
  }
  async createInvoice(req: Request, res: Response, next: NextFunction) { try { res.status(201).json(await this.svc.createInvoice(req.body, req.user?.id, req.user?.email)); } catch (e: any) { if (e?.name==="ZodError") { res.status(400).json({error:"Validation failed",details:e.errors}); return; } next(e); } }
  async updateInvoice(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.updateInvoice(req.params.id, req.body, req.user?.id, req.user?.email)); } catch (e) { next(e); } }
  async deleteInvoice(req: Request, res: Response, next: NextFunction) { try { await this.svc.deleteInvoice(req.params.id, req.user?.id, req.user?.email); res.json({message:"Invoice deleted"}); } catch (e) { next(e); } }
  async getStats(req: Request, res: Response, next: NextFunction) { try { res.json(await this.svc.getStats(regionCtxFromRequest(req))); } catch (e) { next(e); } }
  async getRecentReturns(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await this.svc.getRecentReturns(Number(req.query.limit) || 8, regionCtxFromRequest(req)));
    } catch (e) {
      next(e);
    }
  }
}
