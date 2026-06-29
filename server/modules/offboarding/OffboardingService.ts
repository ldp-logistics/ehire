import { OffboardingRepository } from "./OffboardingRepository.js";
import { NotFoundError, ValidationError, ConflictError } from "../../core/types/index.js";
import { effectiveRegionsFor, getEmployeeRegion, getOffboardingRegion } from "../../lib/regionAccess.js";
import { onOffboardingComplete } from "../../lib/offboardingHooks.js";
import { AssetService } from "../assets/AssetService.js";
import {
  dedupeRecipientsByEmail,
  getEmployeeNotificationRecipient,
  getEmailsByRole,
  getEmailsByRolesForRegion,
  notifyEmail,
  resolveActorDisplayForEmail,
} from "../../lib/emailNotifications.js";

function humanizeOffboardingTypeLabel(t: string | null | undefined): string {
  const s = (t ?? "").trim().toLowerCase().replace(/_/g, " ");
  if (!s) return "—";
  return s.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function parseOptionalDateField(label: string, value: unknown): string | null {
  if (value == null || value === "") return null;
  const s = String(value).trim().slice(0, 10);
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(s) || isNaN(Date.parse(s))) throw new ValidationError(`Invalid ${label}. Use YYYY-MM-DD.`);
  return s;
}

function dateOnlyForDisplay(d: unknown): string {
  if (d == null || d === "") return "—";
  return String(d).slice(0, 10);
}

export type OffboardingRegionCtx = {
  regionCode?: string | null;
  isRegionalSuperAdmin?: boolean;
  requestedRegion?: string | null;
};

export class OffboardingService {
  private readonly repo = new OffboardingRepository();

  private async hrRecipientsForEmployee(employeeId: string) {
    const empRegion = await getEmployeeRegion(employeeId);
    const scoped = empRegion
      ? await getEmailsByRolesForRegion(["hr", "limited_hr"], empRegion)
      : [];
    const fallback =
      scoped.length > 0
        ? []
        : [
            ...(await getEmailsByRole("hr")),
            ...(await getEmailsByRole("limited_hr")),
          ];
    return dedupeRecipientsByEmail([...scoped, ...fallback]);
  }

  async list(status?: string, region?: { regionCode?: string | null; isRegionalSuperAdmin?: boolean; requestedRegion?: string | null }) {
    const regions = region ? effectiveRegionsFor(region, region.requestedRegion) : null;
    return this.repo.list(status, regions);
  }
  async listWhereAssignee(employeeId: string) { return this.repo.listWhereAssignee(employeeId); }
  async getById(id: string) { const r = await this.repo.getById(id); if (!r) throw new NotFoundError("Offboarding record", id); return r; }

  async canAccessRecord(
    recordId: string,
    role: string,
    currentUserEmployeeId: string | null,
    region?: OffboardingRegionCtx,
  ): Promise<boolean> {
    const r = (role ?? "").toLowerCase();
    if (r === "admin" || r === "hr") {
      if (!region) return false;
      const regions = effectiveRegionsFor(region, region.requestedRegion);
      if (regions === null) return true;
      const recRegion = await getOffboardingRegion(recordId);
      return !!recRegion && regions.includes(recRegion);
    }
    if (!currentUserEmployeeId) return false;
    return this.repo.isAssigneeOfRecord(recordId, currentUserEmployeeId);
  }

  async canAccessRecordByEmployeeId(
    employeeId: string,
    role: string,
    currentUserEmployeeId: string | null,
    region?: OffboardingRegionCtx,
  ): Promise<boolean> {
    const r = (role ?? "").toLowerCase();
    if (r === "admin" || r === "hr") {
      if (!region) return false;
      const regions = effectiveRegionsFor(region, region.requestedRegion);
      if (regions === null) return true;
      const empRegion = await getEmployeeRegion(employeeId);
      return !!empRegion && regions.includes(empRegion);
    }
    const record = await this.repo.getRecordByEmployeeId(employeeId);
    if (!record) return false;
    if (!currentUserEmployeeId) return false;
    return this.repo.isAssigneeOfRecord(record.id, currentUserEmployeeId);
  }

