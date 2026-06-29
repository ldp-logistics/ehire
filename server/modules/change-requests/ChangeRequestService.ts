import { ChangeRequestRepository } from "./ChangeRequestRepository.js";
import type { ChangeRequestRow } from "./ChangeRequestRepository.js";
import type { ChangeRequestResponseDTO, BulkApproveResultDTO } from "./ChangeRequest.dto.js";
import { NotFoundError, ValidationError, ForbiddenError } from "../../core/types/index.js";
import { effectiveRegionsFor, getEmployeeRegion } from "../../lib/regionAccess.js";
import type { ModuleRegionCtx } from "../../lib/moduleRegionCtx.js";
import { emitRefreshAll } from "../../lib/notificationEvents.js";
import { notifyEmail, getEmailsByRoleForRegion, getEmployeeEmail } from "../../lib/emailNotifications.js";
import { recordEmployeeProfileChange } from "../../lib/employeeProfileChanges.js";
import {
  parseDataUrl,
  getAvatarContentBySharingUrl,
  isSharePointAvatarConfigured,
  uploadAvatarToSharePoint,
  uploadFileToSharePoint,
  getMissingSharePointEnvVars,
} from "../../lib/sharepoint.js";
import { memCache } from "../../lib/perf.js";
import { randomUUID } from "crypto";

const FIELD_CATEGORIES: Record<string, string[]> = {
  personal_details: ["dob", "gender", "marital_status", "blood_group", "avatar"],
  address: ["street", "city", "state", "country", "zip_code", "comm_street", "comm_city", "comm_state", "comm_country", "comm_zip_code"],
  contact: ["personal_email", "personal_phone", "work_phone"],
  dependents: ["dependents_data"],
  emergency_contacts: ["emergency_contacts_data"],
  bank_details: ["bank_name", "account_number", "routing_number"],
};
const EMPLOYEE_EDITABLE_FIELDS = Object.values(FIELD_CATEGORIES).flat();

function avatarExtFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("gif")) return "gif";
  if (m.includes("webp")) return "webp";
  return "jpg";
}

export class ChangeRequestService {
  private readonly repo = new ChangeRequestRepository();

  private regionsFor(ctx?: ModuleRegionCtx): string[] | null {
    return ctx ? effectiveRegionsFor(ctx, ctx.requestedRegion) : null;
  }

  private async assertEmployeeInScope(ctx: ModuleRegionCtx | undefined, employeeId: string): Promise<void> {
    if (!ctx) return;
    const regions = this.regionsFor(ctx);
    if (regions === null) return;
    const empRegion = await getEmployeeRegion(employeeId);
    if (regions.length === 0 || !empRegion || !regions.includes(empRegion)) {
      throw new ForbiddenError("This employee belongs to a different region.");
    }
  }

  private async assertRequestInScope(ctx: ModuleRegionCtx | undefined, requestId: string): Promise<void> {
    const row = await this.repo.findById(requestId);
    if (!row?.employee_id) return;
    await this.assertEmployeeInScope(ctx, row.employee_id);
  }

  async listRequests(opts: { isAdminOrHR: boolean; requesterId: string; status?: string; employeeId?: string; limit: number; offset: number }, ctx?: ModuleRegionCtx): Promise<ChangeRequestResponseDTO[]> {
    return (await this.repo.findAll({ ...opts, regions: this.regionsFor(ctx) })).map(this.toDTO);
  }

  async countPending(ctx?: ModuleRegionCtx): Promise<{ count: number }> {
    return { count: await this.repo.countPending(this.regionsFor(ctx)) };
  }

