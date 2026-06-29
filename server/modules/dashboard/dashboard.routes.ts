import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { DashboardController } from "./DashboardController.js";

const router = Router();
const ctrl = new DashboardController();

router.get("/",                            requireAuth, ctrl.get);
router.get("/probation-alerts",            requireAuth, ctrl.probationAlerts);
router.post("/run-probation-reminders",    requireAuth, requireRole(["admin"]), ctrl.runProbationReminders);

export default router;
