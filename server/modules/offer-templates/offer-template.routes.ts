/**
 * Offer template routes — mounted at /api/offer-templates
 *
 * Admin-only CRUD for DOCX offer letter templates with placeholder discovery.
 */
import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { OfferTemplateController } from "./OfferTemplateController.js";

const router = Router();
const ctrl = new OfferTemplateController();

const adminHR = requireRole(["admin", "hr"]);

router.get("/",                     requireAuth, adminHR, ctrl.list);
router.get("/pdf-field-names",      requireAuth, adminHR, ctrl.getPdfFieldNames);
router.get("/:id",                  requireAuth, adminHR, ctrl.getById);
router.post("/",                    requireAuth, adminHR, ctrl.create);
router.patch("/:id",                requireAuth, adminHR, ctrl.update);
router.delete("/:id",               requireAuth, adminHR, ctrl.remove);
router.post("/:id/preview",         requireAuth, adminHR, ctrl.preview);
router.post("/:id/upload-pdf",      requireAuth, adminHR, ctrl.uploadPdfTemplate);

export default router;
