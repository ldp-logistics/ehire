import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { TaskController } from "./TaskController.js";

const router = Router();
const ctrl = new TaskController();

router.get("/",                              requireAuth, ctrl.list);
router.get("/stats",                         requireAuth, ctrl.stats);
router.get("/:id",                           requireAuth, ctrl.getById);
router.post("/",                             requireAuth, ctrl.create);
router.patch("/:id",                         requireAuth, ctrl.update);
router.delete("/:id",                        requireAuth, ctrl.remove);
router.post("/:id/comments",                 requireAuth, ctrl.addComment);
router.delete("/:id/comments/:commentId",    requireAuth, ctrl.removeComment);

export default router;
