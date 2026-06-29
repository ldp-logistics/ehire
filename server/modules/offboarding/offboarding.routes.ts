import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { requireSameRegion } from "../../middleware/regionAccess.js";
import { OffboardingController } from "./OffboardingController.js";

const router = Router();
const ctrl = new OffboardingController();
const adminHR = requireRole(["admin", "hr"]);
const sameRegion = requireSameRegion("offboarding");

router.get("/",                                          requireAuth, ctrl.list);
router.get("/employee/:employeeId/details",               requireAuth, requireSameRegion("employee", "employeeId"), ctrl.getDetailsByEmployee);
// getById enforces region inside the service (assignee-accessible route).
router.get("/:id",                                       requireAuth, ctrl.getById);
router.post("/initiate",                 requireAuth, adminHR, ctrl.initiate);
router.patch("/:id/exit-date",           requireAuth, adminHR, sameRegion, ctrl.updateExitDate);
router.patch("/:id/resignation-date",    requireAuth, adminHR, sameRegion, ctrl.updateResignationDate);
router.post("/:id/cancel",               requireAuth, adminHR, sameRegion, ctrl.cancel);
router.post("/:id/complete",             requireAuth, adminHR, sameRegion, ctrl.complete);
router.delete("/:id",                    requireAuth, adminHR, sameRegion, ctrl.remove);
router.get("/:id/tasks",                 requireAuth, ctrl.getTasks);
router.patch("/tasks/:taskId",           requireAuth, ctrl.updateTask);
router.get("/:id/audit",                 requireAuth, adminHR, sameRegion, ctrl.getAuditLog);

export default router;
