/**
 * DepartmentService — all business logic for the departments module.
 *
 * Rules:
 *  • Orchestrate one or more repositories; never issue SQL directly.
 *  • Throw AppError subclasses (NotFoundError, ConflictError, …) — the global error
 *    handler converts them to HTTP responses so the service stays HTTP-free.
 *  • No req / res / next anywhere in this file.
 *  • Methods are independently testable.
 */

import { DepartmentRepository } from "./DepartmentRepository.js";
import type { DepartmentRow } from "./DepartmentRepository.js";
import { OrgStructureRepository } from "./OrgStructureRepository.js";
import type { DepartmentResponseDTO } from "./Department.dto.js";
import type { CreateDepartmentInput, UpdateDepartmentInput } from "./Department.validators.js";
import type { PaginatedResult, PaginationParams } from "../../core/types/index.js";
import { buildPaginationMeta } from "../../core/utils/pagination.js";
import {
  NotFoundError,
  ConflictError,
  UnprocessableError,
  ForbiddenError,
} from "../../core/types/index.js";
import { hasAnyRole, type SystemRole } from "../../lib/rbac.js";
import {
  isFreshTeamConfigured,
  listBranches as listFtBranches,
  listBusinessUnits as listFtBusinessUnits,
  listLevels as listFtLevels,
  listShifts as listFtShifts,
  listJobCategories as listFtJobCategories,
  listEmployees as listFtEmployees,
  freshteamWorkEmailMatchKeys,
  getFreshTeamDelayMs,
  sleep,
} from "../../lib/freshteamApi.js";
import { EmployeeRepository } from "../employees/EmployeeRepository.js";

export class DepartmentService {
  private readonly repo: DepartmentRepository;
  private readonly orgRepo: OrgStructureRepository;
  private readonly employeeRepo: EmployeeRepository;

  constructor() {
    this.repo = new DepartmentRepository();
    this.orgRepo = new OrgStructureRepository();
    this.employeeRepo = new EmployeeRepository();
  }

  // ─── List ──────────────────────────────────────────────────────────────────

  async listDepartments(
    params: PaginationParams,
    includeInactive = false,
  ): Promise<PaginatedResult<DepartmentResponseDTO>> {
    const { rows, total } = await this.repo.findAll(params, includeInactive);
    return {
      data: rows.map(this.toDTO),
      meta: buildPaginationMeta(total, params),
    };
  }

  // ─── Get single ────────────────────────────────────────────────────────────

