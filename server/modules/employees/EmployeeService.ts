import { EmployeeRepository, ALLOWED_FIELDS } from "./EmployeeRepository.js";
import { AuthRepository } from "../auth/AuthRepository.js";
import { NotFoundError, ValidationError, ConflictError, ForbiddenError } from "../../core/types/index.js";
import { AssetService } from "../assets/AssetService.js";
import { resolvePolicy, assertHRScope, hrScopeFilter } from "../../lib/policy.js";
import { effectiveRegionsFor } from "../../lib/regionAccess.js";
import type { UserPayload } from "../../middleware/auth.js";
import { hasAnyRole, type UserRow } from "../../lib/rbac.js";
import { memCache } from "../../lib/perf.js";
import { isSharePointAvatarConfigured, parseDataUrl, uploadAvatarToSharePoint, uploadFileToSharePoint, getMissingSharePointEnvVars, getAvatarContentBySharingUrl } from "../../lib/sharepoint.js";
import { downloadUrlAsDataUrl } from "../../lib/downloadUrl.js";
import { parseFreshteamEmployeeCSV, parseFreshteamEmergencyContactsCSV, parseFreshteamCompensationsCSV, parseFreshteamBankAccountsCSV, parseFreshteamDependentsCSV, parseFreshteamStocksCSV } from "../../lib/freshteamCsv.js";
import { getMonthlyGrossFromRecord, salaryRecordHasBreakdown } from "../../../shared/compensationSalary.js";
import { randomUUID } from "node:crypto";
import { appendAuditLog, type AuditActorContext } from "../../lib/auditAppend.js";
import {
  formatProfileChangeDescription,
  getChangedFieldKeys,
  recordEmployeeProfileChange,
} from "../../lib/employeeProfileChanges.js";
import {
  notifyEmail,
  resolvePublicAppUrlForTemplates,
} from "../../lib/emailNotifications.js";

const TENTATIVE_DOC_LABELS: Record<string, string> = { cnic_front:"CNIC Front",cnic_back:"CNIC Back",professional_photo:"Professional Profile Photograph",passport:"Passport",drivers_license:"Driver's License",degree_transcript:"Degree / Transcript",experience_certificate:"Experience Certificate",salary_slip:"Latest Salary Slip",resignation_acceptance:"Resignation Acceptance Letter",internship_certificate:"Internship Certificate" };

const INACTIVE_DIRECTORY_STATUSES = new Set(["terminated", "resigned", "offboarded"]);

function hrCanViewInactiveEmployees(user?: UserPayload): boolean {
  if (!user) return false;
  const row: UserRow = { id: user.id, email: user.email, role: user.role, roles: user.roles ?? [] };
  return hasAnyRole(row, ["admin", "hr", "limited_hr"]);
}

function auditFieldValue(v: unknown): unknown {
  if (typeof v === "string" && v.startsWith("data:") && v.length > 200) return "[redacted]";
  return v;
}

function isProvisionedWorkEmail(email: string | null | undefined): boolean {
  const e = String(email ?? "").trim().toLowerCase();
  if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false;
  return !(e.startsWith("pending-") && e.endsWith("@internal.local"));
}

export { isProvisionedWorkEmail };

function isActiveLikeEmploymentStatus(status: unknown): boolean {
  const st = String(status ?? "")
    .toLowerCase()
    .trim();
  return ["active", "onboarding", "on_leave"].includes(st);
}
const DOCUMENT_SECTION_TYPES = ["id_document","education","offer_letter","nda","additional"] as const;

export class EmployeeService {
  private readonly repo = new EmployeeRepository();
  private readonly authRepo = new AuthRepository();

  async list(query: { limit?: string; offset?: string; q?: string; department?: string; status?: string; includeInactive?: string; risk?: string; orgChart?: string }, user?: UserPayload) {
    const limit = Math.min(parseInt(query.limit||"500")||500, 2000);
    const offset = Math.max(0, parseInt(query.offset||"0")||0);
    const requestedIncludeInactive = query.includeInactive==="true"||query.includeInactive==="1";
    const includeInactive = hrCanViewInactiveEmployees(user) && requestedIncludeInactive;
    const q = (query.q||"").trim(); const department = (query.department||"").trim();
    let status = (query.status||"").toLowerCase().trim();
    if (!hrCanViewInactiveEmployees(user) && status && INACTIVE_DIRECTORY_STATUSES.has(status)) {
      status = "";
    }
    const riskRaw = (query.risk || "").trim().toLowerCase();
    const risk = riskRaw === "no_manager" || riskRaw === "no_leave_policy" ? riskRaw : "";

    // Org chart always shows the full company tree (not region-scoped).
    const orgChartView = query.orgChart === "1" || query.orgChart === "true";
    // Multi-region scope: null = all (super admin / internal), [] = none (fail-closed).
    // Super admins may narrow via ?region= (ignored for everyone else).
    const regions = orgChartView ? null : (user ? effectiveRegionsFor(user, (query as any).region) : null);

    // Resolve limited_hr scope: restrict by dept/office (region applied on top).
    if (user) {
      const policy = await resolvePolicy(user);
      const scopeFilter = hrScopeFilter(policy);
      if (scopeFilter) {
        // limited_hr: only see employees in their scoped departments/offices
        const depts = scopeFilter.departments;
        const offices = scopeFilter.offices;
        const effectiveDept = department || undefined;
        return this.repo.searchWithScope(q, effectiveDept, status, includeInactive, limit, offset, depts, offices, risk, regions);
      }
    }

    const useFilters = Boolean(query.limit||query.offset||q||department||status||risk);
    // Global cache only when there is no region filter (super admin / internal),
    // otherwise results would leak across regions.
    if (!useFilters && regions === null) {
      const cacheKey = includeInactive ? "employees:list:all" : "employees:list";
      const cached = memCache.get<any[]>(cacheKey);
      if (cached) return cached;
      const data = await this.repo.list(includeInactive, limit, offset);
      memCache.set(cacheKey, data, 10000);
      return data;
    }
    return this.repo.search(q, department, status, includeInactive, limit, offset, risk, regions);
  }