  async canUpdateTask(
    taskId: string,
    role: string,
    currentUserEmployeeId: string | null,
    region?: OffboardingRegionCtx,
  ): Promise<boolean> {
    const r = (role ?? "").toLowerCase();
    if (r === "admin" || r === "hr") {
      if (!region) return false;
      const regions = effectiveRegionsFor(region, region.requestedRegion);
      if (regions === null) return true;
      const task = await this.repo.getTask(taskId);
      if (!task?.offboarding_id) return false;
      const recRegion = await getOffboardingRegion(task.offboarding_id);
      return !!recRegion && regions.includes(recRegion);
    }
    const task = await this.repo.getTask(taskId);
    if (!task) return false;
    return task.assigned_to === currentUserEmployeeId;
  }

  async initiate(data: any, initiatedBy: string, todayStr: string) {
    const { employeeId, offboardingType, reason, noticeRequired, noticePeriodDays, exitDateOverride, resignationDate, remarks } = data;
    if (!employeeId || !offboardingType) throw new ValidationError("employeeId and offboardingType are required");

    const emp = await this.repo.getEmployee(employeeId);
    if (!emp) throw new NotFoundError("Employee", employeeId);
    if (emp.employment_status === "offboarded") throw new ValidationError("Employee is already offboarded");
    if (emp.employment_status === "terminated") throw new ValidationError("Employee is already terminated");

    if (exitDateOverride) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(exitDateOverride) || isNaN(Date.parse(exitDateOverride))) throw new ValidationError("Invalid exit date format. Use YYYY-MM-DD.");
    }
    let resignationDateResolved = parseOptionalDateField("resignation date", resignationDate);
    if (!resignationDateResolved && offboardingType === "resignation") resignationDateResolved = todayStr;
    if (await this.repo.getActiveOffboarding(employeeId)) throw new ConflictError("An active offboarding already exists for this employee");
    if (await this.repo.getPendingOnboarding(employeeId)) throw new ValidationError("Cannot initiate offboarding while employee is still being onboarded");

    let exitDate: string; let status: string;
    if (noticeRequired && noticePeriodDays && noticePeriodDays > 0) {
      exitDate = exitDateOverride ?? (() => { const d = new Date(todayStr + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + noticePeriodDays); return d.toISOString().slice(0, 10); })();
      status = "in_notice";
    } else { exitDate = exitDateOverride || todayStr; status = "initiated"; }

    const record = await this.repo.createRecord({ employeeId, initiatedBy, offboardingType, reason, noticeRequired, noticePeriodDays, resignationDate: resignationDateResolved, exitDate, status, remarks });
    await this.repo.updateEmployeeExitInfo(employeeId, offboardingType, reason, exitDate, resignationDateResolved);
    await this.repo.generateDefaultTasks(record.id, employeeId);
    await this.repo.audit(record.id, "initiate", initiatedBy, `Offboarding initiated. Type: ${offboardingType}. Notice: ${noticeRequired ? noticePeriodDays + " days" : "None"}. Resignation date: ${resignationDateResolved ?? "—"}. Exit date: ${exitDate}`);
    // Email: HR-only notification for offboarding initiation
    (async()=>{try{const hrs=await this.hrRecipientsForEmployee(employeeId);const doerName=await resolveActorDisplayForEmail(initiatedBy);const empName=`${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim()||"Employee";const ctx={employee_name:empName,employee_id:employeeId,offboarding_record_id:record.id,exit_date:exitDate,resignation_date:dateOnlyForDisplay(resignationDateResolved),offboarding_type:humanizeOffboardingTypeLabel(offboardingType),doer_name:doerName};if(hrs.length)await notifyEmail("offboarding.initiated",ctx,hrs);}catch{}})();
    // Do not auto-complete on initiate. HR must run through checklist (tasks, asset return, etc.)
    // and explicitly click "Complete Offboarding" when exit date has been reached.
    return record;
  }

  private async _completeInternal(offboardingId: string, employeeId: string, emp: any, performedBy: string, offboardingType: string) {
    await this.repo.completeRecord(offboardingId);
    await this.repo.offboardEmployee(employeeId, offboardingType);
    const statusLabel = (offboardingType || "").toLowerCase() === "termination" ? "terminated" : "offboarded";
    await this.repo.audit(offboardingId, "complete", performedBy, `Offboarding completed. Employee status set to ${statusLabel}. Integration hooks fired.`);
    await onOffboardingComplete(emp, offboardingId);
    // Email: HR-only notification for offboarding completion
    (async()=>{try{const hrs=await this.hrRecipientsForEmployee(employeeId);const exitDate=emp.exit_date?String(emp.exit_date).slice(0,10):"—";const empName=`${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim()||"Employee";const ctx={employee_name:empName,employee_id:employeeId,offboarding_record_id:offboardingId,exit_date:exitDate};if(hrs.length)await notifyEmail("offboarding.completed",ctx,hrs);}catch{}})();
  }

  async updateExitDate(id: string, exitDate: string, reason: string|null, performedBy: string) {
    const record = await this.repo.getById(id);
    if (!record) throw new NotFoundError("Offboarding record", id);
    if (record.status === "completed" || record.status === "cancelled") throw new ValidationError(`Cannot modify a ${record.status} offboarding`);
    const prevDate = record.exit_date;
    await this.repo.updateExitDate(id, exitDate, record.employee_id);
    await this.repo.audit(id, "update_exit_date", performedBy, `Exit date changed${reason ? ". Reason: " + reason : ""}`, String(prevDate), exitDate);
    return this.repo.getById(id);
  }

  async updateResignationDate(id: string, resignationDate: string | null, reason: string|null, performedBy: string) {
    const record = await this.repo.getById(id);
    if (!record) throw new NotFoundError("Offboarding record", id);
    if (record.status === "completed" || record.status === "cancelled") throw new ValidationError(`Cannot modify a ${record.status} offboarding`);
    const parsed = resignationDate == null || resignationDate === "" ? null : parseOptionalDateField("resignation date", resignationDate);
    const prev = record.resignation_date;
    await this.repo.updateResignationDate(id, parsed, record.employee_id);
    await this.repo.audit(id, "update_resignation_date", performedBy, `Resignation date changed${reason ? ". Reason: " + reason : ""}`, prev ? String(prev).slice(0, 10) : undefined, parsed ?? undefined);
    return this.repo.getById(id);
  }

  async cancel(id: string, reason: string|null, performedBy: string) {
    const record = await this.repo.getById(id);
    if (!record) throw new NotFoundError("Offboarding record", id);
    if (record.status === "completed") throw new ValidationError("Cannot cancel a completed offboarding");
    if (record.status === "cancelled") throw new ValidationError("Already cancelled");
    await this.repo.cancelRecord(id, reason);
    await this.repo.revertEmployeeExitInfo(record.employee_id);
    await this.repo.audit(id, "cancel", performedBy, `Offboarding cancelled${reason ? ". Reason: " + reason : ""}`);
    return this.repo.getById(id);
  }

  async complete(id: string, todayStr: string, performedBy: string) {
    const record = await this.repo.getById(id);
    if (!record) throw new NotFoundError("Offboarding record", id);
    if (record.status === "completed") throw new ValidationError("Already completed");
    if (record.status === "cancelled") throw new ValidationError("Cannot complete a cancelled offboarding");
    const exitDateStr = typeof record.exit_date === "string" ? record.exit_date : (record.exit_date as Date).toISOString().slice(0, 10);
    const exitDateReached = exitDateStr <= todayStr;
    if (!exitDateReached) {
      const tasks = await this.repo.getTasks(id);
      const allDone = tasks.length === 0 || tasks.every((t: any) => t.status === "completed" || t.status === "waived");
      if (!allDone) throw new ValidationError(`Cannot complete before exit date (${exitDateStr}). Complete or waive all checklist items to complete early.`);
    }
    const emp = await this.repo.getEmployee(record.employee_id);
    if (!emp) throw new NotFoundError("Employee", record.employee_id);
    await this._completeInternal(id, emp.id, emp, performedBy, String(record.offboarding_type ?? ""));
    return this.repo.getById(id);
  }

  async updateTask(taskId: string, data: any, performedBy: string) {
    const task = await this.repo.getTask(taskId);
    if (!task) throw new NotFoundError("Task", taskId);
    const prevAssignee = task.assigned_to ?? null;
    const update = { ...data, _existing_completed_at: task.completed_at, _prev_status: task.status };
    if (data.hasOwnProperty("assignedTo")) update._assigned_to = data.assignedTo;
    else update._assigned_to = task.assigned_to;
    const updated = await this.repo.updateTask(taskId, update);
    if (data.hasOwnProperty("assignedTo")) {
      const newAssignee = data.assignedTo ?? null;
      if (newAssignee && newAssignee !== prevAssignee) {
        (async () => {
          try {
            await this.sendTaskAssignedEmail(taskId, String(newAssignee), performedBy);
          } catch { /* fire-and-forget */ }
        })();
      }
    }
    if (data.status === "completed" && task.task_type === "asset_return" && task.related_asset_id) {
      const assetSvc = new AssetService();
      await assetSvc.releaseAssignmentToStock(task.related_asset_id, "offboarding_asset_return_task", performedBy);
    }
    return updated;
  }

  /** Email assignee when they are newly assigned to an offboarding checklist task. */
  private async sendTaskAssignedEmail(taskId: string, assigneeEmployeeId: string, assignedBy: string) {
    const row = await this.repo.getTaskAssignmentEmailContext(taskId);
    if (!row) return;
    const status = String(row.record_status ?? "");
    if (status !== "initiated" && status !== "in_notice") return;

    const assignee = await getEmployeeNotificationRecipient(assigneeEmployeeId);
    if (!assignee) return;

    const employeeName = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "Employee";
    const taskTitle = (row.title && String(row.title).trim()) || humanizeOffboardingTypeLabel(row.task_type);
    const doerName = await resolveActorDisplayForEmail(assignedBy);

    await notifyEmail(
      "offboarding.task_assigned",
      {
        employee_name: employeeName,
        employee_id: row.employee_id,
        offboarding_record_id: row.offboarding_id,
        task_name: taskTitle,
        task_type: humanizeOffboardingTypeLabel(row.task_type),
        task_title: taskTitle,
        emp_id: row.emp_code ? String(row.emp_code) : "—",
        department: row.department ? String(row.department) : "—",
        assigned_by: doerName,
      },
      [assignee],
    );
  }

  async getTasks(offboardingId: string) { return this.repo.getTasks(offboardingId); }
  async getAuditLog(offboardingId: string) { return this.repo.getAuditLog(offboardingId); }

  /** Permanently delete a completed or cancelled offboarding record. */
  async delete(id: string) {
    const record = await this.repo.getById(id);
    if (!record) throw new NotFoundError("Offboarding record", id);
    if (record.status !== "completed" && record.status !== "cancelled") {
      throw new ValidationError("Only completed or cancelled offboarding records can be deleted. Cancel active records first.");
    }
    await this.repo.deleteRecord(id);
  }

  /** Full details by employee id (record + tasks with assignees + assets + audit). For frontend detail dialog. */
  async getDetailsByEmployeeId(employeeId: string) {
    const record = await this.repo.getRecordByEmployeeId(employeeId);
    if (!record) throw new NotFoundError("Offboarding record for employee", employeeId);
    const [tasks, assets, auditLog] = await Promise.all([
      this.repo.getTasksWithAssignees(record.id),
      this.repo.getAssetsForEmployee(employeeId),
      this.repo.getAuditLog(record.id),
    ]);
    const totalTasks = tasks.length;
    const doneTasks = tasks.filter((t: any) => t.status === "completed").length;
    return {
      ...record,
      total_tasks: totalTasks,
      done_tasks: doneTasks,
      tasks,
      assets,
      audit_log: auditLog,
    };
  }
}