  async getDepartment(id: string): Promise<DepartmentResponseDTO> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundError("Department", id);
    return this.toDTO(row);
  }

  // ─── Create ────────────────────────────────────────────────────────────────

  async createDepartment(data: CreateDepartmentInput): Promise<DepartmentResponseDTO> {
    // Business rule: department names must be unique (case-insensitive)
    const existing = await this.repo.findByName(data.name);
    if (existing) {
      throw new ConflictError(`A department named '${data.name}' already exists`);
    }

    const row = await this.repo.create(data);
    return this.toDTO(row);
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async updateDepartment(
    id: string,
    data: UpdateDepartmentInput,
  ): Promise<DepartmentResponseDTO> {
    // Check the target record exists
    const target = await this.repo.findById(id);
    if (!target) throw new NotFoundError("Department", id);

    // If renaming, ensure no duplicate
    if (data.name && data.name.toLowerCase() !== target.name.toLowerCase()) {
      const duplicate = await this.repo.findByName(data.name);
      if (duplicate) {
        throw new ConflictError(`A department named '${data.name}' already exists`);
      }
    }

    const updated = await this.repo.update(id, data);
    if (!updated) throw new NotFoundError("Department", id);
    if (data.name && data.name !== target.name) {
      await this.repo.updateEmployeeDepartmentName(target.name, updated.name);
    }
    return this.toDTO(updated);
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  /** List business units. includeInactive: include soft-deleted (for org structure page). */
  async listBusinessUnits(includeInactive = false): Promise<{ id: string; name: string; isActive: boolean }[]> {
    return this.orgRepo.listBusinessUnits(includeInactive);
  }

  /** List levels / grades. */
  async listLevels(includeInactive = false): Promise<{ id: string; name: string; isActive: boolean }[]> {
    return this.orgRepo.listLevels(includeInactive);
  }

  /** List branches / locations with timezone + date format preferences. */
  async listBranches(includeInactive = false): Promise<{ id: string; name: string; isActive: boolean; timeZone: string | null; dateFormat: string | null; regionCode: string | null }[]> {
    return this.orgRepo.listBranches(includeInactive);
  }

  /** List work shifts. */
  async listWorkShifts(includeInactive = false): Promise<{ id: string; name: string; isActive: boolean }[]> {
    return this.orgRepo.listWorkShifts(includeInactive);
  }

  /** List job categories. */
  async listJobCategories(includeInactive = false): Promise<{ id: string; name: string; isActive: boolean }[]> {
    return this.orgRepo.listJobCategories(includeInactive);
  }

  /** List teams (org structure; for primary_team dropdown + team manager). */
  async listTeams(
    includeInactive = false,
  ): Promise<
    { id: string; name: string; isActive: boolean; managerId: string | null; managerName: string | null }[]
  > {
    return this.orgRepo.listTeams(includeInactive);
  }

  async updateTeamWithManager(
    id: string,
    name: string,
    managerId: string | null | undefined,
  ): Promise<{
    id: string;
    name: string;
    isActive: boolean;
    managerId: string | null;
    managerName: string | null;
  } | null> {
    return this.orgRepo.updateTeamWithManager(id, name, managerId);
  }

  /** Org teams where this employee is the assigned manager (team lead). */
  async listTeamsManagedByEmployee(employeeId: string): Promise<
    { id: string; name: string; isActive: boolean; managerId: string | null; managerName: string | null }[]
  > {
    return this.orgRepo.listTeamsManagedByEmployee(employeeId);
  }

  /**
   * Update org team: Admin/HR may change name and manager assignment.
   * Team lead (employees.manager_id on team row) may change name only.
   */
  async updateTeamWithAuth(
    id: string,
    name: string,
    managerId: string | null | undefined,
    user: {
      id: string;
      email: string;
      role: SystemRole;
      roles?: string[];
      employeeId: string | null;
    },
  ): Promise<{
    id: string;
    name: string;
    isActive: boolean;
    managerId: string | null;
    managerName: string | null;
  }> {
    const team = await this.orgRepo.getTeamById(id);
    if (!team) throw new NotFoundError("Team", id);

    const userRow = {
      id: user.id,
      email: user.email,
      role: user.role,
      roles: user.roles ?? [],
    };
    const isAdminHr = hasAnyRole(userRow, ["admin", "hr"]);
    const isTeamLead = Boolean(user.employeeId && team.managerId === user.employeeId);

    if (!isAdminHr && !isTeamLead) {
      throw new ForbiddenError("You do not have permission to edit this team.");
    }
    if (isTeamLead && !isAdminHr) {
      if (managerId !== undefined) {
        throw new ForbiddenError("Only HR or Admin can change the team manager assignment.");
      }
      const row = await this.orgRepo.updateTeamWithManager(id, name, undefined);
      if (!row) throw new NotFoundError("Team", id);
      return row;
    }
    const row = await this.orgRepo.updateTeamWithManager(id, name, managerId);
    if (!row) throw new NotFoundError("Team", id);
    return row;
  }

  async listMyTeams(payload: {
    employeeId: string | null;
    allOrg: boolean;
    isAdminOrHr: boolean;
  }): Promise<{
    scope: "org" | "mine" | "none";
    message?: string;
    /** Mine: your employee profile department */
    yourDepartmentName: string | null;
    reportingManagerId: string | null;
    reportingManagerName: string | null;
    teammates: Array<{
      id: string;
      employeeId: string;
      firstName: string;
      lastName: string;
      jobTitle: string | null;
      department: string | null;
      avatar: string | null;
      isYou: boolean;
    }>;
    /** Org (admin): all departments with active headcount */
    departments: Array<{ name: string; headcount: number }>;
  }> {
    const emptyTeammates: never[] = [];
    const emptyDepts: never[] = [];
    if (payload.allOrg && payload.isAdminOrHr) {
      const departments = await this.orgRepo.listDepartmentsWithHeadcount();
      return {
        scope: "org",
        yourDepartmentName: null,
        reportingManagerId: null,
        reportingManagerName: null,
        teammates: emptyTeammates,
        departments,
      };
    }
    if (!payload.employeeId) {
      return {
        scope: "none",
        message:
          "Your user is not linked to an employee profile. Ask HR to link your account to see your department and colleagues.",
        yourDepartmentName: null,
        reportingManagerId: null,
        reportingManagerName: null,
        teammates: emptyTeammates,
        departments: emptyDepts,
      };
    }
    const ctx = await this.orgRepo.getEmployeeDepartmentContext(payload.employeeId);
    const teammates = await this.orgRepo.listTeammatesByDepartment(payload.employeeId);
    return {
      scope: "mine",
      yourDepartmentName: ctx.departmentName,
      reportingManagerId: ctx.reportingManagerId,
      reportingManagerName: ctx.reportingManagerName,
      teammates,
      departments: emptyDepts,
    };
  }

  /** List roles. */
  async listRoles(includeInactive = false): Promise<{ id: string; name: string; isActive: boolean }[]> {
    return this.orgRepo.listRoles(includeInactive);
  }

  /** List sub-departments. */
  async listSubDepartments(includeInactive = false): Promise<{ id: string; name: string; isActive: boolean }[]> {
    return this.orgRepo.listSubDepartments(includeInactive);
  }

  // ─── Org structure CRUD (sub-departments, business-units, teams, levels, branches, work-shifts, roles, job-categories) ───

  async createSubDepartment(name: string) { return this.orgRepo.createSubDepartment(name.trim()); }
  async updateSubDepartment(id: string, name: string) { return this.orgRepo.updateSubDepartment(id, name.trim()); }
  async deleteSubDepartment(id: string) { const ok = await this.orgRepo.softDeleteSubDepartment(id); if (!ok) throw new NotFoundError("Sub-department", id); }
  async restoreSubDepartment(id: string) { const ok = await this.orgRepo.restoreSubDepartment(id); if (!ok) throw new NotFoundError("Sub-department", id); }

  async createBusinessUnit(name: string) { return this.orgRepo.createBusinessUnit(name.trim()); }
  async updateBusinessUnit(id: string, name: string) { return this.orgRepo.updateBusinessUnit(id, name.trim()); }
  async deleteBusinessUnit(id: string) { const ok = await this.orgRepo.softDeleteBusinessUnit(id); if (!ok) throw new NotFoundError("Business unit", id); }
  async restoreBusinessUnit(id: string) { const ok = await this.orgRepo.restoreBusinessUnit(id); if (!ok) throw new NotFoundError("Business unit", id); }

  async createTeam(name: string) { return this.orgRepo.createTeam(name.trim()); }
  async updateTeam(id: string, name: string) { return this.orgRepo.updateTeam(id, name.trim()); }
  async deleteTeam(id: string) { const ok = await this.orgRepo.softDeleteTeam(id); if (!ok) throw new NotFoundError("Team", id); }
  async restoreTeam(id: string) { const ok = await this.orgRepo.restoreTeam(id); if (!ok) throw new NotFoundError("Team", id); }

  async createLevel(name: string) { return this.orgRepo.createLevel(name.trim()); }
  async updateLevel(id: string, name: string) { return this.orgRepo.updateLevel(id, name.trim()); }
  async deleteLevel(id: string) { const ok = await this.orgRepo.softDeleteLevel(id); if (!ok) throw new NotFoundError("Level", id); }
  async restoreLevel(id: string) { const ok = await this.orgRepo.restoreLevel(id); if (!ok) throw new NotFoundError("Level", id); }

  async createBranch(input: { name: string; timeZone?: string | null; dateFormat?: string | null }) {
    return this.orgRepo.createBranch(input.name.trim(), input.timeZone, input.dateFormat);
  }
  /** `timeZone` / `dateFormat` may be omitted (`undefined`) to keep existing DB values. */
  async updateBranch(id: string, input: { name: string; timeZone?: string | null | undefined; dateFormat?: string | null | undefined }) {
    return this.orgRepo.updateBranch(id, input.name.trim(), input.timeZone, input.dateFormat);
  }
  async deleteBranch(id: string) { const ok = await this.orgRepo.softDeleteBranch(id); if (!ok) throw new NotFoundError("Branch", id); }
  async restoreBranch(id: string) { const ok = await this.orgRepo.restoreBranch(id); if (!ok) throw new NotFoundError("Branch", id); }

  async createWorkShift(name: string) { return this.orgRepo.createWorkShift(name.trim()); }
  async updateWorkShift(id: string, name: string) { return this.orgRepo.updateWorkShift(id, name.trim()); }
  async deleteWorkShift(id: string) { const ok = await this.orgRepo.softDeleteWorkShift(id); if (!ok) throw new NotFoundError("Work shift", id); }
  async restoreWorkShift(id: string) { const ok = await this.orgRepo.restoreWorkShift(id); if (!ok) throw new NotFoundError("Work shift", id); }

  async createRole(name: string) { return this.orgRepo.createRole(name.trim()); }
  async updateRole(id: string, name: string) { return this.orgRepo.updateRole(id, name.trim()); }
  async deleteRole(id: string) { const ok = await this.orgRepo.softDeleteRole(id); if (!ok) throw new NotFoundError("Role", id); }
  async restoreRole(id: string) { const ok = await this.orgRepo.restoreRole(id); if (!ok) throw new NotFoundError("Role", id); }

  async createJobCategory(name: string) { return this.orgRepo.createJobCategory(name.trim()); }
  async updateJobCategory(id: string, name: string) { return this.orgRepo.updateJobCategory(id, name.trim()); }
  async deleteJobCategory(id: string) { const ok = await this.orgRepo.softDeleteJobCategory(id); if (!ok) throw new NotFoundError("Job category", id); }
  async restoreJobCategory(id: string) { const ok = await this.orgRepo.restoreJobCategory(id); if (!ok) throw new NotFoundError("Job category", id); }

  async deleteDepartment(id: string): Promise<void> {
    const target = await this.repo.findById(id);
    if (!target) throw new NotFoundError("Department", id);

    // Business rule: cannot delete a department that still has active employees
    if ((target.employee_count ?? 0) > 0) {
      throw new UnprocessableError(
        `Cannot delete '${target.name}' — it has ${target.employee_count} active employee(s). ` +
          "Reassign or terminate them first.",
      );
    }

    await this.repo.softDelete(id);
  }

  async restoreDepartment(id: string): Promise<DepartmentResponseDTO> {
    const target = await this.repo.findById(id);
    if (!target) throw new NotFoundError("Department", id);
    const ok = await this.repo.restore(id);
    if (!ok) throw new NotFoundError("Department", id);
    const updated = await this.repo.findById(id);
    return this.toDTO(updated!);
  }

  // ─── FreshTeam org-structure migration (business units + levels, link employees) ─

  /**
   * Sync branches (locations), business_units, levels, work_shifts, and job_categories from FreshTeam, then link active employees.
   * - Upserts all by freshteam_id; skips deleted.
   * - Only employees that **our system** considers active are updated. We set
   *   location, business_unit, grade, shift, and job_category from FreshTeam (our DB is source of truth for who is active).
   * - Work email is matched with freshteamWorkEmailMatchKeys() so FT vs our domain typos (e.g. ldplogistic vs ldplogistics) still link.
   * Requires FRESHTEAM_DOMAIN and FRESHTEAM_API_KEY.
   */
  async migrateOrgStructureFromFreshteam(): Promise<{
    branches: { created: number; updated: number };
    businessUnits: { created: number; updated: number };
    levels: { created: number; updated: number };
    workShifts: { created: number; updated: number };
    jobCategories: { created: number; updated: number };
    employeesLinked: number;
    errors?: Array<{ source: string; id?: number; error: string }>;
  }> {
    if (!isFreshTeamConfigured()) {
      const err = new Error("FreshTeam is not configured (FRESHTEAM_DOMAIN / FRESHTEAM_API_KEY)");
      (err as { statusCode?: number }).statusCode = 503;
      throw err;
    }

    const delayMs = getFreshTeamDelayMs();
    const perPage = 50;
    const stats = {
      branches: { created: 0, updated: 0 },
      businessUnits: { created: 0, updated: 0 },
      levels: { created: 0, updated: 0 },
      workShifts: { created: 0, updated: 0 },
      jobCategories: { created: 0, updated: 0 },
      employeesLinked: 0,
    };
    const errors: Array<{ source: string; id?: number; error: string }> = [];

    const run = async <T extends { id: number; name?: string; deleted?: boolean }>(
      source: "branches" | "businessUnits" | "levels" | "workShifts" | "jobCategories",
      listFn: (page: number, perPage: number) => Promise<T[]>,
      upsertFn: (ftId: string, name: string) => Promise<{ created: boolean }>,
    ) => {
      let page = 1;
      while (true) {
        const list = await listFn(page, perPage);
        await sleep(delayMs);
        if (list.length === 0) break;
        for (const item of list) {
          if (item.deleted) continue;
          const ftId = String(item.id);
          const name = (item.name ?? "").trim() || "Unnamed";
          try {
            const result = await upsertFn(ftId, name);
            if (result.created) stats[source].created++;
            else stats[source].updated++;
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            errors.push({ source, id: item.id, error: msg });
          }
        }
        if (list.length < perPage) break;
        page++;
      }
    };

    await run("branches", listFtBranches, (ftId, name) =>
      this.orgRepo.upsertBranch(ftId, name),
    );
    await run("businessUnits", listFtBusinessUnits, (ftId, name) =>
      this.orgRepo.upsertBusinessUnit(ftId, name),
    );
    await run("levels", listFtLevels, (ftId, name) =>
      this.orgRepo.upsertLevel(ftId, name),
    );
    try {
      await run("workShifts", listFtShifts, (ftId, name) =>
        this.orgRepo.upsertWorkShift(ftId, name),
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ source: "workShifts", error: msg });
    }
    try {
      await run("jobCategories", listFtJobCategories, (ftId, name) =>
        this.orgRepo.upsertJobCategory(ftId, name),
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ source: "jobCategories", error: msg });
    }

    // Build FT email -> org fields (branch, BU, level, shift, job_category) for linking our active employees
    type FtOrgRow = {
      branch_id: number | null;
      business_unit_id: number | null;
      level_id: number | null;
      level_name?: string | null;
      team_id: number | null;
      team_name?: string | null;
      role_name: string | null;
      shift_id: number | null;
      shift_name?: string | null;
      job_category_id: number | null;
      job_category_name?: string | null;
    };
    const ftEmailToOrg = new Map<string, FtOrgRow>();
    let ftPage = 1;
    while (true) {
      const ftEmployees = await listFtEmployees(ftPage, perPage);
      await sleep(delayMs);
      if (ftEmployees.length === 0) break;
      for (const emp of ftEmployees) {
        const terminated = (emp as { terminated?: boolean }).terminated === true;
        if (terminated) continue;
        const raw = emp as { official_email?: string; work_email?: string; email?: string };
        const emails = [
          raw.official_email ?? "",
          raw.work_email ?? "",
          raw.email ?? "",
        ].map((e) => e.trim().toLowerCase()).filter(Boolean);
        if (emails.length === 0) continue;
        const branchId = (emp as { branch_id?: number | null }).branch_id ?? null;
        const buId = (emp as { business_unit_id?: number | null }).business_unit_id ?? null;
        const e = emp as {
          level_id?: number | null;
          level?: { id?: number; name?: string } | null;
          team_id?: number | null;
          team?: { id?: number; name?: string } | null;
          roles?: Array<{ id?: number; name?: string }> | null;
          shift_id?: number | null;
          shift?: { id?: number; name?: string } | null;
          job_category_id?: number | null;
          job_category?: { id?: number; name?: string } | null;
        };
        const levelId = e.level_id ?? e.level?.id ?? null;
        const levelNameFromFt = e.level?.name?.trim() || null;
        const teamId = e.team_id ?? e.team?.id ?? null;
        const teamNameFromFt = e.team?.name?.trim() || null;
        const firstRole = e.roles?.[0];
        const roleNameFromFt = firstRole?.name?.trim() || null;
        const shiftId = e.shift_id ?? e.shift?.id ?? null;
        const shiftNameFromFt = e.shift?.name?.trim() || null;
        const jobCatId = e.job_category_id ?? e.job_category?.id ?? null;
        const jobCatNameFromFt = e.job_category?.name?.trim() || null;
        const org: FtOrgRow = {
          branch_id: branchId,
          business_unit_id: buId,
          level_id: levelId,
          level_name: levelNameFromFt,
          team_id: teamId,
          team_name: teamNameFromFt,
          role_name: roleNameFromFt,
          shift_id: shiftId,
          shift_name: shiftNameFromFt,
          job_category_id: jobCatId,
          job_category_name: jobCatNameFromFt,
        };
        for (const email of emails) {
          for (const k of freshteamWorkEmailMatchKeys(email)) ftEmailToOrg.set(k, org);
        }
      }
      if (ftEmployees.length < perPage) break;
      ftPage++;
    }

    // Only our system's active employees are updated (our DB is source of truth for active vs terminated)
    const ourActive = await this.employeeRepo.listActiveIdAndEmail();
    for (const our of ourActive) {
      const primary = our.work_email.trim().toLowerCase();
      let ftOrg: FtOrgRow | undefined;
      for (const k of freshteamWorkEmailMatchKeys(primary)) {
        const hit = ftEmailToOrg.get(k);
        if (hit) {
          ftOrg = hit;
          break;
        }
      }
      if (ftOrg == null) continue;
      let locationName: string | null = null;
      let buName: string | null = null;
      let levelName: string | null = null;
      let teamName: string | null = null;
      let roleName: string | null = null;
      let shiftName: string | null = null;
      let jobCategoryName: string | null = null;
      try {
        if (ftOrg.branch_id != null) {
          locationName = await this.orgRepo.getBranchNameByFreshteamId(String(ftOrg.branch_id));
        }
        if (ftOrg.business_unit_id != null) {
          buName = await this.orgRepo.getBusinessUnitNameByFreshteamId(String(ftOrg.business_unit_id));
        }
        if (ftOrg.level_id != null) {
          levelName = await this.orgRepo.getLevelNameByFreshteamId(String(ftOrg.level_id));
        }
        if (levelName == null && ftOrg.level_name) levelName = ftOrg.level_name;
        if (ftOrg.team_id != null) {
          teamName = await this.orgRepo.getTeamNameByFreshteamId(String(ftOrg.team_id));
        }
        if (teamName == null && ftOrg.team_name) teamName = ftOrg.team_name;
        if (ftOrg.role_name) roleName = ftOrg.role_name;
        if (ftOrg.shift_id != null) {
          shiftName = await this.orgRepo.getWorkShiftNameByFreshteamId(String(ftOrg.shift_id));
        }
        if (shiftName == null && ftOrg.shift_name) shiftName = ftOrg.shift_name;
        if (ftOrg.job_category_id != null) {
          jobCategoryName = await this.orgRepo.getJobCategoryNameByFreshteamId(String(ftOrg.job_category_id));
        }
        if (jobCategoryName == null && ftOrg.job_category_name) jobCategoryName = ftOrg.job_category_name;
        await this.employeeRepo.updateOrgFields(our.id, {
          location: locationName ?? null,
          business_unit: buName ?? null,
          grade: levelName ?? null,
          shift: shiftName ?? null,
          job_category: jobCategoryName ?? null,
          primary_team: teamName ?? null,
          role: roleName ?? null,
        });
        stats.employeesLinked++;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push({ source: "employees", error: `${our.work_email}: ${msg}` });
      }
    }

    return {
      ...stats,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /** Map a raw DB row to the public response DTO. */
  private toDTO(row: DepartmentRow): DepartmentResponseDTO {
    return {
      id: row.id,
      name: row.name,
      freshteamId: row.freshteam_id,
      isActive: row.is_active !== false,
      employeeCount: Number(row.employee_count ?? 0),
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
      updatedAt:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : String(row.updated_at),
    };
  }
}
