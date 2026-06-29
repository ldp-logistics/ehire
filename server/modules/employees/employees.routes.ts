import { Router } from "express";
import { requireAuth, requireRole, requireBreakGlassAdmin, canAccessEmployee } from "../../middleware/auth.js";
import { requireSameRegion } from "../../middleware/regionAccess.js";
import { EmployeeController } from "./EmployeeController.js";

const router = Router();
const ctrl = new EmployeeController();
const adminHR = requireRole(["admin", "hr"]);
const adminHRLimited = requireRole(["admin", "hr", "limited_hr"]);
const sameRegion = requireSameRegion("employee");

// Utility / bulk operations (must come before /:id routes)
router.get("/departments",                         requireAuth, ctrl.getDepartments);
router.get("/suggested-id",                        requireAuth, adminHR, ctrl.getSuggestedId);
router.post("/migrate-avatars-from-urls",           requireAuth, requireBreakGlassAdmin, ctrl.migrateAvatarsFromUrls);
router.post("/migrate-avatars-to-sharepoint",       requireAuth, requireBreakGlassAdmin, ctrl.migrateAvatarsToSharePoint);
router.post("/import-freshteam-csv",               requireAuth, requireBreakGlassAdmin, ctrl.importFreshteamCsv);
router.post("/import-freshteam-extras",            requireAuth, requireBreakGlassAdmin, ctrl.importFreshteamExtras);

// Document file serving (before /:id to avoid route conflict)
router.get("/documents/:docId/file",               requireAuth, ctrl.getDocumentFile);
router.delete("/documents/:docId",                 requireAuth, adminHR, ctrl.deleteDocument);

// Dependents & emergency contacts (literal path segments before single-segment /:id)
router.patch("/dependents/:depId",                 requireAuth, adminHR, ctrl.updateDependent);
router.delete("/dependents/:depId",                 requireAuth, adminHR, ctrl.deleteDependent);
router.patch("/emergency-contacts/:contactId",      requireAuth, adminHR, ctrl.updateEmergencyContact);
router.delete("/emergency-contacts/:contactId",     requireAuth, adminHR, ctrl.deleteEmergencyContact);

// CRUD
router.get("/",                                    requireAuth, ctrl.list);
router.post("/",                                   requireAuth, adminHR, ctrl.create);
router.get("/:id",                                 requireAuth, canAccessEmployee, sameRegion, ctrl.getById);
router.patch("/:id",                               requireAuth, adminHRLimited, sameRegion, ctrl.update);
router.delete("/:id",                              requireAuth, requireRole(["admin"]), sameRegion, ctrl.delete);

// Per-employee sub-resources
router.post("/:id/send-welcome-invitation",         requireAuth, adminHR, canAccessEmployee, sameRegion, ctrl.sendWelcomeInvitation);
router.get("/:id/avatar",                          requireAuth, ctrl.getAvatar);
router.get("/:id/timeline",                        requireAuth, canAccessEmployee, sameRegion, ctrl.getTimeline);
router.get("/:id/documents",                       requireAuth, canAccessEmployee, sameRegion, ctrl.listDocuments);
router.post("/:id/documents",                      requireAuth, adminHRLimited, canAccessEmployee, sameRegion, ctrl.uploadDocument);
router.post("/:id/sync-tentative-documents",       requireAuth, adminHR, canAccessEmployee, sameRegion, ctrl.syncTentativeDocuments);

router.get("/:id/dependents",                       requireAuth, canAccessEmployee, sameRegion, ctrl.getDependents);
router.post("/:id/dependents",                      requireAuth, adminHR, canAccessEmployee, sameRegion, ctrl.createDependent);
router.get("/:id/emergency-contacts",               requireAuth, canAccessEmployee, sameRegion, ctrl.getEmergencyContacts);
router.post("/:id/emergency-contacts",              requireAuth, adminHR, canAccessEmployee, sameRegion, ctrl.createEmergencyContact);

export default router;
