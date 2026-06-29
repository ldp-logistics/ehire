import { Router } from "express";
import { requireAuth, requireSuperRegionAdmin } from "../../middleware/auth.js";
import { AuditController } from "./AuditController.js";

const router = Router();
const ctrl = new AuditController();

router.get("/logs", requireAuth, requireSuperRegionAdmin, ctrl.list);
router.get("/logs/export", requireAuth, requireSuperRegionAdmin, ctrl.exportCsv);

export default router;
