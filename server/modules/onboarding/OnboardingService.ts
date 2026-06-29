import { OnboardingRepository } from "./OnboardingRepository.js";
import { OnboardingTemplateRepository } from "./templates/OnboardingTemplateRepository.js";
import {
  dedupeRecipientsByEmail,
  getEmployeeNotificationRecipient,
  getEmailsByRoleForRegion,
  notifyEmail,
  resolveActorDisplayForEmail,
} from "../../lib/emailNotifications.js";
import type { OnboardingRow, OnboardingTaskRow, OnboardingRecordSectionRow, OnboardingSectionAssigneeRow } from "./OnboardingRepository.js";
import type {
  OnboardingResponseDTO, OnboardingTaskDTO, OnboardingRecordSectionDTO,
  OnboardingSectionAssigneeDTO, InitiateOnboardingDTO,
} from "./Onboarding.dto.js";
import { NotFoundError, ConflictError, ValidationError, UnprocessableError, ForbiddenError } from "../../core/types/index.js";
import { AssetService } from "../assets/AssetService.js";
import { AuthRepository } from "../auth/AuthRepository.js";
import { EmployeeService } from "../employees/EmployeeService.js";
import { memCache } from "../../lib/perf.js";
import { effectiveRegionsFor, getEmployeeRegion, type RegionCode } from "../../lib/regionAccess.js";
import { recordEmployeeProfileChange } from "../../lib/employeeProfileChanges.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isWorkEmailTask(taskName: string): boolean {
  const n = (taskName || "").toLowerCase();
  return n.includes("microsoft") || n.includes("work email") || n.includes("company microsoft account");
}
function isLaptopTask(taskName: string): boolean {
  const n = (taskName || "").toLowerCase();
  return n.includes("laptop") || n.includes("notebook") || n.includes("desktop");
}

/** Task names that collect the employee profile pseudonym (Also known as). Match is substring, case-insensitive. */
function isPseudonymTask(taskName: string): boolean {
  const n = (taskName || "").toLowerCase();
  if (!n.trim()) return false;
  if (n.includes("pseudonym")) return true;
  if (n.includes("also known as")) return true;
  if (n.includes("also-known-as")) return true;
  if (n.includes("aka") && (n.includes("name") || n.includes("identity"))) return true;
  if (n.includes("desk name") || n.includes("desk-name")) return true;
  if (n.includes("office name") || n.includes("office-name")) return true;
  return false;
}

export type OnboardingActor = { id?: string; role?: string; employeeId?: string | null; roles?: string[]; regionCode?: string | null; isRegionalSuperAdmin?: boolean; requestedRegion?: string | null } | null | undefined;
function isAdminOrHR(actor: OnboardingActor): boolean {
  const role = (actor?.role ?? "").toLowerCase();
  if (role === "admin" || role === "hr" || role === "onboarding_specialist") return true;
  // Also check the grants array for onboarding_specialist
  const grants = actor?.roles ?? [];
  return grants.includes("onboarding_specialist");
}

async function assertEmployeeRegion(actor: OnboardingActor, employeeId: string): Promise<void> {
  if (!isAdminOrHR(actor) || !actor) return;
  const regions = effectiveRegionsFor(actor, actor.requestedRegion);
  if (regions === null) return;
  const empRegion = await getEmployeeRegion(employeeId);
  if (regions.length === 0 || !empRegion || !regions.includes(empRegion)) {
    throw new ForbiddenError("This employee belongs to a different region.");
  }
}

export class OnboardingService {
  private readonly repo = new OnboardingRepository();
  private readonly templateRepo = new OnboardingTemplateRepository();
  private readonly assetService = new AssetService();
  private readonly authRepo = new AuthRepository();
  private readonly employeeSvc = new EmployeeService();

  async listAll(actor?: OnboardingActor): Promise<OnboardingResponseDTO[]> {
    const regions = actor ? effectiveRegionsFor(actor, actor.requestedRegion) : null;
    const rows = isAdminOrHR(actor)
      ? await this.repo.findAll(regions)
      : actor?.employeeId
        ? await this.repo.findAllWhereAssignee(actor.employeeId)
        : [];
    return rows.map(r => this.toDTO(r));
  }