  async submitRequest(requesterId: string, requestingUserEmployeeId: string | null, employeeId: string, fieldName: string, newValue: string, category?: string, isAdminOrHR = false, ctx?: ModuleRegionCtx): Promise<ChangeRequestResponseDTO> {
    if (requestingUserEmployeeId !== employeeId && !isAdminOrHR) {
      throw new ForbiddenError("You can only request changes for your own profile");
    }
    if (isAdminOrHR && requestingUserEmployeeId !== employeeId) {
      await this.assertEmployeeInScope(ctx, employeeId);
    }
    const snakeField = fieldName.replace(/([A-Z])/g, "_$1").toLowerCase();
    if (!EMPLOYEE_EDITABLE_FIELDS.includes(snakeField)) {
      throw new ValidationError(`Field '${fieldName}' cannot be changed via self-service. Contact HR.`);
    }
    const detectedCategory = category ?? Object.entries(FIELD_CATEGORIES).find(([, f]) => f.includes(snakeField))?.[0] ?? "personal_details";
    const emp = await this.repo.getEmployee(employeeId);
    if (!emp) throw new NotFoundError("Employee", employeeId);
    const oldValue = emp[snakeField]?.toString() ?? null;
    const storedNewValue =
      snakeField === "avatar"
        ? await this.normalizeAvatarValueForStorage(employeeId, newValue)
        : newValue;
    const row = await this.repo.create(requesterId, employeeId, detectedCategory, snakeField, oldValue, storedNewValue);
    // Email: notify HR of new change request (avoid huge base64 in body for avatar)
    (async()=>{try{const empRec=await getEmployeeEmail(employeeId);const empRegion=await getEmployeeRegion(employeeId);const hrs=await getEmailsByRoleForRegion("hr",empRegion);const ctx={employee_name:empRec?.name||"Employee",employee_id:employeeId,field_name:snakeField,old_value:snakeField==="avatar"?"[photo]":(oldValue||"—"),new_value:snakeField==="avatar"?"[new profile photo — see HR queue]":newValue,change_request_id:row.id};if(hrs.length)await notifyEmail("general.change_request.submitted",ctx,hrs);}catch{}})();
    return this.toDTO(row);
  }

  async submitBulkRequest(requesterId: string, requestingUserEmployeeId: string | null, employeeId: string, category: string, changes: Record<string, string>, isAdminOrHR = false, ctx?: ModuleRegionCtx): Promise<ChangeRequestResponseDTO[]> {
    if (requestingUserEmployeeId !== employeeId && !isAdminOrHR) {
      throw new ForbiddenError("You can only request changes for your own profile");
    }
    if (isAdminOrHR && requestingUserEmployeeId !== employeeId) {
      await this.assertEmployeeInScope(ctx, employeeId);
    }
    const emp = await this.repo.getEmployee(employeeId);
    if (!emp) throw new NotFoundError("Employee", employeeId);
    const created: ChangeRequestResponseDTO[] = [];
    for (const [field, newValue] of Object.entries(changes)) {
      const snakeField = field.replace(/([A-Z])/g, "_$1").toLowerCase();
      if (!EMPLOYEE_EDITABLE_FIELDS.includes(snakeField)) continue;
      const oldValue = emp[snakeField]?.toString() ?? null;
      const rawNew = String(newValue);
      const storedNewValue =
        snakeField === "avatar"
          ? await this.normalizeAvatarValueForStorage(employeeId, rawNew)
          : rawNew;
      const row = await this.repo.create(requesterId, employeeId, category, snakeField, oldValue, storedNewValue);
      created.push(this.toDTO(row));
    }
    return created;
  }

  async approveRequest(id: string, reviewedBy: string, reviewNotes?: string, ctx?: ModuleRegionCtx): Promise<ChangeRequestResponseDTO> {
    await this.assertRequestInScope(ctx, id);
    const req = await this.repo.findPendingById(id);
    if (!req) throw new NotFoundError("Pending change request", id);
    if (!EMPLOYEE_EDITABLE_FIELDS.includes(req.field_name)) throw new ValidationError("Invalid field in change request");
    const valueToApply =
      req.field_name === "avatar"
        ? await this.normalizeAvatarValueForApply(req.employee_id, req.new_value)
        : req.new_value;
    await this.repo.applyChange(req.employee_id, req.field_name, valueToApply);
    await recordEmployeeProfileChange(req.employee_id, reviewedBy, [req.field_name]);
    const updated = await this.repo.markApproved(id, reviewedBy, reviewNotes ?? null);
    emitRefreshAll();
    // Email: notify employee that change was approved
    (async()=>{try{const empRec=await getEmployeeEmail(req.employee_id);if(empRec)await notifyEmail("general.change_request.approved",{employee_name:empRec.name||"Employee",field_name:req.field_name,new_value:req.field_name==="avatar"?"[profile photo updated]":req.new_value},[empRec]);}catch{}})();
    return this.toDTO(updated);
  }

