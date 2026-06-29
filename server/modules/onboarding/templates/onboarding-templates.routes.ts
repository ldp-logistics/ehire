import { Router } from "express";
import { requireAuth, requireRole } from "../../../middleware/auth.js";
import { OnboardingTemplateController } from "./OnboardingTemplateController.js";

const router = Router();
const ctrl   = new OnboardingTemplateController();
// onboarding_specialist can read templates but not create/modify them
const adminHR    = requireRole(["admin", "hr", "onboarding_specialist"]);
const adminHREdit = requireRole(["admin", "hr"]);

// Template CRUD
router.get(  "/",                                          requireAuth, adminHR,    ctrl.list);
router.post( "/",                                          requireAuth, adminHREdit, ctrl.create);
router.get(  "/:id",                                       requireAuth, adminHR,    ctrl.getById);
router.put(  "/:id",                                       requireAuth, adminHREdit, ctrl.update);
router.delete("/:id",                                      requireAuth, adminHREdit, ctrl.remove);

// Section CRUD
router.post(  "/:id/sections",                             requireAuth, adminHREdit, ctrl.addSection);
router.put(   "/:id/sections/:sectionId",                  requireAuth, adminHREdit, ctrl.updateSection);
router.delete("/:id/sections/:sectionId",                  requireAuth, adminHREdit, ctrl.removeSection);

// Task CRUD
router.post(  "/:id/sections/:sectionId/tasks",            requireAuth, adminHREdit, ctrl.addTask);
router.put(   "/:id/sections/:sectionId/tasks/:taskId",    requireAuth, adminHREdit, ctrl.updateTask);
router.delete("/:id/sections/:sectionId/tasks/:taskId",    requireAuth, adminHREdit, ctrl.removeTask);

// Section default assignees
router.post(  "/:id/sections/:sectionId/assignees",               requireAuth, adminHREdit, ctrl.addSectionAssignee);
router.delete("/:id/sections/:sectionId/assignees/:employeeId", requireAuth, adminHREdit, ctrl.removeSectionAssignee);

export default router;
