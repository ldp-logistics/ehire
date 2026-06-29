/**
 * department.routes.ts — API endpoint definitions for the Departments module.
 *
 * Rules:
 *  • Only route definitions here (path + method + middleware + controller handler).
 *  • No business logic, no SQL, no response formatting.
 *  • Auth and role guards are applied per-route.
 *
 * Mounted at: /api/departments  (see server/routes.ts)
 *
 * Endpoints:
 *   GET    /api/departments                  list (paginated, searchable)
 *   GET    /api/departments/:id              single department
 *   POST   /api/departments                  create (admin / hr)
 *   PUT    /api/departments/:id              update (admin / hr)
 *   DELETE /api/departments/:id              delete (admin / hr)
 */

import { Router } from "express";
import { requireAuth, requireRole, requireBreakGlassAdmin } from "../../middleware/auth.js";
import { DepartmentController } from "./DepartmentController.js";

const router = Router();
const ctrl = new DepartmentController();

// ─── Public-to-authenticated endpoints ───────────────────────────────────────

const adminHR = requireRole(["admin", "hr"]);

router.get("/",                  requireAuth, ctrl.list);
router.get("/sub-departments",   requireAuth, ctrl.listSubDepartments);
router.get("/business-units",    requireAuth, ctrl.listBusinessUnits);
router.get("/levels",            requireAuth, ctrl.listLevels);
router.get("/branches",          requireAuth, ctrl.listBranches);
router.get("/my-teams",          requireAuth, ctrl.listMyTeams);
router.get("/teams/managed-by-me", requireAuth, ctrl.listManagedTeams);
router.get("/teams",             requireAuth, ctrl.listTeams);
router.get("/roles",             requireAuth, ctrl.listRoles);
router.get("/shifts",            requireAuth, ctrl.listWorkShifts);
router.get("/job-categories",    requireAuth, ctrl.listJobCategories);
router.get("/:id",               requireAuth, ctrl.getById);

// ─── Admin / HR only: departments ─────────────────────────────────────────────

router.post("/migrate-from-freshteam", requireAuth, requireBreakGlassAdmin, ctrl.migrateFromFreshteam);
router.post(  "/",    requireAuth, adminHR, ctrl.create);
router.put(   "/:id", requireAuth, adminHR, ctrl.update);
router.delete("/:id", requireAuth, adminHR, ctrl.remove);
router.post(  "/:id/restore", requireAuth, adminHR, ctrl.restore);

// ─── Admin / HR only: org structure (sub-departments, business-units, teams, levels, branches, shifts, roles, job-categories) ───

router.post("/sub-departments",           requireAuth, adminHR, ctrl.createSubDepartment);
router.put("/sub-departments/:id",        requireAuth, adminHR, ctrl.updateSubDepartment);
router.delete("/sub-departments/:id",     requireAuth, adminHR, ctrl.removeSubDepartment);
router.post("/sub-departments/:id/restore", requireAuth, adminHR, ctrl.restoreSubDepartment);

router.post("/business-units",            requireAuth, adminHR, ctrl.createBusinessUnit);
router.put("/business-units/:id",         requireAuth, adminHR, ctrl.updateBusinessUnit);
router.delete("/business-units/:id",      requireAuth, adminHR, ctrl.removeBusinessUnit);
router.post("/business-units/:id/restore", requireAuth, adminHR, ctrl.restoreBusinessUnit);

router.post("/teams",            requireAuth, adminHR, ctrl.createTeam);
/** Team lead may update name only; Admin/HR may also assign managerId */
router.put("/teams/:id",         requireAuth, ctrl.updateTeam);
router.delete("/teams/:id",      requireAuth, adminHR, ctrl.removeTeam);
router.post("/teams/:id/restore", requireAuth, adminHR, ctrl.restoreTeam);

router.post("/levels",            requireAuth, adminHR, ctrl.createLevel);
router.put("/levels/:id",         requireAuth, adminHR, ctrl.updateLevel);
router.delete("/levels/:id",      requireAuth, adminHR, ctrl.removeLevel);
router.post("/levels/:id/restore", requireAuth, adminHR, ctrl.restoreLevel);

router.post("/branches",            requireAuth, adminHR, ctrl.createBranch);
router.put("/branches/:id",         requireAuth, adminHR, ctrl.updateBranch);
router.delete("/branches/:id",      requireAuth, adminHR, ctrl.removeBranch);
router.post("/branches/:id/restore", requireAuth, adminHR, ctrl.restoreBranch);

router.post("/shifts",            requireAuth, adminHR, ctrl.createWorkShift);
router.put("/shifts/:id",         requireAuth, adminHR, ctrl.updateWorkShift);
router.delete("/shifts/:id",      requireAuth, adminHR, ctrl.removeWorkShift);
router.post("/shifts/:id/restore", requireAuth, adminHR, ctrl.restoreWorkShift);

router.post("/roles",            requireAuth, adminHR, ctrl.createRole);
router.put("/roles/:id",         requireAuth, adminHR, ctrl.updateRole);
router.delete("/roles/:id",      requireAuth, adminHR, ctrl.removeRole);
router.post("/roles/:id/restore", requireAuth, adminHR, ctrl.restoreRole);

router.post("/job-categories",            requireAuth, adminHR, ctrl.createJobCategory);
router.put("/job-categories/:id",         requireAuth, adminHR, ctrl.updateJobCategory);
router.delete("/job-categories/:id",      requireAuth, adminHR, ctrl.removeJobCategory);
router.post("/job-categories/:id/restore", requireAuth, adminHR, ctrl.restoreJobCategory);

export default router;