  async rejectRequest(id: string, reviewedBy: string, reviewNotes: string, ctx?: ModuleRegionCtx): Promise<ChangeRequestResponseDTO> {
    await this.assertRequestInScope(ctx, id);
    if (!reviewNotes?.trim()) throw new ValidationError("Rejection reason is required");
    const req = await this.repo.findPendingById(id);
    if (!req) throw new NotFoundError("Pending change request", id);
    const updated = await this.repo.markRejected(id, reviewedBy, reviewNotes);
    if (!updated) throw new NotFoundError("Pending change request", id);
    emitRefreshAll();
    // Email: notify employee that change was rejected
    (async()=>{try{const empRec=await getEmployeeEmail(req.employee_id);if(empRec)await notifyEmail("general.change_request.rejected",{employee_name:empRec.name||"Employee",field_name:req.field_name,rejection_reason:reviewNotes},[empRec]);}catch{}})();
    return this.toDTO(updated);
  }

  /** Proxied avatar bytes from stored old_value / new_value (SharePoint URLs cannot load in img src). */
  async getAvatarImageBinary(
    id: string,
    side: "old" | "new",
    requesterId: string,
    isAdminOrHR: boolean,
    ctx?: ModuleRegionCtx,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    const row = await this.repo.findById(id);
    if (!row || row.field_name !== "avatar") return null;
    if (!isAdminOrHR && row.requester_id !== requesterId) {
      throw new ForbiddenError("You cannot view this change request");
    }
    if (isAdminOrHR) await this.assertRequestInScope(ctx, id);

    const raw = String((side === "old" ? row.old_value : row.new_value) ?? "").trim();
    if (!raw) return null;

    const cacheKey = `cr:avatar:${id}:${side}`;
    const cached = memCache.get<{ buffer: Buffer; contentType: string }>(cacheKey);
    if (cached) return cached;

    const result = await this.parseStoredAvatarValue(raw);
    if (result) memCache.set(cacheKey, result, 10 * 60 * 1000);
    return result;
  }

  /**
   * Persist avatar change requests as SharePoint sharing URLs (not base64), matching employee PATCH behavior.
   */
  private async uploadChangeRequestAvatarToSharePoint(
    employeeId: string,
    requestId: string,
    dataUrl: string,
    side: "old" | "new"
  ): Promise<string | null> {
    const parsed = parseDataUrl(dataUrl);
    if (!parsed) return null;
    const fileName = `${employeeId}-${requestId}-${side}.${avatarExtFromMime(parsed.contentType)}`;
    return uploadFileToSharePoint(
      "ChangeRequests",
      fileName,
      parsed.buffer,
      parsed.contentType
    );
  }

  private async normalizeAvatarValueForStorage(employeeId: string, value: string): Promise<string> {
    const trimmed = String(value ?? "").trim();
    if (!trimmed.startsWith("data:")) return trimmed;
    if (!isSharePointAvatarConfigured()) return trimmed;

    const parsed = parseDataUrl(trimmed);
    if (!parsed) throw new ValidationError("Invalid profile photo data");

    try {
      const fileName = `${employeeId}-${randomUUID()}.${avatarExtFromMime(parsed.contentType)}`;
      const url = await uploadFileToSharePoint(
        "ChangeRequests",
        fileName,
        parsed.buffer,
        parsed.contentType
      );
      if (url) return url;
    } catch (e) {
      console.warn("[change-requests] SharePoint upload failed:", (e as Error)?.message);
    }
    return trimmed;
  }

  /** On approve: ensure employee row gets a SharePoint URL, not base64 (handles legacy pending rows). */
  private async normalizeAvatarValueForApply(employeeId: string, value: string): Promise<string> {
    const trimmed = String(value ?? "").trim();
    if (!trimmed.startsWith("data:")) return trimmed;
    if (!isSharePointAvatarConfigured()) return trimmed;

    const parsed = parseDataUrl(trimmed);
    if (!parsed) throw new ValidationError("Invalid profile photo data");

    try {
      const url = await uploadAvatarToSharePoint(employeeId, parsed.buffer, parsed.contentType);
      if (url) {
        memCache.invalidate(`avatar:${employeeId}`);
        return url;
      }
    } catch (e) {
      console.warn("[change-requests] SharePoint avatar apply failed:", (e as Error)?.message);
    }
    return trimmed;
  }

