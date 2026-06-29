import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { TimezoneController } from "./TimezoneController.js";

const router = Router();
const ctrl = new TimezoneController();

router.get("/employees", requireAuth, ctrl.getEmployees);
router.get("/meetings",  requireAuth, ctrl.getMeetings);
router.get("/status",   requireAuth, ctrl.getStatus);
router.post("/meeting",  requireAuth, ctrl.scheduleMeeting);

export default router;
