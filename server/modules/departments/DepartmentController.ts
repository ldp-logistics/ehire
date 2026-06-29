/**
 * DepartmentController — thin HTTP adapter between Express and DepartmentService.
 *
 * Rules:
 *  • Handle req / res / next only.
 *  • Validate incoming payloads using the module's Zod schemas.
 *  • Call a single service method per handler.
 *  • Return a standardized response via ApiResponse helpers.
 *  • Pass all errors to next(err) — the global error handler takes it from there.
 *  • No business logic, no SQL.
 */

import type { Request, Response, NextFunction } from "express";
import { DepartmentService } from "./DepartmentService.js";
import {
  CreateDepartmentSchema,
  UpdateDepartmentSchema,
} from "./Department.validators.js";
import { ApiResponse } from "../../core/utils/apiResponse.js";
import { parsePagination } from "../../core/utils/pagination.js";
import { hasAnyRole } from "../../lib/rbac.js";

export class DepartmentController {
  private readonly service: DepartmentService;

  constructor() {
    this.service = new DepartmentService();
    // Bind handlers so 'this' is correct when Express invokes them
    this.list    = this.list.bind(this);
    this.listSubDepartments = this.listSubDepartments.bind(this);
    this.listBusinessUnits = this.listBusinessUnits.bind(this);
    this.listLevels = this.listLevels.bind(this);
    this.listBranches = this.listBranches.bind(this);
    this.listTeams = this.listTeams.bind(this);
    this.listManagedTeams = this.listManagedTeams.bind(this);
    this.listMyTeams = this.listMyTeams.bind(this);
    this.listRoles = this.listRoles.bind(this);
    this.listWorkShifts = this.listWorkShifts.bind(this);
    this.listJobCategories = this.listJobCategories.bind(this);
    this.getById = this.getById.bind(this);
    this.createSubDepartment = this.createSubDepartment.bind(this);
    this.updateSubDepartment = this.updateSubDepartment.bind(this);
    this.removeSubDepartment = this.removeSubDepartment.bind(this);
    this.restoreSubDepartment = this.restoreSubDepartment.bind(this);
    this.create  = this.create.bind(this);
    this.update  = this.update.bind(this);
    this.remove  = this.remove.bind(this);
    this.restore = this.restore.bind(this);
    this.migrateFromFreshteam = this.migrateFromFreshteam.bind(this);
  }

