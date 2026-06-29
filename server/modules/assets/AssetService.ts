import { AssetRepository } from "./AssetRepository.js";
import { NotFoundError, ValidationError, ConflictError, ForbiddenError } from "../../core/types/index.js";
import { formatEmployeeAssetAssigneeName } from "../../../shared/employeeDisplayName.js";
import { effectiveRegionsFor, getEmployeeRegion, isValidRegionCode } from "../../lib/regionAccess.js";
import type { ModuleRegionCtx } from "../../lib/moduleRegionCtx.js";

const RETURN_REASON_LABELS: Record<string, string> = {
  offboarding_complete: "Offboarding completed",
  offboarding_asset_return_task: "Offboarding checklist",
  employee_deleted: "Employee deleted",
  employee_departed: "Employee left",
  manual_unassign: "Unassigned by IT",
  returned: "Returned to stock",
};

function parseAuditChanges(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
import { insertStockItemSchema, insertAssignedSystemSchema, insertSupportTicketSchema, insertTicketCommentSchema, insertInvoiceSchema } from "../../db/schema/assets.js";
import { parseDataUrl, uploadFileToSharePoint, isSharePointAvatarConfigured } from "../../lib/sharepoint.js";
import { notifyEmail } from "../../lib/emailNotifications.js";
import {
  notifyTicketAssigned,
  notifyTicketCreated,
  notifyTicketStatusChange,
} from "./ticketNotifications.js";
import crypto from "node:crypto";

function generateTicketNumber() { return "TKT-"+Date.now().toString(36).toUpperCase(); }
function getBaseUrl(host: string, protocol: string) { if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL; return `${protocol}://${host}`; }

export class AssetService {
  private readonly repo = new AssetRepository();

  private regionsFor(ctx?: ModuleRegionCtx): string[] | null {
    return ctx ? effectiveRegionsFor(ctx, ctx.requestedRegion) : null;
  }

  /** Stock inventory is strictly per-region (like benefits cards). */
  private stockRegionsFor(ctx?: ModuleRegionCtx): string[] {
    if (!ctx) return [];
    const effective = effectiveRegionsFor(ctx, ctx.requestedRegion);
    if (effective !== null) return effective;
    if (ctx.regionCode && isValidRegionCode(ctx.regionCode)) return [ctx.regionCode];
    return [];
  }

  private resolveStockCreateRegion(ctx?: ModuleRegionCtx): string {
    const regions = this.stockRegionsFor(ctx);
    if (regions.length !== 1) {
      throw new ValidationError("Select a region before adding stock.");
    }
    return regions[0];
  }

  private async assertStockInScope(ctx: ModuleRegionCtx | undefined, stockId: string): Promise<void> {
    const regions = this.stockRegionsFor(ctx);
    if (regions.length === 0) {
      throw new ForbiddenError("Select a region to access stock inventory.");
    }
    const stock = await this.repo.getStockById(stockId);
    if (!stock?.region_code) {
      throw new ForbiddenError("This stock item is not assigned to a region.");
    }
    if (!regions.includes(String(stock.region_code))) {
      throw new ForbiddenError("This stock item belongs to a different region.");
    }
  }

  private async assertEmployeeInScope(ctx: ModuleRegionCtx | undefined, employeeId: string | null | undefined): Promise<void> {
    if (!employeeId || !ctx) return;
    const regions = this.regionsFor(ctx);
    if (regions === null) return;
    const empRegion = await getEmployeeRegion(employeeId);
    if (regions.length === 0 || !empRegion || !regions.includes(empRegion)) {
      throw new ForbiddenError("This employee belongs to a different region.");
    }
  }

  private async assertSystemInScope(ctx: ModuleRegionCtx | undefined, systemId: string): Promise<void> {
    const row = await this.repo.getSystemById(systemId);
    if (!row?.user_id) return;
    await this.assertEmployeeInScope(ctx, row.user_id);
  }

  // ── Public view ──────────────────────────────────────────────────────────────
  async getPublicAsset(assetId: string, host: string, protocol: string) {
    const stock = await this.repo.getPublicStock(assetId);
    if (stock) return { type:"stock", assetId:stock.asset_id, name:stock.name, category:stock.category, productType:stock.product_type, quantity:stock.quantity, available:stock.available, description:stock.description, specs:stock.specs, status:`${stock.available||0} of ${stock.quantity||0} available` };
    const a = await this.repo.getPublicAssigned(assetId);
    if (!a) throw new NotFoundError("Asset", assetId);
    const trim = (v: any) => typeof v==="string"&&v.trim()!==""?v.trim():null;
    let dept = a.employee_department??null; let loc = trim(a.emp_location)??trim(a.emp_city)??trim(a.emp_comm_city)??null;
    if (dept==null||loc==null) { const emp = await this.repo.getEmployeeForAsset(a.user_id, a.user_email); if (emp) { if (dept==null) dept=emp.department??null; if (loc==null) loc=trim(emp.location)??trim(emp.city)??trim(emp.comm_city)??null; } }
    const cat = a.stock_category||"Other"; const productType=(a.stock_product_type&&String(a.stock_product_type).trim())||null;
    const assetType = productType||(cat==="Systems"?"Laptop":cat==="Other"?"Laptop":cat);
    return { type:"assigned", assetId:a.asset_id, name:a.stock_name||"Assigned asset", category:cat, assetType, specs:a.stock_specs||{ram:a.ram,storage:a.storage,processor:a.processor,generation:a.generation}, assignedTo:{name:a.user_name,email:a.user_email,department:dept,location:loc}, notes:a.notes, status:"Assigned" };
  }

  // ── Stock (per-region inventory) ─────────────────────────────────────────────
  async listStock(limit = 100, offset = 0, ctx?: ModuleRegionCtx) {
    return this.repo.listStock(Math.min(limit, 500), offset, this.stockRegionsFor(ctx));
  }
  async getStockById(id: string, ctx?: ModuleRegionCtx) {
    await this.assertStockInScope(ctx, id);
    const r = await this.repo.getStockById(id);
    if (!r) throw new NotFoundError("Stock item", id);
    return r;
  }
  async createStock(body: any, userId?: string, userEmail?: string, ctx?: ModuleRegionCtx) {
    const v = insertStockItemSchema.parse(body);
    const regionCode = this.resolveStockCreateRegion(ctx);
    const assetId = v.assetId?.trim() || (await this.repo.nextStockAssetId());
    const r = await this.repo.createStock({ ...v, assetId, regionCode });
    await this.repo.logAudit("stock", r.id, "create", { ...v, regionCode }, userId, userEmail);
    return r;
  }
  async updateStock(id: string, body: any, userId?: string, userEmail?: string, ctx?: ModuleRegionCtx) {
    await this.assertStockInScope(ctx, id);
    const existing = await this.repo.getStockById(id);
    if (!existing) throw new NotFoundError("Stock item", id);
    const r = await this.repo.updateStock(id, body);
    await this.repo.logAudit("stock", id, "update", { old: existing, new: r }, userId, userEmail);
    return r;
  }
  async deleteStock(id: string, userId?: string, userEmail?: string, ctx?: ModuleRegionCtx) {
    await this.assertStockInScope(ctx, id);
    const r = await this.repo.deleteStock(id);
    if (!r) throw new NotFoundError("Stock item", id);
    await this.repo.logAudit("stock", id, "delete", r, userId, userEmail);
  }
  async getStockQR(id: string, size = 256, host = "", protocol = "https", ctx?: ModuleRegionCtx) {
    await this.assertStockInScope(ctx, id);
    const row = await this.repo.getStockAssetId(id); if (!row?.asset_id) throw new NotFoundError("Stock item",id);
    const url = `${getBaseUrl(host,protocol)}/assets/view/${encodeURIComponent(row.asset_id)}`;
    return this.repo.generateQR(url, Math.min(Math.max(size,128),512));
  }

  // ── Assigned Systems ────────────────────────────────────────────────────────
  async listSystems(ctx?: ModuleRegionCtx) {
    return this.repo.listSystems(this.regionsFor(ctx));
  }
  async getSystemById(id: string, ctx?: ModuleRegionCtx) {
    await this.assertSystemInScope(ctx, id);
    const r = await this.repo.getSystemById(id); if (!r) throw new NotFoundError("System",id); return r;
  }
  async getSystemsByUser(userId: string) { return this.repo.getSystemsByUser(userId); }
  async getMySystems(employeeId?: string|null, email?: string) {
    let systems: any[] = [];
    if (employeeId) systems = await this.repo.getMySystemsByEmployeeId(employeeId);
    if (!systems.length && email) systems = await this.repo.getMySystemsByEmail(email);
    return systems;
  }
  async createSystem(body: any, userId?: string, userEmail?: string, ctx?: ModuleRegionCtx) {
    const v = insertAssignedSystemSchema.parse(body);
    if (v.userId) await this.assertEmployeeInScope(ctx, v.userId);
    const assetId = v.assetId?.trim()||(await this.repo.nextAssignedAssetId());
    const r = await this.repo.createSystem({ ...v, assetId });
    await this.repo.logAudit("system",r.id,"create",v,userId,userEmail);
    return r;
  }
  async updateSystem(id: string, body: any, userId?: string, userEmail?: string, ctx?: ModuleRegionCtx) {
    await this.assertSystemInScope(ctx, id);
    const existing = await this.repo.getSystemById(id); if (!existing) throw new NotFoundError("System",id);
    if (body.userId) await this.assertEmployeeInScope(ctx, body.userId);
    const r = await this.repo.updateSystem(id, body);
    await this.repo.logAudit("system",id,"update",{old:existing,new:r},userId,userEmail);
    return r;
  }
  async deleteSystem(id: string, userId?: string, userEmail?: string, ctx?: ModuleRegionCtx) {
    await this.assertSystemInScope(ctx, id);
    const r = await this.repo.deleteSystem(id); if (!r) throw new NotFoundError("System",id);
    await this.repo.logAudit("system",id,"delete",r,userId,userEmail);
  }

  /** Return one assignment to stock (e.g. offboarding asset-return task completed). */
  async releaseAssignmentToStock(
    assignmentId: string,
    reason: string,
    userId?: string,
    userEmail?: string,
  ) {
    const r = await this.repo.returnAssignmentToStock(assignmentId);
    if (!r) return null;
    await this.repo.logAudit(
      "system",
      assignmentId,
      "return_to_stock",
      {
        reason,
        assetId: r.asset_id,
        employeeId: r.user_id ?? null,
        assigneeName: r.user_name ?? null,
        stockItemId: r.stock_item_id ?? null,
      },
      userId,
      userEmail,
    );
    return r;
  }

  /**
   * Return every asset assigned to an employee to stock (offboarding complete or employee delete).
   */
  async releaseAllAssetsForEmployee(
    employeeId: string,
    options?: { workEmail?: string | null; offboardingId?: string; reason?: string; userId?: string; userEmail?: string },
  ) {
    const reason = options?.reason ?? "employee_departed";
    const released = await this.repo.returnAllAssignmentsToStockForEmployee(employeeId, options?.workEmail);
    const seen = new Set(released.map((r) => r.id));

    if (options?.offboardingId) {
      const linkedIds = await this.repo.listAssignmentIdsLinkedToOffboarding(options.offboardingId);
      for (const id of linkedIds) {
        if (seen.has(id)) continue;
        const row = await this.repo.returnAssignmentToStock(id);
        if (row) {
          released.push(row);
          seen.add(id);
        }
      }
    }

    for (const r of released) {
      await this.repo.logAudit(
        "system",
        r.id,
        "return_to_stock",
        {
          reason,
          employeeId,
          assetId: r.asset_id,
          assigneeName: r.user_name ?? null,
          stockItemId: r.stock_item_id ?? null,
        },
        options?.userId,
        options?.userEmail,
      );
    }
    return { count: released.length, released };
  }
  async hasStockAssignment(employeeId: string, stockItemId: string) {
    return this.repo.hasStockAssignment(employeeId, stockItemId);
  }
  async assignFromStock(body: any, userId?: string, userEmail?: string, ctx?: ModuleRegionCtx) {
    const { stockItemId, employeeId, ram, storage, processor, generation } = body;
    if (!stockItemId||!employeeId) throw new ValidationError("stockItemId and employeeId are required");
    // Onboarding / internal calls may omit request region ctx — derive from stock item.
    let scopeCtx = ctx;
    if (!scopeCtx || this.stockRegionsFor(scopeCtx).length === 0) {
      const stockPreview = await this.repo.getStockForAssign(stockItemId);
      if (stockPreview?.region_code) {
        const rc = String(stockPreview.region_code);
        scopeCtx = { regionCode: rc, requestedRegion: rc };
      }
    }
    await this.assertEmployeeInScope(scopeCtx, employeeId);
    await this.assertStockInScope(scopeCtx, stockItemId);
    const stock = await this.repo.getStockForAssign(stockItemId); if (!stock) throw new NotFoundError("Stock item",stockItemId);
    if ((stock.available??0)<=0) throw new ValidationError("No available units to assign");
    const emp = await this.repo.getEmployeeForAssign(employeeId); if (!emp) throw new NotFoundError("Employee",employeeId);
    const assetId = await this.repo.nextAssignedAssetId();
    const specs = stock.specs as Record<string,any>|null;
    const assigneeName = formatEmployeeAssetAssigneeName(emp.first_name, emp.last_name, emp.nickname);
    const r = await this.repo.assignFromStock({ assetId, stockItemId, userId:emp.id, userName:assigneeName, userEmail:emp.work_email||null, ram:ram??specs?.ram??null, storage:storage??specs?.storage??null, processor:processor??specs?.processor??null, generation:generation??specs?.generation??null });
    await this.repo.logAudit("system",r.id,"create",{stockItemId,employeeId,assetId},userId,userEmail);
    // Email: notify assigned employee
    if(emp.work_email) {
      const empName=assigneeName||"Employee";
      (async()=>{try{await notifyEmail("it.asset.assigned",{employee_name:empName,asset_name:stock.name||"Asset",asset_id:assetId,asset_category:stock.category||"Systems",doer_name:userEmail||"IT"},[{email:emp.work_email,name:empName}]);}catch{}})();
    }
    return r;
  }
  async getSystemQR(id: string, size=256, host="", protocol="https") {
    const row = await this.repo.getSystemAssetId(id); if (!row?.asset_id) throw new NotFoundError("System",id);
    const url = `${getBaseUrl(host,protocol)}/assets/view/${encodeURIComponent(row.asset_id)}`;
    return this.repo.generateQR(url, Math.min(Math.max(size,128),512));
  }

  // ── Tickets (global queue — all regions) ─────────────────────────────────────
  async listTickets(isAdminHR: boolean, employeeId?: string|null) {
    return this.repo.listTickets(isAdminHR, employeeId);
  }
  async getMyTickets(employeeId?: string|null) { return this.repo.listTickets(false, employeeId); }
  async getTicketById(id: string, isAdminHR: boolean, employeeId?: string|null) {
    const t = await this.repo.getTicketById(id); if (!t) throw new NotFoundError("Ticket",id);
    if (!isAdminHR && t.created_by_id!==employeeId) throw new ForbiddenError("Access denied");
    return t;
  }
  async listItAssigneeCandidates() {
    return this.repo.listItAssigneeCandidates();
  }
  private async ensureTicketAttachmentStored(
    attachmentUrl: string,
    attachmentName: string | null | undefined,
    ticketNumber?: string,
  ): Promise<{ url: string; name: string }> {
    const raw = attachmentUrl.trim();
    if (!raw.startsWith("data:")) {
      return { url: raw, name: (attachmentName && String(attachmentName).trim()) || "attachment" };
    }
    if (!isSharePointAvatarConfigured()) {
      return { url: raw, name: (attachmentName && String(attachmentName).trim()) || "attachment" };
    }
    const parsed = parseDataUrl(raw);
    if (!parsed) return { url: raw, name: (attachmentName && String(attachmentName).trim()) || "attachment" };
    const extMap: Record<string, string> = {
      "application/pdf": "pdf",
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/gif": "gif",
      "image/webp": "webp",
      "text/plain": "txt",
    };
    const mime = parsed.contentType?.toLowerCase?.().split(";")[0]?.trim() || "";
    const extFromName = attachmentName?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
    const ext = extFromName || extMap[mime] || "bin";
    const safeBase = (attachmentName && String(attachmentName).replace(/[^a-zA-Z0-9._-]/g, "_"))
      || `ticket-${(ticketNumber || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, "_")}-${Date.now()}.${ext}`;
    try {
      const url = await uploadFileToSharePoint(
        "AssetManagement/TicketAttachments",
        safeBase,
        parsed.buffer,
        parsed.contentType,
      );
      return { url: url ?? raw, name: (attachmentName && String(attachmentName).trim()) || safeBase };
    } catch (e) {
      console.warn("[assets] SharePoint ticket attachment upload failed:", (e as Error)?.message);
      return { url: raw, name: (attachmentName && String(attachmentName).trim()) || safeBase };
    }
  }

  async getTicketAttachmentMeta(id: string, isAdminHR: boolean, employeeId?: string|null) {
    const t = await this.repo.getTicketById(id);
    if (!t) throw new NotFoundError("Ticket", id);
    if (!isAdminHR && t.created_by_id !== employeeId) throw new ForbiddenError("Access denied");
    const url = (t.attachment_url ?? "").trim();
    if (!url) throw new NotFoundError("Ticket attachment", id);
    return { url, name: (t.attachment_name && String(t.attachment_name).trim()) || "attachment" };
  }

  async createTicket(body: any, user: {id:string;email:string;role:string;employeeId?:string|null}) {
    const ticketNumber = body.ticketNumber||generateTicketNumber();
    const isStaff = ["admin", "hr", "it"].includes(user.role);
    const onBehalfId =
      body.onBehalfOfEmployeeId ?? body.onBehalfOfEmployee_id ?? body.createdById ?? body.created_by_id ?? null;
    let createdByName = body.createdByName || user.email;
    let createdByDepartment = body.createdByDepartment || null;
    let createdById: string | null = null;
    let createdByEmail: string | null | undefined = user.email;

    if (isStaff && onBehalfId) {
      const emp = await this.repo.getEmployeeForTicket(String(onBehalfId));
      if (!emp) throw new NotFoundError("Employee", String(onBehalfId));
      createdById = emp.id;
      createdByName = `${emp.first_name || ""} ${emp.last_name || ""}`.trim() || createdByName;
      createdByDepartment = emp.department || createdByDepartment;
      const workEmail = typeof emp.work_email === "string" ? emp.work_email.trim() : "";
      createdByEmail = workEmail.includes("@") ? workEmail : null;
    } else if (user.employeeId) {
      const emp = await this.repo.getEmployeeName(user.employeeId);
      if (emp) {
        createdById = user.employeeId;
        createdByName = `${emp.first_name} ${emp.last_name}`;
        createdByDepartment = emp.department || createdByDepartment;
      }
    }
    let attachmentUrl: string | null | undefined = body.attachmentUrl ?? body.attachment_url ?? null;
    let attachmentName: string | null | undefined = body.attachmentName ?? body.attachment_name ?? null;
    if (attachmentUrl && typeof attachmentUrl === "string" && attachmentUrl.trim().startsWith("data:")) {
      const stored = await this.ensureTicketAttachmentStored(attachmentUrl.trim(), attachmentName, ticketNumber);
      attachmentUrl = stored.url;
      attachmentName = stored.name;
    }
    const v = insertSupportTicketSchema.parse({
      ...body,
      ticketNumber,
      createdById,
      createdByName,
      createdByEmail,
      createdByDepartment,
      attachmentUrl,
      attachmentName,
    });
    const r = await this.repo.createTicket(v);
    await this.repo.logAudit(
      "ticket",
      r.id,
      "create",
      isStaff && onBehalfId ? { ...v, loggedByUserId: user.id, loggedByEmail: user.email, onBehalfOfEmployeeId: onBehalfId } : v,
      user.id,
      user.email,
    );
    notifyTicketCreated(r, createdByName, createdByDepartment);
    if (r.assigned_to_id) {
      notifyTicketAssigned(r, r.assigned_to_id, (empId) => this.repo.getUserEmailForEmployee(empId));
    }
    return r;
  }
  async updateTicket(id: string, body: any, isAdminHR: boolean, employeeId?: string|null, userId?: string, userEmail?: string) {
    const existing = await this.repo.getTicketById(id); if (!existing) throw new NotFoundError("Ticket",id);
    if (!isAdminHR&&existing.created_by_id!==employeeId) throw new ForbiddenError("Access denied");
    const normalized: Record<string, unknown> = { ...body };
    if (Object.prototype.hasOwnProperty.call(body, "assigned_to_id") && !Object.prototype.hasOwnProperty.call(body, "assignedToId")) {
      normalized.assignedToId = body.assigned_to_id;
      normalized.assignedToName = body.assigned_to_name ?? null;
    }
    const r = await this.repo.updateTicket(id, normalized, isAdminHR);
    if (isAdminHR) await this.repo.logAudit("ticket",id,"update",{old:existing,new:r},userId,userEmail);
    const newStatus = typeof normalized.status === "string" ? normalized.status : undefined;
    if (isAdminHR && newStatus && newStatus !== existing.status) {
      notifyTicketStatusChange(
        existing,
        existing.status,
        newStatus,
        userEmail || "IT Support",
        (empId) => this.repo.getUserEmailForEmployee(empId),
      );
    }
    if (isAdminHR && r?.assigned_to_id && r.assigned_to_id !== existing.assigned_to_id) {
      notifyTicketAssigned(r, r.assigned_to_id, (empId) => this.repo.getUserEmailForEmployee(empId));
    }
    return r;
  }
  async deleteTicket(id: string, userId?: string, userEmail?: string) {
    const t = await this.repo.getTicketById(id); if (!t) throw new NotFoundError("Ticket",id);
    await this.repo.deleteTicket(id);
    await this.repo.logAudit("ticket",id,"delete",t,userId,userEmail);
  }
  async getTicketComments(ticketId: string, isAdminHR: boolean, employeeId?: string|null) {
    const t = await this.repo.getTicketById(ticketId); if (!t) throw new NotFoundError("Ticket",ticketId);
    if (!isAdminHR&&t.created_by_id!==employeeId) throw new ForbiddenError("Access denied");
    return this.repo.getTicketComments(ticketId);
  }
  async addComment(ticketId: string, body: any, user: {id:string;email:string;role:string;employeeId?:string|null}) {
    const t = await this.repo.getTicketById(ticketId); if (!t) throw new NotFoundError("Ticket",ticketId);
    const isAdminHR=["admin","hr","it"].includes(user.role);
    if (!isAdminHR&&t.created_by_id!==user.employeeId) throw new ForbiddenError("Access denied");
    const authorRole = isAdminHR?"it_support":"employee";
    let authorName=body.authorName||user.email;
    if (user.employeeId) { const emp = await this.repo.getEmployeeName(user.employeeId); if (emp) authorName=`${emp.first_name} ${emp.last_name}`; }
    const v = insertTicketCommentSchema.parse({ ticketId, message:body.message, authorId:user.employeeId, authorName, authorEmail:user.email, authorRole, isStatusUpdate:body.isStatusUpdate||"false", oldStatus:body.oldStatus, newStatus:body.newStatus });
    const r = await this.repo.addComment(v);
    await this.repo.logAudit("ticket_comment",r.id,"create",v,user.id,user.email);
    return r;
  }
  async updateTicketStatus(ticketId: string, status: string, comment: string|undefined, user: {id:string;email:string;role:string;employeeId?:string|null}) {
    if (!status) throw new ValidationError("Status is required");
    const existing = await this.repo.getTicketById(ticketId);
    if (!existing) throw new NotFoundError("Ticket", ticketId);
    let authorName=user.email;
    if (user.employeeId) { const emp = await this.repo.getEmployeeName(user.employeeId); if (emp) authorName=`${emp.first_name} ${emp.last_name}`; }
    const r = await this.repo.updateTicketStatus(ticketId, status, authorName, user.email, user.employeeId||undefined, comment);
    if (!r) throw new NotFoundError("Ticket",ticketId);
    await this.repo.logAudit("ticket",ticketId,"status_change",{status},user.id,user.email);
    if (status !== existing.status) {
      notifyTicketStatusChange(
        existing,
        existing.status,
        status,
        authorName,
        (empId) => this.repo.getUserEmailForEmployee(empId),
      );
    }
    return r;
  }

  // ── Audit / Invoices / Stats ──────────────────────────────────────────────────
  async getAuditLog(entityType?: string, entityId?: string, limit=100, offset=0) { return this.repo.getAuditLog(entityType, entityId, limit, offset); }

  async getRecentReturns(limit = 8, ctx?: ModuleRegionCtx) {
    const cap = Math.min(Math.max(limit, 1), 25);
    const regions = this.regionsFor(ctx);
    const rows = await this.repo.getRecentReturns(cap * 3);
    const draft: {
      auditId: string;
      assignmentId: string;
      publicAssetId: string | null;
      assigneeName: string | null;
      employeeId: string | null;
      stockItemId: string | null;
      reasonKey: string;
      reasonLabel: string;
      returnedAt: string;
      performedByEmail: string | null;
    }[] = [];

    for (const row of rows) {
      const changes = parseAuditChanges(row.changes);
      if (row.action === "delete") {
        const c = changes as Record<string, string | null | undefined>;
        draft.push({
          auditId: row.id,
          assignmentId: row.entity_id,
          publicAssetId: c.asset_id ?? c.assetId ?? null,
          assigneeName: c.user_name ?? c.userName ?? null,
          employeeId: c.user_id ?? c.userId ?? null,
          stockItemId: c.stock_item_id ?? c.stockItemId ?? null,
          reasonKey: "manual_unassign",
          reasonLabel: RETURN_REASON_LABELS.manual_unassign,
          returnedAt: row.created_at,
          performedByEmail: row.user_email ?? null,
        });
        continue;
      }
      if (row.action === "return_to_stock") {
        const reasonKey = String(changes.reason ?? "returned");
        draft.push({
          auditId: row.id,
          assignmentId: row.entity_id,
          publicAssetId: (changes.assetId as string) ?? null,
          assigneeName: (changes.assigneeName as string) ?? null,
          employeeId: (changes.employeeId as string) ?? null,
          stockItemId: (changes.stockItemId as string) ?? null,
          reasonKey,
          reasonLabel: RETURN_REASON_LABELS[reasonKey] ?? RETURN_REASON_LABELS.returned,
          returnedAt: row.created_at,
          performedByEmail: row.user_email ?? null,
        });
      }
    }

    const employeeIdsNeedingName = Array.from(
      new Set(
        draft.filter((d) => !d.assigneeName && d.employeeId).map((d) => d.employeeId as string),
      ),
    );
    const assigneeByEmployeeId = new Map<string, string>();
    for (const empId of employeeIdsNeedingName) {
      const emp = await this.repo.getEmployeeForAssign(empId);
      if (emp) {
        assigneeByEmployeeId.set(
          empId,
          formatEmployeeAssetAssigneeName(emp.first_name, emp.last_name, emp.nickname),
        );
      }
    }

    const stockIds = Array.from(
      new Set(draft.map((d) => d.stockItemId).filter(Boolean) as string[]),
    );
    const stockRows = await this.repo.getStockNamesByIds(stockIds);
    const stockNameById = new Map(stockRows.map((s) => [s.id, s.name]));

    const inScope = async (employeeId: string | null): Promise<boolean> => {
      if (regions === null) return true;
      if (!employeeId) return false;
      const empRegion = await getEmployeeRegion(employeeId);
      return !!empRegion && regions.includes(empRegion);
    };

    const filtered: typeof draft = [];
    for (const d of draft) {
      if (filtered.length >= cap) break;
      if (await inScope(d.employeeId)) filtered.push(d);
    }

    return filtered.map((d) => ({
      ...d,
      assigneeName:
        d.assigneeName ??
        (d.employeeId ? assigneeByEmployeeId.get(d.employeeId) ?? null : null) ??
        "Unknown",
      stockItemName: d.stockItemId ? stockNameById.get(d.stockItemId) ?? null : null,
    }));
  }
  async listInvoices(limit=100, offset=0) { return this.repo.listInvoices(Math.min(limit,500), offset); }
  async getInvoiceById(id: string) { const r = await this.repo.getInvoiceById(id); if (!r) throw new NotFoundError("Invoice",id); return r; }
  async getInvoiceFile(id: string) { const r = await this.repo.getInvoiceFile(id); if (!r?.file_path) throw new NotFoundError("Invoice file",id); return r; }

  /** If file_path is a base64 data URL and SharePoint is configured, upload to SharePoint and return URL; otherwise return original. */
  private async ensureInvoiceFileInSharePoint(
    filePath: string | null | undefined,
    fileName: string | null | undefined,
    invoiceNumber: string,
    invoiceId?: string
  ): Promise<string | null> {
    const raw = (filePath ?? "").trim();
    if (!raw || !raw.startsWith("data:")) return raw || null;
    if (!isSharePointAvatarConfigured()) return raw;
    const parsed = parseDataUrl(raw);
    if (!parsed) return raw;
    const safeName = (fileName && /\.pdf$/i.test(fileName))
      ? String(fileName).replace(/[^a-zA-Z0-9._-]/g, "_")
      : `invoice-${(invoiceNumber || invoiceId || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, "_")}-${Date.now()}.pdf`;
    try {
      const url = await uploadFileToSharePoint("AssetManagement/Invoices", safeName, parsed.buffer, parsed.contentType);
      return url ?? raw;
    } catch (e) {
      console.warn("[assets] SharePoint invoice upload failed:", (e as Error)?.message);
      return raw;
    }
  }

  async createInvoice(body: any, userId?: string, userEmail?: string) {
    let filePath = body.file_path ?? body.filePath ?? null;
    const invoiceNumber = (body.invoice_number ?? body.invoiceNumber ?? "").trim() || "INV";
    if (filePath) {
      filePath = await this.ensureInvoiceFileInSharePoint(filePath, body.file_name ?? body.fileName, invoiceNumber);
    }
    const v = insertInvoiceSchema.parse({ invoiceNumber: body.invoice_number ?? body.invoiceNumber, vendor: body.vendor, purchaseDate: body.purchase_date ?? body.purchaseDate, totalAmount: body.total_amount ?? body.totalAmount ?? 0, items: body.items, fileName: body.file_name ?? body.fileName ?? null, fileType: body.file_type ?? body.fileType ?? null, filePath, status: body.status ?? "pending", notes: body.notes ?? null });
    const r = await this.repo.createInvoice(v);
    await this.repo.logAudit("invoice", r.id, "create", v, userId, userEmail);
    return r;
  }
  async updateInvoice(id: string, body: any, userId?: string, userEmail?: string) {
    const ex = await this.repo.getInvoiceById(id); if (!ex) throw new NotFoundError("Invoice", id);
    const rawPath = body.file_path ?? body.filePath;
    let filePath = rawPath;
    if (rawPath !== undefined && rawPath && String(rawPath).trim().startsWith("data:")) {
      filePath = await this.ensureInvoiceFileInSharePoint(rawPath, body.file_name ?? body.fileName ?? ex.file_name, ex.invoice_number ?? "INV", id) ?? undefined;
    }
    const updates = filePath !== undefined ? { ...body, file_path: filePath } : body;
    const r = await this.repo.updateInvoice(id, updates);
    await this.repo.logAudit("invoice", id, "update", { old: ex, new: r }, userId, userEmail);
    return r;
  }
  async deleteInvoice(id: string, userId?: string, userEmail?: string) {
    const r = await this.repo.deleteInvoice(id); if (!r) throw new NotFoundError("Invoice",id);
    await this.repo.logAudit("invoice",id,"delete",r,userId,userEmail);
  }
  async getStats(ctx?: ModuleRegionCtx) {
    return this.repo.getStats(this.regionsFor(ctx), this.stockRegionsFor(ctx));
  }
}