  private async parseStoredAvatarValue(
    avatar: string
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    if (avatar.startsWith("data:")) {
      const parsed = parseDataUrl(avatar);
      if (!parsed) return null;
      const contentType = parsed.contentType.split(";")[0].trim() || "image/png";
      return { buffer: parsed.buffer, contentType };
    }
    if (avatar.startsWith("http://") || avatar.startsWith("https://")) {
      const sp = await getAvatarContentBySharingUrl(avatar);
      if (sp) return { buffer: sp.buffer, contentType: sp.contentType || "image/png" };
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 15000);
        const r = await fetch(avatar, { signal: ctrl.signal });
        clearTimeout(t);
        if (!r.ok) return null;
        const contentType = r.headers.get("Content-Type") || "image/png";
        const buffer = Buffer.from(await r.arrayBuffer());
        return buffer.length > 0 ? { buffer, contentType } : null;
      } catch {
        return null;
      }
    }
    return null;
  }

  async deleteRequest(id: string, ctx?: ModuleRegionCtx): Promise<void> {
    await this.assertRequestInScope(ctx, id);
    const deleted = await this.repo.deleteById(id);
    if (!deleted) throw new NotFoundError("Change request", id);
  }

  /**
   * One-time / maintenance: convert avatar change_requests old_value/new_value from base64 to SharePoint URLs.
   */
  async migrateAvatarsToSharePoint(): Promise<{
    total: number;
    updated: number;
    failed: number;
    fieldsUpdated: number;
  }> {
    if (!isSharePointAvatarConfigured()) {
      throw new ValidationError(
        `SharePoint not configured. Missing: ${getMissingSharePointEnvVars().join(", ")}`
      );
    }

    const rows = await this.repo.findAvatarBase64Rows();
    let updated = 0;
    let failed = 0;
    let fieldsUpdated = 0;

    for (const row of rows) {
      try {
        let rowChanged = false;

        const oldRaw = String(row.old_value ?? "").trim();
        if (oldRaw.startsWith("data:")) {
          const url = await this.uploadChangeRequestAvatarToSharePoint(
            row.employee_id,
            row.id,
            oldRaw,
            "old"
          );
          if (url) {
            await this.repo.updateValueColumn(row.id, "old_value", url);
            fieldsUpdated++;
            rowChanged = true;
            memCache.invalidate(`cr:avatar:${row.id}:old`);
          }
        }

        const newRaw = String(row.new_value ?? "").trim();
        if (newRaw.startsWith("data:")) {
          const url = await this.uploadChangeRequestAvatarToSharePoint(
            row.employee_id,
            row.id,
            newRaw,
            "new"
          );
          if (url) {
            await this.repo.updateValueColumn(row.id, "new_value", url);
            fieldsUpdated++;
            rowChanged = true;
            memCache.invalidate(`cr:avatar:${row.id}:new`);
          }
        }

        if (rowChanged) updated++;
        else failed++;
      } catch (e) {
        console.warn(`[change-requests] migrate ${row.id}:`, (e as Error)?.message);
        failed++;
      }
    }

    return { total: rows.length, updated, failed, fieldsUpdated };
  }

  async bulkApprove(requestIds: string[], reviewedBy: string, reviewNotes?: string, ctx?: ModuleRegionCtx): Promise<BulkApproveResultDTO> {
    const approved: string[] = [];
    const failed: { id: string; reason: string }[] = [];
    for (const id of requestIds) {
      try {
        await this.assertRequestInScope(ctx, id);
        const req = await this.repo.findPendingById(id);
        if (!req) { failed.push({ id, reason: "Not found or already processed" }); continue; }
        if (!EMPLOYEE_EDITABLE_FIELDS.includes(req.field_name)) { failed.push({ id, reason: "Invalid field" }); continue; }
        const valueToApply =
          req.field_name === "avatar"
            ? await this.normalizeAvatarValueForApply(req.employee_id, req.new_value)
            : req.new_value;
        await this.repo.applyChange(req.employee_id, req.field_name, valueToApply);
        await recordEmployeeProfileChange(req.employee_id, reviewedBy, [req.field_name]);
        await this.repo.markApproved(id, reviewedBy, reviewNotes ?? null);
        approved.push(id);
      } catch { failed.push({ id, reason: "Processing error" }); }
    }
    return { approved, failed };
  }

  private toDTO(r: ChangeRequestRow): ChangeRequestResponseDTO {
    return {
      id: r.id, requesterId: r.requester_id, employeeId: r.employee_id, category: r.category,
      fieldName: r.field_name, oldValue: r.old_value, newValue: r.new_value, status: r.status,
      reviewedBy: r.reviewed_by, reviewNotes: r.review_notes,
      reviewedAt: r.reviewed_at ? (r.reviewed_at instanceof Date ? r.reviewed_at.toISOString() : String(r.reviewed_at)) : null,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
      employeeName: r.employee_name, employeeCode: r.employee_code, requesterEmail: r.requester_email,
    };
  }
}