  async getById(id: string, _role: string, currentEmployeeId?: string|null, user?: UserPayload) {
    const emp = await this.repo.getById(id);
    if (!emp) throw new NotFoundError("Employee", id);

    // Scoped limited_hr: verify the employee is in their allowed dept/office
    if (user) {
      const policy = await resolvePolicy(user);
      const scopeFilter = hrScopeFilter(policy);
      if (scopeFilter) {
        assertHRScope(policy, emp.department ?? null, emp.location ?? null);
      }
    }

    const canHr = hrCanViewInactiveEmployees(user);
    if (!canHr && currentEmployeeId !== id && !isActiveLikeEmploymentStatus(emp.employment_status)) {
      throw new NotFoundError("Employee", id);
    }

    if (!canHr && currentEmployeeId !== id) {
      return { id:emp.id,employee_id:emp.employee_id,first_name:emp.first_name,last_name:emp.last_name,work_email:emp.work_email,job_title:emp.job_title,department:emp.department,location:emp.location,avatar:emp.avatar,manager_id:emp.manager_id,manager_email:emp.manager_email,hr_email:emp.hr_email };
    }
    // Ensure grade and other optional fields are always present for profile display (handle driver casing)
    const row = emp as Record<string, unknown>;
    const gradeVal = row.grade ?? row.Grade ?? null;
    return {
      ...row,
      grade: gradeVal != null && String(gradeVal).trim() !== "" ? String(gradeVal).trim() : null,
      business_unit: row.business_unit ?? row.businessUnit ?? null,
      shift: row.shift ?? null,
      job_category: row.job_category ?? row.jobCategory ?? null,
      primary_team: row.primary_team ?? row.primaryTeam ?? null,
      role: row.role != null && String(row.role).trim() !== "" ? String(row.role).trim() : null,
    };
  }

  async create(body: any, role: string, audit?: AuditActorContext) {
    const { employeeId, workEmail, firstName, lastName, jobTitle, department, joinDate, middleName, avatar, subDepartment, businessUnit, primaryTeam, costCenter, grade, jobCategory, location, role: employeeRole, managerEmail, hrEmail, employmentStatus="onboarding", employeeType="full_time", shift, probationStartDate, probationEndDate, confirmationDate, noticePeriod, personalEmail, personalPhone, workPhone, dob, gender, maritalStatus, bloodGroup, street, city, state, country, zipCode, source="manual", nickname: nicknameRaw, pseudonym } = body;
    if (!employeeId||!firstName||!lastName||!jobTitle||!department||!joinDate) throw new ValidationError("Missing required fields: employeeId, firstName, lastName, jobTitle, department, joinDate");
    const isOnboarding = (employmentStatus ?? "").toString().toLowerCase() === "onboarding";
    const workEmailTrimmed = (workEmail ?? "").toString().trim();
    const workEmailToUse = workEmailTrimmed
      ? workEmailTrimmed
      : isOnboarding
        ? `pending-${String(employeeId).replace(/[^a-zA-Z0-9_-]/g, "_")}@internal.local`
        : null;
    if (!workEmailToUse) throw new ValidationError("Work email is required when employment status is not Onboarding.");
    let avatarValue = avatar??null;
    if (avatarValue?.startsWith("data:") && isSharePointAvatarConfigured()) {
      const parsed = parseDataUrl(avatarValue);
      if (parsed) { try { const url = await uploadAvatarToSharePoint(randomUUID(), parsed.buffer, parsed.contentType); if (url) avatarValue=url; } catch (e) { console.warn("[employees] SharePoint avatar upload failed:", (e as Error)?.message); } }
    }
    const nickTrim = String(nicknameRaw ?? pseudonym ?? "").trim();
    const nickname = nickTrim.length > 0 ? nickTrim : null;
    const branchId =
      (body.branchId ?? body.branch_id) ||
      (await this.repo.findBranchIdByLocationName(location));
    const data = { employee_id:employeeId,work_email:workEmailToUse,first_name:firstName,middle_name:middleName||null,last_name:lastName,nickname,avatar:avatarValue,job_title:jobTitle,department,sub_department:subDepartment||null,business_unit:businessUnit||null,primary_team:primaryTeam||null,role:employeeRole||null,cost_center:costCenter||null,grade:grade||null,job_category:jobCategory||null,location:location||null,branch_id:branchId||null,manager_email:managerEmail||null,hr_email:hrEmail||null,employment_status:employmentStatus,employee_type:employeeType,shift:shift||null,join_date:joinDate,probation_start_date:probationStartDate||null,probation_end_date:probationEndDate||null,confirmation_date:confirmationDate||null,notice_period:noticePeriod||null,personal_email:personalEmail||null,personal_phone:personalPhone||null,work_phone:workPhone||null,dob:dob||null,gender:gender||null,marital_status:maritalStatus||null,blood_group:bloodGroup||null,street:street||null,city:city||null,state:state||null,country:country||null,zip_code:zipCode||null,source };
    const emp = await this.repo.create(data);
    memCache.invalidate("employees:");
    if (audit) {
      await appendAuditLog({
        entityType: "employee",
        entityId: emp.id,
        action: "CREATE",
        performedBy: audit.userId,
        details: {
          employee_id: emp.employee_id,
          work_email: emp.work_email,
          name: `${emp.first_name} ${emp.last_name}`,
        },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      });
    }
    return emp;
  }

