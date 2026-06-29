import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { NotificationController } from "./NotificationController.js";

const router = Router();
const ctrl = new NotificationController();
router.get("/", requireAuth, ctrl.list);
router.get("/stream", requireAuth, ctrl.stream);
export default router;
