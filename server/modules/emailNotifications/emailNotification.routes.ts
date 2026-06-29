import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { EmailNotificationController } from "./EmailNotificationController.js";

const router = Router();
const ctrl = new EmailNotificationController();
const adminHR = requireRole(["admin", "hr"]);

// All routes require admin or HR
router.use(requireAuth, adminHR);

router.get("/",                            ctrl.listGrouped);
router.get("/logs",                        ctrl.getLogs);
router.get("/:eventKey",                   ctrl.getOne);
router.patch("/:eventKey/enabled",         ctrl.setEnabled);
router.patch("/:eventKey/template",        ctrl.updateTemplate);
router.post("/:eventKey/reset",            ctrl.resetToDefault);

export default router;
