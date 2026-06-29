/**
 * resource.routes.ts — endpoint definitions only.
 * Mount path is configured in server/routes.ts.
 *
 * Endpoints:
 *   GET    /api/resources            list
 *   GET    /api/resources/:id        single
 *   POST   /api/resources            create
 *   PUT    /api/resources/:id        update
 *   DELETE /api/resources/:id        delete
 */

import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { ResourceController } from "./ResourceController.js";

const router = Router();
const ctrl = new ResourceController();

router.get("/",    requireAuth,                              ctrl.list);
router.get("/:id", requireAuth,                              ctrl.getById);
router.post(  "/",    requireAuth, requireRole(["admin", "hr"]), ctrl.create);
router.put(   "/:id", requireAuth, requireRole(["admin", "hr"]), ctrl.update);
router.delete("/:id", requireAuth, requireRole(["admin", "hr"]), ctrl.remove);

export default router;