  /**
   * GET /api/departments?page=1&limit=20&search=eng&includeInactive=true
   * Returns a paginated list of departments. includeInactive=true returns deleted (inactive) ones too.
   */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const params = parsePagination(req.query as Record<string, unknown>);
      const includeInactive = String(req.query.includeInactive).toLowerCase() === "true";
      const result = await this.service.listDepartments(params, includeInactive);
      ApiResponse.paginated(res, result);
    } catch (err) {
      next(err);
    }
  }

  private includeInactive(req: Request): boolean {
    return String(req.query.includeInactive).toLowerCase() === "true";
  }

  async listSubDepartments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const list = await this.service.listSubDepartments(this.includeInactive(req));
      ApiResponse.ok(res, { subDepartments: list });
    } catch (err) {
      next(err);
    }
  }

  async listBusinessUnits(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const list = await this.service.listBusinessUnits(this.includeInactive(req));
      ApiResponse.ok(res, { businessUnits: list });
    } catch (err) {
      next(err);
    }
  }

  async listLevels(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const list = await this.service.listLevels(this.includeInactive(req));
      ApiResponse.ok(res, { levels: list });
    } catch (err) {
      next(err);
    }
  }

  async listBranches(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const list = await this.service.listBranches(this.includeInactive(req));
      ApiResponse.ok(res, { branches: list });
    } catch (err) {
      next(err);
    }
  }

  async listTeams(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const list = await this.service.listTeams(this.includeInactive(req));
      ApiResponse.ok(res, { teams: list });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/departments/teams/managed-by-me — org teams where current user is assigned team manager */
  listManagedTeams = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const eid = req.user!.employeeId;
      if (!eid) {
        ApiResponse.ok(res, { teams: [] });
        return;
      }
      const teams = await this.service.listTeamsManagedByEmployee(eid);
      ApiResponse.ok(res, { teams });
    } catch (err) {
      next(err);
    }
  };

  /** GET /api/departments/my-teams?allOrg=true (admin/hr only) */
  async listMyTeams(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const allOrg = String(req.query.allOrg).toLowerCase() === "true";
      const isAdminOrHr = hasAnyRole(
        { id: user.id, email: user.email, role: user.role, roles: user.roles, employee_id: user.employeeId },
        ["admin", "hr"],
      );
      if (allOrg && !isAdminOrHr) {
        ApiResponse.error(res, 403, "Admin or HR only for all-org view", "FORBIDDEN");
        return;
      }
      const data = await this.service.listMyTeams({
        employeeId: user.employeeId,
        allOrg: allOrg && isAdminOrHr,
        isAdminOrHr,
      });
      ApiResponse.ok(res, data);
    } catch (err) {
      next(err);
    }
  }

  async listRoles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const list = await this.service.listRoles(this.includeInactive(req));
      ApiResponse.ok(res, { roles: list });
    } catch (err) {
      next(err);
    }
  }

  async listWorkShifts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const list = await this.service.listWorkShifts(this.includeInactive(req));
      ApiResponse.ok(res, { shifts: list });
    } catch (err) {
      next(err);
    }
  }

  async listJobCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const list = await this.service.listJobCategories(this.includeInactive(req));
      ApiResponse.ok(res, { jobCategories: list });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/departments/:id
   * Returns a single department.
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dept = await this.service.getDepartment(req.params.id);
      ApiResponse.ok(res, dept);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/departments
   * Create a new department.
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = CreateDepartmentSchema.safeParse(req.body);
      if (!parsed.success) {
        const message = parsed.error.errors.map((e) => e.message).join("; ");
        ApiResponse.error(res, 400, message, "VALIDATION_ERROR");
        return;
      }
      const dept = await this.service.createDepartment(parsed.data);
      ApiResponse.created(res, dept, "Department created");
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /api/departments/:id
   * Partially update a department (all body fields optional).
   */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = UpdateDepartmentSchema.safeParse(req.body);
      if (!parsed.success) {
        const message = parsed.error.errors.map((e) => e.message).join("; ");
        ApiResponse.error(res, 400, message, "VALIDATION_ERROR");
        return;
      }
      const dept = await this.service.updateDepartment(req.params.id, parsed.data);
      ApiResponse.ok(res, dept, "Department updated");
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/departments/:id
   * Soft-delete a department (guarded: must have no active employees).
   */
  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.service.deleteDepartment(req.params.id);
      ApiResponse.noContent(res);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/departments/:id/restore
   * Restore a soft-deleted department.
   */
  async restore(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dept = await this.service.restoreDepartment(req.params.id);
      ApiResponse.ok(res, dept, "Department restored");
    } catch (err) {
      next(err);
    }
  }

  async createSubDepartment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const name = req.body?.name;
      if (!name || typeof name !== "string" || !name.trim()) {
        ApiResponse.error(res, 400, "name is required", "VALIDATION_ERROR");
        return;
      }
      const row = await this.service.createSubDepartment(name);
      ApiResponse.created(res, row);
    } catch (err) {
      next(err);
    }
  }
  async updateSubDepartment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const name = req.body?.name;
      if (!name || typeof name !== "string" || !name.trim()) {
        ApiResponse.error(res, 400, "name is required", "VALIDATION_ERROR");
        return;
      }
      const row = await this.service.updateSubDepartment(req.params.id, name);
      if (!row) {
        ApiResponse.error(res, 404, "Sub-department not found", "NOT_FOUND");
        return;
      }
      ApiResponse.ok(res, row);
    } catch (err) {
      next(err);
    }
  }
  async removeSubDepartment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.service.deleteSubDepartment(req.params.id);
      ApiResponse.noContent(res);
    } catch (err) {
      next(err);
    }
  }
  async restoreSubDepartment(req: Request, res: Response, next: NextFunction): Promise<void> {
    await this.handleOrgRestore(req, res, next, (id) => this.service.restoreSubDepartment(id));
  }

  private async handleOrgCreate(
    req: Request,
    res: Response,
    next: NextFunction,
    createFn: (name: string) => Promise<{ id: string; name: string; isActive: boolean }>,
  ): Promise<void> {
    try {
      const name = req.body?.name;
      if (!name || typeof name !== "string" || !name.trim()) {
        ApiResponse.error(res, 400, "name is required", "VALIDATION_ERROR");
        return;
      }
      const row = await createFn(name);
      ApiResponse.created(res, row);
    } catch (err) {
      next(err);
    }
  }
  private async handleOrgUpdate(
    req: Request,
    res: Response,
    next: NextFunction,
    updateFn: (id: string, name: string) => Promise<{ id: string; name: string; isActive: boolean } | null>,
  ): Promise<void> {
    try {
      const name = req.body?.name;
      if (!name || typeof name !== "string" || !name.trim()) {
        ApiResponse.error(res, 400, "name is required", "VALIDATION_ERROR");
        return;
      }
      const row = await updateFn(req.params.id, name);
      if (!row) {
        ApiResponse.error(res, 404, "Not found", "NOT_FOUND");
        return;
      }
      ApiResponse.ok(res, row);
    } catch (err) {
      next(err);
    }
  }
  private async handleOrgRemove(req: Request, res: Response, next: NextFunction, deleteFn: (id: string) => Promise<void>): Promise<void> {
    try {
      await deleteFn(req.params.id);
      ApiResponse.noContent(res);
    } catch (err) {
      next(err);
    }
  }
  private async handleOrgRestore(req: Request, res: Response, next: NextFunction, restoreFn: (id: string) => Promise<void>): Promise<void> {
    try {
      await restoreFn(req.params.id);
      ApiResponse.ok(res, { restored: true });
    } catch (err) {
      next(err);
    }
  }

  private normalizeBranchTimeZone(raw: unknown): string | null | undefined {
    if (raw == null || raw === "") return null;
    if (typeof raw !== "string") return undefined;
    const tz = raw.trim();
    if (!tz) return null;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return tz;
    } catch {
      return undefined;
    }
  }

  private normalizeBranchDateFormat(raw: unknown): string | null | undefined {
    if (raw == null || raw === "") return null;
    if (typeof raw !== "string") return undefined;
    const df = raw.trim();
    if (!df) return null;
    const allowed = new Set(["dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd"]);
    return allowed.has(df) ? df : undefined;
  }

  createBusinessUnit = (req: Request, res: Response, next: NextFunction) => this.handleOrgCreate(req, res, next, (n) => this.service.createBusinessUnit(n));
  updateBusinessUnit = (req: Request, res: Response, next: NextFunction) => this.handleOrgUpdate(req, res, next, (id, n) => this.service.updateBusinessUnit(id, n));
  removeBusinessUnit = (req: Request, res: Response, next: NextFunction) => this.handleOrgRemove(req, res, next, (id) => this.service.deleteBusinessUnit(id));
  restoreBusinessUnit = (req: Request, res: Response, next: NextFunction) => this.handleOrgRestore(req, res, next, (id) => this.service.restoreBusinessUnit(id));

  createTeam = (req: Request, res: Response, next: NextFunction) => this.handleOrgCreate(req, res, next, (n) => this.service.createTeam(n));
  updateTeam = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const name = req.body?.name;
      if (!name || typeof name !== "string" || !name.trim()) {
        ApiResponse.error(res, 400, "name is required", "VALIDATION_ERROR");
        return;
      }
      let managerId: string | null | undefined = undefined;
      if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "managerId")) {
        const v = req.body.managerId;
        if (v === null || v === "") managerId = null;
        else if (typeof v === "string" && v.trim()) managerId = v.trim();
        else if (v != null) {
          ApiResponse.error(res, 400, "managerId must be a non-empty string or null", "VALIDATION_ERROR");
          return;
        }
      }
      const u = req.user!;
      const row = await this.service.updateTeamWithAuth(req.params.id, name, managerId, {
        id: u.id,
        email: u.email,
        role: u.role,
        roles: u.roles,
        employeeId: u.employeeId,
      });
      ApiResponse.ok(res, row);
    } catch (err) {
      next(err);
    }
  };
  removeTeam = (req: Request, res: Response, next: NextFunction) => this.handleOrgRemove(req, res, next, (id) => this.service.deleteTeam(id));
  restoreTeam = (req: Request, res: Response, next: NextFunction) => this.handleOrgRestore(req, res, next, (id) => this.service.restoreTeam(id));

  createLevel = (req: Request, res: Response, next: NextFunction) => this.handleOrgCreate(req, res, next, (n) => this.service.createLevel(n));
  updateLevel = (req: Request, res: Response, next: NextFunction) => this.handleOrgUpdate(req, res, next, (id, n) => this.service.updateLevel(id, n));
  removeLevel = (req: Request, res: Response, next: NextFunction) => this.handleOrgRemove(req, res, next, (id) => this.service.deleteLevel(id));
  restoreLevel = (req: Request, res: Response, next: NextFunction) => this.handleOrgRestore(req, res, next, (id) => this.service.restoreLevel(id));

  createBranch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const name = req.body?.name;
      if (!name || typeof name !== "string" || !name.trim()) {
        ApiResponse.error(res, 400, "name is required", "VALIDATION_ERROR");
        return;
      }
      const body = req.body as Record<string, unknown> | null | undefined;
      const hasTz = body != null && ("timeZone" in body || "time_zone" in body);
      const hasDf = body != null && ("dateFormat" in body || "date_format" in body);
      const tzRaw = body?.timeZone ?? body?.time_zone;
      const dfRaw = body?.dateFormat ?? body?.date_format;
      const timeZone = hasTz ? this.normalizeBranchTimeZone(tzRaw) : undefined;
      const dateFormat = hasDf ? this.normalizeBranchDateFormat(dfRaw) : undefined;
      if (hasTz && timeZone === undefined) {
        ApiResponse.error(res, 400, "timeZone must be a valid IANA timezone (or empty)", "VALIDATION_ERROR");
        return;
      }
      if (hasDf && dateFormat === undefined) {
        ApiResponse.error(res, 400, "dateFormat must be one of dd/MM/yyyy, MM/dd/yyyy, yyyy-MM-dd", "VALIDATION_ERROR");
        return;
      }
      const row = await this.service.createBranch({ name, timeZone, dateFormat });
      ApiResponse.created(res, row);
    } catch (err) {
      next(err);
    }
  };
  updateBranch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const name = req.body?.name;
      if (!name || typeof name !== "string" || !name.trim()) {
        ApiResponse.error(res, 400, "name is required", "VALIDATION_ERROR");
        return;
      }
      const body = req.body as Record<string, unknown> | null | undefined;
      const hasTz = body != null && ("timeZone" in body || "time_zone" in body);
      const hasDf = body != null && ("dateFormat" in body || "date_format" in body);
      const tzRaw = body?.timeZone ?? body?.time_zone;
      const dfRaw = body?.dateFormat ?? body?.date_format;
      const timeZone = hasTz ? this.normalizeBranchTimeZone(tzRaw) : undefined;
      const dateFormat = hasDf ? this.normalizeBranchDateFormat(dfRaw) : undefined;
      if (hasTz && timeZone === undefined) {
        ApiResponse.error(res, 400, "timeZone must be a valid IANA timezone (or empty)", "VALIDATION_ERROR");
        return;
      }
      if (hasDf && dateFormat === undefined) {
        ApiResponse.error(res, 400, "dateFormat must be one of dd/MM/yyyy, MM/dd/yyyy, yyyy-MM-dd", "VALIDATION_ERROR");
        return;
      }
      const row = await this.service.updateBranch(req.params.id, { name, timeZone, dateFormat });
      if (!row) {
        ApiResponse.error(res, 404, "Not found", "NOT_FOUND");
        return;
      }
      ApiResponse.ok(res, row);
    } catch (err) {
      next(err);
    }
  };
  removeBranch = (req: Request, res: Response, next: NextFunction) => this.handleOrgRemove(req, res, next, (id) => this.service.deleteBranch(id));
  restoreBranch = (req: Request, res: Response, next: NextFunction) => this.handleOrgRestore(req, res, next, (id) => this.service.restoreBranch(id));

  createWorkShift = (req: Request, res: Response, next: NextFunction) => this.handleOrgCreate(req, res, next, (n) => this.service.createWorkShift(n));
  updateWorkShift = (req: Request, res: Response, next: NextFunction) => this.handleOrgUpdate(req, res, next, (id, n) => this.service.updateWorkShift(id, n));
  removeWorkShift = (req: Request, res: Response, next: NextFunction) => this.handleOrgRemove(req, res, next, (id) => this.service.deleteWorkShift(id));
  restoreWorkShift = (req: Request, res: Response, next: NextFunction) => this.handleOrgRestore(req, res, next, (id) => this.service.restoreWorkShift(id));

  createRole = (req: Request, res: Response, next: NextFunction) => this.handleOrgCreate(req, res, next, (n) => this.service.createRole(n));
  updateRole = (req: Request, res: Response, next: NextFunction) => this.handleOrgUpdate(req, res, next, (id, n) => this.service.updateRole(id, n));
  removeRole = (req: Request, res: Response, next: NextFunction) => this.handleOrgRemove(req, res, next, (id) => this.service.deleteRole(id));
  restoreRole = (req: Request, res: Response, next: NextFunction) => this.handleOrgRestore(req, res, next, (id) => this.service.restoreRole(id));

  createJobCategory = (req: Request, res: Response, next: NextFunction) => this.handleOrgCreate(req, res, next, (n) => this.service.createJobCategory(n));
  updateJobCategory = (req: Request, res: Response, next: NextFunction) => this.handleOrgUpdate(req, res, next, (id, n) => this.service.updateJobCategory(id, n));
  removeJobCategory = (req: Request, res: Response, next: NextFunction) => this.handleOrgRemove(req, res, next, (id) => this.service.deleteJobCategory(id));
  restoreJobCategory = (req: Request, res: Response, next: NextFunction) => this.handleOrgRestore(req, res, next, (id) => this.service.restoreJobCategory(id));

  /**
   * POST /api/departments/migrate-from-freshteam
   * Sync branches (locations), business_units, and levels from FreshTeam, then link active employees (set location, business_unit, grade, etc.).
   */
  async migrateFromFreshteam(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.service.migrateOrgStructureFromFreshteam();
      const status = result.errors?.length ? 207 : 200;
      res.status(status).json(result);
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 503) {
        res.status(503).json({
          error: (err as Error).message,
          code: "FRESHTEAM_NOT_CONFIGURED",
        });
        return;
      }
      next(err);
    }
  }
}
