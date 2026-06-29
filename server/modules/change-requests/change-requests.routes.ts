import { Router } from "express";
import { requireAuth, requireRole, requireBreakGlassAdmin } from "../../middleware/auth.js";
import { ChangeRequestController } from "./ChangeRequestController.js";

const router = Router();
const ctrl = new ChangeRequestController();
const adminHR = requireRole(["admin", "hr"]);

router.get("/",                                           requireAuth, ctrl.list);
router.get("/pending/count",                              requireAuth, adminHR, ctrl.pendingCount);
router.post("/migrate-avatars-to-sharepoint",             requireAuth, requireBreakGlassAdmin, ctrl.migrateAvatarsToSharePoint);
router.get("/:id/image",                                  requireAuth, ctrl.getImage);
router.patch("/bulk/approve",                             requireAuth, adminHR, ctrl.bulkApprove);
router.patch("/:id/approve",                              requireAuth, adminHR, ctrl.approve);
router.patch("/:id/reject",                               requireAuth, adminHR, ctrl.reject);
router.delete("/:id",                                     requireAuth, adminHR, ctrl.remove);
router.post("/employees/:employeeId/change-requests",     requireAuth, ctrl.submit);
router.post("/employees/:employeeId/change-requests/bulk",requireAuth, ctrl.submitBulk);

export default router;
