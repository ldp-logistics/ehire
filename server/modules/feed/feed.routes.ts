/**
 * feed.routes.ts — Company Feed endpoints.
 * Mount path: /api/feed (configured in server/routes.ts)
 *
 * GET    /api/feed/attachments/:attachmentId/content  attachment image/file bytes (proxied)
 * GET    /api/feed/mentionable        search employees to tag (admin/hr)
 * GET    /api/feed                   list posts (all authenticated users)
 * POST   /api/feed                   create post (admin/hr only)
 * DELETE /api/feed/:id               delete post (admin/hr or own post)
 * POST   /api/feed/:id/reactions     toggle reaction (all authenticated employees)
 */

import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { FeedController } from "./FeedController.js";

const router = Router();
const ctrl   = new FeedController();

router.get("/attachments/:attachmentId/content", requireAuth, ctrl.getAttachmentContent);
router.get("/mentionable",     requireAuth, requireRole(["admin", "hr"]), ctrl.mentionable);
router.get("/",                requireAuth,                              ctrl.list);
router.post("/",               requireAuth, requireRole(["admin", "hr"]), ctrl.create);
router.delete("/:id",          requireAuth,                              ctrl.remove);
router.post("/:id/reactions",  requireAuth,                              ctrl.toggleReaction);

export default router;