  async update(id: string, body: any, updatedBy: string, role: string, user?: UserPayload, audit?: AuditActorContext) {
    // Scope enforcement for limited_hr: they can only update employees in their dept/office
    if (user) {
      const policy = await resolvePolicy(user);
      const scopeFilter = hrScopeFilter(policy);
      if (scopeFilter) {
        const emp = await this.repo.getById(id);
        if (!emp) throw new NotFoundError("Employee", id);
        assertHRScope(policy, emp.department ?? null, emp.location ?? null);
      }
    }
    const filteredUpdates: Record<string,any> = {};
    for (const key of Object.keys(body)) {
      const snakeKey = key.replace(/([A-Z])/g,"_$1").toLowerCase();
      if (ALLOWED_FIELDS.includes(snakeKey)) filteredUpdates[snakeKey] = body[key];
    }
    if (Object.keys(filteredUpdates).length === 0) throw new ValidationError("No valid fields to update");
    if (filteredUpdates.work_email != null) {
      const email = String(filteredUpdates.work_email).trim().toLowerCase();
      if (email) {
        const conflict = await this.repo.findByEmail(email, id);
        if (conflict.length > 0) throw new ConflictError("Work email is already in use by another employee");
        filteredUpdates.work_email = email;
      } else { delete filteredUpdates.work_email; }
    }
    if (filteredUpdates.avatar && typeof filteredUpdates.avatar==="string" && filteredUpdates.avatar.trim().startsWith("data:") && isSharePointAvatarConfigured()) {
      const parsed = parseDataUrl(filteredUpdates.avatar.trim());
      if (parsed) { try { const url = await uploadAvatarToSharePoint(id, parsed.buffer, parsed.contentType); if (url) filteredUpdates.avatar=url; } catch (e) { console.warn("[employees PATCH] SharePoint avatar upload failed:", (e as Error)?.message); } }
    }
    if (filteredUpdates.location !== undefined) {
      const branchId = await this.repo.findBranchIdByLocationName(filteredUpdates.location);
      filteredUpdates.branch_id = branchId;
    }
    const before = await this.repo.getById(id);
    if (!before) throw new NotFoundError("Employee", id);
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(filteredUpdates)) {
      const oldVal = (before as Record<string, unknown>)[key];
      const newVal = filteredUpdates[key];
      const o = auditFieldValue(oldVal);
      const n = auditFieldValue(newVal);
      if (JSON.stringify(o) !== JSON.stringify(n)) changes[key] = { from: o, to: n };
    }
    const changedFieldKeys = getChangedFieldKeys(before as Record<string, unknown>, filteredUpdates);
    const emp = await this.repo.update(id, filteredUpdates);
    if (!emp) throw new NotFoundError("Employee", id);
    if (changes.work_email) {
      await this.authRepo.syncUserEmailForEmployee(
        id,
        String(filteredUpdates.work_email),
        before.work_email,
      );
    }
    if (changedFieldKeys.length > 0) {
      await recordEmployeeProfileChange(id, updatedBy, changedFieldKeys);
    }
    memCache.invalidate("employees:"); memCache.invalidate("avatar:"+id);
    if (audit && Object.keys(changes).length > 0) {
      await appendAuditLog({
        entityType: "employee",
        entityId: id,
        action: "UPDATE",
        performedBy: audit.userId,
        details: { changes },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      });
    }
    return emp;
  }

  async delete(id: string, audit?: AuditActorContext) {
    const existing = await this.repo.getById(id);
    if (!existing) throw new NotFoundError("Employee", id);
    const assetSvc = new AssetService();
    await assetSvc.releaseAllAssetsForEmployee(id, {
      workEmail: existing.work_email,
      reason: "employee_deleted",
      userId: audit?.userId,
    });
    const ok = await this.repo.delete(id);
    if (!ok) throw new NotFoundError("Employee", id);
    memCache.invalidate("employees:");
    if (audit) {
      await appendAuditLog({
        entityType: "employee",
        entityId: id,
        action: "DELETE",
        performedBy: audit.userId,
        details: {
          employee_id: existing.employee_id,
          work_email: existing.work_email,
          name: `${existing.first_name} ${existing.last_name}`,
        },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      });
    }
  }

  async getDepartments() { return this.repo.getDepartments(); }
  async getSuggestedId() { return this.repo.getSuggestedId(); }

  async resolveBranchIdForLocation(location: string | null | undefined) {
    return this.repo.findBranchIdByLocationName(location);
  }

  /** Welcome + login invitation email to the employee's work email. */
  async sendWelcomeInvitation(employeeId: string, actor?: AuditActorContext) {
    const emp = await this.repo.getById(employeeId);
    if (!emp) throw new NotFoundError("Employee", employeeId);
    const workEmail = String(emp.work_email ?? "").trim();
    if (!isProvisionedWorkEmail(workEmail)) {
      throw new ValidationError(
        "Employee does not have a company work email yet. Complete the work-email onboarding task or update their profile first.",
      );
    }
    const employeeName = [emp.first_name, emp.last_name].filter(Boolean).join(" ").trim() || "there";
    const appUrl = resolvePublicAppUrlForTemplates();
    const ctx = {
      employee_name: employeeName,
      job_title: emp.job_title || "—",
      department: emp.department || "—",
      work_email: workEmail,
      login_url: `${appUrl.replace(/\/$/, "")}/login`,
      employee_id: employeeId,
    };
    await notifyEmail("employee.welcome_invitation", ctx, [{ email: workEmail, name: employeeName }]);
    if (actor) {
      await appendAuditLog({
        entityType: "employee",
        entityId: employeeId,
        action: "WELCOME_INVITATION_SENT",
        performedBy: actor.userId,
        details: { work_email: workEmail, employee_name: employeeName },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
    }
    return { message: "Welcome invitation sent.", email: workEmail };
  }

  async getAvatar(id: string, user?: UserPayload) {
    const row = await this.repo.getAvatar(id);
    if (!row?.avatar) return null;
    if (
      user &&
      !hrCanViewInactiveEmployees(user) &&
      user.employeeId !== id &&
      !isActiveLikeEmploymentStatus(row.employment_status)
    ) {
      return null;
    }
    const avatar = String(row.avatar).trim();
    if (avatar.startsWith("data:")) {
      const idx = avatar.indexOf(";base64,");
      if (idx === -1) return null;
      const contentType = avatar.slice(5, idx).trim()||"image/png";
      const buf = Buffer.from(avatar.slice(idx+8).replace(/\s/g,""),"base64");
      return buf.length ? { buffer:buf, contentType } : null;
    }
    if (avatar.startsWith("http://") || avatar.startsWith("https://")) {
      const cacheKey = "avatar:"+id;
      const cached = memCache.get<{buffer:Buffer;contentType:string}>(cacheKey);
      if (cached) return cached;
      const sp = await getAvatarContentBySharingUrl(avatar);
      if (sp) { memCache.set(cacheKey, sp, 10*60*1000); return sp; }
      try {
        const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(),10000);
        const r = await fetch(avatar, { signal: ctrl.signal }); clearTimeout(t);
        if (!r.ok) return null;
        const contentType = r.headers.get("Content-Type")||"image/png";
        const buffer = Buffer.from(await r.arrayBuffer());
        return { buffer, contentType };
      } catch { return null; }
    }
    return null;
  }

  async getDocumentFile(docId: string, userRole: string, userEmployeeId?: string|null) {
    const doc = await this.repo.getDocumentFile(docId);
    if (!doc) throw new NotFoundError("Document", docId);
    if (!["admin","hr"].includes(userRole) && userEmployeeId !== doc.employee_id) throw new ForbiddenError("Not allowed to view this document");
    return doc;
  }
  async listDocuments(employeeId: string) { return this.repo.listDocuments(employeeId); }

  async uploadDocument(employeeId: string, fileUrl: string, fileName: string, documentType?: string, displayName?: string) {
    if (!fileUrl || typeof fileUrl !== "string") throw new ValidationError("fileUrl (data URL) is required");
    if (!fileName || typeof fileName !== "string") throw new ValidationError("fileName is required");
    let fileUrlToStore = fileUrl;
    if (fileUrl.startsWith("data:") && isSharePointAvatarConfigured()) {
      const parsed = parseDataUrl(fileUrl);
      if (parsed) { try { const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g,"_")||"document.pdf"; const url = await uploadFileToSharePoint(`EmployeeDocuments/${employeeId}`, `${Date.now()}-${safeName}`, parsed.buffer, parsed.contentType); if (url) fileUrlToStore=url; } catch (e) { console.error("SharePoint employee document upload failed",e); } }
    }
    const section = documentType && DOCUMENT_SECTION_TYPES.includes(documentType as any) ? documentType : "additional";
    const display = (displayName && String(displayName).trim()) || fileName;
    return this.repo.createDocument(employeeId, section, display, fileUrlToStore, fileName);
  }

  async deleteDocument(docId: string) {
    const ok = await this.repo.deleteDocument(docId);
    if (!ok) throw new NotFoundError("Document", docId);
  }

  async getTimeline(employeeId: string) {
    const data = await this.repo.getTimeline(employeeId);
    if (!data) throw new NotFoundError("Employee", employeeId);
    const { emp, salary, onboarding, offboarding, docs, profileChanges, assetAssignments, benefitAssignments } = data;

    const BENEFIT_CATEGORY_LABELS: Record<string, string> = {
      medical: "Medical",
      life_insurance: "Life Insurance",
      gym: "Gym / Wellness",
      transport: "Transport",
      meal: "Meal / Food",
      other: "Other",
    };
    const events: any[] = [];
    const jobDept = [emp.job_title,emp.department].filter(Boolean).join(", ")||"Employee";
    const toDateOnly = (v: unknown) => (v != null ? String(v).slice(0, 10) : null);
    const joinDate = toDateOnly(emp.join_date);
    const confirmDate = toDateOnly(emp.confirmation_date);
    const probStart = toDateOnly(emp.probation_start_date);
    const probEnd = toDateOnly(emp.probation_end_date);
    const resignDate = toDateOnly(emp.resignation_date);
    const exitDate = toDateOnly(emp.exit_date);
    if (joinDate) events.push({ date: joinDate, type:"joined", title:"Joined company", description:`Joined as ${jobDept}` });
    if (confirmDate) events.push({ date: confirmDate, type:"confirmation", title:"Confirmed", description:"Probation confirmed; converted to permanent." });
    if (probStart) events.push({ date: probStart, type:"probation_start", title:"Probation started", description:"Probation period began." });
    if (probEnd) {
      const endTime = new Date(probEnd).getTime();
      const hasEnded = !!confirmDate || (endTime <= Date.now());
      if (hasEnded) events.push({ date: probEnd, type:"probation_end", title:"Probation ended", description:"Probation period ended." });
    }
    for (const r of salary) {
      const d = toDateOnly(r.start_date) ?? r.start_date?.toString().slice(0, 10);
      const currency = r.currency || "PKR";
      const monthly = getMonthlyGrossFromRecord(r);
      let desc = (r.reason || "Salary revision").trim();
      if (monthly != null && !Number.isNaN(monthly)) {
        desc = salaryRecordHasBreakdown(r)
          ? `${currency} ${monthly.toLocaleString()}/mo gross — ${desc}`
          : `${currency} ${monthly.toLocaleString()}/mo — ${desc}`;
      }
      events.push({ date: d, type: "compensation", title: "Compensation update", description: desc });
    }
    for (const r of onboarding) { if (r.created_at) events.push({ date:r.created_at, type:"onboarding_started", title:"Onboarding started", description:"Onboarding checklist created." }); if (r.completed_at) events.push({ date:r.completed_at, type:"onboarding_completed", title:"Onboarding completed", description:"Onboarding checklist completed." }); }
    for (const r of offboarding) { if (r.initiated_at) events.push({ date:r.initiated_at, type:"offboarding_initiated", title:"Offboarding initiated", description:`Exit date: ${r.exit_date||"—"}. Status: ${r.status||"—"}.` }); if (r.completed_at) events.push({ date:r.completed_at, type:"offboarding_completed", title:"Offboarding completed", description:"Offboarding process completed." }); }
    if (resignDate) events.push({ date: resignDate, type:"resignation", title:"Resignation", description:"Resignation submitted." });
    if (exitDate) events.push({ date: exitDate, type:"exit", title:"Last working day", description:"Employee exit date." });
    for (const r of docs) { const name = (r.display_name||r.document_type||"Document").toString().replace(/_/g," "); events.push({ date:r.uploaded_at?.toString().slice(0,19), type:"document", title:"Document uploaded", description:name }); }
    for (const r of profileChanges) {
      const raw = r.changed_fields;
      const fields = (Array.isArray(raw) ? raw : typeof raw === "string" ? JSON.parse(raw) : []) as string[];
      events.push({
        date: r.changed_at?.toString().slice(0, 19),
        type: "profile_updated",
        title: "Profile updated",
        description: formatProfileChangeDescription(fields),
      });
    }
    for (const r of assetAssignments) {
      const name = (r.asset_name || r.asset_id || "Asset").toString();
      const when = r.created_at?.toString().slice(0, 19);
      if (!when) continue;
      events.push({
        date: when,
        type: "asset_assigned",
        title: "Asset assigned",
        description: `Assets: ${name}${r.asset_id ? ` (${r.asset_id})` : ""}`,
      });
    }
    for (const r of benefitAssignments ?? []) {
      const when = r.assigned_at?.toString().slice(0, 19);
      if (!when) continue;
      const title = (r.title || "Benefit").toString();
      const catLabel = BENEFIT_CATEGORY_LABELS[r.category] ?? r.category ?? "Benefit";
      const parts = [catLabel];
      if (r.provider) parts.push(String(r.provider));
      if (r.card_number) parts.push(`Card #${r.card_number}`);
      if (r.assigned_by_name) parts.push(`Assigned by ${r.assigned_by_name}`);
      events.push({
        date: when,
        type: "benefit_assigned",
        title: `Benefit assigned: ${title}`,
        description: parts.join(" · "),
      });
    }
    events.sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime());

    // Deduplicate: same date + type + title + description (e.g. duplicate profile_updated from multiple rows)
    const seen = new Set<string>();
    const deduped = events.filter((e) => {
      const key = `${e.date}|${e.type}|${e.title}|${e.description}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Drop events that are clearly before employment (e.g. wrong year in salary start_date like 2001 vs 2026)
    const joinTime = emp.join_date ? new Date(emp.join_date).getTime() : null;
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;
    const filtered = joinTime
      ? deduped.filter((e) => {
          const t = new Date(e.date).getTime();
          if (Number.isNaN(t)) return true;
          return t >= joinTime - oneYearMs;
        })
      : deduped;

    return { events: filtered };
  }

  async syncTentativeDocuments(employeeId: string) {
    const appId = await this.repo.getHiredApplicationId(employeeId);
    if (!appId) throw new NotFoundError("No hired application for employee", employeeId);
    const tentativeId = await this.repo.getClearedTentativeId(appId);
    if (!tentativeId) throw new NotFoundError("No cleared tentative record for this hire", appId);
    const verified = await this.repo.getVerifiedTentativeDocs(tentativeId);
    const existingIds = await this.repo.getExistingTentativeDocIds(employeeId);
    let copied = 0;
    for (const d of verified) { if (existingIds.has(d.id)) continue; await this.repo.copyTentativeDoc(employeeId, d, TENTATIVE_DOC_LABELS[d.document_type]||(d.document_type||"").replace(/_/g," ")); copied++; }
    return { message: copied>0?`Copied ${copied} document(s) from tentative verification`:"No new documents to copy (already synced)", copied };
  }

  async migrateAvatarsFromUrls() {
    const rows = await this.repo.getAvatarUrlRows();
    let updated=0, failed=0;
    for (const row of rows) { const url = await downloadUrlAsDataUrl(row.avatar); if (url) { await this.repo.updateAvatar(row.id, url); updated++; } else { failed++; } }
    memCache.invalidate("employees:");
    return { total:rows.length, updated, failed };
  }

  async migrateAvatarsToSharePoint() {
    if (!isSharePointAvatarConfigured()) throw new ValidationError(`SharePoint not configured. Missing: ${getMissingSharePointEnvVars().join(", ")}`);
    const rows = await this.repo.getAvatarDataUrlRows();
    let updated=0, failed=0;
    for (const row of rows) { const parsed = parseDataUrl(row.avatar); if (!parsed) { failed++; continue; } try { const url = await uploadAvatarToSharePoint(row.id, parsed.buffer, parsed.contentType); if (url) { await this.repo.updateAvatar(row.id, url); updated++; } else { failed++; } } catch { failed++; } }
    memCache.invalidate("employees:");
    return { total:rows.length, updated, failed, skipped:rows.length-updated-failed };
  }

  async importFreshteamCsv(csv: string) {
    if (!csv?.trim()) throw new ValidationError('Body must include { csv: "..." } with FreshTeam export CSV content.');
    const rows = parseFreshteamEmployeeCSV(csv);
    if (rows.length===0) throw new ValidationError("No valid employee rows found.");
    const repo = this.repo; let created=0, updated=0; const errors: string[] = [];
    const toTS = (d:Date)=>d.toISOString(); const toDate=(d:Date)=>d.toISOString().split("T")[0];
    for (const e of rows) {
      const joinDateStr=toTS(e.joinDate), probStartStr=e.probationStartDate?toTS(e.probationStartDate):null, probEndStr=e.probationEndDate?toTS(e.probationEndDate):null, dobStr=e.dob?toDate(e.dob):null, termStr=e.terminationDate?toTS(e.terminationDate):null;
      const existing = await repo.findByEmail(e.workEmail);
      if (existing.length>0) {
        await repo.update(existing[0].id, { first_name:e.firstName,last_name:e.lastName,middle_name:e.middleName,nickname:e.nickname,job_title:e.jobTitle,department:e.department,sub_department:e.subDepartment,business_unit:e.businessUnit,primary_team:e.primaryTeam,cost_center:e.costCenter,grade:e.grade,job_category:e.jobCategory,location:e.location,manager_email:e.managerEmail,hr_email:e.hrEmail,employment_status:e.employmentStatus,employee_type:e.employeeType,shift:e.shift,join_date:joinDateStr,probation_start_date:probStartStr,probation_end_date:probEndStr,notice_period:e.noticePeriod,resignation_reason:e.resignationReason,exit_date:termStr,exit_type:e.exitType,personal_email:e.personalEmail,personal_phone:e.personalPhone,work_phone:e.workPhone,dob:dobStr,gender:e.gender,marital_status:e.maritalStatus,street:e.street,city:e.city,state:e.state,country:e.country,zip_code:e.zipCode,comm_street:e.commStreet,comm_city:e.commCity,comm_state:e.commState,comm_country:e.commCountry,comm_zip_code:e.commZipCode,custom_field_1:e.customField1,custom_field_2:e.customField2,source:"freshteam" });
        updated++;
      } else {
        try {
          await repo.create({ employee_id:e.employeeId,work_email:e.workEmail,first_name:e.firstName,middle_name:e.middleName,last_name:e.lastName,nickname:e.nickname,job_title:e.jobTitle,department:e.department,sub_department:e.subDepartment,business_unit:e.businessUnit,primary_team:e.primaryTeam,cost_center:e.costCenter,grade:e.grade,job_category:e.jobCategory,location:e.location,manager_email:e.managerEmail,hr_email:e.hrEmail,employment_status:e.employmentStatus,employee_type:e.employeeType,shift:e.shift,join_date:joinDateStr,probation_start_date:probStartStr,probation_end_date:probEndStr,notice_period:e.noticePeriod,resignation_reason:e.resignationReason,exit_date:termStr,exit_type:e.exitType,personal_email:e.personalEmail,personal_phone:e.personalPhone,work_phone:e.workPhone,dob:dobStr,gender:e.gender,marital_status:e.maritalStatus,street:e.street,city:e.city,state:e.state,country:e.country,zip_code:e.zipCode,comm_street:e.commStreet,comm_city:e.commCity,comm_state:e.commState,comm_country:e.commCountry,comm_zip_code:e.commZipCode,custom_field_1:e.customField1,custom_field_2:e.customField2,source:"freshteam" });
          created++;
        } catch (err: any) { errors.push(`${e.workEmail}: ${err.message||String(err)}`); }
      }
    }
    await repo.resolveManagerIds();
    memCache.invalidate("employees:");
    return { message:"FreshTeam CSV import completed.", created, updated, total:rows.length, errors:errors.length>0?errors:undefined };
  }

  async importFreshteamExtras(body: any) {
    const { emergencyContactsCsv="",compensationsCsv="",bankAccountsCsv="",dependentsCsv="",stocksCsv="" } = body;
    if (!emergencyContactsCsv.trim()&&!compensationsCsv.trim()&&!bankAccountsCsv.trim()&&!dependentsCsv.trim()&&!stocksCsv.trim()) throw new ValidationError("Body must include at least one CSV field");
    const stats = { emergencyContacts:0,compensations:0,bankAccounts:0,dependents:0,stocks:0 };
    const errors: string[] = [];
    const repo = this.repo;
    const getEmpId = async (email: string) => { const r = await repo.findByEmail(email); return r[0]?.id??null; };
    const sql = (repo as any).sql;
    if (emergencyContactsCsv.trim()) { for (const r of parseFreshteamEmergencyContactsCSV(emergencyContactsCsv)) { const id=await getEmpId(r.workEmail); if (!id) { errors.push(`Emergency contact: no employee for ${r.workEmail}`); continue; } await sql`INSERT INTO emergency_contacts(employee_id,full_name,relationship,phone,email,address) VALUES(${id},${r.fullName},${r.relationship},${r.phone},${r.email},${r.address})`; stats.emergencyContacts++; } }
    if (compensationsCsv.trim()) { for (const r of parseFreshteamCompensationsCSV(compensationsCsv)) { const id=await getEmpId(r.workEmail); if (!id) { errors.push(`Compensation: no employee for ${r.workEmail}`); continue; } await sql`UPDATE salary_details SET is_current=false,updated_at=NOW() WHERE employee_id=${id} AND is_current=true`; await sql`INSERT INTO salary_details(employee_id,annual_salary,currency,start_date,is_current,reason,pay_rate,pay_rate_period,payout_frequency,pay_group,pay_method,eligible_work_hours,additional_details,notes) VALUES(${id},${r.annualSalary},${r.currency},${r.effectiveDate.toISOString()},true,${r.reason},${r.payRateAmount},${r.duration||"Monthly"},${r.payoutFrequency},${r.payGroup},${r.payMethod},${r.eligibleWorkHours},${r.additionalDetails},${r.summaryNotes})`; stats.compensations++; } }
    if (bankAccountsCsv.trim()) { for (const r of parseFreshteamBankAccountsCSV(bankAccountsCsv)) { const id=await getEmpId(r.workEmail); if (!id) { errors.push(`Bank account: no employee for ${r.workEmail}`); continue; } await sql`INSERT INTO banking_details(employee_id,bank_name,name_on_account,bank_code,account_number,is_primary) VALUES(${id},${r.bankName},${r.nameOnAccount},${r.bankCode},${r.accountNumber},true)`; stats.bankAccounts++; } }
    if (dependentsCsv.trim()) { for (const r of parseFreshteamDependentsCSV(dependentsCsv)) { const id=await getEmpId(r.workEmail); if (!id) { errors.push(`Dependent: no employee for ${r.workEmail}`); continue; } await sql`INSERT INTO dependents(employee_id,full_name,relationship,date_of_birth,gender) VALUES(${id},${r.fullName},${r.relationship},${r.dateOfBirth?r.dateOfBirth.toISOString():null},${r.gender})`; stats.dependents++; } }
    if (stocksCsv.trim()) { for (const r of parseFreshteamStocksCSV(stocksCsv)) { const id=await getEmpId(r.workEmail); if (!id) { errors.push(`Stock: no employee for ${r.workEmail}`); continue; } await sql`INSERT INTO stock_grants(employee_id,units,grant_date,vesting_schedule,notes) VALUES(${id},${r.units},${r.grantDate.toISOString()},${r.vestingSchedule},${r.notes})`; stats.stocks++; } }
    return { message:"FreshTeam extras import completed.", stats, errors:errors.length>0?errors:undefined };
  }

  async getDependents(employeeId: string) {
    return this.repo.getDependents(employeeId);
  }

  async getEmergencyContacts(employeeId: string) {
    return this.repo.getEmergencyContacts(employeeId);
  }

  async createDependent(employeeId: string, body: Record<string, unknown>) {
    const fullName = typeof body.fullName === "string" ? body.fullName : "";
    if (!fullName.trim()) throw new ValidationError("Full name is required");
    return this.repo.createDependent(employeeId, {
      fullName,
      relationship: body.relationship == null ? null : String(body.relationship),
      dateOfBirth: body.dateOfBirth == null || body.dateOfBirth === "" ? null : String(body.dateOfBirth),
      gender: body.gender == null ? null : String(body.gender),
    });
  }

  async updateDependent(id: string, body: Record<string, unknown>) {
    const fullName = typeof body.fullName === "string" ? body.fullName : "";
    if (!fullName.trim()) throw new ValidationError("Full name is required");
    const row = await this.repo.updateDependent(id, {
      fullName,
      relationship: body.relationship == null ? null : String(body.relationship),
      dateOfBirth: body.dateOfBirth == null || body.dateOfBirth === "" ? null : String(body.dateOfBirth),
      gender: body.gender == null ? null : String(body.gender),
    });
    if (!row) throw new NotFoundError("Dependent", id);
    return row;
  }

  async deleteDependent(id: string) {
    const ok = await this.repo.deleteDependent(id);
    if (!ok) throw new NotFoundError("Dependent", id);
  }

  async createEmergencyContact(employeeId: string, body: Record<string, unknown>) {
    const fullName = typeof body.fullName === "string" ? body.fullName : "";
    if (!fullName.trim()) throw new ValidationError("Full name is required");
    return this.repo.createEmergencyContact(employeeId, {
      fullName,
      relationship: body.relationship == null ? null : String(body.relationship),
      phone: body.phone == null ? null : String(body.phone),
      email: body.email == null ? null : String(body.email),
      address: body.address == null ? null : String(body.address),
    });
  }

  async updateEmergencyContact(id: string, body: Record<string, unknown>) {
    const fullName = typeof body.fullName === "string" ? body.fullName : "";
    if (!fullName.trim()) throw new ValidationError("Full name is required");
    const row = await this.repo.updateEmergencyContact(id, {
      fullName,
      relationship: body.relationship == null ? null : String(body.relationship),
      phone: body.phone == null ? null : String(body.phone),
      email: body.email == null ? null : String(body.email),
      address: body.address == null ? null : String(body.address),
    });
    if (!row) throw new NotFoundError("Emergency contact", id);
    return row;
  }

  async deleteEmergencyContact(id: string) {
    const ok = await this.repo.deleteEmergencyContact(id);
    if (!ok) throw new NotFoundError("Emergency contact", id);
  }
}