  async getRecord(id: string, actor?: OnboardingActor): Promise<OnboardingResponseDTO> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundError("Onboarding record", id);
    if (isAdminOrHR(actor)) {
      if (actor) {
        const regions = effectiveRegionsFor(actor, actor.requestedRegion);
        if (regions !== null) {
          let recRegion: RegionCode | null =
            ((row as { region_code?: string | null }).region_code as RegionCode | null) ?? null;
          if (!recRegion && row.employee_id) {
            recRegion = await getEmployeeRegion(String(row.employee_id));
          }
          if (regions.length === 0 || !recRegion || !regions.includes(recRegion)) {
            throw new NotFoundError("Onboarding record", id);
          }
        }
      }
    } else if (actor?.employeeId) {
      const canView = await this.repo.hasActiveAssigneeWorkOnRecord(id, actor.employeeId);
      if (!canView) {
        throw new ForbiddenError("You do not have open onboarding tasks on this record");
      }
    }
    const [tasks, sections, assignees] = await Promise.all([
      this.repo.getTasks(id),
      this.repo.getSections(id),
      this.repo.getAllSectionAssignees(id),
    ]);
    const assigneesBySection = new Map<string, OnboardingSectionAssigneeRow[]>();
    for (const a of assignees) {
      if (!assigneesBySection.has(a.section_id)) assigneesBySection.set(a.section_id, []);
      assigneesBySection.get(a.section_id)!.push(a);
    }
    const tasksBySection = new Map<string, OnboardingTaskRow[]>();
    const unsectionedTasks: OnboardingTaskRow[] = [];
    for (const t of tasks) {
      if (t.section_id) {
        if (!tasksBySection.has(t.section_id)) tasksBySection.set(t.section_id, []);
        tasksBySection.get(t.section_id)!.push(t);
      } else {
        unsectionedTasks.push(t);
      }
    }
    const sectionDTOs: OnboardingRecordSectionDTO[] = sections.map(s => ({
      id: s.id, recordId: s.record_id, name: s.name, description: s.description, sortOrder: s.sort_order,
      assignees: (assigneesBySection.get(s.id) ?? []).map(a => this.toAssigneeDTO(a)),
      tasks: (tasksBySection.get(s.id) ?? []).map(t => this.toTaskDTO(t)),
    }));
    return {
      ...this.toDTO(row),
      tasks: unsectionedTasks.map(t => this.toTaskDTO(t)),
      sections: sectionDTOs,
    };
  }

  async getByEmployee(employeeId: string): Promise<OnboardingResponseDTO> {
    const row = await this.repo.findByEmployeeId(employeeId);
    if (!row) throw new NotFoundError("Onboarding record for employee", employeeId);
    return this.toDTO(row);
  }

  /** Legacy create — still usable but sections optional. Kept for backward-compat. */
  async createRecord(employeeId: string, ownerId: string, actor?: OnboardingActor): Promise<OnboardingResponseDTO> {
    await assertEmployeeRegion(actor, employeeId);
    const emp = await this.repo.getEmployeeStatus(employeeId);
    if (!emp) throw new NotFoundError("Employee", employeeId);
    if (["offboarded", "terminated"].includes(emp.employment_status)) {
      throw new UnprocessableError("Cannot onboard an offboarded or terminated employee");
    }
    const existing = await this.repo.findExistingByEmployee(employeeId);
    if (existing) {
      if (existing.status === "in_progress") throw new ConflictError("Employee already has an active onboarding record");
      throw new ConflictError("Onboarding cannot be restarted once completed");
    }
    const record = await this.repo.create(employeeId, ownerId);
    const empDetails = await this.repo.getEmployeeDetails(employeeId);
    return { ...this.toDTO({ ...record, ...empDetails }), tasks: [], sections: [] };
  }

  /** New flow: initiate onboarding with template + sections + assignees + tasks. */
  async initiateOnboarding(dto: InitiateOnboardingDTO, ownerId: string, actor?: OnboardingActor): Promise<OnboardingResponseDTO> {
    if (!dto.employeeId) throw new ValidationError("employeeId is required");
    if (!dto.sections?.length) throw new ValidationError("At least one section is required");
    await assertEmployeeRegion(actor, dto.employeeId);
    const emp = await this.repo.getEmployeeStatus(dto.employeeId);
    if (!emp) throw new NotFoundError("Employee", dto.employeeId);
    if (["offboarded", "terminated"].includes(emp.employment_status)) {
      throw new UnprocessableError("Cannot onboard an offboarded or terminated employee");
    }
    const existing = await this.repo.findExistingByEmployee(dto.employeeId);
    if (existing) {
      if (existing.status === "in_progress") throw new ConflictError("Employee already has an active onboarding record");
      throw new ConflictError("Onboarding cannot be restarted once completed");
    }
    const sections = await Promise.all(dto.sections.map(async (s, i) => {
      let assigneeIds = [...(s.assigneeIds ?? [])];
      if (s.templateSectionId) {
        const defaults = await this.templateRepo.getSectionAssigneeEmployeeIds(s.templateSectionId);
        assigneeIds = [...new Set([...defaults, ...assigneeIds])];
      }
      return {
        templateSectionId: s.templateSectionId ?? null,
        name: s.name,
        description: s.description ?? null,
        sortOrder: s.sortOrder ?? i,
        assigneeIds,
        tasks: s.tasks ?? [],
      };
    }));
    const record = await this.repo.initiateWithSections(
      dto.employeeId,
      ownerId,
      dto.templateId ?? null,
      dto.templateId ? (await this.templateRepo.findById(dto.templateId))?.name ?? null : null,
      sections,
    );
    (async () => {
      try {
        const empRec = await getEmployeeNotificationRecipient(dto.employeeId);
        const empRegion = await getEmployeeRegion(dto.employeeId);
        const hrs = await getEmailsByRoleForRegion("hr", empRegion);
        const empName = empRec?.name || "the new employee";
        const ctx = {
          employee_name: empName,
          department: emp.department || "—",
          employee_id: dto.employeeId,
          onboarding_record_id: record.id,
        };
        const allRecipients = dedupeRecipientsByEmail([...(empRec ? [empRec] : []), ...hrs]);
        if (allRecipients.length) await notifyEmail("onboarding.initiated", ctx, allRecipients);
      } catch {
        /* ignore */
      }
    })();
    (async () => {
      try {
        const assignees = await this.repo.getAllSectionAssignees(record.id);
        for (const a of assignees) {
          await this.sendSectionAssignedEmail(record.id, a.section_id, a.employee_id, ownerId);
        }
      } catch {
        /* ignore */
      }
    })();
    return this.getRecord(record.id);
  }

  async updateRecord(id: string, status: string, completedAt?: string | null): Promise<OnboardingResponseDTO> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError("Onboarding record", id);
    if (status === "completed") {
      this.assertRequiredTasksComplete(await this.repo.getTasks(id));
    }
    const updated = await this.repo.update(id, status, completedAt ?? null);
    // Email: onboarding completed notification
    if (status === "completed" && existing.status !== "completed") {
      (async () => {
        try {
          const eid = existing.employee_id;
          if (!eid) return;
          const empRec = await getEmployeeNotificationRecipient(eid);
          const empRegion = await getEmployeeRegion(eid);
          const hrs = await getEmailsByRoleForRegion("hr", empRegion);
          const empName = empRec?.name || "Employee";
          const ctx = {
            employee_name: empName,
            department: (existing as { department?: string | null }).department || "—",
            employee_id: eid,
            onboarding_record_id: existing.id,
          };
          const all = dedupeRecipientsByEmail([...(empRec ? [empRec] : []), ...hrs]);
          if (all.length) await notifyEmail("onboarding.completed", ctx, all);
          await this.employeeSvc.sendWelcomeInvitation(eid).catch(() => {});
        } catch {
          /* ignore */
        }
      })();
    }
    return this.toDTO(updated);
  }

  async deleteRecord(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError("Onboarding record", id);
    await this.repo.delete(id);
  }

  /** Reopen a completed onboarding checklist to add late items (template snapshot preserved on record). */
  async reopenChecklist(id: string): Promise<OnboardingResponseDTO> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError("Onboarding record", id);
    if (existing.status !== "completed") {
      throw new UnprocessableError("Only completed onboarding can be updated this way");
    }
    await this.repo.reopenChecklist(id);
    return this.getRecord(id);
  }

  async addTask(recordId: string, taskName: string, sectionId?: string | null, requiresAssignment = false): Promise<OnboardingTaskDTO> {
    if (!taskName?.trim()) throw new ValidationError("taskName is required");
    const record = await this.repo.findById(recordId);
    if (!record) throw new NotFoundError("Onboarding record", recordId);
    if (record.status === "completed") {
      await this.repo.reopenChecklist(recordId);
    }
    const task = await this.repo.addTask(recordId, taskName.trim(), sectionId, requiresAssignment);
    return this.toTaskDTO(task);
  }

  async updateTask(recordId: string, taskId: string, completed?: boolean, assignmentDetails?: string, actor?: OnboardingActor): Promise<OnboardingTaskDTO> {
    const existing = await this.repo.getTaskById(taskId, recordId);
    if (!existing) throw new NotFoundError("Task", taskId);
    if (!isAdminOrHR(actor) && actor?.employeeId) {
      const allowed = await this.repo.isAssigneeOfTaskSection(recordId, taskId, actor.employeeId);
      if (!allowed) throw new ForbiddenError("You are not an assignee for this task's section");
    }
    const newDetails = assignmentDetails !== undefined ? assignmentDetails : existing.assignment_details;
    const requiresAssignment = existing.requires_assignment === true || (existing.requires_assignment as unknown) === "true";
    let newCompleted: boolean = existing.completed === true || existing.completed === "true";
    if (completed !== undefined) {
      // Only block completion when the task is a special system task (email/laptop) that needs details
      const taskNameSafe = this.safeTaskName(existing.task_name ?? "");
      const isSpecialTask =
        isWorkEmailTask(taskNameSafe) || isLaptopTask(taskNameSafe) || isPseudonymTask(taskNameSafe);
      if (completed === true && requiresAssignment && isSpecialTask && !newDetails?.trim()) {
        throw new ValidationError("Save assignment details before marking task complete");
      }
      newCompleted = completed;
    }
    const updated = await this.repo.updateTask(taskId, recordId, newCompleted, newDetails ?? null);
    const record = await this.repo.findById(recordId);
    const employeeId = record?.employee_id;
    const detailsStr = (newDetails ?? "").trim();
    if (newCompleted && employeeId && detailsStr) {
      const taskName = this.safeTaskName(existing.task_name ?? "");
      if (isWorkEmailTask(taskName) && EMAIL_REGEX.test(detailsStr)) {
        const newEmail = detailsStr.trim().toLowerCase();
        const oldEmail = await this.repo.getEmployeeWorkEmail(employeeId);
        await this.repo.setEmployeeWorkEmail(employeeId, newEmail);
        await this.authRepo.syncUserEmailForEmployee(employeeId, newEmail, oldEmail);
      }
      if (isLaptopTask(taskName)) {
        const match = detailsStr.match(/\(([^)]+)\)\s*$/);
        const stockItemId = match?.[1]?.trim();
        if (stockItemId) {
          try {
            const already = await this.assetService.hasStockAssignment(employeeId, stockItemId);
            if (!already) {
              await this.assetService.assignFromStock({ stockItemId, employeeId }, undefined, undefined);
            }
          } catch (err) {
            console.error("[onboarding] laptop assignFromStock failed:", err);
          }
        }
      }
      if (isPseudonymTask(taskName)) {
        const nick = detailsStr.slice(0, 500);
        await this.repo.setEmployeeNickname(employeeId, nick);
        if (actor?.id) await recordEmployeeProfileChange(employeeId, actor.id, ["nickname"]);
        memCache.invalidate("employees:");
      }
    }
    return this.toTaskDTO(updated);
  }

  async deleteTask(recordId: string, taskId: string): Promise<void> {
    const existing = await this.repo.getTaskById(taskId, recordId);
    if (!existing) throw new NotFoundError("Task", taskId);
    await this.repo.deleteTask(taskId, recordId);
  }

  async addSectionAssignee(recordId: string, sectionId: string, employeeId: string, assignedBy?: string | null): Promise<void> {
    const sections = await this.repo.getSections(recordId);
    if (!sections.find(s => s.id === sectionId)) throw new NotFoundError("Section", sectionId);
    const added = await this.repo.addSectionAssignee(sectionId, employeeId);
    if (added) {
      (async () => {
        try {
          await this.sendSectionAssignedEmail(recordId, sectionId, employeeId, assignedBy ?? null);
        } catch {
          /* ignore */
        }
      })();
    }
  }

  /** Email assignee when they are added to an onboarding section (tasks in that section). */
  private async sendSectionAssignedEmail(
    recordId: string,
    sectionId: string,
    assigneeEmployeeId: string,
    assignedBy: string | null,
  ): Promise<void> {
    const row = await this.repo.getSectionAssignmentEmailContext(recordId, sectionId);
    if (!row || String(row.record_status) !== "in_progress") return;

    const assignee = await getEmployeeNotificationRecipient(assigneeEmployeeId);
    if (!assignee) return;

    const taskRows = await this.repo.getSectionTaskNames(sectionId);
    const taskNames = taskRows.map((t) => this.safeTaskName(t.task_name)).filter((n) => n.trim().length > 0);
    const tasksList = taskNames.length > 0 ? taskNames.map((n) => `• ${n}`).join("\n") : "—";
    const sectionName = (row.section_name && String(row.section_name).trim()) || "Onboarding section";
    const employeeName = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "Employee";
    const doerName = await resolveActorDisplayForEmail(assignedBy);

    await notifyEmail(
      "onboarding.task_assigned",
      {
        employee_name: employeeName,
        employee_id: row.employee_id,
        onboarding_record_id: row.onboarding_record_id,
        section_name: sectionName,
        task_name: taskNames[0] ?? sectionName,
        tasks_list: tasksList,
        emp_id: row.emp_code ? String(row.emp_code) : "—",
        department: row.department ? String(row.department) : "—",
        assigned_by: doerName,
      },
      [assignee],
    );
  }

  async removeSectionAssignee(recordId: string, sectionId: string, employeeId: string): Promise<void> {
    const sections = await this.repo.getSections(recordId);
    if (!sections.find(s => s.id === sectionId)) throw new NotFoundError("Section", sectionId);
    await this.repo.removeSectionAssignee(sectionId, employeeId);
  }

  private assertRequiredTasksComplete(tasks: OnboardingTaskRow[]): void {
    for (const t of tasks) {
      const required = t.requires_assignment === true || (t.requires_assignment as unknown) === "true";
      if (!required) continue;
      const done = t.completed === true || t.completed === "true";
      const taskName = this.safeTaskName(t.task_name ?? "");
      const needsDetails =
        isWorkEmailTask(taskName) || isLaptopTask(taskName) || isPseudonymTask(taskName);
      if (!done) {
        throw new UnprocessableError(`Complete required item "${taskName}" before finishing onboarding`);
      }
      if (needsDetails && !(t.assignment_details ?? "").trim()) {
        throw new UnprocessableError(`Save assignment details for "${taskName}" before finishing onboarding`);
      }
    }
  }

  private toDTO(r: OnboardingRow): OnboardingResponseDTO {
    return {
      id: r.id, employeeId: r.employee_id, ownerId: r.owner_id, status: r.status,
      templateId: r.template_id ?? null,
      templateName: r.template_name ?? null,
      checklistReopenedAt: r.checklist_reopened_at
        ? (r.checklist_reopened_at instanceof Date ? r.checklist_reopened_at.toISOString() : String(r.checklist_reopened_at))
        : null,
      completedAt: r.completed_at ? (r.completed_at instanceof Date ? r.completed_at.toISOString() : String(r.completed_at)) : null,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
      firstName: r.first_name ?? "", lastName: r.last_name ?? "",
      workEmail: r.work_email ?? "", jobTitle: r.job_title ?? null,
      department: r.department ?? null, joinDate: r.join_date ?? null,
      hireName: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(),
      hireRole: r.job_title ?? null, hireDepartment: r.department ?? null,
      hireEmail: r.work_email ?? "", startDate: r.join_date ?? null,
      taskCount: r.task_count ?? 0, completedCount: r.completed_count ?? 0,
    };
  }

  private safeTaskName(raw: string): string {
    if (!raw || !raw.trim().startsWith("{")) return raw ?? "";
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.taskName === "string") return parsed.taskName;
    } catch { /* not valid JSON, keep raw */ }
    return raw;
  }

  private toTaskDTO(t: OnboardingTaskRow): OnboardingTaskDTO {
    return {
      id: t.id, onboardingRecordId: t.onboarding_record_id,
      taskName: this.safeTaskName(t.task_name), category: t.category,
      sectionId: t.section_id ?? null,
      completed: t.completed === true || t.completed === "true",
      assignmentDetails: t.assignment_details, sortOrder: t.sort_order,
      requiresAssignment: t.requires_assignment === true || (t.requires_assignment as unknown) === "true",
      completedAt: t.completed_at ? (t.completed_at instanceof Date ? t.completed_at.toISOString() : String(t.completed_at)) : null,
      createdAt: t.created_at instanceof Date ? t.created_at.toISOString() : String(t.created_at),
      updatedAt: t.updated_at instanceof Date ? t.updated_at.toISOString() : String(t.updated_at),
    };
  }

  private toAssigneeDTO(a: OnboardingSectionAssigneeRow): OnboardingSectionAssigneeDTO {
    return {
      id: a.id, sectionId: a.section_id, employeeId: a.employee_id,
      firstName: a.first_name ?? "", lastName: a.last_name ?? "",
      avatar: a.avatar ?? null,
    };
  }
}
