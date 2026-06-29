import type { Request, Response, NextFunction } from "express";
import { RegionSettingsRepository } from "./RegionSettingsRepository.js";
import { ALL_REGION_CODES, REGION_LABELS, SUPER_REGION_CODE, isValidRegionCode } from "../../lib/regionAccess.js";
import { appendAuditLog, getClientAuditMeta } from "../../lib/auditAppend.js";

export class RegionSettingsController {
  private readonly repo = new RegionSettingsRepository();

  /** GET /api/settings/regions — full Multi-Region settings overview. */
  getOverview = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [branches, rollup, superAdmins, unassigned, employeesWithoutRegionCount] = await Promise.all([
        this.repo.listBranchesWithRegion(),
        this.repo.regionRollup(),
        this.repo.listSuperRegionAdmins(),
        this.repo.unassignedCounts(),
        this.repo.employeesWithoutRegionCount(),
      ]);

      const regions = ALL_REGION_CODES.map((code) => {
        const r = rollup[code];
        return {
          code,
          label: REGION_LABELS[code],
          isSuperRegion: code === SUPER_REGION_CODE,
          branchCount: r?.branch_count ?? 0,
          employeeCount: r?.employee_count ?? 0,
          userCount: r?.user_count ?? 0,
        };
      });

      res.json({
        superRegionCode: SUPER_REGION_CODE,
        regions,
        branches,
        superAdmins: superAdmins.map((a) => ({
          id: a.id,
          email: a.email,
          name: [a.firstName, a.lastName].filter(Boolean).join(" ").trim() || null,
        })),
        unassignedBranchCount: unassigned.unassignedBranches,
        usersWithoutBranchCount: unassigned.usersWithoutBranch,
        employeesWithoutRegionCount,
      });
    } catch (e) {
      next(e);
    }
  };

  /** GET /api/settings/regions/unassigned-employees — active employees with no resolved region. */
  listEmployeesWithoutRegion = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const employees = await this.repo.listEmployeesWithoutRegion();
      res.json({ employees });
    } catch (e) {
      next(e);
    }
  };

  /** PATCH /api/settings/regions/employees/:employeeId/branch — assign an employee to a branch (sets their region). */
  setEmployeeBranch = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const branchId = req.body?.branchId;
      if (!branchId || typeof branchId !== "string") {
        res.status(400).json({ error: "branchId is required" });
        return;
      }
      if (!(await this.repo.branchExists(branchId))) {
        res.status(400).json({ error: "Branch not found" });
        return;
      }
      const updated = await this.repo.setEmployeeBranch(req.params.employeeId, branchId);
      if (!updated) {
        res.status(404).json({ error: "Employee not found" });
        return;
      }
      await appendAuditLog({
        entityType: "employee",
        entityId: req.params.employeeId,
        action: "EMPLOYEE_SET_BRANCH",
        performedBy: (req as { user?: { id: string } }).user?.id ?? "system",
        details: { branchId, regionCode: updated.regionCode },
        ...getClientAuditMeta(req),
      });
      res.json({ success: true, employee: updated });
    } catch (e) {
      next(e);
    }
  };

  /** PATCH /api/settings/regions/branches/:branchId — assign/clear a branch's region. */
  setBranchRegion = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const raw = req.body?.regionCode;
      const regionCode = raw == null || raw === "" ? null : raw;
      if (regionCode !== null && !isValidRegionCode(regionCode)) {
        res.status(400).json({ error: `Invalid region. Use one of: ${ALL_REGION_CODES.join(", ")} (or empty to unassign).` });
        return;
      }
      const updated = await this.repo.setBranchRegion(req.params.branchId, regionCode);
      if (!updated) {
        res.status(404).json({ error: "Branch not found" });
        return;
      }
      await appendAuditLog({
        entityType: "branch",
        entityId: req.params.branchId,
        action: "BRANCH_SET_REGION",
        performedBy: (req as { user?: { id: string } }).user?.id ?? "system",
        details: { regionCode },
        ...getClientAuditMeta(req),
      });
      res.json({ success: true, branch: updated });
    } catch (e) {
      next(e);
    }
  };
}
