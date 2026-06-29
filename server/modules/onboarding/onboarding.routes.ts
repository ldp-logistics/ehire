import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { requireSameRegion } from "../../middleware/regionAccess.js";
import { OnboardingController } from "./OnboardingController.js";

const router = Router();
const ctrl = new OnboardingController();
const adminHR = requireRole(["admin", "hr", "onboarding_specialist"]);
const sameRegion = requireSameRegion("onboarding");

// List and get record: allow any authenticated user (assignees see only their records)
router.get(  "/",                                    requireAuth, ctrl.list);
router.get(  "/employee/:employeeId",                requireAuth, adminHR, requireSameRegion("employee", "employeeId"), ctrl.getByEmployee);
// getById / updateTask are assignee-accessible — region is enforced in the
// service for admin/HR only (assignees keep access to their assigned records).
router.get(  "/:id",                                 requireAuth, ctrl.getById);
// Update task (complete/details): allow assignees for their sections
router.patch("/:id/tasks/:taskId",                   requireAuth, ctrl.updateTask);

// Admin/HR only
router.post( "/",                                    requireAuth, adminHR, ctrl.create);
router.post( "/initiate",                            requireAuth, adminHR, ctrl.initiate);
router.patch("/:id",                                 requireAuth, adminHR, sameRegion, ctrl.update);
router.post( "/:id/reopen-checklist",                 requireAuth, adminHR, sameRegion, ctrl.reopenChecklist);
router.delete("/:id",                                requireAuth, adminHR, sameRegion, ctrl.remove);
router.post( "/:id/tasks",                           requireAuth, adminHR, sameRegion, ctrl.addTask);
router.delete("/:id/tasks/:taskId",                  requireAuth, adminHR, sameRegion, ctrl.removeTask);
router.post( "/:id/sections/:sectionId/assignees",   requireAuth, adminHR, sameRegion, ctrl.addAssignee);
router.delete("/:id/sections/:sectionId/assignees/:employeeId", requireAuth, adminHR, sameRegion, ctrl.removeAssignee);

export default router;
